#!/bin/bash
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "[안내] Node.js가 설치되어 있지 않아요."
  echo "https://nodejs.org 에서 LTS 버전을 설치한 뒤 이 파일을 다시 실행하세요."
  echo ""
  read -r -p "엔터를 누르면 창이 닫혀요." _
  exit 1
fi
node server.mjs
