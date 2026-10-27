const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, shell, protocol, dialog } = require('electron');
const path = require('path');
const Config = require('./core/config');
const PluginManager = require('./core/plugin-manager');
const { registerPluginProtocol } = require('./core/plugin-protocol');

const APP_NAME = { en: 'Orbit Toolbox', zh: '轨道工具箱' };

let win = null;
let tray = null;
let cfg = null;
let manager = null;
let quitting = false;

/* Plugin UI files are served over this scheme so built-in and user-installed
   plugins load through one code path (script/style/aux windows alike). */
protocol.registerSchemesAsPrivileged([
  { scheme: 'plugin', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

/* --- host window ----------------------------------------------------------- */

function createWindow() {
  const isMac = process.platform === 'darwin';
  const bounds = cfg.data.windowBounds || { width: 980, height: 680 };
  win = new BrowserWindow({
    ...bounds,
    minWidth: 760, minHeight: 520,
    show: false,
    backgroundColor: '#0a0c0d',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    title: `${APP_NAME.en} · ${APP_NAME.zh}`,
    ...(isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 20 } }
      : { frame: false }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  const saveBounds = () => {
    if (win.isDestroyed() || win.isMinimized()) return;
    cfg.set({ windowBounds: win.getBounds() });
  };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) win.on(ev, () => setTimeout(saveBounds, 400));

  // Closing hides to tray so the global hotkey stays one keystroke away.
  win.on('close', e => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
  });

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
    else if (input.key === 'Escape' && win.isFullScreen()) { e.preventDefault(); win.setFullScreen(false); }
  });
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) win.hide();
  else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send('palette-focus');
  }
}

/* --- global hotkeys ---------------------------------------------------------- */

function pluginActionHandlers() {
  // key "pluginId:actionId" -> {pluginId, method}
  const map = {};
  for (const p of manager.plugins.values()) {
    if (!Array.isArray(p.manifest.actions)) continue;
    for (const a of p.manifest.actions) {
      if (a.id && a.method) map[`${p.id}:${a.id}`] = { pluginId: p.id, method: a.method };
    }
  }
  return map;
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  try { globalShortcut.register(cfg.data.hotkey, toggleWindow); }
  catch { /* keep going: the settings page shows the failure */ }

  const handlers = pluginActionHandlers();
  for (const pl of manager.plugins.values()) {
    if (!pl.enabled || !Array.isArray(pl.manifest.actions)) continue;
    for (const a of pl.manifest.actions) {
      const key = `${pl.id}:${a.id}`;
      const accel = cfg.data.pluginHotkeys[key] ?? a.hotkey;
      if (!accel) continue;
      const h = handlers[key];
      try {
        globalShortcut.register(accel, () => manager.call(h.pluginId, h.method, {}).catch(() => {}));
      } catch { /* occupied by another app; ignore */ }
    }
  }
}

function trySetHotkey(accel) {
  globalShortcut.unregister(cfg.data.hotkey);
  let ok = true;
  try { globalShortcut.register(accel, toggleWindow); }
  catch { ok = false; globalShortcut.register(cfg.data.hotkey, toggleWindow); }
  if (ok) cfg.set({ hotkey: accel });
  return ok;
}

function trySetPluginHotkey(key, accel) {
  const previous = cfg.data.pluginHotkeys[key];
  const handlers = pluginActionHandlers();
  const h = handlers[key];
  if (!h) return { ok: false, err: 'unknown action' };
  if (previous) globalShortcut.unregister(previous);
  const target = accel || null;
  if (target) {
    try { globalShortcut.register(target, () => manager.call(h.pluginId, h.method, {}).catch(() => {})); }
    catch {
      if (previous) { try { globalShortcut.register(previous, () => manager.call(h.pluginId, h.method, {}).catch(() => {})); } catch { /* give up quietly */ } }
      return { ok: false, err: 'conflict' };
    }
  }
  const next = { ...cfg.data.pluginHotkeys };
  if (target) next[key] = target; else delete next[key];
  cfg.set({ pluginHotkeys: next });
  return { ok: true, hotkey: target || undefined };
}

/* --- tray --------------------------------------------------------------------- */

function createTray() {
  tray = new Tray(path.join(__dirname, '..', 'build', 'icon.png'));
  tray.setToolTip(`${APP_NAME.en} · ${APP_NAME.zh}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示工具箱 / Show', click: () => toggleWindow() },
    { type: 'separator' },
    { label: '退出 / Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => toggleWindow());
}

/* --- IPC surface --------------------------------------------------------------- */

ipcMain.handle('boot', () => ({
  platform: process.platform,
  appVersion: app.getVersion(),
  name: APP_NAME,
  config: { hotkey: cfg.data.hotkey, lang: cfg.data.lang, theme: cfg.data.theme },
  plugins: manager.serialize(),
}));

ipcMain.handle('plugin-call', async (e, payload) => {
  const { id, method, args } = payload || {};
  if (typeof id !== 'string' || typeof method !== 'string') return { ok: false, error: 'bad call' };
  try {
    const data = await manager.call(id, method, args, e);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

ipcMain.handle('plugin-set-enabled', (e, payload) => {
  manager.setEnabled(payload.id, payload.on);
  registerHotkeys();
  return manager.serialize();
});

ipcMain.handle('plugin-rescan', () => {
  manager.deactivateAll();
  manager.discover();
  for (const p of manager.plugins.values()) if (p.enabled) manager.activate(p.id);
  registerHotkeys();
  return manager.serialize();
});

ipcMain.handle('set-hotkey', (e, accel) => {
  const ok = trySetHotkey(String(accel || ''));
  return { ok, hotkey: cfg.data.hotkey };
});

ipcMain.handle('set-plugin-hotkey', (e, payload) => trySetPluginHotkey(payload.key, payload.accel || null));

ipcMain.handle('set-pref', (e, { k, v }) => {
  if (!['lang', 'theme'].includes(k)) return cfg.data;
  cfg.set({ [k]: v });
  return cfg.data;
});

ipcMain.handle('open-external', (e, url) => {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
});

ipcMain.handle('open-user-plugins', () => {
  const fs = require('fs');
  fs.mkdirSync(manager.userRoot, { recursive: true });
  shell.openPath(manager.userRoot);
});

ipcMain.handle('choose-save-png', async () => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Save PNG',
    defaultPath: `orbit-${Date.now()}.png`,
    filters: [{ name: 'PNG', extensions: ['png'] }],
  });
  return r.canceled ? null : r.filePath;
});

ipcMain.on('win', (e, action) => {
  if (!win) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'close') win.close();
  else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
});

/* --- boot ------------------------------------------------------------------------ */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => toggleWindow());

  app.whenReady().then(() => {
    cfg = new Config(app.getPath('userData'));
    manager = new PluginManager({ userDataDir: app.getPath('userData'), config: cfg, getHostWindow: () => win });
    registerPluginProtocol(manager);
    manager.discover();
    for (const p of manager.plugins.values()) if (p.enabled) manager.activate(p.id);
    createWindow();
    createTray();
    registerHotkeys();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else toggleWindow(); });
  });

  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); manager && manager.deactivateAll(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') { quitting = true; app.quit(); } });
}
