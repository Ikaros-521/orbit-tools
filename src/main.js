const { app, BrowserWindow, Tray, Menu, protocol, globalShortcut, screen } = require('electron');
const path = require('path');

// Enforce standard sRGB color profile to avoid screen-capture color shifts across displays
app.commandLine.appendSwitch('force-color-profile', 'srgb');
const Config = require('./core/config');
const PluginManager = require('./core/plugin-manager');
const { registerPluginProtocol } = require('./core/plugin-protocol');
const createHotkeys = require('./core/hotkeys');
const registerIpc = require('./core/ipc');
const { captureActiveSelection } = require('./core/selection');

const APP_NAME = { en: 'Orbit Toolbox', zh: '轨道工具箱' };

let win = null;
let paletteWin = null;
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

/* Saved bounds can point off-screen once a monitor is unplugged — clamp the
   window back into the nearest display's work area instead of vanishing. */
function sanitizeWindowBounds(saved) {
  const fallback = { width: 980, height: 680 };
  if (!saved || typeof saved !== 'object') return fallback;
  try {
    const display = screen.getDisplayMatching(saved);
    const wa = display.workArea;
    const width = Math.min(Math.max(Number(saved.width) || 980, 760), wa.width);
    const height = Math.min(Math.max(Number(saved.height) || 680, 520), wa.height);
    const x = Math.min(Math.max(Number.isFinite(saved.x) ? saved.x : wa.x, wa.x), wa.x + wa.width - 200);
    const y = Math.min(Math.max(Number.isFinite(saved.y) ? saved.y : wa.y, wa.y), wa.y + wa.height - 60);
    return { width, height, x, y };
  } catch {
    return fallback;
  }
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  const bounds = sanitizeWindowBounds(cfg.data.windowBounds);
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
    if (paletteWin && targetWin === paletteWin) {
      targetWin.setAlwaysOnTop(true);
    } else {
      targetWin.setAlwaysOnTop(true);
      targetWin.setAlwaysOnTop(false);
    }
    targetWin.moveTop();
  }
  targetWin.focus();
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) {
    win.hide();
  } else {
    // 呼出主工具箱工作台时，隐藏动作抽屉
    if (paletteWin && !paletteWin.isDestroyed() && paletteWin.isVisible()) {
      paletteWin.hide();
    }
    bringToForeground(win);
    sendWhenReady(win, 'palette-focus');
  }
}

function createPaletteWindow() {
  paletteWin = new BrowserWindow({
    width: 650,
    height: 440,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  paletteWin.loadFile(path.join(__dirname, 'renderer', 'palette.html'));
  paletteWin.on('blur', () => {
    if (!paletteWin.isDestroyed() && paletteWin.isVisible()) {
      paletteWin.hide();
    }
  });
  paletteWin.on('close', e => {
    if (quitting) return;
    e.preventDefault();
    paletteWin.hide();
  });
}

/* Send once the page's listeners are guaranteed alive — right after creating
   a window its loadFile hasn't finished, so an immediate send is lost. */
function sendWhenReady(targetWin, channel, payload) {
  if (!targetWin || targetWin.isDestroyed()) return;
  const send = () => {
    if (!targetWin.isDestroyed()) targetWin.webContents.send(channel, payload);
  };
  if (targetWin.webContents.isLoading()) targetWin.webContents.once('did-finish-load', send);
  else send();
}

function openWorkbench(opts = {}) {
  if (paletteWin && !paletteWin.isDestroyed() && paletteWin.isVisible()) {
    paletteWin.hide();
  }
  if (!win || win.isDestroyed()) createWindow();
  bringToForeground(win);
  sendWhenReady(win, 'navigate-to', opts);
}

async function toggleActionPalette() {
  if (!paletteWin || paletteWin.isDestroyed()) {
    createPaletteWindow();
  }
  if (paletteWin.isVisible() && paletteWin.isFocused()) {
    paletteWin.hide();
    return;
  }

  // 动作抽屉呼出时，只弹出抽屉，绝不打开或保留主工具箱窗口
  if (win && !win.isDestroyed() && win.isVisible()) {
    win.hide();
  }

  // 外部呼出瞬间，在窗口抢焦前尝试捕获当前活动软件中划选的文本
  let selectedText = null;
  try {
    const selRes = await captureActiveSelection({ timeoutMs: 90 });
    if (selRes && selRes.ok) {
      selectedText = selRes.text;
    }
  } catch { /* ignore */ }

  try {
    const point = screen.getCursorScreenPoint();
    const curDisplay = screen.getDisplayNearestPoint(point) || screen.getPrimaryDisplay();
    const area = curDisplay.workArea;
    const x = Math.round(area.x + (area.width - 650) / 2);
    const y = Math.round(area.y + Math.max(80, (area.height - 440) * 0.32));
    paletteWin.setPosition(x, y);
  } catch {
    paletteWin.center();
  }

  bringToForeground(paletteWin);
  sendWhenReady(paletteWin, 'palette-focus', { selectedText });
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
      onSummon: toggleActionPalette,
      onSummonActionPalette: toggleActionPalette,
    });

    registerPluginProtocol(manager);
    registerIpc({
      app,
      cfg,
      manager,
      hotkeys,
      getHostWindow: () => win,
      getPaletteWindow: () => paletteWin,
      openWorkbench,
      toggleActionPalette,
    });

    manager.discover();
    for (const p of manager.plugins.values()) if (p.enabled) manager.activate(p.id);
    hotkeys.registerAll({ allowFallback: true });

    createWindow();
    createPaletteWindow();
    createTray();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else toggleWindow(); });
  });

  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); manager && manager.deactivateAll(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') { quitting = true; app.quit(); } });
}
