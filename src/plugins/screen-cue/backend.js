/* screen-cue backend — recording annotation & magnifier overlays.

   Three fullscreen transparent layers per display:
   - ink  (alwaysOnTop 'pop-up-menu'): committed strokes. Click-through and
     never focusable, so leftover ink can only ever be visual — it never
     blocks the app underneath.
   - draw (alwaysOnTop 'screen-saver', only while annotating): grabs mouse +
     keyboard focus (keystrokes can't leak below), previews the in-progress
     stroke, hosts the toolbar. Destroyed the moment annotation exits.
   - mag  (alwaysOnTop 'screen-saver'): click-through magnifier fed by the
     GDI region helper. GDI capture can include layered windows; mag.js
     offsets the lens outside the sampled region to avoid recursive capture.

   Failsafes (the "can't turn it off" scenario): every effect closes via its
   own action hotkey (host-managed), the panel / palette actions, the draw
   layer's DOM Esc + toolbar ✕, and the magnifier auto-closes when the helper
   dies. These paths, including renderer IPC, require the backend main-process
   event loop to remain responsive. deactivate() — reached on plugin disable,
   rescan, and app will-quit — destroys every window and kills the helper. */
const { BrowserWindow, screen, ipcMain, globalShortcut, desktopCapturer } = require('electron');
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const {
  normalizeSettings,
  parseGdiLine,
  captureRegion,
  fpsForRegion,
  captureSig,
  sanitizeStroke,
} = require('./cue-core.js');

const P = 'screen-cue:';
const IS_WIN = process.platform === 'win32';

let teardown = null;

module.exports = {
  activate(ctx) {
    /* ---------------- state ---------------- */
    let settings = normalizeSettings((ctx.data.get() || {}).settings);
    const strokes = [];
    const fadeInfo = { start: 0, ms: 0 };
    let active = true;
    let drawMode = false;
    let drawStarting = false;
    let drawGeneration = 0;
    let freezeThisDraw = false;
    let drawBackdrops = new Map();
    const captureHidden = new Set();
    let lastDrawError = '';
    let magnifierOn = false;
    let lastMagError = '';
    let fadeTimer = null;
    let rebuildTimer = null;
    let drawFocusPending = false;

    /* winId -> { win, display, role, ready, shown } */
    const layers = { ink: new Map(), draw: new Map(), mag: new Map() };

    let helper = null;
    let helperReader = null;
    let helperRestarts = 0;
    let lastFrameAt = 0;
    let watchdog = null;
    let cursorTimer = null;
    let lastCursorSent = null;
    const magShortcuts = new Set();

    const listeners = [];
    const on = (ch, fn) => { ipcMain.on(ch, fn); listeners.push([ch, fn]); };
    const screenListeners = [];

    const send = (win, ch, payload) => {
      if (win && !win.isDestroyed()) win.webContents.send(ch, payload);
    };
    const bcast = (role, ch, payload) => {
      for (const e of layers[role].values()) send(e.win, ch, payload);
    };
    const nearestDisplay = pt => (typeof screen.getDisplayNearestPoint === 'function'
      ? screen.getDisplayNearestPoint(pt)
      : screen.getPrimaryDisplay());
    const inBounds = (pt, b) => pt.x >= b.x && pt.x < b.x + b.width
      && pt.y >= b.y && pt.y < b.y + b.height;

    const statusPayload = () => ({
      drawMode, drawStarting, magnifierOn,
      strokeCount: strokes.length,
      settings,
      win32: IS_WIN,
      error: lastDrawError || lastMagError,
    });
    const broadcastStatus = () => ctx.send('status', statusPayload());

    function persistSettings() {
      try { ctx.data.set({ settings }); } catch { /* ignore */ }
    }

    /* ---------------- layer windows ---------------- */
    function layerInitPayload(role, entry) {
      const origin = { x: entry.display.bounds.x, y: entry.display.bounds.y };
      if (role === 'ink') {
        return { role, origin, strokes, fadeStart: fadeInfo.start, fadeMs: fadeInfo.ms };
      }
      if (role === 'draw') {
        /* one toolbar only — on the display the cursor is on */
        const showToolbar = inBounds(screen.getCursorScreenPoint(), entry.display.bounds);
        return {
          role, origin, ink: { ...settings.ink, freezeScreen: freezeThisDraw }, showToolbar,
          backdrop: entry.backdrop, strokes: freezeThisDraw ? strokes : [],
        };
      }
      return { role, origin, lens: settings.lens };
    }

    function failDrawLayer(entry, reason) {
      if (!active || layers.draw.get(entry.win.id) !== entry) return;
      lastDrawError = `Annotation closed: ${reason}`;
      exitDraw();
    }

    function ensureLayers(role, displays = screen.getAllDisplays()) {
      const map = layers[role];
      const covered = new Set([...map.values()].map(e => e.display.id));
      for (const d of displays) {
        if (!active || (role === 'draw' && !drawMode)) break;
        if (covered.has(d.id)) continue;
        const interactive = role === 'draw';
        const win = ctx.windows.create({
          x: d.bounds.x,
          y: d.bounds.y,
          width: d.bounds.width,
          height: d.bounds.height,
          useContentSize: true,
          frame: false,
          show: false,
          transparent: true,
          resizable: false,
          movable: false,
          fullscreen: false,
          fullscreenable: false,
          skipTaskbar: true,
          alwaysOnTop: true,
          /* ink/mag never take keyboard focus — the app below keeps it */
          focusable: interactive,
          hasShadow: false,
          backgroundColor: '#00000000',
          enableLargerThanScreen: true,
          webPreferences: { preload: path.join(ctx.root, 'cue-preload.js') },
        });
        const entry = {
          win, display: d, role, ready: false, shown: false,
          backdrop: role === 'draw' ? (drawBackdrops.get(String(d.id)) || null) : null,
          loadTimer: null,
        };
        map.set(win.id, entry);
        win.setAlwaysOnTop(true, role === 'ink' ? 'pop-up-menu' : 'screen-saver');
        if (typeof win.setContentBounds === 'function') win.setContentBounds(d.bounds);
        else win.setBounds(d.bounds);
        try { win.webContents.setBackgroundThrottling(false); } catch { /* ignore */ }

        win.on('closed', () => {
          clearTimeout(entry.loadTimer);
          entry.backdrop = null;
          const tracked = map.delete(win.id);
          if (tracked && role === 'draw') exitDraw();
        });
        if (role === 'draw') {
          win.on('blur', () => scheduleBlurExit());
          win.on('unresponsive', () => failDrawLayer(entry, 'renderer unresponsive'));
          win.webContents.on('render-process-gone', (_e, details) => {
            failDrawLayer(entry, `renderer stopped (${details && details.reason || 'unknown'})`);
          });
          win.webContents.on('did-fail-load', (_e, code, description, _url, isMainFrame) => {
            if (isMainFrame !== false) failDrawLayer(entry, `load failed (${code}: ${description})`);
          });
          entry.loadTimer = setTimeout(() => {
            failDrawLayer(entry, 'renderer did not become ready');
          }, 10000).unref();
        }
        const loading = win.loadURL(ctx.url(`${role}.html`));
        if (loading && typeof loading.catch === 'function') {
          loading.catch(error => {
            if (role === 'draw') failDrawLayer(entry, `load failed (${error.message || error})`);
          });
        }
      }
    }

    function destroyLayers(role) {
      for (const e of [...layers[role].values()]) {
        layers[role].delete(e.win.id);
        clearTimeout(e.loadTimer);
        e.backdrop = null;
        if (!e.win.isDestroyed()) {
          try { e.win.destroy(); } catch { /* ignore */ }
        }
      }
    }

    function roleOf(winId) {
      for (const r of ['ink', 'draw', 'mag']) {
        if (layers[r].has(winId)) return r;
      }
      return null;
    }

    on(`${P}ready`, e => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!win) return;
      const role = roleOf(win.id);
      if (!role) return;
      const entry = layers[role].get(win.id);
      entry.ready = true;
      send(win, `${P}init`, layerInitPayload(role, entry));
    });

    on(`${P}displayed`, e => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!win || win.isDestroyed()) return;
      const role = roleOf(win.id);
      if (!role) return;
      const entry = layers[role].get(win.id);
      if (entry.shown || !entry.ready || (role === 'draw' && (!active || !drawMode))) return;
      clearTimeout(entry.loadTimer);
      entry.loadTimer = null;
      entry.shown = true;
      if (role === 'draw') {
        /* only the cursor's display takes focus; siblings stay inactive so
           the last-shown window can't steal focus from the focused one */
        if (drawFocusPending && inBounds(screen.getCursorScreenPoint(), entry.display.bounds)) {
          drawFocusPending = false;
          win.show();
          win.focus();
        } else {
          win.showInactive();
        }
      } else {
        try { win.setIgnoreMouseEvents(true); } catch { /* platform unsupported */ }
        if (drawStarting && freezeThisDraw) captureHidden.add(entry);
        else win.showInactive();
      }
    });

    /* ---------------- annotation mode ---------------- */
    function hideCaptureOverlays() {
      for (const role of ['ink', 'mag']) {
        for (const entry of layers[role].values()) {
          if (!entry.shown || entry.win.isDestroyed()) continue;
          captureHidden.add(entry);
          entry.win.hide();
        }
      }
    }

    function restoreCaptureOverlays() {
      const hidden = [...captureHidden];
      captureHidden.clear();
      for (const entry of hidden) {
        if (active && layers[entry.role].get(entry.win.id) === entry && !entry.win.isDestroyed()) {
          entry.win.showInactive();
        }
      }
    }

    async function captureBackdrops(displays, generation) {
      const result = new Map();
      for (const d of displays) {
        if (!active || generation !== drawGeneration) return result;
        const scale = d.scaleFactor || 1;
        const sources = await desktopCapturer.getSources({
          types: ['screen'], fetchWindowIcons: false,
          thumbnailSize: {
            width: Math.max(1, Math.round(d.bounds.width * scale)),
            height: Math.max(1, Math.round(d.bounds.height * scale)),
          },
        });
        if (!active || generation !== drawGeneration) return result;
        const source = sources.find(s => String(s.display_id) === String(d.id));
        if (!source || !source.thumbnail || source.thumbnail.isEmpty()) {
          throw new Error(`no screen image for display ${d.id}`);
        }
        const jpeg = source.thumbnail.toJPEG(85);
        if (!jpeg || !jpeg.length) throw new Error(`empty screen image for display ${d.id}`);
        result.set(String(d.id), `data:image/jpeg;base64,${jpeg.toString('base64')}`);
      }
      return result;
    }

    async function enterDraw() {
      if (!active) return { ok: true, mode: 'idle', cancelled: true };
      if (drawMode || drawStarting) return { ok: true, mode: drawMode ? 'draw' : 'starting' };
      const generation = ++drawGeneration;
      const displays = screen.getAllDisplays().map(d => ({ ...d, bounds: { ...d.bounds } }));
      drawStarting = true;
      freezeThisDraw = settings.ink.freezeScreen === true;
      lastDrawError = '';
      broadcastStatus();
      try {
        if (!displays.length) throw new Error('no displays available');
        if (freezeThisDraw) hideCaptureOverlays();
        const backdrops = freezeThisDraw ? await captureBackdrops(displays, generation) : new Map();
        if (!active || generation !== drawGeneration) {
          return { ok: true, mode: 'idle', cancelled: true };
        }
        drawBackdrops = backdrops;
        restoreCaptureOverlays();
        cancelFade();
        drawStarting = false;
        drawMode = true;
        drawFocusPending = true;
        ensureLayers('ink', displays);
        ensureLayers('draw', displays);
        if (generation !== drawGeneration) return { ok: false, error: lastDrawError || 'Annotation closed' };
        broadcastStatus();
        return { ok: true, mode: 'draw' };
      } catch (error) {
        if (!active || generation !== drawGeneration) {
          return { ok: true, mode: 'idle', cancelled: true };
        }
        lastDrawError = `Annotation failed: ${error.message || error}`;
        exitDraw();
        return { ok: false, error: lastDrawError };
      }
    }

    function exitDraw() {
      const wasDrawing = drawMode;
      const wasStarting = drawStarting;
      ++drawGeneration;
      drawMode = false;
      drawStarting = false;
      drawFocusPending = false;
      freezeThisDraw = false;
      drawBackdrops.clear();
      restoreCaptureOverlays();
      destroyLayers('draw');
      if (!wasDrawing) {
        if (wasStarting) broadcastStatus();
        return { ok: true, mode: 'idle' };
      }
      const act = settings.ink.exitAction;
      if (act === 'clear') clearInkNow();
      else if (act === 'fade' && strokes.length) startFade();
      else { syncInk(); maybeHideInk(); }
      broadcastStatus();
      return { ok: true, mode: 'idle' };
    }

    /* Alt+Tab (or anything) stealing focus exits annotation — but focus
       moving BETWEEN our own draw windows (multi-display drawing) must not.
       The short delay lets the OS settle the new focus owner first. */
    function scheduleBlurExit() {
      const generation = drawGeneration;
      setTimeout(() => {
        if (!active || !drawMode || generation !== drawGeneration) return;
        for (const e of layers.draw.values()) {
          if (!e.win.isDestroyed() && e.win.isFocused()) return;
        }
        exitDraw();
      }, 150).unref();
    }

    function syncInk() {
      const payload = { strokes, fadeStart: fadeInfo.start, fadeMs: fadeInfo.ms };
      bcast('ink', `${P}strokes`, payload);
      if (drawMode && freezeThisDraw) bcast('draw', `${P}strokes`, payload);
    }

    function maybeHideInk() {
      if (!drawMode && strokes.length === 0) destroyLayers('ink');
    }

    function clearInkNow() {
      strokes.length = 0;
      cancelFade();
      syncInk();
      maybeHideInk();
      broadcastStatus();
    }

    function startFade() {
      fadeInfo.start = Date.now();
      fadeInfo.ms = Math.max(500, Math.round(settings.ink.fadeSeconds * 1000));
      syncInk();
      if (fadeTimer) clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => {
        fadeTimer = null;
        strokes.length = 0;
        fadeInfo.start = 0;
        fadeInfo.ms = 0;
        syncInk();
        maybeHideInk();
      }, fadeInfo.ms + 600).unref();
    }

    function cancelFade() {
      if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
      if (fadeInfo.start) {
        fadeInfo.start = 0;
        fadeInfo.ms = 0;
        syncInk();
      }
    }

    function isCurrentDrawSender(e) {
      const win = BrowserWindow.fromWebContents(e.sender);
      return drawMode && win && !win.isDestroyed() && layers.draw.has(win.id);
    }

    on(`${P}commit`, (e, payload) => {
      if (!isCurrentDrawSender(e)) return;
      const stroke = sanitizeStroke(payload && payload.stroke, Date.now());
      if (!stroke) return;
      strokes.push(stroke);
      syncInk();
      broadcastStatus();
    });

    on(`${P}undo`, e => {
      if (!isCurrentDrawSender(e) || !strokes.length) return;
      strokes.pop();
      syncInk();
      broadcastStatus();
    });

    on(`${P}exit-draw`, e => { if (isCurrentDrawSender(e)) exitDraw(); });
    on(`${P}clear-ink`, e => { if (isCurrentDrawSender(e)) clearInkNow(); });

    on(`${P}close-me`, e => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (win && !win.isDestroyed()) win.close();
    });

    on(`${P}tool-state`, (e, payload) => {
      if (!isCurrentDrawSender(e)) return;
      const st = payload && payload.state;
      if (!st || typeof st !== 'object') return;
      settings = normalizeSettings({
        ink: { ...settings.ink, tool: st.tool, color: st.color, width: st.width },
        lens: settings.lens,
      });
      persistSettings();
    });

    /* ---------------- magnifier ---------------- */
    function toggleMag() {
      if (magnifierOn) {
        disengageMag();
        return { ok: true, on: false };
      }
      if (!IS_WIN) {
        lastMagError = 'magnifier requires Windows (GDI capture)';
        broadcastStatus();
        return { ok: false, error: lastMagError };
      }
      magnifierOn = true;
      lastMagError = '';
      helperRestarts = 0;
      ensureLayers('mag');
      if (!startHelper()) {
        disengageMag();
        lastMagError = 'failed to start capture helper';
        broadcastStatus();
        return { ok: false, error: lastMagError };
      }
      startCursorPoll();
      registerMagShortcuts();
      startWatchdog();
      broadcastStatus();
      return { ok: true, on: true };
    }

    function disengageMag() {
      magnifierOn = false;
      stopWatchdog();
      stopCursorPoll();
      stopHelper();
      unregisterMagShortcuts();
      destroyLayers('mag');
      broadcastStatus();
    }

    function startHelper() {
      if (!magnifierOn) return false;
      stopHelper(); // a stale helper must never double-feed
      const d = nearestDisplay(screen.getCursorScreenPoint());
      const region = captureRegion(
        settings.lens,
        d.bounds.width, d.bounds.height,
        d.scaleFactor || 1
      );
      try {
        helper = spawn('powershell.exe', [
          '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
          '-File', path.join(ctx.root, 'gdi-region.ps1'),
          '-W', String(region.w),
          '-H', String(region.h),
          '-Fps', String(fpsForRegion(region.w, region.h)),
          '-Q', '72',
        ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch {
        helper = null;
        return false;
      }
      lastFrameAt = Date.now();
      helperReader = readline.createInterface({ input: helper.stdout });
      helperReader.on('line', onHelperLine);
      helper.stderr.on('data', () => { /* compile/loop errors surface via exit */ });
      helper.on('error', () => onHelperDead());
      helper.on('exit', () => onHelperDead());
      return true;
    }

    function stopHelper() {
      const proc = helper;
      helper = null;
      if (helperReader) {
        try { helperReader.close(); } catch { /* ignore */ }
        helperReader = null;
      }
      if (proc) {
        try { proc.removeAllListeners('exit'); } catch { /* ignore */ }
        try { proc.removeAllListeners('error'); } catch { /* ignore */ }
        try { proc.kill(); } catch { /* ignore */ }
      }
    }

    /* helper death ⇒ magnifier off (after bounded retries). A stuck lens
       with a dead feed is worse than no lens. */
    function onHelperDead() {
      if (helperReader) {
        try { helperReader.close(); } catch { /* ignore */ }
        helperReader = null;
      }
      helper = null;
      if (!magnifierOn) return;
      helperRestarts += 1;
      if (helperRestarts <= 3) {
        startHelper();
      } else {
        lastMagError = 'capture helper kept dying — magnifier closed';
        disengageMag();
      }
    }

    function restartHelper() {
      if (!magnifierOn) return;
      helperRestarts = 0; // deliberate respawn ≠ failure
      startHelper();
    }

    function onHelperLine(rawLine) {
      const m = parseGdiLine(rawLine);
      if (!m) return;
      lastFrameAt = Date.now();
      let dipCursor = null;
      let dipOrigin = null;
      try {
        if (typeof screen.screenToDipPoint === 'function') {
          dipCursor = screen.screenToDipPoint(m.cursor);
          dipOrigin = screen.screenToDipPoint(m.origin);
        }
      } catch { /* fall back to raw px below */ }
      if (!dipCursor || !dipOrigin) {
        dipCursor = m.cursor;
        dipOrigin = m.origin;
      }
      const d = nearestDisplay(dipCursor);
      bcast('mag', `${P}frame`, {
        jpeg: `data:image/jpeg;base64,${m.b64}`,
        cx: dipCursor.x, cy: dipCursor.y,
        ox: dipOrigin.x, oy: dipOrigin.y,
        scale: d.scaleFactor || 1,
      });
    }

    function startCursorPoll() {
      stopCursorPoll();
      cursorTimer = setInterval(() => {
        const pt = screen.getCursorScreenPoint();
        if (lastCursorSent
          && Math.abs(pt.x - lastCursorSent.x) < 0.5
          && Math.abs(pt.y - lastCursorSent.y) < 0.5) return;
        lastCursorSent = { x: pt.x, y: pt.y };
        bcast('mag', `${P}cursor`, lastCursorSent);
      }, 15);
    }

    function stopCursorPoll() {
      if (cursorTimer) { clearInterval(cursorTimer); cursorTimer = null; }
      lastCursorSent = null;
    }

    /* silent frame stall (PS blocked, screen locked) → kill, the exit
       handler then respawns or gives up */
    function startWatchdog() {
      stopWatchdog();
      lastFrameAt = Date.now();
      watchdog = setInterval(() => {
        if (!magnifierOn || !helper) return;
        if (Date.now() - lastFrameAt > 2500) {
          try { helper.kill(); } catch { /* ignore */ }
        }
      }, 1000);
    }

    function stopWatchdog() {
      if (watchdog) { clearInterval(watchdog); watchdog = null; }
    }

    /* Ctrl+Shift+Up/Down mirrors color-lab's live-zoom shortcuts. No bare
       Escape here on purpose: the host palette owns Escape while visible,
       and unregistering it here could strip that binding. The toggle
       hotkey, panel button and palette action all close the magnifier. */
    function registerMagShortcuts() {
      if (magShortcuts.size) return;
      for (const [acc, delta] of [
        ['CommandOrControl+Shift+Up', 0.5], ['CommandOrControl+Shift+Down', -0.5],
      ]) {
        try {
          if (globalShortcut.register(acc, () => adjustZoom(delta))) magShortcuts.add(acc);
        } catch { /* another owner may already hold this shortcut */ }
      }
    }

    function unregisterMagShortcuts() {
      for (const acc of magShortcuts) {
        try { globalShortcut.unregister(acc); } catch { /* ignore */ }
      }
      magShortcuts.clear();
    }

    function adjustZoom(delta) {
      const z = Math.min(8, Math.max(1.5, Math.round((settings.lens.zoom + delta) * 2) / 2));
      if (z === settings.lens.zoom) return;
      settings = normalizeSettings({
        ink: settings.ink,
        lens: { ...settings.lens, zoom: z },
      });
      persistSettings();
      bcast('mag', `${P}lens-settings`, settings.lens);
      broadcastStatus();
      if (magnifierOn) restartHelper();
    }

    on(`${P}zoom`, (e, payload) => {
      const dir = payload && payload.dir;
      if (dir === 1 || dir === -1) adjustZoom(dir * 0.5);
    });

    /* ---------------- display hotplug / resolution changes ---------------- */
    function onDisplayChanged() {
      if (!active) return;
      // Old captures and bounds are invalid immediately; never restart an
      // annotation implicitly after the user or the OS changed displays.
      if (drawMode || drawStarting) exitDraw();
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(() => {
        rebuildTimer = null;
        if (!active) return;
        destroyLayers('ink');
        if (drawMode || strokes.length) ensureLayers('ink');
        if (magnifierOn) {
          destroyLayers('mag');
          ensureLayers('mag');
        }
      }, 300).unref();
    }
    for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) {
      screen.on(ev, onDisplayChanged);
      screenListeners.push([ev, onDisplayChanged]);
    }

    /* ---------------- settings (panel) ---------------- */
    function applySettingsPatch(patch) {
      const prevSig = captureSig(settings.lens);
      settings = normalizeSettings({
        ink: { ...settings.ink, ...(patch.ink || {}) },
        lens: { ...settings.lens, ...(patch.lens || {}) },
      });
      persistSettings();
      bcast('draw', `${P}ink-settings`, { ...settings.ink, freezeScreen: freezeThisDraw });
      bcast('mag', `${P}lens-settings`, settings.lens);
      if (magnifierOn && captureSig(settings.lens) !== prevSig) restartHelper();
      broadcastStatus();
    }

    /* ---------------- panel & action handlers ---------------- */
    ctx.ipc.handle('toggleAnnotate', () => (drawMode || drawStarting ? exitDraw() : enterDraw()));
    ctx.ipc.handle('clearInk', () => { clearInkNow(); return { ok: true }; });
    ctx.ipc.handle('toggleMagnifier', () => toggleMag());
    ctx.ipc.handle('stopAll', () => {
      exitDraw();
      clearInkNow();
      if (magnifierOn) disengageMag();
      lastDrawError = '';
      lastMagError = '';
      broadcastStatus();
      return { ok: true };
    });
    ctx.ipc.handle('getState', () => statusPayload());
    ctx.ipc.handle('setSettings', patch => {
      applySettingsPatch(patch || {});
      return statusPayload();
    });

    teardown = () => {
      if (!active) return;
      active = false;
      captureHidden.clear();
      ++drawGeneration;
      drawStarting = false;
      freezeThisDraw = false;
      drawBackdrops.clear();
      drawMode = false;
      magnifierOn = false;
      drawFocusPending = false;
      clearTimeout(rebuildTimer);
      if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
      stopWatchdog();
      stopCursorPoll();
      stopHelper();
      unregisterMagShortcuts();
      for (const role of ['ink', 'draw', 'mag']) destroyLayers(role);
      for (const [ev, fn] of screenListeners) {
        try { screen.removeListener(ev, fn); } catch { /* ignore */ }
      }
      screenListeners.length = 0;
      for (const [ch, fn] of listeners) {
        try { ipcMain.removeListener(ch, fn); } catch { /* ignore */ }
      }
      listeners.length = 0;
    };
  },

  deactivate() {
    if (teardown) { teardown(); teardown = null; }
  },
};
