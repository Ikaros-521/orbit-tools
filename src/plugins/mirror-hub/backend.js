/* mirror-hub backend: configuration & cross-platform terminal runner */
const { clipboard, shell } = require('electron');
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const { DEFAULT_PROXY, detectLocalProxy } = require('./proxy-detect');

function measureUrlPing(targetUrl, timeoutMs = 5000) {
  return new Promise(resolve => {
    try {
      if (!targetUrl || typeof targetUrl !== 'string') return resolve({ ok: false, error: 'empty url' });
      const u = new URL(targetUrl);
      const isHttps = u.protocol === 'https:';
      const client = isHttps ? https : http;
      const start = Date.now();

      const req = client.request(u, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OrbitTools/MirrorHub',
          'Accept': '*/*'
        },
        timeout: timeoutMs
      }, res => {
        let readBytes = 0;
        res.on('data', chunk => {
          readBytes += chunk.length;
          if (readBytes > 512) req.destroy();
        });
        const finish = () => {
          const ms = Date.now() - start;
          const ok = res.statusCode >= 200 && res.statusCode < 400;
          resolve({ ok, status: res.statusCode, ms });
        };
        res.on('end', finish);
        res.on('close', finish);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'TIMEOUT', ms: timeoutMs });
      });

      req.on('error', err => {
        resolve({ ok: false, error: err.code || err.message });
      });

      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

module.exports = {
  activate(ctx) {
    const data = ctx.data.get() || {};
    let savedProxyUrl = (typeof data.proxyUrl === 'string' && data.proxyUrl.trim()) ? data.proxyUrl.trim() : null;
    let settings = {
      proxyUrl: savedProxyUrl,
    };
    let customMirrors = (data.customMirrors && typeof data.customMirrors === 'object') ? data.customMirrors : {};

    const save = () => {
      ctx.data.set({
        ...settings,
        customMirrors,
      });
    };

    ctx.ipc.handle('getSettings', async () => {
      if (!settings.proxyUrl) {
        const detected = await detectLocalProxy();
        settings.proxyUrl = detected.url || DEFAULT_PROXY;
        save();
      }
      return settings;
    });

    ctx.ipc.handle('detectProxy', async () => {
      const detected = await detectLocalProxy();
      settings.proxyUrl = detected.url || DEFAULT_PROXY;
      save();
      ctx.send('settings-changed', settings);
      return { ok: true, url: settings.proxyUrl, source: detected.source };
    });

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

    ctx.ipc.handle('getCustomMirrors', () => customMirrors);

    ctx.ipc.handle('saveCustomMirrors', (args) => {
      const { mirrors } = args || {};
      if (mirrors && typeof mirrors === 'object') {
        customMirrors = mirrors;
        save();
        ctx.send('custom-mirrors-changed', customMirrors);
        return { ok: true, customMirrors };
      }
      return { ok: false, error: 'invalid mirrors payload' };
    });

    ctx.ipc.handle('addCustomMirror', (args) => {
      const { envId, mirror } = args || {};
      if (!envId || !mirror || !mirror.name || !mirror.url) {
        return { ok: false, error: 'missing required fields' };
      }
      if (!Array.isArray(customMirrors[envId])) {
        customMirrors[envId] = [];
      }
      const item = {
        id: mirror.id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: mirror.name.trim(),
        url: mirror.url.trim(),
        note: (mirror.note || '').trim(),
      };
      // De-duplicate by URL
      const existIdx = customMirrors[envId].findIndex(x => x.url === item.url || x.id === item.id);
      if (existIdx >= 0) {
        customMirrors[envId][existIdx] = item;
      } else {
        customMirrors[envId].push(item);
      }
      save();
      ctx.send('custom-mirrors-changed', customMirrors);
      return { ok: true, item, customMirrors };
    });

    ctx.ipc.handle('removeCustomMirror', (args) => {
      const { envId, id } = args || {};
      if (envId && id && Array.isArray(customMirrors[envId])) {
        customMirrors[envId] = customMirrors[envId].filter(x => x.id !== id);
        save();
        ctx.send('custom-mirrors-changed', customMirrors);
        return { ok: true, customMirrors };
      }
      return { ok: false, error: 'item not found' };
    });

    ctx.ipc.handle('pingMirror', async (args) => {
      const { url, timeoutMs = 5000 } = args || {};
      return await measureUrlPing(url, timeoutMs);
    });

    ctx.ipc.handle('pingMirrors', async (args) => {
      const { urls, timeoutMs = 5000 } = args || {};
      if (!Array.isArray(urls)) return { ok: false, error: 'urls must be array' };
      const tasks = urls.map(async u => {
        const res = await measureUrlPing(u, timeoutMs);
        return { url: u, ...res };
      });
      const results = await Promise.all(tasks);
      return { ok: true, results };
    });

    ctx.ipc.handle('openExternal', (args) => {
      const { url } = args || {};
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        shell.openExternal(url);
        return { ok: true };
      }
      return { ok: false, error: 'invalid url' };
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
