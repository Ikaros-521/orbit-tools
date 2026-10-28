const { app, BrowserWindow, Tray, Menu, protocol, globalShortcut } = require('electron');
const path = require('path');

// Enforce standard sRGB color profile to avoid screen-capture color shifts across displays
app.commandLine.appendSwitch('force-color-profile', 'srgb');
const Config = require('./core/config');
const PluginManager = require('./core/plugin-manager');
const { registerPluginProtocol } = require('./core/plugin-protocol');
const createHotkeys = require('./core/hotkeys');
const registerIpc = require('./core/ipc');

const APP_NAME = { en: 'Orbit Toolbox', zh: '轨道工具箱' };

let win = null;
let tray = null;
let cfg = null;
let manager = null;
let hotkeys = null;
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

function bringToForeground(targetWin) {
  if (!targetWin || targetWin.isDestroyed()) return;
  if (targetWin.isMinimized()) targetWin.restore();
  targetWin.show();
  if (process.platform === 'win32') {
    targetWin.setAlwaysOnTop(true);
    targetWin.setAlwaysOnTop(false);
    targetWin.moveTop();
  }
  targetWin.focus();
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) {
    win.hide();
  } else {
    bringToForeground(win);
    win.webContents.send('palette-focus');
  }
}

function toggleActionPalette() {
  if (!win) return;
  const wasActive = win.isVisible() && win.isFocused();
  bringToForeground(win);
  win.webContents.send('open-action-palette', { wasActive });
}

/* --- tray --------------------------------------------------------------------- */

function createTray() {
  tray = new Tray(path.join(__dirname, '..', 'build', 'icon.png'));
  tray.setToolTip(`${APP_NAME.en} · ${APP_NAME.zh}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示工具箱 / Show Toolbox', click: () => toggleWindow() },
    { label: '呼出动作抽屉 / Action Palette', click: () => toggleActionPalette() },
    { type: 'separator' },
    { label: '退出 / Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => toggleWindow());
}

/* --- boot ------------------------------------------------------------------------ */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => toggleWindow());

  app.whenReady().then(() => {
    cfg = new Config(app.getPath('userData'));
    manager = new PluginManager({ userDataDir: app.getPath('userData'), config: cfg, getHostWindow: () => win });
    hotkeys = createHotkeys({
      cfg,
      manager,
      onSummon: toggleWindow,
      onSummonActionPalette: toggleActionPalette,
    });

    registerPluginProtocol(manager);
    registerIpc({ app, cfg, manager, hotkeys, getHostWindow: () => win });

    manager.discover();
    for (const p of manager.plugins.values()) if (p.enabled) manager.activate(p.id);
    hotkeys.registerAll({ allowFallback: true });

    createWindow();
    createTray();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else toggleWindow(); });
  });

  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); manager && manager.deactivateAll(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') { quitting = true; app.quit(); } });
}
