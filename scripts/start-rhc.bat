@echo off
REM Starts the RHC City server on this PC (port 3300). Keep this window open.
cd /d "%~dp0\.."
title RHC City server
echo Starting RHC City on http://localhost:3300 ...
call npm start
pause
