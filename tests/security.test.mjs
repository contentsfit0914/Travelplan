import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// store.js 가 localStorage/sessionStorage 를 쓰므로 노드에서는 빈 구현을 둔다
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { sanitizeTrip, validateImported, safeUrl, isLikelyApiKey, maskKey } = await import('../js/store.js');

test('저장소에 Google API 키가 커밋되지 않았다', () => {
  const KEY_RE = /AIza[0-9A-Za-z_-]{35}/;
  const skip = new Set(['.git', 'node_modules', 'vendor']);
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|mjs|json|html|css|md|yml|yaml|txt)$/.test(name) && !p.endsWith('security.test.mjs') && KEY_RE.test(readFileSync(p, 'utf8'))) hits.push(p);
    }
  };
  walk(new URL('..', import.meta.url).pathname);
  assert.deepEqual(hits, [], `키로 보이는 문자열이 있는 파일: ${hits.join(', ')}`);
});

test('링크는 https만, 사진은 https·data:image만 허용', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('JaVaScRiPt:alert(1)'), null);
  assert.equal(safeUrl('http://example.com'), null);
  assert.equal(safeUrl('https://maps.google.com/?cid=1'), 'https://maps.google.com/?cid=1');
  assert.equal(safeUrl('data:text/html,<script>1</script>', { image: true }), null);
  assert.ok(safeUrl('data:image/png;base64,AAAA', { image: true }));
});

test('불러온 파일의 위험한 값은 제거·대체된다', () => {
  const evil = {
    v: 1,
    startDate: '2026-11-19"><img src=x onerror=alert(1)>',
    nights: 99,
    days: [
      {
        stops: [
          {
            id: '" onmouseover="alert(1)',
            uid: '"><script>alert(1)</script>',
            name: '<b>x</b>',
            lat: 35.6,
            lng: 139.7,
            mapsUrl: 'javascript:alert(1)',
            photo: 'javascript:alert(1)',
            kind: 'evil',
            mode: 'ROCKET',
            meal: 'brunch',
            stay: -100,
            types: ['restaurant', 'x" onload="y'],
          },
          { name: '좌표 없음' },
        ],
        returnMode: '<x>',
      },
    ],
    hotel: { name: 'h', lat: 'abc', lng: 1 },
    lunch: '25:99',
  };
  const t = validateImported(evil);
  const s = t.days[0].stops[0];
  assert.equal(t.days[0].stops.length, 1);
  assert.match(s.id, /^imp:/);
  assert.match(s.uid, /^[a-z0-9]+$/);
  assert.equal(s.mapsUrl, null);
  assert.equal(s.photo, null);
  assert.equal(s.kind, 'sight');
  assert.equal(s.mode, 'AUTO');
  assert.equal(s.meal, null);
  assert.equal(s.stay, 15);
  assert.deepEqual(s.types, ['restaurant']);
  assert.equal(t.days[0].returnMode, 'AUTO');
  assert.equal(t.hotel, null);
  assert.equal(t.nights, 7);
  assert.equal(t.days.length, 8);
  assert.match(t.startDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(t.lunch, '12:00');
  assert.ok(!('apiKey' in t));
});

test('일정 데이터에 API 키 필드가 끼어들지 않는다', () => {
  const t = sanitizeTrip({ v: 1, startDate: '2026-11-19', days: [], apiKey: 'AIza' + 'x'.repeat(35) });
  assert.ok(!JSON.stringify(t).includes('AIza'));
});

test('API 키 형식 검사와 마스킹', () => {
  const k = 'AIza' + 'A1b2_-'.repeat(5) + 'abcde';
  assert.equal(k.length, 39);
  assert.ok(isLikelyApiKey(k));
  assert.ok(!isLikelyApiKey(k + ' '));
  assert.ok(!isLikelyApiKey('sk-123'));
  assert.equal(maskKey(k), 'AIza••••bcde');
});
