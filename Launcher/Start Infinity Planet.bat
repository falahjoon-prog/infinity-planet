@echo off
title Infinity Planet - keep this window open
cd /d "%~dp0.."
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3300 " ^| findstr LISTENING') do (
  start "" http://localhost:3300
  exit /b 0
)
if not exist ".next\BUILD_ID" (
  echo First start - building the app, this takes a few minutes...
  call npm run build || (echo Build failed - send a screenshot to Claude & pause & exit /b 1)
)
if not exist "%USERPROFILE%\Desktop\Infinity Planet.lnk" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0shortcuts.ps1" >nul 2>&1
start "" /b cmd /c "timeout /t 6 /nobreak >nul & start "" http://localhost:3300"
echo.
echo  Infinity Planet is running at http://localhost:3300
echo  You can minimise this window. Closing it stops the app.
echo.
call npm start
