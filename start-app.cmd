@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is missing. Install Node.js 20 or newer.
  pause
  exit /b 1
)
if not exist "tools\yt-dlp.exe" (
  echo Media tools missing. Run setup.ps1 first.
  pause
  exit /b 1
)
if exist "node_modules\electron\dist\electron.exe" (
  "node_modules\electron\dist\electron.exe" .
) else (
  echo Media Gecko desktop runtime missing. Run install-app.ps1 first.
  pause
)
