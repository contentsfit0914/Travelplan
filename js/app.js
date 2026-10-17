// 도쿄 여행 플래너 — 화면 렌더링과 사용자 동작 처리.
// 흐름: 여행 정보 → 숙소 → 메인 스팟 → 시간 설정 → 자동 일정 → (동선 확인 → 가볼만한 곳 → 맛집·카페) 추가

import {
  computeDay,
  isOpenDuring,
  hoursWarning,
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
  dayHotel,
  dayStyle,
  DAY_STYLE,
  REST_WALK_MIN,
  isShop,
  arrangeStops,
  nightHotel,
  isMoveDay,
  minInsertIndex,
  budgetRadius,
  budgetLabel,
} from './planner.js';
import { MODES, distKm, fmtKm, centroid, estimateMinutes } from './geo.js';
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
import { avatarSVG, cleanAvatar, defaultAvatar, randomAvatar, AVATAR_BODIES, AVATAR_EARS, AVATAR_COLORS, AVATAR_FACES, AVATAR_HATS, AVATAR_ITEMS, spriteHTML, setSprite, headingAnim, SPRITE_ANIMS } from './avatar.js';
import { loadSprites, saveSprite, deleteSprite, clearSprites, normalizeSheet, applySprites, SPRITE_KEYS } from './sprites.js';
import { QUICK_SPOTS, DEMO_PLACES } from './data/demo-places.js';

const CFG = window.TRAVELPLAN_CONFIG || {};
const DAY_COLORS = ["#FF4F3A", "#2F6BFF", "#15A36A", "#8A4DFF", "#F2A20C", "#E8457B", "#1FA2A0", "#5B6B7A", "#7C5CFF", "#C9770A"];
// 아이콘 이미지(assets/icons): 카메라·택시·버스·침대·비행기·커피·맥주·오믈렛
const ICON_IMG = { sight: 'camera', food: 'food', bar: 'beer', cafe: 'coffee', hotel: 'bed', airport: 'plane', DRIVE: 'taxi', TRANSIT: 'bus' };
const icon = (name, size = 20, cls = '') => (ICON_IMG[name] ? `<img class="ic ${cls}" src="assets/icons/${ICON_IMG[name]}.png?v=2" width="${size}" height="${size}" alt="" aria-hidden="true">` : '');
// 술집·이자카야는 맥주 아이콘
const isBar = (p) => (p?.types || []).some((t) => ['bar', 'pub', 'wine_bar', 'izakaya_restaurant', 'night_club'].includes(t)) || /이자카야|술집|주점|바$|펍/.test(p?.typeLabel || '');
const placeIcon = (p, size = 20, cls = '') => icon(p?.kind === 'food' && isBar(p) ? 'bar' : p?.kind || 'sight', size, cls);
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
  pencil: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  route: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="5" r="2.5"/><path d="M7 17.5c4-1 2-6 6-7.5s4-3 4.5-5"/><path d="M7.5 17.5 13 10"/></svg>',
  heart: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.5 4.5 7 4.5c2 0 3.4 1 5 3 1.6-2 3-3 5-3 3.5 0 5.6 3.5 4.3 6.8C19.5 15.9 12 20.5 12 20.5z"/></svg>',
  food: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3v7a3 3 0 0 0 3 3v8M9 3v6M3 3v6"/><path d="M18 3c-2 0-3.5 2.5-3.5 6 0 2.5 1.2 4 2.5 4v8"/><path d="M18 3v10"/></svg>',
  expand: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
};
const STEP_TITLES = ['', '항공편·기본 정보', '숙소', '가고 싶은 메인 스팟', '하루 시간·식사'];
const STEP_SHORT = ['', '항공·기본', '숙소', '메인 스팟', '시간·식사'];

const S = {
  trip: loadTrip(),
  tour: null, // 동선 재생 상태
  sprites: null, // 이 기기에 올린 캐릭터 이미지(없으면 기본 SVG 캐릭터)
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
  const t = S.trip;
  const pts = [dayOrigin(t, di), ...t.days[di].stops, dayHotel(t, di)].filter(Boolean);
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
  if (S.tour && (S.ui.screen !== 'plan' || S.ui.day !== S.tour.di)) stopTour();
  renderTourBar();
  $('#mapActions').innerHTML =
    S.ui.screen === 'plan'
      ? `<button class="icon-btn" data-action="edit-setup" data-step="1" aria-label="여행 설정 수정" title="여행 설정 수정">${ICON.pencil}</button>
         <button class="icon-btn" data-action="share" aria-label="일정 공유" title="일정 공유">${ICON.share}</button>
         <button class="icon-btn" data-action="open-settings" aria-label="설정" title="설정">${ICON.gear}</button>`
      : `<button class="icon-btn" data-action="open-settings" aria-label="설정" title="설정">${ICON.gear}</button>`;
  $('#modeBadge').innerHTML = isDemo()
    ? `<button data-action="open-settings" class="badge-demo">${CFG.preview ? '미리보기' : '데모 모드'}</button>`
    : '';
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
  const nextLabel = step === 1 && !datesOk ? '출발 날짜를 확인해 주세요' : step === 2 && !t.hotel ? '숙소를 등록해 주세요' : '다음';
  return `
  <div class="sticky-head">
  <header class="topbar">
    ${avatarButton()}
    <div class="tb-title">
      <div class="eyebrow">${t.created ? '여행 설정 수정' : '여행 준비'} · ${step}/4</div>
      <h1>${STEP_TITLES[step]}</h1>
    </div>
    ${t.created ? `<button class="btn btn-sm btn-primary" data-action="save-setup" ${datesOk ? '' : 'disabled'}>저장하고 일정 보기</button>` : ''}
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
    <div class="fc-head">${icon('airport', 22)} ${arr ? '도쿄 도착' : '도쿄 출발'}</div>
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
    ${seg3('baseMode', [['TRANSIT', `${icon('TRANSIT', 18)} 대중교통 위주`], ['DRIVE', `${icon('DRIVE', 18)} 택시 위주`]], t.baseMode)}
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
      const added = kindTarget === 'hotel' ? S.trip.hotels.some((h) => h.id === p.id) : S.trip.mustSpots.some((m) => m.id === p.id);
      return `<li class="result">
        <div class="r-main">
          <div class="r-name">${placeIcon(p, 18)} ${esc(p.name)}</div>
          <div class="r-meta">${ratingHTML(p)} ${placeMeta(p)}</div>
          <div class="r-addr">${esc(p.address)}</div>
        </div>
        <button class="btn btn-sm ${added ? '' : 'btn-primary'}" data-action="${kindTarget === 'hotel' ? 'pick-hotel' : 'add-must'}" data-i="${i}" ${added ? 'disabled' : ''}>${added ? (kindTarget === 'hotel' ? '등록됨' : '선택됨') : kindTarget === 'hotel' ? '등록' : '＋ 추가'}</button>
      </li>`;
    })
    .join('')}</ul>`;
}

// 숙소: 검색 → 등록 → 묵는 날짜·체크인·체크아웃. 숙소를 옮기는 여행은 여러 곳 등록해 밤마다 나눈다
const HOTEL_COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2'];
const hotelColor = (t, id) => HOTEL_COLORS[Math.max(0, t.hotels.findIndex((h) => h.id === id)) % HOTEL_COLORS.length];
const hotelNo = (t, id) => t.hotels.findIndex((h) => h.id === id) + 1;

function hotelSearchHTML() {
  return `<div class="searchbox">
    <input type="search" placeholder="${isDemo() ? '지역 검색 (예: 신주쿠, 시부야, 긴자)' : '호텔 이름이나 주소 검색'}" data-search="hotel" value="${esc(S.ui.search.q)}" enterkeyhint="search">
    <button class="btn btn-primary" data-action="search" data-target="hotel">검색</button>
  </div>
  ${isDemo() && !S.ui.search.q ? demoHotelList() : resultsHTML('hotel')}`;
}

function hotelCardHTML(h, i) {
  const t = S.trip;
  const multi = t.hotels.length > 1;
  const mine = t.nightHotel.filter((x) => x === h.id).length;
  const nights = t.nightHotel
    .map((id, ni) => {
      const on = id === h.id;
      return `<button class="night ${on ? 'on' : ''}" data-action="night-hotel" data-night="${ni}" data-id="${esc(h.id)}" aria-pressed="${on}">
        <b>${dayLabel(t, ni)}</b><small>${on ? '숙박' : multi ? `${hotelNo(t, id)}번 숙소` : ''}</small></button>`;
    })
    .join('');
  return `<div class="card stay-card ${mine ? '' : 'empty'}" style="--hc:${hotelColor(t, h.id)}">
    <div class="sc-head">
      <span class="h-num">${i + 1}</span>
      <div class="sc-name"><b>${esc(h.name)}</b><small class="muted">${esc(h.address)}</small></div>
      <button class="icon-btn sm" data-action="remove-hotel" data-id="${esc(h.id)}" aria-label="${esc(h.name)} 삭제">${ICON.close}</button>
    </div>
    <div class="sc-label">묵는 밤 <span class="muted">${mine ? `${mine}박` : '날짜를 눌러 주세요'}</span></div>
    <div class="nights">${nights}</div>
    <div class="row2">
      ${timeField('체크인', `hotels.${i}.checkIn`)}
      ${timeField('체크아웃', `hotels.${i}.checkOut`)}
    </div>
    ${
      h.timesChecked
        ? ''
        : `<div class="verify-box">
      <p>${S.ui.hotelInfoBusy === h.id ? '<span class="spinner sm"></span> 숙소 정보를 확인하는 중…' : '⚠ 체크인·체크아웃 시간은 Google 지도에서 제공하지 않아요. 위 시간은 일반적인 기본값이니 <b>예약 확인서나 호텔 안내</b>에서 확인해 맞춰 주세요.'}</p>
      <div class="row-actions">
        ${safeUrl(h.website) ? `<a class="btn btn-sm" href="${esc(safeUrl(h.website))}" target="_blank" rel="noopener">호텔 홈페이지 ↗</a>` : ''}
        ${h.phone ? `<a class="btn btn-sm" href="tel:${esc(h.phone.replace(/[^\d+]/g, ''))}">📞 ${esc(h.phone)}</a>` : ''}
        ${safeUrl(h.mapsUrl) ? `<a class="btn btn-sm" href="${esc(safeUrl(h.mapsUrl))}" target="_blank" rel="noopener">Google 지도 ↗</a>` : ''}
        <button class="btn btn-sm" data-action="hotel-times-ok" data-id="${esc(h.id)}">시간 확인했어요 ✓</button>
      </div>
    </div>`
    }
  </div>`;
}

// 숙소 등록 직후: Google 상세에서 홈페이지·전화번호를 가져와 시간 확인에 쓰도록 붙여 둔다
async function fetchHotelInfo(id) {
  if (isDemo()) return;
  S.ui.hotelInfoBusy = id;
  render();
  try {
    const d = await S.provider.details(id);
    const h = S.trip.hotels.find((x) => x.id === id);
    if (h) {
      if (safeUrl(d.website)) h.website = d.website;
      if (d.phone) h.phone = d.phone;
      if (d.checkIn) h.checkIn = d.checkIn; // 공급자가 체크인·체크아웃 시간을 주면 채운다(현재 Google은 제공하지 않음)
      if (d.checkOut) h.checkOut = d.checkOut;
      if (d.checkIn && d.checkOut) h.timesChecked = true;
      save();
    }
  } catch {
    /* 상세 정보를 못 가져와도 등록은 유지 */
  }
  S.ui.hotelInfoBusy = null;
  render();
}

function setupStep2() {
  const t = S.trip;
  const hs = t.hotels;
  if (!hs.length) {
    return `
    <p class="lead">숙소를 검색해 등록하면 공항 이동과 매일 출발·복귀 동선을 계산해요.</p>
    <div class="section-title">숙소 검색</div>
    ${hotelSearchHTML()}`;
  }
  const moves = t.days.map((_, di) => di).filter((di) => isMoveDay(t, di));
  return `
  <div class="section-title">등록한 숙소 <span class="muted">· 날짜와 체크인·체크아웃 시간을 확인하세요</span></div>
  ${hs.map(hotelCardHTML).join('')}
  ${
    S.ui.addHotel
      ? `<div class="card add-hotel">
          <div class="sc-head"><b>숙소 추가</b><button class="icon-btn sm" data-action="add-hotel" data-v="0" aria-label="숙소 추가 닫기">${ICON.close}</button></div>
          ${hotelSearchHTML()}
        </div>`
      : `<button class="btn wide dashed" data-action="add-hotel" data-v="1">＋ 다른 숙소 추가 <span class="muted">(중간에 숙소를 옮길 때)</span></button>`
  }
  ${
    moves.length
      ? `<p class="hint">🧳 ${moves.map((di) => `D${di + 1}`).join(', ')}에는 아침에 체크아웃하고 새 숙소에 짐을 맡긴 뒤 일정을 시작해요.</p>`
      : ''
  }
  <div class="field">
    <label>첫날 숙소 도착 후 쉬는 시간</label>
    ${seg3('restMin', [[0, '바로 출발'], [15, '15분'], [30, '30분'], [60, '1시간']], t.restMin)}
    <p class="hint">공항→숙소 이동시간은 자동으로 계산해요. 체크인 전에 도착하면 짐을 맡기고 쉬는 시간으로 잡아요.</p>
  </div>`;
}

function demoHotelList() {
  S.ui.search.results = DEMO_PLACES.filter((p) => p.types.includes('lodging')).map((p) => ({ ...p, kind: 'hotel' }));
  return `<p class="hint">데모 모드에서는 지역 대표 지점으로 숙소 위치를 정해요.</p>${resultsHTML('hotel')}`;
}

// 검색한 지역 주변 인기 스팟(검색 전엔 도쿄 기본 목록)
function popularHTML(addedCount) {
  const pop = S.ui.popular;
  if (!pop) {
    return `
  <div class="chips-label">인기 스팟 빠르게 추가 <span class="muted">${addedCount ? `· ${addedCount}곳 추가됨` : ''}</span></div>
  <div class="chips">${QUICK_SPOTS.map((q) => {
    const on = quickAdded(q);
    const busy = S.ui.quickBusy === q;
    return `<button class="chip quick ${on ? 'added' : ''}" data-action="quick-spot" data-q="${esc(q)}" aria-pressed="${on}" ${busy ? 'disabled' : ''}>${busy ? '<span class="spinner sm"></span>' : on ? '✓' : '＋'} ${esc(q)}</button>`;
  }).join('')}</div>`;
  }
  const isAdded = (p) => S.trip.mustSpots.some((m) => m.id === p.id);
  const n = pop.list.filter(isAdded).length;
  return `
  <div class="chips-label">'${esc(pop.q)}' 주변 인기 스팟 <span class="muted">${pop.loading ? '· 찾는 중…' : n ? `· ${n}곳 추가됨` : '· 누르면 추가돼요'}</span>
    <button class="link small pop-reset" data-action="popular-reset">도쿄 전체 보기</button></div>
  ${
    pop.loading
      ? `<div class="empty"><span class="spinner"></span></div>`
      : pop.list.length
        ? `<div class="chips">${pop.list
            .map((p, i) => {
              const on = isAdded(p);
              return `<button class="chip quick ${on ? 'added' : ''}" data-action="quick-place" data-i="${i}" aria-pressed="${on}">${on ? '✓' : '＋'} ${esc(p.name)}${p.rating ? `<small class="muted"> ★${Number(p.rating).toFixed(1)}</small>` : ''}</button>`;
            })
            .join('')}</div>`
        : `<p class="hint">이 지역 주변에서 인기 관광지를 찾지 못했어요. 위 검색 결과에서 직접 추가해 주세요.</p>`
  }`;
}

// 검색한 장소를 중심으로 주변 인기 관광지를 불러온다
async function loadPopular(q, center) {
  S.ui.popular = { q, center, list: [], loading: true };
  render();
  try {
    const res = await S.provider.nearby('sight', { lat: center.lat, lng: center.lng }, 2500);
    const score = (p) => (p.rating != null ? p.rating * Math.log10((p.ratingCount || 0) + 10) : 0);
    const list = res
      .filter((p) => p.kind === 'sight' && p.id !== center.id)
      .sort((a, b) => score(b) - score(a) || distKm(center, a) - distKm(center, b))
      .slice(0, 10);
    if (S.ui.popular?.q === q) S.ui.popular = { q, center, list, loading: false };
  } catch {
    if (S.ui.popular?.q === q) S.ui.popular = { q, center, list: [], loading: false };
  }
  render();
}

function setupStep3() {
  const t = S.trip;
  const addedCount = QUICK_SPOTS.filter(quickAdded).length;
  const total = t.mustSpots.reduce((s, m) => s + m.stay, 0);
  const cap = t.days.reduce((s, _, i) => s + dayCapacity(t, i), 0);
  return `
  <div class="searchbox">
    <input type="search" placeholder="장소·지역 검색 (예: 신주쿠, 센소지)" data-search="must" value="${esc(S.ui.search.q)}" enterkeyhint="search">
    <button class="btn btn-primary" data-action="search" data-target="must">검색</button>
  </div>
  ${resultsHTML('must')}
  ${popularHTML(addedCount)}
  <div class="section-title">선택한 메인 스팟 <span class="muted">${t.mustSpots.length}곳 · 관광 ${fmtDur(total)} / 여행 중 가용 약 ${fmtDur(cap)}</span></div>
  ${
    t.mustSpots.length
      ? `<ul class="must-list">${t.mustSpots
          .map(
            (m, i) => `<li>
          <span class="num">${i + 1}</span>
          <div class="r-main"><div class="r-name">${placeIcon(m, 18)} ${esc(m.name)}</div><div class="r-meta">${placeMeta(m)}</div></div>
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
  const id = `f-${field.replace(/\./g, '-')}`;
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
  <div class="section-title">날짜별 여행 스타일 <span class="muted">· 카드를 누를 때마다 바뀌어요</span></div>
  <div class="style-grid">${t.days
    .map((_, i) => {
      const st = dayStyle(t, i);
      const d = DAY_STYLE[st];
      return `<button class="style-card st-${st}" style="--c:${color(i)}" data-action="day-style" data-day="${i}" aria-label="D${i + 1} ${dayLabel(t, i)} 스타일: ${d.label}, 누르면 바꾸기">
        <span class="sc-day"><b>D${i + 1}</b><small>${dayLabel(t, i)}</small></span>
        <span class="sc-ico">${d.icon}</span>
        <span class="sc-style">${d.label}</span>
      </button>`;
    })
    .join('')}</div>
  <ul class="style-legend">${Object.entries(DAY_STYLE)
    .map(([k, d]) => `<li><b>${d.icon} ${d.label}</b> ${d.desc}</li>`)
    .join('')}</ul>
  <div class="section-title">날짜별 관광 가용 시간 <span class="muted">(공항 이동·식사 제외)</span></div>
  <div class="cap-list">${bars}</div>`;
}

// ---------- 일정 화면
function planHTML() {
  const t = S.trip;
  const di = S.ui.day;
  const tabs = [`<button class="daytab ${di === -1 ? 'on' : ''}" data-action="day" data-day="-1"><b>전체</b></button>`]
    .concat(
      t.days.map(
        (_, i) =>
          `<button class="daytab ${di === i ? 'on' : ''}" style="--c:${color(i)}" data-action="day" data-day="${i}"><b><i class="dot"></i>D${i + 1}</b><small>${dayLabel(t, i).replace(/\(.*\)/, '')}</small></button>`,
      ),
    )
    .join('');
  return `
  <div class="sticky-head">
  <header class="topbar compact">
    ${avatarButton()}
    <div class="tb-title">
      <h1>도쿄 ${t.nights}박 ${t.nights + 1}일 <span class="tb-sub">${dayLabel(t, 0).replace(/\(.*\)/, '')}–${dayLabel(t, t.nights).replace(/\(.*\)/, '')} · ${t.people}명</span></h1>
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

// 숙소별 묵는 기간(연속된 밤 묶음)
function stayRanges(t) {
  const out = [];
  t.days.slice(0, -1).forEach((_, ni) => {
    const h = nightHotel(t, ni);
    const lastR = out[out.length - 1];
    if (lastR && lastR.hotel.id === h.id) lastR.to = ni + 1;
    else out.push({ hotel: h, from: ni, to: ni + 1 });
  });
  return out;
}

function staysHTML() {
  const t = S.trip;
  const ranges = stayRanges(t);
  if (ranges.length === 1)
    return `<div class="card hotel-card slim"><div class="pin-inline">${icon('hotel', 28)}</div><div><b>${esc(t.hotel.name)}</b><div class="muted">매일 출발·복귀 기준</div></div></div>`;
  return `<div class="card hotel-card slim stays">${ranges
    .map(
      (r) => `<div class="stay-row" style="--hc:${hotelColor(t, r.hotel.id)}"><span class="h-num">${hotelNo(t, r.hotel.id)}</span><div><b>${esc(r.hotel.name)}</b><div class="muted">${dayLabel(t, r.from)} ~ ${dayLabel(t, r.to)} · ${r.to - r.from}박</div></div></div>`,
    )
    .join('')}</div>`;
}

function overviewHTML() {
  const t = S.trip;
  const s = seg();
  return `<section class="content">
    ${!t.hotel ? `<div class="banner banner-err">숙소가 없어요. <button class="link" data-action="edit-setup" data-step="2">숙소 설정하기</button></div>` : staysHTML()}
    ${t.days
      .map((d, i) => {
        const r = computeDay(t, i, s);
        const warn = r.overflow ? `<span class="warn-pill">⚠ ${fmtDur(r.overflow)} 초과</span>` : r.gaps.length ? `<span class="gap-pill">${icon('food', 14)} ${r.gaps.map((g) => g.label).join('·')} 미정</span>` : `<span class="ok-pill">여유 ${fmtDur(r.free)}</span>`;
        return `<button class="day-card" style="--c:${color(i)}" data-action="day" data-day="${i}">
          <div class="dc-head"><b>D${i + 1}</b> <span>${dayLabel(t, i)}</span>${dayStyle(t, i) !== 'sight' ? `<em class="badge style">${DAY_STYLE[dayStyle(t, i)].icon} ${DAY_STYLE[dayStyle(t, i)].label}</em>` : ''} <span class="muted">${i === 0 ? `✈ ${t.arrival.time} 도착` : r.dep ? `✈ ${t.departure.time} 출발` : `${fmtTime(r.win.start)}–${fmtTime(Math.max(r.end, r.win.start))}`}</span>${isMoveDay(t, i) ? ' <span class="gap-pill">🧳 숙소 이동</span>' : ''} ${warn}</div>
          <div class="dc-stops">${r.rows.some((x) => x.num) ? r.rows.filter((x) => x.num).map((x) => `<span><i>${x.num}</i>${esc(x.stop.name)}</span>`).join('') : '<span class="muted">비어 있음 — 눌러서 채우기</span>'}</div>
          <div class="dc-foot muted">이동 ${fmtDur(r.totals.travel)} · 관광 ${fmtDur(r.totals.sight)} · 식사·카페 ${fmtDur(r.totals.meal)}</div>
        </button>`;
      })
      .join('')}
  </section>`;
}

// 이동수단 아이콘: 택시·버스는 이미지, 도보는 이모지
const modeIcon = (mode) => (ICON_IMG[mode] ? icon(mode, 16) : MODES[mode].icon);
function modeLabel(leg, pref) {
  const m = MODES[leg.mode];
  return `${modeIcon(leg.mode)} ${m.label} ${leg.min ? fmtDur(leg.min) : '바로 옆'}${pref === 'AUTO' || !pref ? '' : ' ·고정'}`;
}

function legHTML(leg, from, to, ref, pref, di, compact = false) {
  if (!leg) return '';
  if (compact) return `<div class="leg compact" style="--c:${color(di)}"><span>${modeIcon(leg.mode)} ${leg.min ? fmtDur(leg.min) : '바로 옆'}</span></div>`;
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
  if (a.kind === 'hotel') return '숙소';
  return a.name;
}

function gapHTML(g) {
  const late = g.dev === 0 ? '목표 시각' : `목표보다 ${fmtDur(Math.abs(g.dev))} ${g.dev > 0 ? '늦음' : '빠름'}`;
  return `<div class="gap">
    <div class="gap-ico">${icon('food', 18)}</div>
    <div class="gap-card">
      <button class="gap-main" data-action="open-rec" data-tab="food" data-gap="${g.type}">
        <span class="when">${fmtTime(g.at)} · ${g.label}</span>
        <b>${g.label} 식당 고르기 ›</b>
        <small>${esc(anchorName(g.anchor))}에서 ${g.budget <= 15 ? `도보 ${g.budget}분` : `${g.budget}분`} 이내 · <em class="${g.ok ? 'ok-txt' : 'warn-txt'}">${late}</em></small>
      </button>
      <button class="gap-skip" data-action="skip-meal" data-meal="${g.type}" aria-label="${g.label} 건너뛰기">건너뛰기</button>
    </div>
  </div>`;
}

function anchorHTML(time, icon, text, sub = '', cls = '') {
  return `<div class="anchor ${cls}"><span class="a-ico">${icon}</span><span class="a-txt"><span class="a-time">${fmtTime(time)}</span> ${text}${sub ? `<small class="muted"> · ${sub}</small>` : ''}</span></div>`;
}

function freeHTML(from, to, anchor) {
  const a = anchor?.uid && !anchor.fixed ? anchor.uid : anchor?.fixed ? 'hotel' : 'origin';
  return `<div class="free">
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
  const name = s.fixed === 'arrival' ? '숙소 도착 · 짐 풀고 쉬기' : s.fixed === 'move' ? '숙소 이동 · 짐 맡기기' : esc(s.name);
  const meta = s.fixed ? esc(s.name) : `${s.must ? '<em class="badge">메인</em>' : ''}${s.meal ? `<em class="badge meal">${MEAL_LABEL[s.meal]}</em>` : ''}${ratingHTML(s)} ${placeMeta(s)}`;
  const head = `<div class="stop-num">${row.num ?? icon('hotel', 18)}</div>`;
  const when = `<span class="when">${fmtTime(row.arrive)} – ${fmtTime(row.depart)}<small> · ${fmtDur(s.stay)}</small></span>`;
  const photo = photoOf(s);
  const thumb = `<span class="sb-thumb ${photo ? '' : 'ph'}">${photo ? `<img src="${esc(photo)}" alt="" loading="lazy">` : s.fixed ? icon('hotel', 40) : placeIcon(s, 40)}</span>`;
  if (!edit) {
    const quick = S.ui.quick === s.uid;
    const mv = quick ? moveability(day, row.index) : null;
    return `<div class="${classes} ${quick ? 'quick' : ''}" style="--c:${color(di)}" data-uid="${esc(s.uid)}">${head}
    <div class="stop-card">
      <button class="stop-body" data-action="open-stop" data-uid="${esc(s.uid)}">
        <span class="sb-main">
          ${when}
          <span class="stop-name">${name}</span>
          <span class="stop-meta">${meta}</span>
          ${row.info ? `<span class="info">${esc(row.info)}</span>` : ''}
          ${row.warn ? `<span class="warn">⚠ ${esc(row.warn)}</span>` : ''}
        </span>
        ${thumb}
      </button>
      ${
        quick
          ? `<div class="quick-bar" role="group" aria-label="${esc(s.name)} 순서 바꾸기·삭제">
        <button data-action="quick-move" data-d="-1" ${mv.up ? '' : 'disabled'} aria-label="한 칸 위로">‹ <small>위로</small></button>
        <button class="qb-del" data-action="quick-delete" aria-label="${esc(s.name)} 일정에서 삭제">삭제</button>
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
      ${when}
      <span class="stop-name">${name}</span>
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

// 하루 예상 걸음 수: 도보 구간 거리 + 대중교통·택시 구간의 역·정류장 오가는 도보(약 600m) + 관광지 안에서 걷는 거리(약 800m). 보폭 0.7m
function daySteps(r) {
  let m = 0;
  const legs = [...r.rows.map((x) => x.leg), r.back, r.dep?.leg].filter(Boolean);
  for (const leg of legs) m += leg.mode === 'WALK' ? (leg.km || 0) * 1000 : leg.mode === 'TRANSIT' ? 600 : 150;
  for (const row of r.rows) if (!row.stop.fixed) m += row.stop.kind === 'sight' ? 800 : 200;
  return Math.round(m / 0.7 / 100) * 100;
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
  const edit = S.ui.edit && real.length > 0;

  // 타임라인 조립
  const parts = [];
  if (r.win.isArrival && t.arrival) {
    parts.push(anchorHTML(r.win.start, icon('airport', 18), `${esc(r.origin.name)} 출발`, `${t.arrival.time} 도착${t.immigrationMin ? ` + 입국 수속 ${fmtDur(t.immigrationMin)}` : ''}`));
  } else if (r.origin && (r.rows.length || !r.dep)) {
    // 첫 장소가 식사라 기다려야 하면 그만큼 늦게 출발
    const lateStart = r.rows[0]?.wait || 0;
    const sub = isMoveDay(t, di)
      ? `체크아웃 ${r.origin.checkOut || t.checkOut} · 짐 챙겨서 숙소 이동`
      : r.dep
        ? `체크아웃 ${r.origin.checkOut || t.checkOut} · 짐은 숙소에 맡겨 두세요`
        : lateStart
          ? `${fmtTime(r.win.start)}부터 ${fmtDur(lateStart)} 여유`
          : '';
    parts.push(anchorHTML(r.win.start + lateStart, icon('hotel', 18), `${esc(r.origin.name)} 출발`, sub));
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
  const home = dayHotel(t, di);
  if (r.back) parts.push(legHTML(r.back, prev, home, `back:${di}`, day.returnMode, di, edit));
  const backLabel = r.dep ? '숙소 복귀 · 짐 찾기' : '숙소 복귀';
  if (home && r.back)
    parts.push(
      openTail
        ? anchorHTML(r.win.rawEnd, icon('hotel', 18), `${backLabel} 목표`, `지금 일정대로면 ${fmtTime(r.end)} 복귀`, 'end')
        : anchorHTML(r.end, icon('hotel', 18), backLabel, r.overflow ? `${r.dep ? '공항 출발' : '목표'} ${fmtTime(r.win.rawEnd)}보다 ${fmtDur(r.overflow)} 늦어요` : '', `end ${r.overflow ? 'over' : ''}`),
    );
  if (r.dep) {
    parts.push(anchorHTML(r.dep.leaveBy, '🧳', '공항으로 출발', '늦어도 이 시각에는 숙소를 나서야 해요', 'end'));
    parts.push(legHTML(r.dep.leg, r.dep.hotel, r.dep.airport, 'airout', t.departure.mode, di, edit));
    parts.push(anchorHTML(r.dep.atAirport, icon('airport', 18), `${esc(r.dep.airport.name)} 도착`, `이륙 ${t.departure.time} · ${fmtDur(t.airportBufferMin)} 전`, 'end'));
  }

  const flow = [
    { icon: ICON.route, label: '이동 동선', done: real.length > 0, sub: real.length ? `${real.length}곳` : '비어 있음', action: real.length ? `data-action="open-rec" data-tab="sight" data-anchor="route"` : '' },
    { icon: ICON.heart, label: '가볼만한 곳', done: sights >= 2, sub: `관광 ${sights}곳`, action: 'data-action="open-rec" data-tab="sight"' },
    {
      icon: ICON.food,
      label: '맛집·카페',
      done: !r.gaps.length && foods > 0,
      sub: r.gaps.length ? `식사 ${r.gaps.length}끼 미정` : `${foods}곳`,
      action: r.gaps.length ? `data-action="open-rec" data-tab="food" data-gap="${r.gaps[0].type}"` : 'data-action="open-rec" data-tab="cafe"',
    },
  ];

  return `<section class="content">
    <div class="summary" style="--c:${color(di)}">
      <div class="sum-head">
        <div><b>${dayLabel(t, di)}</b></div>
        <div class="steps" title="예상 걸음 수">👣 ${daySteps(r).toLocaleString()}보</div>
      </div>
      <div class="timebar" aria-hidden="true">
        <i class="tb-travel" style="width:${pct(r.totals.travel)}"></i><i class="tb-sight" style="width:${pct(r.totals.sight)}"></i><i class="tb-meal" style="width:${pct(r.totals.meal)}"></i>${r.overflow ? `<i class="tb-over" style="width:${pct(r.overflow)}"></i>` : ''}
        <span class="tb-limit" style="left:${pct(r.win.end - r.win.start)}"></span>
      </div>
      <div class="tb-times"><span>${r.win.isArrival ? `${icon('airport', 14)} ${t.arrival.time}` : fmtTime(r.win.start)}</span><span>${r.dep ? `${t.departure.time} ${icon('airport', 14)}` : fmtTime(r.win.rawEnd)}</span></div>
      <div class="sum-stats">
        <span><i class="lg lg-travel"></i>이동 ${fmtDur(r.totals.travel)}</span>
        <span><i class="lg lg-sight"></i>관광 ${fmtDur(r.totals.sight)}</span>
        <span><i class="lg lg-meal"></i>식사·카페 ${fmtDur(r.totals.meal)}</span>
        ${r.overflow ? `<span class="over">⚠ ${fmtDur(r.overflow)} 초과${r.dep ? ' · 비행기 시간 확인' : ''}</span>` : `<span class="ok">여유 ${fmtDur(r.free)}</span>`}
        ${pending ? '<span class="muted"><span class="spinner sm"></span> 실제 경로 계산 중</span>' : ''}
      </div>
      ${
        edit
          ? ''
          : `<ol class="flow">${flow
              .map((f) => `<li class="${f.done ? 'done' : ''}"><button ${f.action || 'disabled'}><span class="fi">${f.icon}</span><b>${f.label}</b><small>${f.sub}</small></button></li>`)
              .join('')}</ol>`
      }
    </div>
    ${edit ? `<div class="edit-hint">▲▼로 순서를 바꾸면 도착 시간과 이동 경로가 바로 다시 계산돼요.</div>` : ''}
    ${!t.hotel ? `<div class="banner banner-err">숙소가 없어 출발·복귀 동선을 계산할 수 없어요. <button class="link" data-action="edit-setup" data-step="2">숙소 설정</button></div>` : ''}
    <div class="timeline" style="--c:${color(di)}">${parts.join('')}</div>
    ${!edit && real.length >= 2 ? '<p class="lp-hint">💡 일정 카드를 꾹 누르면 바로 순서를 바꿀 수 있어요</p>' : ''}
    ${
      !real.length
        ? `<div class="empty big"><p>${dayStyle(t, di) === 'rest' ? `휴식일이에요. 숙소에서 도보 ${REST_WALK_MIN}분 안에 갈 만한 곳이 없어 비워 두었어요.` : '아직 이 날 일정이 비어 있어요.'}</p><button class="btn btn-primary" data-action="open-rec" data-tab="sight">숙소 주변 가볼만한 곳 추천받기</button></div>`
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
  const html = sh.type === 'rec' ? recHTML(sh) : sh.type === 'stop' ? stopSheetHTML(sh) : sh.type === 'avatar' ? avatarSheetHTML() : settingsHTML();
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
  if (isMoveDay(t, S.ui.day)) opts.push(['origin', '전날 숙소']);
  if (t.hotel) opts.push(['hotel', isMoveDay(t, S.ui.day) ? '새 숙소' : '숙소']);
  let n = 0;
  day.stops.forEach((s) => !s.fixed && opts.push([s.uid, `${++n}. ${s.name}`]));
  return `<div class="chips scroll">${opts
    .map(([v, l]) => `<button class="chip ${sh.anchor === v ? 'on' : ''}" data-action="rec-anchor" data-v="${esc(v)}">${esc(l)}</button>`)
    .join('')}</div>`;
}

function recHTML(sh) {
  const tabs = [
    ['sight', `${icon('sight', 18)} 가볼만한 곳`],
    ['food', `${icon('food', 18)} 맛집`],
    ['cafe', `${icon('cafe', 18)} 카페`],
    ['search', '🔍 검색'],
  ];
  const kw = sh.tab === 'food' ? FOOD_KEYWORDS : sh.tab === 'cafe' ? CAFE_KEYWORDS : [];
  const gapNote = sh.gap
    ? `<div class="banner slim">${icon('food', 16)} <b>${MEAL_LABEL[sh.gap]} ${sh.gapAt != null ? fmtTime(sh.gapAt) : ''}</b> 자리 · ${esc(sh.anchorName || '')}에서 <b>${budgetLabel(sh.budget)}</b> 맛집을 보여 드려요. 고르면 그 시간에 바로 들어가요.${sh.note ? `<br>${esc(sh.note)}` : ''}</div>`
    : '';
  let list;
  if (sh.loading) list = `<div class="empty"><span class="spinner"></span> ${isDemo() ? '샘플에서 찾는 중…' : 'Google 지도에서 찾는 중…'}</div>`;
  else if (sh.error) list = errorHTML(sh.error);
  else if (!sh.results.length)
    list = `<div class="empty">${sh.tab === 'search' ? (sh.q ? '검색 결과가 없어요.' : '장소 이름을 검색해 이 날 일정에 넣을 수 있어요.') : '주변에서 찾은 곳이 없어요. 기준 위치를 바꿔 보세요.'}</div>`;
  else {
    const by = {
      near: (a, b) => (sh.budget ? a.reach - b.reach : a.walk - b.walk) || a.extra - b.extra,
      rating: (a, b) => (b.rating || 0) - (a.rating || 0) || (b.ratingCount || 0) - (a.ratingCount || 0),
      reviews: (a, b) => (b.ratingCount || 0) - (a.ratingCount || 0) || (b.rating || 0) - (a.rating || 0),
      score: (a, b) => b.score - a.score,
    };
    const sorted = [...sh.results].sort(by[sh.sort] || by.score);
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
      ${seg3('rec-sort', [['score', '추천순'], ['near', '거리순'], ['rating', '평점순'], ['reviews', '리뷰순']], sh.sort).replaceAll('data-action="set"', 'data-action="rec-sort"')}
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
    ${photoOf(p) ? `<div class="thumb"><img src="${esc(photoOf(p))}" alt="" loading="lazy">${p.photoAttr ? `<small>${esc(p.photoAttr)}</small>` : ''}</div>` : `<div class="thumb ph">${placeIcon(p, 44)}</div>`}
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
  if (s.fixed) return arrivalSheetHTML(s, di, modes);
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
      <button class="btn" data-action="open-rec" data-tab="food" data-anchor="${s.uid}">${icon('food', 18)} 근처 맛집</button>
      <button class="btn" data-action="open-rec" data-tab="cafe" data-anchor="${s.uid}">${icon('cafe', 18)} 근처 카페</button>
      <a class="btn" href="${esc(placeUrl(s))}" target="_blank" rel="noopener">Google 지도 ↗</a>
    </div>
    <button class="btn btn-danger wide" data-action="remove-stop" data-uid="${esc(s.uid)}">일정에서 삭제</button>
  </div>`;
}

// '숙소 도착(첫날)·숙소 이동' 자리: 머무는 시간과 그곳까지 이동수단만 바꾼다
function arrivalSheetHTML(s, di, modes) {
  const t = S.trip;
  const h = dayHotel(t, di) || {};
  const move = s.fixed === 'move';
  return `
  <div class="sheet-head">
    <div class="sh-title"><span class="stop-num" style="--c:${color(di)}">${icon('hotel', 18)}</span><b>${move ? '숙소 이동 · 짐 맡기기' : '숙소 도착 · 짐 풀고 쉬기'}</b></div>
    <button class="icon-btn" data-action="close-sheet" aria-label="닫기">${ICON.close}</button>
  </div>
  <div class="sheet-body">
    <p class="small"><b>${esc(s.name)}</b> · 체크인 ${h.checkIn || t.checkIn} / 체크아웃 ${h.checkOut || t.checkOut}</p>
    ${move ? `<p class="small muted">${esc(dayOrigin(t, di)?.name || '')}에서 체크아웃하고 짐을 옮겨요.</p>` : ''}
    <div class="field"><label>${move ? '짐 맡기는 시간' : '쉬는 시간'}</label>
      <div class="stay big">
        <button data-action="stay" data-uid="${esc(s.uid)}" data-d="-15">−15분</button><span>${fmtDur(s.stay)}</span><button data-action="stay" data-uid="${esc(s.uid)}" data-d="15">+15분</button>
      </div>
    </div>
    <div class="field"><label>${move ? '전날 숙소에서 새 숙소까지' : '공항에서 숙소까지'} 이동수단</label>
      <div class="seg">${modes.map(([m, l]) => `<button class="${s.mode === m ? 'on' : ''}" data-action="stop-mode" data-uid="${esc(s.uid)}" data-v="${m}">${l}</button>`).join('')}</div>
    </div>
    <p class="hint">${move ? '숙소와 날짜는 설정 수정 → 숙소에서 바꿀 수 있어요.' : '공항에서 먹고 갈 식당은 타임라인의 식사 자리에서 고르면 숙소 도착 앞에 들어가요. 체크인·쉬는 시간 기본값은 설정 수정 → 숙소에서 바꿀 수 있어요.'}</p>
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

// ---------------------------------------------------------------- 내 캐릭터
const myAvatar = () => cleanAvatar(S.settings.avatar || defaultAvatar());
const hasSprites = () => !!S.sprites;
// 캐릭터 그리기: 올린 이미지가 있으면 스프라이트, 없으면 기본 SVG 마스코트
const charHTML = (anim, { size = 48, play = false } = {}) =>
  hasSprites() ? spriteHTML(anim, { size, play }) : avatarSVG(myAvatar(), { size: Math.round(size * 0.92), walk: play, ground: false });
function setChar(el, anim, play) {
  if (hasSprites()) setSprite(el, anim, play);
  else el.querySelector('svg')?.classList.toggle('av-walk', !!play);
  el.classList.toggle('walking', !!play);
}
const avatarButton = () => `<button class="av-btn" data-action="open-avatar" aria-label="내 캐릭터">${charHTML('down', { size: 40 })}</button>`;

function setAvatar(patch) {
  S.settings.avatar = cleanAvatar({ ...myAvatar(), ...patch });
  saveSettings(S.settings);
  avatarElCache.clear();
}

// 내 기기에 올린 캐릭터 이미지 관리(공개 사이트에는 올라가지 않는다)
function spriteSlotsHTML() {
  const sp = S.sprites || {};
  const n = SPRITE_KEYS.filter((k) => sp[k]).length;
  return `
    <div class="section-title">내 캐릭터 이미지 <span class="muted">· 이 기기에만 저장</span></div>
    <p class="hint">투명 배경 PNG, 한 장에 <b>가로 4칸 × 세로 2칸(8프레임)</b>으로 그려진 시트를 동작별로 올려요. 앞으로 시트만 있어도 돼요(나머지 동작은 그걸로 대신해요). 이미지는 이 휴대폰 브라우저에만 저장되고 공개 사이트·공유 파일에는 들어가지 않아요.</p>
    <div class="spr-slots">${SPRITE_KEYS.map(
      (k) => `<label class="spr-slot ${sp[k] ? 'has' : ''}">
        ${sp[k] ? spriteHTML(k, { size: 44, play: true }) : `<span class="spr-empty">＋</span>`}
        <small>${SPRITE_ANIMS[k]}</small>
        <input type="file" accept="image/png,image/webp" data-spr="${k}" hidden>
        ${sp[k] ? `<button class="spr-del" data-action="spr-del" data-k="${k}" aria-label="${SPRITE_ANIMS[k]} 이미지 삭제">✕</button>` : ''}
      </label>`,
    ).join('')}</div>
    ${S.ui.sprBusy ? `<p class="hint"><span class="spinner sm"></span> 이미지 정리 중…</p>` : ''}
    ${n ? `<button class="btn btn-sm btn-danger" data-action="spr-clear">이미지 모두 지우고 기본 캐릭터로</button>` : ''}`;
}

function avatarSheetHTML() {
  const av = myAvatar();
  const preview = S.ui.avPreview || 'down';
  const opt = (field, list, make) =>
    `<div class="av-opts">${list
      .map(([k, label]) => `<button class="av-opt ${av[field] === k ? 'on' : ''}" data-action="av-set" data-field="${field}" data-value="${k}" aria-label="${label}" title="${label}">${make(k)}<small>${label}</small></button>`)
      .join('')}</div>`;
  const mini = (o) => avatarSVG({ ...av, ...o }, { size: 40, ground: false });
  return `
  <div class="sheet-head"><b>내 캐릭터</b><button class="icon-btn" data-action="close-sheet" aria-label="닫기">${ICON.close}</button></div>
  <div class="sheet-body av-sheet">
    <div class="av-stage"><div class="av-stage-in">${charHTML(preview, { size: 150, play: true })}</div>
      <input class="av-name" type="text" maxlength="8" placeholder="이름 (선택)" value="${esc(av.name)}" data-avname enterkeyhint="done">
    </div>
    <p class="hint center">지도 위에서 이 캐릭터가 하루 동선을 따라 걷고, 맛집·카페에 도착하면 쉬어 가요. 일정 화면의 <b>▶ 동선 따라가기</b>를 눌러 보세요.</p>
    ${
      hasSprites()
        ? `<div class="section-title">동작 미리보기</div>
    <div class="av-opts anims">${Object.entries(SPRITE_ANIMS)
      .map(([k, label]) => `<button class="av-opt ${preview === k ? 'on' : ''}" data-action="av-preview" data-v="${k}" aria-label="${label}">${spriteHTML(k, { size: 44, play: preview === k })}<small>${label}</small></button>`)
      .join('')}</div>`
        : `<div class="section-title">몸</div>
    ${opt('body', AVATAR_BODIES, (k) => mini({ body: k, hat: 'none', item: 'none', face: 'dot', ears: 'none' }))}
    <div class="section-title">귀</div>
    ${opt('ears', AVATAR_EARS, (k) => mini({ ears: k, hat: 'none', item: 'none', face: 'dot' }))}
    <div class="section-title">색</div>
    <div class="av-opts swatches">${AVATAR_COLORS.map((c) => `<button class="swatch ${av.color === c ? 'on' : ''}" style="--sw:${c}" data-action="av-set" data-field="color" data-value="${c}" aria-label="색 ${c}"></button>`).join('')}</div>
    <div class="section-title">표정</div>
    ${opt('face', AVATAR_FACES, (k) => mini({ face: k, hat: 'none', item: 'none' }))}
    <div class="section-title">모자</div>
    ${opt('hat', AVATAR_HATS, (k) => mini({ hat: k, item: 'none' }))}
    <div class="section-title">소지품</div>
    ${opt('item', AVATAR_ITEMS, (k) => mini({ item: k }))}
    <div class="row-actions"><button class="btn" data-action="av-random">🎲 랜덤</button></div>`
    }
    ${spriteSlotsHTML()}
    <div class="row-actions"><button class="btn btn-primary wide" data-action="close-sheet">완료</button></div>
  </div>`;
}

// 지도용 아바타 DOM. 같은 요소를 재사용하고 동작(방향·걷기·먹기)만 바꾼다
const avatarElCache = new Map();
function avatarEl(anim = 'down', play = false) {
  const av = myAvatar();
  const key = `${hasSprites() ? 'spr' : 'svg'}:${JSON.stringify(av)}`;
  if (!avatarElCache.has(key)) {
    const el = document.createElement('div');
    el.className = 'av-marker';
    el.innerHTML = `${charHTML('down', { size: 56 })}${av.name ? `<span class="av-tag">${esc(av.name)}</span>` : ''}`;
    avatarElCache.set(key, el);
  }
  const el = avatarElCache.get(key);
  setChar(el, anim, play);
  return el;
}

// 서 있을 때의 동작: 맛집·카페에 있으면 먹기, 아니면 앞을 보고 서기
function idleAnim() {
  const f = S.ui.focus && findStop(S.ui.focus);
  if (f && f.di === S.ui.day && (f.s.kind === 'food' || f.s.kind === 'cafe')) return ['eat', hasSprites()];
  return ['down', false];
}

// 올린 캐릭터 이미지를 정리해 이 기기에 저장
async function uploadSprite(key, file) {
  if (!file) return;
  S.ui.sprBusy = true;
  renderSheet();
  try {
    const dataUrl = await normalizeSheet(file);
    await saveSprite(key, dataUrl);
    S.sprites = { ...(S.sprites || {}), [key]: dataUrl };
    applySprites(S.sprites);
    avatarElCache.clear();
    toast(`${SPRITE_ANIMS[key]} 이미지를 저장했어요`);
  } catch (e) {
    toast(e?.message || '이미지를 읽지 못했어요');
  }
  S.ui.sprBusy = false;
  render();
}

// 캐릭터가 서 있을 곳: 재생 중엔 재생 위치, 아니면 고른 장소 → 그날 출발점 → 숙소
function avatarPos() {
  const t = S.trip;
  if (S.tour) return S.tour.pos;
  if (S.ui.screen === 'plan' && S.ui.day >= 0) {
    const f = S.ui.focus && findStop(S.ui.focus);
    if (f && f.di === S.ui.day) return { lat: f.s.lat, lng: f.s.lng };
    const o = dayOrigin(t, S.ui.day);
    return o ? { lat: o.lat, lng: o.lng } : null;
  }
  const h = t.hotel;
  return h ? { lat: h.lat, lng: h.lng } : null;
}

// ---------------------------------------------------------------- 동선 재생(캐릭터가 지도 위를 걷는다)
function tourPlan(di) {
  const t = S.trip;
  const r = computeDay(t, di, seg());
  if (!r.origin) return null;
  const pts = [{ lat: r.origin.lat, lng: r.origin.lng }];
  const cum = [0];
  const marks = [];
  const append = (leg, from, to, mark) => {
    const path = leg?.path?.length > 1 ? leg.path : [from, to];
    for (const p of path) {
      const last = pts[pts.length - 1];
      const d = distKm(last, p);
      if (d < 0.002) continue;
      pts.push({ lat: p.lat, lng: p.lng });
      cum.push(cum[cum.length - 1] + d);
    }
    marks.push({ d: cum[cum.length - 1], ...mark });
  };
  let prev = r.origin;
  for (const row of r.rows) {
    append(row.leg, prev, row.stop, { uid: row.stop.uid, kind: row.stop.kind, name: row.stop.fixed ? '숙소 · 짐 맡기기' : row.stop.name, time: row.arrive });
    prev = row.stop;
  }
  const home = dayHotel(t, di);
  if (r.back && home) append(r.back, prev, home, { name: `${home.name} 복귀`, time: r.end });
  if (r.dep) append(r.dep.leg, home, r.dep.airport, { name: `${r.dep.airport.name} 도착`, time: r.dep.atAirport });
  if (!marks.length) return null;
  const total = cum[cum.length - 1];
  // 전체 이동 10~18초 + 장소마다 1초 멈춤
  const moveMs = Math.min(18000, Math.max(10000, total * 900));
  const steps = [];
  let from = 0;
  for (const m of marks) {
    steps.push({ type: 'move', from, to: m.d, ms: total ? ((m.d - from) / total) * moveMs : 0 });
    steps.push({ type: 'stop', mark: m, ms: m.kind === 'food' || m.kind === 'cafe' ? 1800 : 1000 });
    from = m.d;
  }
  return { di, pts, cum, marks, steps };
}

function posAt(plan, d) {
  const { pts, cum } = plan;
  if (d <= 0) return pts[0];
  if (d >= cum[cum.length - 1]) return pts[pts.length - 1];
  let i = 1;
  while (cum[i] < d) i++;
  const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return { lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * f, lng: pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * f };
}

function startTour(di) {
  const plan = tourPlan(di);
  if (!plan) return toast('아직 따라갈 동선이 없어요. 장소를 먼저 추가해 보세요');
  stopTour(false);
  S.tour = { ...plan, i: 0, t0: performance.now(), pos: plan.pts[0] };
  mapView.panTo(plan.pts[0]);
  renderTourBar();
  placeAvatar();
  const tick = (now) => {
    const tr = S.tour;
    if (!tr) return;
    let step = tr.steps[tr.i];
    let el = now - tr.t0;
    while (step && el >= step.ms) {
      el -= step.ms;
      tr.t0 = now - el;
      tr.i++;
      step = tr.steps[tr.i];
      if (step?.type === 'stop') arriveAt(step.mark);
    }
    if (!step) return finishTour();
    if (step.type === 'move') {
      const d = step.from + (step.to - step.from) * Math.min(1, el / (step.ms || 1));
      const prev = tr.pos;
      tr.pos = posAt(tr, d);
      const dir = headingAnim(prev, tr.pos) || tr.anim || 'down';
      if (dir !== tr.anim || !tr.playing) {
        tr.anim = dir;
        tr.playing = true;
        avatarEl(dir, true);
      }
      mapView.moveAvatar(tr.pos);
      if (!mapView.contains(tr.pos)) mapView.panTo(tr.pos);
    }
    tr.raf = requestAnimationFrame(tick);
  };
  S.tour.raf = requestAnimationFrame(tick);
}

function arriveAt(mark) {
  const tr = S.tour;
  // 장소에 멈춘 동안: 맛집·카페면 먹기, 아니면 앞을 보고 서기
  const eat = (mark.kind === 'food' || mark.kind === 'cafe') && hasSprites();
  tr.anim = eat ? 'eat' : 'down';
  tr.playing = eat;
  avatarEl(tr.anim, eat);
  tr.pos = posAt(tr, mark.d);
  mapView.moveAvatar(tr.pos);
  mapView.panTo(tr.pos);
  renderTourBar();
  if (mark.uid) {
    const card = $(`.stop[data-uid="${CSS.escape(mark.uid)}"]`);
    if (card) {
      card.classList.remove('flash');
      void card.offsetWidth;
      card.classList.add('flash');
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
}

function finishTour() {
  const tr = S.tour;
  if (!tr) return;
  const last = tr.marks[tr.marks.length - 1];
  const end = posAt(tr, last.d);
  S.tour = null;
  S.ui.focus = null;
  renderTourBar();
  placeAvatar(end);
  toast('오늘 동선 끝! 수고했어요 🎉');
}

function stopTour(repaint = true) {
  if (!S.tour) return;
  cancelAnimationFrame(S.tour.raf);
  S.tour = null;
  if (repaint) {
    renderTourBar();
    placeAvatar();
  }
}

function placeAvatar(pos = avatarPos()) {
  if (!mapView?.map) return;
  const [anim, play] = S.tour ? [S.tour.anim || 'down', !!S.tour.playing] : idleAnim();
  mapView.setAvatar(avatarEl(anim, play), pos, () => actions['open-avatar']());
}

function renderTourBar() {
  const bar = $('#tourBar');
  if (!bar) return;
  const t = S.trip;
  const di = S.ui.day;
  const show = S.ui.screen === 'plan' && di >= 0 && t.days[di]?.stops.some((s) => !s.fixed);
  if (!show) return (bar.innerHTML = '');
  bar.innerHTML = S.tour
    ? `<button class="tour-btn on" data-action="tour-stop" aria-label="동선 재생 멈추기"><span class="tour-av">${charHTML('right', { size: 26, play: true })}</span><b>■</b></button>`
    : `<button class="tour-btn" data-action="tour-play" aria-label="캐릭터가 오늘 동선을 따라갑니다"><span class="tour-av">${charHTML('down', { size: 26 })}</span>▶ 동선 따라가기</button>`;
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
  // 묵는 숙소만 표시(일자별 보기에선 그날 출발·복귀 숙소)
  const shown = S.ui.screen === 'plan' && S.ui.day >= 0 ? [dayOrigin(t, S.ui.day), dayHotel(t, S.ui.day)] : t.days.slice(0, -1).map((_, ni) => nightHotel(t, ni));
  const hotelIds = new Set();
  for (const h of shown) {
    if (!h || h.kind === 'airport' || hotelIds.has(h.id)) continue;
    hotelIds.add(h.id);
    const multi = t.hotels.length > 1;
    markers.push({ lat: h.lat, lng: h.lng, label: multi ? `${icon('hotel', 20)}<b>${hotelNo(t, h.id)}</b>` : icon('hotel', 22), style: multi ? 'hotel multi' : 'hotel', color: multi ? hotelColor(t, h.id) : null, title: h.name, z: 20 });
    fitPts.push(h);
  }

  const airportMarker = (code, title) => {
    const a = airportPoint(code);
    markers.push({ lat: a.lat, lng: a.lng, label: icon('airport', 22), style: 'hotel airport', title, z: 20 });
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
          label: placeIcon(p, 18),
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
        lines.push(legLine(r.dep.leg, r.dep.hotel, r.dep.airport, c));
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
          onClick: () => openStop(row.stop.uid, 'zoom'),
        });
        fitPts.push(row.stop);
      });
      if (r.back && prev && dayHotel(t, di)) lines.push(legLine(r.back, prev, dayHotel(t, di), c));
    }
    const sh = S.ui.sheet;
    if (sh?.type === 'rec' && S.ui.day >= 0) {
      for (const p of sh.results) {
        if (placeDay(p.id) != null) continue;
        const active = S.ui.focus === `cand:${p.id}`;
        markers.push({
          lat: p.lat,
          lng: p.lng,
          label: placeIcon(p, 18),
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
  placeAvatar();
  S.ui.fitPts = [...fitPts, ...(S.ui.sheet?.type === 'rec' ? S.ui.sheet.results : [])];
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
  if (sh.anchor === 'hotel' && t.hotel) return [dayHotel(t, S.ui.day)];
  if (sh.anchor === 'origin') return [dayOrigin(t, S.ui.day)].filter(Boolean);
  if (sh.anchor !== 'route') {
    const i = day.stops.findIndex((x) => x.uid === sh.anchor);
    if (i >= 0) {
      // 기준 장소 + 다음 장소 근처에서 찾는다(다음 장소가 없으면 숙소 근처)
      const next = day.stops.slice(i + 1).find((x) => !x.fixed) || dayHotel(t, S.ui.day);
      return [day.stops[i], ...(next && next !== day.stops[i] ? [next] : [])];
    }
  }
  const pts = [...day.stops.filter((x) => !x.fixed), dayHotel(t, S.ui.day)].filter(Boolean);
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
  // 기본 범위: 기준 장소에서 도보 15분. 식사 자리의 오차범위가 더 넓으면 그만큼
  const walk15 = budgetRadius(15);
  const radius = Math.max(walk15, sh.budget ? budgetRadius(sh.budget) : 0);
  const keyword = sh.keyword && sh.keyword !== '전체' ? sh.keyword : '';
  const token = (sh.token = uid());
  sh.loading = true;
  sh.error = '';
  render();
  try {
    const provider = S.provider;
    const fetchAll = async (rad) => {
      const lists = await Promise.all(
        centers.map((c) => {
          const k = `${provider.name}|${sh.tab}|${c.lat.toFixed(3)},${c.lng.toFixed(3)}|${rad}|${keyword}`;
          if (!recCache.has(k)) recCache.set(k, provider.nearby(sh.tab, { lat: c.lat, lng: c.lng }, rad, keyword).catch((e) => {
            recCache.delete(k);
            throw e;
          }));
          return recCache.get(k);
        }),
      );
      const seen = new Map();
      lists.flat().forEach((p) => {
        if (seen.has(p.id) || p.kind === 'hotel' || placeDay(p.id) != null) return;
        if (sh.tab === 'sight' && p.kind !== 'sight') return;
        if (sh.tab === 'food' && p.kind !== 'food') return;
        seen.set(p.id, p);
      });
      return [...seen.values()];
    };
    let found = await fetchAll(radius);
    sh.note = '';
    if (found.length < 3) {
      // 도보 15분 안에 거의 없으면 범위를 넓혀 한 번 더
      const more = await fetchAll(Math.round(radius * 2.5));
      if (sh.token !== token || S.ui.sheet !== sh) return;
      if (more.length > found.length) {
        found = more;
        sh.note = '도보 15분 안에 있는 곳이 적어 범위를 넓혀서 보여 드려요.';
      }
    }
    if (sh.token !== token || S.ui.sheet !== sh) return;
    // 그날 문을 닫는 곳은 뺀다: 식사 자리는 그 시각에, 장소 기준이면 그 장소를 떠난 뒤 시간에, 아니면 그날 가용 시간 안에
    const date = dayDate(t, S.ui.day);
    const rr = computeDay(t, S.ui.day, seg());
    const anchorRow = rr.rows.find((x) => x.stop.uid === sh.anchor);
    const slot = sh.gapAt != null ? [sh.gapAt, sh.gapAt + t.mealMinutes] : anchorRow ? [anchorRow.depart + 10, anchorRow.depart + 70] : null;
    const total = found.length;
    found = found.filter((p) => (slot ? !hoursWarning(p, date, slot[0], slot[1]) : isOpenDuring(p, date, rr.win.start, rr.win.rawEnd)));
    const closedN = total - found.length;
    let results = scoreCandidates(found, day, centers);
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
    if (closedN) sh.note = `${sh.note ? `${sh.note} ` : ''}그날 영업하지 않는 ${closedN}곳은 뺐어요.`;
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
    const ins = bestInsert(day.stops, dayHotel(t, S.ui.day), p, e);
    const d = distKm(centers.length === 1 ? centers[0] : anchorPt, p);
    const nearest = Math.min(...centers.map((c) => distKm(c, p)));
    const walk = Math.min(...centers.map((c) => estimateMinutes(c, p, 'WALK')));
    const quality = p.rating != null ? p.rating * Math.log10((p.ratingCount || 0) + 10) : 3;
    return {
      ...p,
      extra: ins.extra,
      walk,
      distLabel: walk <= 30 ? `도보 ${walk}분 (${fmtKm(nearest)})` : centers.length === 1 ? `기준점에서 ${fmtKm(d)}` : `동선에서 ${fmtKm(nearest)}`,
      score: quality - ins.extra / 15,
    };
  });
}

async function recSearch() {
  const sh = S.ui.sheet;
  const q = (sh.q || '').trim();
  if (!q) return;
  const day = S.trip.days[S.ui.day];
  const centers = [dayHotel(S.trip, S.ui.day), ...day.stops].filter(Boolean);
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
      a = !gg.anchor || gg.anchor.fixed ? 'hotel' : gg.anchor.uid || 'origin';
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
  if (fromMap) {
    document.getElementById(candDomId(id))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    mapView.panTo(p, 17, true);
  } else mapView.panTo(p, 15);
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
    const g = (sh.gap && r.gaps.find((x) => x.type === sh.gap)) || r.gaps.reduce((a, b) => (distKm(b.anchor || dayHotel(t, di), p) < distKm(a.anchor || dayHotel(t, di), p) ? b : a));
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
  if (index == null) index = Math.max(minInsertIndex(day), bestInsert(day.stops, dayHotel(t, di), stop, est()).index);
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
  if (pan === 'zoom') mapView.panTo(f.s, 17, true); // 지도 핀을 눌렀을 때: 거리 수준으로 확대
  else if (pan) mapView.panTo(f.s, 15);
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

// 일본 장소의 Google AI 요약은 일본어·영어로만 오는 경우가 많다 → Google 번역으로 한국어 보기
const isKorean = (a) => (a.lang || '').startsWith('ko') || /[가-힣]/.test(a.text);
const translateUrl = (text) => `https://translate.google.com/?sl=auto&tl=ko&op=translate&text=${encodeURIComponent(text.slice(0, 1800))}`;

function aiBlock(title, a) {
  return `<div class="ai-card">
    <div class="ai-title">✨ ${title}</div>
    <p>${esc(a.text)}</p>
    ${isKorean(a) ? '' : `<a class="btn btn-sm ai-tr" href="${esc(translateUrl(a.text))}" target="_blank" rel="noopener">🇰🇷 한국어로 번역 ↗</a>`}
    <div class="ai-foot">${esc(a.disclosure || 'Gemini로 요약됨')}${a.lang && a.lang.startsWith('ja') ? ' · 일본어 원문' : a.lang && a.lang.startsWith('en') ? ' · 영어 원문' : ''}${safeUrl(a.flag) ? ` · <a href="${esc(safeUrl(a.flag))}" target="_blank" rel="noopener">부적절한 내용 신고</a>` : ''}</div>
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
    // 메인 스팟 검색: 첫 결과 지역 주변의 인기 스팟으로 빠른 추가 목록을 바꾼다
    if (target === 'must' && res.length) {
      S.ui.search.loading = false;
      render({ fit: true });
      return loadPopular(q, res[0]);
    }
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

async function build(opts = {}) {
  const t = S.trip;
  // 새로 짤 때는 직접 추가한 장소·식사·건너뛰기를 모두 지우고 메인 스팟만으로 시작
  t.days = t.days.map((d) => ({ ...emptyDay(), stops: d.stops.filter((s) => s.fixed) }));
  syncTrip(t);
  const spots = t.mustSpots.map((m) => {
    const kind = classifyPlace(m.types, m.typeLabel, m.kind);
    const stay = kind !== m.kind ? defaultStay({ ...m, kind }) : m.stay;
    return { ...m, kind, stay, meal: null, uid: uid() };
  });
  const dist = autoDistribute(t, spots);
  t.days = dist.map((stops) => ({ ...emptyDay(), stops }));
  t.created = true;
  save();
  S.ui.screen = 'plan';
  S.ui.day = 0;
  S.ui.sheet = null;
  S.ui.search = { q: '', results: [], loading: false, error: '' };
  render({ fit: true, resetScroll: true });
  const filled = await fillStyledDays(t);
  const meals = t.days.flatMap((d) => d.stops).filter((x) => x.must && x.meal).length;
  const skipped = dist.unplaced?.length ? ` · ${dist.unplaced.length}곳은 휴식·쇼핑 설정에 맞지 않아 뺐어요` : '';
  const auto = filled ? ` · 자유·쇼핑 날에 ${filled}곳을 자동으로 넣었어요` : '';
  toast(
    t.mustSpots.length
      ? `${opts.rebuilt ? '바뀐 설정으로 일정을 새로 짰어요 · ' : ''}메인 스팟 ${t.mustSpots.length - (dist.unplaced?.length || 0)}곳을 ${t.days.filter((d) => d.stops.some((x) => !x.fixed)).length}일에 나눴어요${meals ? ` (식당 ${meals}곳은 식사 시간에)` : ''}${skipped}${auto}`
      : filled
        ? `자유·쇼핑 날에 ${filled}곳을 자동으로 넣었어요`
        : '빈 일정을 만들었어요. 추천으로 채워 보세요',
  );
}

// 자유·쇼핑 날: 그날 숙소 주변 인기 관광지·쇼핑몰을 가용 시간만큼 자동으로 채운다
async function fillStyledDays(t) {
  let added = 0;
  const e = est();
  for (let di = 0; di < t.days.length; di++) {
    const st = dayStyle(t, di);
    if (st !== 'free' && st !== 'shop') continue;
    const hotel = dayHotel(t, di);
    if (!hotel) continue;
    const day = t.days[di];
    const real = () => day.stops.filter((x) => !x.fixed);
    if (real().length >= 3) continue;
    let list;
    try {
      list = await S.provider.nearby(st === 'shop' ? 'shop' : 'sight', { lat: hotel.lat, lng: hotel.lng }, st === 'shop' ? 4000 : 3000);
    } catch {
      continue;
    }
    const score = (p) => (p.rating != null ? p.rating * Math.log10((p.ratingCount || 0) + 10) : 2.5);
    const cands = list
      .filter((p) => p.kind !== 'hotel' && p.kind !== 'food' && placeDay(p.id) == null && (st !== 'shop' || isShop(p) || p.kind === 'sight'))
      .sort((a, b) => score(b) - score(a) || distKm(hotel, a) - distKm(hotel, b));
    const cap = dayCapacity(t, di);
    const loadOf = (stops) => stops.reduce((s, p) => s + p.stay, 0) + tourMin(stops, hotel, e);
    for (const p of cands) {
      if (real().length >= 3) break;
      const stop = makeStop(p, { stay: st === 'shop' ? 90 : undefined });
      if (!stop.stay) stop.stay = makeStop(p).stay;
      if (loadOf([...real(), stop]) > cap) continue;
      day.stops.push(stop);
      added++;
    }
    day.stops = arrangeStops(t, di, day.stops);
  }
  if (added) {
    save();
    render({ fit: true });
  }
  return added;
}

// 숙소에서 출발해 들르고 돌아오는 이동시간 합(추정)
function tourMin(stops, hotel, e) {
  let prev = hotel;
  let m = 0;
  for (const s of stops) {
    m += e(prev, s);
    prev = s;
  }
  return stops.length ? m + e(prev, hotel) : 0;
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
  if (t.hotel)
    stayRanges(t).forEach((r) => out.push(`숙소: ${r.hotel.name} · ${dayLabel(t, r.from)}~${dayLabel(t, r.to)} ${r.to - r.from}박 (체크인 ${r.hotel.checkIn} · 체크아웃 ${r.hotel.checkOut})`));
  t.days.forEach((d, di) => {
    const r = computeDay(t, di, s);
    out.push('', `■ D${di + 1} ${dayLabel(t, di)}`);
    if (r.win.isArrival && t.arrival) out.push(`${fmtTime(r.win.start)} ${r.origin.name} 출발`);
    else if (r.origin && r.rows.length) out.push(`${fmtTime(r.win.start)} ${r.origin.name} 출발${isMoveDay(t, di) ? ' (체크아웃·숙소 이동)' : ''}`);
    r.rows.forEach((row) => {
      const leg = row.leg?.min ? ` (${MODES[row.leg.mode].label} ${fmtDur(row.leg.min)})` : '';
      const name = row.stop.fixed === 'arrival' ? `${row.stop.name} 도착·짐 풀기` : row.stop.fixed === 'move' ? `${row.stop.name} 짐 맡기기` : row.stop.name;
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
    if (n > 2 && !S.trip.hotel) return toast('숙소를 먼저 등록해 주세요');
    S.ui.step = n;
    S.ui.popular = null;
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
    const t = S.trip;
    const p = S.ui.search.results[Number(d.i)];
    if (!p || t.hotels.some((h) => h.id === p.id)) return;
    if (t.hotels.length >= 6) return toast('숙소는 6곳까지 등록할 수 있어요');
    const first = !t.hotels.length;
    t.hotels.push({ ...p, kind: 'hotel', checkIn: t.checkIn, checkOut: t.checkOut, timesChecked: false });
    // 첫 숙소는 모든 밤에, 추가 숙소는 마지막 밤에 우선 배정(날짜 칸을 눌러 바꾼다)
    if (first) t.nightHotel = [];
    else t.nightHotel[t.nightHotel.length - 1] = p.id;
    S.ui.addHotel = false;
    S.ui.search = { q: '', results: [], loading: false, error: '' };
    save();
    render({ fit: true });
    toast(first ? `숙소 등록: ${p.name}` : `${p.name} 등록 · 마지막 밤에 넣었어요. 날짜를 눌러 바꿀 수 있어요`);
    fetchHotelInfo(p.id);
  },
  'day-style': (d) => {
    const order = Object.keys(DAY_STYLE);
    const i = Number(d.day);
    S.trip.dayStyles[i] = order[(order.indexOf(dayStyle(S.trip, i)) + 1) % order.length];
    save();
    render();
  },
  'hotel-times-ok': (d) => {
    const h = S.trip.hotels.find((x) => x.id === d.id);
    if (!h) return;
    h.timesChecked = true;
    save();
    render();
  },
  'add-hotel': (d) => {
    S.ui.addHotel = d.v === '1';
    S.ui.search = { q: '', results: [], loading: false, error: '' };
    render();
    if (S.ui.addHotel) setTimeout(() => $('[data-search="hotel"]')?.focus(), 50);
  },
  'remove-hotel': async (d) => {
    const t = S.trip;
    const h = t.hotels.find((x) => x.id === d.id);
    if (!h) return;
    if (!(await ask(`${h.name}을(를) 숙소에서 뺄까요? 이 숙소에 묵던 날은 앞뒤 숙소로 채워져요.`, '빼기'))) return;
    t.hotels = t.hotels.filter((x) => x.id !== d.id);
    save();
    render({ fit: true });
  },
  'night-hotel': (d) => {
    const t = S.trip;
    const ni = Number(d.night);
    if (t.nightHotel[ni] === d.id) {
      if (t.hotels.length > 1) toast('다른 숙소 카드에서 이 날짜를 누르면 그 숙소로 옮겨져요');
      return;
    }
    t.nightHotel[ni] = d.id;
    save();
    render();
  },
  'add-must': (d) => {
    addMust(S.ui.search.results[Number(d.i)]);
    render();
  },
  'quick-spot': (d) => quickSpot(d.q),
  'quick-place': (d) => {
    const p = S.ui.popular?.list[Number(d.i)];
    if (!p) return;
    const i = S.trip.mustSpots.findIndex((m) => m.id === p.id);
    if (i >= 0) {
      const [removed] = S.trip.mustSpots.splice(i, 1);
      save();
      render({ fit: true });
      toast(`${removed.name} 뺐어요`);
      return;
    }
    addMust(p);
    render({ fit: true });
    toast(`${p.name} 추가`);
  },
  'popular-reset': () => {
    S.ui.popular = null;
    render();
  },
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
  // 길게 누른 카드 가운데 '삭제': 그 자리는 빈 시간으로 돌아간다(되돌리기 가능)
  'quick-delete': () => {
    const uid = S.ui.quick;
    S.ui.quick = null;
    actions['remove-stop']({ uid });
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
    else if (f.s.fixed) f.s.stay = Math.max(0, f.s.stay + Number(d.d));
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
    target.stops.splice(Math.max(minInsertIndex(target), bestInsert(target.stops, dayHotel(S.trip, Number(d.day)), f.s, est()).index), 0, f.s);
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
  'open-avatar': () => {
    S.ui.sheet = { type: 'avatar', resetScroll: true };
    render();
  },
  'av-preview': (d) => {
    S.ui.avPreview = d.v;
    renderSheet();
  },
  'av-set': (d) => {
    setAvatar({ [d.field]: d.value });
    render();
  },
  'av-random': () => {
    setAvatar(randomAvatar(myAvatar().name));
    render();
  },
  'spr-del': async (d) => {
    await deleteSprite(d.k);
    const sp = { ...(S.sprites || {}) };
    delete sp[d.k];
    S.sprites = Object.keys(sp).length ? sp : null;
    applySprites(S.sprites);
    avatarElCache.clear();
    render();
  },
  'spr-clear': async () => {
    if (!(await ask('이 기기에 저장한 캐릭터 이미지를 모두 지우고 기본 캐릭터로 돌아갈까요?', '지우기', true))) return;
    await clearSprites();
    S.sprites = null;
    applySprites(null);
    avatarElCache.clear();
    render();
    toast('기본 캐릭터로 돌아왔어요');
  },
  'tour-play': () => startTour(S.ui.day),
  'tour-stop': () => stopTour(),
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
  if (el.matches('[data-spr]')) {
    const file = el.files?.[0];
    el.value = '';
    uploadSprite(el.dataset.spr, file);
    return;
  }
  if (el.matches('[data-avname]')) {
    setAvatar({ name: el.value.trim() });
    placeAvatar();
    return;
  }
  if (el.matches('[data-field]')) {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (v === '') return render();
    if (el.dataset.type === 'bool-inv') v = !v;
    else if (NUM_FIELDS.includes(el.dataset.field)) v = Number(v);
    setPath(S.trip, el.dataset.field, v);
    // 숙소 체크인·체크아웃을 직접 고치면 '확인함'으로 본다
    const m = el.dataset.field.match(/^hotels\.(\d+)\.(checkIn|checkOut)$/);
    if (m && S.trip.hotels[Number(m[1])]) S.trip.hotels[Number(m[1])].timesChecked = true;
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
      <div id="tourBar" class="tour-bar"></div>
      <div id="mapActions" class="map-actions"></div>
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
  // 빈 지도를 더블 탭하면 지금 보이는 일정 전체가 들어오게 축소
  mapView.onDblClick = () => {
    const pts = S.ui.fitPts || [];
    if (pts.length) mapView.fit(pts);
  };
  watchKeyboard();
  watchLongPress();
  window.addEventListener('gm-auth-failure', async () => {
    S.providerError = 'API 키 인증에 실패했어요. 키 값, 결제 계정 연결, 사용 API(Maps JavaScript·Places (New)·Routes), 웹사이트 제한(리퍼러)을 확인해 주세요.';
    await useDemo();
    render({ fit: true });
  });
  render();
  connect();
  // 이 기기에 올려 둔 캐릭터 이미지가 있으면 그걸로 바꿔 그린다
  loadSprites().then((sp) => {
    if (!sp) return;
    S.sprites = sp;
    applySprites(sp);
    avatarElCache.clear();
    render();
  });
}

mount();
