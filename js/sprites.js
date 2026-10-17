// 사용자가 올린 캐릭터 스프라이트 시트를 이 기기(IndexedDB)에만 보관한다.
// 공개 사이트·저장소에는 이미지가 올라가지 않고, 일정 내보내기 파일에도 들어가지 않는다.

const DB = 'travelplan';
const STORE = 'sprites';
export const SPRITE_KEYS = ['down', 'left', 'right', 'up', 'eat'];
const COLS = 4;
const ROWS = 2;
const CELL = 240; // 저장 시트의 한 칸(px)

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

// { down, left, right, up, eat } → 각 값은 data:image/png 문자열. 하나도 없으면 null
export async function loadSprites() {
  try {
    const out = {};
    for (const k of SPRITE_KEYS) {
      const v = await tx('readonly', (s) => s.get(k));
      if (typeof v === 'string' && v.startsWith('data:image/')) out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null; // 사생활 보호 모드 등 IndexedDB를 못 쓰면 기본 캐릭터
  }
}

export const saveSprite = (key, dataUrl) => tx('readwrite', (s) => s.put(dataUrl, key));
export const deleteSprite = (key) => tx('readwrite', (s) => s.delete(key));
export const clearSprites = () => tx('readwrite', (s) => s.clear());

// 올린 시트(4×2 칸)를 칸마다 여백을 잘라내고 같은 비율로 줄여 발끝을 맞춘 960×480 PNG로 만든다
export async function normalizeSheet(file) {
  const bmp = await createImageBitmap(file);
  const cw = bmp.width / COLS;
  const ch = bmp.height / ROWS;
  const src = document.createElement('canvas');
  src.width = bmp.width;
  src.height = bmp.height;
  const sc = src.getContext('2d', { willReadFrequently: true });
  sc.drawImage(bmp, 0, 0);
  bmp.close?.();
  // 칸별로 투명하지 않은 영역 찾기
  const cells = [];
  let max = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const x0 = Math.round(c * cw);
      const y0 = Math.round(r * ch);
      const w = Math.round(cw);
      const h = Math.round(ch);
      const { data } = sc.getImageData(x0, y0, w, h);
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      if (maxX < 0) throw new Error('빈 칸이 있어요. 4×2 칸에 캐릭터가 모두 있는 투명 배경 PNG여야 해요.');
      const box = { x: x0 + minX, y: y0 + minY, w: maxX - minX + 1, h: maxY - minY + 1 };
      max = Math.max(max, box.w, box.h);
      cells.push(box);
    }
  const scale = (CELL - 16) / max;
  const out = document.createElement('canvas');
  out.width = CELL * COLS;
  out.height = CELL * ROWS;
  const oc = out.getContext('2d');
  oc.imageSmoothingQuality = 'high';
  cells.forEach((b, i) => {
    const w = Math.round(b.w * scale);
    const h = Math.round(b.h * scale);
    const x = (i % COLS) * CELL + Math.floor((CELL - w) / 2);
    const y = Math.floor(i / COLS) * CELL + (CELL - 8 - h); // 발끝을 아래에 맞춤
    oc.drawImage(src, b.x, b.y, b.w, b.h, x, y, w, h);
  });
  return out.toDataURL('image/png');
}

// 저장한 시트를 CSS 변수로 올려 .spr-* 가 쓰게 한다
export function applySprites(sprites) {
  const root = document.documentElement.style;
  for (const k of SPRITE_KEYS) {
    const v = sprites?.[k] || sprites?.down;
    if (v) root.setProperty(`--spr-${k}`, `url("${v}")`);
    else root.removeProperty(`--spr-${k}`);
  }
}
