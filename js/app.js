// 도쿄 여행 플래너 — 화면 렌더링과 사용자 동작 처리.
// 흐름: 여행 정보 → 숙소 → 메인 스팟 → 시간 설정 → 자동 일정 → (동선 확인 → 가볼만한 곳 → 맛집·카페) 추가

import {
  computeDay,
  dayLabel,
  dayDate,
  dayWindow,
  dayCapacity,
  defaultStay,
  autoDistribute,
  optimizeDay,
  bestInsert,
  timedInsert,
  estimator,
  fmtTime,
  fmtDur,
  toMin,
  PACE,
  MEAL_LABEL,
} from './planner.js';
import { MODES, distKm, fmtKm, centroid } from './geo.js';
import {
  loadTrip,
  saveTrip,
  loadSettings,
  saveSettings,
  ensureDays,
  emptyDay,
  defaultTrip,
  validateImported,
  safeUrl,
  isLikelyApiKey,
  maskKey,
} from './store.js';
import { RouteCache } from './routes.js';
import { MapView } from './mapview.js';
import { createDemoProvider } from './providers/demo.js';
import { createGoogleProvider } from './providers/google.js';
import { QUICK_SPOTS, DEMO_PLACES } from './data/demo-places.js';

const CFG = window.TRAVELPLAN_CONFIG || {};
const DAY_COLORS = ['#F2542D', '#2D7FF9', '#12A57A', '#9B51E0', '#E8A317', '#E0457B', '#0EA5B7', '#64748B', '#8B5CF6', '#D97706'];
const KIND = {
  sight: { icon: '📍', label: '관광' },
  food: { icon: '🍜', label: '맛집' },
  cafe: { icon: '☕', label: '카페' },
  hotel: { icon: '🏨', label: '숙소' },
};
const PRICE = { FREE: '무료', INEXPENSIVE: '¥', MODERATE: '¥¥', EXPENSIVE: '¥¥¥', VERY_EXPENSIVE: '¥¥¥¥' };
const FOOD_KEYWORDS = ['라멘', '스시', '야키니쿠', '이자카야', '돈카츠', '우동·소바', '오코노미야키', '규카츠'];
const CAFE_KEYWORDS = ['디저트', '킷사텐', '말차', '베이커리'];
const ICON = {
  gear: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  expand: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
};
const STEP_TITLES = ['', '여행 정보', '숙소 위치', '가고 싶은 메인 스팟', '하루 시간 설정'];

const S = {
  trip: loadTrip(),
  settings: loadSettings(),
  provider: createDemoProvider(),
  providerError: '',
  connecting: false,
  ui: {
    screen: 'setup',
    step: 1,
    day: 0,
    sheet: null,
    mapBig: false,
    search: { q: '', results: [], loading: false, error: '' },
    focus: null,
  },
};
S.ui.screen = S.trip.created ? 'plan' : 'setup';

const routes = new RouteCache();
let mapView;
const recCache = new Map();

// ---------------------------------------------------------------- 유틸
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => Math.random().toString(36).slice(2, 10);
const round15 = (m) => Math.max(15, Math.round(m / 15) * 15);
const isDemo = () => S.provider.name === 'demo';
const seg = () => routes.seg(S.trip);
const est = () => estimator(S.trip);
const color = (di) => DAY_COLORS[di % DAY_COLORS.length];
const allStops = () => S.trip.days.flatMap((d, di) => d.stops.map((s, i) => ({ s, di, i })));
const findStop = (u) => allStops().find((x) => x.s.uid === u);
const placeDay = (id) => allStops().find((x) => x.s.id === id)?.di;
const save = () => saveTrip(S.trip);
const photoOf = (p) => safeUrl(p.photo, { image: true });
const cssColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : null);
const candDomId = (id) => `cand-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

function makeStop(p, extra = {}) {
  const kind = p.kind || 'sight';
  const base = { ...p, kind };
  const stay = kind === 'sight' ? round15(defaultStay(base) * PACE[S.trip.pace].factor) : defaultStay(base);
  return { ...base, uid: uid(), stay, mode: 'AUTO', meal: null, must: false, ...extra };
}

function ratingHTML(p) {
  if (p.rating == null) return '';
  const cnt = p.ratingCount != null ? ` <span class="muted">(${p.ratingCount.toLocaleString()})</span>` : '';
  return `<span class="rating">★ ${p.rating.toFixed(1)}${cnt}</span>`;
}

function placeMeta(p) {
  const parts = [p.typeLabel || KIND[p.kind]?.label];
  if (p.priceLevel && PRICE[p.priceLevel]) parts.push(PRICE[p.priceLevel]);
  return parts.filter(Boolean).map(esc).join(' · ');
}

function dirUrl(a, b, mode) {
  const q = new URLSearchParams({
    api: '1',
    origin: `${a.lat},${a.lng}`,
    destination: `${b.lat},${b.lng}`,
    travelmode: MODES[mode]?.gmaps || 'transit',
  });
  if (a.id && !a.demo) q.set('origin_place_id', a.id);
  if (b.id && !b.demo) q.set('destination_place_id', b.id);
  return `https://www.google.com/maps/dir/?${q}`;
}

function placeUrl(p) {
  const u = safeUrl(p.mapsUrl);
  if (u) return u;
  const q = new URLSearchParams({ api: '1', query: `${p.lat},${p.lng}` });
  if (p.id && !p.demo) q.set('query_place_id', p.id);
  return `https://www.google.com/maps/search/?${q}`;
}

function dayRouteUrl(di) {
  const { hotel } = S.trip;
  const pts = [hotel, ...S.trip.days[di].stops, hotel].filter(Boolean);
  if (pts.length < 2) return null;
  const ll = (p) => `${p.lat},${p.lng}`;
  const q = new URLSearchParams({ api: '1', origin: ll(pts[0]), destination: ll(pts[pts.length - 1]) });
  const mid = pts.slice(1, -1).slice(0, 9);
  if (mid.length) q.set('waypoints', mid.map(ll).join('|'));
  return `https://www.google.com/maps/dir/?${q}`;
}

// ---------------------------------------------------------------- 토스트
let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button data-action="toast-action">${esc(action.label)}</button>` : ''}`;
  el.hidden = false;
  el._action = action?.fn;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), action ? 6000 : 3200);
}

// ---------------------------------------------------------------- 확인 창
// 브라우저 기본 confirm() 대신 앱 안의 확인 창을 쓴다(모바일 일관성, 임베드 환경 호환)
function ask(message, okLabel = '확인', danger = false) {
  return new Promise((resolve) => {
    const el = $('#dialog');
    el.innerHTML = `<div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dlgMsg">
      <p id="dlgMsg">${esc(message)}</p>
      <div class="dlg-actions">
        <button class="btn" data-dlg="0">취소</button>
        <button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-dlg="1">${esc(okLabel)}</button>
      </div>
    </div>`;
    el.hidden = false;
    const done = (v) => {
      el.hidden = true;
      el.innerHTML = '';
      el.onclick = null;
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e) => e.key === 'Escape' && done(false);
    document.addEventListener('keydown', onKey);
    el.onclick = (e) => {
      const b = e.target.closest('[data-dlg]');
      if (b) done(b.dataset.dlg === '1');
      else if (e.target === el) done(false);
    };
    el.querySelector('[data-dlg="1"]').focus();
  });
}

// ---------------------------------------------------------------- 공급자 연결
async function connect() {
  const key = CFG.googleMapsApiKey || S.settings.apiKey;
  S.providerError = '';
  if (key && !S.settings.preferDemo && !CFG.preview) {
    S.connecting = true;
    render();
    try {
      const p = await createGoogleProvider(key);
      await mapView.use('google', { mapId: CFG.mapId });
      setProvider(p);
    } catch (e) {
      S.providerError = e.message || 'Google 지도 연결에 실패했어요.';
      await useDemo();
    }
    S.connecting = false;
  } else {
    await useDemo();
  }
  render({ fit: true });
}

async function useDemo() {
  await mapView.use('leaflet', { tiles: !CFG.preview });
  setProvider(createDemoProvider());
}

function setProvider(p) {
  S.provider = p;
  routes.setProvider(p);
  recCache.clear();
}

// ---------------------------------------------------------------- 렌더링
function render(opts = {}) {
  const panel = $('#panel');
  const scroll = panel.scrollTop;
  panel.innerHTML = S.ui.screen === 'setup' ? setupHTML() : planHTML();
  if (!opts.resetScroll) panel.scrollTop = scroll;
  else panel.scrollTop = 0;
  renderSheet();
  $('.app').classList.toggle('map-big', S.ui.mapBig);
  $('#modeBadge').innerHTML = isDemo()
    ? `<button data-action="open-settings" class="badge-demo">${CFG.preview ? '미리보기' : '데모 모드'}</button>`
    : `<span class="badge-live">Google 지도</span>`;
  renderMap(opts);
}

function providerBanner() {
  if (S.connecting) return `<div class="banner">Google 지도에 연결하는 중…</div>`;
  if (S.providerError)
    return `<div class="banner banner-err"><b>Google 지도 연결 실패</b><br>${esc(S.providerError)}<br><button class="link" data-action="open-settings">API 키 확인하기</button></div>`;
  if (CFG.preview)
    return `<div class="banner"><b>미리보기</b> · 샘플 장소와 추정 이동시간으로 동작하고 지도 배경은 표시되지 않아요. 실제 Google 장소·평점·경로는 내 PC나 팀 사이트에서 실행해 API 키를 연결하면 쓸 수 있어요.</div>`;
  if (isDemo())
    return `<div class="banner"><b>데모 모드</b> · 샘플 장소와 추정 이동시간으로 동작해요. 실제 Google 장소·평점·경로는 <button class="link" data-action="open-settings">API 키 연결</button> 후 사용할 수 있어요.</div>`;
  return `<div class="banner banner-ok">Google 지도 연결됨 · 장소·평점·영업시간·경로를 실시간으로 불러와요.</div>`;
}

// ---------- 설정 마법사
function setupHTML() {
  const t = S.trip;
  const step = S.ui.step;
  const body = [null, setupStep1, setupStep2, setupStep3, setupStep4][step]();
  const canNext = step !== 2 || t.hotel;
  return `
  <div class="sticky-head">
  <header class="topbar">
    <div>
      <div class="eyebrow">여행 준비 ${step}/4</div>
      <h1>${STEP_TITLES[step]}</h1>
    </div>
    ${t.created ? `<button class="btn-ghost" data-action="close-setup">닫기</button>` : `<button class="icon-btn" data-action="open-settings" aria-label="설정">${ICON.gear}</button>`}
  </header>
  <div class="steps">${[1, 2, 3, 4].map((n) => `<button class="step-dot ${n <= step ? 'on' : ''}" data-action="goto-step" data-step="${n}" aria-label="${STEP_TITLES[n]}"></button>`).join('')}</div>
  </div>
  <section class="content">${body}</section>
  <footer class="action-bar">
    ${step > 1 ? `<button class="btn" data-action="goto-step" data-step="${step - 1}">이전</button>` : '<span></span>'}
    ${
      step < 4
        ? `<button class="btn btn-primary" data-action="goto-step" data-step="${step + 1}" ${canNext ? '' : 'disabled'}>${step === 2 && !t.hotel ? '숙소를 선택해 주세요' : '다음'}</button>`
        : t.created
          ? `<button class="btn btn-primary" data-action="save-setup">변경 사항 저장</button>`
          : `<button class="btn btn-primary" data-action="build" ${t.hotel ? '' : 'disabled'}>일정 자동 만들기 ✨</button>`
    }
  </footer>`;
}

function seg3(field, options, current) {
  return `<div class="seg">${options
    .map(([v, label]) => `<button class="${String(current) === String(v) ? 'on' : ''}" data-action="set" data-field="${field}" data-value="${v}">${label}</button>`)
    .join('')}</div>`;
}

function setupStep1() {
  const t = S.trip;
  const end = dayDate({ ...t, days: [] }, t.nights);
  return `
  ${providerBanner()}
  <div class="field">
    <label>출발일</label>
    <input type="date" data-field="startDate" value="${t.startDate}">
    <p class="hint">${dayLabel(t, 0)} 출발 → ${Number(end.slice(5, 7))}/${Number(end.slice(8, 10))} 귀국 · 요일별 영업시간 확인에 쓰여요</p>
  </div>
  <div class="row2">
    <div class="field">
      <label>일정</label>
      <select data-field="nights" data-type="num">${[1, 2, 3, 4, 5, 6, 7]
        .map((n) => `<option value="${n}" ${n === t.nights ? 'selected' : ''}>${n}박 ${n + 1}일</option>`)
        .join('')}</select>
    </div>
    <div class="field">
      <label>인원</label>
      <div class="stepper">
        <button data-action="people" data-d="-1" aria-label="인원 줄이기">−</button>
        <b>${t.people}명</b>
        <button data-action="people" data-d="1" aria-label="인원 늘리기">＋</button>
      </div>
    </div>
  </div>
  <div class="field">
    <label>기본 이동수단</label>
    ${seg3('baseMode', [['TRANSIT', '🚇 대중교통 위주'], ['DRIVE', '🚕 택시 위주']], t.baseMode)}
    <p class="hint">가까운 거리는 아래 기준에 따라 자동으로 도보로 계산해요. 구간마다 따로 바꿀 수도 있어요.</p>
  </div>
  <div class="field">
    <label>도보로 이동할 최대 거리</label>
    ${seg3('walkLimitKm', [[0.5, '500m'], [1, '1km'], [1.5, '1.5km']], t.walkLimitKm)}
  </div>
  <div class="field">
    <label>여행 페이스</label>
    ${seg3('pace', Object.entries(PACE).map(([k, v]) => [k, v.label]), t.pace)}
    <p class="hint">관광지 기본 체류시간에 반영돼요 (여유롭게 ×1.25 · 알차게 ×0.8).</p>
  </div>`;
}

function resultsHTML(kindTarget) {
  const s = S.ui.search;
  if (s.loading) return `<div class="empty"><span class="spinner"></span> 검색 중…</div>`;
  if (s.error) return `<div class="empty err">${esc(s.error)}</div>`;
  if (!s.results.length) return s.q ? `<div class="empty">검색 결과가 없어요. 다른 이름으로 검색해 보세요.</div>` : '';
  return `<ul class="results">${s.results
    .map((p, i) => {
      const added = kindTarget === 'hotel' ? S.trip.hotel?.id === p.id : S.trip.mustSpots.some((m) => m.id === p.id);
      return `<li class="result">
        <div class="r-main">
          <div class="r-name">${KIND[p.kind]?.icon || '📍'} ${esc(p.name)}</div>
          <div class="r-meta">${ratingHTML(p)} ${placeMeta(p)}</div>
          <div class="r-addr">${esc(p.address)}</div>
        </div>
        <button class="btn btn-sm ${added ? '' : 'btn-primary'}" data-action="${kindTarget === 'hotel' ? 'pick-hotel' : 'add-must'}" data-i="${i}" ${added ? 'disabled' : ''}>${added ? '선택됨' : kindTarget === 'hotel' ? '선택' : '＋ 추가'}</button>
      </li>`;
    })
    .join('')}</ul>`;
}

function setupStep2() {
  const h = S.trip.hotel;
  return `
  ${
    h
      ? `<div class="card hotel-card"><div class="pin-inline">🏨</div><div><b>${esc(h.name)}</b><div class="muted">${esc(h.address)}</div></div></div>`
      : `<p class="lead">숙소를 기준으로 매일 출발·복귀 동선을 계산해요.</p>`
  }
  <div class="searchbox">
    <input type="search" placeholder="${isDemo() ? '지역 검색 (예: 신주쿠, 시부야, 긴자)' : '호텔 이름이나 주소 검색'}" data-search="hotel" value="${esc(S.ui.search.q)}" enterkeyhint="search">
    <button class="btn btn-primary" data-action="search" data-target="hotel">검색</button>
  </div>
  ${isDemo() && !S.ui.search.q ? demoHotelList() : resultsHTML('hotel')}`;
}

function demoHotelList() {
  S.ui.search.results = DEMO_PLACES.filter((p) => p.types.includes('lodging')).map((p) => ({ ...p, kind: 'hotel' }));
  return `<p class="hint">데모 모드에서는 지역 대표 지점으로 숙소 위치를 정해요.</p>${resultsHTML('hotel')}`;
}

function setupStep3() {
  const t = S.trip;
  const quick = QUICK_SPOTS.filter((q) => !t.mustSpots.some((m) => m.name === q));
  const total = t.mustSpots.reduce((s, m) => s + m.stay, 0);
  const cap = t.days.reduce((s, _, i) => s + dayCapacity(t, i), 0);
  return `
  <p class="lead">꼭 가고 싶은 곳을 넣으면 가까운 곳끼리 묶어 날짜별로 나눠 드려요.</p>
  <div class="searchbox">
    <input type="search" placeholder="장소 검색 (예: 센소지, 팀랩)" data-search="must" value="${esc(S.ui.search.q)}" enterkeyhint="search">
    <button class="btn btn-primary" data-action="search" data-target="must">검색</button>
  </div>
  ${resultsHTML('must')}
  ${quick.length ? `<div class="chips-label">인기 스팟 빠르게 추가</div><div class="chips">${quick.map((q) => `<button class="chip" data-action="quick-spot" data-q="${esc(q)}">＋ ${esc(q)}</button>`).join('')}</div>` : ''}
  <div class="section-title">선택한 메인 스팟 <span class="muted">${t.mustSpots.length}곳 · 관광 ${fmtDur(total)} / 여행 중 가용 약 ${fmtDur(cap)}</span></div>
  ${
    t.mustSpots.length
      ? `<ul class="must-list">${t.mustSpots
          .map(
            (m, i) => `<li>
          <span class="num">${i + 1}</span>
          <div class="r-main"><div class="r-name">${KIND[m.kind]?.icon || '📍'} ${esc(m.name)}</div><div class="r-meta">${placeMeta(m)}</div></div>
          <div class="stay mini">
            <button data-action="must-stay" data-i="${i}" data-d="-15" aria-label="체류시간 줄이기">−</button>
            <span>${fmtDur(m.stay)}</span>
            <button data-action="must-stay" data-i="${i}" data-d="15" aria-label="체류시간 늘리기">＋</button>
          </div>
          <button class="icon-btn sm" data-action="remove-must" data-i="${i}" aria-label="삭제">✕</button>
        </li>`,
          )
          .join('')}</ul>`
      : `<div class="empty">아직 선택한 스팟이 없어요. 없어도 다음 단계로 넘어가 추천을 받으며 채울 수 있어요.</div>`
  }`;
}

function timeField(label, field, hint = '') {
  return `<div class="field"><label>${label}</label><input type="time" data-field="${field}" value="${S.trip[field]}" step="900">${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
}

function setupStep4() {
  const t = S.trip;
  const bars = t.days
    .map((_, i) => {
      const w = dayWindow(t, i);
      const cap = dayCapacity(t, i);
      return `<div class="cap-row"><span class="cap-day" style="--c:${color(i)}">D${i + 1}</span><span class="cap-date">${dayLabel(t, i)}</span><span class="cap-bar"><i style="width:${Math.min(100, (cap / 720) * 100)}%;background:${color(i)}"></i></span><span class="cap-txt">${fmtTime(w.start)}–${fmtTime(w.end)}</span></div>`;
    })
    .join('');
  return `
  <div class="row2">
    ${timeField('첫날 일정 시작', 'arriveTime', '숙소 도착·짐 정리 후')}
    ${timeField('마지막 날 숙소 복귀', 'departTime', '체크아웃·공항 이동 전')}
  </div>
  <div class="row2">
    ${timeField('매일 숙소 출발', 'dayStart')}
    ${timeField('매일 숙소 복귀', 'dayEnd')}
  </div>
  <div class="row2">
    ${timeField('점심 시간', 'lunch')}
    ${timeField('저녁 시간', 'dinner')}
  </div>
  <div class="field">
    <label>식사 1회 소요 (${t.people}명 기준)</label>
    ${seg3('mealMinutes', [[60, '60분'], [75, '75분'], [90, '90분'], [120, '120분']], t.mealMinutes)}
    <p class="hint">식사 시간대가 비어 있으면 일정표에 '맛집 추천' 자리를 만들어 드려요.</p>
  </div>
  <div class="section-title">날짜별 관광 가용 시간 <span class="muted">(식사 제외)</span></div>
  <div class="cap-list">${bars}</div>`;
}

// ---------- 일정 화면
function planHTML() {
  const t = S.trip;
  const di = S.ui.day;
  const tabs = [`<button class="daytab ${di === -1 ? 'on' : ''}" data-action="day" data-day="-1"><b>전체</b><small>${t.nights}박${t.nights + 1}일</small></button>`]
    .concat(
      t.days.map(
        (_, i) =>
          `<button class="daytab ${di === i ? 'on' : ''}" style="--c:${color(i)}" data-action="day" data-day="${i}"><b><i class="dot"></i>D${i + 1}</b><small>${dayLabel(t, i)}</small></button>`,
      ),
    )
    .join('');
  return `
  <div class="sticky-head">
  <header class="topbar">
    <div>
      <div class="eyebrow">${dayLabel(t, 0)} – ${dayLabel(t, t.nights)} · ${t.people}명</div>
      <h1>도쿄 ${t.nights}박 ${t.nights + 1}일</h1>
    </div>
    <div class="top-actions">
      <button class="icon-btn" data-action="share" aria-label="일정 공유">${ICON.share}</button>
      <button class="icon-btn" data-action="open-settings" aria-label="설정">${ICON.gear}</button>
    </div>
  </header>
  <nav class="daytabs" role="tablist">${tabs}</nav>
  </div>
  ${S.providerError ? providerBanner() : ''}
  ${di === -1 ? overviewHTML() : dayHTML(di)}
  ${
    di === -1
      ? ''
      : `<footer class="action-bar rec-bar">
    <button class="btn" data-action="open-rec" data-tab="sight">🏛 가볼만한 곳</button>
    <button class="btn" data-action="open-rec" data-tab="food">🍜 맛집</button>
    <button class="btn" data-action="open-rec" data-tab="cafe">☕ 카페</button>
    <button class="btn icon-only" data-action="open-rec" data-tab="search" aria-label="장소 검색">🔍</button>
  </footer>`
  }`;
}

function overviewHTML() {
  const t = S.trip;
  const s = seg();
  return `<section class="content">
    ${!t.hotel ? `<div class="banner banner-err">숙소가 없어요. <button class="link" data-action="edit-setup" data-step="2">숙소 설정하기</button></div>` : `<div class="card hotel-card slim"><div class="pin-inline">🏨</div><div><b>${esc(t.hotel.name)}</b><div class="muted">매일 출발·복귀 기준</div></div></div>`}
    ${t.days
      .map((d, i) => {
        const r = computeDay(t, i, s);
        const warn = r.overflow ? `<span class="warn-pill">⚠ ${fmtDur(r.overflow)} 초과</span>` : r.gaps.length ? `<span class="gap-pill">🍽 ${r.gaps.map((g) => g.label).join('·')} 미정</span>` : `<span class="ok-pill">여유 ${fmtDur(r.free)}</span>`;
        return `<button class="day-card" style="--c:${color(i)}" data-action="day" data-day="${i}">
          <div class="dc-head"><b>D${i + 1}</b> <span>${dayLabel(t, i)}</span> <span class="muted">${fmtTime(r.win.start)}–${fmtTime(Math.max(r.end, r.win.start))}</span> ${warn}</div>
          <div class="dc-stops">${d.stops.length ? d.stops.map((st, k) => `<span><i>${k + 1}</i>${esc(st.name)}</span>`).join('') : '<span class="muted">비어 있음 — 눌러서 채우기</span>'}</div>
          <div class="dc-foot muted">이동 ${fmtDur(r.totals.travel)} · 관광 ${fmtDur(r.totals.sight)} · 식사·카페 ${fmtDur(r.totals.meal)}</div>
        </button>`;
      })
      .join('')}
  </section>`;
}

function modeLabel(leg, pref) {
  const m = MODES[leg.mode];
  return `${m.icon} ${m.label} ${leg.min ? fmtDur(leg.min) : '바로 옆'}${pref === 'AUTO' || !pref ? '' : ' ·고정'}`;
}

function legHTML(leg, from, to, ref, pref, di) {
  if (!leg) return '';
  const lines = (leg.lines || [])
    .map((l) => `<span class="line-chip" style="${cssColor(l.color) ? `--lc:${cssColor(l.color)}` : ''}" title="${esc(l.from)} → ${esc(l.to)} (${l.stops}정거장)">${esc(l.name)}</span>`)
    .join('');
  const tag = leg.pending ? '<span class="spinner sm" title="경로 계산 중"></span>' : leg.estimated && isDemo() ? '<span class="tag">추정</span>' : leg.failed ? '<span class="tag tag-warn" title="Google 경로를 찾지 못해 직선거리로 추정했어요">추정</span>' : '';
  return `<div class="leg" style="--c:${color(di)}">
    <button class="leg-mode" data-action="cycle-mode" data-ref="${ref}">${modeLabel(leg, pref)}</button>
    <span class="leg-km">${leg.km ? fmtKm(leg.km) : ''}</span>${tag}
    ${lines ? `<span class="lines">${lines}</span>` : ''}
    <a class="leg-link" href="${dirUrl(from, to, leg.mode)}" target="_blank" rel="noopener">길찾기 ↗</a>
  </div>`;
}

function gapHTML(g) {
  const anchorName = g.anchor ? (g.anchor === S.trip.hotel ? '숙소' : g.anchor.name) : '현재 위치';
  return `<div class="gap">
    <div class="stop-time"><b>${fmtTime(g.time)}</b><small>${g.label}</small></div>
    <div class="gap-ico">🍽</div>
    <div class="gap-card">
      <button class="gap-main" data-action="open-rec" data-tab="food" data-gap="${g.type}">
        <b>${g.label} 식당이 비어 있어요</b>
        <small>${esc(anchorName)} 주변 맛집 추천받기 ›</small>
      </button>
      <button class="gap-skip" data-action="skip-meal" data-meal="${g.type}">건너뛰기</button>
    </div>
  </div>`;
}

function freeHTML(from, to, anchor) {
  const a = anchor && anchor !== S.trip.hotel && anchor.uid ? anchor.uid : 'hotel';
  return `<div class="free">
    <span class="free-line"></span>
    <button data-action="open-rec" data-tab="sight" data-anchor="${a}">
      <b>${fmtTime(from)} ~ ${fmtTime(to)} · ${fmtDur(to - from)} 비어 있어요</b>
      <small>이 근처 가볼만한 곳 추천받기 ›</small>
    </button>
  </div>`;
}

function stopHTML(row, di) {
  const s = row.stop;
  const active = S.ui.focus === s.uid ? 'is-active' : '';
  return `<div class="stop ${active}" style="--c:${color(di)}" data-uid="${esc(s.uid)}">
    <div class="stop-time"><b>${fmtTime(row.arrive)}</b><small>~${fmtTime(row.depart)}</small></div>
    <div class="stop-num">${row.index + 1}</div>
    <button class="stop-body" data-action="open-stop" data-uid="${esc(s.uid)}">
      <span class="stop-name">${KIND[s.kind]?.icon || '📍'} ${esc(s.name)}</span>
      <span class="stop-meta">${s.must ? '<em class="badge">메인</em>' : ''}${s.meal ? `<em class="badge meal">${MEAL_LABEL[s.meal]}</em>` : ''}${ratingHTML(s)} ${placeMeta(s)}</span>
      ${row.warn ? `<span class="warn">⚠ ${esc(row.warn)}</span>` : ''}
    </button>
    <div class="stay">
      <button data-action="stay" data-uid="${esc(s.uid)}" data-d="-15" aria-label="체류시간 줄이기">−</button>
      <span>${fmtDur(s.stay)}</span>
      <button data-action="stay" data-uid="${esc(s.uid)}" data-d="15" aria-label="체류시간 늘리기">＋</button>
    </div>
  </div>`;
}

function dayHTML(di) {
  const t = S.trip;
  const day = t.days[di];
  const r = computeDay(t, di, seg());
  const span = Math.max(1, r.win.end - r.win.start, r.end - r.win.start);
  const pct = (m) => `${Math.max(0, (m / span) * 100)}%`;
  const sights = day.stops.filter((s) => s.kind === 'sight').length;
  const foods = day.stops.filter((s) => s.kind !== 'sight').length;
  const pending = r.rows.some((x) => x.leg?.pending) || r.back?.pending;
  const routeUrl = dayRouteUrl(di);

  // 타임라인 조립
  const parts = [];
  if (t.hotel) parts.push(`<div class="anchor"><span class="a-time">${fmtTime(r.win.start)}</span><span class="a-ico">🏨</span><span>${esc(t.hotel.name)} 출발</span></div>`);
  let prev = t.hotel;
  let free = r.win.start;
  const gapWithFree = (g) => {
    if (g.time - free >= 60) parts.push(freeHTML(free, g.time, g.anchor));
    parts.push(gapHTML(g));
    free = Math.max(free, g.time + t.mealMinutes);
  };
  r.rows.forEach((row, i) => {
    r.gaps.filter((g) => g.index === i).forEach(gapWithFree);
    parts.push(legHTML(row.leg, prev, row.stop, `stop:${row.stop.uid}`, row.stop.mode, di));
    parts.push(stopHTML(row, di));
    prev = row.stop;
    free = row.depart;
  });
  const tailGaps = r.gaps.filter((g) => g.index >= r.rows.length);
  tailGaps.forEach(gapWithFree);
  const openTail = tailGaps.length > 0 || (r.rows.length && r.free >= 90);
  if (r.rows.length && r.free >= 90) parts.push(freeHTML(free, r.win.end - (r.back?.min || 0), prev));
  if (r.back) parts.push(legHTML(r.back, prev, t.hotel, `back:${di}`, day.returnMode, di));
  if (t.hotel && r.rows.length)
    parts.push(
      openTail
        ? `<div class="anchor end"><span class="a-time">${fmtTime(r.win.end)}</span><span class="a-ico">🏨</span><span>숙소 복귀 목표<small class="muted"> · 지금 일정대로면 ${fmtTime(r.end)} 복귀</small></span></div>`
        : `<div class="anchor end ${r.overflow ? 'over' : ''}"><span class="a-time">${fmtTime(r.end)}</span><span class="a-ico">🏨</span><span>숙소 복귀${r.overflow ? ` · 목표 ${fmtTime(r.win.end)}보다 ${fmtDur(r.overflow)} 늦어요` : ''}</span></div>`,
    );

  const flow = [
    { n: 1, label: '이동 동선', done: day.stops.length > 0, sub: day.stops.length ? `${day.stops.length}곳` : '비어 있음', action: '' },
    { n: 2, label: '가볼만한 곳', done: sights >= 2, sub: `관광 ${sights}곳`, action: 'data-action="open-rec" data-tab="sight"' },
    {
      n: 3,
      label: '맛집·카페',
      done: !r.gaps.length && foods > 0,
      sub: r.gaps.length ? `식사 ${r.gaps.length}끼 미정` : `${foods}곳`,
      action: r.gaps.length ? `data-action="open-rec" data-tab="food" data-gap="${r.gaps[0].type}"` : 'data-action="open-rec" data-tab="cafe"',
    },
  ];

  return `<section class="content">
    <div class="summary" style="--c:${color(di)}">
      <div class="sum-head">
        <div><b>D${di + 1} · ${dayLabel(t, di)}</b>${r.win.isArrival ? '<em class="badge">도착일</em>' : ''}${r.win.isDeparture ? '<em class="badge">귀국일</em>' : ''}</div>
        <div class="muted">${fmtTime(r.win.start)} – ${fmtTime(r.win.end)}</div>
      </div>
      <div class="timebar" aria-hidden="true">
        <i class="tb-travel" style="width:${pct(r.totals.travel)}"></i><i class="tb-sight" style="width:${pct(r.totals.sight)}"></i><i class="tb-meal" style="width:${pct(r.totals.meal)}"></i>${r.overflow ? `<i class="tb-over" style="width:${pct(r.overflow)}"></i>` : ''}
        <span class="tb-limit" style="left:${pct(r.win.end - r.win.start)}"></span>
      </div>
      <div class="sum-stats">
        <span><i class="lg lg-travel"></i>이동 ${fmtDur(r.totals.travel)}</span>
        <span><i class="lg lg-sight"></i>관광 ${fmtDur(r.totals.sight)}</span>
        <span><i class="lg lg-meal"></i>식사·카페 ${fmtDur(r.totals.meal)}</span>
        ${r.overflow ? `<span class="over">⚠ ${fmtDur(r.overflow)} 초과</span>` : `<span class="ok">여유 ${fmtDur(r.free)}</span>`}
      </div>
      <div class="sum-actions">
        <button class="btn btn-sm" data-action="optimize" ${day.stops.length < 2 ? 'disabled' : ''}>⇅ 동선 최적화</button>
        ${routeUrl ? `<a class="btn btn-sm" href="${routeUrl}" target="_blank" rel="noopener">🗺 Google 지도로 보기</a>` : ''}
        ${pending ? '<span class="muted small"><span class="spinner sm"></span> 실제 경로 계산 중</span>' : ''}
      </div>
    </div>
    <ol class="flow">${flow
      .map((f) => `<li class="${f.done ? 'done' : ''}"><button ${f.action || 'disabled'}><span class="fn">${f.done ? '✓' : f.n}</span><span><b>${f.label}</b><small>${f.sub}</small></span></button></li>`)
      .join('')}</ol>
    ${!t.hotel ? `<div class="banner banner-err">숙소가 없어 출발·복귀 동선을 계산할 수 없어요. <button class="link" data-action="edit-setup" data-step="2">숙소 설정</button></div>` : ''}
    <div class="timeline">${parts.join('')}</div>
    ${
      !day.stops.length
        ? `<div class="empty big"><p>아직 이 날 일정이 비어 있어요.</p><button class="btn btn-primary" data-action="open-rec" data-tab="sight">숙소 주변 가볼만한 곳 추천받기</button></div>`
        : ''
    }
  </section>`;
}

// ---------- 시트(추천 / 장소 상세 / 설정)
function renderSheet() {
  const el = $('#sheet');
  const sh = S.ui.sheet;
  if (!sh) {
    el.classList.remove('open');
    el.innerHTML = '';
    return;
  }
  const html = sh.type === 'rec' ? recHTML(sh) : sh.type === 'stop' ? stopSheetHTML(sh) : settingsHTML();
  const list = el.querySelector('.sheet-body');
  const keep = list && el.dataset.type === sh.type ? list.scrollTop : 0;
  el.dataset.type = sh.type;
  el.innerHTML = `<div class="sheet-grab" data-action="close-sheet"></div>${html}`;
  const nb = el.querySelector('.sheet-body');
  if (nb && !sh.resetScroll) nb.scrollTop = keep;
  sh.resetScroll = false;
  el.classList.add('open');
}

function anchorOptions(sh) {
  const t = S.trip;
  const day = t.days[S.ui.day];
  const opts = [['route', '동선 전체']];
  if (t.hotel) opts.push(['hotel', '🏨 숙소']);
  day.stops.forEach((s, i) => opts.push([s.uid, `${i + 1}. ${s.name}`]));
  return `<div class="chips scroll">${opts
    .map(([v, l]) => `<button class="chip ${sh.anchor === v ? 'on' : ''}" data-action="rec-anchor" data-v="${esc(v)}">${esc(l)}</button>`)
    .join('')}</div>`;
}

function recHTML(sh) {
  const tabs = [
    ['sight', '🏛 가볼만한 곳'],
    ['food', '🍜 맛집'],
    ['cafe', '☕ 카페'],
    ['search', '🔍 검색'],
  ];
  const kw = sh.tab === 'food' ? FOOD_KEYWORDS : sh.tab === 'cafe' ? CAFE_KEYWORDS : [];
  const gapNote = sh.gap ? `<div class="banner slim">🍽 <b>${MEAL_LABEL[sh.gap]}</b> 자리에 넣을 곳을 고르면 그 시간대에 바로 들어가요.</div>` : '';
  let list;
  if (sh.loading) list = `<div class="empty"><span class="spinner"></span> ${isDemo() ? '샘플에서 찾는 중…' : 'Google 지도에서 찾는 중…'}</div>`;
  else if (sh.error) list = `<div class="empty err">${esc(sh.error)}</div>`;
  else if (!sh.results.length)
    list = `<div class="empty">${sh.tab === 'search' ? (sh.q ? '검색 결과가 없어요.' : '장소 이름을 검색해 이 날 일정에 넣을 수 있어요.') : '주변에서 찾은 곳이 없어요. 기준 위치를 바꿔 보세요.'}</div>`;
  else {
    const sorted = [...sh.results].sort((a, b) =>
      sh.sort === 'near' ? a.extra - b.extra : sh.sort === 'rating' ? (b.rating || 0) - (a.rating || 0) : b.score - a.score,
    );
    list = `<ul class="rec-list">${sorted.map((p) => recItemHTML(p, sh)).join('')}</ul>`;
  }
  return `
  <div class="sheet-head">
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${sh.tab === k ? 'on' : ''}" data-action="rec-tab" data-tab="${k}">${l}</button>`).join('')}</div>
    <button class="icon-btn" data-action="close-sheet" aria-label="닫기">${ICON.close}</button>
  </div>
  <div class="sheet-body">
    ${gapNote}
    ${
      sh.tab === 'search'
        ? `<div class="searchbox"><input type="search" placeholder="장소 이름 검색" data-search="rec" value="${esc(sh.q || '')}" enterkeyhint="search"><button class="btn btn-primary" data-action="rec-search">검색</button></div>`
        : `<div class="chips-label">어디 주변에서 찾을까요?</div>${anchorOptions(sh)}`
    }
    ${kw.length ? `<div class="chips scroll">${['전체', ...kw].map((k) => `<button class="chip sm ${(sh.keyword || '전체') === k ? 'on' : ''}" data-action="rec-keyword" data-v="${esc(k)}" ${isDemo() && k !== '전체' ? 'disabled title="Google 모드에서 사용할 수 있어요"' : ''}>${esc(k)}</button>`).join('')}</div>` : ''}
    <div class="sortbar">
      <span class="muted small">${sh.results.length ? `${sh.results.length}곳` : ''}${isDemo() ? ' · 데모 샘플' : ''}</span>
      ${seg3('rec-sort', [['score', '추천순'], ['near', '가까운순'], ['rating', '평점순']], sh.sort).replaceAll('data-action="set"', 'data-action="rec-sort"')}
    </div>
    ${list}
  </div>`;
}

function recItemHTML(p, sh) {
  const inDay = placeDay(p.id);
  const focus = S.ui.focus === `cand:${p.id}`;
  const detour = p.extra <= 2 ? '동선에서 거의 안 벗어나요' : `이동 +${p.extra}분`;
  return `<li class="rec ${focus ? 'is-active' : ''}" id="${candDomId(p.id)}">
    ${photoOf(p) ? `<div class="thumb"><img src="${esc(photoOf(p))}" alt="" loading="lazy">${p.photoAttr ? `<small>${esc(p.photoAttr)}</small>` : ''}</div>` : `<div class="thumb ph">${KIND[p.kind]?.icon || '📍'}</div>`}
    <button class="rec-main" data-action="focus-cand" data-id="${esc(p.id)}">
      <span class="r-name">${esc(p.name)}</span>
      <span class="r-meta">${ratingHTML(p)} ${placeMeta(p)}</span>
      <span class="r-dist">${detour} · ${esc(p.distLabel)}</span>
      ${p.note ? `<span class="r-note">${esc(p.note)}</span>` : ''}
    </button>
    <div class="rec-side">
      ${
        inDay != null
          ? `<span class="added">D${inDay + 1} 추가됨</span>`
          : `<button class="btn btn-sm btn-primary" data-action="add-cand" data-id="${esc(p.id)}">＋ 추가</button>`
      }
      <a class="link small" href="${esc(placeUrl(p))}" target="_blank" rel="noopener">지도 ↗</a>
    </div>
  </li>`;
}

function stopSheetHTML(sh) {
  const found = findStop(sh.uid);
  if (!found) return `<div class="sheet-body"><div class="empty">장소를 찾을 수 없어요.</div></div>`;
  const { s, di, i } = found;
  const t = S.trip;
  const day = t.days[di];
  const wd = new Date(`${dayDate(t, di)}T00:00:00Z`).getUTCDay();
  const hoursToday = s.hours?.weekdayText?.[(wd + 6) % 7];
  const modes = [['AUTO', '자동'], ['WALK', '도보'], ['TRANSIT', '대중교통'], ['DRIVE', '택시']];
  return `
  <div class="sheet-head">
    <div class="sh-title"><span class="stop-num" style="--c:${color(di)}">${i + 1}</span><b>${esc(s.name)}</b></div>
    <button class="icon-btn" data-action="close-sheet" aria-label="닫기">${ICON.close}</button>
  </div>
  <div class="sheet-body">
    ${photoOf(s) ? `<div class="hero"><img src="${esc(photoOf(s))}" alt="">${s.photoAttr ? `<small>${esc(s.photoAttr)}</small>` : ''}</div>` : ''}
    <div class="r-meta">${ratingHTML(s)} ${placeMeta(s)}</div>
    <div class="muted small">${esc(s.address)}</div>
    ${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}
    ${hoursToday ? `<p class="small"><b>이 날 영업시간</b> · ${esc(hoursToday)}</p>` : s.demo ? '<p class="small muted">데모 장소라 영업시간 정보가 없어요. Google 지도에서 확인해 주세요.</p>' : ''}
    <div class="field"><label>머무는 시간</label>
      <div class="stay big">
        <button data-action="stay" data-uid="${esc(s.uid)}" data-d="-15">−15분</button><span>${fmtDur(s.stay)}</span><button data-action="stay" data-uid="${esc(s.uid)}" data-d="15">+15분</button>
      </div>
    </div>
    <div class="field"><label>여기까지 이동수단</label>
      <div class="seg">${modes.map(([m, l]) => `<button class="${s.mode === m ? 'on' : ''}" data-action="stop-mode" data-uid="${esc(s.uid)}" data-v="${m}">${l}</button>`).join('')}</div>
    </div>
    ${
      s.kind === 'food' || s.kind === 'cafe'
        ? `<div class="field"><label>식사로 지정</label><div class="seg">${[
            ['', '지정 안 함'],
            ['lunch', '점심'],
            ['dinner', '저녁'],
          ]
            .map(([m, l]) => `<button class="${(s.meal || '') === m ? 'on' : ''}" data-action="stop-meal" data-uid="${esc(s.uid)}" data-v="${m}">${l}</button>`)
            .join('')}</div></div>`
        : ''
    }
    <div class="field"><label>순서</label>
      <div class="seg">
        <button data-action="move" data-uid="${esc(s.uid)}" data-d="-1" ${i === 0 ? 'disabled' : ''}>▲ 앞으로</button>
        <button data-action="move" data-uid="${esc(s.uid)}" data-d="1" ${i === day.stops.length - 1 ? 'disabled' : ''}>▼ 뒤로</button>
      </div>
    </div>
    <div class="field"><label>다른 날로 옮기기</label>
      <div class="chips">${t.days
        .map((_, k) => `<button class="chip ${k === di ? 'on' : ''}" style="--c:${color(k)}" data-action="move-day" data-uid="${esc(s.uid)}" data-day="${k}" ${k === di ? 'disabled' : ''}>D${k + 1} ${dayLabel(t, k)}</button>`)
        .join('')}</div>
    </div>
    <div class="row-actions">
      <button class="btn" data-action="open-rec" data-tab="food" data-anchor="${s.uid}">🍜 근처 맛집</button>
      <button class="btn" data-action="open-rec" data-tab="cafe" data-anchor="${s.uid}">☕ 근처 카페</button>
      <a class="btn" href="${esc(placeUrl(s))}" target="_blank" rel="noopener">Google 지도 ↗</a>
    </div>
    <button class="btn btn-danger wide" data-action="remove-stop" data-uid="${esc(s.uid)}">일정에서 삭제</button>
  </div>`;
}

function keySectionHTML() {
  if (CFG.preview) return `<p class="hint">미리보기 페이지에서는 Google 지도를 연결할 수 없어요. API 키는 내 PC(localhost)나 팀 사이트에서만 입력하세요.</p>`;
  if (CFG.googleMapsApiKey)
    return `<div class="card key-card"><b>배포 설정의 키 사용 중</b><div class="muted small">config.js(배포 시 GitHub Secret으로 주입)에 등록된 키예요.</div></div>`;
  const k = S.settings.apiKey;
  if (k && !S.ui.editKey)
    return `<div class="card key-card">
      <div><b>저장된 키</b> <code>${esc(maskKey(k))}</code></div>
      <div class="muted small">${S.settings.rememberKey ? '이 기기 브라우저에 저장됨' : '이 탭을 닫으면 지워짐'}</div>
      <div class="row-actions">
        <button class="btn btn-sm" data-action="edit-key">키 바꾸기</button>
        <button class="btn btn-sm btn-danger" data-action="delete-key">키 삭제</button>
      </div>
    </div>`;
  return `<div class="field"><label for="apiKeyInput">Google Maps Platform API 키</label>
      <input id="apiKeyInput" type="password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" data-key-input placeholder="AIza로 시작하는 39자">
      <label class="check"><input type="checkbox" data-key-remember ${S.settings.rememberKey !== false ? 'checked' : ''}> 이 기기에 기억하기 <span class="muted">(끄면 탭을 닫을 때 삭제)</span></label>
    </div>
    <div class="row-actions">
      <button class="btn btn-primary" data-action="save-key">저장하고 연결</button>
      ${k ? `<button class="btn" data-action="cancel-key">취소</button>` : ''}
    </div>`;
}

function settingsHTML() {
  return `
  <div class="sheet-head"><b>설정</b><button class="icon-btn" data-action="close-sheet" aria-label="닫기">${ICON.close}</button></div>
  <div class="sheet-body">
    <div class="section-title">Google 지도 연결</div>
    ${providerBanner()}
    ${keySectionHTML()}
    <ul class="sec-notes">
      <li>키는 이 브라우저에만 저장되고, Google 지도 요청 외에는 어디로도 보내지 않아요. 일정 내보내기 파일에도 들어가지 않아요.</li>
      <li>브라우저에서 쓰는 키는 구조상 노출될 수 있어요. Google Cloud에서 <b>웹사이트 제한</b>과 <b>API 제한</b>을 꼭 걸어 주세요.</li>
      <li>공용 PC에서는 '이 기기에 기억하기'를 끄세요.</li>
    </ul>
    <div class="row-actions">
      ${isDemo() ? (CFG.googleMapsApiKey || S.settings.apiKey ? `<button class="btn" data-action="use-google">Google 모드로</button>` : '') : `<button class="btn" data-action="use-demo">데모 모드로</button>`}
    </div>

    <div class="section-title">여행 정보</div>
    <div class="row-actions">
      <button class="btn" data-action="edit-setup" data-step="1">기본 정보·시간</button>
      <button class="btn" data-action="edit-setup" data-step="2">숙소</button>
      <button class="btn" data-action="edit-setup" data-step="3">메인 스팟</button>
    </div>
    ${S.trip.created ? `<button class="btn wide" data-action="rebuild">메인 스팟 기준으로 일정 다시 배분</button>` : ''}

    <div class="section-title">공유·백업</div>
    <div class="row-actions">
      <button class="btn" data-action="share">텍스트로 공유</button>
      ${CFG.preview ? '' : `<button class="btn" data-action="export">파일 내보내기</button>`}
      <label class="btn">파일 불러오기<input type="file" accept="application/json,.json" data-import hidden></label>
    </div>
    <p class="hint">일행에게 파일을 보내면 각자 휴대폰에서 같은 일정을 불러올 수 있어요.</p>

    <div class="section-title">초기화</div>
    <div class="row-actions">
      <button class="btn" data-action="clear-routes">경로 캐시 비우기</button>
      <button class="btn btn-danger" data-action="reset">전체 초기화</button>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- 지도
let lastFit = '';
function renderMap(opts = {}) {
  if (!mapView?.map) return;
  const t = S.trip;
  const markers = [];
  const lines = [];
  const fitPts = [];
  if (t.hotel) {
    markers.push({ lat: t.hotel.lat, lng: t.hotel.lng, label: '🏨', style: 'hotel', title: t.hotel.name, z: 20 });
    fitPts.push(t.hotel);
  }

  if (S.ui.screen === 'setup') {
    t.mustSpots.forEach((m, i) => {
      markers.push({ lat: m.lat, lng: m.lng, label: i + 1, style: 'stop', color: '#334155', title: m.name, z: 30 });
      fitPts.push(m);
    });
    if (S.ui.step === 2 || S.ui.step === 3) {
      S.ui.search.results.forEach((p, i) => {
        markers.push({
          lat: p.lat,
          lng: p.lng,
          label: KIND[p.kind]?.icon || '📍',
          style: 'cand',
          title: p.name,
          z: 15,
          onClick: () => {
            const btn = document.querySelector(`[data-action="${S.ui.step === 2 ? 'pick-hotel' : 'add-must'}"][data-i="${i}"]`);
            btn?.closest('li')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          },
        });
        fitPts.push(p);
      });
    }
  } else {
    const days = S.ui.day === -1 ? t.days.map((_, i) => i) : [S.ui.day];
    const s = seg();
    for (const di of days) {
      const r = computeDay(t, di, s);
      const c = color(di);
      let prev = t.hotel;
      r.rows.forEach((row) => {
        if (prev && row.leg) lines.push(legLine(row.leg, prev, row.stop, c));
        prev = row.stop;
        const active = S.ui.focus === row.stop.uid;
        markers.push({
          lat: row.stop.lat,
          lng: row.stop.lng,
          label: S.ui.day === -1 ? `${di + 1}-${row.index + 1}` : row.index + 1,
          style: row.stop.kind === 'sight' ? 'stop' : `stop ${row.stop.kind}`,
          color: c,
          active,
          title: `${fmtTime(row.arrive)} ${row.stop.name}`,
          z: active ? 50 : 30,
          onClick: () => openStop(row.stop.uid, false),
        });
        fitPts.push(row.stop);
      });
      if (r.back && prev && t.hotel) lines.push(legLine(r.back, prev, t.hotel, c));
    }
    const sh = S.ui.sheet;
    if (sh?.type === 'rec' && S.ui.day >= 0) {
      for (const p of sh.results) {
        if (placeDay(p.id) != null) continue;
        const active = S.ui.focus === `cand:${p.id}`;
        markers.push({
          lat: p.lat,
          lng: p.lng,
          label: KIND[p.kind]?.icon || '📍',
          style: 'cand',
          active,
          title: p.name,
          z: active ? 60 : 15,
          onClick: () => focusCand(p.id, true),
        });
      }
    }
  }

  mapView.draw({ markers, lines });
  const key = `${S.ui.screen}|${S.ui.step}|${S.ui.day}|${fitPts.length}|${S.ui.sheet?.type === 'rec' ? S.ui.sheet.results.length : 0}`;
  if (opts.fit || key !== lastFit) {
    lastFit = key;
    const pts = [...fitPts];
    if (S.ui.sheet?.type === 'rec') pts.push(...S.ui.sheet.results);
    if (pts.length) mapView.fit(pts);
  }
}

function legLine(leg, a, b, c) {
  const path = leg.path && leg.path.length > 1 ? leg.path : [a, b];
  return {
    path,
    color: c,
    dashed: leg.estimated || leg.mode === 'WALK',
    weight: leg.mode === 'WALK' ? 4 : 5,
    opacity: leg.estimated ? 0.6 : 0.9,
  };
}

// ---------------------------------------------------------------- 추천
function recCenters(sh) {
  const t = S.trip;
  const day = t.days[S.ui.day];
  if (sh.anchor === 'hotel' && t.hotel) return [t.hotel];
  if (sh.anchor !== 'route') {
    const s = day.stops.find((x) => x.uid === sh.anchor);
    if (s) return [s];
  }
  const pts = [t.hotel, ...day.stops].filter(Boolean);
  if (pts.length <= 4) return pts;
  // 동선을 고르게 대표하는 4개 지점
  return [0, 1, 2, 3].map((k) => pts[Math.round((k * (pts.length - 1)) / 3)]);
}

async function loadRec() {
  const sh = S.ui.sheet;
  if (!sh || sh.type !== 'rec' || sh.tab === 'search') return;
  const t = S.trip;
  const day = t.days[S.ui.day];
  const centers = recCenters(sh);
  if (!centers.length) {
    sh.results = [];
    sh.error = '숙소나 장소가 있어야 주변을 찾을 수 있어요.';
    render();
    return;
  }
  const single = sh.anchor !== 'route';
  const radius = sh.tab === 'sight' ? (single ? 1200 : 1500) : single ? 600 : 800;
  const keyword = sh.keyword && sh.keyword !== '전체' ? sh.keyword : '';
  const token = (sh.token = uid());
  sh.loading = true;
  sh.error = '';
  render();
  try {
    const provider = S.provider;
    const lists = await Promise.all(
      centers.map((c) => {
        const k = `${provider.name}|${sh.tab}|${c.lat.toFixed(3)},${c.lng.toFixed(3)}|${radius}|${keyword}`;
        if (!recCache.has(k)) recCache.set(k, provider.nearby(sh.tab, { lat: c.lat, lng: c.lng }, radius, keyword).catch((e) => {
          recCache.delete(k);
          throw e;
        }));
        return recCache.get(k);
      }),
    );
    if (sh.token !== token || S.ui.sheet !== sh) return;
    const seen = new Map();
    lists.flat().forEach((p) => {
      if (seen.has(p.id) || p.kind === 'hotel' || placeDay(p.id) != null) return;
      if (sh.tab === 'sight' && p.kind !== 'sight') return;
      if (sh.tab === 'food' && p.kind !== 'food') return;
      seen.set(p.id, p);
    });
    sh.results = scoreCandidates([...seen.values()], day, centers);
  } catch (e) {
    if (sh.token !== token) return;
    sh.results = [];
    sh.error = `추천을 불러오지 못했어요. (${e.message || e})`;
  }
  sh.loading = false;
  render();
}

function scoreCandidates(list, day, centers) {
  const t = S.trip;
  const e = est();
  const anchorPt = centers.length === 1 ? centers[0] : centroid(centers);
  return list.map((p) => {
    const ins = bestInsert(day.stops, t.hotel, p, e);
    const d = distKm(centers.length === 1 ? centers[0] : anchorPt, p);
    const nearest = Math.min(...centers.map((c) => distKm(c, p)));
    const quality = p.rating != null ? p.rating * Math.log10((p.ratingCount || 0) + 10) : 3;
    return {
      ...p,
      extra: ins.extra,
      distLabel: centers.length === 1 ? `기준점에서 ${fmtKm(d)}` : `동선에서 ${fmtKm(nearest)}`,
      score: quality - ins.extra / 15,
    };
  });
}

async function recSearch() {
  const sh = S.ui.sheet;
  const q = (sh.q || '').trim();
  if (!q) return;
  const day = S.trip.days[S.ui.day];
  const centers = [S.trip.hotel, ...day.stops].filter(Boolean);
  sh.loading = true;
  sh.error = '';
  render();
  try {
    const res = await S.provider.searchText(q, { near: centers.length ? centroid(centers) : undefined });
    sh.results = scoreCandidates(res.filter((p) => p.kind !== 'hotel'), day, centers.length ? centers : [{ lat: 35.6812, lng: 139.7671 }]);
  } catch (e) {
    sh.results = [];
    sh.error = `검색하지 못했어요. (${e.message || e})`;
  }
  sh.loading = false;
  sh.resetScroll = true;
  render({ fit: true });
}

function openRec(tab, { gap = null, anchor = null } = {}) {
  const t = S.trip;
  if (S.ui.day < 0) S.ui.day = 0;
  const r = computeDay(t, S.ui.day, seg());
  let a = anchor;
  let g = gap;
  if (!a) {
    if (tab === 'food') {
      const gg = r.gaps.find((x) => x.type === gap) || r.gaps[0];
      if (gg) {
        g = gg.type;
        a = gg.anchor === t.hotel || !gg.anchor ? 'hotel' : gg.anchor.uid;
      }
    }
    a = a || 'route';
  }
  if (tab !== 'food') g = null;
  S.ui.sheet = { type: 'rec', tab, anchor: a, gap: g, keyword: '', sort: 'score', results: [], loading: false, error: '', q: '', resetScroll: true };
  S.ui.focus = null;
  render();
  loadRec();
}

function focusCand(id, fromMap) {
  const sh = S.ui.sheet;
  const p = sh?.results.find((x) => x.id === id);
  if (!p) return;
  S.ui.focus = `cand:${id}`;
  renderSheet();
  renderMap();
  if (fromMap) document.getElementById(candDomId(id))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  else mapView.panTo(p, 15);
}

function addCandidate(id) {
  const sh = S.ui.sheet;
  const p = sh.results.find((x) => x.id === id);
  if (!p) return;
  const t = S.trip;
  const di = S.ui.day;
  const day = t.days[di];
  const r = computeDay(t, di, seg());
  const stop = makeStop(p);
  let index = null;
  if (stop.kind === 'food' && r.gaps.length) {
    const g = (sh.gap && r.gaps.find((x) => x.type === sh.gap)) || r.gaps.reduce((a, b) => (distKm(b.anchor || t.hotel, p) < distKm(a.anchor || t.hotel, p) ? b : a));
    index = g.index;
    stop.meal = g.type;
    stop.stay = t.mealMinutes;
    sh.gap = null;
  }
  if (index == null && stop.kind === 'cafe' && day.stops.length) {
    // 카페는 오후 중간(15시 전후) 휴식 자리를 우선
    const target = Math.min(Math.max(15 * 60, r.win.start + 90), r.win.end - 60);
    index = timedInsert(t, di, stop, target).index;
  }
  if (index == null) index = bestInsert(day.stops, t.hotel, stop, est()).index;
  day.stops.splice(index, 0, stop);
  save();
  S.ui.focus = stop.uid;
  const after = computeDay(t, di, seg());
  const msg = `D${di + 1} ${index + 1}번째에 추가${stop.meal ? ` (${MEAL_LABEL[stop.meal]})` : ''}${after.overflow ? ` · ⚠ ${fmtDur(after.overflow)} 초과` : ''}`;
  toast(msg, {
    label: '되돌리기',
    fn: () => {
      const f = findStop(stop.uid);
      if (f) S.trip.days[f.di].stops.splice(f.i, 1);
      save();
      render();
    },
  });
  render();
}

function openStop(u, pan = true) {
  const f = findStop(u);
  if (!f) return;
  S.ui.sheet = { type: 'stop', uid: u, resetScroll: true };
  S.ui.focus = u;
  if (S.ui.day !== -1 && S.ui.day !== f.di) S.ui.day = f.di;
  render();
  if (pan) mapView.panTo(f.s, 15);
}

// ---------------------------------------------------------------- 설정 단계 동작
async function doSearch(target) {
  const input = document.querySelector(`[data-search="${target}"]`);
  const q = (input?.value || '').trim();
  S.ui.search = { q, results: [], loading: !!q, error: '' };
  render();
  if (!q) return;
  try {
    const res = await S.provider.searchText(q, { kind: target === 'hotel' ? 'hotel' : undefined });
    S.ui.search.results = target === 'hotel' ? res.map((p) => ({ ...p, kind: 'hotel' })) : res;
  } catch (e) {
    S.ui.search.error = `검색하지 못했어요. (${e.message || e})`;
  }
  S.ui.search.loading = false;
  render({ fit: true });
}

function addMust(p) {
  if (S.trip.mustSpots.some((m) => m.id === p.id)) return;
  const kind = p.kind === 'hotel' ? 'sight' : p.kind;
  S.trip.mustSpots.push(makeStop({ ...p, kind }, { must: true }));
  save();
}

async function quickSpot(q) {
  try {
    const res = await S.provider.searchText(q, {});
    if (!res.length) return toast(`'${q}'을(를) 찾지 못했어요.`);
    addMust(res[0]);
    toast(`${res[0].name} 추가`);
  } catch (e) {
    toast(`검색 실패: ${e.message || e}`);
  }
  render({ fit: true });
}

function build() {
  const t = S.trip;
  ensureDays(t);
  const spots = t.mustSpots.map((m) => ({ ...m, uid: uid() }));
  t.days = autoDistribute(t, spots).map((stops) => ({ ...emptyDay(), stops }));
  t.created = true;
  save();
  S.ui.screen = 'plan';
  S.ui.day = 0;
  S.ui.sheet = null;
  S.ui.search = { q: '', results: [], loading: false, error: '' };
  render({ fit: true, resetScroll: true });
  toast(t.mustSpots.length ? `메인 스팟 ${t.mustSpots.length}곳을 ${t.days.filter((d) => d.stops.length).length}일에 나눴어요` : '빈 일정을 만들었어요. 추천으로 채워 보세요');
}

// 일정 생성 후 설정을 고쳤을 때: 기존 일정은 유지하고 새/삭제된 메인 스팟만 반영
function saveSetup() {
  const t = S.trip;
  ensureDays(t);
  const ids = new Set(t.mustSpots.map((m) => m.id));
  t.days.forEach((d) => (d.stops = d.stops.filter((s) => !s.must || ids.has(s.id))));
  const e = est();
  for (const m of t.mustSpots) {
    if (placeDay(m.id) != null) continue;
    let best = null;
    t.days.forEach((d, di) => {
      const ins = bestInsert(d.stops, t.hotel, m, e);
      const free = dayCapacity(t, di) - d.stops.reduce((s, x) => s + x.stay, 0) - m.stay;
      const score = ins.extra + (free < 0 ? 600 : 0);
      if (!best || score < best.score) best = { di, index: ins.index, score };
    });
    t.days[best.di].stops.splice(best.index, 0, { ...m, uid: uid() });
  }
  save();
  S.ui.screen = 'plan';
  S.ui.search = { q: '', results: [], loading: false, error: '' };
  render({ fit: true, resetScroll: true });
  toast('변경 사항을 반영했어요');
}

// ---------------------------------------------------------------- 공유
function itineraryText() {
  const t = S.trip;
  const s = seg();
  const out = [`[도쿄 ${t.nights}박 ${t.nights + 1}일] ${dayLabel(t, 0)} ~ ${dayLabel(t, t.nights)} · ${t.people}명`];
  if (t.hotel) out.push(`숙소: ${t.hotel.name}`);
  t.days.forEach((d, di) => {
    const r = computeDay(t, di, s);
    out.push('', `■ D${di + 1} ${dayLabel(t, di)}`);
    if (t.hotel) out.push(`${fmtTime(r.win.start)} 숙소 출발`);
    r.rows.forEach((row) => {
      const leg = row.leg ? ` (${MODES[row.leg.mode].label} ${fmtDur(row.leg.min)})` : '';
      out.push(`${fmtTime(row.arrive)}-${fmtTime(row.depart)} ${row.stop.name}${row.stop.meal ? ` [${MEAL_LABEL[row.stop.meal]}]` : ''}${leg}`);
    });
    if (r.back) out.push(`${fmtTime(r.end)} 숙소 복귀`);
    if (!r.rows.length) out.push('(일정 없음)');
  });
  return out.join('\n');
}

async function share() {
  const text = itineraryText();
  try {
    if (navigator.share && !CFG.preview) {
      await navigator.share({ title: '도쿄 여행 일정', text });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('일정을 클립보드에 복사했어요');
  } catch {
    toast('복사하지 못했어요. 브라우저 권한을 확인해 주세요');
  }
}

function exportFile() {
  const blob = new Blob([JSON.stringify(S.trip, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tokyo-trip-${S.trip.startDate}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------- 이벤트
const actions = {
  'toast-action': () => {
    const el = $('#toast');
    el.hidden = true;
    el._action?.();
  },
  'toggle-map': () => {
    S.ui.mapBig = !S.ui.mapBig;
    $('.app').classList.toggle('map-big', S.ui.mapBig);
    setTimeout(() => mapView.resize(), 260);
  },
  'goto-step': (d) => {
    const n = Number(d.step);
    if (n > 2 && !S.trip.hotel) return toast('숙소를 먼저 선택해 주세요');
    S.ui.step = n;
    S.ui.search = { q: '', results: [], loading: false, error: '' };
    render({ resetScroll: true });
  },
  set: (d) => {
    const num = ['walkLimitKm', 'mealMinutes'].includes(d.field);
    S.trip[d.field] = num ? Number(d.value) : d.value;
    save();
    render();
  },
  people: (d) => {
    S.trip.people = Math.min(20, Math.max(1, S.trip.people + Number(d.d)));
    save();
    render();
  },
  search: (d) => doSearch(d.target),
  'pick-hotel': (d) => {
    const p = S.ui.search.results[Number(d.i)];
    S.trip.hotel = { ...p, kind: 'hotel' };
    save();
    render({ fit: true });
    toast(`숙소: ${p.name}`);
  },
  'add-must': (d) => {
    addMust(S.ui.search.results[Number(d.i)]);
    render();
  },
  'quick-spot': (d) => quickSpot(d.q),
  'must-stay': (d) => {
    const m = S.trip.mustSpots[Number(d.i)];
    m.stay = Math.max(15, m.stay + Number(d.d));
    save();
    render();
  },
  'remove-must': (d) => {
    S.trip.mustSpots.splice(Number(d.i), 1);
    save();
    render();
  },
  build,
  'save-setup': saveSetup,
  'close-setup': () => {
    S.ui.screen = 'plan';
    render({ fit: true, resetScroll: true });
  },
  'edit-setup': (d) => {
    S.ui.screen = 'setup';
    S.ui.step = Number(d.step || 1);
    S.ui.sheet = null;
    S.ui.search = { q: '', results: [], loading: false, error: '' };
    render({ fit: true, resetScroll: true });
  },
  day: (d) => {
    S.ui.day = Number(d.day);
    S.ui.sheet = null;
    S.ui.focus = null;
    render({ fit: true, resetScroll: true });
  },
  stay: (d) => {
    const f = findStop(d.uid);
    if (!f) return;
    f.s.stay = Math.max(15, f.s.stay + Number(d.d));
    save();
    render();
  },
  'cycle-mode': (d) => {
    const order = ['AUTO', 'WALK', 'TRANSIT', 'DRIVE'];
    const [type, ref] = d.ref.split(':');
    const next = (m) => order[(order.indexOf(m || 'AUTO') + 1) % order.length];
    let now;
    if (type === 'back') {
      const day = S.trip.days[Number(ref)];
      day.returnMode = now = next(day.returnMode);
    } else {
      const f = findStop(ref);
      if (!f) return;
      f.s.mode = now = next(f.s.mode);
    }
    save();
    render();
    toast(now === 'AUTO' ? '이동수단: 자동(거리 기준)' : `이동수단: ${MODES[now].label}`);
  },
  'skip-meal': (d) => {
    const day = S.trip.days[S.ui.day];
    day.skipMeals = [...new Set([...(day.skipMeals || []), d.meal])];
    save();
    render();
    toast(`이 날 ${MEAL_LABEL[d.meal]}은 비워 둘게요`, {
      label: '되돌리기',
      fn: () => {
        day.skipMeals = day.skipMeals.filter((m) => m !== d.meal);
        save();
        render();
      },
    });
  },
  optimize: () => {
    const di = S.ui.day;
    const day = S.trip.days[di];
    const before = day.stops.slice();
    const t0 = computeDay(S.trip, di, seg()).totals.travel;
    day.stops = optimizeDay(S.trip, di);
    const t1 = computeDay(S.trip, di, seg()).totals.travel;
    save();
    render({ fit: true });
    toast(t1 < t0 ? `이동시간 약 ${fmtDur(t0 - t1)} 줄였어요` : '이미 효율적인 동선이에요', {
      label: '되돌리기',
      fn: () => {
        day.stops = before;
        save();
        render();
      },
    });
  },
  'open-rec': (d) => openRec(d.tab, { gap: d.gap || null, anchor: d.anchor || null }),
  'rec-tab': (d) => openRec(d.tab),
  'rec-anchor': (d) => {
    S.ui.sheet.anchor = d.v;
    S.ui.sheet.gap = null;
    S.ui.sheet.resetScroll = true;
    loadRec();
  },
  'rec-keyword': (d) => {
    S.ui.sheet.keyword = d.v;
    S.ui.sheet.resetScroll = true;
    loadRec();
  },
  'rec-sort': (d) => {
    S.ui.sheet.sort = d.value;
    S.ui.sheet.resetScroll = true;
    renderSheet();
  },
  'rec-search': () => {
    S.ui.sheet.q = $('[data-search="rec"]')?.value || '';
    recSearch();
  },
  'focus-cand': (d) => focusCand(d.id, false),
  'add-cand': (d) => addCandidate(d.id),
  'open-stop': (d) => openStop(d.uid),
  'stop-mode': (d) => {
    findStop(d.uid).s.mode = d.v;
    save();
    render();
  },
  'stop-meal': (d) => {
    const f = findStop(d.uid);
    f.s.meal = d.v || null;
    if (f.s.meal) f.s.stay = Math.max(f.s.stay, S.trip.mealMinutes);
    save();
    render();
  },
  move: (d) => {
    const f = findStop(d.uid);
    const list = S.trip.days[f.di].stops;
    const j = f.i + Number(d.d);
    if (j < 0 || j >= list.length) return;
    [list[f.i], list[j]] = [list[j], list[f.i]];
    save();
    render();
  },
  'move-day': (d) => {
    const f = findStop(d.uid);
    const to = Number(d.day);
    S.trip.days[f.di].stops.splice(f.i, 1);
    const target = S.trip.days[to];
    f.s.meal = null;
    target.stops.splice(bestInsert(target.stops, S.trip.hotel, f.s, est()).index, 0, f.s);
    save();
    S.ui.sheet = null;
    render();
    toast(`D${to + 1}(으)로 옮겼어요`, { label: '보기', fn: () => actions.day({ day: to }) });
  },
  'remove-stop': (d) => {
    const f = findStop(d.uid);
    S.trip.days[f.di].stops.splice(f.i, 1);
    save();
    S.ui.sheet = null;
    render();
    toast(`${f.s.name} 삭제`, {
      label: '되돌리기',
      fn: () => {
        S.trip.days[f.di].stops.splice(f.i, 0, f.s);
        save();
        render();
      },
    });
  },
  'close-sheet': () => {
    S.ui.sheet = null;
    S.ui.focus = null;
    render();
  },
  'open-settings': () => {
    S.ui.editKey = false;
    S.ui.sheet = { type: 'settings', resetScroll: true };
    render();
  },
  'save-key': async () => {
    const input = $('[data-key-input]');
    const v = (input?.value || '').trim();
    if (input) input.value = '';
    if (!v) return toast('API 키를 입력해 주세요');
    if (!isLikelyApiKey(v)) return toast('키 형식이 맞지 않아요. AIza로 시작하는 39자 키를 붙여 넣어 주세요');
    const remember = !!$('[data-key-remember]')?.checked;
    const hadOther = !!window.google?.maps && v !== S.settings.apiKey;
    S.settings = { ...S.settings, apiKey: v, rememberKey: remember, preferDemo: false };
    saveSettings(S.settings);
    S.ui.editKey = false;
    if (hadOther) {
      // 이미 다른 키로 Google 스크립트를 불러온 상태라 새 키는 새로고침 후 적용된다
      toast('새 키를 적용하려고 새로고침할게요');
      setTimeout(() => location.reload(), 900);
      return;
    }
    S.ui.sheet = null;
    await connect();
  },
  'edit-key': () => {
    S.ui.editKey = true;
    renderSheet();
  },
  'cancel-key': () => {
    S.ui.editKey = false;
    renderSheet();
  },
  'delete-key': async () => {
    if (!(await ask('저장된 API 키를 이 기기에서 삭제할까요?', '키 삭제', true))) return;
    S.settings = { ...S.settings, apiKey: '' };
    saveSettings(S.settings);
    S.ui.editKey = false;
    if (window.google?.maps) {
      // 메모리에 남은 Google 스크립트까지 비우려면 새로고침이 필요하다
      toast('키를 삭제했어요. 새로고침할게요');
      setTimeout(() => location.reload(), 900);
      return;
    }
    toast('키를 삭제했어요');
    await useDemo();
    render();
  },
  'use-google': async () => {
    S.settings.preferDemo = false;
    saveSettings(S.settings);
    S.ui.sheet = null;
    await connect();
  },
  'use-demo': async () => {
    S.settings.preferDemo = true;
    saveSettings(S.settings);
    S.providerError = '';
    S.ui.sheet = null;
    await useDemo();
    render({ fit: true });
  },
  rebuild: async () => {
    if (!(await ask('지금 일정(추가한 맛집·카페 포함)을 지우고 메인 스팟 기준으로 다시 나눌까요?', '다시 배분', true))) return;
    build();
  },
  share,
  export: exportFile,
  'clear-routes': () => {
    routes.clear();
    render();
    toast('경로 캐시를 비웠어요');
  },
  reset: async () => {
    if (!(await ask('모든 일정을 지우고 처음부터 다시 만들까요? (API 키는 유지돼요)', '전체 초기화', true))) return;
    S.trip = ensureDays(defaultTrip());
    save();
    S.ui = { ...S.ui, screen: 'setup', step: 1, day: 0, sheet: null, focus: null, search: { q: '', results: [], loading: false, error: '' } };
    render({ fit: true, resetScroll: true });
  },
};

function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn({ ...el.dataset });
}

function onChange(e) {
  const el = e.target;
  if (el.matches('[data-field]')) {
    let v = el.value;
    if (!v) return render();
    if (el.dataset.type === 'num') v = Number(v);
    S.trip[el.dataset.field] = v;
    if (el.dataset.field === 'nights') ensureDays(S.trip);
    save();
    render();
  } else if (el.matches('[data-import]')) {
    const file = el.files?.[0];
    if (!file) return;
    file
      .text()
      .then((txt) => {
        S.trip = validateImported(JSON.parse(txt));
        save();
        S.ui.sheet = null;
        S.ui.screen = S.trip.created ? 'plan' : 'setup';
        S.ui.day = 0;
        render({ fit: true, resetScroll: true });
        toast('일정을 불러왔어요');
      })
      .catch((err) => toast(err.message || '파일을 읽지 못했어요'));
  }
}

function onKey(e) {
  if (e.key !== 'Enter') return;
  const el = e.target;
  if (!el.matches('[data-search]')) return;
  e.preventDefault();
  if (el.dataset.search === 'rec') actions['rec-search']();
  else doSearch(el.dataset.search);
}

// ---------------------------------------------------------------- 시작
function mount() {
  document.getElementById('app').innerHTML = `
  <div class="app">
    <div class="map-wrap">
      <div id="map" aria-label="여행 지도"></div>
      <div id="modeBadge" class="mode-badge"></div>
      <button class="map-toggle" data-action="toggle-map" aria-label="지도 크게 보기">${ICON.expand}</button>
    </div>
    <div class="panel-wrap">
      <main id="panel" class="panel"></main>
      <aside id="sheet" class="sheet" aria-live="polite"></aside>
    </div>
    <div id="toast" class="toast" role="status" hidden></div>
    <div id="dialog" class="dlg-backdrop" hidden></div>
  </div>`;
  mapView = new MapView(document.getElementById('map'));
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onKey);
  routes.onChange = () => render();
  window.addEventListener('gm-auth-failure', async () => {
    S.providerError = 'API 키 인증에 실패했어요. 키 값, 결제 계정 연결, 사용 API(Maps JavaScript·Places (New)·Routes), 웹사이트 제한(리퍼러)을 확인해 주세요.';
    await useDemo();
    render({ fit: true });
  });
  render();
  connect();
}

mount();
