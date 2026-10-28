/* mirror-hub backend: configuration & cross-platform terminal runner */
const { clipboard, shell } = require('electron');
const { spawn } = require('child_process');

const DEFAULT_PROXY = 'http://127.0.0.1:7890';

module.exports = {
  activate(ctx) {
    const data = ctx.data.get() || {};
    let settings = {
      proxyUrl: typeof data.proxyUrl === 'string' && data.proxyUrl.trim() ? data.proxyUrl.trim() : DEFAULT_PROXY,
    };

    const save = () => {
      ctx.data.set(settings);
    };

    ctx.ipc.handle('getSettings', () => settings);

    ctx.ipc.handle('saveSettings', (args) => {
      const { proxyUrl } = args || {};
      if (typeof proxyUrl === 'string') {
        settings.proxyUrl = proxyUrl.trim() || DEFAULT_PROXY;
        save();
        ctx.send('settings-changed', settings);
        return { ok: true, settings };
      }
      return { ok: false, error: 'invalid payload' };
    });

    ctx.ipc.handle('copyCommand', (args) => {
      const { command } = args || {};
      if (typeof command === 'string' && command.trim()) {
        clipboard.writeText(command.trim());
        return { ok: true };
      }
      return { ok: false, error: 'empty command' };
    });

    ctx.ipc.handle('runInTerminal', (args) => {
      const { command } = args || {};
      if (!command || typeof command !== 'string') return { ok: false, error: 'empty command' };

      const trimmed = command.trim();
      try {
        if (process.platform === 'win32') {
          // Launch PowerShell window with persistent prompt after command runs
          const child = spawn('powershell.exe', ['-NoExit', '-Command', trimmed], {
            detached: true,
            stdio: 'ignore',
            shell: false,
          });
          child.unref();
          return { ok: true, terminal: 'powershell' };
        } else if (process.platform === 'darwin') {
          const safeCmd = trimmed.replace(/"/g, '\\"');
          const script = `tell application "Terminal" to do script "${safeCmd}"\nactivate application "Terminal"`;
          const child = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
          child.unref();
          return { ok: true, terminal: 'Terminal.app' };
        } else {
          const child = spawn('x-terminal-emulator', ['-e', `sh -c "${trimmed.replace(/"/g, '\\"')}; exec sh"`], {
            detached: true,
            stdio: 'ignore',
          });
          child.unref();
          return { ok: true, terminal: 'x-terminal-emulator' };
        }
      } catch (err) {
        return { ok: false, error: String(err && err.message || err) };
      }
    });

    ctx.ipc.handle('openPanel', () => {
      const host = ctx.getHostWindow();
      if (host && !host.isDestroyed()) {
        host.show();
        host.focus();
      }
      return { ok: true };
    });
  },

  deactivate() {
    // Teardown if needed
  }
};
