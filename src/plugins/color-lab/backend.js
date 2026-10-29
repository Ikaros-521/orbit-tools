/* color-lab backend — screen eyedropper + persisted palette state.

   Picking flow (same shape as screenshot-pin, which already proved it on
   multi-display / HiDPI Windows): hide the host, grab one nativeImage per
   display, then put a fullscreen transparent overlay on each display showing
   that frozen frame. The overlay asks us to probe the pixel under the cursor;
   we crop the untouched nativeImage and answer with the exact BGRA bitmap of
   a 19x19 neighbourhood, so the magnifier never shows JPEG artifacts. On click
   we sample the original image (not the JPEG preview), copy the chosen format
   and surface the panel.

   Coordinates: overlays are placed at display.bounds (DIP) and their CSS
   pixels are DIP; the shot is physical pixels. The ratio is derived from the
   shot itself (not bounds*scaleFactor) exactly like screenshot-pin's crop. */
const { BrowserWindow, clipboard, desktopCapturer, globalShortcut, ipcMain, screen } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const ColorMath = require('./color-math');

const P = 'color-lab:';
const MAX_HISTORY = 24;
const GRID = 19; // magnifier neighbourhood, physical pixels

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

let teardown = null;

module.exports = {
  activate(ctx) {
    let overlays = new Map(); // win.id -> { win, display, shot, ready, sent, cursor }
    let listeners = [];
    let host = null;
    let restoreHost = false;
    let picking = false;
    let liveProc = null;   // GDI live sampler (Windows)
    let liveReader = null;
    let zoomShortcuts = false;

    const saved = (ctx.data && typeof ctx.data.get === 'function' ? ctx.data.get() : {}) || {};
    let hideHost = saved.hideHost !== false;
    // freeze (default) = one nativeImage per display, pixel-exact; live = a
    // getUserMedia desktop stream sampled in the overlay for video/animation.
    let freeze = saved.freeze !== false;
    let copyFormat = ColorMath.COPY_FORMATS.includes(saved.copyFormat) ? saved.copyFormat : 'hex';
    let current = ColorMath.normalize(saved.current) || { r: 255, g: 171, b: 46, a: 255 };
    let history = Array.isArray(saved.history)
      ? saved.history.map(ColorMath.normalize).filter(Boolean).slice(0, MAX_HISTORY)
      : [];

    const persist = () => {
      try { ctx.data.set({ hideHost, freeze, copyFormat, current, history }); } catch { /* ignore */ }
    };

    const send = (target, channel, payload) => {
      const wc = target && (target.webContents || target);
      if (wc && !wc.isDestroyed()) wc.send(channel, payload);
    };

    const winIdFromSender = sender => {
      const bw = BrowserWindow.fromWebContents(sender);
      return bw ? bw.id : sender.id;
    };

    /* --- host window ------------------------------------------------------- */

    const bringHostForward = () => {
      const win = ctx.getHostWindow && ctx.getHostWindow();
      if (!win || win.isDestroyed()) return;
      try {
        if (win.isMinimized()) win.restore();
        win.show();
        if (process.platform === 'win32') {
          win.setAlwaysOnTop(true);
          win.setAlwaysOnTop(false);
          if (typeof win.moveTop === 'function') win.moveTop();
        }
        win.focus();
      } catch { /* ignore */ }
    };

    const openPanel = () => {
      bringHostForward();
      const win = ctx.getHostWindow && ctx.getHostWindow();
      if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
        win.webContents.send('open-plugin', 'color-lab');
      }
    };

    /* --- capture ----------------------------------------------------------- */

    const physicalSize = d => ({
      width: Math.round(d.bounds.width * d.scaleFactor),
      height: Math.round(d.bounds.height * d.scaleFactor),
    });

    async function grabDisplays(displays) {
      const groups = new Map(); // "WxH" -> { size, list }
      for (const d of displays) {
        const size = physicalSize(d);
        const key = `${size.width}x${size.height}`;
        if (!groups.has(key)) groups.set(key, { size, list: [] });
        groups.get(key).list.push(d);
      }
      const shots = new Map(); // display.id -> { shot, sourceId }
      for (const { size, list } of groups.values()) {
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
        for (const d of list) {
          const src = sources.find(s => s.display_id === String(d.id)) || sources[displays.indexOf(d)];
          const shot = src && src.thumbnail;
          if (shot && !shot.isEmpty()) shots.set(d.id, { shot, sourceId: src.id });
        }
      }
      return shots;
    }

    function teardownOverlays() {
      unregisterZoomShortcuts();
      stopGdiHelper();
      for (const entry of overlays.values()) {
        if (entry.win && !entry.win.isDestroyed()) entry.win.destroy();
      }
      overlays.clear();
      picking = false;
      if (restoreHost && host && !host.isDestroyed()) {
        try { host.show(); host.focus(); } catch { /* ignore */ }
      }
      restoreHost = false;
    }

    async function startPick() {
      if (overlays.size) { teardownOverlays(); return { ok: true, canceled: true }; }
      if (picking) return { ok: false, error: 'capture already starting' };
      picking = true;

      host = ctx.getHostWindow && ctx.getHostWindow();
      const hostVisible = !!(host && !host.isDestroyed() && host.isVisible());
      if (hideHost && hostVisible) {
        try { host.hide(); } catch { /* ignore */ }
        await sleep(70); // let the window disappear before the frame is grabbed
      }
      restoreHost = hideHost && hostVisible;

      const displays = screen.getAllDisplays();
      const cursorPoint = screen.getCursorScreenPoint();

      // Start grabbing while the overlays are built: getSources takes ~1s on a
      // still desktop, and the windows are hidden until their frame arrives.
      const pending = grabDisplays(displays);

      for (const d of displays) {
        const win = ctx.windows.create({
          x: d.bounds.x, y: d.bounds.y,
          width: d.bounds.width, height: d.bounds.height,
          useContentSize: true,
          frame: false, transparent: true, resizable: false, movable: false,
          fullscreen: false, fullscreenable: false,
          skipTaskbar: true, alwaysOnTop: true,
          // live mode must NOT take keyboard focus: the page underneath keeps
          // it, so a real wheel scrolls the page instead of the overlay
          focusable: !!freeze,
          hasShadow: false, backgroundColor: '#00000000',
          enableLargerThanScreen: true,
          webPreferences: { preload: path.join(ctx.root, 'picker-preload.js') },
        });
        const inside = cursorPoint.x >= d.bounds.x && cursorPoint.x < d.bounds.x + d.bounds.width
          && cursorPoint.y >= d.bounds.y && cursorPoint.y < d.bounds.y + d.bounds.height;
        overlays.set(win.id, {
          win,
          display: d,
          shot: null,
          sourceId: null,
          live: !freeze,
          ready: false,
          sent: false,
          cursor: { x: cursorPoint.x - d.bounds.x, y: cursorPoint.y - d.bounds.y, inside },
        });
        // A live stream would otherwise capture this overlay and mirror itself.
        // WDA_EXCLUDEFROMCAPTURE (Win10 2004+) removes the whole window from
        // every capture; the pre-show call is a no-op on some builds, so it is
        // repeated right after show() in the displayed handler.
        try { win.setContentProtection(true); } catch { /* platform unsupported */ }
        try { win.webContents.setBackgroundThrottling(false); } catch { /* ignore */ }
        win.setAlwaysOnTop(true, 'screen-saver');
        if (typeof win.setContentBounds === 'function') win.setContentBounds(d.bounds);
        else win.setBounds(d.bounds);
        win.on('closed', () => {
          overlays.delete(win.id);
          if (!overlays.size) {
            picking = false;
            // the user closed the last overlay with Alt+F4 / WM close: give the
            // toolbox back instead of leaving it hidden with no picker on screen
            if (restoreHost && host && !host.isDestroyed()) {
              try { host.show(); host.focus(); } catch { /* ignore */ }
            }
            restoreHost = false;
          }
        });
        win.loadURL(ctx.url('picker.html'));
      }

      let shots;
      try {
        shots = await pending;
      } catch (err) {
        teardownOverlays();
        return { ok: false, error: String(err && err.message || err) };
      }

      for (const [id, entry] of [...overlays]) {
        const captured = shots.get(entry.display.id);
        if (!captured) {
          if (!entry.win.isDestroyed()) entry.win.destroy();
          overlays.delete(id);
          continue;
        }
        entry.shot = captured.shot;
        entry.sourceId = captured.sourceId;
        sendInit(id, entry);
      }
      if (!overlays.size) {
        teardownOverlays();
        return { ok: false, error: 'screen capture unavailable' };
      }
      return { ok: true, screens: overlays.size };
    }

    const previewDataURL = shot => 'data:image/jpeg;base64,' + shot.toJPEG(92).toString('base64');

    /* --- live sampling ------------------------------------------------------ */

    // Windows: GDI BitBlt around the OS cursor. The DXGI duplication path used
    // by getUserMedia stalls after a few frames on still desktops and RDP
    // sessions ("Failed to capture 1 frames within 500ms"), which made live
    // mode look frozen. GDI keeps delivering exact pixels there.
    function startGdiHelper() {
      if (liveProc) return true;
      try {
        liveProc = spawn('powershell.exe', [
          '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
          '-File', path.join(ctx.root, 'gdi-cap.ps1'),
          '-Size', String(GRID), '-Fps', '30',
        ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch {
        liveProc = null;
        return false;
      }
      liveReader = readline.createInterface({ input: liveProc.stdout });
      liveReader.on('line', onGdiLine);
      liveProc.stderr.on('data', () => { /* compile/loop errors: exit falls back */ });
      liveProc.on('error', () => { liveProc = null; fallbackToFreeze(); });
      liveProc.on('exit', () => {
        liveProc = null;
        if (liveReader) { liveReader.close(); liveReader = null; }
        fallbackToFreeze();
      });
      return true;
    }

    function stopGdiHelper() {
      const proc = liveProc;
      liveProc = null;
      if (liveReader) { liveReader.close(); liveReader = null; }
      if (proc) {
        try { proc.removeAllListeners('exit'); } catch { /* ignore */ }
        try { proc.kill(); } catch { /* ignore */ }
      }
    }

    // Live overlays never take focus (the page keeps it so the wheel scrolls),
    // so zoom needs global shortcuts while the picker is open. Best effort:
    // the HUD −/+ buttons always work if these are occupied.
    function registerZoomShortcuts() {
      if (zoomShortcuts) return;
      const sendZoom = delta => {
        for (const entry of overlays.values()) send(entry.win, `${P}zoom`, { delta });
      };
      try {
        const up = globalShortcut.register('CommandOrControl+Shift+Up', () => sendZoom(1));
        const down = globalShortcut.register('CommandOrControl+Shift+Down', () => sendZoom(-1));
        zoomShortcuts = !!(up || down);
      } catch { zoomShortcuts = false; }
    }

    function unregisterZoomShortcuts() {
      if (!zoomShortcuts) return;
      zoomShortcuts = false;
      try {
        globalShortcut.unregister('CommandOrControl+Shift+Up');
        globalShortcut.unregister('CommandOrControl+Shift+Down');
      } catch { /* ignore */ }
    }

    function fallbackToFreeze() {
      for (const [id, entry] of overlays) {
        if (!entry.live) continue;
        entry.live = false;
        entry.sent = false;
        entry.ready = true;
        sendInit(id, entry);
      }
    }

    function onGdiLine(rawLine) {
      const m = /^(-?\d+),(-?\d+),(-?\d+),(-?\d+),([A-Za-z0-9+/=]+)$/.exec(String(rawLine).trim());
      if (!m) return;
      const cursor = { x: Number(m[1]), y: Number(m[2]) };
      const x0 = Number(m[3]);
      const y0 = Number(m[4]);
      const data = Buffer.from(m[5], 'base64');
      if (data.length !== GRID * GRID * 4) return;
      let dip = null;
      try { if (typeof screen.screenToDipPoint === 'function') dip = screen.screenToDipPoint(cursor); } catch { dip = null; }
      for (const entry of overlays.values()) {
        send(entry.win, `${P}live-frame`, { cursor, x0, y0, dip, data });
      }
    }

    // Either side can arrive first: the capture, or the overlay announcing ready.
    function sendInit(id, entry) {
      if (!entry.shot || !entry.ready || entry.sent) return;
      const gdiLive = entry.live && process.platform === 'win32';
      if (gdiLive && !startGdiHelper()) {
        entry.live = false;
        return sendInit(id, entry);
      }
      entry.sent = true;
      const size = entry.shot.getSize();
      const payload = {
        mode: gdiLive ? 'live-gdi' : (entry.live ? 'live' : 'freeze'),
        sourceId: entry.live ? entry.sourceId : null,
        width: size.width,
        height: size.height,
        dipWidth: entry.display.bounds.width,
        dipHeight: entry.display.bounds.height,
        origin: { x: entry.display.bounds.x, y: entry.display.bounds.y },
        bounds: entry.display.bounds,
        scaleFactor: entry.display.scaleFactor,
        cursor: entry.cursor,
      };
      // the freeze image doubles as the live fallback when sampling fails
      if (!entry.live) payload.image = previewDataURL(entry.shot);
      else registerZoomShortcuts();
      send(entry.win, `${P}init`, payload);
    }

    /* Map a DIP point inside the display onto shot pixels. The ratio comes
       from the captured frame, so it stays exact even when bounds*scaleFactor
       is a fraction off the panel's real resolution. */
    function shotPoint(entry, x, y) {
      const size = entry.shot.getSize();
      const sx = size.width / entry.display.bounds.width;
      const sy = size.height / entry.display.bounds.height;
      return {
        x: clamp(Math.round(x * sx), 0, size.width - 1),
        y: clamp(Math.round(y * sy), 0, size.height - 1),
        sx, sy, size,
      };
    }

    function probe(entry, x, y) {
      const p = shotPoint(entry, x, y);
      const gw = Math.min(GRID, p.size.width);
      const gh = Math.min(GRID, p.size.height);
      const gx = clamp(p.x - Math.floor(gw / 2), 0, Math.max(0, p.size.width - gw));
      const gy = clamp(p.y - Math.floor(gh / 2), 0, Math.max(0, p.size.height - gh));
      const bitmap = entry.shot.crop({ x: gx, y: gy, width: gw, height: gh }).toBitmap();
      const cx = p.x - gx;
      const cy = p.y - gy;
      const o = (cy * gw + cx) * 4;
      // nativeImage bitmaps are BGRA on every little-endian desktop platform
      const color = { r: bitmap[o + 2], g: bitmap[o + 1], b: bitmap[o], a: bitmap[o + 3] };
      return {
        color,
        grid: { width: gw, height: gh, cx, cy, data: new Uint8Array(bitmap) },
        physical: { x: p.x, y: p.y },
        scale: { x: p.sx, y: p.sy },
        screen: { x: Math.round(entry.display.bounds.x + x), y: Math.round(entry.display.bounds.y + y) },
      };
    }

    function samplePixel(entry, x, y) {
      const p = shotPoint(entry, x, y);
      const bitmap = entry.shot.crop({ x: p.x, y: p.y, width: 1, height: 1 }).toBitmap();
      return { r: bitmap[2], g: bitmap[1], b: bitmap[0], a: bitmap[3] };
    }

    /* --- applying a pick ---------------------------------------------------- */

    function applyPicked(color) {
      const col = { ...ColorMath.normalize(color), a: 255 };
      current = col;
      history = [col, ...history.filter(h => !(h.r === col.r && h.g === col.g && h.b === col.b))]
        .slice(0, MAX_HISTORY);
      persist();
      const text = ColorMath.format(col, copyFormat);
      try { clipboard.writeText(text); } catch { /* ignore */ }
      ctx.send('picked', { color: col, history, copied: text, format: copyFormat });
      openPanel();
      return { ok: true, color: col, copied: text };
    }

    /* --- overlay ipc -------------------------------------------------------- */

    const on = (channel, fn) => { ipcMain.on(channel, fn); listeners.push([channel, fn]); };
    const handle = (channel, fn) => { ipcMain.handle(channel, fn); listeners.push([channel, fn]); };

    on(`${P}ready`, e => {
      const id = winIdFromSender(e.sender);
      const entry = overlays.get(id);
      if (entry) { entry.ready = true; sendInit(id, entry); }
    });

    on(`${P}displayed`, e => {
      const entry = overlays.get(winIdFromSender(e.sender));
      if (entry && !entry.win.isDestroyed()) {
        if (entry.live) entry.win.showInactive();
        else { entry.win.show(); entry.win.focus(); }
        // must run after show() — a pre-show call does not always stick
        try { entry.win.setContentProtection(true); } catch { /* ignore */ }
      }
    });

    // getUserMedia failed (no secure context / capture permission): fall back to
    // the frozen frame we already grabbed, so picking still works everywhere.
    on(`${P}live-failed`, e => {
      const id = winIdFromSender(e.sender);
      const entry = overlays.get(id);
      if (!entry || !entry.shot) return;
      entry.live = false;
      entry.sent = false;
      entry.ready = true;
      sendInit(id, entry);
    });

    on(`${P}focus`, e => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (win && !win.isDestroyed()) win.focus();
    });

    handle(`${P}probe`, (e, { x, y }) => {
      const entry = overlays.get(winIdFromSender(e.sender));
      if (!entry || !entry.shot) return null;
      return probe(entry, Number(x) || 0, Number(y) || 0);
    });

    on(`${P}pick`, (e, { x, y, color } = {}) => {
      const entry = overlays.get(winIdFromSender(e.sender));
      if (!entry || !entry.shot) return;
      // live mode samples the video in the renderer — trust that exact value;
      // freeze mode samples the untouched nativeImage here for pixel accuracy.
      const picked = entry.live && color ? ColorMath.normalize(color) : null;
      const final = picked || samplePixel(entry, Number(x) || 0, Number(y) || 0);
      teardownOverlays();
      applyPicked(final);
    });

    on(`${P}cancel`, () => { teardownOverlays(); });

    /* --- plugin ipc (panel / hotkey) ---------------------------------------- */

    ctx.ipc.handle('startPick', () => startPick());

    ctx.ipc.handle('getState', () => ({
      color: current,
      history,
      settings: { hideHost, freeze, copyFormat },
      formats: ColorMath.FORMATS,
      copyFormats: ColorMath.COPY_FORMATS,
    }));

    ctx.ipc.handle('setConfig', ({ hideHost: hide, freeze: frozen, copyFormat: fmt } = {}) => {
      if (typeof hide === 'boolean') hideHost = hide;
      if (typeof frozen === 'boolean') freeze = frozen;
      if (typeof fmt === 'string' && ColorMath.COPY_FORMATS.includes(fmt)) copyFormat = fmt;
      persist();
      return { settings: { hideHost, freeze, copyFormat } };
    });

    ctx.ipc.handle('setColor', ({ color } = {}) => {
      const c = ColorMath.normalize(color);
      if (!c) throw new Error('invalid color');
      current = c;
      persist();
      return { color: current };
    });

    ctx.ipc.handle('clearHistory', () => {
      history = [];
      persist();
      return { history };
    });

    /* Workflow capability (color/css): accepts the standard
       { value, type, config } envelope and returns text. */
    ctx.ipc.handle('convert', ({ value, config } = {}) => {
      const col = ColorMath.parse(value);
      if (!col) throw new Error(`无法识别的颜色值: ${String(value || '').slice(0, 48)}`);
      const key = config && config.format;
      if (key && ColorMath.FORMATS.some(f => f.key === key)) return ColorMath.format(col, key);
      return ColorMath.FORMATS
        .map(f => `${f.label.padEnd(10, ' ')} ${ColorMath.format(col, f.key)}`)
        .join('\n');
    });

    teardown = () => {
      teardownOverlays();
      for (const [channel, fn] of listeners) {
        ipcMain.removeListener(channel, fn);
        ipcMain.removeHandler(channel);
      }
      listeners = [];
    };
  },

  deactivate() {
    if (teardown) { teardown(); teardown = null; }
  },
};
