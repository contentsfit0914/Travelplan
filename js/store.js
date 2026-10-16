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

export function loadTrip() {
  const t = read(TRIP_KEY);
  if (!t || t.v !== 1) return ensureDays(defaultTrip());
  return ensureDays({ ...defaultTrip(), ...t });
}
export const saveTrip = (t) => write(TRIP_KEY, t);

export function loadSettings() {
  return { apiKey: '', preferDemo: false, ...(read(SETTINGS_KEY) || {}) };
}
export const saveSettings = (s) => write(SETTINGS_KEY, s);

export function validateImported(obj) {
  if (!obj || obj.v !== 1 || !Array.isArray(obj.days) || !obj.startDate) {
    throw new Error('여행 플래너에서 내보낸 파일이 아니에요.');
  }
  return ensureDays({ ...defaultTrip(), ...obj });
}
