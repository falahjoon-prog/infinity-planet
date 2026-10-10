// Infinity Planet desktop app — a secure shell around the Infinity Planet server.
// No API keys or database credentials live on team PCs; the app only stores the server address.
const { app, BrowserWindow, ipcMain, Notification, shell, Menu, Tray, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG = path.join(app.getPath('userData'), 'config.json');
const DEFAULTS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.default.json'), 'utf8')); } catch { return {}; } })();
const readConfig = () => { try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG, 'utf8')) }; } catch { return { ...DEFAULTS }; } };
const writeConfig = (c) => { fs.mkdirSync(path.dirname(CONFIG), { recursive: true }); fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2)); };

let win = null; let tray = null; let quitting = false;
const serverOrigin = () => { try { return new URL(readConfig().serverUrl).origin; } catch { return null; } };

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
app.setAppUserModelId('city.rhc.desktop');

function createWindow() {
  const cfg = readConfig();
  const bounds = cfg.bounds || { width: 1440, height: 900 };
  win = new BrowserWindow({
    ...bounds, minWidth: 380, minHeight: 600, title: 'Infinity Planet', backgroundColor: '#0d1b2e', show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  if (cfg.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  const saveBounds = () => { if (!win || win.isDestroyed()) return; const c = readConfig(); c.maximized = win.isMaximized(); if (!c.maximized) c.bounds = win.getBounds(); writeConfig(c); };
  win.on('resize', saveBounds); win.on('move', saveBounds);
  win.on('close', (e) => { if (!quitting && tray) { e.preventDefault(); win.hide(); } });

  // Keep navigation on the Infinity Planet server; everything else opens in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url === '') return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true } } };
    const origin = serverOrigin();
    if (origin && url.startsWith(origin)) { win.loadURL(url); return { action: 'deny' }; }
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const origin = serverOrigin();
    if (url.startsWith('file://')) return;
    if (origin && new URL(url).origin === origin) return;
    if (/accounts\.google\.com/.test(url)) return; // Google OAuth consent (admin connecting Google)
    e.preventDefault(); shell.openExternal(url);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    if (code === -3 || url.startsWith('file://')) return; // aborted
    win.loadFile(path.join(__dirname, 'setup.html'), { query: { error: `Could not reach ${url} (${desc}). Check the server address or that the Infinity Planet server is running.` } });
  });
  loadApp();
}

function loadApp() {
  const url = readConfig().serverUrl;
  if (url) win.loadURL(url); else win.loadFile(path.join(__dirname, 'setup.html'));
}

function buildMenu() {
  const template = [
    { label: 'Infinity Planet', submenu: [
      { label: 'Home', accelerator: 'CmdOrCtrl+Shift+H', click: () => loadApp() },
      { label: 'Change server address…', click: () => win.loadFile(path.join(__dirname, 'setup.html'), { query: { current: readConfig().serverUrl || '' } }) },
      { type: 'separator' },
      { label: 'Open in web browser', click: () => { const u = readConfig().serverUrl; if (u) shell.openExternal(u); } },
      { type: 'separator' },
      { label: 'Quit Infinity Planet', accelerator: 'CmdOrCtrl+Q', click: () => { quitting = true; app.quit(); } },
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, ...(process.env.RHC_DEVTOOLS ? [{ role: 'toggleDevTools' }] : [])] },
    { label: 'Help', submenu: [{ label: `Infinity Planet Desktop ${app.getVersion()}`, enabled: false }, { label: 'Server status', click: async () => { const u = readConfig().serverUrl; if (!u) return; try { const r = await fetch(new URL('/api/system/health', u)); const j = await r.json(); dialog.showMessageBox(win, { message: j.ok ? 'Infinity Planet server is online' : 'Infinity Planet server is reachable but not healthy', detail: `${u}\nSupabase: ${j.supabase ? 'connected' : 'not connected'}\nVersion: ${j.version}` }); } catch (e) { dialog.showMessageBox(win, { type: 'error', message: 'Cannot reach the Infinity Planet server', detail: `${u}\n${e.message}` }); } } }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function buildTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png')));
    tray.setToolTip('Infinity Planet');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Infinity Planet', click: () => { win.show(); win.focus(); } },
      { label: 'Approvals', click: () => { win.show(); navigate('/approvals'); } },
      { label: 'Tasks', click: () => { win.show(); navigate('/tasks'); } },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]));
    tray.on('click', () => { win.isVisible() ? win.focus() : win.show(); });
  } catch { tray = null; }
}

function navigate(href) { if (win) win.webContents.send('rhc:navigate', href); }

// ---- IPC from the page (via preload) ----
ipcMain.on('rhc:notify', (_e, { title, body, href }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: String(title || 'Infinity Planet').slice(0, 120), body: String(body || '').slice(0, 300), icon: path.join(__dirname, 'build', 'icon.png') });
  n.on('click', () => { win.show(); win.focus(); if (href) navigate(href); });
  n.show();
});
ipcMain.on('rhc:badge', (_e, count) => {
  const n = Number(count) || 0;
  if (process.platform === 'darwin') app.dock?.setBadge(n ? String(n) : '');
  else if (win) win.flashFrame(n > 0 && !win.isFocused());
  if (tray) tray.setToolTip(n ? `Infinity Planet — ${n} item(s) need attention` : 'Infinity Planet');
});
ipcMain.handle('rhc:set-server', async (_e, url) => {
  let u; try { u = new URL(String(url).trim()); } catch { return { ok: false, error: 'Enter a full address, e.g. http://192.168.1.20:3300' }; }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, error: 'Use http:// or https://' };
  try {
    const r = await fetch(new URL('/api/system/health', u.origin), { signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    if (!['Infinity Planet', 'Infinity Planet'].includes(j.app)) return { ok: false, error: 'That address is reachable but is not an Infinity Planet server.' };
    writeConfig({ ...readConfig(), serverUrl: u.origin });
    setTimeout(loadApp, 200);
    return { ok: true, supabase: !!j.supabase };
  } catch (e) { return { ok: false, error: `Could not reach ${u.origin}: ${e.message}` }; }
});
ipcMain.handle('rhc:get-server', () => readConfig().serverUrl || '');

app.whenReady().then(() => { buildMenu(); createWindow(); buildTray(); });
app.on('activate', () => { if (win) win.show(); });
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
