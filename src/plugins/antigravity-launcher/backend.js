/* antigravity-launcher backend.
   Manages proxy scanning, Antigravity binary detection, process tree inspection,
   network diagnostics, terminal launch with proxy env, and process spawning. */
const { dialog, shell } = require('electron');
const os = require('os');
const path = require('path');
const detect = require('./core/detect');
const proxy = require('./core/proxy');
const launch = require('./core/launch');

let teardown = null;

module.exports = {
  activate(ctx) {
    let lastBestProxy = null;
    // 本工具启动的桌面客户端：{ pid, at, bootAt, verified }。
    let launchedDesktop = null;

    const getData = () => {
      const d = (ctx.data && typeof ctx.data.get === 'function') ? ctx.data.get() : {};
      return {
        proxyUrl: d.proxyUrl || null,
        targetPath: d.targetPath || null,
        workDir: d.workDir || null,
        // 默认开启：旧数据里没有该键时视为 true。
        preflight: d.preflight !== false,
        cliPath: d.cliPath || null,
        launchedDesktop: d.launchedDesktop || null,
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

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const bootTime = () => Date.now() - os.uptime() * 1000;

    function forgetLaunched() {
      launchedDesktop = null;
      if (getData().launchedDesktop) setData({ launchedDesktop: null });
    }

    // 在跑的桌面客户端是不是本工具启动的那个？只有 PID 并非证据——Windows
    // 很容易复用它们——所以从更早一次运行恢复出的记录，要先与进程真实
    // 启动时间核对后才可信。其他平台没有读取该时间的廉价途径，退化为
    // 「同一次开机」，至少排除掉重启前的一切。
    async function launchedPidAmong(running) {
      const rec = launchedDesktop;
      if (!rec) return null;
      if (!running.some(r => r.pid === rec.pid)) { forgetLaunched(); return null; }
      if (!rec.verified) {
        let mine = false;
        if (process.platform === 'win32') {
          const startedAt = await launch.processStartEpoch(rec.pid);
          mine = launchedDesktop === rec && startedAt !== null && Math.abs(startedAt - rec.at) < 15000;
        } else {
          mine = Math.abs(bootTime() - rec.bootAt) < 3600 * 1000;
        }
        if (!mine) { forgetLaunched(); return null; }
        rec.verified = true;
      }
      return rec.pid;
    }

    // 「什么在跑」的单一快照，probe 与状态轮询共用，重叠的调用不会同时
    // 读两遍进程表。
    let statusInFlight = null;
    function processStatus() {
      if (!statusInFlight) {
        statusInFlight = (async () => {
          const list = await launch.listProcesses();
          const running = launch.pickRunning(list, resolveTarget().path);
          return {
            running,
            sessions: launch.pickCliSessions(list),
            launchedPid: await launchedPidAmong(running),
          };
        })().finally(() => { statusInFlight = null; });
      }
      return statusInFlight;
    }

    function resolveTarget() {
      const cfg = getData();
      // v1.1.1：历史保存的路径若是本插件自身（macOS 上的壳 bundle）则弃用，
      // 否则会把启动器自己当成 Antigravity 重新拉起。
      const saved = cfg.targetPath && detect.exists(cfg.targetPath)
        && detect.isTargetCandidate(cfg.targetPath) ? cfg.targetPath : null;
      return saved ? detect.pack(saved, 'saved') : detect.detect();
    }

    function resolveCliTarget() {
      const cfg = getData();
      const saved = cfg.cliPath && detect.exists(cfg.cliPath) ? cfg.cliPath : null;
      return saved ? detect.packCli(saved, 'saved') : detect.detectCli();
    }

    // 更早一次运行留下的桌面客户端记录：启动时间核对过才可信，
    // 该核对由 launchedPidAmong 在首次见到时完成。
    const savedRec = getData().launchedDesktop;
    launchedDesktop = savedRec && Number.isInteger(savedRec.pid) ? { ...savedRec, verified: false } : null;

    async function doProbe() {
      const cfg = getData();
      const out = { target: null, cliTarget: null, proxyBest: null, results: [], running: [], cliSessions: [], launchedPid: null };

      out.target = resolveTarget();
      log(out.target.found ? 'ok' : 'warn',
        out.target.found ? 'log.foundTarget' : 'log.noTarget',
        out.target.found ? { path: out.target.path, source: out.target.source } : undefined);

      out.cliTarget = resolveCliTarget();
      log(out.cliTarget.found ? 'ok' : 'warn',
        out.cliTarget.found ? 'log.foundCli' : 'log.noCli',
        out.cliTarget.found ? { path: out.cliTarget.path, source: out.cliTarget.source } : undefined);

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

      Object.assign(out, await processStatus());
      if (out.launchedPid) {
        log('ok', 'log.runningLaunched', { pid: out.launchedPid });
      } else {
        log(out.running.length ? 'warn' : 'ok', out.running.length ? 'log.running' : 'log.clean',
          out.running.length && { n: out.running.length, pids: out.running.map(r => r.pid).join(', ') });
      }

      return out;
    }

    // 前置校验对两个启动目标同样适用，扫描 → 校验 → 上报的序列只写一次。
    async function runPreflight(best) {
      emit('launch:stage', 'preflight');
      const check = await proxy.checkGoogle(best, {
        onAttempt: a => { if (!a.ok) log('warn', 'log.preflightTry', { n: a.attempt, reason: a.reason }); },
      });
      log(check.ok ? 'ok' : 'err', check.ok ? 'log.preflightOk' : 'log.preflightFail',
        check.ok ? { ep: launch.redact(best), status: check.status, ms: check.ms }
          : { ep: launch.redact(best), reason: check.reason });
      return check.ok;
    }

    // agy 在终端打开后过一会儿才起来。等新会话出现，CH03 才能如实上报，
    // 而不是「无进程」；同时记下是哪个进程，启动条才能跟随这一个会话，
    // 而不是用户另行运行的某个 agy。
    async function waitForNewSession(before) {
      let own = [];
      for (let i = 0; i < 15 && !own.length; i++) {
        await sleep(400);
        own = launch.pickCliSessions(await launch.listProcesses()).filter(s => !before.has(s.pid));
      }
      return { sessions: launch.pickCliSessions(await launch.listProcesses()), own: own.map(s => s.pid) };
    }

    async function doLaunch(targetKind = 'desktop') {
      const cfg = getData();
      const cli = targetKind === 'cli';
      const target = cli ? resolveCliTarget() : resolveTarget();
      if (!target.found) return { ok: false, errKey: cli ? 'err.noCli' : 'err.noTarget' };

      // 不需要网络就能做出的拒绝放最前面：已在运行的客户端立即上报，
      // 而不是等一次扫描加一趟 Google 往返之后。
      if (!cli) {
        const running = launch.pickRunning(await launch.listProcesses(), target.path);
        if (running.length) {
          return { ok: false, needsQuit: true, running, launchedPid: await launchedPidAmong(running), errKey: 'err.stale' };
        }
      }

      let best = lastBestProxy;
      if (!best) {
        const scanRes = await proxy.scan(cfg.proxyUrl);
        best = scanRes.best;
        lastBestProxy = best;
      }
      if (!best) return { ok: false, errKey: 'err.noProxy' };

      // v1.2.0 前置校验：CONNECT/SOCKS5 成功只证明代理收下了请求，不证明它
      // 真能到达 Google。开关开启时先经同一隧道真实访问 generate_204，
      // 不通则拒绝启动（面板通过 launch:stage 展示当前阶段）。
      if (cfg.preflight !== false) {
        if (!(await runPreflight(best))) return { ok: false, errKey: 'err.googleUnreachable', reason: 'preflight' };
      } else {
        log('sys', 'log.preflightSkip');
      }
      emit('launch:stage', 'spawning');

      // CLI 不能无头启动：打开注入代理的终端直接进入 agy，插件不托管该进程，
      // 只统计自己打开的这一次会话。
      if (cli) {
        const before = new Set(launch.pickCliSessions(await launch.listProcesses()).map(s => s.pid));
        const res = launch.launchCli(best, target.path, { workDir: cfg.workDir });
        log('ok', 'log.launchedCli', { dir: res.dir, ep: launch.redact(best) });
        const { sessions, own } = await waitForNewSession(before);
        if (!own.length) log('warn', 'log.cliNotSeen');
        return { ok: true, cli: true, sessions, own, endpoint: launch.redact(best), kind: best.kind };
      }

      const res = await launch.launch(best, target.path,
        msg => log('sys', 'log.raised', { msg }),
        pid => { launchedDesktop = { pid, at: Date.now(), bootAt: bootTime(), verified: true }; });
      if (res.spawnError) {
        forgetLaunched();
        log('err', 'log.spawnFail', { msg: res.spawnError.message });
        return { ok: false, errKey: 'err.spawnFail' };
      }
      // v1.1.1：秒退说明被单实例锁挡回，新进程从未画出窗口，不能算成功。
      if (res.earlyExit) {
        forgetLaunched();
        log('err', 'log.earlyExit', { code: res.earlyExit.code });
        const running = launch.pickRunning(await launch.listProcesses(), target.path);
        return { ok: false, errKey: 'err.earlyExit', earlyExit: res.earlyExit, running };
      }
      log('ok', 'log.launched', { pid: res.pid, ep: launch.redact(best) });
      // 跨重启保留：之后重新打开的工具仍知道这个客户端是被代理启动的，
      // 不会把它当作残留实例提供终止。
      const { pid, at, bootAt } = launchedDesktop;
      setData({ launchedDesktop: { pid, at, bootAt } });
      return {
        ok: true, pid: res.pid, launchedPid: res.pid,
        running: launch.pickRunning(await launch.listProcesses(), target.path),
        endpoint: launch.redact(best), kind: best.kind,
      };
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
      cliTarget: resolveCliTarget(),
      lastBestProxy,
    }));

    ctx.ipc.handle('probe', () => doProbe());
    ctx.ipc.handle('launch', (args) => doLaunch(args && args.targetKind));
    ctx.ipc.handle('status', () => processStatus());
    ctx.ipc.handle('terminal', ({ type }) => doOpenTerminal(type));

    ctx.ipc.handle('quit-instances', async (_args) => {
      const pids = (_args && _args.pids) ? _args.pids : [];
      launch.killInstances(pids);
      log('warn', 'log.killed', { pids: pids.join(', ') });
      // 进程消失要一点时间；稍等再读，CH03 才不会闪回旧状态。
      await sleep(500);
      return (await processStatus()).running;
    });

    ctx.ipc.handle('choose-cli', async () => {
      const host = ctx.getHostWindow ? ctx.getHostWindow() : null;
      const r = await dialog.showOpenDialog(host && !host.isDestroyed() ? host : null, {
        title: detect.CLI_EXE,
        properties: ['openFile'],
        filters: process.platform === 'win32'
          ? [{ name: detect.CLI_EXE, extensions: ['exe'] }]
          : [{ name: 'All files', extensions: ['*'] }],
      });
      if (r.canceled || !r.filePaths[0]) return null;
      const p = r.filePaths[0];
      setData({ cliPath: p });
      log('ok', 'log.manualCli', { path: p });
      return p;
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

    ctx.ipc.handle('set-preflight', (_args) => {
      const on = !!(_args && _args.on);
      setData({ preflight: on });
      log('ok', on ? 'log.preflightOn' : 'log.preflightOff');
      return getData().preflight;
    });

    ctx.ipc.handle('open-external', (_args) => {
      const url = _args && _args.url;
      if (url && /^https?:\/\//.test(url)) shell.openExternal(url);
    });

    teardown = () => {
      lastBestProxy = null;
      launchedDesktop = null;
    };
  },

  deactivate() {
    if (teardown) { teardown(); teardown = null; }
  },
};
