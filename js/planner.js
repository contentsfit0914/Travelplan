// 일정 계산 엔진: 시간표 산출, 식사 공백 감지, 영업시간 점검, 자동 배분, 동선 최적화.
// UI·지도와 분리된 순수 함수만 둔다(테스트: tests/planner.test.mjs).

import { distKm, estimateMinutes, resolveMode, centroid } from './geo.js';

export const toMin = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
};

export const fmtTime = (min) => {
  const m = Math.round(min);
  const day = Math.floor(m / 1440);
  const r = ((m % 1440) + 1440) % 1440;
  const s = `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`;
  return day > 0 ? `+${day}일 ${s}` : s;
};

export const fmtDur = (min) => {
  const m = Math.round(min);
  if (m < 60) return `${m}분`;
  return m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m / 60}시간`;
};

export const PACE = {
  relaxed: { label: '여유롭게', factor: 1.25 },
  normal: { label: '보통', factor: 1 },
  packed: { label: '알차게', factor: 0.8 },
};

const has = (types, ...keys) => (types || []).some((t) => keys.includes(t));

export function kindFromTypes(types = []) {
  if (has(types, 'lodging', 'hotel', 'hostel', 'resort_hotel', 'ryokan', 'japanese_inn')) return 'hotel';
  if (has(types, 'cafe', 'coffee_shop', 'tea_house', 'bakery', 'dessert_shop', 'cafeteria')) return 'cafe';
  if (
    has(types, 'restaurant', 'food', 'meal_takeaway', 'bar', 'izakaya_restaurant', 'food_court') ||
    types.some((t) => t.endsWith('_restaurant'))
  )
    return 'food';
  return 'sight';
}

// 장소 종류 정보가 부족할 때 Google의 유형 이름(예: '라멘 음식점')으로 보완한다
export function classifyPlace(types = [], label = '', fallback = null) {
  let kind = kindFromTypes(types);
  if (kind === 'sight' && label) {
    if (/카페|커피|디저트|베이커리|찻집|제과/.test(label)) kind = 'cafe';
    else if (/음식|식당|레스토랑|라멘|라면|스시|초밥|이자카야|술집|주점|요리|덮밥|규동|야키|돈카츠|우동|소바|바$|펍/.test(label)) kind = 'food';
  }
  if (kind === 'sight' && fallback && fallback !== 'hotel') return fallback;
  return kind;
}

// 장소 유형별 기본 체류시간(분). 4인 기준, 입장 대기·이동 동선 포함한 제안값이다.
export function defaultStay(place) {
  const t = place.types || [];
  if (place.kind === 'food') return 75;
  if (place.kind === 'cafe') return 45;
  if (has(t, 'amusement_park', 'theme_park', 'water_park')) return 240;
  if (has(t, 'museum', 'art_gallery', 'aquarium', 'zoo')) return 120;
  if (has(t, 'shopping_mall', 'department_store', 'market')) return 90;
  if (has(t, 'observation_deck')) return 75;
  if (has(t, 'park', 'garden', 'national_park')) return 75;
  if (has(t, 'place_of_worship', 'shinto_shrine', 'buddhist_temple', 'church', 'hindu_temple'))
    return 50;
  return 60;
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const dayDate = (trip, di) => addDays(trip.startDate, di);
export const weekday = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay();
const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const dayLabel = (trip, di) => {
  const d = dayDate(trip, di);
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}(${WD[weekday(d)]})`;
};

// --- 공항·항공편 -------------------------------------------------------------
// 좌표는 공항 중심 근사치. 터미널별 차이는 이동시간 추정 오차 범위 안이다.
export const AIRPORTS = {
  HND: { code: 'HND', name: '하네다 공항', lat: 35.5494, lng: 139.7798 },
  NRT: { code: 'NRT', name: '나리타 공항', lat: 35.772, lng: 140.3929 },
};
export function airportPoint(code) {
  const a = AIRPORTS[code] || AIRPORTS.HND;
  return { id: `airport:${a.code}`, name: a.name, lat: a.lat, lng: a.lng, kind: 'airport', types: ['airport'] };
}
// 첫날 공항을 나서는 시각(도착 + 입국 수속 여유)
export const arrivalReady = (trip) => toMin(trip.arrival.time) + (trip.immigrationMin || 0);

// --- 숙소(날짜별) -------------------------------------------------------------
// trip.hotels: 등록한 숙소 목록, trip.nightHotel[i]: i번째 밤(i일차 → i+1일차)에 묵는 숙소 id
export const MOVE_STAY = 20; // 숙소를 옮기는 날 새 숙소에 짐 맡기는 시간(분)
export function nightHotel(trip, ni) {
  const hs = trip.hotels || [];
  if (!hs.length) return trip.hotel || null;
  const i = Math.max(0, Math.min(ni, (trip.days?.length || 2) - 2));
  return hs.find((h) => h.id === trip.nightHotel?.[i]) || hs[0];
}
// 그날 돌아가는 숙소. 마지막 날은 전날 묵은 숙소(짐 찾기)
export const dayHotel = (trip, di) => nightHotel(trip, di < trip.days.length - 1 ? di : di - 1);
// 숙소를 옮기는 날: 아침엔 전날 숙소에서 나와 새 숙소에 짐을 맡긴다
export const isMoveDay = (trip, di) =>
  di > 0 && di < trip.days.length - 1 && !!dayHotel(trip, di) && nightHotel(trip, di - 1)?.id !== dayHotel(trip, di).id;
// 하루의 출발점: 첫날은 공항, 그 외는 전날 묵은 숙소
export const dayOrigin = (trip, di) => (di === 0 && trip.arrival ? airportPoint(trip.arrival.airport) : nightHotel(trip, di - 1));
// 하루 일정 중 '숙소 체크인' 고정 자리(첫날 도착·숙소 이동)
export const checkInStop = (day) => day.stops.find((s) => s.fixed === 'arrival' || s.fixed === 'move') || null;

// 마지막 날: 이륙 - 공항 도착 여유 - 숙소→공항 이동 = 숙소에서 늦어도 출발해야 하는 시각
export function departurePlan(trip, seg) {
  const di = trip.days.length - 1;
  const hotel = dayHotel(trip, di);
  if (!trip.departure || !hotel) return null;
  const airport = airportPoint(trip.departure.airport);
  const flight = toMin(trip.departure.time);
  const atAirport = flight - (trip.airportBufferMin ?? 120);
  const leg = seg(hotel, airport, trip.departure.mode || 'AUTO', { di, t: atAirport - 90 });
  return { airport, hotel, flight, atAirport, leg, leaveBy: atAirport - leg.min };
}

// 하루 가용 시간: 첫날은 공항을 나선 뒤부터, 마지막 날은 공항으로 떠나야 하는 시각까지
export function dayWindow(trip, di, seg = estimateSeg(trip)) {
  const last = trip.days.length - 1;
  let start = toMin(trip.dayStart);
  let end = toMin(trip.dayEnd);
  if (di === 0 && trip.arrival) start = arrivalReady(trip);
  const dep = di === last ? departurePlan(trip, seg) : null;
  if (dep) end = Math.min(end, dep.leaveBy);
  return { start, end: Math.max(end, start), rawEnd: end, isArrival: di === 0, isDeparture: di === last, dep };
}

export const MEAL_TYPES = [
  ['breakfast', '아침'],
  ['lunch', '점심'],
  ['dinner', '저녁'],
];
export const MEAL_LABEL = { breakfast: '아침', lunch: '점심', dinner: '저녁' };
export const mealEnabled = (trip, type) => type !== 'breakfast' || !!trip.breakfastOn;

// 맛집 탐색 범위: 식사 자리에서 이동에 쓸 수 있는 시간(분) → 검색 반경(m)
export function budgetRadius(min) {
  if (min <= 15) return Math.max(500, Math.round(min * 75)); // 도보 4.5km/h
  return Math.min(8000, Math.round(((min - 10) * 28 * 1000) / 60)); // 대중교통 평균 28km/h
}
export const budgetLabel = (min) => (min <= 15 ? `도보 ${min}분 이내` : `${min}분 이내로 갈 수 있는`);

// --- 영업시간 -------------------------------------------------------------
const WEEK = 7 * 1440;
function openIntervals(periods) {
  return periods.map((p) => {
    const o = p.open.day * 1440 + p.open.hour * 60 + (p.open.minute || 0);
    if (!p.close) return [o, o + WEEK];
    let c = p.close.day * 1440 + p.close.hour * 60 + (p.close.minute || 0);
    if (c <= o) c += WEEK;
    return [o, c];
  });
}
function isOpenAt(intervals, x) {
  return intervals.some(([o, c]) => [x, x + WEEK, x - WEEK].some((v) => v >= o && v < c));
}

export function hoursWarning(stop, dateStr, arrive, depart) {
  const periods = stop.hours?.periods;
  if (!periods?.length) return null;
  const base = weekday(dateStr) * 1440;
  const iv = openIntervals(periods);
  if (!isOpenAt(iv, base + arrive)) return '도착 시각에 영업 중이 아닐 수 있어요';
  if (depart - arrive > 10 && !isOpenAt(iv, base + depart - 5)) return '머무는 중에 영업이 끝나요';
  return null;
}

// --- 하루 시간표 ----------------------------------------------------------
// seg(a, b, modePref, ctx) → { min, km, mode, estimated }
export function computeDay(trip, di, seg) {
  const day = trip.days[di];
  const hotel = dayHotel(trip, di);
  const win = dayWindow(trip, di, seg);
  const date = dayDate(trip, di);
  const origin = dayOrigin(trip, di);
  const tol = trip.mealTolerance ?? 30;
  let t = win.start;
  let prev = origin;
  let num = 0;
  const rows = [];
  const totals = { travel: 0, sight: 0, meal: 0 };

  day.stops.forEach((stop, index) => {
    const leg = prev ? seg(prev, stop, stop.mode, { di, t }) : null;
    let arrive = t + (leg ? leg.min : 0);
    // 식사 장소에 오차범위보다 일찍 도착하면 목표 시각까지 기다린다(그 시간은 '비어 있음'으로 표시)
    let wait = 0;
    if (stop.meal && trip[stop.meal]) {
      const T = toMin(trip[stop.meal]);
      if (arrive < T - tol) {
        wait = T - arrive;
        arrive = T;
      }
    }
    const depart = arrive + stop.stay;
    totals.travel += leg ? leg.min : 0;
    if (stop.kind === 'food' || stop.kind === 'cafe') totals.meal += stop.stay;
    else if (stop.kind !== 'hotel') totals.sight += stop.stay;
    let warn = hoursWarning(stop, date, arrive, depart);
    let info = null;
    if (stop.fixed) {
      const ci = stop.checkIn || hotel?.checkIn || trip.checkIn;
      const early = arrive < toMin(ci);
      if (stop.fixed === 'arrival') info = early ? `체크인(${ci}) 전이라 짐만 맡기고 쉬어요` : '체크인하고 짐 풀기';
      else info = early ? `체크인(${ci}) 전이라 짐만 맡겨 두고 다녀요` : '체크인하고 짐 두기';
    }
    if (stop.meal && !warn && trip[stop.meal]) {
      const d = arrive - toMin(trip[stop.meal]);
      if (Math.abs(d) > tol)
        warn = `${MEAL_LABEL[stop.meal]} 목표 ${trip[stop.meal]}보다 ${fmtDur(Math.abs(d))} ${d > 0 ? '늦어요' : '빨라요'} (오차범위 ${fmtDur(tol)})`;
    }
    rows.push({ stop, index, num: stop.fixed ? null : ++num, leg, arrive, depart, warn, info, wait });
    t = depart;
    prev = stop;
  });

  const back = hotel && rows.length && prev.kind !== 'hotel' ? seg(prev, hotel, day.returnMode, { di, t }) : null;
  const end = t + (back ? back.min : 0);
  totals.travel += back ? back.min : 0;

  // 식사 자리: 목표 시각과 가장 가까운 '빈 틈'(이전 장소를 떠나는 시각)을 고른다
  const gaps = [];
  for (const [type, label] of MEAL_TYPES) {
    if (!mealEnabled(trip, type) || day.skipMeals?.includes(type)) continue;
    const T = toMin(trip[type]);
    if (T + tol < win.start || T - tol > win.rawEnd) continue;
    const covered = rows.some(
      (r) => r.stop.meal === type || (r.stop.kind === 'food' && !r.stop.meal && Math.abs(r.arrive - T) <= tol + 30),
    );
    if (covered) continue;
    let best = null;
    for (let i = 0; i <= rows.length; i++) {
      const free = i === 0 ? win.start : rows[i - 1].depart;
      // 그날 마지막 자리(뒤에 일정 없음)는 목표 시각까지 기다렸다 먹는다. 중간 자리는 바로 먹는다(뒤 일정이 밀리므로)
      const at = i === rows.length ? Math.max(free, T) : free;
      const dev = at - T;
      if (!best || Math.abs(dev) < Math.abs(best.dev)) best = { index: i, at, dev };
    }
    const anchor = best.index === 0 ? origin : rows[best.index - 1].stop;
    // 오차범위 끝(목표+오차)까지 남은 시간만큼 멀리 있는 식당까지 후보로 본다. 이미 늦었으면 가장 가까운 곳(10분)
    const budget = Math.min(60, Math.max(10, T + tol - best.at));
    gaps.push({ type, label, time: T, tol, ok: Math.abs(best.dev) <= tol, budget, anchor, ...best });
  }

  const dep = win.dep;
  const overflow = !rows.length ? 0 : Math.max(0, end - win.rawEnd);
  return {
    win,
    date,
    origin,
    rows,
    back,
    end,
    dep,
    overflow,
    free: Math.max(0, win.rawEnd - Math.max(end, win.start)),
    totals,
    gaps,
  };
}

// --- 추정 기반 비용 함수 ----------------------------------------------------
export function estimator(trip) {
  return (a, b) =>
    estimateMinutes(a, b, resolveMode(a, b, 'AUTO', trip.walkLimitKm, trip.baseMode));
}

export function estimateSeg(trip) {
  return (a, b, pref) => {
    const mode = resolveMode(a, b, pref, trip.walkLimitKm, trip.baseMode);
    return { min: estimateMinutes(a, b, mode), km: distKm(a, b), mode, estimated: true };
  };
}

// 후보를 어느 위치에 넣어야 추가 이동이 가장 적은지
export function bestInsert(stops, hotel, cand, est) {
  const pts = [hotel, ...stops, hotel].filter(Boolean);
  if (pts.length < 2) return { index: stops.length, extra: hotel ? est(hotel, cand) * 2 : 0 };
  const offset = hotel ? 1 : 0;
  let best = { index: stops.length, extra: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const extra = est(pts[i], cand) + est(cand, pts[i + 1]) - est(pts[i], pts[i + 1]);
    const index = Math.min(stops.length, Math.max(0, i + 1 - offset));
    if (extra < best.extra) best = { index, extra };
  }
  if (!hotel && stops.length) {
    const tail = est(stops[stops.length - 1], cand);
    if (tail < best.extra) best = { index: stops.length, extra: tail };
  }
  return { index: best.index, extra: Math.max(0, Math.round(best.extra)) };
}

// 카페처럼 '언제 가면 좋은지'가 있는 장소: 추가 이동시간 + 목표 시각과의 차이를 함께 최소화
export function timedInsert(trip, di, cand, target, minIndex = 0) {
  const day = trip.days[di];
  const segFn = estimateSeg(trip);
  const base = computeDay(trip, di, segFn).totals.travel;
  let best = { index: day.stops.length, score: Infinity, extra: 0 };
  for (let i = minIndex; i <= day.stops.length; i++) {
    const trial = [...day.stops.slice(0, i), cand, ...day.stops.slice(i)];
    const sim = computeDay({ ...trip, days: trip.days.map((d, k) => (k === di ? { ...d, stops: trial } : d)) }, di, segFn);
    const row = sim.rows[i];
    const extra = sim.totals.travel - base;
    const score = extra + Math.abs(row.arrive - target) / 5;
    if (score < best.score) best = { index: i, score, extra: Math.max(0, Math.round(extra)) };
  }
  return { index: best.index, extra: best.extra };
}

// '숙소 도착·이동' 이전에는 식사 말고는 넣지 않는다(짐을 들고 다니지 않도록)
export const minInsertIndex = (day) => day.stops.findIndex((s) => s.fixed === 'arrival' || s.fixed === 'move') + 1;

// --- 동선 최적화 ------------------------------------------------------------
function tourCost(order, hotel, est) {
  let c = 0;
  let prev = hotel;
  for (const p of order) {
    if (prev) c += est(prev, p);
    prev = p;
  }
  if (hotel && order.length) c += est(prev, hotel);
  return c;
}

export function optimizeOrder(stops, hotel, est) {
  if (stops.length < 3 && !(hotel && stops.length === 2)) return [...stops];
  // 최근접 이웃으로 초기해
  const rest = [...stops];
  const order = [];
  let cur = hotel || rest.shift();
  if (!hotel) order.push(cur);
  while (rest.length) {
    let bi = 0;
    rest.forEach((p, i) => {
      if (est(cur, p) < est(cur, rest[bi])) bi = i;
    });
    cur = rest.splice(bi, 1)[0];
    order.push(cur);
  }
  // 2-opt 개선
  let improved = true;
  let best = tourCost(order, hotel, est);
  for (let guard = 0; improved && guard < 50; guard++) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const cand = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        const c = tourCost(cand, hotel, est);
        if (c + 0.01 < best) {
          best = c;
          order.splice(0, order.length, ...cand);
          improved = true;
        }
      }
    }
  }
  return order;
}

// 식사·카페는 시간대가 중요하다: 빼고 최적화한 뒤 목표 시각(식사 시각, 카페는 15시)에 가까운 자리로 다시 끼운다.
export const CAFE_TIME = 15 * 60;
const targetTime = (trip, s) => (s.meal ? toMin(trip[s.meal]) : CAFE_TIME);
export function optimizeDay(trip, di) {
  return arrangeStops(trip, di, trip.days[di].stops);
}

// 주어진 장소들을 그날 동선으로 배치: 관광지는 이동 최소, 식사·카페는 목표 시각 근처
export function arrangeStops(trip, di, list) {
  const est = estimator(trip);
  const timed = (s) => s.meal || s.kind === 'cafe';
  const fixed = list.filter((s) => s.fixed);
  const meals = list.filter((s) => !s.fixed && timed(s));
  let stops = [
    ...fixed,
    ...optimizeOrder(
      list.filter((s) => !s.fixed && !timed(s)),
      dayHotel(trip, di),
      est,
    ),
  ];
  const segFn = estimateSeg(trip);
  for (const m of meals.sort((a, b) => targetTime(trip, a) - targetTime(trip, b))) {
    const target = targetTime(trip, m);
    let best = { i: stops.length, score: Infinity };
    // 숙소 도착(짐 풀기) 전 식사는 공항 근처(3km 이내) 식당일 때만
    const origin = dayOrigin(trip, di);
    const beforeHotelOk = m.meal && origin?.kind === 'airport' && distKm(origin, m) <= 3;
    for (let i = beforeHotelOk ? 0 : fixed.length; i <= stops.length; i++) {
      const trial = [...stops.slice(0, i), m, ...stops.slice(i)];
      const sim = computeDay({ ...trip, days: trip.days.map((d, k) => (k === di ? { ...d, stops: trial } : d)) }, di, segFn);
      const row = sim.rows.find((r) => r.stop === m);
      // 식사는 시각을 강하게(분당 2), 카페는 약하게(분당 0.2) 반영
      const score = sim.totals.travel + Math.abs(row.arrive - target) * (m.meal ? 2 : 0.2);
      if (score < best.score) best = { i, score };
    }
    stops = [...stops.slice(0, best.i), m, ...stops.slice(best.i)];
  }
  return stops;
}

// --- 메인 스팟 자동 배분 ----------------------------------------------------
export function dayCapacity(trip, di) {
  const seg = estimateSeg(trip);
  const w = dayWindow(trip, di, seg);
  let start = w.start;
  const hotel = dayHotel(trip, di);
  const origin = dayOrigin(trip, di);
  if (hotel && di === 0 && trip.arrival) start += seg(origin, hotel).min + (trip.restMin ?? 30);
  else if (isMoveDay(trip, di)) start += seg(origin, hotel).min + MOVE_STAY;
  const end = w.rawEnd;
  const tol = trip.mealTolerance ?? 30;
  let cap = end - start;
  for (const [type] of MEAL_TYPES) {
    if (!mealEnabled(trip, type)) continue;
    const T = toMin(trip[type]);
    if (T + tol >= start && T - tol <= end) cap -= trip.mealMinutes;
  }
  return Math.max(0, cap);
}

function kmeans(points, k) {
  // 결정적 초기화: 무게중심에서 가장 먼 점 → 이후 기존 중심에서 가장 먼 점
  const c0 = centroid(points);
  const centers = [];
  let first = points.reduce((a, p) => (distKm(p, c0) > distKm(a, c0) ? p : a), points[0]);
  centers.push({ lat: first.lat, lng: first.lng });
  while (centers.length < k) {
    const far = points.reduce((a, p) => {
      const d = Math.min(...centers.map((c) => distKm(p, c)));
      const da = Math.min(...centers.map((c) => distKm(a, c)));
      return d > da ? p : a;
    }, points[0]);
    centers.push({ lat: far.lat, lng: far.lng });
  }
  let assign = [];
  for (let it = 0; it < 20; it++) {
    assign = points.map((p) => {
      let bi = 0;
      centers.forEach((c, i) => {
        if (distKm(p, c) < distKm(p, centers[bi])) bi = i;
      });
      return bi;
    });
    centers.forEach((c, i) => {
      const mem = points.filter((_, j) => assign[j] === i);
      if (mem.length) Object.assign(c, centroid(mem));
    });
  }
  return centers.map((_, i) => points.filter((__, j) => assign[j] === i));
}

// 그날 들어갈 수 있는 식사 자리(켜진 식사 중 하루 가용 시간과 겹치는 것)
export function mealSlots(trip, di) {
  const w = dayWindow(trip, di);
  const tol = trip.mealTolerance ?? 30;
  return MEAL_TYPES.filter(([type]) => mealEnabled(trip, type))
    .map(([type]) => [type, toMin(trip[type])])
    .filter(([, T]) => T + tol >= w.start && T - tol <= w.rawEnd);
}

// 음식점 성격에 맞는 식사 순서: 바·이자카야는 저녁, 베이커리·브런치는 아침 우선
function mealPreference(p) {
  const t = p.types || [];
  const label = p.typeLabel || '';
  if (has(t, 'bar', 'pub', 'wine_bar', 'izakaya_restaurant', 'night_club') || /이자카야|술집|주점|바$|펍/.test(label)) return ['dinner', 'lunch'];
  if (has(t, 'breakfast_restaurant', 'brunch_restaurant', 'bakery') || /브런치|베이커리|조식/.test(label)) return ['breakfast', 'lunch', 'dinner'];
  return ['lunch', 'dinner', 'breakfast'];
}

// 메인 스팟 중 음식점을 식사 자리(날짜·아침/점심/저녁)에 배정한다
function assignMeals(trip, foods, out) {
  const taken = new Set();
  const rest = [];
  for (const f of foods) {
    const pref = mealPreference(f);
    let best = null;
    out.forEach((list, di) => {
      for (const [type, T] of mealSlots(trip, di)) {
        const rank = pref.indexOf(type);
        if (rank < 0 || taken.has(`${di}:${type}`)) continue;
        if (hoursWarning(f, dayDate(trip, di), T, T + trip.mealMinutes)) continue; // 그 시간에 문을 닫으면 제외
        const center = list.length ? centroid(list) : dayHotel(trip, di) || f;
        const score = distKm(center, f) + rank * 1.5;
        if (!best || score < best.score) best = { di, type, score };
      }
    });
    if (best) {
      taken.add(`${best.di}:${best.type}`);
      out[best.di].push({ ...f, meal: best.type, stay: Math.max(f.stay || 0, trip.mealMinutes) });
    } else rest.push(f);
  }
  return rest; // 남는 식사 자리가 없으면 일반 장소로 배치
}

// 날짜별 여행 스타일
export const DAY_STYLE = {
  sight: { label: '관광', icon: '🏯', desc: '메인 스팟을 이 날에 배치해요' },
  rest: { label: '휴식', icon: '🌿', desc: '숙소에서 도보 20분 안의 곳만, 없으면 비워 둬요' },
  shop: { label: '쇼핑', icon: '🛍️', desc: '쇼핑몰 위주로 코스를 짜요' },
  free: { label: '자유', icon: '✨', desc: '앱이 숙소 주변 인기 코스를 자동으로 짜요' },
};
export const dayStyle = (trip, di) => (DAY_STYLE[trip.dayStyles?.[di]] ? trip.dayStyles[di] : 'sight');
export const REST_WALK_MIN = 20;
export const isShop = (p) => (p?.types || []).some((t) => ['shopping_mall', 'department_store', 'market', 'shopping_center', 'clothing_store', 'store', 'outlet_mall'].includes(t)) || /쇼핑|백화점|몰$|아울렛|상점가|시장/.test(p?.typeLabel || p?.name || '');

// 마지막 날(귀국일)에 넣을 수 있는 스팟: 짐을 맡긴 숙소에서 30분 안에 가고, 짧게 머무는 곳(산책·쇼핑)
export const LAST_DAY_REACH_MIN = 30;
export const LAST_DAY_MAX_STAY = 120;
export function okOnLastDay(trip, s, est = estimator(trip)) {
  const last = trip.days.length - 1;
  const h = dayHotel(trip, last);
  if (!h) return false;
  return est(h, s) <= LAST_DAY_REACH_MIN && (s.stay || 60) <= LAST_DAY_MAX_STAY;
}

export function autoDistribute(trip, spots) {
  const n = trip.days.length;
  const out = Array.from({ length: n }, () => []);
  if (!spots.length) return out;
  // 음식점은 관광지 묶음과 따로 식사 자리에 넣는다
  const foods = spots.filter((s) => s.kind === 'food');
  spots = spots.filter((s) => s.kind !== 'food');
  const est = estimator(trip);
  const last = n - 1;
  const caps = Array.from({ length: n }, (_, i) => dayCapacity(trip, i));
  // 하루 부담: 체류 + 그날 숙소에서 출발·복귀하는 이동
  const load = (list, di) => {
    if (!list.length) return 0;
    const h = dayHotel(trip, di);
    const order = optimizeOrder(list, h, est);
    return list.reduce((s, p) => s + p.stay, 0) + tourCost(order, h, est);
  };
  // 그날 스타일에 맞는 스팟인지: 휴식=숙소 도보 20분 안, 쇼핑=쇼핑 장소, 귀국일=가깝고 짧은 곳
  const allowed = (s, di) => {
    if (di === last && !okOnLastDay(trip, s, est)) return false;
    const st = dayStyle(trip, di);
    if (st === 'rest') {
      const h = dayHotel(trip, di);
      return !!h && estimateMinutes(h, s, 'WALK') <= REST_WALK_MIN;
    }
    if (st === 'shop') return isShop(s);
    return true;
  };
  const unplaced = [];

  // 1) 숙소별 체류 구간: 같은 숙소에서 출발·복귀하는 날들을 묶는다
  const segs = [];
  for (let di = 0; di < n; di++) {
    const h = dayHotel(trip, di);
    const key = h ? h.id : 'none';
    const cur = segs[segs.length - 1];
    if (cur && cur.key === key) cur.days.push(di);
    else segs.push({ key, hotel: h, days: [di], spots: [] });
  }
  // 2) 스팟은 가장 가까운 숙소의 구간으로(숙소가 하나면 전부 그 구간)
  for (const sp of spots) {
    let best = segs[0];
    for (const sg of segs) {
      if (!sg.hotel) continue;
      if (!best.hotel || distKm(sg.hotel, sp) < distKm(best.hotel, sp)) best = sg;
    }
    best.spots.push(sp);
  }
  // 3) 구간 안에서 날짜별로 나눈다: 가까운 곳끼리 묶고(k-means), 큰 묶음부터 여유가 가장 많은 날에
  const used = caps.map(() => 0);
  const placeCluster = (c, days) => {
    const ok = days.filter((di) => c.every((sp) => allowed(sp, di)));
    // 관광·휴식·쇼핑 날을 먼저 쓰고, 자유 날은 남을 때만
    const firm = ok.filter((di) => dayStyle(trip, di) !== 'free');
    const pool = firm.length ? firm : ok;
    if (!pool.length) return false;
    let pick = null;
    for (const di of pool) {
      const room = caps[di] - used[di] - load(c, di);
      if (!pick || room > pick.room) pick = { di, room };
    }
    out[pick.di].push(...c);
    used[pick.di] = load(out[pick.di], pick.di);
    return true;
  };
  const leftovers = [];
  for (const sg of segs) {
    if (!sg.spots.length) continue;
    const k = Math.min(sg.days.length, sg.spots.length);
    const clusters = kmeans(sg.spots, k).filter((c) => c.length);
    // 스팟이 적어 한 곳씩 흩어진 경우: 3km 안의 묶음은 하루 용량이 허락하면 합친다
    const maxCap = Math.max(...sg.days.map((di) => caps[di]));
    const refDay = sg.days.find((di) => caps[di] === maxCap);
    for (let merged = true; merged; ) {
      merged = false;
      let best = null;
      for (let i = 0; i < clusters.length; i++)
        for (let j = i + 1; j < clusters.length; j++) {
          const d = distKm(centroid(clusters[i]), centroid(clusters[j]));
          if (d < 3 && load([...clusters[i], ...clusters[j]], refDay) <= maxCap && (!best || d < best.d)) best = { i, j, d };
        }
      if (best) {
        clusters[best.i].push(...clusters[best.j]);
        clusters.splice(best.j, 1);
        merged = true;
      }
    }
    clusters.sort((a, b) => load(b, refDay) - load(a, refDay));
    for (const c of clusters) if (!placeCluster(c, sg.days)) leftovers.push(...c);
  }
  // 구간에 넣을 날이 없던 스팟(예: 마지막 날만 있는 구간)은 어느 날이든 가능한 곳 중 가장 가까운 날로
  for (const sp of leftovers) {
    let pick = null;
    for (let di = 0; di < n; di++) {
      if (!allowed(sp, di)) continue;
      const h = dayHotel(trip, di);
      const score = (h ? distKm(h, sp) : 0) + Math.max(0, load([...out[di], sp], di) - caps[di]) / 10;
      if (!pick || score < pick.score) pick = { di, score };
    }
    if (pick) out[pick.di].push(sp);
    else unplaced.push(sp); // 휴식·쇼핑 설정 때문에 넣을 날이 없는 스팟
  }

  // 4) 과부하 해소: 넘치는 날에서 여유 있는 날로, 그 날 중심에 가장 가까운 스팟을 옮긴다(가까운 숙소의 날을 우선)
  for (let guard = 0; guard < 40; guard++) {
    const over = out.findIndex((list, i) => list.length > 1 && load(list, i) > caps[i]);
    if (over < 0) break;
    let move = null;
    out.forEach((list, i) => {
      if (i === over) return;
      const h = dayHotel(trip, i);
      const center = list.length ? centroid(list) : h || centroid(out[over]);
      for (const p of out[over]) {
        if (!allowed(p, i)) continue;
        const after = load([...list, p], i);
        if (after > caps[i]) continue;
        // 다른 숙소 구간으로 넘기는 건 멀리 돌아가는 셈이라 거리 페널티를 준다
        const sameHotel = h && dayHotel(trip, over)?.id === h.id;
        const d = distKm(p, center) + (sameHotel ? 0 : (h ? distKm(p, h) : 0));
        if (!move || d < move.d) move = { p, to: i, d };
      }
    });
    if (!move) break;
    out[over] = out[over].filter((p) => p !== move.p);
    out[move.to].push(move.p);
  }

  out.unplaced = unplaced;
  // 관광지 배치가 끝난 뒤 음식점을 식사 자리에, 자리가 없으면 가까운 날에 일반 장소로
  for (const f of assignMeals(trip, foods, out)) {
    let bi = 0;
    out.forEach((list, i) => {
      const c = list.length ? centroid(list) : dayHotel(trip, i) || f;
      const cb = out[bi].length ? centroid(out[bi]) : dayHotel(trip, bi) || f;
      if (distKm(c, f) < distKm(cb, f)) bi = i;
    });
    out[bi].push(f);
  }
  const result = out.map((list, di) => {
    // '숙소 도착·이동' 고정 자리가 있으면 포함해서 배치(짐 맡긴 이후 시간 기준)
    const fixed = (trip.days[di]?.stops || []).filter((s) => s.fixed);
    return arrangeStops(trip, di, [...fixed, ...list]);
  });
  result.unplaced = out.unplaced || [];
  return result;
}
