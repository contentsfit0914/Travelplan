// 데모 공급자: API 키 없이 샘플 데이터와 추정 이동시간으로 동작한다.

import { DEMO_PLACES } from '../data/demo-places.js';
import { distKm } from '../geo.js';
import { kindFromTypes } from '../planner.js';

const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

const withKind = (p) => ({ ...p, kind: kindFromTypes(p.types) });

export function createDemoProvider() {
  const all = DEMO_PLACES.map(withKind);

  async function searchText(query, { kind } = {}) {
    const q = norm(query);
    if (!q) return [];
    const pool = kind === 'hotel' ? all.filter((p) => p.kind === 'hotel') : all.filter((p) => p.kind !== 'hotel');
    const hits = pool.filter((p) => norm(p.name).includes(q) || norm(p.address).includes(q) || norm(p.note).includes(q));
    // 숙소 검색어가 지역명이 아니면 전체 후보를 보여 준다
    if (!hits.length && kind === 'hotel') return pool;
    return hits;
  }

  async function nearby(kind, center, radius) {
    return all
      .filter((p) => p.kind === kind)
      .map((p) => ({ p, d: distKm(center, p) }))
      .filter(({ d }) => d * 1000 <= Math.max(radius * 2.5, 2500))
      .sort((a, b) => a.d - b.d)
      .slice(0, 12)
      .map(({ p }) => p);
  }

  async function route() {
    throw new Error('DEMO');
  }

  // 데모에는 리뷰·AI 요약 데이터가 없다(가짜 리뷰를 만들지 않는다)
  async function details(id) {
    const p = all.find((x) => x.id === id);
    return { id, name: p?.name || '', demo: true, editorial: p?.note || '', address: p?.address || '', photos: [], reviews: [], serves: [], ai: {} };
  }

  return { name: 'demo', searchText, nearby, route, details };
}
