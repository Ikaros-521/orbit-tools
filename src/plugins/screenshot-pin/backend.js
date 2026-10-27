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
const { BrowserWindow, Menu, desktopCapturer, dialog, screen, ipcMain, nativeImage, clipboard } = require('electron');
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

    const restoreHost = () => {
      if (hideHost && host && !host.isDestroyed()) {
        host.show();
        host.focus();
      }
    };

    const chooseSavePngPath = async (defaultName = 'screenshot.png') => {
      if (typeof ctx.chooseSavePng === 'function') {
        const p = await ctx.chooseSavePng();
        if (p) return p;
      }
      const res = await dialog.showSaveDialog({
        title: '保存截图图片',
        defaultPath: defaultName,
        filters: [{ name: 'PNG Image (*.png)', extensions: ['png'] }],
      });
      return res.canceled ? null : res.filePath;
    };

    /* --- selection overlays -------------------------------------------------- */

    /* The freeze-frame is only a backdrop for choosing a region, so it ships as
       JPEG: PNG-encoding a full 4K frame on the main thread is what froze the
       screen for a beat at capture time. Anything the user keeps (pin/clipboard/
       file) is cropped from the untouched nativeImage instead, so quality never
       rides on this preview. */
    const previewDataURL = (img) => 'data:image/jpeg;base64,' + img.toJPEG(92).toString('base64');

    function teardownOverlays() {
      for (const { win } of overlays.values()) { if (!win.isDestroyed()) win.destroy(); }
      overlays.clear();
      sessionImages.clear();
      restoreHost();
    }

    /* desktopCapturer scales the grabbed frame to exactly thumbnailSize, and it
       upscales too: asking for a fixed 4096 cap turned a 3840x2160 screen into
       4096x2304 (+6.7%), which is why the freeze-frame looked enlarged the
       instant it appeared. Request each display's own physical size instead.
       display.bounds is DIP and Windows rounds it up, so bounds*scaleFactor can
       overshoot by <scale pixels; that sub-pixel error beats a resample of the
       whole frame, and every crop below derives its ratio from the real shot. */
    const physicalSize = (d) => ({
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
      const shots = new Map(); // display.id -> nativeImage
      for (const { size, list } of groups.values()) {
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
        for (const d of list) {
          const src = sources.find(s => s.display_id === String(d.id)) || sources[displays.indexOf(d)];
          const shot = src && src.thumbnail;
          if (shot && !shot.isEmpty()) shots.set(d.id, shot);
        }
      }
      return shots;
    }

    async function startCapture() {
      if (overlays.size) { teardownOverlays(); return { ok: true }; } // toggle: cancel running capture
      host = ctx.getHostWindow && ctx.getHostWindow();
      if (hideHost && host && !host.isDestroyed()) {
        host.hide();
        await new Promise(r => setTimeout(r, 60)); // brief wait for host window to disappear
      }

      const displays = screen.getAllDisplays();
      /* getSources needs well over a second here (the log shows the DXGI
         duplication timing out on a still desktop), so start building the
         overlays while that runs. They are neither shown nor painted, so they
         cannot leak into the very frame they are waiting for. */
      const pending = grabDisplays(displays);

      for (const d of displays) {
        const win = ctx.windows.create({
          x: d.bounds.x, y: d.bounds.y,
          width: d.bounds.width, height: d.bounds.height,
          useContentSize: true,
          frame: false, transparent: true, resizable: false, movable: false,
          fullscreen: false, fullscreenable: false,
          skipTaskbar: true, alwaysOnTop: true,
          hasShadow: false, backgroundColor: '#00000000',
          enableLargerThanScreen: true,
          webPreferences: { preload: path.join(ctx.root, 'overlay-preload.js') },
        });
        overlays.set(win.id, { win, display: d, ready: false, sent: false });
        win.setAlwaysOnTop(true, 'screen-saver');
        // Content (not frame) bounds: an inset of a few px here would squeeze the
        // full-screen freeze-frame and read as the picture shrinking/growing.
        if (typeof win.setContentBounds === 'function') win.setContentBounds(d.bounds);
        else win.setBounds(d.bounds);
        win.loadURL(ctx.url('selection.html'));
      }

      const shots = await pending;
      for (const [id, entry] of [...overlays]) {
        const shot = shots.get(entry.display.id);
        if (!shot) { entry.win.destroy(); overlays.delete(id); continue; }
        sessionImages.set(id, shot);
        sendImage(id, entry);
      }
      if (!overlays.size) restoreHost();
      return { ok: true, screens: overlays.size };
    }

    function beginSession() {
      if (!overlays.size) return null;
      return null;
    }

    /* --- pin windows ---------------------------------------------------------- */

    function openPin(dataUrl, bounds) {
      const w = Math.max(20, Math.round(bounds.width));
      const h = Math.max(20, Math.round(bounds.height));
      const win = ctx.windows.create({
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: w,
        height: h,
        useContentSize: true,
        frame: false,
        transparent: true,
        resizable: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        backgroundColor: '#00000000',
        webPreferences: { preload: path.join(ctx.root, 'pin-preload.js') },
      });
      pins.set(win.id, win);
      win.setAlwaysOnTop(true, 'screen-saver');
      win.loadURL(ctx.url('pin.html'));
      win.once('ready-to-show', () => {
        send(win, `${P}init`, { image: dataUrl, bounds: { width: w, height: h } });
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

    /* Map a selection rect (DIP inside the display) onto shot pixels. The ratio
       comes from the captured frame itself, so it stays right even when
       bounds*scaleFactor is a fraction off the panel's real resolution. */
    function cropShot(shot, display, rect) {
      const size = shot.getSize();
      const rx = size.width / display.bounds.width;
      const ry = size.height / display.bounds.height;
      return shot.crop({
        x: Math.max(0, Math.round(rect.x * rx)),
        y: Math.max(0, Math.round(rect.y * ry)),
        width: Math.min(size.width, Math.max(1, Math.round(rect.width * rx))),
        height: Math.min(size.height, Math.max(1, Math.round(rect.height * ry))),
      });
    }

    // Either side can arrive first: the frame, or the overlay asking for it.
    function sendImage(id, entry) {
      const shot = sessionImages.get(id);
      if (!shot || !entry.ready || entry.sent) return;
      entry.sent = true;
      const { width, height } = shot.getSize();
      // Ship the DIP extent too: if the overlay derived the ratio from
      // window.innerWidth instead, a viewport a pixel off display.bounds would
      // make the renderer and this process disagree on the crop size.
      send(entry.win, `${P}image`, {
        image: previewDataURL(shot),
        width, height,
        dipWidth: entry.display.bounds.width,
        dipHeight: entry.display.bounds.height,
      });
    }

    on(`${P}ready`, (e) => {
      const id = winIdFromSender(e.sender);
      const entry = overlays.get(id);
      if (entry) { entry.ready = true; sendImage(id, entry); }
    });

    // Lossless region for annotating/compositing, encoded at selection size only.
    handle(`${P}crop`, (e, { rect }) => {
      const id = winIdFromSender(e.sender);
      const entry = overlays.get(id);
      const shot = entry && sessionImages.get(id);
      if (!shot || !rect) return null;
      const crop = cropShot(shot, entry.display, rect);
      const { width, height } = crop.getSize();
      return { image: crop.toDataURL(), width, height };
    });

    on(`${P}displayed`, (e) => {
      const id = winIdFromSender(e.sender);
      const entry = overlays.get(id);
      if (entry && !entry.win.isDestroyed()) {
        entry.win.show();
        entry.win.focus();
      }
    });

    on(`${P}select`, (e, { rect }) => {
      const id = winIdFromSender(e.sender);
      const entry = overlays.get(id);
      if (!entry || !rect) return;
      const { display } = entry;
      const shot = sessionImages.get(id);
      if (!shot) return;
      const dataUrl = cropShot(shot, display, rect).toDataURL();
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
    });

    on(`${P}select-composed`, (e, { dataUrl, rect }) => {
      const id = winIdFromSender(e.sender);
      const entry = overlays.get(id);
      if (!entry || !dataUrl || !rect) return;
      const { display } = entry;
      teardownOverlays();
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
    });

    handle(`${P}overlay-save`, async (e, { dataUrl }) => {
      if (!dataUrl) return { ok: false };
      const filePath = await chooseSavePngPath();
      if (!filePath) return { ok: false, canceled: true };
      require('fs').writeFileSync(filePath, nativeImage.createFromDataURL(dataUrl).toPNG());
      teardownOverlays();
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
        const b = typeof win.getContentBounds === 'function' ? win.getContentBounds() : win.getBounds();
        dragAnchors.set(win.id, {
          startBounds: b,
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
          const target = {
            x: anchor.startBounds.x + dx,
            y: anchor.startBounds.y + dy,
            width: anchor.startBounds.width,
            height: anchor.startBounds.height,
          };
          if (typeof win.setContentBounds === 'function') {
            win.setContentBounds(target);
          } else {
            win.setBounds(target);
          }
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
      const b = typeof win.getContentBounds === 'function' ? win.getContentBounds() : win.getBounds();
      const disp = screen.getDisplayMatching(b);
      const maxY = disp.bounds.y + disp.bounds.height;
      if (annotating) {
        let newY = b.y;
        if (newY + b.height + extraHeight > maxY) {
          newY = Math.max(disp.bounds.y, maxY - (b.height + extraHeight));
        }
        const target = { x: b.x, y: newY, width: b.width, height: b.height + extraHeight };
        if (typeof win.setContentBounds === 'function') win.setContentBounds(target);
        else win.setBounds(target);
      } else {
        const target = { x: b.x, y: b.y, width: b.width, height: Math.max(20, b.height - extraHeight) };
        if (typeof win.setContentBounds === 'function') win.setContentBounds(target);
        else win.setBounds(target);
      }
    });

    on(`${P}pin-closed`, () => { ctx.send('pins-changed', { count: pins.size }); });

    handle(`${P}save`, async (e, { dataUrl }) => {
      const filePath = await chooseSavePngPath();
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
