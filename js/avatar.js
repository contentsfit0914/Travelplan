// 내 캐릭터(아바타): 도형을 조합한 장난감 느낌의 캐릭터를 SVG로 그린다.
// 입체감은 같은 도형 안에 밝은 면·그늘 면을 겹쳐 내는 셀 셰이딩 방식(그라데이션 없음, 플랫).

export const AVATAR_BODIES = [
  ['round', '동글'],
  ['square', '네모'],
  ['capsule', '캡슐'],
  ['tri', '세모'],
  ['hex', '육각'],
];
export const AVATAR_COLORS = ['#FF6B4A', '#4FB3FF', '#3ECF8E', '#FFD23F', '#A78BFA', '#FF7EB6', '#FFA26B', '#7D8CA3'];
export const AVATAR_FACES = [
  ['dot', '동그란 눈'],
  ['happy', '웃는 눈'],
  ['wink', '윙크'],
  ['glasses', '안경'],
  ['sleepy', '졸린 눈'],
];
export const AVATAR_HATS = [
  ['none', '없음'],
  ['cap', '캡모자'],
  ['beanie', '비니'],
  ['bucket', '버킷햇'],
  ['beret', '베레모'],
  ['crown', '왕관'],
];
export const AVATAR_ITEMS = [
  ['none', '없음'],
  ['backpack', '배낭'],
  ['camera', '카메라'],
  ['suitcase', '캐리어'],
  ['flag', '깃발'],
];

export const defaultAvatar = () => ({ body: 'round', color: '#FF6B4A', face: 'happy', hat: 'cap', item: 'backpack', name: '' });

const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const randomAvatar = (name = '') => ({
  body: pick(AVATAR_BODIES)[0],
  color: pick(AVATAR_COLORS),
  face: pick(AVATAR_FACES)[0],
  hat: pick(AVATAR_HATS)[0],
  item: pick(AVATAR_ITEMS)[0],
  name,
});

const okHex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#FF6B4A');
const inList = (v, list, d) => (list.some(([k]) => k === v) ? v : d);
export function cleanAvatar(a) {
  const d = defaultAvatar();
  if (!a || typeof a !== 'object') return d;
  return {
    body: inList(a.body, AVATAR_BODIES, d.body),
    color: okHex(a.color),
    face: inList(a.face, AVATAR_FACES, d.face),
    hat: inList(a.hat, AVATAR_HATS, d.hat),
    item: inList(a.item, AVATAR_ITEMS, d.item),
    name: typeof a.name === 'string' ? a.name.slice(0, 8) : '',
  };
}

// 색 섞기(밝은 면·그늘 면 계산)
function mix(hex, to, w) {
  const n = parseInt(hex.slice(1), 16);
  const t = parseInt(to.slice(1), 16);
  const ch = (s) => Math.round(((n >> s) & 255) * (1 - w) + ((t >> s) & 255) * w);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

const INK = '#1C2433';

// 몸 도형: 중심 (50,66), 폭 68
function bodyShape(kind) {
  switch (kind) {
    case 'square':
      return `<rect x="16" y="32" width="68" height="68" rx="18"/>`;
    case 'capsule':
      return `<rect x="21" y="24" width="58" height="80" rx="29"/>`;
    case 'tri':
      return `<path d="M50 26 L88 98 L12 98 Z" stroke-linejoin="round" stroke-width="16"/>`;
    case 'hex':
      return `<path d="M50 28 L84 47 L84 85 L50 104 L16 85 L16 47 Z" stroke-linejoin="round" stroke-width="12"/>`;
    default:
      return `<circle cx="50" cy="66" r="35"/>`;
  }
}

function face(kind, eyeY) {
  const l = 38;
  const r = 62;
  const eye = (x) => `<circle cx="${x}" cy="${eyeY}" r="4.2" fill="${INK}"/><circle cx="${x + 1.4}" cy="${eyeY - 1.4}" r="1.3" fill="#fff"/>`;
  const arc = (x) => `<path d="M${x - 5} ${eyeY + 1} q5 -7 10 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  const line = (x) => `<path d="M${x - 5} ${eyeY} h10" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  const cheeks = `<ellipse cx="31" cy="${eyeY + 9}" rx="5" ry="3" fill="#FF8DA1" opacity=".55"/><ellipse cx="69" cy="${eyeY + 9}" rx="5" ry="3" fill="#FF8DA1" opacity=".55"/>`;
  const smile = `<path d="M44 ${eyeY + 11} q6 5 12 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
  let eyes;
  if (kind === 'happy') eyes = arc(l) + arc(r);
  else if (kind === 'wink') eyes = eye(l) + arc(r);
  else if (kind === 'sleepy') eyes = line(l) + line(r);
  else if (kind === 'glasses')
    eyes =
      eye(l) +
      eye(r) +
      `<g fill="none" stroke="${INK}" stroke-width="2.6"><rect x="${l - 9}" y="${eyeY - 7.5}" width="18" height="15" rx="5"/><rect x="${r - 9}" y="${eyeY - 7.5}" width="18" height="15" rx="5"/><path d="M${l + 9} ${eyeY} h${r - l - 18}"/></g>`;
  else eyes = eye(l) + eye(r);
  return cheeks + eyes + smile;
}

function hat(kind, top, color) {
  const dark = mix(color, INK, 0.35);
  const red = '#E0362C';
  switch (kind) {
    case 'cap':
      return `<path d="M26 ${top + 8} a24 22 0 0 1 48 0 Z" fill="${red}"/><rect x="22" y="${top + 5}" width="56" height="7" rx="3.5" fill="${red}"/><path d="M58 ${top + 7} h26 a4 4 0 0 1 0 8 h-26 Z" fill="${mix(red, INK, 0.3)}"/><circle cx="50" cy="${top - 13}" r="3.5" fill="${red}"/>`;
    case 'beanie':
      return `<path d="M27 ${top + 10} a23 25 0 0 1 46 0 Z" fill="${dark}"/><rect x="24" y="${top + 4}" width="52" height="9" rx="4.5" fill="${mix(dark, '#ffffff', 0.25)}"/><circle cx="50" cy="${top - 14}" r="5.5" fill="#fff" stroke="${INK}" stroke-width="1.5"/>`;
    case 'bucket':
      return `<path d="M33 ${top - 12} h34 l5 20 h-44 Z" fill="#F2B134"/><rect x="20" y="${top + 6}" width="60" height="7" rx="3.5" fill="${mix('#F2B134', INK, 0.25)}"/>`;
    case 'beret':
      return `<ellipse cx="46" cy="${top - 1}" rx="27" ry="12" fill="${red}" transform="rotate(-8 46 ${top - 1})"/><circle cx="46" cy="${top - 12}" r="2.5" fill="${red}"/>`;
    case 'crown':
      return `<path d="M30 ${top + 8} L30 ${top - 10} L40 ${top} L50 ${top - 16} L60 ${top} L70 ${top - 10} L70 ${top + 8} Z" fill="#FFD23F" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;
    default:
      return '';
  }
}

function item(kind, color) {
  const dark = mix(color, INK, 0.4);
  switch (kind) {
    case 'backpack':
      return {
        back: `<rect x="60" y="48" width="30" height="40" rx="10" fill="${dark}"/><rect x="66" y="42" width="18" height="12" rx="6" fill="${dark}"/>`,
        front: `<path d="M38 50 q-6 12 0 24" fill="none" stroke="${dark}" stroke-width="4" stroke-linecap="round"/>`,
      };
    case 'camera':
      return {
        back: '',
        front: `<path d="M34 76 q16 14 32 0" fill="none" stroke="${INK}" stroke-width="2"/><rect x="40" y="82" width="20" height="14" rx="4" fill="${INK}"/><circle cx="50" cy="89" r="4.5" fill="#fff"/><circle cx="50" cy="89" r="2.4" fill="#4FB3FF"/><rect x="43" y="79" width="7" height="4" rx="1.5" fill="${INK}"/>`,
      };
    case 'suitcase':
      return {
        back: `<rect x="0" y="62" width="22" height="34" rx="5" fill="${dark}" stroke="${INK}" stroke-width="1.6"/><rect x="7" y="54" width="8" height="10" rx="2" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="5" cy="98" r="2.5" fill="${INK}"/><circle cx="17" cy="98" r="2.5" fill="${INK}"/>`,
        front: '',
      };
    case 'flag':
      return {
        back: `<path d="M88 30 v62" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M88 30 h22 l-6 9 6 9 h-22 Z" fill="#FF4F3A"/>`,
        front: '',
      };
    default:
      return { back: '', front: '' };
  }
}

// opts: { size, walk, className, flat }  flat=true 면 그림자 없이(목록용 작은 아이콘)
export function avatarSVG(a, { size = 64, walk = false, className = '', ground = true } = {}) {
  const av = cleanAvatar(a);
  const c = av.color;
  const hi = mix(c, '#ffffff', 0.38);
  const sh = mix(c, INK, 0.28);
  const legY = { round: 97, square: 98, capsule: 100, tri: 96, hex: 100 }[av.body];
  const eyeY = { round: 60, square: 60, capsule: 56, tri: 70, hex: 60 }[av.body];
  const top = { round: 36, square: 36, capsule: 28, tri: 36, hex: 32 }[av.body];
  const shape = bodyShape(av.body);
  const id = `av${Math.random().toString(36).slice(2, 8)}`;
  const it = item(av.item, c);
  return `<svg class="avatar ${walk ? 'av-walk' : ''} ${className}" width="${size}" height="${size * 1.2}" viewBox="-4 10 108 110" aria-hidden="true">
    <defs><clipPath id="${id}">${shape.replace('/>', ` stroke="#000" />`)}</clipPath></defs>
    ${ground ? `<ellipse class="av-ground" cx="50" cy="108" rx="30" ry="6" fill="${INK}" opacity=".14"/>` : ''}
    <g class="av-body">
      ${it.back}
      <g class="av-leg av-legL"><rect x="33" y="${legY - 4}" width="13" height="16" rx="6" fill="${sh}"/></g>
      <g class="av-leg av-legR"><rect x="54" y="${legY - 4}" width="13" height="16" rx="6" fill="${sh}"/></g>
      <g fill="${c}" stroke="${c}">${shape}</g>
      <g clip-path="url(#${id})">
        <ellipse cx="36" cy="46" rx="26" ry="20" fill="${hi}"/>
        <path d="M20 120 q40 -10 70 -48 q10 30 -5 60 Z" fill="${sh}" opacity=".9"/>
      </g>
      ${face(av.face, eyeY)}
      ${it.front}
      ${hat(av.hat, top, c)}
    </g>
  </svg>`;
}
