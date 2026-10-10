# Infinity Planet desktop app (Windows / macOS)

A secure Electron shell around the Infinity Planet server, for team PCs.

- First launch asks for the server address (e.g. `http://192.168.1.20:3300` or `https://rhc-server.tailnet.ts.net`) and verifies it is an Infinity Planet server.
- Only the server address is stored on the PC (`%APPDATA%\Infinity Planet\config.json`). No API keys, database credentials or passwords.
- Native desktop notifications for reminders, meetings, approvals and @mentions; tray icon; taskbar flash when items need attention.
- Navigation is locked to the Infinity Planet server; other links open in the default browser. The page has no Node.js access (context isolation and sandbox).
- Menu: **Infinity Planet → Change server address…** and **Help → Server status**.

## Build the installer (on Windows)
```powershell
npm install
npm run dist:win          # NSIS installer → dist\RHC-City-Setup-4.1.0.exe
npm run dist:win-portable # single portable .exe
```

## Pre-set the server address for your team
Put your address in `config.default.json` before building:
```json
{ "serverUrl": "https://rhc-server.your-tailnet.ts.net" }
```

## Code signing (optional)
Unsigned installers trigger a Windows SmartScreen warning ("More info → Run anyway"). To sign, set `CSC_LINK` (path to a .pfx code-signing certificate) and `CSC_KEY_PASSWORD` before `npm run dist:win`.
