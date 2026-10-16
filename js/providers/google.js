// Google Maps Platform 연동: Maps JavaScript API + Places API(New) + Routes API.
// 키는 config.js 또는 앱 설정에서 받는다. 브라우저에서 직접 호출하므로 키에 HTTP 리퍼러 제한을 꼭 건다.

import { kindFromTypes } from '../planner.js';

const TOKYO = { lat: 35.6812, lng: 139.7671 };

const FIELDS = [
  'id',
  'displayName',
  'location',
  'types',
  'primaryType',
  'primaryTypeDisplayName',
  'formattedAddress',
  'rating',
  'userRatingCount',
  'priceLevel',
  'googleMapsURI',
  'photos',
  'regularOpeningHours',
  'businessStatus',
];

// 요청 유형이 거부되면(INVALID_ARGUMENT) 다음 목록으로 재시도한다.
const NEARBY_TYPES = {
  sight: [
    ['tourist_attraction', 'museum', 'art_gallery', 'park', 'amusement_park', 'aquarium', 'zoo', 'observation_deck', 'historical_place', 'cultural_landmark'],
    ['tourist_attraction', 'museum', 'art_gallery', 'park'],
  ],
  food: [['restaurant']],
  cafe: [['cafe', 'coffee_shop', 'dessert_shop'], ['cafe']],
};

let loading = null;

export function loadGoogleMaps(key) {
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const cb = `__gmReady${Date.now()}`;
    window[cb] = () => resolve();
    window.gm_authFailure = () => window.dispatchEvent(new CustomEvent('gm-auth-failure'));
    const s = document.createElement('script');
    const q = new URLSearchParams({
      key,
      v: 'weekly',
      loading: 'async',
      language: 'ko',
      region: 'JP',
      callback: cb,
    });
    s.src = `https://maps.googleapis.com/maps/api/js?${q}`;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error('Google 지도 스크립트를 불러오지 못했어요. 네트워크나 키를 확인해 주세요.'));
    };
    document.head.append(s);
  });
  return loading;
}

function plainHours(h) {
  if (!h) return null;
  const pt = (p) => p && { day: p.day, hour: p.hour, minute: p.minute };
  return {
    periods: (h.periods || []).map((p) => ({ open: pt(p.open), close: pt(p.close) })),
    weekdayText: h.weekdayDescriptions || [],
  };
}

export function normalizePlace(p) {
  const types = p.types || [];
  let photo = null;
  let photoAttr = '';
  try {
    photo = p.photos?.[0]?.getURI({ maxWidth: 400, maxHeight: 300 }) || null;
    photoAttr = p.photos?.[0]?.authorAttributions?.[0]?.displayName || '';
  } catch {
    photo = null;
  }
  return {
    id: p.id,
    name: p.displayName || '(이름 없음)',
    lat: p.location.lat(),
    lng: p.location.lng(),
    types,
    kind: kindFromTypes(types),
    typeLabel: p.primaryTypeDisplayName || null,
    address: p.formattedAddress || '',
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? null,
    priceLevel: p.priceLevel || null,
    mapsUrl: p.googleMapsURI || null,
    photo,
    photoAttr,
    hours: plainHours(p.regularOpeningHours),
    note: '',
  };
}

const alive = (p) => p.location && p.businessStatus !== 'CLOSED_PERMANENTLY' && p.businessStatus !== 'CLOSED_TEMPORARILY';

export async function createGoogleProvider(key) {
  await loadGoogleMaps(key);
  const { Place } = await google.maps.importLibrary('places');
  const { Route } = await google.maps.importLibrary('routes');

  async function searchText(query, { near, radius = 20000, kind } = {}) {
    const req = {
      textQuery: query,
      fields: FIELDS,
      language: 'ko',
      region: 'jp',
      maxResultCount: 12,
      locationBias: { center: near || TOKYO, radius },
    };
    if (kind === 'hotel') req.includedType = 'lodging';
    const { places } = await Place.searchByText(req);
    return (places || []).filter(alive).map(normalizePlace);
  }

  async function nearby(kind, center, radius, keyword) {
    if (keyword) {
      const req = {
        textQuery: keyword,
        fields: FIELDS,
        language: 'ko',
        region: 'jp',
        maxResultCount: 20,
        locationBias: { center, radius },
      };
      if (kind === 'food') req.includedType = 'restaurant';
      if (kind === 'cafe') req.includedType = 'cafe';
      const { places } = await Place.searchByText(req);
      return (places || []).filter(alive).map(normalizePlace);
    }
    let lastErr;
    for (const includedTypes of NEARBY_TYPES[kind]) {
      try {
        const { places } = await Place.searchNearby({
          fields: FIELDS,
          locationRestriction: { center, radius },
          includedTypes,
          maxResultCount: 20,
          rankPreference: 'POPULARITY',
          language: 'ko',
          region: 'jp',
        });
        return (places || []).filter(alive).map(normalizePlace);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }

  const TM = { WALK: 'WALKING', TRANSIT: 'TRANSIT', DRIVE: 'DRIVING' };

  async function route(a, b, mode, departure) {
    const req = {
      origin: { lat: a.lat, lng: a.lng },
      destination: { lat: b.lat, lng: b.lng },
      travelMode: TM[mode],
      fields: ['durationMillis', 'distanceMeters', 'path', 'legs'],
      language: 'ko',
      region: 'jp',
    };
    if (mode === 'TRANSIT' && departure) req.departureTime = departure;
    const { routes } = await Route.computeRoutes(req);
    const r = routes?.[0];
    if (!r || r.durationMillis == null) throw new Error('NO_ROUTE');
    const raw = (r.path || []).map((p) => ({ lat: p.lat, lng: p.lng }));
    const step = Math.max(1, Math.ceil(raw.length / 120));
    const path = raw.filter((_, i) => i % step === 0 || i === raw.length - 1);
    const lines = [];
    for (const s of r.legs?.[0]?.steps || []) {
      const td = s.transitDetails;
      if (!td) continue;
      const line = td.transitLine;
      lines.push({
        name: line?.shortName || line?.name || '대중교통',
        color: line?.color || null,
        from: td.departureStop?.name || '',
        to: td.arrivalStop?.name || '',
        stops: td.stopCount || 0,
      });
    }
    return {
      min: Math.max(1, Math.round(r.durationMillis / 60000)),
      km: (r.distanceMeters || 0) / 1000,
      path,
      lines,
      estimated: false,
    };
  }

  return { name: 'google', searchText, nearby, route };
}
