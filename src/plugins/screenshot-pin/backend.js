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
const { desktopCapturer, screen, ipcMain, nativeImage, clipboard } = require('electron');
const path = require('path');

const P = 'screenshot-pin:'; // ipc channel namespace

let teardown = null; // set by activate; deactivate runs it

module.exports = {
  activate(ctx) {
    let overlays = new Map();   // win.id -> {win, display}
    let sessionImages = new Map(); // win.id -> nativeImage thumbnail (physical px)
    let pins = new Map();       // win.id -> win
    let host = null;

    const send = (win, channel, payload) => {
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
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
      if (host && !host.isDestroyed()) host.hide();
      await new Promise(r => setTimeout(r, 260)); // let the hide repaint before grabbing

      const displays = screen.getAllDisplays();
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 4096, height: 4096 }, // upper bound; electron scales down to the real size
      });

      for (const d of displays) {
        const src = sources.find(s => s.display_id === String(d.id)) || sources[displays.indexOf(d)];
        if (!src) continue;
        const img = nativeImage.createFromDataURL(src.thumbnail.toDataURL());
        // thumbnails come back at most thumbnailSize — real physical size is bounds * scaleFactor
        const want = { width: Math.round(d.bounds.width * d.scaleFactor), height: Math.round(d.bounds.height * d.scaleFactor) };
        const shot = (img.getSize().width === want.width && img.getSize().height === want.height)
          ? img : img.resize(want);

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
      win.on('closed', () => pins.delete(win.id));
      ctx.send('pins-changed', { count: pins.size });
      return { ok: true };
    }

    /* --- ipc (namespaced, removed on deactivate) --------------------------------- */

    const listeners = [];
    const on = (channel, fn) => { ipcMain.on(channel, fn); listeners.push([channel, fn]); };
    const handle = (channel, fn) => { ipcMain.handle(channel, fn); listeners.push([channel, fn]); };

    on(`${P}ready`, (e) => {
      const win = overlays.get(e.sender.id);
      if (!win) return;
      const shot = sessionImages.get(e.sender.id);
      send(e.sender, `${P}image`, { image: shot.toDataURL() });
    });

    on(`${P}select`, (e, { rect }) => {
      const entry = overlays.get(e.sender.id);
      if (!entry || !rect) return;
      const { display } = entry;
      const shot = sessionImages.get(e.sender.id);
      const sf = display.scaleFactor;
      const crop = shot.crop({
        x: Math.max(0, Math.round(rect.x * sf)),
        y: Math.max(0, Math.round(rect.y * sf)),
        width: Math.max(1, Math.round(rect.width * sf)),
        height: Math.max(1, Math.round(rect.height * sf)),
      });
      const dataUrl = crop.toDataURL();
      teardownOverlays();
      openPin(dataUrl, {
        x: Math.round(display.bounds.x + rect.x),
        y: Math.round(display.bounds.y + rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    });

    on(`${P}cancel`, () => {
      teardownOverlays();
      if (host && !host.isDestroyed()) host.show();
    });

    on(`${P}copy-image`, (e, { dataUrl }) => {
      clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
      if (e.sender.id && pins.has(e.sender.id)) send(e.sender, `${P}copied`, {});
    });

    on(`${P}close-pin`, (e) => {
      const w = pins.get(e.sender.id);
      if (w) w.close();
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
