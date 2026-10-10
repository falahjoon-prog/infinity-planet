@echo off
rem Installs the Infinity Planet brand fonts (Gabarito and DM Sans, free Google fonts) for this Windows user, so PowerPoint shows the templates exactly.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=(New-Object -ComObject Shell.Application).Namespace(0x14); Get-ChildItem -LiteralPath '%~dp0' -Filter *.ttf | ForEach-Object { if (-not (Test-Path (Join-Path $env:LOCALAPPDATA ('Microsoft\Windows\Fonts\' + $_.Name)))) { $f.CopyHere($_.FullName, 0x14) } }"
echo Brand fonts installed. Restart PowerPoint if it is open.
pause
