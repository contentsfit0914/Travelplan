// 여행 데이터·설정 저장(브라우저 localStorage). 팀 공유는 JSON 내보내기/불러오기로 한다.

import { addDays } from './planner.js';

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
    arriveTime: '14:00',
    departTime: '12:00',
    dayStart: '09:30',
    dayEnd: '21:00',
    lunch: '12:00',
    dinner: '18:30',
    mealMinutes: 75,
    hotel: null,
    mustSpots: [],
    days: [],
    created: false,
  };
}

export function emptyDay() {
  return { stops: [], returnMode: 'AUTO', skipMeals: [] };
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
const STOP_MODES = ['AUTO', 'WALK', 'TRANSIT', 'DRIVE'];
const MEALS = ['lunch', 'dinner'];
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
    });
  }
  return out;
}

export function sanitizeTrip(raw) {
  const d = defaultTrip();
  const t = raw && typeof raw === 'object' ? raw : {};
  const time = (k) => (TIME_RE.test(t[k]) ? t[k] : d[k]);
  const stops = (list) => (Array.isArray(list) ? list.slice(0, 60).map((x) => cleanPlace(x, { stop: true })).filter(Boolean) : []);
  const hotel = cleanPlace(t.hotel);
  const trip = {
    ...d,
    title: str(t.title, 60) || d.title,
    startDate: DATE_RE.test(t.startDate) && !Number.isNaN(Date.parse(t.startDate)) ? t.startDate : d.startDate,
    nights: clamp(Math.trunc(num(t.nights, d.nights)), 1, 7),
    people: clamp(Math.trunc(num(t.people, d.people)), 1, 20),
    baseMode: ['TRANSIT', 'DRIVE'].includes(t.baseMode) ? t.baseMode : d.baseMode,
    walkLimitKm: [0.5, 1, 1.5].includes(num(t.walkLimitKm)) ? num(t.walkLimitKm) : d.walkLimitKm,
    pace: ['relaxed', 'normal', 'packed'].includes(t.pace) ? t.pace : d.pace,
    arriveTime: time('arriveTime'),
    departTime: time('departTime'),
    dayStart: time('dayStart'),
    dayEnd: time('dayEnd'),
    lunch: time('lunch'),
    dinner: time('dinner'),
    mealMinutes: clamp(Math.round(num(t.mealMinutes, d.mealMinutes)), 30, 180),
    hotel: hotel ? { ...hotel, kind: 'hotel' } : null,
    mustSpots: stops(t.mustSpots),
    days: Array.isArray(t.days)
      ? t.days.slice(0, 8).map((day) => ({
          stops: stops(day?.stops),
          returnMode: STOP_MODES.includes(day?.returnMode) ? day.returnMode : 'AUTO',
          skipMeals: Array.isArray(day?.skipMeals) ? day.skipMeals.filter((m) => MEALS.includes(m)) : [],
        }))
      : [],
    created: !!t.created,
  };
  return ensureDays(trip);
}

export function loadTrip() {
  const t = read(TRIP_KEY);
  if (!t || t.v !== 1) return ensureDays(defaultTrip());
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
