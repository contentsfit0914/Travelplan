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
// 하루의 출발점: 첫날은 공항, 그 외는 숙소
export const dayOrigin = (trip, di) => (di === 0 && trip.arrival ? airportPoint(trip.arrival.airport) : trip.hotel);

// 마지막 날: 이륙 - 공항 도착 여유 - 숙소→공항 이동 = 숙소에서 늦어도 출발해야 하는 시각
export function departurePlan(trip, seg) {
  if (!trip.departure || !trip.hotel) return null;
  const airport = airportPoint(trip.departure.airport);
  const flight = toMin(trip.departure.time);
  const atAirport = flight - (trip.airportBufferMin ?? 120);
  const di = trip.days.length - 1;
  const leg = seg(trip.hotel, airport, trip.departure.mode || 'AUTO', { di, t: atAirport - 90 });
  return { airport, flight, atAirport, leg, leaveBy: atAirport - leg.min };
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
  const hotel = trip.hotel;
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
    const arrive = t + (leg ? leg.min : 0);
    const depart = arrive + stop.stay;
    totals.travel += leg ? leg.min : 0;
    if (stop.kind === 'food' || stop.kind === 'cafe') totals.meal += stop.stay;
    else if (stop.kind !== 'hotel') totals.sight += stop.stay;
    let warn = hoursWarning(stop, date, arrive, depart);
    let info = null;
    if (stop.fixed === 'arrival') {
      info = arrive < toMin(trip.checkIn) ? `체크인(${trip.checkIn}) 전이라 짐만 맡기고 쉬어요` : '체크인하고 짐 풀기';
    }
    if (stop.meal && !warn && trip[stop.meal]) {
      const d = arrive - toMin(trip[stop.meal]);
      if (Math.abs(d) > tol)
        warn = `${MEAL_LABEL[stop.meal]} 목표 ${trip[stop.meal]}보다 ${fmtDur(Math.abs(d))} ${d > 0 ? '늦어요' : '빨라요'} (오차범위 ${fmtDur(tol)})`;
    }
    rows.push({ stop, index, num: stop.fixed ? null : ++num, leg, arrive, depart, warn, info });
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

// 첫날 '숙소 도착' 이전에는 식사 말고는 넣지 않는다(짐을 들고 다니지 않도록)
export const minInsertIndex = (day) => day.stops.findIndex((s) => s.fixed === 'arrival') + 1;

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
  const day = trip.days[di];
  const est = estimator(trip);
  const timed = (s) => s.meal || s.kind === 'cafe';
  const fixed = day.stops.filter((s) => s.fixed);
  const meals = day.stops.filter((s) => !s.fixed && timed(s));
  let stops = [
    ...fixed,
    ...optimizeOrder(
      day.stops.filter((s) => !s.fixed && !timed(s)),
      trip.hotel,
      est,
    ),
  ];
  const segFn = estimateSeg(trip);
  for (const m of meals.sort((a, b) => targetTime(trip, a) - targetTime(trip, b))) {
    const target = targetTime(trip, m);
    let best = { i: stops.length, score: Infinity };
    for (let i = m.meal ? 0 : fixed.length; i <= stops.length; i++) {
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
  if (di === 0 && trip.arrival && trip.hotel) start += seg(dayOrigin(trip, 0), trip.hotel).min + (trip.restMin ?? 30);
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

export function autoDistribute(trip, spots) {
  const n = trip.days.length;
  const out = Array.from({ length: n }, () => []);
  if (!spots.length) return out;
  const est = estimator(trip);
  const caps = Array.from({ length: n }, (_, i) => dayCapacity(trip, i));
  const load = (list) => {
    if (!list.length) return 0;
    const order = optimizeOrder(list, trip.hotel, est);
    return list.reduce((s, p) => s + p.stay, 0) + tourCost(order, trip.hotel, est);
  };

  const k = Math.min(n, spots.length);
  const clusters = kmeans(spots, k).filter((c) => c.length);
  // 스팟이 적어 한 곳씩 흩어진 경우: 3km 안의 묶음은 하루 용량이 허락하면 합친다
  const maxCap = Math.max(...caps);
  for (let merged = true; merged; ) {
    merged = false;
    let best = null;
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        const d = distKm(centroid(clusters[i]), centroid(clusters[j]));
        if (d < 3 && load([...clusters[i], ...clusters[j]]) <= maxCap && (!best || d < best.d)) best = { i, j, d };
      }
    if (best) {
      clusters[best.i].push(...clusters[best.j]);
      clusters.splice(best.j, 1);
      merged = true;
    }
  }
  const dayIdx = caps.map((c, i) => [c, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  clusters.sort((a, b) => load(b) - load(a));
  clusters.forEach((c, i) => out[dayIdx[i]].push(...c));

  // 과부하 해소: 넘치는 날에서 여유 있는 날로, 그 날 중심에 가장 가까운 스팟을 옮긴다
  for (let guard = 0; guard < 40; guard++) {
    const over = out.findIndex((list, i) => list.length > 1 && load(list) > caps[i]);
    if (over < 0) break;
    let move = null;
    out.forEach((list, i) => {
      if (i === over) return;
      const center = list.length ? centroid(list) : trip.hotel || centroid(out[over]);
      for (const p of out[over]) {
        const after = load([...list, p]);
        if (after > caps[i]) continue;
        const d = distKm(p, center);
        if (!move || d < move.d) move = { p, to: i, d };
      }
    });
    if (!move) break;
    out[over] = out[over].filter((p) => p !== move.p);
    out[move.to].push(move.p);
  }

  return out.map((list) => optimizeOrder(list, trip.hotel, est));
}
