// 여행 데이터·설정 저장(브라우저 localStorage). 팀 공유는 JSON 내보내기/불러오기로 한다.

import { addDays, nightHotel, MOVE_STAY } from './planner.js';

const TRIP_KEY = 'travelplan.trip.v1';
const SETTINGS_KEY = 'travelplan.settings.v1';

export function defaultTrip() {
  const start = addDays(new Date().toISOString().slice(0, 10), 30);
  return {
    v: 1,
    title: '도쿄 여행',
    startDate: start,
    nights: 4,
    people: 4,
    baseMode: 'TRANSIT',
    walkLimitKm: 1,
    pace: 'normal',
    // 항공편: 도착(첫날)·출발(마지막 날). 일정 날짜는 여기서 계산한다(syncTrip)
    arrival: { date: start, time: '11:00', airport: 'HND', mode: 'AUTO' },
    departure: { date: addDays(start, 4), time: '18:00', airport: 'HND', mode: 'AUTO' },
    immigrationMin: 0, // 입국 수속·수하물 여유
    airportBufferMin: 120, // 출국 시 공항 도착 여유
    checkIn: '15:00', // 새 숙소의 기본 체크인·체크아웃(숙소마다 바꿀 수 있음)
    checkOut: '11:00',
    restMin: 30, // 첫날 숙소 도착 후 짐 풀고 쉬는 시간
    dayStart: '09:00',
    dayEnd: '21:00',
    breakfastOn: false,
    breakfast: '08:30',
    lunch: '12:00',
    dinner: '18:30',
    mealMinutes: 75,
    mealTolerance: 30, // 식사시간 오차범위(분)
    dayStyles: [], // 날짜별 여행 스타일: sight(관광)·rest(휴식)·shop(쇼핑)·free(자유). 비어 있으면 관광
    hotels: [], // 등록한 숙소(체크인·체크아웃 시간 포함)
    nightHotel: [], // 밤마다 묵는 숙소 id
    hotel: null, // 첫날 묵는 숙소(호환용, syncTrip 이 채움)
    mustSpots: [],
    days: [],
    created: false,
  };
}

export function emptyDay() {
  return { stops: [], returnMode: 'AUTO', skipMeals: [] };
}

export const tripNights = (t) => Math.round((Date.parse(t.departure.date) - Date.parse(t.arrival.date)) / 864e5);

// 항공편 날짜로 일정 길이를 맞추고, 밤마다 묵을 숙소와 '숙소 도착·이동' 고정 자리를 동기화한다
export function syncTrip(trip) {
  const n = tripNights(trip);
  trip.startDate = trip.arrival.date;
  trip.nights = Math.min(9, Math.max(1, Number.isFinite(n) ? n : 1));
  ensureDays(trip);
  syncNights(trip);
  trip.dayStyles = Array.from({ length: trip.days.length }, (_, i) => (DAY_STYLES.includes(trip.dayStyles?.[i]) ? trip.dayStyles[i] : 'sight'));
  trip.hotel = trip.hotels.length ? nightHotel(trip, 0) : null;
  const last = trip.days.length - 1;
  trip.days.forEach((d, i) => {
    // 첫날은 공항→숙소 도착, 숙소가 바뀌는 날은 새 숙소에 짐 맡기기
    let want = null;
    if (i === 0 && trip.hotel) want = 'arrival';
    else if (trip.hotels.length && i > 0 && i < last && nightHotel(trip, i - 1).id !== nightHotel(trip, i).id) want = 'move';
    const idx = d.stops.findIndex((s) => s.fixed);
    const cur = idx >= 0 ? d.stops[idx] : null;
    d.stops = d.stops.filter((s) => !s.fixed || s === cur);
    if (!want) {
      if (cur) d.stops.splice(d.stops.indexOf(cur), 1);
      return;
    }
    const h = nightHotel(trip, i);
    const base = {
      id: `${want}-hotel`,
      name: h.name,
      lat: h.lat,
      lng: h.lng,
      address: h.address || '',
      kind: 'hotel',
      types: ['lodging'],
      fixed: want,
      checkIn: h.checkIn || trip.checkIn,
      stay: want === 'arrival' ? (trip.restMin ?? 30) : cur?.fixed === 'move' ? cur.stay : MOVE_STAY,
    };
    if (cur && cur.fixed === want) Object.assign(cur, base);
    else {
      if (cur) d.stops.splice(d.stops.indexOf(cur), 1);
      d.stops.unshift({ ...base, uid: rid(), mode: 'AUTO', meal: null, must: false });
    }
  });
  return trip;
}

// 밤 수에 맞춰 숙소 배정 길이를 맞추고, 지워진 숙소 자리는 앞(없으면 뒤) 밤의 숙소로 채운다
function syncNights(trip) {
  const ids = new Set(trip.hotels.map((h) => h.id));
  const out = Array.from({ length: trip.nights }, (_, i) => (ids.has(trip.nightHotel?.[i]) ? trip.nightHotel[i] : null));
  if (ids.size) {
    for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = out[i - 1] || out.find(Boolean) || trip.hotels[0].id;
  }
  trip.nightHotel = ids.size ? out : [];
}

export function ensureDays(trip) {
  const n = trip.nights + 1;
  while (trip.days.length < n) trip.days.push(emptyDay());
  if (trip.days.length > n) {
    const extra = trip.days.splice(n).flatMap((d) => d.stops);
    trip.days[n - 1].stops.push(...extra);
  }
  return trip;
}

const read = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* 저장 실패 시 세션 메모리로만 유지 */
  }
};

// --- 입력 정리(sanitize) ------------------------------------------------------
// 공유받은 JSON 파일은 외부 입력이다. 화면에 들어가는 모든 값을 형식·길이·허용 목록으로 다시 만든다.
const KINDS = ['sight', 'food', 'cafe', 'hotel'];
export const DAY_STYLES = ['sight', 'rest', 'shop', 'free'];
const STOP_MODES = ['AUTO', 'WALK', 'TRANSIT', 'DRIVE'];
const MEALS = ['breakfast', 'lunch', 'dinner'];
const AIRPORT_CODES = ['HND', 'NRT'];
const ID_RE = /^[A-Za-z0-9_:-]{1,200}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rid = () => Math.random().toString(36).slice(2, 10);

// https 주소만 링크·이미지로 쓴다(javascript: 등 차단). 사진은 data:image 도 허용.
export function safeUrl(u, { image = false } = {}) {
  if (typeof u !== 'string' || u.length > 2048) return null;
  if (/^https:\/\//i.test(u)) return u;
  if (image && /^data:image\/(png|jpeg|gif|webp|svg\+xml)[;,]/i.test(u)) return u;
  return null;
}

function cleanHours(h) {
  if (!h || !Array.isArray(h.periods)) return null;
  const pt = (p) =>
    p && typeof p === 'object'
      ? { day: clamp(Math.trunc(num(p.day)), 0, 6), hour: clamp(Math.trunc(num(p.hour)), 0, 47), minute: clamp(Math.trunc(num(p.minute)), 0, 59) }
      : null;
  return {
    periods: h.periods
      .slice(0, 40)
      .filter((p) => p && p.open)
      .map((p) => ({ open: pt(p.open), close: pt(p.close) })),
    weekdayText: Array.isArray(h.weekdayText) ? h.weekdayText.slice(0, 7).map((x) => str(x, 120)) : [],
  };
}

export function cleanPlace(p, { stop = false } = {}) {
  if (!p || typeof p !== 'object') return null;
  const lat = num(p.lat, NaN);
  const lng = num(p.lng, NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const out = {
    id: ID_RE.test(p.id) ? p.id : `imp:${rid()}`,
    name: str(p.name, 120) || '(이름 없음)',
    lat,
    lng,
    types: Array.isArray(p.types) ? p.types.filter((t) => typeof t === 'string' && /^[a-z0-9_]{1,40}$/.test(t)).slice(0, 20) : [],
    kind: KINDS.includes(p.kind) ? p.kind : 'sight',
    typeLabel: str(p.typeLabel, 60) || null,
    address: str(p.address, 200),
    rating: p.rating == null ? null : clamp(num(p.rating), 0, 5),
    ratingCount: p.ratingCount == null ? null : Math.max(0, Math.trunc(num(p.ratingCount))),
    priceLevel: typeof p.priceLevel === 'string' && /^[A-Z_]{1,24}$/.test(p.priceLevel) ? p.priceLevel : null,
    mapsUrl: safeUrl(p.mapsUrl),
    photo: safeUrl(p.photo, { image: true }),
    photoAttr: str(p.photoAttr, 80),
    hours: cleanHours(p.hours),
    note: str(p.note, 300),
    demo: !!p.demo,
  };
  if (stop) {
    Object.assign(out, {
      uid: rid(),
      stay: clamp(Math.round(num(p.stay, 60)), 15, 720),
      mode: STOP_MODES.includes(p.mode) ? p.mode : 'AUTO',
      meal: MEALS.includes(p.meal) ? p.meal : null,
      must: !!p.must,
      quick: typeof p.quick === 'string' ? str(p.quick, 40) : undefined,
      fixed: ['arrival', 'move'].includes(p.fixed) ? p.fixed : null,
    });
  }
  return out;
}

export function sanitizeTrip(raw) {
  const d = defaultTrip();
  const t = raw && typeof raw === 'object' ? raw : {};
  const time = (k) => (TIME_RE.test(t[k]) ? t[k] : d[k]);
  const pick = (k, list) => (list.includes(num(t[k], NaN)) ? num(t[k]) : d[k]);
  const startDate = DATE_RE.test(t.startDate) && !Number.isNaN(Date.parse(t.startDate)) ? t.startDate : d.startDate;
  // 이전 버전(출발일+박 수) 데이터는 같은 날짜의 항공편 기본값으로 옮긴다
  const legacyNights = clamp(Math.trunc(num(t.nights, d.nights)), 1, 9);
  const flight = (f, dflt) => ({
    date: DATE_RE.test(f?.date) && !Number.isNaN(Date.parse(f.date)) ? f.date : dflt.date,
    time: TIME_RE.test(f?.time) ? f.time : dflt.time,
    airport: AIRPORT_CODES.includes(f?.airport) ? f.airport : dflt.airport,
    mode: STOP_MODES.includes(f?.mode) ? f.mode : 'AUTO',
  });
  const arrival = flight(t.arrival, { ...d.arrival, date: startDate });
  const departure = flight(t.departure, { ...d.departure, date: addDays(arrival.date, legacyNights) });
  const stops = (list) => (Array.isArray(list) ? list.slice(0, 60).map((x) => cleanPlace(x, { stop: true })).filter(Boolean) : []);
  // 숙소 목록. 이전 버전(숙소 하나 + 공통 체크인·아웃)은 목록 하나로 옮긴다
  const hotelOf = (h) => {
    const c = cleanPlace(h);
    if (!c) return null;
    return {
      ...c,
      kind: 'hotel',
      checkIn: TIME_RE.test(h.checkIn) ? h.checkIn : time('checkIn'),
      checkOut: TIME_RE.test(h.checkOut) ? h.checkOut : time('checkOut'),
      timesChecked: !!h.timesChecked, // 사용자가 체크인·체크아웃 시간을 확인했는지
      website: safeUrl(h.website),
      phone: str(h.phone, 40),
    };
  };
  let hotels = Array.isArray(t.hotels) ? t.hotels.slice(0, 9).map(hotelOf).filter(Boolean) : [];
  if (!hotels.length && t.hotel) hotels = [hotelOf(t.hotel)].filter(Boolean);
  hotels = hotels.filter((h, i) => hotels.findIndex((x) => x.id === h.id) === i);
  const trip = {
    ...d,
    title: str(t.title, 60) || d.title,
    startDate: arrival.date,
    nights: legacyNights,
    arrival,
    departure,
    immigrationMin: pick('immigrationMin', [0, 30, 60, 90]),
    airportBufferMin: pick('airportBufferMin', [90, 120, 150, 180]),
    checkIn: time('checkIn'),
    checkOut: time('checkOut'),
    restMin: pick('restMin', [0, 15, 30, 60]),
    breakfastOn: typeof t.breakfastOn === 'boolean' ? t.breakfastOn : d.breakfastOn,
    breakfast: time('breakfast'),
    mealTolerance: pick('mealTolerance', [10, 30, 60, 120]),
    dayStyles: Array.isArray(t.dayStyles) ? t.dayStyles.slice(0, 10).map((x) => (DAY_STYLES.includes(x) ? x : 'sight')) : [],
    people: clamp(Math.trunc(num(t.people, d.people)), 1, 20),
    baseMode: ['TRANSIT', 'DRIVE'].includes(t.baseMode) ? t.baseMode : d.baseMode,
    walkLimitKm: [0.5, 1, 1.5].includes(num(t.walkLimitKm)) ? num(t.walkLimitKm) : d.walkLimitKm,
    pace: ['relaxed', 'normal', 'packed'].includes(t.pace) ? t.pace : d.pace,
    dayStart: time('dayStart'),
    dayEnd: time('dayEnd'),
    lunch: time('lunch'),
    dinner: time('dinner'),
    mealMinutes: clamp(Math.round(num(t.mealMinutes, d.mealMinutes)), 30, 180),
    hotels,
    nightHotel: Array.isArray(t.nightHotel) ? t.nightHotel.slice(0, 10).map((x) => (typeof x === 'string' && ID_RE.test(x) ? x : null)) : [],
    hotel: null,
    mustSpots: stops(t.mustSpots),
    days: Array.isArray(t.days)
      ? t.days.slice(0, 10).map((day) => ({
          stops: stops(day?.stops),
          returnMode: STOP_MODES.includes(day?.returnMode) ? day.returnMode : 'AUTO',
          skipMeals: Array.isArray(day?.skipMeals) ? day.skipMeals.filter((m) => MEALS.includes(m)) : [],
        }))
      : [],
    created: !!t.created,
  };
  return syncTrip(trip);
}

export function loadTrip() {
  const t = read(TRIP_KEY);
  if (!t || t.v !== 1) return syncTrip(defaultTrip());
  return sanitizeTrip(t);
}
export const saveTrip = (t) => write(TRIP_KEY, t);

// --- API 키 ----------------------------------------------------------------
// '이 기기에 기억'을 끄면 sessionStorage 에만 두어 탭을 닫으면 지워진다.
const SESSION_KEY = 'travelplan.apikey.session';

export const isLikelyApiKey = (k) => /^AIza[0-9A-Za-z_-]{35}$/.test(k);
export const maskKey = (k) => (k ? `${k.slice(0, 4)}••••${k.slice(-4)}` : '');

export function loadSettings() {
  const s = { apiKey: '', preferDemo: false, rememberKey: true, ...(read(SETTINGS_KEY) || {}) };
  if (!s.apiKey) {
    try {
      const k = sessionStorage.getItem(SESSION_KEY);
      if (k) Object.assign(s, { apiKey: k, rememberKey: false });
    } catch {
      /* 세션 저장소를 못 쓰면 무시 */
    }
  }
  return s;
}

export function saveSettings(s) {
  const { apiKey, ...rest } = s;
  try {
    if (!s.rememberKey && apiKey) sessionStorage.setItem(SESSION_KEY, apiKey);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
  write(SETTINGS_KEY, s.rememberKey ? s : rest);
}

export function validateImported(obj) {
  if (!obj || obj.v !== 1 || !Array.isArray(obj.days) || !obj.startDate) {
    throw new Error('여행 플래너에서 내보낸 파일이 아니에요.');
  }
  return sanitizeTrip(obj);
}
