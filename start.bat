@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js not found.
  echo   Install Node 18+ from https://nodejs.org , then run this file again.
  echo   The static site still works without it - just open web\index.html .
  echo.
  pause
  exit /b 1
)

echo.
echo   Starting local server (zero dependencies)...
node "server\app.mjs" --open
pause
