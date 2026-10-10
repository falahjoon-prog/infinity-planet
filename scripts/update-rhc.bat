@echo off
REM Re-installs dependencies and rebuilds RHC City after updating the source.
cd /d "%~dp0\.."
call npm install --no-audit --no-fund || goto :error
call npm run build || goto :error
echo.
echo Build complete. Start the server with scripts\start-rhc.bat
pause
exit /b 0
:error
echo.
echo Build failed - see the messages above.
pause
exit /b 1
