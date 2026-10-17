// 내 캐릭터: 쿠리만쥬 스프라이트(4×2, 8프레임) 애니메이션.
// 시트: assets/sprites/kurimanju-{left,up,down,right,eat}.png — 걷는 방향 4종 + 맛집·카페에서 먹는 동작.

export const SPRITE_ANIMS = {
  down: '앞으로',
  left: '왼쪽으로',
  right: '오른쪽으로',
  up: '뒤로',
  eat: '먹기',
};
export const SPRITE_FPS = 9;

export const defaultAvatar = () => ({ name: '' });
export function cleanAvatar(a) {
  return { name: a && typeof a.name === 'string' ? a.name.slice(0, 8) : '' };
}

// 이동 방향 → 애니메이션 이름. 위도 1도 ≈ 111km, 경도는 cos(위도)만큼 짧다
export function headingAnim(from, to) {
  const dy = to.lat - from.lat;
  const dx = (to.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180);
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'up' : 'down';
}

// anim: 시트 이름, play: 움직임, size: 한 변(px)
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
