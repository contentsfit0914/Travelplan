import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDay,
  autoDistribute,
  optimizeOrder,
  bestInsert,
  estimator,
  estimateSeg,
  hoursWarning,
  dayCapacity,
  kindFromTypes,
  optimizeDay,
  fmtTime,
  minInsertIndex,
  budgetRadius,
  dayHotel,
  dayOrigin,
  isMoveDay,
  departurePlan,
  okOnLastDay,
  isOpenDuring,
} from '../js/planner.js';
import { syncTrip, sanitizeTrip } from '../js/store.js';
import { DEMO_PLACES } from '../js/data/demo-places.js';

const byId = (id) => {
  const p = DEMO_PLACES.find((x) => x.id === `demo:${id}`);
  return { ...p, kind: kindFromTypes(p.types), uid: id, stay: 60, mode: 'AUTO', meal: null };
};

function trip(extra = {}) {
  const t = {
    startDate: '2026-11-19', // 목요일
    nights: 4,
    people: 4,
    baseMode: 'TRANSIT',
    walkLimitKm: 1,
    pace: 'normal',
    arrival: { date: '2026-11-19', time: '14:00', airport: 'HND', mode: 'AUTO' },
    departure: { date: '2026-11-23', time: '18:00', airport: 'HND', mode: 'AUTO' },
    immigrationMin: 0,
    airportBufferMin: 120,
    checkIn: '15:00',
    checkOut: '11:00',
    restMin: 30,
    dayStart: '09:30',
    dayEnd: '21:00',
    breakfastOn: false,
    breakfast: '08:30',
    lunch: '12:00',
    dinner: '18:30',
    mealMinutes: 75,
    mealTolerance: 30,
    hotel: byId('h-shinjuku'),
    days: Array.from({ length: 5 }, () => ({ stops: [], returnMode: 'AUTO', skipMeals: [] })),
    ...extra,
  };
  return t;
}

test('시간표: 도착·출발 시각이 이동+체류만큼 누적된다', () => {
  const t = trip();
  t.days[1].stops = [byId('gyoen'), byId('tocho')];
  const seg = () => ({ min: 20, km: 1, mode: 'TRANSIT' });
  const r = computeDay(t, 1, seg);
  assert.equal(fmtTime(r.rows[0].arrive), '09:50');
  assert.equal(fmtTime(r.rows[0].depart), '10:50');
  assert.equal(fmtTime(r.rows[1].arrive), '11:10');
  assert.equal(fmtTime(r.end), '12:30');
  assert.equal(r.totals.travel, 60);
});

test('식사 공백: 점심 시간대에 식당이 없으면 그 자리에 공백 카드를 만든다', () => {
  const t = trip();
  t.days[1].stops = [byId('gyoen'), byId('tocho'), byId('meiji')];
  const r = computeDay(t, 1, () => ({ min: 20, km: 1, mode: 'TRANSIT' }));
  const lunch = r.gaps.find((g) => g.type === 'lunch');
  assert.ok(lunch);
  // 09:50-10:50, 11:10-12:10, 12:30-… → 12:00 이후 처음 도착하는 3번째 앞
  assert.equal(lunch.index, 2);
  assert.equal(lunch.anchor.uid, 'tocho');
  assert.ok(r.gaps.find((g) => g.type === 'dinner'));
});

test('식사 공백: 첫날(14시 도착)은 점심, 마지막 날(18시 이륙)은 저녁을 요구하지 않는다', () => {
  const t = trip();
  const seg = () => ({ min: 10, km: 1, mode: 'TRANSIT' });
  assert.deepEqual(computeDay(t, 0, seg).gaps.map((g) => g.type), ['dinner']);
  assert.deepEqual(computeDay(t, 4, seg).gaps.map((g) => g.type), ['lunch']);
  // 오전 비행기면 마지막 날 식사 자리는 없다
  const early = trip({ departure: { date: '2026-11-23', time: '11:00', airport: 'HND', mode: 'AUTO' } });
  assert.deepEqual(computeDay(early, 4, seg).gaps.map((g) => g.type), []);
});

test('식사 공백: 점심 지정 식당이 있으면 공백이 사라진다', () => {
  const t = trip();
  t.days[1].stops = [byId('gyoen'), { ...byId('f-omoide'), meal: 'lunch' }];
  const r = computeDay(t, 1, () => ({ min: 15, km: 1, mode: 'TRANSIT' }));
  assert.ok(!r.gaps.some((g) => g.type === 'lunch'));
});

test('영업시간: 휴무 시간 도착과 체류 중 마감을 구분한다', () => {
  // 매일 10:00–17:00
  const hours = { periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 10, minute: 0 }, close: { day: d, hour: 17, minute: 0 } })) };
  const s = { hours };
  assert.equal(hoursWarning(s, '2026-11-19', 9 * 60, 10 * 60 + 30), '도착 시각에 영업 중이 아닐 수 있어요');
  assert.equal(hoursWarning(s, '2026-11-19', 16 * 60, 18 * 60), '머무는 중에 영업이 끝나요');
  assert.equal(hoursWarning(s, '2026-11-19', 11 * 60, 12 * 60), null);
  // 24시간: close 없음
  assert.equal(hoursWarning({ hours: { periods: [{ open: { day: 0, hour: 0, minute: 0 }, close: null }] } }, '2026-11-19', 3 * 60, 4 * 60), null);
  // 자정 넘김(18:00–02:00) 영업, 새벽 1시 도착
  const night = { hours: { periods: [{ open: { day: 3, hour: 18, minute: 0 }, close: { day: 4, hour: 2, minute: 0 } }] } };
  assert.equal(hoursWarning(night, '2026-11-19', 60, 90), null); // 목요일 01:00
});

test('자동 배분: 가까운 스팟끼리 같은 날, 짧은 날(도착·귀국일)은 적게', () => {
  const t = trip();
  const ids = ['sensoji', 'nakamise', 'skytree', 'shibuya-cross', 'shibuya-sky', 'meiji', 'takeshita', 'teamlab', 'odaiba', 'gundam'];
  const spots = ids.map(byId);
  const days = autoDistribute(t, spots);
  assert.equal(days.flat().length, ids.length);
  const dayOf = (id) => days.findIndex((d) => d.some((s) => s.uid === id));
  assert.equal(dayOf('sensoji'), dayOf('nakamise'));
  assert.equal(dayOf('shibuya-cross'), dayOf('shibuya-sky'));
  assert.equal(dayOf('odaiba'), dayOf('gundam'));
  for (let i = 0; i < days.length; i++) {
    const load = days[i].reduce((s, p) => s + p.stay, 0);
    assert.ok(load <= dayCapacity(t, i) || days[i].length === 1, `D${i + 1} 과부하`);
  }
});

test('최적화: 지그재그 순서를 고치면 이동 추정치가 줄어든다', () => {
  const t = trip();
  const e = estimator(t);
  const zig = ['sensoji', 'shibuya-cross', 'skytree', 'meiji', 'nakamise'].map(byId);
  const cost = (order) => {
    let c = 0;
    let prev = t.hotel;
    for (const p of order) {
      c += e(prev, p);
      prev = p;
    }
    return c + e(prev, t.hotel);
  };
  const opt = optimizeOrder(zig, t.hotel, e);
  assert.equal(opt.length, zig.length);
  assert.ok(cost(opt) < cost(zig));
});

test('최적화: 점심으로 지정한 식당은 점심 시각 근처에 남는다', () => {
  const t = trip();
  t.days[1].stops = [{ ...byId('f-tsukiji'), meal: 'lunch', stay: 75 }, byId('sensoji'), byId('ueno-park'), byId('ginza'), byId('akiba')];
  const out = optimizeDay(t, 1);
  t.days[1].stops = out;
  const r = computeDay(t, 1, estimateSeg(t));
  const lunchRow = r.rows.find((x) => x.stop.meal === 'lunch');
  assert.ok(Math.abs(lunchRow.arrive - 12 * 60) <= 90, `점심 도착 ${fmtTime(lunchRow.arrive)}`);
});

test('삽입 위치: 동선 사이에 있는 장소는 그 사이에 들어간다', () => {
  const t = trip({ hotel: byId('h-ueno') });
  const e = estimator(t);
  const stops = [byId('ueno-park'), byId('skytree')];
  const ins = bestInsert(stops, t.hotel, byId('sensoji'), e);
  assert.equal(ins.index, 1);
});

test('자동 배분: 스팟이 일수보다 적어도 가까운 곳(센소지·스카이트리)은 같은 날로 묶는다', () => {
  const t = trip();
  const days = autoDistribute(t, ['sensoji', 'skytree', 'meiji', 'teamlab', 'tower'].map(byId));
  const dayOf = (id) => days.findIndex((d) => d.some((s) => s.uid === id));
  assert.equal(dayOf('sensoji'), dayOf('skytree'));
  assert.equal(days.flat().length, 5);
});

// ---- 항공편·식사 오차범위 -------------------------------------------------
// 공항 구간 60분, 그 밖 10분으로 고정한 이동시간
const airSeg = (a, b) => ({ min: a.kind === 'airport' || b.kind === 'airport' ? 60 : 10, km: 1, mode: 'TRANSIT' });
const withArrivalStop = (t) => {
  t.days[0].stops = [{ ...t.hotel, uid: 'arr', kind: 'hotel', fixed: 'arrival', stay: t.restMin, mode: 'AUTO', meal: null }];
  return t;
};

test('도착일 예시: 11시 도착·숙소까지 1시간·휴식 30분, 점심 12시 오차 10분 → 12:30 숙소 근처 가까운 곳', () => {
  const t = withArrivalStop(trip({ arrival: { date: '2026-11-19', time: '11:00', airport: 'HND', mode: 'AUTO' }, mealTolerance: 10 }));
  const r = computeDay(t, 0, airSeg);
  assert.equal(fmtTime(r.rows[0].arrive), '12:00');
  assert.equal(fmtTime(r.rows[0].depart), '12:30');
  const lunch = r.gaps.find((g) => g.type === 'lunch');
  assert.equal(fmtTime(lunch.at), '12:30'); // 11:00(60분 빠름)보다 12:30(30분 늦음)이 목표에 가깝다
  assert.equal(lunch.index, 1);
  assert.equal(lunch.anchor.fixed, 'arrival');
  assert.equal(lunch.ok, false); // 오차범위 10분 밖
  assert.equal(lunch.budget, 10); // 이미 늦었으니 가장 가까운 곳(10분)
});

test('도착일 예시: 같은 상황에 오차범위 1시간이면 30분 안에 갈 수 있는 곳까지 넓힌다', () => {
  const t = withArrivalStop(trip({ arrival: { date: '2026-11-19', time: '11:00', airport: 'HND', mode: 'AUTO' }, mealTolerance: 60 }));
  const lunch = computeDay(t, 0, airSeg).gaps.find((g) => g.type === 'lunch');
  assert.equal(fmtTime(lunch.at), '12:30');
  assert.equal(lunch.ok, true);
  assert.equal(lunch.budget, 30); // 13:00(12:00+1시간)까지 30분
  assert.ok(budgetRadius(30) > budgetRadius(10));
});

test('도착일: 공항에서 먹는 쪽이 목표에 더 가까우면 숙소 도착 전(공항)에 식사 자리를 잡는다', () => {
  const t = withArrivalStop(trip({ arrival: { date: '2026-11-19', time: '11:40', airport: 'NRT', mode: 'AUTO' }, mealTolerance: 30 }));
  const lunch = computeDay(t, 0, airSeg).gaps.find((g) => g.type === 'lunch');
  assert.equal(lunch.index, 0);
  assert.equal(lunch.anchor.kind, 'airport');
  assert.equal(fmtTime(lunch.at), '11:40');
  assert.equal(lunch.budget, 50); // 12:30까지
});

test('입국 수속 여유만큼 공항 출발이 늦어진다', () => {
  const t = withArrivalStop(trip({ arrival: { date: '2026-11-19', time: '11:00', airport: 'HND', mode: 'AUTO' }, immigrationMin: 60 }));
  const r = computeDay(t, 0, airSeg);
  assert.equal(fmtTime(r.win.start), '12:00');
  assert.equal(fmtTime(r.rows[0].arrive), '13:00');
});

test('귀국일: 이륙 18:00 - 공항 여유 2시간 - 숙소→공항 1시간 = 15:00까지 숙소 출발', () => {
  const t = trip();
  t.days[4].stops = [byId('gyoen')];
  const r = computeDay(t, 4, airSeg);
  assert.equal(fmtTime(r.dep.leaveBy), '15:00');
  assert.equal(fmtTime(r.dep.atAirport), '16:00');
  assert.equal(fmtTime(r.win.rawEnd), '15:00');
  t.days[4].stops[0].stay = 330; // 09:40~15:10 → 복귀 15:20
  assert.equal(computeDay(t, 4, airSeg).overflow, 20);
});

test('아침은 건너뛰기가 기본, 켜면 식사 자리가 생긴다', () => {
  const seg = () => ({ min: 10, km: 1, mode: 'TRANSIT' });
  assert.ok(!computeDay(trip(), 1, seg).gaps.some((g) => g.type === 'breakfast'));
  const on = trip({ breakfastOn: true, breakfast: '09:00', dayStart: '09:00' });
  const b = computeDay(on, 1, seg).gaps.find((g) => g.type === 'breakfast');
  assert.ok(b);
  assert.equal(b.index, 0);
});

test('첫날 숙소 도착 전에는 관광지를 넣지 않는다', () => {
  const t = withArrivalStop(trip());
  assert.equal(minInsertIndex(t.days[0]), 1);
  assert.equal(minInsertIndex(t.days[1]), 0);
  t.days[0].stops.push(byId('gyoen'), byId('tocho'));
  const out = optimizeDay(t, 0);
  assert.equal(out[0].fixed, 'arrival');
});

test('그날 마지막 일정 뒤의 식사는 목표 시각까지 기다렸다 잡는다', () => {
  const t = trip();
  t.days[1].stops = [byId('gyoen')];
  const seg = () => ({ min: 10, km: 1, mode: 'TRANSIT' });
  const dinner = computeDay(t, 1, seg).gaps.find((g) => g.type === 'dinner');
  assert.equal(fmtTime(dinner.at), '18:30');
  assert.equal(dinner.ok, true);
});

// ---- 음식점 메인 스팟은 식사 자리로 ---------------------------------------
import { classifyPlace, arrangeStops } from '../js/planner.js';

test('메인 스팟 음식점은 점심·저녁 자리에 배정되고 그 시간 근처에 도착한다', () => {
  const t = trip();
  const spots = ['gyoen', 'tocho', 'meiji', 'takeshita', 'f-omoide', 'f-shibuyayoko'].map(byId);
  const days = autoDistribute(t, spots);
  const seg = estimateSeg(t);
  for (const id of ['f-omoide', 'f-shibuyayoko']) {
    const di = days.findIndex((d) => d.some((s) => s.uid === id));
    const stop = days[di].find((s) => s.uid === id);
    assert.ok(['lunch', 'dinner'].includes(stop.meal), `${id} meal=${stop.meal}`);
    t.days[di].stops = days[di];
    const row = computeDay(t, di, seg).rows.find((r) => r.stop.uid === id);
    const target = stop.meal === 'lunch' ? 12 * 60 : 18 * 60 + 30;
    assert.ok(Math.abs(row.arrive - target) <= 90, `${id} ${fmtTime(row.arrive)}`);
    assert.ok(row.arrive < 21 * 60, `${id} 숙소 복귀 시간 이후 배치`);
  }
  // 같은 날 같은 식사가 겹치지 않는다
  const slots = days.flatMap((d, di) => d.filter((s) => s.meal).map((s) => `${di}:${s.meal}`));
  assert.equal(new Set(slots).size, slots.length);
});

test('바·이자카야는 저녁, 영업 안 하는 시간대는 피한다', () => {
  const t = trip();
  const bar = { ...byId('f-goldengai'), types: ['bar'] };
  const lunchOnly = { ...byId('f-tsukiji'), hours: { periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 5, minute: 0 }, close: { day: d, hour: 14, minute: 0 } })) } };
  const days = autoDistribute(t, [byId('gyoen'), bar, lunchOnly]);
  const find = (id) => days.flat().find((s) => s.uid === id);
  assert.equal(find('f-goldengai').meal, 'dinner');
  assert.equal(find('f-tsukiji').meal, 'lunch');
});

test('종류 정보가 부족해도 유형 이름으로 음식점·카페를 구분한다', () => {
  assert.equal(classifyPlace(['point_of_interest', 'establishment'], '라멘 음식점'), 'food');
  assert.equal(classifyPlace(['point_of_interest'], '카페'), 'cafe');
  assert.equal(classifyPlace(['tourist_attraction'], '관광 명소'), 'sight');
  assert.equal(classifyPlace(['ramen_restaurant', 'restaurant'], ''), 'food');
});

test('첫날 숙소 근처 식당은 숙소에 들러 짐을 푼 뒤로 배치한다', () => {
  const t = withArrivalStop(trip({ arrival: { date: '2026-11-19', time: '11:00', airport: 'HND', mode: 'AUTO' } }));
  const lunch = { ...byId('f-omoide'), meal: 'lunch', stay: 75 };
  const out = arrangeStops(t, 0, [...t.days[0].stops, lunch]);
  assert.equal(out[0].fixed, 'arrival');
  assert.equal(out[1].uid, 'f-omoide');
});

// ---- 날짜별 숙소 -------------------------------------------------------------
const H = (id, extra = {}) => ({ ...byId(id), kind: 'hotel', checkIn: '15:00', checkOut: '11:00', ...extra });
function twoHotels() {
  // 1~2박 신주쿠, 3~4박 아사쿠사(D3 아침 이동)
  const t = trip({ hotels: [H('h-shinjuku'), H('h-asakusa', { checkIn: '16:00' })], nightHotel: ['demo:h-shinjuku', 'demo:h-shinjuku', 'demo:h-asakusa', 'demo:h-asakusa'], mustSpots: [] });
  return syncTrip(t);
}

test('날짜별 숙소: 그날 돌아갈 숙소·아침 출발 숙소·마지막 날 짐 찾을 숙소', () => {
  const t = twoHotels();
  assert.equal(dayHotel(t, 0).id, 'demo:h-shinjuku');
  assert.equal(dayHotel(t, 2).id, 'demo:h-asakusa');
  assert.equal(dayOrigin(t, 2).id, 'demo:h-shinjuku');
  assert.equal(dayHotel(t, 4).id, 'demo:h-asakusa');
  assert.equal(departurePlan(t, estimateSeg(t)).hotel.id, 'demo:h-asakusa');
  assert.deepEqual([0, 1, 2, 3, 4].map((d) => isMoveDay(t, d)), [false, false, true, false, false]);
});

test('숙소를 옮기는 날: 아침에 새 숙소에 짐을 맡기는 고정 자리가 생기고, 밤엔 새 숙소로 돌아간다', () => {
  const t = twoHotels();
  assert.equal(t.days[0].stops[0].fixed, 'arrival');
  assert.equal(t.days[2].stops[0].fixed, 'move');
  assert.equal(t.days[2].stops[0].id, 'move-hotel');
  assert.ok(t.days.filter((_, i) => i !== 0 && i !== 2).every((d) => !d.stops.some((s) => s.fixed)));
  t.days[2].stops.push(byId('sensoji'));
  const r = computeDay(t, 2, estimateSeg(t));
  assert.match(r.rows[0].info, /체크인\(16:00\) 전이라 짐만/);
  assert.equal(r.origin.id, 'demo:h-shinjuku');
  assert.ok(r.back && r.back.min < 15, '아사쿠사 관광 후 근처 새 숙소로 복귀');
  assert.equal(minInsertIndex(t.days[2]), 1);
  // 숙소를 하나로 합치면 이동 자리가 사라진다
  t.nightHotel = ['demo:h-shinjuku', 'demo:h-shinjuku', 'demo:h-shinjuku', 'demo:h-shinjuku'];
  syncTrip(t);
  assert.ok(!t.days[2].stops.some((s) => s.fixed));
});

test('자동 배분: 관광지 묶음은 가까운 숙소에 묵는 날로 간다', () => {
  const t = twoHotels();
  const spots = ['sensoji', 'nakamise', 'skytree', 'meiji', 'takeshita', 'gyoen'].map((id) => ({ ...byId(id), stay: 60 }));
  const out = autoDistribute(t, spots);
  const dayOf = (id) => out.findIndex((list) => list.some((s) => s.uid === id));
  assert.ok([2, 3].includes(dayOf('sensoji')), `아사쿠사 묶음은 아사쿠사 숙소 날(D3·D4): D${dayOf('sensoji') + 1}`);
  assert.ok([0, 1].includes(dayOf('meiji')), `신주쿠·하라주쿠 묶음은 신주쿠 숙소 날(D1·D2): D${dayOf('meiji') + 1}`);
});

test('이전 버전(숙소 하나) 데이터는 숙소 목록 하나로 옮기고 모든 밤에 배정한다', () => {
  const raw = { v: 1, startDate: '2026-11-19', nights: 4, hotel: byId('h-ginza'), checkIn: '14:00', checkOut: '10:00', days: [] };
  const t = sanitizeTrip(raw);
  assert.equal(t.hotels.length, 1);
  assert.equal(t.hotels[0].checkIn, '14:00');
  assert.equal(t.nightHotel.length, t.nights);
  assert.ok(t.nightHotel.every((id) => id === 'demo:h-ginza'));
  assert.equal(t.hotel.id, 'demo:h-ginza');
});

test('지운 숙소의 밤은 앞 밤의 숙소로 채운다', () => {
  const t = twoHotels();
  t.hotels = t.hotels.filter((h) => h.id !== 'demo:h-asakusa');
  syncTrip(t);
  assert.ok(t.nightHotel.every((id) => id === 'demo:h-shinjuku'));
  assert.ok(!t.days.some((d) => d.stops.some((s) => s.fixed === 'move')));
});

// ---- 숙소 구간별 배분·귀국일 제한 ------------------------------------------
const HAKONE = { lat: 35.2323, lng: 139.1069 };
const hk = (id, name, dlat, dlng, stay = 75) => ({ id: `t:${id}`, uid: id, name, lat: HAKONE.lat + dlat, lng: HAKONE.lng + dlng, kind: 'sight', types: ['tourist_attraction'], stay, mode: 'AUTO', meal: null });
function hakoneTokyo(departureTime = '14:00') {
  // 1~2박 하코네, 3~4박 도쿄(우에노). 귀국 나리타
  const hotelHakone = { ...hk('h-hakone', '하코네 숙소', 0, 0), kind: 'hotel', types: ['lodging'], checkIn: '15:00', checkOut: '11:00' };
  const t = trip({
    hotels: [hotelHakone, H('h-ueno')],
    nightHotel: ['t:h-hakone', 't:h-hakone', 'demo:h-ueno', 'demo:h-ueno'],
    departure: { date: '2026-11-23', time: departureTime, airport: 'NRT', mode: 'AUTO' },
    dayStart: '10:00',
    mustSpots: [],
  });
  return syncTrip(t);
}
const hakoneSpots = () => [hk('pirate', '하코네 해적선', 0.01, -0.02, 90), hk('owakudani', '오와쿠다니', 0.02, 0.01, 60), hk('machi', '하코네마치', -0.005, 0.005, 75)];
const tokyoSpots = () => ['ueno-park', 'sensoji', 'akiba', 'tnm', 'skytree'].map((id) => ({ ...byId(id), stay: 60 }));

test('숙소 구간별 배분: 하코네 스팟은 하코네 숙소에 묵는 날(D1·D2)에, 도쿄 스팟은 도쿄 숙소 날에 들어간다', () => {
  const t = hakoneTokyo('14:00');
  const out = autoDistribute(t, [...hakoneSpots(), ...tokyoSpots()]);
  const dayOf = (uid) => out.findIndex((list) => list.some((s) => s.uid === uid));
  for (const uid of ['pirate', 'owakudani', 'machi']) assert.ok([0, 1].includes(dayOf(uid)), `${uid} → D${dayOf(uid) + 1}`);
  for (const uid of ['ueno-park', 'sensoji', 'akiba', 'tnm', 'skytree']) assert.ok([2, 3].includes(dayOf(uid)), `${uid} → D${dayOf(uid) + 1}`);
  // 14:00 출발이면 귀국일(D5)엔 여유가 없어 아무것도 넣지 않는다
  assert.equal(out[4].length, 0);
});

test('귀국일: 저녁 비행기면 숙소에서 30분 안의 짧은 스팟만 넣고, 먼 곳은 넣지 않는다', () => {
  const t = hakoneTokyo('21:00');
  assert.ok(dayCapacity(t, 4) > 120, '저녁 출발이라 귀국일에 여유가 있어야 한다');
  const near = { ...byId('ueno-park'), stay: 60 }; // 우에노 숙소 바로 옆
  const far = { ...byId('odaiba'), stay: 180 }; // 멀고 오래 머무는 곳
  assert.equal(okOnLastDay(t, near), true);
  assert.equal(okOnLastDay(t, far), false);
  // 도쿄 구간(D3~D5)에 스팟이 많아 넘칠 때도 먼 곳은 귀국일로 가지 않는다
  const many = [...tokyoSpots(), far, { ...byId('teamlab'), stay: 150 }, { ...byId('shibuya-sky'), stay: 90 }];
  const out = autoDistribute(t, many);
  for (const s of out[4]) assert.ok(okOnLastDay(t, s), `귀국일에 들어간 ${s.name}은 가깝고 짧아야 한다`);
});

// ---- 날짜별 여행 스타일 ------------------------------------------------------
test('여행 스타일: 휴식 날엔 숙소 도보 20분 안의 스팟만, 쇼핑 날엔 쇼핑몰만, 메인 스팟은 관광 날로', () => {
  const t = syncTrip(trip({ hotels: [H('h-shinjuku')], nightHotel: [], mustSpots: [] }));
  // D2 휴식, D3 쇼핑, 나머지 관광 (숙소: 신주쿠)
  t.dayStyles = ['sight', 'rest', 'shop', 'sight', 'sight'];
  const near = { ...byId('gyoen'), stay: 60 }; // 신주쿠 교엔: 숙소에서 도보 20분 안
  const far = { ...byId('sensoji'), stay: 60 };
  const mall = { ...byId('sunshine'), stay: 90 }; // shopping_mall
  const out = autoDistribute(t, [near, far, mall, { ...byId('meiji'), stay: 60 }, { ...byId('tower'), stay: 60 }]);
  const dayOf = (uid) => out.findIndex((list) => list.some((s) => s.uid === uid));
  assert.notEqual(dayOf('sensoji'), 1, '멀리 있는 센소지는 휴식일에 못 들어간다');
  assert.notEqual(dayOf('sensoji'), 2, '쇼핑몰이 아닌 센소지는 쇼핑일에 못 들어간다');
  assert.notEqual(dayOf('meiji'), 2);
  assert.ok(out[1].every((s) => s.uid === 'gyoen'), `휴식일엔 가까운 곳만: ${out[1].map((s) => s.uid)}`);
  assert.ok(out[2].every((s) => s.uid === 'sunshine'), `쇼핑일엔 쇼핑몰만: ${out[2].map((s) => s.uid)}`);
  assert.equal(out.flat().filter((s) => !s.fixed).length, 5);
});

test('여행 스타일: 넣을 날이 없는 스팟은 unplaced 로 돌려준다', () => {
  const t = syncTrip(trip({ hotels: [H('h-shinjuku')], nightHotel: [], mustSpots: [] }));
  t.dayStyles = ['rest', 'rest', 'rest', 'rest', 'rest'];
  const out = autoDistribute(t, [{ ...byId('sensoji'), stay: 60 }, { ...byId('gyoen'), stay: 60 }]);
  assert.equal(out.unplaced.length, 1);
  assert.equal(out.unplaced[0].uid, 'sensoji');
  assert.equal(out.flat().filter((s) => !s.fixed).length, 1);
});

// ---- 영업시간으로 추천 후보 거르기 ---------------------------------------------
test('isOpenDuring: 그 요일 휴무면 false, 영업시간이 하루 가용 시간과 겹치면 true, 정보 없으면 true', () => {
  // 2026-11-18 은 수요일(3). 월·화·목~일 11:00~15:00 영업, 수요일 휴무
  const periods = [0, 1, 2, 4, 5, 6].map((d) => ({ open: { day: d, hour: 11, minute: 0 }, close: { day: d, hour: 15, minute: 0 } }));
  const p = { hours: { periods } };
  assert.equal(isOpenDuring(p, '2026-11-18', 9 * 60, 21 * 60), false, '수요일 휴무');
  assert.equal(isOpenDuring(p, '2026-11-19', 9 * 60, 21 * 60), true, '목요일 영업');
  assert.equal(isOpenDuring(p, '2026-11-19', 16 * 60, 21 * 60), false, '목요일이지만 저녁엔 닫음');
  assert.equal(isOpenDuring({ hours: null }, '2026-11-18', 9 * 60, 21 * 60), true, '정보 없음');
  // 자정 넘어 영업(금 22:00~토 02:00)
  const late = { hours: { periods: [{ open: { day: 5, hour: 22, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } }] } };
  assert.equal(isOpenDuring(late, '2026-11-20', 23 * 60, 24 * 60), true);
  assert.equal(isOpenDuring(late, '2026-11-20', 9 * 60, 21 * 60), false);
});
