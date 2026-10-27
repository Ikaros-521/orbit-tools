/* draw-board backend.
   One fullscreen transparent board window on the cursor's display. Before
   showing it we freeze the screen behind it (desktopCapturer thumbnail) so
   strokes have a backdrop and "save" exports a complete PNG. The toolbar is
   DOM inside the board window — one renderer, no cross-window IPC. */
const { desktopCapturer, screen, ipcMain, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const P = 'draw-board:';

let teardown = null;

module.exports = {
  activate(ctx) {
    let board = null;

    const send = (win, channel, payload) => {
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    };

    async function start() {
      if (board && !board.isDestroyed()) { board.destroy(); board = null; return { ok: true, open: false }; }
      const host = ctx.getHostWindow && ctx.getHostWindow();
      if (host && !host.isDestroyed()) host.hide();
      await new Promise(r => setTimeout(r, 260)); // let the hide repaint

      const d = screen.getDisplayNearestToPoint(screen.getCursorScreenPoint());
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 4096, height: 4096 },
      });
      const src = sources.find(s => s.display_id === String(d.id)) || sources[0];
      const want = { width: Math.round(d.bounds.width * d.scaleFactor), height: Math.round(d.bounds.height * d.scaleFactor) };
      let backdrop = null;
      if (src) {
        const img = nativeImage.createFromDataURL(src.thumbnail.toDataURL());
        const s = img.getSize();
        backdrop = (s.width === want.width && s.height === want.height) ? img : img.resize(want);
      }

      board = ctx.windows.create({
        x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
        frame: false, transparent: true, resizable: false, movable: false,
        fullscreen: true, skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
        backgroundColor: '#00000000',
        webPreferences: { preload: path.join(ctx.root, 'board-preload.js') },
      });
      board.setAlwaysOnTop(true, 'screen-saver');
      board.loadURL(ctx.url('board.html'));
      board.once('ready-to-show', () => {
        send(board, `${P}init`, {
          image: backdrop ? backdrop.toDataURL() : null,
          dpr: d.scaleFactor,
        });
        board.show();
      });
      board.on('closed', () => { board = null; });
      return { ok: true, open: true };
    }

    const listeners = [];
    const on = (ch, fn) => { ipcMain.on(ch, fn); listeners.push([ch, fn]); };
    const handle = (ch, fn) => { ipcMain.handle(ch, fn); listeners.push([ch, fn]); };

    on(`${P}ready`, e => {
      // backdrop arrives with init; ready is just the renderer saying it's listening
      void e;
    });
    on(`${P}exit`, () => { if (board && !board.isDestroyed()) board.destroy(); });
    handle(`${P}save`, async (e, { dataUrl }) => {
      const filePath = await ctx.chooseSavePng();
      if (!filePath) return { ok: false, canceled: true };
      fs.writeFileSync(filePath, nativeImage.createFromDataURL(dataUrl).toPNG());
      return { ok: true, filePath };
    });

    ctx.ipc.handle('start', () => start());
    ctx.ipc.handle('isOpen', () => !!(board && !board.isDestroyed()));

    teardown = () => {
      if (board && !board.isDestroyed()) board.destroy();
      board = null;
      for (const [ch, fn] of listeners) {
        ipcMain.removeListener(ch, fn);
        ipcMain.removeHandler(ch);
      }
    };
  },

  deactivate() { if (teardown) { teardown(); teardown = null; } },
};
