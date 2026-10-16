// 구간 이동시간 캐시. 화면은 추정치로 즉시 그리고, Google 경로가 도착하면 다시 그린다.

import { distKm, estimateMinutes, resolveMode } from './geo.js';
import { dayDate } from './planner.js';

const LS_KEY = 'travelplan.routes.v1';
const MAX_SAVED = 500;

// Routes API의 대중교통 출발시각은 과거 7일~미래 100일만 허용 → 같은 요일·시각으로 당겨 쓴다
export function departureFor(trip, ctx) {
  if (!ctx) return new Date(Date.now() + 10 * 60000);
  const WEEK = 7 * 864e5;
  let d = new Date(new Date(`${dayDate(trip, ctx.di)}T00:00:00+09:00`).getTime() + ctx.t * 60000);
  const now = Date.now();
  while (d.getTime() < now) d = new Date(d.getTime() + WEEK);
  while (d.getTime() - now > 90 * 864e5) d = new Date(d.getTime() - WEEK);
  return d;
}

export class RouteCache {
  constructor() {
    this.map = new Map();
    this.pending = new Set();
    this.queue = [];
    this.active = 0;
    this.provider = null;
    this.onChange = () => {};
    this.timer = null;
    try {
      for (const [k, v] of JSON.parse(localStorage.getItem(LS_KEY) || '[]')) this.map.set(k, v);
    } catch {
      /* 저장소를 못 쓰면 메모리 캐시만 쓴다 */
    }
  }

  setProvider(p) {
    this.provider = p;
    this.queue = [];
    this.pending.clear();
    for (const [k, v] of this.map) if (v.failed) this.map.delete(k);
  }

  key(a, b, mode) {
    const f = (n) => n.toFixed(5);
    return `${f(a.lat)},${f(a.lng)}>${f(b.lat)},${f(b.lng)}|${mode}`;
  }

  get live() {
    return this.provider?.name === 'google';
  }

  // planner.computeDay 에 넘기는 seg 함수
  seg(trip) {
    return (a, b, pref, ctx) => {
      const mode = resolveMode(a, b, pref, trip.walkLimitKm, trip.baseMode);
      const km = distKm(a, b);
      if (km < 0.03) return { min: 0, km: 0, mode, estimated: false, path: [a, b] };
      const k = this.key(a, b, mode);
      const hit = this.map.get(k);
      if (hit) return { ...hit, mode };
      if (this.live) this.request(k, a, b, mode, departureFor(trip, ctx));
      return {
        min: estimateMinutes(a, b, mode),
        km,
        mode,
        estimated: true,
        pending: this.live,
        path: [a, b],
      };
    };
  }

  request(k, a, b, mode, dep) {
    if (this.pending.has(k)) return;
    this.pending.add(k);
    this.queue.push({ k, a: { lat: a.lat, lng: a.lng }, b: { lat: b.lat, lng: b.lng }, mode, dep });
    this.pump();
  }

  pump() {
    while (this.active < 3 && this.queue.length) {
      const job = this.queue.shift();
      const provider = this.provider;
      this.active++;
      provider
        .route(job.a, job.b, job.mode, job.dep)
        .then((r) => this.map.set(job.k, r))
        .catch(() =>
          this.map.set(job.k, {
            min: estimateMinutes(job.a, job.b, job.mode),
            km: distKm(job.a, job.b),
            estimated: true,
            failed: true,
            path: [job.a, job.b],
          }),
        )
        .finally(() => {
          this.active--;
          this.pending.delete(job.k);
          if (provider === this.provider) this.changed();
          this.pump();
        });
    }
  }

  changed() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.save();
      this.onChange();
    }, 200);
  }

  save() {
    try {
      const entries = [...this.map].filter(([, v]) => !v.failed).slice(-MAX_SAVED);
      localStorage.setItem(LS_KEY, JSON.stringify(entries));
    } catch {
      /* 용량 초과 시 저장 생략 */
    }
  }

  clear() {
    this.map.clear();
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* noop */
    }
  }
}
