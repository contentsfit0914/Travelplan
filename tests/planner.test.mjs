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
} from '../js/planner.js';
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
    arriveTime: '14:00',
    departTime: '12:00',
    dayStart: '09:30',
    dayEnd: '21:00',
    lunch: '12:00',
    dinner: '18:30',
    mealMinutes: 75,
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

test('식사 공백: 첫날(14시 도착)은 점심, 마지막 날(12시 복귀)은 저녁을 요구하지 않는다', () => {
  const t = trip();
  const seg = () => ({ min: 10, km: 1, mode: 'TRANSIT' });
  assert.deepEqual(computeDay(t, 0, seg).gaps.map((g) => g.type), ['dinner']);
  assert.deepEqual(computeDay(t, 4, seg).gaps.map((g) => g.type), []);
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
