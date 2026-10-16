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
  classifyPlace,
  bestInsert,
  timedInsert,
  estimator,
  estimateSeg,
  fmtTime,
  fmtDur,
  toMin,
  PACE,
  MEAL_LABEL,
  MEAL_TYPES,
  AIRPORTS,
  airportPoint,
  dayOrigin,
  minInsertIndex,
  budgetRadius,
  budgetLabel,
} from './planner.js';
import { MODES, distKm, fmtKm, centroid } from './geo.js';
import {
  loadTrip,
  saveTrip,
  loadSettings,
  saveSettings,
  ensureDays,
  syncTrip,
  tripNights,
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
const STEP_TITLES = ['', '항공편·기본 정보', '숙소', '가고 싶은 메인 스팟', '하루 시간·식사'];
const STEP_SHORT = ['', '항공·기본', '숙소', '메인 스팟', '시간·식사'];

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
const save = () => saveTrip(syncTrip(S.trip));
const getPath = (o, path) => path.split('.').reduce((v, k) => v?.[k], o);
function setPath(o, path, v) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((x, k) => x[k], o)[last] = v;
}
const NUM_FIELDS = ['walkLimitKm', 'mealMinutes', 'immigrationMin', 'airportBufferMin', 'restMin', 'mealTolerance', 'nights'];
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

// ---------------------------------------------------------------- 오류 안내
// Google Cloud 설정 문제(API 미사용·키 제한·결제)를 알아보기 쉬운 한국어 안내와 해결 링크로 바꾼다
function explainError(e, prefix) {
  const raw = String(e?.message || e || '');
  const project = raw.match(/project[=\s]+(\d{6,})/i)?.[1];
  const q = project ? `?project=${project}` : '';
  const api = /routes/i.test(raw) ? { name: 'Routes API', svc: 'routes.googleapis.com' } : { name: 'Places API (New)', svc: 'places.googleapis.com' };
  if (/has not been used in project|it is disabled|SERVICE_DISABLED/i.test(raw))
    return {
      msg: `Google Cloud에서 ${api.name}가 꺼져 있어요. '사용'을 누른 뒤 5~10분 기다렸다가 새로고침해 주세요.`,
      link: `https://console.cloud.google.com/apis/library/${api.svc}${q}`,
      label: `${api.name} 켜러 가기`,
    };
  if (/API_KEY_SERVICE_BLOCKED|not authorized to use this (service|API)|are blocked/i.test(raw))
    return {
      msg: `API 키의 'API 제한사항'에 ${api.name}가 빠져 있어요. 키 수정 화면에서 체크하고 저장해 주세요.`,
      link: `https://console.cloud.google.com/apis/credentials${q}`,
      label: 'API 키 설정 열기',
    };
  if (/REFERRER|referer/i.test(raw))
    return {
      msg: `API 키의 웹사이트 제한에 이 주소(${location.origin}/*)가 없어요. 추가하고 저장해 주세요.`,
      link: `https://console.cloud.google.com/apis/credentials${q}`,
      label: 'API 키 설정 열기',
    };
  if (/BILLING/i.test(raw))
    return { msg: '이 프로젝트에 결제 계정이 연결되어 있지 않아요.', link: 'https://console.cloud.google.com/billing', label: '결제 설정 열기' };
  return { msg: `${prefix}. 잠시 후 다시 시도해 주세요.`, detail: raw.slice(0, 160) };
}

function errorHTML(err) {
  if (!err) return '';
  if (typeof err === 'string') return `<div class="empty err">${esc(err)}</div>`;
  return `<div class="err-box">
    <p>⚠ ${esc(err.msg)}</p>
    ${err.link ? `<a class="btn btn-sm" href="${esc(err.link)}" target="_blank" rel="noopener">${esc(err.label)} ↗</a>` : ''}
    ${err.detail ? `<small class="muted">${esc(err.detail)}</small>` : ''}
  </div>`;
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
  if (S.ui.flash) {
    // 옮긴 카드가 화면 안에 보이도록 하고 잠깐 강조
    panel.querySelector(`.stop[data-uid="${CSS.escape(S.ui.flash)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    S.ui.flash = null;
  }
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
  const datesOk = tripNights(t) >= 1;
  const canNext = (step !== 1 || datesOk) && (step !== 2 || t.hotel);
  const nextLabel = step === 1 && !datesOk ? '출발 날짜를 확인해 주세요' : step === 2 && !t.hotel ? '숙소를 선택해 주세요' : '다음';
  return `
  <div class="sticky-head">
  <header class="topbar">
    <div>
      <div class="eyebrow">${t.created ? '여행 설정 수정' : '여행 준비'} ${step}/4</div>
      <h1>${STEP_TITLES[step]}</h1>
    </div>
    ${t.created ? `<button class="btn btn-sm btn-primary" data-action="save-setup" ${datesOk ? '' : 'disabled'}>저장하고 일정 보기</button>` : `<button class="icon-btn" data-action="open-settings" aria-label="설정">${ICON.gear}</button>`}
  </header>
  <nav class="stepnav" aria-label="설정 단계">${[1, 2, 3, 4]
    .map((n) => `<button class="${n === step ? 'on' : n < step ? 'done' : ''}" data-action="goto-step" data-step="${n}" ${n === step ? 'aria-current="step"' : ''}><i>${n}</i>${STEP_SHORT[n]}</button>`)
    .join('')}</nav>
  </div>
  <section class="content">${body}</section>
  <footer class="action-bar">
    ${step > 1 ? `<button class="btn" data-action="goto-step" data-step="${step - 1}">이전</button>` : '<span></span>'}
    ${
      step < 4
        ? `<button class="btn btn-primary" data-action="goto-step" data-step="${step + 1}" ${canNext ? '' : 'disabled'}>${nextLabel}</button>`
        : t.created
          ? `<button class="btn btn-primary" data-action="save-setup" ${datesOk ? '' : 'disabled'}>변경 사항 저장</button>`
          : `<button class="btn btn-primary" data-action="build" ${t.hotel && datesOk ? '' : 'disabled'}>일정 자동 만들기 ✨</button>`
    }
  </footer>`;
}

function seg3(field, options, current) {
  return `<div class="seg">${options
    .map(([v, label]) => `<button class="${String(current) === String(v) ? 'on' : ''}" data-action="set" data-field="${field}" data-value="${v}">${label}</button>`)
    .join('')}</div>`;
}

const AIRPORT_OPTIONS = Object.values(AIRPORTS).map((a) => [a.code, a.name.replace(' 공항', '')]);

function flightCard(kind) {
  const t = S.trip;
  const f = t[kind];
  const arr = kind === 'arrival';
  return `<div class="card flight-card">
    <div class="fc-head">${arr ? '🛬 도쿄 도착' : '🛫 도쿄 출발'}</div>
    <div class="row2">
      <div class="field"><label for="${kind}-date">${arr ? '도착 날짜' : '출발 날짜'}</label><input id="${kind}-date" type="date" data-field="${kind}.date" value="${f.date}"></div>
      <div class="field"><label for="${kind}-time">${arr ? '도착 시간' : '출발 시간'}</label><input id="${kind}-time" type="time" data-field="${kind}.time" value="${f.time}" step="300"></div>
    </div>
    <div class="field"><label>${arr ? '도착 공항' : '출발 공항'}</label>${seg3(`${kind}.airport`, AIRPORT_OPTIONS, f.airport)}</div>
    ${
      arr
        ? `<div class="field"><label>입국 수속·짐 찾기 여유</label>${seg3('immigrationMin', [[0, '없음'], [30, '30분'], [60, '1시간'], [90, '1시간 30분']], t.immigrationMin)}
           <p class="hint">비행기 착륙 시간을 넣었다면 1시간을 권장해요. 공항을 나서는 시간을 넣었다면 '없음'.</p></div>`
        : `<div class="field"><label>공항 도착 여유 (이륙 전)</label>${seg3('airportBufferMin', [[90, '1시간 30분'], [120, '2시간'], [150, '2시간 30분'], [180, '3시간']], t.airportBufferMin)}</div>`
    }
  </div>`;
}

function setupStep1() {
  const t = S.trip;
  const n = tripNights(t);
  return `
  ${providerBanner()}
  ${flightCard('arrival')}
  ${flightCard('departure')}
  ${
    n >= 1
      ? `<div class="trip-sum">🗓 <b>${t.nights}박 ${t.nights + 1}일</b> · ${dayLabel(t, 0)} ${t.arrival.time} 도착 → ${dayLabel(t, t.nights)} ${t.departure.time} 출발${n > 9 ? ' <span class="muted">(최대 9박까지 계획해요)</span>' : ''}</div>`
      : `<div class="banner banner-err">출발 날짜가 도착 날짜보다 뒤여야 해요.</div>`
  }
  <div class="row2">
    <div class="field">
      <label>인원</label>
      <div class="stepper">
        <button data-action="people" data-d="-1" aria-label="인원 줄이기">−</button>
        <b>${t.people}명</b>
        <button data-action="people" data-d="1" aria-label="인원 늘리기">＋</button>
      </div>
    </div>
    <div class="field">
      <label>도보 최대 거리</label>
      ${seg3('walkLimitKm', [[0.5, '500m'], [1, '1km'], [1.5, '1.5km']], t.walkLimitKm)}
    </div>
  </div>
  <div class="field">
    <label>기본 이동수단</label>
    ${seg3('baseMode', [['TRANSIT', '🚇 대중교통 위주'], ['DRIVE', '🚕 택시 위주']], t.baseMode)}
    <p class="hint">도보 최대 거리 안은 자동으로 걸어서 계산해요. 공항 이동을 포함해 구간마다 따로 바꿀 수 있어요.</p>
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
  if (s.error) return errorHTML(s.error);
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
      : `<p class="lead">숙소를 기준으로 공항 이동과 매일 출발·복귀 동선을 계산해요.</p>`
  }
  <div class="row2">
    ${timeField('체크인', 'checkIn')}
    ${timeField('체크아웃', 'checkOut')}
  </div>
  <div class="field">
    <label>첫날 숙소 도착 후 쉬는 시간</label>
    ${seg3('restMin', [[0, '바로 출발'], [15, '15분'], [30, '30분'], [60, '1시간']], S.trip.restMin)}
    <p class="hint">공항→숙소 이동시간은 자동으로 계산해요. 체크인 전에 도착하면 짐을 맡기고 쉬는 시간으로 잡아요.</p>
  </div>
  <div class="section-title">숙소 검색</div>
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
  const addedCount = QUICK_SPOTS.filter(quickAdded).length;
  const total = t.mustSpots.reduce((s, m) => s + m.stay, 0);
  const cap = t.days.reduce((s, _, i) => s + dayCapacity(t, i), 0);
  return `
  <p class="lead">꼭 가고 싶은 곳을 넣으면 가까운 곳끼리 묶어 날짜별로 나눠 드려요.</p>
  <div class="searchbox">
    <input type="search" placeholder="장소 검색 (예: 센소지, 팀랩)" data-search="must" value="${esc(S.ui.search.q)}" enterkeyhint="search">
    <button class="btn btn-primary" data-action="search" data-target="must">검색</button>
  </div>
  ${resultsHTML('must')}
  <div class="chips-label">인기 스팟 빠르게 추가 <span class="muted">${addedCount ? `· ${addedCount}곳 추가됨 (다시 누르면 빠져요)` : '· 누르면 추가돼요'}</span></div>
  <div class="chips">${QUICK_SPOTS.map((q) => {
    const on = quickAdded(q);
    const busy = S.ui.quickBusy === q;
    return `<button class="chip quick ${on ? 'added' : ''}" data-action="quick-spot" data-q="${esc(q)}" aria-pressed="${on}" ${busy ? 'disabled' : ''}>${busy ? '<span class="spinner sm"></span>' : on ? '✓' : '＋'} ${esc(q)}</button>`;
  }).join('')}</div>
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

function timeField(label, field, hint = '', disabled = false) {
  const id = `f-${field.replace('.', '-')}`;
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="time" data-field="${field}" value="${getPath(S.trip, field)}" step="300" ${disabled ? 'disabled' : ''}>${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
}

function setupStep4() {
  const t = S.trip;
  const bars = t.days
    .map((_, i) => {
      const w = dayWindow(t, i);
      const cap = dayCapacity(t, i);
      const label = i === 0 ? `✈ ${fmtTime(w.start)}–${fmtTime(w.end)}` : w.isDeparture && w.dep ? `${fmtTime(w.start)}–${fmtTime(w.rawEnd)} ✈` : `${fmtTime(w.start)}–${fmtTime(w.end)}`;
      return `<div class="cap-row"><span class="cap-day" style="--c:${color(i)}">D${i + 1}</span><span class="cap-date">${dayLabel(t, i)}</span><span class="cap-bar"><i style="width:${Math.min(100, (cap / 720) * 100)}%;background:${color(i)}"></i></span><span class="cap-txt">${label}</span></div>`;
    })
    .join('');
  return `
  <div class="row2">
    ${timeField('일정 시작', 'dayStart', '매일 숙소에서 출발')}
    ${timeField('일정 마무리', 'dayEnd', '숙소 복귀 목표')}
  </div>
  <div class="section-title">식사 시간</div>
  <div class="card meal-card">
    <div class="meal-row">
      ${timeField('아침', 'breakfast', '', !t.breakfastOn)}
      <label class="check"><input type="checkbox" data-field="breakfastOn" data-type="bool-inv" ${t.breakfastOn ? '' : 'checked'}> 아침 건너뛰기</label>
    </div>
    <div class="row2">
      ${timeField('점심', 'lunch')}
      ${timeField('저녁', 'dinner')}
    </div>
  </div>
  <div class="field">
    <label>식사 1회 소요 (${t.people}명 기준)</label>
    ${seg3('mealMinutes', [[60, '60분'], [75, '75분'], [90, '90분'], [120, '120분']], t.mealMinutes)}
  </div>
  <div class="field">
    <label>식사시간 오차범위</label>
    ${seg3('mealTolerance', [[10, '10분'], [30, '30분'], [60, '1시간'], [120, '2시간']], t.mealTolerance)}
    <p class="hint">목표 시각에 가장 가까운 빈 시간에 식사 자리를 잡아요. 오차범위 안에서 남는 시간만큼 더 먼 맛집까지 추천해요. 예) 점심 12:00·오차 1시간인데 12:30에 자리가 나면 30분 안에 갈 수 있는 곳까지 찾아요.</p>
  </div>
  <div class="section-title">날짜별 관광 가용 시간 <span class="muted">(공항 이동·식사 제외)</span></div>
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
      <button class="btn btn-sm" data-action="edit-setup" data-step="1" aria-label="여행 설정 수정">✎ 설정 수정</button>
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
      : S.ui.edit && t.days[di].stops.some((x) => !x.fixed)
        ? `<footer class="action-bar"><button class="btn btn-primary" data-action="edit-order">✓ 편집 완료</button></footer>`
        : ''
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
          <div class="dc-head"><b>D${i + 1}</b> <span>${dayLabel(t, i)}</span> <span class="muted">${i === 0 ? `✈ ${t.arrival.time} 도착` : r.dep ? `✈ ${t.departure.time} 출발` : `${fmtTime(r.win.start)}–${fmtTime(Math.max(r.end, r.win.start))}`}</span> ${warn}</div>
          <div class="dc-stops">${r.rows.some((x) => x.num) ? r.rows.filter((x) => x.num).map((x) => `<span><i>${x.num}</i>${esc(x.stop.name)}</span>`).join('') : '<span class="muted">비어 있음 — 눌러서 채우기</span>'}</div>
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

function legHTML(leg, from, to, ref, pref, di, compact = false) {
  if (!leg) return '';
  if (compact) return `<div class="leg compact" style="--c:${color(di)}"><span>${MODES[leg.mode].icon} ${leg.min ? fmtDur(leg.min) : '바로 옆'}</span></div>`;
  const lines = (leg.lines || [])
    .map((l) => `<span class="line-chip" style="${cssColor(l.color) ? `--lc:${cssColor(l.color)}` : ''}" title="${esc(l.from)} → ${esc(l.to)} (${l.stops}정거장)">${esc(l.name)}</span>`)
    .join('');
  const tag = leg.pending ? '<span class="spinner sm" title="경로 계산 중"></span>' : leg.estimated && isDemo() ? '<span class="tag">추정</span>' : leg.failed ? '<span class="tag tag-warn" title="Google 경로를 찾지 못해 직선거리로 추정했어요">추정</span>' : '';
  return `<div class="leg" style="--c:${color(di)}">
    <button class="leg-mode" data-action="cycle-mode" data-ref="${ref}">${modeLabel(leg, pref)}</button>
    <span class="leg-km">${leg.km ? fmtKm(leg.km) : ''}</span>${tag}
    ${lines ? `<span class="lines">${lines}</span>` : ''}
    <a class="leg-link" href="${dirUrl(from, to, leg.mode)}" target="_blank" rel="noopener" aria-label="Google 지도 길찾기">길찾기 ↗</a>
  </div>`;
}

function anchorName(a) {
  if (!a) return '현재 위치';
  if (a === S.trip.hotel || a.fixed === 'arrival') return '숙소';
  return a.name;
}

function gapHTML(g) {
  const late = g.dev === 0 ? '목표 시각' : `목표보다 ${fmtDur(Math.abs(g.dev))} ${g.dev > 0 ? '늦음' : '빠름'}`;
  return `<div class="gap">
    <div class="stop-time"><b>${fmtTime(g.at)}</b><small>${g.label}</small></div>
    <div class="gap-ico">🍽</div>
    <div class="gap-card">
      <button class="gap-main" data-action="open-rec" data-tab="food" data-gap="${g.type}">
        <b>${g.label} 식당 고르기 ›</b>
        <small>${esc(anchorName(g.anchor))}에서 ${g.budget <= 15 ? `도보 ${g.budget}분` : `${g.budget}분`} 이내 · <em class="${g.ok ? 'ok-txt' : 'warn-txt'}">${late}</em></small>
      </button>
      <button class="gap-skip" data-action="skip-meal" data-meal="${g.type}" aria-label="${g.label} 건너뛰기">건너뛰기</button>
    </div>
  </div>`;
}

function anchorHTML(time, icon, text, sub = '', cls = '') {
  return `<div class="anchor ${cls}"><span class="a-time">${fmtTime(time)}</span><span class="a-ico">${icon}</span><span>${text}${sub ? `<small class="muted"> · ${sub}</small>` : ''}</span></div>`;
}

function freeHTML(from, to, anchor) {
  const a = anchor?.uid && !anchor.fixed ? anchor.uid : anchor?.kind === 'airport' ? 'origin' : 'hotel';
  return `<div class="free">
    <span class="free-line"></span>
    <button data-action="open-rec" data-tab="sight" data-anchor="${a}">
      <span>⏳ ${fmtTime(from)}–${fmtTime(to)} <b>${fmtDur(to - from)} 비어 있음</b></span>
      <small>근처 추천 ›</small>
    </button>
  </div>`;
}

// 한 칸 위/아래로 옮길 수 있는지: 첫날 '숙소 도착' 앞으로는 식사만, 고정 자리는 움직이지 않는다
function moveability(day, i) {
  const s = day.stops[i];
  const prev = day.stops[i - 1];
  return { up: !s.fixed && i > 0 && (!prev?.fixed || !!s.meal), down: !s.fixed && i < day.stops.length - 1 };
}

function stopHTML(row, di, edit = false, day = null) {
  const s = row.stop;
  const classes = ['stop', S.ui.focus === s.uid ? 'is-active' : '', s.fixed ? 'is-fixed' : '', edit ? 'is-edit' : '', S.ui.flash === s.uid ? 'flash' : ''].join(' ');
  const name = s.fixed === 'arrival' ? '숙소 도착 · 짐 풀고 쉬기' : esc(s.name);
  const meta = s.fixed === 'arrival' ? esc(s.name) : `${s.must ? '<em class="badge">메인</em>' : ''}${s.meal ? `<em class="badge meal">${MEAL_LABEL[s.meal]}</em>` : ''}${ratingHTML(s)} ${placeMeta(s)}`;
  const head = `
    <div class="stop-time"><b>${fmtTime(row.arrive)}</b><small>~${fmtTime(row.depart)}</small></div>
    <div class="stop-num">${row.num ?? '🏨'}</div>`;
  if (!edit) {
    const quick = S.ui.quick === s.uid;
    const mv = quick ? moveability(day, row.index) : null;
    return `<div class="${classes} ${quick ? 'quick' : ''}" style="--c:${color(di)}" data-uid="${esc(s.uid)}">${head}
    <div class="stop-card">
      <button class="stop-body" data-action="open-stop" data-uid="${esc(s.uid)}">
        <span class="stop-name">${s.fixed ? '' : `${KIND[s.kind]?.icon || '📍'} `}${name}</span>
        <span class="stop-meta">${meta}</span>
        ${row.info ? `<span class="info">${esc(row.info)}</span>` : ''}
        ${row.warn ? `<span class="warn">⚠ ${esc(row.warn)}</span>` : ''}
      </button>
      ${
        quick
          ? `<div class="quick-bar" role="group" aria-label="${esc(s.name)} 순서 바꾸기">
        <button data-action="quick-move" data-d="-1" ${mv.up ? '' : 'disabled'} aria-label="한 칸 위로">‹ <small>위로</small></button>
        <button class="qb-cancel" data-action="quick-cancel">취소</button>
        <button data-action="quick-move" data-d="1" ${mv.down ? '' : 'disabled'} aria-label="한 칸 아래로"><small>아래로</small> ›</button>
      </div>`
          : ''
      }
    </div>
  </div>`;
  }
  // 편집 모드: 순서(▲▼)·머무는 시간·삭제
  const i = row.index;
  const { up: canUp, down: canDown } = moveability(day, i);
  const u = esc(s.uid);
  return `<div class="${classes}" style="--c:${color(di)}" data-uid="${u}">${head}
    <div class="stop-body edit-body">
      <span class="stop-name">${s.fixed ? '' : `${KIND[s.kind]?.icon || '📍'} `}${name}</span>
      <div class="edit-ctrl">
        <div class="stay mini" role="group" aria-label="머무는 시간">
          <button data-action="stay" data-uid="${u}" data-d="-15" aria-label="머무는 시간 15분 줄이기">−</button>
          <span>${fmtDur(s.stay)}</span>
          <button data-action="stay" data-uid="${u}" data-d="15" aria-label="머무는 시간 15분 늘리기">＋</button>
        </div>
        ${s.fixed ? '' : `<button class="del-btn" data-action="remove-stop" data-uid="${u}" aria-label="${esc(s.name)} 삭제">삭제</button>`}
      </div>
    </div>
    <div class="reorder">
      ${
        s.fixed
          ? '<span class="fixed-note">고정</span>'
          : `<button data-action="move" data-uid="${u}" data-d="-1" ${canUp ? '' : 'disabled'} aria-label="${esc(s.name)} 위로">▲</button>
             <button data-action="move" data-uid="${u}" data-d="1" ${canDown ? '' : 'disabled'} aria-label="${esc(s.name)} 아래로">▼</button>`
      }
    </div>
  </div>`;
}

function dayHTML(di) {
  const t = S.trip;
  const day = t.days[di];
  const r = computeDay(t, di, seg());
  const span = Math.max(1, r.win.end - r.win.start, r.end - r.win.start);
  const pct = (m) => `${Math.max(0, (m / span) * 100)}%`;
  const real = day.stops.filter((s) => !s.fixed);
  const sights = real.filter((s) => s.kind === 'sight').length;
  const foods = real.filter((s) => s.kind !== 'sight').length;
  const pending = r.rows.some((x) => x.leg?.pending) || r.back?.pending;
  const routeUrl = dayRouteUrl(di);
  const edit = S.ui.edit && real.length > 0;

  // 타임라인 조립
  const parts = [];
  if (r.win.isArrival && t.arrival) {
    parts.push(anchorHTML(r.win.start, '🛬', `${esc(r.origin.name)} 출발`, `${t.arrival.time} 도착${t.immigrationMin ? ` + 입국 수속 ${fmtDur(t.immigrationMin)}` : ''}`));
  } else if (t.hotel && (r.rows.length || !r.dep)) {
    // 첫 장소가 식사라 기다려야 하면 그만큼 늦게 출발
    const lateStart = r.rows[0]?.wait || 0;
    parts.push(anchorHTML(r.win.start + lateStart, '🏨', `${esc(t.hotel.name)} 출발`, r.dep ? `체크아웃 ${t.checkOut} · 짐은 숙소에 맡겨 두세요` : lateStart ? `${fmtTime(r.win.start)}부터 ${fmtDur(lateStart)} 여유` : ''));
  }
  let prev = r.origin;
  let free = r.win.start;
  const gapWithFree = (g) => {
    if (edit) return; // 편집 중엔 순서에 집중하도록 식사·빈 시간 카드를 숨긴다
    if (g.at - free >= 60) parts.push(freeHTML(free, g.at, g.anchor));
    parts.push(gapHTML(g));
    free = Math.max(free, g.at + t.mealMinutes);
  };
  r.rows.forEach((row, i) => {
    r.gaps.filter((g) => g.index === i).forEach(gapWithFree);
    // 식사 시각까지 기다리는 시간(첫 장소는 출발을 늦춘 것으로 표시)
    if (!edit && i > 0 && row.wait >= 30) parts.push(freeHTML(free, free + row.wait, prev));
    parts.push(legHTML(row.leg, prev, row.stop, `stop:${row.stop.uid}`, row.stop.mode, di, edit));
    parts.push(stopHTML(row, di, edit, day));
    prev = row.stop;
    free = row.depart;
  });
  const tailGaps = r.gaps.filter((g) => g.index >= r.rows.length);
  tailGaps.forEach(gapWithFree);
  const openTail = tailGaps.length > 0 || (r.rows.length && r.free >= 90);
  if (!edit && r.rows.length && r.free >= 90) parts.push(freeHTML(free, r.win.rawEnd - (r.back?.min || 0), prev));
  if (r.back) parts.push(legHTML(r.back, prev, t.hotel, `back:${di}`, day.returnMode, di, edit));
  const backLabel = r.dep ? '숙소 복귀 · 짐 찾기' : '숙소 복귀';
  if (t.hotel && r.back)
    parts.push(
      openTail
        ? anchorHTML(r.win.rawEnd, '🏨', `${backLabel} 목표`, `지금 일정대로면 ${fmtTime(r.end)} 복귀`, 'end')
        : anchorHTML(r.end, '🏨', backLabel, r.overflow ? `${r.dep ? '공항 출발' : '목표'} ${fmtTime(r.win.rawEnd)}보다 ${fmtDur(r.overflow)} 늦어요` : '', `end ${r.overflow ? 'over' : ''}`),
    );
  if (r.dep) {
    parts.push(anchorHTML(r.dep.leaveBy, '🧳', '공항으로 출발', '늦어도 이 시각에는 숙소를 나서야 해요', 'end'));
    parts.push(legHTML(r.dep.leg, t.hotel, r.dep.airport, 'airout', t.departure.mode, di, edit));
    parts.push(anchorHTML(r.dep.atAirport, '🛫', `${esc(r.dep.airport.name)} 도착`, `이륙 ${t.departure.time} · ${fmtDur(t.airportBufferMin)} 전`, 'end'));
  }

  const flow = [
    { n: 1, label: '이동 동선', done: real.length > 0, sub: real.length ? `${real.length}곳` : '비어 있음', action: '' },
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
        <div class="muted">${r.win.isArrival ? '✈ ' : ''}${fmtTime(r.win.start)} – ${fmtTime(r.win.rawEnd)}${r.dep ? ' ✈' : ''}</div>
      </div>
      <div class="timebar" aria-hidden="true">
        <i class="tb-travel" style="width:${pct(r.totals.travel)}"></i><i class="tb-sight" style="width:${pct(r.totals.sight)}"></i><i class="tb-meal" style="width:${pct(r.totals.meal)}"></i>${r.overflow ? `<i class="tb-over" style="width:${pct(r.overflow)}"></i>` : ''}
        <span class="tb-limit" style="left:${pct(r.win.end - r.win.start)}"></span>
      </div>
      <div class="sum-stats">
        <span><i class="lg lg-travel"></i>이동 ${fmtDur(r.totals.travel)}</span>
        <span><i class="lg lg-sight"></i>관광 ${fmtDur(r.totals.sight)}</span>
        <span><i class="lg lg-meal"></i>식사·카페 ${fmtDur(r.totals.meal)}</span>
        ${r.overflow ? `<span class="over">⚠ ${fmtDur(r.overflow)} 초과${r.dep ? ' · 비행기 시간 확인' : ''}</span>` : `<span class="ok">여유 ${fmtDur(r.free)}</span>`}
      </div>
      <div class="sum-actions">
        <button class="btn btn-sm ${edit ? 'btn-primary' : ''}" data-action="edit-order" ${real.length ? '' : 'disabled'}>${edit ? '✓ 편집 완료' : '↕ 순서·시간 편집'}</button>
        <button class="btn btn-sm" data-action="optimize" ${real.length < 2 ? 'disabled' : ''}>⇅ 자동 최적화</button>
        ${routeUrl && !edit ? `<a class="btn btn-sm" href="${routeUrl}" target="_blank" rel="noopener" aria-label="Google 지도로 하루 경로 보기">🗺 지도</a>` : ''}
        ${pending ? '<span class="muted small"><span class="spinner sm"></span> 실제 경로 계산 중</span>' : ''}
      </div>
    </div>
    ${edit ? `<div class="edit-hint">▲▼로 순서를 바꾸면 도착 시간과 이동 경로가 바로 다시 계산돼요.</div>` : ''}
    <ol class="flow" ${edit ? 'hidden' : ''}>${flow
      .map((f) => `<li class="${f.done ? 'done' : ''}"><button ${f.action || 'disabled'}><span class="fn">${f.done ? '✓' : f.n}</span><span><b>${f.label}</b><small>${f.sub}</small></span></button></li>`)
      .join('')}</ol>
    ${!t.hotel ? `<div class="banner banner-err">숙소가 없어 출발·복귀 동선을 계산할 수 없어요. <button class="link" data-action="edit-setup" data-step="2">숙소 설정</button></div>` : ''}
    <div class="timeline">${parts.join('')}</div>
    ${!edit && real.length >= 2 ? '<p class="lp-hint">💡 일정 카드를 꾹 누르면 바로 순서를 바꿀 수 있어요</p>' : ''}
    ${
      !real.length
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
  if (S.ui.day === 0 && t.arrival) opts.push(['origin', `✈ ${AIRPORTS[t.arrival.airport].name}`]);
  if (t.hotel) opts.push(['hotel', '🏨 숙소']);
  let n = 0;
  day.stops.forEach((s) => !s.fixed && opts.push([s.uid, `${++n}. ${s.name}`]));
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
  const gapNote = sh.gap
    ? `<div class="banner slim">🍽 <b>${MEAL_LABEL[sh.gap]} ${sh.gapAt != null ? fmtTime(sh.gapAt) : ''}</b> 자리 · ${esc(sh.anchorName || '')}에서 <b>${budgetLabel(sh.budget)}</b> 맛집을 보여 드려요. 고르면 그 시간에 바로 들어가요.${sh.note ? `<br>${esc(sh.note)}` : ''}</div>`
    : '';
  let list;
  if (sh.loading) list = `<div class="empty"><span class="spinner"></span> ${isDemo() ? '샘플에서 찾는 중…' : 'Google 지도에서 찾는 중…'}</div>`;
  else if (sh.error) list = errorHTML(sh.error);
  else if (!sh.results.length)
    list = `<div class="empty">${sh.tab === 'search' ? (sh.q ? '검색 결과가 없어요.' : '장소 이름을 검색해 이 날 일정에 넣을 수 있어요.') : '주변에서 찾은 곳이 없어요. 기준 위치를 바꿔 보세요.'}</div>`;
  else {
    const sorted = [...sh.results].sort((a, b) =>
      sh.sort === 'near' ? (sh.budget ? a.reach - b.reach : a.extra - b.extra) : sh.sort === 'rating' ? (b.rating || 0) - (a.rating || 0) : b.score - a.score,
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

// 상세 팝업(리뷰·AI 요약·메뉴)은 음식점·카페·술집에 연다
const hasDetail = (p) => p.kind === 'food' || p.kind === 'cafe';

function recItemHTML(p, sh) {
  const inDay = placeDay(p.id);
  const focus = S.ui.focus === `cand:${p.id}`;
  const detour = p.reachLabel || (p.extra <= 2 ? '동선에서 거의 안 벗어나요' : `이동 +${p.extra}분`);
  return `<li class="rec ${focus ? 'is-active' : ''}" id="${candDomId(p.id)}">
    ${photoOf(p) ? `<div class="thumb"><img src="${esc(photoOf(p))}" alt="" loading="lazy">${p.photoAttr ? `<small>${esc(p.photoAttr)}</small>` : ''}</div>` : `<div class="thumb ph">${KIND[p.kind]?.icon || '📍'}</div>`}
    <button class="rec-main" data-action="focus-cand" data-id="${esc(p.id)}">
      <span class="r-name">${esc(p.name)}</span>
      <span class="r-meta">${ratingHTML(p)} ${placeMeta(p)}</span>
      <span class="r-dist">${detour} · ${esc(p.distLabel)}</span>
      ${p.note ? `<span class="r-note">${esc(p.note)}</span>` : ''}
      ${focus && hasDetail(p) ? '<span class="r-hint">한 번 더 누르면 리뷰·AI 요약 ›</span>' : ''}
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
  const num = computeDay(t, di, seg()).rows.find((x) => x.stop === s)?.num;
  if (s.fixed === 'arrival') return arrivalSheetHTML(s, di, modes);
  return `
  <div class="sheet-head">
    <div class="sh-title"><span class="stop-num" style="--c:${color(di)}">${num ?? i + 1}</span><b>${esc(s.name)}</b></div>
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
            ...MEAL_TYPES,
          ]
            .map(([m, l]) => `<button class="${(s.meal || '') === m ? 'on' : ''}" data-action="stop-meal" data-uid="${esc(s.uid)}" data-v="${m}">${l}</button>`)
            .join('')}</div></div>`
        : ''
    }
    <div class="field"><label>순서</label>
      <div class="seg">
        <button data-action="move" data-uid="${esc(s.uid)}" data-d="-1" ${i === 0 || (!s.meal && i <= minInsertIndex(day)) ? 'disabled' : ''}>▲ 앞으로</button>
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

// 첫날 '숙소 도착' 자리: 쉬는 시간과 공항→숙소 이동수단만 바꾼다
function arrivalSheetHTML(s, di, modes) {
  const t = S.trip;
  return `
  <div class="sheet-head">
    <div class="sh-title"><span class="stop-num" style="--c:${color(di)}">🏨</span><b>숙소 도착 · 짐 풀고 쉬기</b></div>
    <button class="icon-btn" data-action="close-sheet" aria-label="닫기">${ICON.close}</button>
  </div>
  <div class="sheet-body">
    <p class="small"><b>${esc(s.name)}</b> · 체크인 ${t.checkIn} / 체크아웃 ${t.checkOut}</p>
    <div class="field"><label>쉬는 시간</label>
      <div class="stay big">
        <button data-action="stay" data-uid="${esc(s.uid)}" data-d="-15">−15분</button><span>${fmtDur(s.stay)}</span><button data-action="stay" data-uid="${esc(s.uid)}" data-d="15">+15분</button>
      </div>
    </div>
    <div class="field"><label>공항에서 숙소까지 이동수단</label>
      <div class="seg">${modes.map(([m, l]) => `<button class="${s.mode === m ? 'on' : ''}" data-action="stop-mode" data-uid="${esc(s.uid)}" data-v="${m}">${l}</button>`).join('')}</div>
    </div>
    <p class="hint">공항에서 먹고 갈 식당은 타임라인의 식사 자리에서 고르면 숙소 도착 앞에 들어가요. 체크인·쉬는 시간 기본값은 설정 수정 → 숙소에서 바꿀 수 있어요.</p>
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

  const airportMarker = (code, title) => {
    const a = airportPoint(code);
    markers.push({ lat: a.lat, lng: a.lng, label: '✈', style: 'hotel airport', title, z: 20 });
    fitPts.push(a);
  };
  if (S.ui.screen === 'setup') {
    if (S.ui.step === 1) {
      airportMarker(t.arrival.airport, `도착 · ${AIRPORTS[t.arrival.airport].name}`);
      if (t.departure.airport !== t.arrival.airport) airportMarker(t.departure.airport, `출발 · ${AIRPORTS[t.departure.airport].name}`);
    }
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
      let prev = r.origin;
      if (r.win.isArrival && t.arrival) airportMarker(t.arrival.airport, `${t.arrival.time} 도착 · ${r.origin.name}`);
      if (r.dep) {
        airportMarker(t.departure.airport, `${t.departure.time} 출발 · ${r.dep.airport.name}`);
        lines.push(legLine(r.dep.leg, t.hotel, r.dep.airport, c));
      }
      r.rows.forEach((row) => {
        if (prev && row.leg) lines.push(legLine(row.leg, prev, row.stop, c));
        prev = row.stop;
        if (row.stop.fixed) return;
        const active = S.ui.focus === row.stop.uid;
        markers.push({
          lat: row.stop.lat,
          lng: row.stop.lng,
          label: S.ui.day === -1 ? `${di + 1}-${row.num}` : row.num,
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
  if (sh.anchor === 'origin') return [dayOrigin(t, S.ui.day)].filter(Boolean);
  if (sh.anchor !== 'route') {
    const s = day.stops.find((x) => x.uid === sh.anchor);
    if (s) return [s];
  }
  const pts = [t.hotel, ...day.stops.filter((x) => !x.fixed)].filter(Boolean);
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
  const radius = sh.budget ? budgetRadius(sh.budget) : sh.tab === 'sight' ? (single ? 1200 : 1500) : single ? 600 : 800;
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
    let results = scoreCandidates([...seen.values()], day, centers);
    sh.note = '';
    if (sh.budget && centers.length === 1) {
      // 식사 자리에서 오차범위 안에 갈 수 있는 곳만(추정 이동시간 기준)
      const reachSeg = estimateSeg(t);
      results = results.map((p) => {
        const r = reachSeg(centers[0], p, 'AUTO');
        return { ...p, reach: r.min, reachLabel: `${MODES[r.mode].label} 약 ${r.min}분` };
      });
      const within = results.filter((p) => p.reach <= sh.budget);
      if (within.length) results = within;
      else {
        sh.note = `${sh.budget}분 안에 갈 수 있는 곳을 찾지 못해 가장 가까운 곳을 보여 드려요.`;
        results = results.sort((a, b) => a.reach - b.reach).slice(0, 5);
      }
    }
    sh.results = results;
  } catch (e) {
    if (sh.token !== token) return;
    sh.results = [];
    sh.error = explainError(e, '추천을 불러오지 못했어요');
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
    sh.error = explainError(e, '검색하지 못했어요');
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
  let g = null;
  if (!a && tab === 'food') {
    const gg = r.gaps.find((x) => x.type === gap) || r.gaps[0];
    if (gg) {
      g = gg;
      a = gg.anchor?.kind === 'airport' ? 'origin' : !gg.anchor || gg.anchor === t.hotel || gg.anchor.fixed ? 'hotel' : gg.anchor.uid;
    }
  }
  a = a || 'route';
  S.ui.sheet = {
    type: 'rec',
    tab,
    anchor: a,
    gap: g?.type || null,
    gapAt: g?.at ?? null,
    budget: g?.budget || null,
    anchorName: g ? anchorName(g.anchor) : '',
    keyword: '',
    sort: 'score',
    results: [],
    loading: false,
    error: '',
    q: '',
    resetScroll: true,
  };
  S.ui.focus = null;
  render();
  loadRec();
}

function focusCand(id, fromMap) {
  const sh = S.ui.sheet;
  const p = sh?.results.find((x) => x.id === id);
  if (!p) return;
  if (!fromMap && S.ui.focus === `cand:${id}` && hasDetail(p)) return openDetail(p);
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
    index = timedInsert(t, di, stop, target, minInsertIndex(day)).index;
  }
  if (index == null) index = Math.max(minInsertIndex(day), bestInsert(day.stops, t.hotel, stop, est()).index);
  day.stops.splice(index, 0, stop);
  save();
  S.ui.focus = stop.uid;
  const after = computeDay(t, di, seg());
  const row = after.rows.find((x) => x.stop === stop);
  const msg = `D${di + 1} ${row?.num ?? index + 1}번째에 추가${stop.meal ? ` (${MEAL_LABEL[stop.meal]} ${fmtTime(row.arrive)})` : ''}${after.overflow ? ` · ⚠ ${fmtDur(after.overflow)} 초과` : ''}`;
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

// ---------------------------------------------------------------- 장소 상세 팝업
const detailCache = new Map();

async function openDetail(p) {
  S.ui.detail = { id: p.id, place: p, loading: true, data: null, error: '' };
  renderDetail();
  try {
    if (!detailCache.has(p.id)) detailCache.set(p.id, S.provider.details(p.id));
    const data = await detailCache.get(p.id);
    if (S.ui.detail?.id !== p.id) return;
    S.ui.detail.data = data;
  } catch (e) {
    detailCache.delete(p.id);
    if (S.ui.detail?.id !== p.id) return;
    S.ui.detail.error = explainError(e, '상세 정보를 불러오지 못했어요');
  }
  S.ui.detail.loading = false;
  renderDetail();
}

function closeDetail() {
  S.ui.detail = null;
  renderDetail();
}

const stars = (n) => (n == null ? '' : `<span class="rating">★ ${Number(n).toFixed(1)}</span>`);

function aiBlock(title, a) {
  return `<div class="ai-card">
    <div class="ai-title">✨ ${title}</div>
    <p>${esc(a.text)}</p>
    <div class="ai-foot">${esc(a.disclosure || 'Gemini로 요약됨')}${a.lang && a.lang.startsWith('ja') ? ' · 일본어 원문' : ''}${safeUrl(a.flag) ? ` · <a href="${esc(safeUrl(a.flag))}" target="_blank" rel="noopener">부적절한 내용 신고</a>` : ''}</div>
  </div>`;
}

function detailHTML() {
  const dt = S.ui.detail;
  const p = dt.place;
  const d = dt.data || {};
  const inDay = placeDay(p.id);
  const photos = (d.photos?.length ? d.photos : photoOf(p) ? [{ url: photoOf(p), author: p.photoAttr }] : []).filter((x) => safeUrl(x.url, { image: true }));
  const price = d.priceRange || (p.priceLevel && PRICE[p.priceLevel]) || '';
  const maps = safeUrl(d.mapsUrl) || placeUrl(p);
  const web = safeUrl(d.website);
  let body;
  if (dt.loading) body = `<div class="empty"><span class="spinner"></span> 리뷰와 AI 요약을 불러오는 중…</div>`;
  else if (dt.error) body = errorHTML(dt.error);
  else {
    const ai = d.ai || {};
    body = `
    ${d.demo ? `<div class="banner">데모 모드라 실제 리뷰·AI 요약이 없어요. Google 지도에 연결하면 볼 수 있어요.</div>` : ''}
    <section class="dt-sec">
      <h3>AI 요약</h3>
      ${ai.review ? aiBlock('리뷰 요약', ai.review) : ''}
      ${ai.place ? aiBlock('장소 요약', ai.place) : ''}
      ${!ai.review && !ai.place ? `<p class="muted small">이 장소는 Google AI 요약을 제공하지 않아요.${d.editorial ? '' : ' 아래 리뷰를 참고해 주세요.'}</p>` : ''}
      ${d.editorial ? `<p class="dt-editorial">${esc(d.editorial)}</p>` : ''}
    </section>
    <section class="dt-sec">
      <h3>메뉴·가격</h3>
      ${price ? `<p class="dt-price">💴 가격대 ${esc(price)}</p>` : ''}
      ${d.serves?.length ? `<div class="chips">${d.serves.map((x) => `<span class="chip sm static">${esc(x)}</span>`).join('')}</div>` : ''}
      <p class="muted small">메뉴판 정보는 Google 지도 API에서 제공되지 않아요. 아래에서 메뉴 사진과 공식 메뉴를 확인할 수 있어요.</p>
      <div class="row-actions">
        <a class="btn btn-sm" href="${esc(maps)}" target="_blank" rel="noopener">Google 지도에서 메뉴·사진 ↗</a>
        ${web ? `<a class="btn btn-sm" href="${esc(web)}" target="_blank" rel="noopener">공식 웹사이트 ↗</a>` : ''}
      </div>
    </section>
    <section class="dt-sec">
      <h3>리뷰 ${d.reviews?.length ? `<span class="muted">${d.reviews.length}개</span>` : ''}</h3>
      ${
        d.reviews?.length
          ? `<ul class="reviews">${d.reviews
              .map(
                (r, i) => `<li>
            <div class="rv-head">${safeUrl(r.authorUrl) ? `<a href="${esc(safeUrl(r.authorUrl))}" target="_blank" rel="noopener">${esc(r.author)}</a>` : `<b>${esc(r.author)}</b>`} ${stars(r.rating)} <span class="muted small">${esc(r.when)}</span></div>
            <p class="rv-text" id="rv-${i}">${esc(r.text)}</p>
            ${r.text.length > 140 ? `<button class="link small" data-action="toggle-review" data-i="${i}">더 보기</button>` : ''}
          </li>`,
              )
              .join('')}</ul>`
          : '<p class="muted small">표시할 리뷰가 없어요.</p>'
      }
      <a class="link small" href="${esc(maps)}" target="_blank" rel="noopener">Google 지도에서 리뷰 더 보기 ↗</a>
    </section>
    ${
      d.address || d.phone || d.hoursText?.length
        ? `<section class="dt-sec"><h3>정보</h3>
      ${d.address ? `<p class="small">📍 ${esc(d.address)}</p>` : ''}
      ${d.phone ? `<p class="small">📞 <span class="selectable">${esc(d.phone)}</span></p>` : ''}
      ${d.hoursText?.length ? `<details class="small"><summary>영업시간</summary>${d.hoursText.map((h) => `<div>${esc(h)}</div>`).join('')}</details>` : ''}
    </section>`
        : ''
    }`;
  }
  return `<div class="detail" role="dialog" aria-modal="true" aria-labelledby="dtTitle">
    <header class="dt-head">
      <div class="dt-title">
        <h2 id="dtTitle">${esc(p.name)}</h2>
        <div class="r-meta">${ratingHTML(p)} ${placeMeta(p)}</div>
      </div>
      <button class="icon-btn" data-action="close-detail" aria-label="닫기">${ICON.close}</button>
    </header>
    <div class="dt-body">
      ${
        photos.length
          ? `<div class="dt-photos">${photos
              .map((ph) => `<figure><img src="${esc(safeUrl(ph.url, { image: true }))}" alt="" loading="lazy">${ph.author ? `<figcaption>📷 ${esc(ph.author)}</figcaption>` : ''}</figure>`)
              .join('')}</div>`
          : ''
      }
      ${body}
      <p class="dt-attr">장소 정보·리뷰·사진: Google 지도</p>
    </div>
    <footer class="dt-foot">
      ${
        inDay != null
          ? `<span class="added">D${inDay + 1}에 추가됨</span>`
          : S.ui.sheet?.type === 'rec'
            ? `<button class="btn btn-primary" data-action="detail-add" data-id="${esc(p.id)}">＋ 이 날 일정에 추가</button>`
            : ''
      }
      <button class="btn" data-action="close-detail">닫기</button>
    </footer>
  </div>`;
}

function renderDetail() {
  const el = $('#detail');
  if (!S.ui.detail) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const keep = el.querySelector('.dt-body')?.scrollTop || 0;
  el.innerHTML = detailHTML();
  el.hidden = false;
  el.querySelector('.dt-body').scrollTop = keep;
  if (!el.contains(document.activeElement)) el.querySelector('[data-action="close-detail"]')?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- 설정 단계 동작
async function doSearch(target) {
  const input = document.querySelector(`[data-search="${target}"]`);
  const q = (input?.value || '').trim();
  input?.blur();
  S.ui.search = { q, results: [], loading: !!q, error: '' };
  render();
  if (!q) return;
  try {
    const res = await S.provider.searchText(q, { kind: target === 'hotel' ? 'hotel' : undefined });
    S.ui.search.results = target === 'hotel' ? res.map((p) => ({ ...p, kind: 'hotel' })) : res;
  } catch (e) {
    S.ui.search.error = explainError(e, '검색하지 못했어요');
  }
  S.ui.search.loading = false;
  render({ fit: true });
}

// 빠른 추가 칩: 검색 결과 이름이 칩 이름과 달라도 어떤 칩으로 추가했는지 기억한다
const squash = (x) => String(x || '').replace(/\s+/g, '').toLowerCase();
const matchesQuick = (m, q) => m.quick === q || (!m.quick && (squash(m.name).includes(squash(q)) || squash(q).includes(squash(m.name))));
const quickAdded = (q) => S.trip.mustSpots.some((m) => matchesQuick(m, q));

function addMust(p, quick) {
  const exist = S.trip.mustSpots.find((m) => m.id === p.id);
  if (exist) {
    if (quick) exist.quick = quick;
    save();
    return;
  }
  const kind = p.kind === 'hotel' ? 'sight' : p.kind;
  S.trip.mustSpots.push(makeStop({ ...p, kind }, { must: true, ...(quick ? { quick } : {}) }));
  save();
}

async function quickSpot(q) {
  if (S.ui.quickBusy) return;
  if (quickAdded(q)) {
    const i = S.trip.mustSpots.findIndex((m) => matchesQuick(m, q));
    const [removed] = S.trip.mustSpots.splice(i, 1);
    save();
    render({ fit: true });
    toast(`${removed.name} 뺐어요`, {
      label: '되돌리기',
      fn: () => {
        S.trip.mustSpots.splice(i, 0, removed);
        save();
        render({ fit: true });
      },
    });
    return;
  }
  S.ui.quickBusy = q;
  render();
  try {
    const res = await S.provider.searchText(q, {});
    if (!res.length) toast(`'${q}'을(를) 찾지 못했어요.`);
    else {
      addMust(res[0], q);
      toast(`${res[0].name} 추가`);
    }
  } catch (e) {
    toast(explainError(e, '검색하지 못했어요').msg);
  }
  S.ui.quickBusy = null;
  render({ fit: true });
}

function build(opts = {}) {
  const t = S.trip;
  // 새로 짤 때는 직접 추가한 장소·식사·건너뛰기를 모두 지우고 메인 스팟만으로 시작
  t.days = t.days.map((d) => ({ ...emptyDay(), stops: d.stops.filter((s) => s.fixed) }));
  syncTrip(t);
  const spots = t.mustSpots.map((m) => {
    const kind = classifyPlace(m.types, m.typeLabel, m.kind);
    const stay = kind !== m.kind ? defaultStay({ ...m, kind }) : m.stay;
    return { ...m, kind, stay, meal: null, uid: uid() };
  });
  t.days = autoDistribute(t, spots).map((stops) => ({ ...emptyDay(), stops }));
  t.created = true;
  save();
  S.ui.screen = 'plan';
  S.ui.day = 0;
  S.ui.sheet = null;
  S.ui.search = { q: '', results: [], loading: false, error: '' };
  render({ fit: true, resetScroll: true });
  const meals = t.days.flatMap((d) => d.stops).filter((x) => x.must && x.meal).length;
  toast(
    t.mustSpots.length
      ? `${opts.rebuilt ? '바뀐 설정으로 일정을 새로 짰어요 · ' : ''}메인 스팟 ${t.mustSpots.length}곳을 ${t.days.filter((d) => d.stops.some((x) => !x.fixed)).length}일에 나눴어요${meals ? ` (식당 ${meals}곳은 식사 시간에)` : ''}`
      : '빈 일정을 만들었어요. 추천으로 채워 보세요',
  );
}

// 일정 생성 후 설정을 고쳤을 때: 바뀐 설정으로 일정을 처음부터 다시 짠다(직접 추가한 장소는 초기화)
async function saveSetup() {
  const t = S.trip;
  if (tripNights(t) < 1) return toast('출발 날짜가 도착 날짜보다 뒤여야 해요');
  const added = t.days.some((d) => d.stops.some((s) => !s.must && !s.fixed) || d.skipMeals?.length);
  if (added && !(await ask('저장하면 바뀐 설정으로 일정을 새로 짜요. 직접 추가한 식사·관광지와 순서 변경은 지워지고 메인 스팟만 다시 배치돼요.', '새로 짜기'))) return;
  build({ rebuilt: true });
}

// ---------------------------------------------------------------- 공유
function itineraryText() {
  const t = S.trip;
  const s = seg();
  const out = [`[도쿄 ${t.nights}박 ${t.nights + 1}일] ${dayLabel(t, 0)} ~ ${dayLabel(t, t.nights)} · ${t.people}명`];
  out.push(`도착: ${dayLabel(t, 0)} ${t.arrival.time} ${AIRPORTS[t.arrival.airport].name} / 출발: ${dayLabel(t, t.nights)} ${t.departure.time} ${AIRPORTS[t.departure.airport].name}`);
  if (t.hotel) out.push(`숙소: ${t.hotel.name} (체크인 ${t.checkIn} · 체크아웃 ${t.checkOut})`);
  t.days.forEach((d, di) => {
    const r = computeDay(t, di, s);
    out.push('', `■ D${di + 1} ${dayLabel(t, di)}`);
    if (r.win.isArrival && t.arrival) out.push(`${fmtTime(r.win.start)} ${r.origin.name} 출발`);
    else if (t.hotel && r.rows.length) out.push(`${fmtTime(r.win.start)} 숙소 출발`);
    r.rows.forEach((row) => {
      const leg = row.leg?.min ? ` (${MODES[row.leg.mode].label} ${fmtDur(row.leg.min)})` : '';
      const name = row.stop.fixed === 'arrival' ? '숙소 도착·짐 풀기' : row.stop.name;
      out.push(`${fmtTime(row.arrive)}-${fmtTime(row.depart)} ${name}${row.stop.meal ? ` [${MEAL_LABEL[row.stop.meal]}]` : ''}${leg}`);
    });
    if (r.back) out.push(`${fmtTime(r.end)} 숙소 복귀`);
    if (r.dep) out.push(`${fmtTime(r.dep.leaveBy)} 공항으로 출발 → ${fmtTime(r.dep.atAirport)} ${r.dep.airport.name} 도착 · ${t.departure.time} 이륙`);
    if (!r.rows.length && !r.dep) out.push('(일정 없음)');
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
    if (n > 1 && tripNights(S.trip) < 1) return toast('출발 날짜가 도착 날짜보다 뒤여야 해요');
    if (n > 2 && !S.trip.hotel) return toast('숙소를 먼저 선택해 주세요');
    S.ui.step = n;
    S.ui.search = { q: '', results: [], loading: false, error: '' };
    render({ resetScroll: true });
  },
  set: (d) => {
    setPath(S.trip, d.field, NUM_FIELDS.includes(d.field) ? Number(d.value) : d.value);
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
  'quick-move': (d) => {
    const f = findStop(S.ui.quick);
    S.ui.quick = null;
    if (!f) return render();
    const list = S.trip.days[f.di].stops;
    const j = f.i + Number(d.d);
    if (j < 0 || j >= list.length || !moveability(S.trip.days[f.di], f.i)[Number(d.d) < 0 ? 'up' : 'down']) return render();
    [list[f.i], list[j]] = [list[j], list[f.i]];
    save();
    S.ui.flash = f.s.uid;
    render();
    toast(`${f.s.name} ${Number(d.d) < 0 ? '위로' : '아래로'} 옮겼어요`, {
      label: '되돌리기',
      fn: () => {
        const g = findStop(f.s.uid);
        if (!g) return;
        const l = S.trip.days[g.di].stops;
        const k = g.i - Number(d.d);
        if (k < 0 || k >= l.length) return;
        [l[g.i], l[k]] = [l[k], l[g.i]];
        save();
        render();
      },
    });
  },
  'quick-cancel': () => {
    S.ui.quick = null;
    render();
  },
  'edit-order': () => {
    S.ui.quick = null;
    S.ui.edit = !S.ui.edit;
    S.ui.sheet = null;
    render();
  },
  day: (d) => {
    S.ui.day = Number(d.day);
    S.ui.edit = false;
    S.ui.quick = null;
    S.ui.sheet = null;
    S.ui.focus = null;
    render({ fit: true, resetScroll: true });
  },
  stay: (d) => {
    const f = findStop(d.uid);
    if (!f) return;
    if (f.s.fixed === 'arrival') S.trip.restMin = f.s.stay = Math.max(0, f.s.stay + Number(d.d));
    else f.s.stay = Math.max(15, f.s.stay + Number(d.d));
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
    } else if (type === 'airout') {
      S.trip.departure.mode = now = next(S.trip.departure.mode);
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
    S.ui.sheet.budget = null;
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
    $('[data-search="rec"]')?.blur();
    S.ui.sheet.q = $('[data-search="rec"]')?.value || '';
    recSearch();
  },
  'focus-cand': (d) => focusCand(d.id, false),
  'close-detail': closeDetail,
  'detail-add': (d) => {
    addCandidate(d.id);
    renderDetail();
  },
  'toggle-review': (d) => {
    const el = document.getElementById(`rv-${d.i}`);
    const open = el.classList.toggle('open');
    const btn = document.querySelector(`[data-action="toggle-review"][data-i="${d.i}"]`);
    if (btn) btn.textContent = open ? '접기' : '더 보기';
  },
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
    if (!f) return;
    const list = S.trip.days[f.di].stops;
    const j = f.i + Number(d.d);
    if (j < 0 || j >= list.length || f.s.fixed) return;
    // 첫날 '숙소 도착' 앞으로는 식사만 옮길 수 있다
    if (list[j].fixed && !f.s.meal) return toast('숙소 도착 전에는 식사만 넣을 수 있어요');
    [list[f.i], list[j]] = [list[j], list[f.i]];
    save();
    S.ui.flash = f.s.uid;
    render();
  },
  'move-day': (d) => {
    const f = findStop(d.uid);
    const to = Number(d.day);
    S.trip.days[f.di].stops.splice(f.i, 1);
    const target = S.trip.days[to];
    f.s.meal = null;
    target.stops.splice(Math.max(minInsertIndex(target), bestInsert(target.stops, S.trip.hotel, f.s, est()).index), 0, f.s);
    save();
    S.ui.sheet = null;
    render();
    toast(`D${to + 1}(으)로 옮겼어요`, { label: '보기', fn: () => actions.day({ day: to }) });
  },
  'remove-stop': (d) => {
    const f = findStop(d.uid);
    if (!f || f.s.fixed) return;
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
    S.ui.detail = null;
    renderDetail();
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
    S.trip = syncTrip(defaultTrip());
    save();
    S.ui = { ...S.ui, screen: 'setup', step: 1, day: 0, sheet: null, focus: null, search: { q: '', results: [], loading: false, error: '' } };
    render({ fit: true, resetScroll: true });
  },
};

function onClick(e) {
  if (Date.now() < longPress.suppressUntil) {
    // 길게 누른 직후 손을 뗄 때 생기는 클릭은 무시(상세 화면이 열리지 않도록)
    e.preventDefault();
    return;
  }
  if (S.ui.quick && !e.target.closest('.quick-bar')) {
    e.preventDefault();
    S.ui.quick = null;
    render();
    return;
  }
  if (e.target.id === 'detail') return closeDetail();
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
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (v === '') return render();
    if (el.dataset.type === 'bool-inv') v = !v;
    else if (NUM_FIELDS.includes(el.dataset.field)) v = Number(v);
    setPath(S.trip, el.dataset.field, v);
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
  if (e.key === 'Escape' && S.ui.detail && $('#dialog').hidden) return closeDetail();
  if (e.key !== 'Enter') return;
  const el = e.target;
  if (!el.matches('[data-search]')) return;
  e.preventDefault();
  // 키보드의 '검색/완료'를 누르면 키보드를 닫고 화면을 원래대로 돌린다
  el.blur();
  if (el.dataset.search === 'rec') actions['rec-search']();
  else doSearch(el.dataset.search);
}

// ---------------------------------------------------------------- 일정 카드 길게 누르기 → 빠른 순서 이동
const longPress = { timer: null, uid: null, x: 0, y: 0, fired: false, suppressUntil: 0 };
function watchLongPress() {
  const clear = () => {
    clearTimeout(longPress.timer);
    longPress.timer = null;
  };
  document.addEventListener('pointerdown', (e) => {
    const body = e.target.closest('.stop:not(.is-edit):not(.is-fixed) .stop-body');
    if (!body || S.ui.quick || (e.pointerType === 'mouse' && e.button !== 0)) return;
    Object.assign(longPress, { uid: body.dataset.uid, x: e.clientX, y: e.clientY, fired: false });
    clear();
    longPress.timer = setTimeout(() => {
      longPress.fired = true;
      longPress.timer = null;
      S.ui.quick = longPress.uid;
      navigator.vibrate?.(15);
      render();
    }, 480);
  });
  document.addEventListener('pointermove', (e) => {
    if (longPress.timer && Math.hypot(e.clientX - longPress.x, e.clientY - longPress.y) > 10) clear();
  });
  const end = () => {
    clear();
    if (longPress.fired) longPress.suppressUntil = Date.now() + 200;
    longPress.fired = false;
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('scroll', clear, true);
  // 길게 누를 때 뜨는 브라우저 메뉴(복사·공유 등) 막기
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.stop .stop-body')) e.preventDefault();
  });
}

// ---------------------------------------------------------------- 모바일 키보드 복구
// iOS 등은 입력창에 포커스가 가면 문서를 위로 밀어 올리고, 키보드가 닫혀도 그대로 두는 경우가 있다.
// 입력 중이 아닐 때는 항상 문서를 맨 위(지도+패널 기본 배치)로 되돌린다.
const isTyping = () => !!document.activeElement?.matches?.('input:not([type="checkbox"]):not([type="file"]), select, textarea');
function resetViewport() {
  if (isTyping()) return;
  const se = document.scrollingElement || document.documentElement;
  if (window.scrollY || se.scrollTop || document.body.scrollTop) {
    window.scrollTo(0, 0);
    se.scrollTop = 0;
    document.body.scrollTop = 0;
  }
  mapView?.resize();
}
function watchKeyboard() {
  document.addEventListener('focusout', () => setTimeout(resetViewport, 120));
  window.addEventListener('scroll', () => !isTyping() && window.scrollY && resetViewport(), { passive: true });
  const vv = window.visualViewport;
  if (vv) {
    let last = vv.height;
    vv.addEventListener('resize', () => {
      // 높이가 크게 늘었다 = 키보드가 닫혔다
      if (vv.height > last + 80) setTimeout(resetViewport, 60);
      last = vv.height;
    });
  }
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
    <div id="detail" class="detail-backdrop" hidden></div>
    <div id="dialog" class="dlg-backdrop" hidden></div>
  </div>`;
  mapView = new MapView(document.getElementById('map'));
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onKey);
  routes.onChange = () => render();
  watchKeyboard();
  watchLongPress();
  window.addEventListener('gm-auth-failure', async () => {
    S.providerError = 'API 키 인증에 실패했어요. 키 값, 결제 계정 연결, 사용 API(Maps JavaScript·Places (New)·Routes), 웹사이트 제한(리퍼러)을 확인해 주세요.';
    await useDemo();
    render({ fit: true });
  });
  render();
  connect();
}

mount();
