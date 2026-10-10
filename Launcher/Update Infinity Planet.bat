@echo off
title Infinity Planet - updating
cd /d "%~dp0.."
echo.
echo  Infinity Planet - installing the latest update
echo  ----------------------------------------------
echo  This takes a few minutes. Keep this window open.
echo.
rem Stop the copy that is already running (it uses port 3300)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3300 " ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>&1
echo  [1/3] Getting the parts the app needs...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 goto failed
echo  [2/3] Building the app...
call npm run build
if errorlevel 1 goto failed
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0shortcuts.ps1" >nul 2>&1
echo  [3/3] Starting Infinity Planet...
title Infinity Planet - keep this window open
start "" /b cmd /c "timeout /t 8 /nobreak >nul & start "" http://localhost:3300"
echo.
echo  Infinity Planet is running at http://localhost:3300
echo  You can minimise this window. Closing it stops the app.
echo  Next time, just use the Infinity Planet icon on your Desktop.
echo.
call npm start
goto end
:failed
echo.
echo  Something went wrong above. Take a screenshot of this window and send it to Claude.
pause
:end
