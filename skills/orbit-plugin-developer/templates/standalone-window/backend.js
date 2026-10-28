const { ipcMain } = require('electron');

module.exports = {
  activate(ctx) {
    let auxWin = null;

    const open = () => {
      if (auxWin && !auxWin.isDestroyed()) {
        auxWin.focus();
        return;
      }

      auxWin = ctx.windows.create({
        width: 420,
        height: 280,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: true,
        preload: 'window-preload.js',
      });

      auxWin.loadURL(ctx.url('window.html'));
      auxWin.on('closed', () => { auxWin = null; });
    };

    ctx.ipc.handle('openWindow', async () => {
      open();
      return { ok: true };
    });

    // 监听独立窗口里的通信（注意加上插件前缀以防冲突）
    ipcMain.handle('my-window-tool:close', () => {
      if (auxWin && !auxWin.isDestroyed()) auxWin.close();
    });
  },

  deactivate() {
    ipcMain.removeHandler('my-window-tool:close');
  }
};
