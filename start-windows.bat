@echo off
rem Run the Roya card app on a Windows PC for testing. Double-click this file.
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 22 LTS from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing packages, first run only...
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto error
)
call npm run local
if errorlevel 1 goto error
exit /b 0
:error
echo.
echo Something went wrong. Read the messages above.
pause
exit /b 1
