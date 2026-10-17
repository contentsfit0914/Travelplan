// 내 PC 전용 실행 서버. 추가 설치 없이 Node.js만으로 동작한다.
// - 127.0.0.1(이 PC)에서만 접속 가능: 같은 와이파이의 다른 기기는 접속할 수 없다
// - 앱 파일만 제공하고 .git·테스트 등은 막는다
// 사용: node server.mjs  (옵션: --no-open 브라우저 자동 열기 끄기)

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const HOST = '127.0.0.1';
// Google API 키의 웹사이트 제한(http://localhost:5173/*)과 맞추기 위해 포트를 고정한다
const PORT = 5173;
const URL_TO_OPEN = `http://localhost:${PORT}`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
// 앱 실행에 필요한 경로만 공개
const ALLOWED = /^\/(index\.html|config\.js|css\/[\w.-]+\.css|js\/[\w/.-]+\.js|vendor\/leaflet\/[\w.-]+\.(js|css|png)|assets\/icons\/[a-z]+\.png)$/;

const server = http.createServer(async (req, res) => {
  const send = (code, body, type = 'text/plain; charset=utf-8') => {
    res.writeHead(code, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method Not Allowed');
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, URL_TO_OPEN).pathname);
  } catch {
    return send(400, 'Bad Request');
  }
  if (path === '/') path = '/index.html';
  if (!ALLOWED.test(path) || path.includes('..')) return send(404, 'Not Found');
  const file = resolve(ROOT, `.${path}`);
  if (!file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) return send(404, 'Not Found');
  try {
    if (!(await stat(file)).isFile()) return send(404, 'Not Found');
    send(200, await readFile(file), TYPES[extname(file)] || 'application/octet-stream');
  } catch {
    send(404, 'Not Found');
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n[오류] ${PORT}번 포트를 이미 다른 프로그램이 쓰고 있어요.`);
    console.error('  - 여행 플래너 창이 이미 열려 있다면 그 창을 닫고 다시 실행하세요.');
    console.error('  - 그래도 안 되면 PC를 재시작한 뒤 실행하세요.\n');
  } else {
    console.error('\n[오류] 서버를 시작하지 못했어요:', e.message, '\n');
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('\n  도쿄 여행 플래너 실행 중');
  console.log(`  주소: ${URL_TO_OPEN}`);
  console.log('  이 창을 닫으면 앱이 종료돼요.\n');
  if (!process.argv.includes('--no-open')) {
    const cmd =
      process.platform === 'win32'
        ? `start "" "${URL_TO_OPEN}"`
        : process.platform === 'darwin'
          ? `open "${URL_TO_OPEN}"`
          : `xdg-open "${URL_TO_OPEN}"`;
    exec(cmd, () => {});
  }
});
