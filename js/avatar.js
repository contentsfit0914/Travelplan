// 내 캐릭터(아바타). 기본은 SVG 마스코트, 사용자가 올린 스프라이트 시트가 있으면(sprites.js) 그걸로 대신 그린다.
// 잉크색 외곽선 + 단색 면 + 옅은 그늘 한 겹(스티커 느낌). 그라데이션은 쓰지 않는다.

export const AVATAR_BODIES = [
  ['round', '동글'],
  ['square', '네모'],
  ['capsule', '캡슐'],
  ['tri', '세모'],
  ['hex', '육각'],
];
export const AVATAR_EARS = [
  ['round', '동글 귀'],
  ['cat', '고양이'],
  ['rabbit', '토끼'],
  ['none', '없음'],
];
export const AVATAR_COLORS = ['#FFF6E8', '#FFB3A7', '#FFD56B', '#BFE8C8', '#A9D8FF', '#D8C7FF', '#FFC1DC', '#C9CFD8'];
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

export const defaultAvatar = () => ({ body: 'round', ears: 'round', color: '#FFF6E8', face: 'dot', hat: 'none', item: 'backpack', name: '' });

const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const randomAvatar = (name = '') => ({
  body: pick(AVATAR_BODIES)[0],
  ears: pick(AVATAR_EARS)[0],
  color: pick(AVATAR_COLORS),
  face: pick(AVATAR_FACES)[0],
  hat: pick(AVATAR_HATS)[0],
  item: pick(AVATAR_ITEMS)[0],
  name,
});

const okHex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#FFF6E8');
const inList = (v, list, d) => (list.some(([k]) => k === v) ? v : d);
export function cleanAvatar(a) {
  const d = defaultAvatar();
  if (!a || typeof a !== 'object') return d;
  return {
    body: inList(a.body, AVATAR_BODIES, d.body),
    ears: inList(a.ears, AVATAR_EARS, d.ears),
    color: okHex(a.color),
    face: inList(a.face, AVATAR_FACES, d.face),
    hat: inList(a.hat, AVATAR_HATS, d.hat),
    item: inList(a.item, AVATAR_ITEMS, d.item),
    name: typeof a.name === 'string' ? a.name.slice(0, 8) : '',
  };
}

const INK = '#1C2433';
const SW = 2.4; // 외곽선 굵기
const CHEEK = '#FF9FB0';

// 몸 도형. 모두 가로 중심 50, 발 끝이 y≈92 근처에 오도록 맞춘다
const BODY = {
  round: { path: 'M50 30 C72 30 84 46 84 63 C84 82 70 92 50 92 C30 92 16 82 16 63 C16 46 28 30 50 30 Z', eye: 58, top: 31, mouth: 70 },
  square: { path: 'M30 32 H70 Q84 32 84 46 V78 Q84 92 70 92 H30 Q16 92 16 78 V46 Q16 32 30 32 Z', eye: 58, top: 32, mouth: 70 },
  capsule: { path: 'M50 24 C68 24 80 36 80 52 V70 C80 84 68 92 50 92 C32 92 20 84 20 70 V52 C20 36 32 24 50 24 Z', eye: 54, top: 25, mouth: 67 },
  tri: { path: 'M50 28 C54 28 57 31 59 35 L84 80 C88 87 84 92 77 92 H23 C16 92 12 87 16 80 L41 35 C43 31 46 28 50 28 Z', eye: 64, top: 30, mouth: 76 },
  hex: { path: 'M50 27 L80 44 Q84 46 84 50 V76 Q84 80 80 82 L50 92 L20 82 Q16 80 16 76 V50 Q16 46 20 44 Z', eye: 58, top: 29, mouth: 70 },
};

function ears(kind, b, color) {
  const y = b.top + 4;
  const style = `fill="${color}" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"`;
  const inner = `fill="${CHEEK}" opacity=".8"`;
  switch (kind) {
    case 'round':
      return `<circle cx="27" cy="${y}" r="9" ${style}/><circle cx="73" cy="${y}" r="9" ${style}/><circle cx="27" cy="${y}" r="4" ${inner}/><circle cx="73" cy="${y}" r="4" ${inner}/>`;
    case 'cat':
      return `<path d="M20 ${y + 6} L23 ${y - 16} L38 ${y - 2} Z" ${style}/><path d="M80 ${y + 6} L77 ${y - 16} L62 ${y - 2} Z" ${style}/><path d="M25 ${y + 2} L26 ${y - 9} L33 ${y - 2} Z" ${inner}/><path d="M75 ${y + 2} L74 ${y - 9} L67 ${y - 2} Z" ${inner}/>`;
    case 'rabbit':
      return `<rect x="26" y="${y - 30}" width="14" height="36" rx="7" ${style} transform="rotate(-8 33 ${y - 12})"/><rect x="60" y="${y - 30}" width="14" height="36" rx="7" ${style} transform="rotate(8 67 ${y - 12})"/><rect x="30" y="${y - 25}" width="6" height="24" rx="3" ${inner} transform="rotate(-8 33 ${y - 12})"/><rect x="64" y="${y - 25}" width="6" height="24" rx="3" ${inner} transform="rotate(8 67 ${y - 12})"/>`;
    default:
      return '';
  }
}

function face(kind, eyeY, mouthY) {
  const l = 40;
  const r = 60;
  const eye = (x) => `<circle cx="${x}" cy="${eyeY}" r="4.6" fill="${INK}"/><circle cx="${x + 1.6}" cy="${eyeY - 1.6}" r="1.5" fill="#fff"/>`;
  const arc = (x) => `<path d="M${x - 4.5} ${eyeY + 1.5} q4.5 -6.5 9 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
  const line = (x) => `<path d="M${x - 4.5} ${eyeY} h9" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
  const cheeks = `<ellipse cx="31" cy="${eyeY + 7}" rx="5" ry="3" fill="${CHEEK}" opacity=".7"/><ellipse cx="69" cy="${eyeY + 7}" rx="5" ry="3" fill="${CHEEK}" opacity=".7"/>`;
  // 작은 'ω' 입
  const mouth = `<path d="M46 ${mouthY} q2 3 4 0 q2 3 4 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  let eyes;
  if (kind === 'happy') eyes = arc(l) + arc(r);
  else if (kind === 'wink') eyes = eye(l) + arc(r);
  else if (kind === 'sleepy') eyes = line(l) + line(r);
  else if (kind === 'glasses')
    eyes =
      eye(l) +
      eye(r) +
      `<g fill="none" stroke="${INK}" stroke-width="2.2"><circle cx="${l}" cy="${eyeY}" r="8"/><circle cx="${r}" cy="${eyeY}" r="8"/><path d="M${l + 8} ${eyeY} h${r - l - 16}"/></g>`;
  else eyes = eye(l) + eye(r);
  return cheeks + eyes + mouth;
}

function hat(kind, top) {
  const st = `stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"`;
  const red = '#FF5A3C';
  const navy = '#3C5BFF';
  const sun = '#FFD23F';
  switch (kind) {
    case 'cap':
      return `<path d="M27 ${top + 7} a23 20 0 0 1 46 0 Z" fill="${red}" ${st}/><path d="M60 ${top + 5} h26 a4 4 0 0 1 0 8 h-26 Z" fill="${red}" ${st}/><rect x="24" y="${top + 3}" width="52" height="7" rx="3.5" fill="#fff" ${st}/>`;
    case 'beanie':
      return `<path d="M27 ${top + 9} a23 24 0 0 1 46 0 Z" fill="${navy}" ${st}/><rect x="25" y="${top + 3}" width="50" height="9" rx="4.5" fill="#fff" ${st}/><circle cx="50" cy="${top - 14}" r="5.5" fill="#fff" ${st}/>`;
    case 'bucket':
      return `<path d="M34 ${top - 10} h32 l5 18 h-42 Z" fill="${sun}" ${st}/><rect x="22" y="${top + 6}" width="56" height="7" rx="3.5" fill="${sun}" ${st}/>`;
    case 'beret':
      return `<ellipse cx="46" cy="${top}" rx="26" ry="11" fill="${red}" ${st} transform="rotate(-8 46 ${top})"/><circle cx="46" cy="${top - 11}" r="2.5" fill="${INK}"/>`;
    case 'crown':
      return `<path d="M31 ${top + 8} L31 ${top - 9} L40 ${top} L50 ${top - 15} L60 ${top} L69 ${top - 9} L69 ${top + 8} Z" fill="${sun}" ${st}/>`;
    default:
      return '';
  }
}

function item(kind) {
  const st = `stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"`;
  switch (kind) {
    case 'backpack':
      return {
        back: `<rect x="62" y="44" width="28" height="38" rx="10" fill="#4FB3FF" ${st}/><rect x="68" y="38" width="16" height="12" rx="6" fill="#4FB3FF" ${st}/>`,
        front: '',
      };
    case 'camera':
      return {
        back: '',
        front: `<path d="M34 74 q16 12 32 0" fill="none" stroke="${INK}" stroke-width="2"/><rect x="40" y="78" width="20" height="14" rx="4" fill="${INK}"/><circle cx="50" cy="85" r="4.5" fill="#fff"/><circle cx="50" cy="85" r="2.4" fill="#4FB3FF"/><rect x="43" y="75" width="7" height="4" rx="1.5" fill="${INK}"/>`,
      };
    case 'suitcase':
      return {
        back: `<rect x="-2" y="58" width="22" height="34" rx="5" fill="#FF5A3C" ${st}/><rect x="5" y="50" width="8" height="10" rx="2" fill="none" ${st}/><circle cx="3" cy="94" r="2.5" fill="${INK}"/><circle cx="15" cy="94" r="2.5" fill="${INK}"/>`,
        front: '',
      };
    case 'flag':
      return {
        back: `<path d="M90 28 v60" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M90 28 h22 l-6 9 6 9 h-22 Z" fill="#FF5A3C" ${st}/>`,
        front: '',
      };
    default:
      return { back: '', front: '' };
  }
}

function mix(hex, to, w) {
  const n = parseInt(hex.slice(1), 16);
  const t = parseInt(to.slice(1), 16);
  const ch = (s) => Math.round(((n >> s) & 255) * (1 - w) + ((t >> s) & 255) * w);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

// opts: { size, walk, className, ground }
export function avatarSVG(a, { size = 64, walk = false, className = '', ground = true } = {}) {
  const av = cleanAvatar(a);
  const c = av.color;
  const b = BODY[av.body];
  const shade = mix(c, INK, 0.18);
  const id = `av${Math.random().toString(36).slice(2, 8)}`;
  const it = item(av.item);
  const limb = `fill="${c}" stroke="${INK}" stroke-width="${SW}"`;
  return `<svg class="avatar ${walk ? 'av-walk' : ''} ${className}" width="${size}" height="${size * 1.15}" viewBox="-6 6 112 100" aria-hidden="true">
    <defs><clipPath id="${id}"><path d="${b.path}"/></clipPath></defs>
    ${ground ? `<ellipse class="av-ground" cx="50" cy="98" rx="26" ry="4" fill="${INK}" opacity=".16"/>` : ''}
    <g class="av-body">
      ${it.back}
      ${ears(av.ears, b, c)}
      <g class="av-leg av-legL"><ellipse cx="37" cy="93" rx="8" ry="5" ${limb}/></g>
      <g class="av-leg av-legR"><ellipse cx="63" cy="93" rx="8" ry="5" ${limb}/></g>
      <path d="${b.path}" fill="${c}" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>
      <g clip-path="url(#${id})"><ellipse cx="50" cy="98" rx="40" ry="16" fill="${shade}" opacity=".55"/></g>
      <ellipse cx="20" cy="${b.mouth - 2}" rx="6.5" ry="4.5" ${limb} transform="rotate(20 20 ${b.mouth - 2})"/>
      <ellipse cx="80" cy="${b.mouth - 2}" rx="6.5" ry="4.5" ${limb} transform="rotate(-20 80 ${b.mouth - 2})"/>
      ${face(av.face, b.eye, b.mouth)}
      ${it.front}
      ${hat(av.hat, b.top)}
    </g>
  </svg>`;
}

// ---------------------------------------------------------------- 스프라이트(내 기기에만 저장한 캐릭터 이미지)
// 시트 1장 = 4×2 칸, 8프레임. 걷는 방향 4종 + 맛집·카페에서 먹는 동작
export const SPRITE_ANIMS = {
  down: '앞으로',
  left: '왼쪽으로',
  right: '오른쪽으로',
  up: '뒤로',
  eat: '먹기',
};

// 이동 방향 → 시트 이름. 위도 1도 ≈ 111km, 경도는 cos(위도)만큼 짧다
export function headingAnim(from, to) {
  const dy = to.lat - from.lat;
  const dx = (to.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180);
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'up' : 'down';
}

export function spriteHTML(anim = 'down', { size = 48, play = false, className = '' } = {}) {
  const a = SPRITE_ANIMS[anim] ? anim : 'down';
  return `<span class="spr spr-${a} ${play ? 'play' : ''} ${className}" style="--s:${size}px" aria-hidden="true"></span>`;
}

// 이미 만든 요소의 동작만 바꾼다(지도 마커를 새로 만들지 않도록)
export function setSprite(el, anim, play) {
  const spr = el.classList.contains('spr') ? el : el.querySelector('.spr');
  if (!spr) return;
  const a = SPRITE_ANIMS[anim] ? anim : 'down';
  if (!spr.classList.contains(`spr-${a}`)) {
    for (const k of Object.keys(SPRITE_ANIMS)) spr.classList.remove(`spr-${k}`);
    spr.classList.add(`spr-${a}`);
  }
  spr.classList.toggle('play', !!play);
}
