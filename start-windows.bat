@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [안내] Node.js가 설치되어 있지 않아요.
  echo https://nodejs.org 에서 LTS 버전을 설치한 뒤 이 파일을 다시 실행하세요.
  echo.
  pause
  exit /b 1
)
node server.mjs
pause
