/* draw-board backend.
   One fullscreen transparent board window on the cursor's display. Before
   showing it we freeze the screen behind it (desktopCapturer thumbnail) so
   strokes have a backdrop and "save" exports a complete PNG. The toolbar is
   DOM inside the board window — one renderer, no cross-window IPC. */
const { BrowserWindow, Menu, dialog, desktopCapturer, screen, ipcMain, nativeImage, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');

const P = 'draw-board:';

let teardown = null;

module.exports = {
  activate(ctx) {
    let board = null;
    let host = null;
    let cachedInit = null;
    const pins = new Map();
    const pinBgStates = new Map();
    const dragAnchors = new Map();

    const send = (win, channel, payload) => {
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    };

    const restoreHost = () => {
      if (host && !host.isDestroyed()) {
        try {
          host.show();
          host.focus();
        } catch { /* ignore */ }
      }
    };

    const chooseSavePngPath = async (defaultName = 'draw-board.png') => {
      if (typeof ctx.chooseSavePng === 'function') {
        const p = await ctx.chooseSavePng();
        if (p) return p;
      }
      const res = await dialog.showSaveDialog(board && !board.isDestroyed() ? board : null, {
        title: '保存画板图片',
        defaultPath: defaultName,
        filters: [{ name: 'PNG Image (*.png)', extensions: ['png'] }],
      });
      return res.canceled ? null : res.filePath;
    };

    async function start() {
      if (board && !board.isDestroyed()) {
        board.destroy();
        board = null;
        restoreHost();
        return { ok: true, open: false };
      }

      host = ctx.getHostWindow && ctx.getHostWindow();
      if (host && !host.isDestroyed()) host.hide();

      try {
        await new Promise(r => setTimeout(r, 60)); // brief wait for host window to disappear

        const cursorPt = screen.getCursorScreenPoint();
        const d = (typeof screen.getDisplayNearestPoint === 'function')
          ? screen.getDisplayNearestPoint(cursorPt)
          : screen.getPrimaryDisplay();

        const displays = screen.getAllDisplays();
        // desktopCapturer rescales the frame to exactly this size, upscaling
        // included, so ask for the display's own physical pixels: a fixed 4096
        // cap inflated a 3840x2160 panel to 4096x2304 and then resize() blurred
        // it a second time back down.
        const want = {
          width: Math.round(d.bounds.width * d.scaleFactor),
          height: Math.round(d.bounds.height * d.scaleFactor),
        };
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: want,
        });

        const src = sources.find(s => s.display_id === String(d.id))
          || sources[displays.findIndex(x => x.id === d.id)]
          || sources[0];

        let backdropDataUrl = null;
        if (src && src.thumbnail && !src.thumbnail.isEmpty()) {
          const s = src.thumbnail.getSize();
          const img = (s.width === want.width && s.height === want.height)
            ? src.thumbnail
            : src.thumbnail.resize(want);
          backdropDataUrl = img.toDataURL();
        }

        cachedInit = {
          image: backdropDataUrl,
          dpr: d.scaleFactor,
          bounds: d.bounds,
        };

        board = ctx.windows.create({
          x: d.bounds.x,
          y: d.bounds.y,
          width: d.bounds.width,
          height: d.bounds.height,
          useContentSize: true,
          frame: false,
          transparent: true,
          resizable: false,
          movable: false,
          fullscreen: false,
          fullscreenable: false,
          skipTaskbar: true,
          alwaysOnTop: true,
          hasShadow: false,
          backgroundColor: '#00000000',
          enableLargerThanScreen: true,
          webPreferences: { preload: path.join(ctx.root, 'board-preload.js') },
        });

        board.setAlwaysOnTop(true, 'screen-saver');
        board.setBounds(d.bounds);

        board.loadURL(ctx.url('board.html'));

        board.once('ready-to-show', () => {
          if (cachedInit) send(board, `${P}init`, cachedInit);
          board.show();
          board.focus();
        });

        board.on('closed', () => {
          board = null;
          cachedInit = null;
          restoreHost();
        });

        return { ok: true, open: true };
      } catch (err) {
        console.error('[draw-board] start error:', err);
        restoreHost();
        return { ok: false, error: String(err && err.message || err) };
      }
    }

    const listeners = [];
    const on = (ch, fn) => { ipcMain.on(ch, fn); listeners.push([ch, fn]); };
    const handle = (ch, fn) => { ipcMain.handle(ch, fn); listeners.push([ch, fn]); };

    on(`${P}ready`, e => {
      // If renderer announces ready, dispatch init data immediately
      const win = BrowserWindow.fromWebContents(e.sender);
      if (win && cachedInit) {
        send(win, `${P}init`, cachedInit);
      }
    });

    on(`${P}exit`, () => {
      if (board && !board.isDestroyed()) {
        board.destroy();
        board = null;
      }
      restoreHost();
    });

    function openPin(payload, bounds) {
      const dataUrl = typeof payload === 'string' ? payload : (payload && (payload.image || payload.dataUrl));
      const isWithBg = (typeof payload === 'object' && payload !== null && payload.withBg !== undefined)
        ? Boolean(payload.withBg)
        : true;
      const w = Math.max(30, Math.round(bounds.width));
      const h = Math.max(30, Math.round(bounds.height));
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
      pinBgStates.set(win.id, isWithBg);
      win.setAlwaysOnTop(true, 'screen-saver');
      win.loadURL(ctx.url('pin.html'));
      win.once('ready-to-show', () => {
        const initData = typeof payload === 'object' && payload !== null
          ? payload
          : { image: dataUrl, withBg: true };
        send(win, `${P}pin-init`, initData);
        win.show();
      });
      win.on('closed', () => {
        pins.delete(win.id);
        pinBgStates.delete(win.id);
        dragAnchors.delete(win.id);
      });
      return { ok: true };
    }

    handle(`${P}copy`, async (e, { dataUrl }) => {
      if (!dataUrl) return { ok: false };
      const img = nativeImage.createFromDataURL(dataUrl);
      clipboard.writeImage(img);
      return { ok: true };
    });

    handle(`${P}pin`, async (e, payload) => {
      if (!payload || !payload.bounds) return { ok: false };
      if (board && !board.isDestroyed()) {
        board.destroy();
        board = null;
      }
      openPin(payload, payload.bounds);
      return { ok: true };
    });

    handle(`${P}save`, async (e, { dataUrl }) => {
      if (!dataUrl) return { ok: false };
      const filePath = await chooseSavePngPath();
      if (!filePath) return { ok: false, canceled: true };
      const buf = nativeImage.createFromDataURL(dataUrl).toPNG();
      fs.writeFileSync(filePath, buf);
      return { ok: true, filePath };
    });

    /* --- pin window events ----------------------------------------------------- */
    on(`${P}pin-start-move`, (e, { screenX, screenY }) => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (win && !win.isDestroyed()) {
        const b = typeof win.getContentBounds === 'function' ? win.getContentBounds() : win.getBounds();
        dragAnchors.set(win.id, { startBounds: b, startScreenX: screenX, startScreenY: screenY });
      }
    });

    on(`${P}pin-move`, (e, { screenX, screenY }) => {
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
          if (typeof win.setContentBounds === 'function') win.setContentBounds(target);
          else win.setBounds(target);
        }
      }
    });

    on(`${P}pin-end-move`, e => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (win) dragAnchors.delete(win.id);
    });

    on(`${P}pin-close`, e => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (win && !win.isDestroyed()) win.close();
    });

    on(`${P}pin-copy`, (e, { dataUrl }) => {
      if (dataUrl) clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
    });

    handle(`${P}pin-save`, async (e, { dataUrl }) => {
      if (!dataUrl) return { ok: false };
      const filePath = await chooseSavePngPath();
      if (!filePath) return { ok: false, canceled: true };
      fs.writeFileSync(filePath, nativeImage.createFromDataURL(dataUrl).toPNG());
      return { ok: true, filePath };
    });

    on(`${P}pin-show-menu`, e => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!win || win.isDestroyed()) return;
      const isWithBg = pinBgStates.get(win.id) !== false;
      const menu = Menu.buildFromTemplate([
        { label: '复制到剪贴板 (Ctrl+C)', click: () => send(win, `${P}trigger-copy`) },
        { label: '另存为图片 (Ctrl+S)...', click: () => send(win, `${P}trigger-save`) },
        { label: '重置缩放 (100%)', click: () => send(win, `${P}reset-zoom`) },
        { type: 'separator' },
        {
          label: '背景模式',
          submenu: [
            {
              label: '带背景卡片',
              type: 'radio',
              checked: isWithBg,
              click: () => {
                pinBgStates.set(win.id, true);
                send(win, `${P}set-bg-mode`, true);
              },
            },
            {
              label: '透明底 (仅标注)',
              type: 'radio',
              checked: !isWithBg,
              click: () => {
                pinBgStates.set(win.id, false);
                send(win, `${P}set-bg-mode`, false);
              },
            },
          ],
        },
        { type: 'separator' },
        {
          label: '透明度',
          submenu: [
            { label: '100%', click: () => send(win, `${P}set-opacity`, 1) },
            { label: '75%', click: () => send(win, `${P}set-opacity`, 0.75) },
            { label: '50%', click: () => send(win, `${P}set-opacity`, 0.5) },
            { label: '25%', click: () => send(win, `${P}set-opacity`, 0.25) },
          ],
        },
        { type: 'separator' },
        { label: '关闭悬浮 (Esc)', click: () => win.close() },
      ]);
      menu.popup({ window: win });
    });

    ctx.ipc.handle('start', () => start());
    ctx.ipc.handle('isOpen', () => !!(board && !board.isDestroyed()));

    teardown = () => {
      if (board && !board.isDestroyed()) board.destroy();
      board = null;
      for (const w of pins.values()) { if (!w.isDestroyed()) w.close(); }
      pins.clear();
      pinBgStates.clear();
      dragAnchors.clear();
      cachedInit = null;
      restoreHost();
      for (const [ch, fn] of listeners) {
        ipcMain.removeListener(ch, fn);
        ipcMain.removeHandler(ch);
      }
    };
  },

  deactivate() { if (teardown) { teardown(); teardown = null; } },
};
