/* screenshot-pin backend.
   Flow: startCapture() hides the host, grabs one thumbnail per display, then
   puts a fullscreen transparent selection window on every display. The overlay
   the user draws on reports its rect (DIP within that display); we crop the
   physical-pixel thumbnail in the main process and open an always-on-top pin
   window at the same spot.
   Coordinates: overlay windows are placed at display.bounds (DIP) and their
   CSS pixels are DIP, so crop = rect * scaleFactor, pin origin = display +
   rect. All auxiliary windows go through ctx.windows so disable/rescan
   destroys them. */
const { BrowserWindow, Menu, desktopCapturer, screen, ipcMain, nativeImage, clipboard } = require('electron');
const path = require('path');

const P = 'screenshot-pin:'; // ipc channel namespace

let teardown = null; // set by activate; deactivate runs it

module.exports = {
  activate(ctx) {
    let overlays = new Map();   // win.id -> {win, display}
    let sessionImages = new Map(); // win.id -> nativeImage thumbnail (physical px)
    let pins = new Map();       // win.id -> win
    let host = null;

    const initialData = (ctx.data && typeof ctx.data.get === 'function') ? ctx.data.get() : {};
    let hideHost = initialData.hideHost !== false;

    const send = (target, channel, payload) => {
      const wc = target?.webContents || target;
      if (wc && !wc.isDestroyed()) wc.send(channel, payload);
    };

    const winIdFromSender = (sender) => {
      const bw = BrowserWindow.fromWebContents(sender);
      return bw ? bw.id : sender.id;
    };

    /* --- selection overlays -------------------------------------------------- */

    function teardownOverlays() {
      for (const { win } of overlays.values()) { if (!win.isDestroyed()) win.destroy(); }
      overlays.clear();
      sessionImages.clear();
    }

    async function startCapture() {
      if (overlays.size) { teardownOverlays(); return { ok: true }; } // toggle: cancel running capture
      host = ctx.getHostWindow && ctx.getHostWindow();
      if (hideHost && host && !host.isDestroyed()) {
        host.hide();
        await new Promise(r => setTimeout(r, 260)); // let the hide repaint before grabbing
      }

      const displays = screen.getAllDisplays();
      const maxDim = displays.reduce((acc, d) => ({
        width: Math.max(acc.width, Math.round(d.bounds.width * d.scaleFactor)),
        height: Math.max(acc.height, Math.round(d.bounds.height * d.scaleFactor)),
      }), { width: 0, height: 0 });

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: maxDim,
      });

      for (const d of displays) {
        const src = sources.find(s => s.display_id === String(d.id)) || sources[displays.indexOf(d)];
        if (!src) continue;
        const shot = src.thumbnail;

        const win = ctx.windows.create({
          x: d.bounds.x, y: d.bounds.y,
          width: d.bounds.width, height: d.bounds.height,
          frame: false, transparent: true, resizable: false, movable: false,
          fullscreen: true, skipTaskbar: true, alwaysOnTop: true,
          hasShadow: false, backgroundColor: '#00000000',
          webPreferences: { preload: path.join(ctx.root, 'overlay-preload.js') },
        });
        overlays.set(win.id, { win, display: d });
        sessionImages.set(win.id, shot);
        win.setAlwaysOnTop(true, 'screen-saver');
        win.loadURL(ctx.url('selection.html'));
        win.once('ready-to-show', () => win.show());
      }
      return { ok: true, screens: overlays.size };
    }

    function beginSession() {
      if (!overlays.size) return null;
      return null;
    }

    /* --- pin windows ---------------------------------------------------------- */

    function openPin(dataUrl, bounds) {
      const win = ctx.windows.create({
        x: bounds.x, y: bounds.y, width: Math.max(120, bounds.width), height: Math.max(90, bounds.height),
        frame: false, transparent: true, resizable: true,
        alwaysOnTop: true, skipTaskbar: true, hasShadow: true,
        backgroundColor: '#00000000',
        webPreferences: { preload: path.join(ctx.root, 'pin-preload.js') },
      });
      pins.set(win.id, win);
      win.setAlwaysOnTop(true, 'screen-saver');
      win.loadURL(ctx.url('pin.html'));
      win.once('ready-to-show', () => {
        send(win, `${P}init`, { image: dataUrl, bounds: { width: bounds.width, height: bounds.height } });
        win.show();
      });
      win.on('closed', () => {
        pins.delete(win.id);
        ctx.send('pins-changed', { count: pins.size });
      });
      ctx.send('pins-changed', { count: pins.size });
      return { ok: true };
    }

    /* --- ipc (namespaced, removed on deactivate) --------------------------------- */

    const listeners = [];
    const on = (channel, fn) => { ipcMain.on(channel, fn); listeners.push([channel, fn]); };
    const handle = (channel, fn) => { ipcMain.handle(channel, fn); listeners.push([channel, fn]); };

    on(`${P}ready`, (e) => {
      const id = winIdFromSender(e.sender);
      const win = overlays.get(id);
      if (!win) return;
      const shot = sessionImages.get(id);
      if (shot) send(e.sender, `${P}image`, { image: shot.toDataURL() });
    });

    on(`${P}select`, (e, { rect }) => {
      const id = winIdFromSender(e.sender);
      const entry = overlays.get(id);
      if (!entry || !rect) return;
      const { display } = entry;
      const shot = sessionImages.get(id);
      if (!shot) return;
      const sf = display.scaleFactor;
      const crop = shot.crop({
        x: Math.max(0, Math.round(rect.x * sf)),
        y: Math.max(0, Math.round(rect.y * sf)),
        width: Math.max(1, Math.round(rect.width * sf)),
        height: Math.max(1, Math.round(rect.height * sf)),
      });
      const dataUrl = crop.toDataURL();
      teardownOverlays();
      if (hideHost && host && !host.isDestroyed()) host.show();
      openPin(dataUrl, {
        x: Math.round(display.bounds.x + rect.x),
        y: Math.round(display.bounds.y + rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    });

    on(`${P}cancel`, () => {
      teardownOverlays();
      if (hideHost && host && !host.isDestroyed()) host.show();
    });

    on(`${P}select-composed`, (e, { dataUrl, rect }) => {
      const id = winIdFromSender(e.sender);
      const entry = overlays.get(id);
      if (!entry || !dataUrl || !rect) return;
      const { display } = entry;
      teardownOverlays();
      if (hideHost && host && !host.isDestroyed()) host.show();
      openPin(dataUrl, {
        x: Math.round(display.bounds.x + rect.x),
        y: Math.round(display.bounds.y + rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    });

    on(`${P}overlay-copy`, (e, { dataUrl }) => {
      if (dataUrl) clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
      teardownOverlays();
      if (hideHost && host && !host.isDestroyed()) host.show();
    });

    handle(`${P}overlay-save`, async (e, { dataUrl }) => {
      if (!dataUrl) return { ok: false };
      const filePath = await ctx.chooseSavePng();
      if (!filePath) return { ok: false, canceled: true };
      require('fs').writeFileSync(filePath, nativeImage.createFromDataURL(dataUrl).toPNG());
      teardownOverlays();
      if (hideHost && host && !host.isDestroyed()) host.show();
      return { ok: true, filePath };
    });

    on(`${P}copy-image`, (e, { dataUrl }) => {
      clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
      const id = winIdFromSender(e.sender);
      if (pins.has(id)) send(e.sender, `${P}copied`, {});
    });

    on(`${P}close-pin`, (e) => {
      const id = winIdFromSender(e.sender);
      const w = pins.get(id);
      if (w && !w.isDestroyed()) w.close();
    });

    let dragAnchors = new Map(); // winId -> { startBounds, startScreenX, startScreenY }

    on(`${P}start-move-pin`, (e, { screenX, screenY }) => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (win && !win.isDestroyed()) {
        dragAnchors.set(win.id, {
          startBounds: win.getBounds(),
          startScreenX: screenX,
          startScreenY: screenY,
        });
      }
    });

    on(`${P}move-pin`, (e, { screenX, screenY }) => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (win && !win.isDestroyed()) {
        const anchor = dragAnchors.get(win.id);
        if (anchor) {
          const dx = Math.round(screenX - anchor.startScreenX);
          const dy = Math.round(screenY - anchor.startScreenY);
          win.setBounds({
            x: anchor.startBounds.x + dx,
            y: anchor.startBounds.y + dy,
            width: anchor.startBounds.width,
            height: anchor.startBounds.height,
          });
        }
      }
    });

    on(`${P}end-move-pin`, (e) => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (win) dragAnchors.delete(win.id);
    });

    on(`${P}show-pin-menu`, (e) => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!win || win.isDestroyed()) return;
      const menu = Menu.buildFromTemplate([
        {
          label: '编辑与标注',
          click: () => send(win, `${P}toggle-annotate`),
        },
        { type: 'separator' },
        {
          label: '复制到剪贴板',
          click: () => send(win, `${P}trigger-copy`),
        },
        {
          label: '另存为图片...',
          click: () => send(win, `${P}trigger-save`),
        },
        {
          label: '透明度',
          submenu: [
            { label: '100%', click: () => send(win, `${P}set-opacity`, 1) },
            { label: '75%', click: () => send(win, `${P}set-opacity`, 0.75) },
            { label: '50%', click: () => send(win, `${P}set-opacity`, 0.5) },
            { label: '30%', click: () => send(win, `${P}set-opacity`, 0.3) },
          ],
        },
        {
          label: '重置缩放 (1:1)',
          click: () => send(win, `${P}reset-zoom`),
        },
        { type: 'separator' },
        {
          label: '关闭贴图 (Esc)',
          click: () => win.close(),
        },
      ]);
      menu.popup({ window: win });
    });

    on(`${P}set-pin-annotating`, (e, { annotating, extraHeight = 52 }) => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!win || win.isDestroyed()) return;
      const b = win.getBounds();
      const disp = screen.getDisplayMatching(b);
      const maxY = disp.bounds.y + disp.bounds.height;
      if (annotating) {
        let newY = b.y;
        if (newY + b.height + extraHeight > maxY) {
          newY = Math.max(disp.bounds.y, maxY - (b.height + extraHeight));
        }
        win.setBounds({ x: b.x, y: newY, width: b.width, height: b.height + extraHeight });
      } else {
        win.setBounds({ x: b.x, y: b.y, width: b.width, height: Math.max(90, b.height - extraHeight) });
      }
    });

    on(`${P}pin-closed`, () => { ctx.send('pins-changed', { count: pins.size }); });

    handle(`${P}save`, async (e, { dataUrl }) => {
      const filePath = await ctx.chooseSavePng();
      if (!filePath) return { ok: false, canceled: true };
      nativeImage.createFromDataURL(dataUrl).toPNG();
      require('fs').writeFileSync(filePath, nativeImage.createFromDataURL(dataUrl).toPNG());
      return { ok: true, filePath };
    });

    handle(`${P}list`, () => ({ count: pins.size }));
    handle(`${P}close-all`, () => {
      for (const w of pins.values()) { if (!w.isDestroyed()) w.close(); }
      pins.clear();
      return { ok: true };
    });

    /* --- plugin IPC (host panel / hotkeys) ------------------------------------------ */

    ctx.ipc.handle('startCapture', async () => {
      const r = await startCapture();
      return r;
    });
    ctx.ipc.handle('pins', async () => ({ count: pins.size }));
    ctx.ipc.handle('getConfig', async () => ({ hideHost }));
    ctx.ipc.handle('setConfig', async ({ hideHost: val }) => {
      hideHost = !!val;
      if (ctx.data && typeof ctx.data.set === 'function') ctx.data.set({ hideHost });
      return { hideHost };
    });
    ctx.ipc.handle('closeAllPins', async () => {
      for (const w of pins.values()) { if (!w.isDestroyed()) w.close(); }
      pins.clear();
      return { ok: true };
    });

    teardown = () => {
      teardownOverlays();
      for (const [channel, fn] of listeners) {
        ipcMain.removeListener(channel, fn);
        ipcMain.removeHandler(channel);
      }
    };
  },

  deactivate() { if (teardown) { teardown(); teardown = null; } },
};
