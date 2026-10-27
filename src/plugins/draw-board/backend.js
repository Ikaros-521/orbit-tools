/* draw-board backend.
   One fullscreen transparent board window on the cursor's display. Before
   showing it we freeze the screen behind it (desktopCapturer thumbnail) so
   strokes have a backdrop and "save" exports a complete PNG. The toolbar is
   DOM inside the board window — one renderer, no cross-window IPC. */
const { BrowserWindow, dialog, desktopCapturer, screen, ipcMain, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const P = 'draw-board:';

let teardown = null;

module.exports = {
  activate(ctx) {
    let board = null;
    let host = null;
    let cachedInit = null;

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
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 4096, height: 4096 },
        });

        const src = sources.find(s => s.display_id === String(d.id))
          || sources[displays.findIndex(x => x.id === d.id)]
          || sources[0];

        const want = {
          width: Math.round(d.bounds.width * d.scaleFactor),
          height: Math.round(d.bounds.height * d.scaleFactor),
        };

        let backdropDataUrl = null;
        if (src && src.thumbnail) {
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

    handle(`${P}save`, async (e, { dataUrl }) => {
      if (!dataUrl) return { ok: false };
      const filePath = await chooseSavePngPath();
      if (!filePath) return { ok: false, canceled: true };
      const buf = nativeImage.createFromDataURL(dataUrl).toPNG();
      fs.writeFileSync(filePath, buf);
      return { ok: true, filePath };
    });

    ctx.ipc.handle('start', () => start());
    ctx.ipc.handle('isOpen', () => !!(board && !board.isDestroyed()));

    teardown = () => {
      if (board && !board.isDestroyed()) board.destroy();
      board = null;
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
