/* antigravity-launcher panel — diagnostics & launch view; bilingual
   dictionary lives in i18n-dict.js (loaded via plugin:// before mount). */
(() => {
  const ensureDict = () => new Promise(resolve => {
    if (window.AntigravityDict) return resolve(window.AntigravityDict);
    if (typeof document === 'undefined' || !document.head || !document.createElement) return resolve(null);
    const s = document.createElement('script');
    s.src = 'plugin://antigravity-launcher/i18n-dict.js';
    s.onload = () => resolve(window.AntigravityDict);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });

  async function mount(el, ctx) {
    const D = await ensureDict();
    if (!D) return;
    const DICT = D.DICT, maskIp = D.maskIp;
    let currentLang = ctx.lang === 'en' ? 'en' : 'zh';
    const t = (k, params) => {
      const dict = DICT[currentLang] || DICT.zh;
      let s = dict[k] || DICT.zh[k] || k;
      if (params) {
        for (const [pk, pv] of Object.entries(params)) {
          const val = (typeof pv === 'string' && pv.startsWith('log.')) ? t(pv) : pv;
          s = s.replaceAll(`{${pk}}`, val !== undefined && val !== null ? String(val) : '');
        }
      }
      return s;
    };

    const state = {
      platform: ctx.platform || 'win32',
      best: null,
      target: null,
      running: [],
      ipInfo: { direct: null, proxy: null },
      pings: [],
      diagnosing: false,
      ipMasked: localStorage.getItem('agy.ipMasked') !== 'false',
      bar: { phase: 'idle', params: {} },
      probing: false,
      logs: [],
    };

    el.innerHTML = `
      <div class="agl-wrap">
        <div class="ambient" aria-hidden="true"><i></i><i></i></div>
        <div class="agl-chassis">
          <!-- 隧道与网络诊断 -->
          <section class="scope glass" aria-label="隧道连通性">
            <div class="scope-header">
              <div class="etiquette">TUNNEL & DIAGNOSTICS<span class="cn">／ ${t('g.tunnel')}</span></div>
              <div class="scope-acts">
                <button type="button" class="btn-sm btn-icon" id="aglBtnToggleIp" title="${t('toggleIp')}"></button>
                <button type="button" class="btn-sm" id="aglBtnDiagnose">${t('reDiagnose')}</button>
              </div>
            </div>
            <div class="tunnel" id="aglTunnel">
              <div class="node" id="aglNodeLocal" data-state="idle">
                <span class="node-main">LOCAL</span>
                <span class="node-sub mono" id="aglLocalIpReadout">127.0.0.1</span>
              </div>
              <div class="wire"><i class="pulse p1"></i><i class="pulse p2"></i></div>
              <div class="node" id="aglNodeProxy" data-state="idle">
                <span class="node-main" id="aglProxyReadout">:—</span>
                <span class="node-sub mono" id="aglProxyKindReadout">${t('node.proxyIdle')}</span>
              </div>
              <div class="wire"><i class="pulse p3"></i><i class="pulse p4"></i></div>
              <div class="lanes">
                <div class="lane" id="aglLaneLogin" data-state="idle">
                  <span class="lane-tag">GOOGLE</span>
                  <span class="lane-host">accounts.google.com</span>
                  <span class="lane-rtt mono" id="aglRttGoogle">—</span>
                </div>
                <div class="lane" id="aglLaneGithub" data-state="idle">
                  <span class="lane-tag">GITHUB</span>
                  <span class="lane-host">github.com</span>
                  <span class="lane-rtt mono" id="aglRttGithub">—</span>
                </div>
                <div class="lane" id="aglLaneCloudflare" data-state="idle">
                  <span class="lane-tag">CLOUDFLARE</span>
                  <span class="lane-host">1.1.1.1</span>
                  <span class="lane-rtt mono" id="aglRttCloudflare">—</span>
                </div>
                <div class="lane" id="aglLaneModel" data-state="idle">
                  <span class="lane-tag">MODELS</span>
                  <span class="lane-host">daily-cloudcode-pa</span>
                </div>
              </div>
            </div>
          </section>

          <!-- 三通道 -->
          <main class="channels">
            <div class="etiquette">CHANNELS<span class="cn">／ ${t('g.channels')}</span></div>

            <article class="channel glass" id="aglCh01" data-state="idle">
              <div class="ch-id"><b>CH01</b><span>${t('role.ch01')}</span></div>
              <i class="lamp" aria-hidden="true"></i>
              <div class="ch-body">
                <div class="ch-value mono" id="aglCh01Value">—</div>
                <div class="ch-meta mono" id="aglCh01Meta"></div>
              </div>
              <div class="ch-acts">
                <button type="button" class="btn-sm" id="aglBtnRetarget">${t('reprobe')}</button>
                <button type="button" class="btn-sm" id="aglBtnProxyManual">${t('manual')}</button>
              </div>
              <div class="ch-form" id="aglProxyForm" hidden>
                <input class="mono" id="aglProxyInput" type="text" placeholder="${t('proxyPlaceholder')}" spellcheck="false">
                <button type="button" class="btn-sm" id="aglProxyApply">${t('apply')}</button>
                <button type="button" class="btn-sm" id="aglProxyClear">${t('clear')}</button>
              </div>
            </article>

            <article class="channel glass" id="aglCh02" data-state="idle">
              <div class="ch-id"><b>CH02</b><span>${t('role.ch02')}</span></div>
              <i class="lamp" aria-hidden="true"></i>
              <div class="ch-body">
                <div class="ch-value mono" id="aglCh02Value">—</div>
                <div class="ch-meta mono" id="aglCh02Meta"></div>
              </div>
              <div class="ch-acts">
                <button type="button" class="btn-sm" id="aglBtnChoose">${t('choose')}</button>
              </div>
            </article>

            <article class="channel glass" id="aglCh03" data-state="idle">
              <div class="ch-id"><b>CH03</b><span>${t('role.ch03')}</span></div>
              <i class="lamp" aria-hidden="true"></i>
              <div class="ch-body">
                <div class="ch-value mono" id="aglCh03Value">—</div>
                <div class="ch-meta mono" id="aglCh03Meta"></div>
              </div>
              <div class="ch-acts">
                <button type="button" class="btn-sm" id="aglBtnKill" style="display:none; color:var(--red); border-color:var(--red);">${t('kill')}</button>
              </div>
            </article>
          </main>

          <!-- 环境变量预览与快捷命令 -->
          <section class="envmap glass" aria-label="注入变量预览">
            <div class="env-header">
              <div class="etiquette">INJECTION MAP<span class="cn">／ ${t('g.env')}</span></div>
              <div class="copy-bar" id="aglCopyBar"></div>
            </div>
            <div class="env-grid" id="aglEnvGrid"></div>
            <p class="env-note">${t('envNote')}</p>
          </section>

          <!-- 一键启动条 -->
          <button type="button" class="launchbar glass" id="aglLaunchBar" data-state="idle">
            <span class="lb-key" id="aglLbKey">READY</span>
            <span class="lb-cn" id="aglLbCn">${t('idle.cn')}</span>
            <span class="lb-target mono" id="aglLbTarget">${t('idle.target')}</span>
          </button>

          <!-- 日志控制台 -->
          <aside class="console glass" aria-label="日志">
            <div class="etiquette">CONSOLE<span class="cn">／ ${t('g.console')}</span></div>
            <div class="console-body mono" id="aglConsoleBody"></div>
            <div class="console-foot mono">
              <span>${t('foot1')}</span>
              <span>${t('foot2')}</span>
            </div>
          </aside>
        </div>
      </div>
    `;

    const wrap = el.querySelector('.agl-wrap');
    const tunnel = el.querySelector('#aglTunnel');
    const nodeLocal = el.querySelector('#aglNodeLocal');
    const localIpReadout = el.querySelector('#aglLocalIpReadout');
    const nodeProxy = el.querySelector('#aglNodeProxy');
    const proxyReadout = el.querySelector('#aglProxyReadout');
    const proxyKindReadout = el.querySelector('#aglProxyKindReadout');
    const laneLogin = el.querySelector('#aglLaneLogin');
    const laneGithub = el.querySelector('#aglLaneGithub');
    const laneCloudflare = el.querySelector('#aglLaneCloudflare');
    const laneModel = el.querySelector('#aglLaneModel');
    const rttGoogle = el.querySelector('#aglRttGoogle');
    const rttGithub = el.querySelector('#aglRttGithub');
    const rttCloudflare = el.querySelector('#aglRttCloudflare');
    const btnToggleIp = el.querySelector('#aglBtnToggleIp');
    const btnDiagnose = el.querySelector('#aglBtnDiagnose');

    const ch01 = el.querySelector('#aglCh01');
    const ch01Value = el.querySelector('#aglCh01Value');
    const ch01Meta = el.querySelector('#aglCh01Meta');
    const btnRetarget = el.querySelector('#aglBtnRetarget');
    const btnProxyManual = el.querySelector('#aglBtnProxyManual');
    const proxyForm = el.querySelector('#aglProxyForm');
    const proxyInput = el.querySelector('#aglProxyInput');
    const proxyApply = el.querySelector('#aglProxyApply');
    const proxyClear = el.querySelector('#aglProxyClear');

    const ch02 = el.querySelector('#aglCh02');
    const ch02Value = el.querySelector('#aglCh02Value');
    const ch02Meta = el.querySelector('#aglCh02Meta');
    const btnChoose = el.querySelector('#aglBtnChoose');

    const ch03 = el.querySelector('#aglCh03');
    const ch03Value = el.querySelector('#aglCh03Value');
    const ch03Meta = el.querySelector('#aglCh03Meta');
    const btnKill = el.querySelector('#aglBtnKill');

    const copyBar = el.querySelector('#aglCopyBar');
    const envGrid = el.querySelector('#aglEnvGrid');

    const launchBar = el.querySelector('#aglLaunchBar');
    const lbKey = el.querySelector('#aglLbKey');
    const lbCn = el.querySelector('#aglLbCn');
    const lbTarget = el.querySelector('#aglLbTarget');

    const consoleBody = el.querySelector('#aglConsoleBody');

    // Pointer spotlight effect on glass cards
    wrap.querySelectorAll('.glass').forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${Math.round(e.clientX - r.left)}px`);
        card.style.setProperty('--my', `${Math.round(e.clientY - r.top)}px`);
      });
    });

    const setState = (target, s) => { if (target) target.dataset.state = s; };

    function stamp(ts) {
      const d = new Date(ts);
      const p = n => String(n).padStart(2, '0');
      return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }

    function pushLog(level, k, p) {
      state.logs.push({ level, k, p, ts: Date.now() });
      if (state.logs.length > 300) state.logs.splice(0, state.logs.length - 300);
      appendLogLine(state.logs[state.logs.length - 1]);
      consoleBody.scrollTop = consoleBody.scrollHeight;
    }

    function appendLogLine(entry) {
      const row = document.createElement('div');
      row.className = `log-line ${entry.level || 'sys'}`;
      const time = document.createElement('time');
      time.className = 'log-time';
      time.textContent = stamp(entry.ts);
      const msg = document.createElement('span');
      msg.className = 'log-text';
      msg.textContent = t(entry.k, entry.p);
      row.append(time, msg);
      consoleBody.appendChild(row);
    }

    function repaintLogs() {
      consoleBody.replaceChildren();
      state.logs.forEach(appendLogLine);
      consoleBody.scrollTop = consoleBody.scrollHeight;
    }

    function renderTunnel() {
      const b = state.best;
      wrap.classList.toggle('scanning', state.probing || state.diagnosing);
      wrap.classList.toggle('live', !!b && !state.probing);
      setState(nodeLocal, state.probing ? 'scan' : 'live');

      btnToggleIp.innerHTML = state.ipMasked ? EYE_ICONS.hide : EYE_ICONS.show;

      if (state.ipInfo && state.ipInfo.direct) {
        const d = state.ipInfo.direct;
        const ipStr = state.ipMasked ? maskIp(d.ip) : d.ip;
        localIpReadout.textContent = `${ipStr} · ${d.city || d.country || ''}`;
      } else {
        localIpReadout.textContent = '127.0.0.1';
      }

      if (!b) {
        setState(nodeProxy, state.probing ? 'scan' : 'dead');
        proxyKindReadout.textContent = state.probing ? t('node.proxyIdle') : '—';
        if (!state.probing) proxyReadout.textContent = ':—';
        setState(laneLogin, 'idle');
        setState(laneGithub, 'idle');
        setState(laneCloudflare, 'idle');
        setState(laneModel, 'idle');
        return;
      }

      setState(nodeProxy, 'live');
      proxyReadout.textContent = `:${b.port}`;

      if (state.ipInfo && state.ipInfo.proxy) {
        const p = state.ipInfo.proxy;
        const ipStr = state.ipMasked ? maskIp(p.ip) : p.ip;
        proxyKindReadout.textContent = `${b.kind.toUpperCase()} · ${ipStr} (${p.country || ''})`;
      } else {
        proxyKindReadout.textContent = b.kind.toUpperCase();
      }

      setState(laneLogin, 'open');
      setState(laneGithub, 'open');
      setState(laneCloudflare, 'open');
      setState(laneModel, b.modelOk ? 'open' : 'blocked');

      if (state.pings && state.pings.length) {
        const g = state.pings.find(x => x.id === 'google');
        const gh = state.pings.find(x => x.id === 'github');
        const cf = state.pings.find(x => x.id === 'cloudflare');
        if (g && rttGoogle) rttGoogle.textContent = g.ok ? `${g.rtt}ms` : 'FAIL';
        if (gh && rttGithub) rttGithub.textContent = gh.ok ? `${gh.rtt}ms` : 'FAIL';
        if (cf && rttCloudflare) rttCloudflare.textContent = cf.ok ? `${cf.rtt}ms` : 'FAIL';
      }
    }

    function renderProxy() {
      const b = state.best;
      if (state.probing) {
        setState(ch01, 'scan');
        ch01Value.textContent = t('ch01.probing');
        ch01Meta.textContent = t('ch01.probeMeta');
        return;
      }
      if (!b) {
        setState(ch01, 'fail');
        ch01Value.textContent = t('ch01.none');
        ch01Meta.textContent = t('ch01.noneMeta');
        return;
      }
      setState(ch01, 'live');
      ch01Value.textContent = `${b.scheme}://${b.host}:${b.port}`;
      ch01Meta.textContent = t('ch01.okMeta', { kind: b.kind, origin: b.origin });
    }

    function renderTarget() {
      const tg = state.target;
      if (!tg) { setState(ch02, 'idle'); ch02Value.textContent = t('ch02.searching'); return; }
      if (!tg.found) {
        setState(ch02, 'warn');
        ch02Value.textContent = t('ch02.none');
        ch02Meta.textContent = t('ch02.noneMeta');
        return;
      }
      setState(ch02, 'live');
      ch02Value.textContent = tg.path;
      ch02Meta.textContent = t(tg.languageServer ? 'ch02.okMetaLs' : 'ch02.okMetaNoLs', { source: tg.source });
    }

    function renderRunning() {
      const list = state.running || [];
      btnKill.style.display = list.length ? 'inline-flex' : 'none';
      if (!list.length) {
        setState(ch03, 'live');
        ch03Value.textContent = t('ch03.clean');
        ch03Meta.textContent = t('ch03.cleanMeta');
        return;
      }
      setState(ch03, 'stale');
      ch03Value.textContent = t('ch03.stale', { n: list.length, pids: list.map(r => r.pid).join(', ') });
      ch03Meta.textContent = t('ch03.staleMeta');
    }

    function renderBar() {
      const { phase, params } = state.bar;
      const map = {
        idle: ['idle', 'idle.key', 'idle.cn', 'idle.target'],
        probing: ['probing', 'scanning.key', 'scanning.cn', 'scanning.target'],
        armed: ['armed', 'armed.key', 'armed.cn', null],
        launching: ['probing', 'launching.key', 'launching.cn', null],
        launched: ['armed', 'launched.key', 'launched.cn', null],
        stale: ['blocked', 'stale.key', 'stale.cn', null],
        noproxy: ['blocked', 'noproxy.key', 'noproxy.cn', null],
        failed: ['blocked', 'failed.key', 'failed.cn', null],
      };
      const [ds, kKey, kCn, kTarget] = map[phase] || map.idle;
      setState(launchBar, ds);
      lbKey.textContent = t(kKey);
      lbCn.textContent = phase === 'launched' ? `${t(kCn)} PID ${params.pid}` : t(kCn);
      lbTarget.textContent = kTarget ? t(kTarget) : (params.target || '');
    }

    function renderEnv() {
      const b = state.best;
      const http = b && `http://${b.host}:${b.port}`;
      const socks = b && `socks5://${b.host}:${b.port}`;
      const rows = [
        ['HTTPS_PROXY', http], ['HTTP_PROXY', http], ['ALL_PROXY', socks],
        ['https_proxy', http], ['http_proxy', http], ['all_proxy', socks],
        ['NO_PROXY', 'localhost,127.0.0.1,::1'], ['no_proxy', 'localhost,127.0.0.1,::1'],
      ];
      envGrid.replaceChildren(...rows.map(([k, v]) => {
        const cell = document.createElement('div');
        cell.className = 'env-row' + (v ? '' : ' off');
        const key = document.createElement('span');
        key.className = 'env-k mono';
        key.textContent = k;
        const val = document.createElement('span');
        val.className = 'env-v mono';
        val.textContent = v || '—';
        cell.append(key, val);
        return cell;
      }));
    }

    async function copyCmdText(text, btn, typeName) {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        pushLog('ok', 'log.copied', { type: typeName });
        const originalText = btn.textContent;
        btn.textContent = t('copied');
        btn.classList.add('on');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('on');
        }, 1500);
      } catch (err) {
        console.error('Clipboard copy failed:', err);
      }
    }

    function renderAdaptiveButtons() {
      const isWin = state.platform === 'win32';
      copyBar.replaceChildren();

      const addBtn = (labelKey, tipKey, onClick) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-sm';
        btn.textContent = t(labelKey);
        btn.title = t(tipKey);
        btn.onclick = onClick;
        copyBar.appendChild(btn);
        return btn;
      };

      const addCopyBtn = (labelKey, tipKey, commandGetter, typeDesc) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-sm';
        btn.textContent = t(labelKey);
        btn.title = t(tipKey);
        btn.onclick = async () => {
          const cmds = await ctx.call('get-proxy-commands');
          const text = commandGetter(cmds || {});
          await copyCmdText(text, btn, typeDesc);
        };
        copyBar.appendChild(btn);
        return btn;
      };

      if (isWin) {
        addBtn('openPwsh', 'tip.openPwsh', () => ctx.call('terminal', { type: 'powershell' }));
        addBtn('openCmd', 'tip.openCmd', () => ctx.call('terminal', { type: 'cmd' }));
        addCopyBtn('copyPwsh', 'tip.copyPwsh', c => c.powershell, 'PowerShell');
        addCopyBtn('copyCmd', 'tip.copyCmd', c => c.cmd, 'CMD');
        addCopyBtn('copyGit', 'tip.copyGit', c => c.git, 'Git');
        addCopyBtn('copyGitUnset', 'tip.copyGitUnset', c => c.gitUnset, 'Git Unset');
        addCopyBtn('copySysProxy', 'tip.copySysProxy', c => c.sysProxy, 'System Proxy');
        addCopyBtn('copySysProxyUnset', 'tip.copySysProxyUnset', c => c.sysProxyUnset, 'Unset System Proxy');
        addCopyBtn('copyLaunchTerm', 'tip.copyLaunchTerm', c => c.launchTerminalCmd, 'Launch Terminal');
      } else {
        addBtn('openTerminalApp', 'tip.openTerminalApp', () => ctx.call('terminal', { type: 'terminal' }));
        addCopyBtn('copyShell', 'tip.copyShell', c => c.shell, 'Shell export');
        addCopyBtn('copyGit', 'tip.copyGit', c => c.git, 'Git');
        addCopyBtn('copyGitUnset', 'tip.copyGitUnset', c => c.gitUnset, 'Git Unset');
        addCopyBtn('copySysProxy', 'tip.copySysProxy', c => c.sysProxy, 'System Proxy');
        addCopyBtn('copySysProxyUnset', 'tip.copySysProxyUnset', c => c.sysProxyUnset, 'Unset System Proxy');
        addCopyBtn('copyLaunchTerm', 'tip.copyLaunchTerm', c => c.launchTerminalCmd, 'Launch Terminal');
      }
    }

    function repaint() {
      renderTunnel();
      renderProxy();
      renderTarget();
      renderRunning();
      renderBar();
      renderEnv();
      renderAdaptiveButtons();
      repaintLogs();
    }

    async function doDiagnose() {
      if (state.diagnosing) return;
      state.diagnosing = true;
      btnDiagnose.classList.add('on');
      renderTunnel();
      try {
        const res = await ctx.call('diagnose-network');
        if (res) {
          state.ipInfo = res.ipInfo || state.ipInfo;
          state.pings = res.pings || state.pings;
        }
      } catch (e) {
        console.error('Diagnosis failed:', e);
      } finally {
        state.diagnosing = false;
        btnDiagnose.classList.remove('on');
        renderTunnel();
      }
    }

    async function doProbe() {
      state.best = null;
      state.running = [];
      state.probing = true;
      state.target = null;
      proxyForm.hidden = true;
      repaint();
      pushLog('sys', 'log.startProbe');

      try {
        const res = await ctx.call('probe');
        state.probing = false;
        if (res) {
          state.target = res.target;
          state.running = res.running || [];
          state.best = res.proxyBest;
          state.bar = state.best
            ? { phase: 'armed', params: { target: `:${state.best.port} ${state.best.kind}` } }
            : { phase: 'noproxy', params: {} };
        }
      } catch (err) {
        state.probing = false;
        state.bar = { phase: 'failed', params: {} };
        pushLog('err', 'err.noProxy');
      }
      repaint();
      doDiagnose();
    }

    async function doLaunch() {
      if (state.running && state.running.length) {
        pushLog('err', 'err.blockedStale');
        state.bar = { phase: 'stale', params: {} };
        renderBar();
        return;
      }
      if (!state.best) {
        pushLog('err', 'err.noProxy');
        state.bar = { phase: 'noproxy', params: {} };
        renderBar();
        return;
      }
      state.bar = { phase: 'launching', params: {} };
      renderBar();

      const res = await ctx.call('launch');
      if (res && res.ok) {
        state.bar = { phase: 'launched', params: { pid: res.pid } };
        renderBar();
        setTimeout(async () => {
          const probeRes = await ctx.call('probe');
          if (probeRes) {
            state.running = probeRes.running || [];
            renderRunning();
          }
        }, 1500);
      } else {
        const errKey = (res && res.errKey) ? res.errKey : 'err.noTarget';
        pushLog('err', errKey);
        state.bar = { phase: (res && res.needsQuit) ? 'stale' : 'failed', params: {} };
        renderBar();
      }
    }

    // Event listeners
    btnToggleIp.onclick = () => {
      state.ipMasked = !state.ipMasked;
      localStorage.setItem('agy.ipMasked', String(state.ipMasked));
      renderTunnel();
    };

    btnDiagnose.onclick = () => doDiagnose();
    btnRetarget.onclick = () => doProbe();

    btnProxyManual.onclick = () => {
      proxyForm.hidden = !proxyForm.hidden;
      if (!proxyForm.hidden) proxyInput.focus();
    };

    proxyApply.onclick = async () => {
      const val = proxyInput.value.trim();
      await ctx.call('set-proxy', { url: val || null });
      proxyForm.hidden = true;
      doProbe();
    };

    proxyClear.onclick = async () => {
      proxyInput.value = '';
      await ctx.call('set-proxy', { url: null });
      proxyForm.hidden = true;
      doProbe();
    };

    btnChoose.onclick = async () => {
      const p = await ctx.call('choose-target');
      if (p) doProbe();
    };

    btnKill.onclick = async () => {
      const pids = state.running.map(r => r.pid);
      const left = await ctx.call('quit-instances', { pids });
      state.running = left || [];
      renderRunning();
      if (!state.running.length) {
        state.bar = state.best
          ? { phase: 'armed', params: { target: `:${state.best.port} ${state.best.kind}` } }
          : { phase: 'noproxy', params: {} };
        renderBar();
      }
    };

    launchBar.onclick = () => {
      if (state.probing) return;
      if (state.bar.phase === 'armed' || state.bar.phase === 'launched') {
        doLaunch();
      } else {
        doProbe();
      }
    };

    // Subscriptions using host's ctx.onEvent
    const listen = (ch, fn) => {
      if (typeof ctx.onEvent === 'function') {
        ctx.onEvent(ch, fn);
      } else if (typeof ctx.on === 'function') {
        ctx.on(ch, fn);
      }
    };

    listen('log', e => {
      if (e) pushLog(e.level, e.k, e.p);
    });

    listen('probe:candidate', c => {
      if (c) {
        pushLog(c.loginOk ? 'ok' : c.kind === 'dead' ? 'err' : 'warn',
          c.loginOk ? 'log.candidateOk' : 'log.candidateFail',
          {
            ep: c.endpoint,
            origin: c.origin,
            kind: c.kind,
            model: t(c.modelOk ? 'log.candPass.yes' : 'log.candPass.no'),
            detail: c.detail,
          });
      }
    });

    // Boot
    ctx.call('boot').then(bootInfo => {
      if (bootInfo) {
        state.platform = bootInfo.platform || 'win32';
        if (bootInfo.config && bootInfo.config.proxyUrl) {
          proxyInput.value = bootInfo.config.proxyUrl;
        }
      }
      pushLog('sys', 'log.ready');
      pushLog('sys', 'log.whyGo');
      doProbe();
    }).catch(err => {
      console.error('Boot error:', err);
      doProbe();
    });
  }

  window.Toolbox.panel({ mount });
})();
