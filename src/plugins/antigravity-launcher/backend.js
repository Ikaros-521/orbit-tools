/* antigravity-launcher backend.
   Manages proxy scanning, Antigravity binary detection, process tree inspection,
   network diagnostics, terminal launch with proxy env, and process spawning. */
const { dialog, shell } = require('electron');
const path = require('path');
const detect = require('./core/detect');
const proxy = require('./core/proxy');
const launch = require('./core/launch');

let teardown = null;

module.exports = {
  activate(ctx) {
    let lastBestProxy = null;

    const getData = () => {
      const d = (ctx.data && typeof ctx.data.get === 'function') ? ctx.data.get() : {};
      return {
        proxyUrl: d.proxyUrl || null,
        targetPath: d.targetPath || null,
        workDir: d.workDir || null,
      };
    };

    const setData = patch => {
      if (ctx.data && typeof ctx.data.set === 'function') {
        return ctx.data.set(patch);
      }
      return getData();
    };

    const emit = (channel, payload) => {
      try { ctx.send(channel, payload); } catch { /* ignore */ }
    };

    const log = (level, k, p) => emit('log', { level, k, p, ts: Date.now() });

    function resolveTarget() {
      const cfg = getData();
      const saved = cfg.targetPath && detect.exists(cfg.targetPath) ? cfg.targetPath : null;
      return saved ? detect.pack(saved, 'saved') : detect.detect();
    }

    async function doProbe() {
      const cfg = getData();
      const out = { target: null, proxyBest: null, results: [], running: [] };

      out.target = resolveTarget();
      log(out.target.found ? 'ok' : 'warn',
        out.target.found ? 'log.foundTarget' : 'log.noTarget',
        out.target.found ? { path: out.target.path, source: out.target.source } : undefined);

      const best = await proxy.scan(cfg.proxyUrl, r => {
        emit('probe:candidate', {
          host: r.host, port: r.port, scheme: r.scheme,
          endpoint: `${r.scheme}://${r.host}:${r.port}`,
          origin: r.origin, kind: r.kind, loginOk: r.loginOk, modelOk: r.modelOk, detail: r.detail,
        });
      });
      out.proxyBest = best.best;
      lastBestProxy = best.best;
      out.results = best.results;
      log(best.best ? 'ok' : 'err', best.best ? 'log.proxyOk' : 'log.proxyNone',
        best.best && {
          ep: launch.redact(best.best), kind: best.best.kind,
          model: best.best.modelOk ? 'log.proxyOk.yes' : 'log.proxyOk.no',
        });

      out.running = launch.listRunning(out.target.path);
      log(out.running.length ? 'warn' : 'ok', out.running.length ? 'log.running' : 'log.clean',
        out.running.length && { n: out.running.length, pids: out.running.map(r => r.pid).join(', ') });

      return out;
    }

    async function doLaunch() {
      const cfg = getData();
      const target = resolveTarget();
      if (!target.found) return { ok: false, errKey: 'err.noTarget' };

      const running = launch.listRunning(target.path);
      if (running.length) {
        return { ok: false, needsQuit: true, running, errKey: 'err.stale' };
      }

      let best = lastBestProxy;
      if (!best) {
        const scanRes = await proxy.scan(cfg.proxyUrl);
        best = scanRes.best;
        lastBestProxy = best;
      }
      if (!best) return { ok: false, errKey: 'err.noProxy' };

      const res = await launch.launch(best, target.path, msg => log('sys', 'log.raised', { msg }));
      if (res.spawnError) {
        log('err', 'log.spawnFail', { msg: res.spawnError.message });
        return { ok: false, errKey: 'err.spawnFail' };
      }
      log('ok', 'log.launched', { pid: res.pid, ep: launch.redact(best) });
      return { ok: true, pid: res.pid, endpoint: launch.redact(best), kind: best.kind };
    }

    async function doOpenTerminal(type = 'powershell') {
      const cfg = getData();
      let best = lastBestProxy;
      if (!best) {
        const scanRes = await proxy.scan(cfg.proxyUrl);
        best = scanRes.best;
        lastBestProxy = best;
      }
      const res = launch.openTerminal({
        type: type || 'powershell',
        workDir: cfg.workDir,
        ep: best,
      });
      log('ok', 'log.terminalOpened', {
        type: (type || 'powershell').toUpperCase(),
        dir: res.dir,
        ep: best ? launch.redact(best) : 'DIRECT',
      });
      return res;
    }

    // Register IPC handlers for panel renderer
    ctx.ipc.handle('boot', () => ({
      platform: process.platform,
      config: getData(),
      target: resolveTarget(),
      lastBestProxy,
    }));

    ctx.ipc.handle('probe', () => doProbe());
    ctx.ipc.handle('launch', () => doLaunch());
    ctx.ipc.handle('terminal', ({ type }) => doOpenTerminal(type));

    ctx.ipc.handle('quit-instances', (_args) => {
      const pids = (_args && _args.pids) ? _args.pids : [];
      launch.killInstances(pids);
      log('warn', 'log.killed', { pids: pids.join(', ') });
      return launch.listRunning(resolveTarget().path);
    });

    ctx.ipc.handle('choose-target', async () => {
      const host = ctx.getHostWindow ? ctx.getHostWindow() : null;
      const r = await dialog.showOpenDialog(host && !host.isDestroyed() ? host : null, {
        title: 'Antigravity executable',
        properties: ['openFile'],
        filters: process.platform === 'win32'
          ? [{ name: 'Antigravity.exe', extensions: ['exe'] }]
          : [{ name: 'All files', extensions: ['*'] }],
      });
      if (r.canceled || !r.filePaths[0]) return null;
      const p = r.filePaths[0];
      setData({ targetPath: p });
      log('ok', 'log.manualTarget', { path: p });
      return p;
    });

    ctx.ipc.handle('choose-work-dir', async () => {
      const cfg = getData();
      const host = ctx.getHostWindow ? ctx.getHostWindow() : null;
      const r = await dialog.showOpenDialog(host && !host.isDestroyed() ? host : null, {
        title: '选择工作目录 / Select Working Directory',
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: cfg.workDir || process.env.USERPROFILE || process.env.HOME || process.cwd(),
      });
      if (r.canceled || !r.filePaths[0]) return null;
      const chosen = r.filePaths[0];
      setData({ workDir: chosen });
      log('ok', 'log.workDirSet', { path: chosen });
      return chosen;
    });

    ctx.ipc.handle('diagnose-network', async () => {
      const cfg = getData();
      let best = lastBestProxy;
      if (!best) {
        const scanRes = await proxy.scan(cfg.proxyUrl);
        best = scanRes.best;
        lastBestProxy = best;
      }
      const [pings, ipInfo] = await Promise.all([
        proxy.pingTargets(best),
        proxy.fetchIpInfo(best),
      ]);

      if (ipInfo.direct) {
        log('ok', 'log.directIp', { ip: ipInfo.direct.ip, country: ipInfo.direct.country || '' });
      }
      if (ipInfo.proxy) {
        log('ok', 'log.proxyIp', { ip: ipInfo.proxy.ip, country: ipInfo.proxy.country || '' });
      }
      for (const p of pings) {
        if (p.ok) {
          log('ok', 'log.pingOk', { label: p.label, rtt: `${p.rtt}ms` });
        } else {
          log('warn', 'log.pingFail', { label: p.label, reason: p.reason });
        }
      }

      return { pings, ipInfo, proxy: best };
    });

    ctx.ipc.handle('get-proxy-commands', async () => {
      const cfg = getData();
      let best = lastBestProxy;
      if (!best) {
        const scanRes = await proxy.scan(cfg.proxyUrl);
        best = scanRes.best;
        lastBestProxy = best;
      }
      return launch.buildProxyCommands(best);
    });

    ctx.ipc.handle('set-proxy', (_args) => {
      const url = _args && _args.url !== undefined ? _args.url : null;
      setData({ proxyUrl: url || null });
      lastBestProxy = null;
      log('ok', url ? 'log.manualProxy' : 'log.clearedProxy', url && { url });
      return getData();
    });

    ctx.ipc.handle('open-external', (_args) => {
      const url = _args && _args.url;
      if (url && /^https?:\/\//.test(url)) shell.openExternal(url);
    });

    teardown = () => {
      lastBestProxy = null;
    };
  },

  deactivate() {
    if (teardown) { teardown(); teardown = null; }
  },
};
