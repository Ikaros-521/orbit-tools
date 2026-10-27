/* antigravity-launcher host panel.
   Integrated into Orbit Toolbox.
   Auto-synced with host light/dark themes and language. */
(function () {
  const DICT = {
    zh: {
      subtitle: '进程级代理注入器',
      'g.tunnel': '隧道与网络诊断', 'g.channels': '通道', 'g.console': '日志', 'g.env': '将写入子进程环境',
      'node.proxyIdle': '未探测',
      'role.ch01': '代理端点', 'role.ch02': '客户端二进制', 'role.ch03': '进程树',
      'reprobe': '重新探测', 'manual': '手动指定', 'choose': '手动选择',
      'openPwsh': 'PowerShell', 'openCmd': 'CMD', 'openTerminalApp': '打开终端',
      'copyPwsh': 'PowerShell', 'copyCmd': 'CMD', 'copyShell': 'Shell export', 'copyGit': 'Git 代理', 'copyGitUnset': '清除 Git',
      'copySysProxy': '系统代理', 'copySysProxyUnset': '清除系统代理', 'copyLaunchTerm': '启动终端命令',
      'tip.openPwsh': '在当前工作目录下启动已注入代理环境变量的 PowerShell 窗口',
      'tip.openCmd': '在当前工作目录下启动已注入代理环境变量的 CMD 窗口',
      'tip.openTerminalApp': '在当前工作目录下启动已注入代理环境变量的原生终端窗口',
      'tip.copyPwsh': '复制 PowerShell 会话级临时代理设置命令（$env:HTTP_PROXY=...）',
      'tip.copyCmd': '复制 CMD 会话级临时代理设置命令（set "HTTP_PROXY=..."）',
      'tip.copyShell': '复制 Shell (bash/zsh) 临时代理设置命令（export HTTP_PROXY=...）',
      'tip.copyGit': '复制 Git 全局代理配置命令（git config --global http.proxy ...）',
      'tip.copyGitUnset': '复制清除 Git 全局代理配置的命令',
      'tip.copySysProxy': '复制操作系统全局系统代理开启命令（不影响本软件纯净性）',
      'tip.copySysProxyUnset': '复制关闭操作系统全局系统代理的命令',
      'tip.copyLaunchTerm': '复制一条可在 Win+R 或别处直接拉起带代理终端的完整运行命令',
      'reDiagnose': '测速 / 刷新 IP',
      'toggleIp': '显示 / 隐藏 IP（防截图泄露）',
      'copied': '已复制 ✓',
      'kill': '终止残留实例', 'apply': '写入', 'clear': '清除',
      'proxyPlaceholder': 'http://127.0.0.1:10808 或 socks5://127.0.0.1:7891',
      'foot1': '仅向 Antigravity 进程树注入代理', 'foot2': '不开 TUN · 不改系统代理',
      'envNote': 'Go 的 net/http 完全不读 ALL_PROXY，也读不到 Windows 注册表代理；所以 HTTP(S)_PROXY 才是 language_server 唯一认的那一组，大小写各写一份是因为部分库只认小写。',

      'idle.key': 'READY', 'idle.cn': '探测通道', 'idle.target': '点击开始探测',
      'scanning.key': 'SCANNING', 'scanning.cn': '通道探测中', 'scanning.target': '正在验证代理与安装路径',
      'armed.key': 'ARMED', 'armed.cn': '可以启动',
      'launching.key': 'LAUNCHING', 'launching.cn': '注入并启动中',
      'launched.key': 'LAUNCHED', 'launched.cn': '已启动',
      'blocked.key': 'BLOCKED', 'failed.key': 'FAILED', 'failed.cn': '启动失败',
      'stale.key': 'STALE', 'stale.cn': '先退出旧实例',
      'noproxy.key': 'NO PROXY', 'noproxy.cn': '代理不可用',

      'log.ready': 'Antigravity Launcher 就绪 — 只向进程树注入代理，不开 TUN，不改系统代理',
      'log.whyGo': '提示：Go 写的 language_server 只读环境变量，不读 Windows 注册表代理，这正是本工具存在的原因',
      'log.startProbe': '开始探测 — 系统代理优先，其后扫描常见本地端口',
      'log.foundTarget': 'CH02 已定位 {path}（{source}）',
      'log.noTarget': 'CH02 未找到 Antigravity，请手动指定',
      'log.proxyOk': 'CH01 代理可用：{ep}（类型 {kind}，登录端点已验证，模型端点{model}）',
      'log.proxyOk.yes': '已验证', 'log.proxyOk.no': '未验证',
      'log.proxyNone': 'CH01 没有任何候选端口通过 CONNECT / SOCKS5 握手',
      'log.running': 'CH03 检测到 {n} 个未注入代理的实例：PID {pids}',
      'log.clean': 'CH03 无残留实例，可以干净启动',
      'log.launched': '已启动 PID {pid}，注入 {ep}',
      'log.raised': 'CH03 抬窗结果：{msg}',
      'log.spawnFail': '启动失败：{msg}',
      'log.killed': '已终止残留实例 PID {pids}',
      'log.manualTarget': 'CH02 手动指定：{path}',
      'log.manualProxy': 'CH01 写入手动代理：{url}',
      'log.clearedProxy': 'CH01 已清除手动代理，恢复自动探测',
      'log.workDirSet': 'CH04 工作目录已设置为：{path}',
      'log.terminalOpened': 'CH04 已启动 {type} 终端，工作目录：{dir}，代理：{ep}',
      'log.copied': '已复制命令到剪贴板：{type}',
      'log.directIp': '直连公网出口：{ip}（{country}）',
      'log.proxyIp': '代理出口端点：{ip}（{country}）',
      'log.pingOk': '外网测速 {label}：{rtt} · 连接通畅',
      'log.pingFail': '外网测速 {label} 失败：{reason}',
      'log.candidateOk': 'CH01 候选 {ep} [{origin}] → {kind} · LOGIN 通 · MODELS {model}',
      'log.candidateFail': 'CH01 候选 {ep} [{origin}] → {kind} · {detail}',
      'log.candPass.yes': '通', 'log.candPass.no': '不通',

      'ch01.probing': '读取系统代理并逐个握手验证…',
      'ch01.probeMeta': 'HTTP CONNECT 与 SOCKS5 双模探测，目标域名不预解析',
      'ch01.none': '没有任何候选端口通过握手',
      'ch01.noneMeta': '确认代理客户端已启动；若端口非典型，请用「手动指定」',
      'ch01.okMeta': '类型 {kind} · 来源 {origin} · 已用 CONNECT / SOCKS5 握手验证',
      'ch02.searching': '搜索安装目录…',
      'ch02.none': '未定位到 Antigravity 可执行文件',
      'ch02.noneMeta': '点「手动选择」指到 exe / .app 内层二进制，选择结果会记住',
      'ch02.okMetaLs': '来源 {source} · 已确认 resources/bin/language_server',
      'ch02.okMetaNoLs': '来源 {source} · 未确认 language_server，可能不是标准安装',
      'ch03.waiting': '等待前两条通道',
      'ch03.clean': '无残留实例',
      'ch03.cleanMeta': '干净状态，新进程会正确继承代理环境变量',
      'ch03.stale': '检测到 {n} 个实例 · PID {pids}',
      'ch03.staleMeta': '环境变量无法注入已运行进程，必须完全退出后再启动',
      'ch03.launchedMeta': '子进程（language_server）继承同一份代理环境变量',

      'err.noTarget': '未定位到 Antigravity 可执行文件',
      'err.noProxy': '没有可用的本地代理端点',
      'err.stale': '必须先完全退出旧实例，环境变量无法注入已运行的进程',
      'err.blockedStale': 'CH03 阻塞：检测到残留实例，请先「终止残留实例」或手动完全退出',
    },
    en: {
      subtitle: 'Process-local proxy injector',
      'g.tunnel': 'Tunnel & Diagnostics', 'g.channels': 'Channels', 'g.console': 'Console', 'g.env': 'Will Write to Child Env',
      'node.proxyIdle': 'Unprobed',
      'role.ch01': 'Proxy Endpoint', 'role.ch02': 'Client Binary', 'role.ch03': 'Process Tree',
      'reprobe': 'Reprobe', 'manual': 'Manual', 'choose': 'Select',
      'openPwsh': 'PowerShell', 'openCmd': 'CMD', 'openTerminalApp': 'Terminal',
      'copyPwsh': 'PowerShell', 'copyCmd': 'CMD', 'copyShell': 'Shell export', 'copyGit': 'Git Proxy', 'copyGitUnset': 'Unset Git',
      'copySysProxy': 'Sys Proxy', 'copySysProxyUnset': 'Unset Sys Proxy', 'copyLaunchTerm': 'Launch Term Cmd',
      'tip.openPwsh': 'Open PowerShell window with proxy environment pre-set',
      'tip.openCmd': 'Open CMD window with proxy environment pre-set',
      'tip.openTerminalApp': 'Open native terminal window with proxy environment pre-set',
      'tip.copyPwsh': 'Copy PowerShell session proxy command ($env:HTTP_PROXY=...)',
      'tip.copyCmd': 'Copy CMD session proxy command (set "HTTP_PROXY=...")',
      'tip.copyShell': 'Copy Shell (bash/zsh) proxy command (export HTTP_PROXY=...)',
      'tip.copyGit': 'Copy Git global proxy command (git config --global http.proxy ...)',
      'tip.copyGitUnset': 'Copy command to unset Git global proxy',
      'tip.copySysProxy': 'Copy OS system proxy command',
      'tip.copySysProxyUnset': 'Copy command to unset OS system proxy',
      'tip.copyLaunchTerm': 'Copy one-liner command to launch a proxy-injected terminal',
      'reDiagnose': 'Speed / Refresh IP',
      'toggleIp': 'Toggle IP Masking (Anti-Leak)',
      'copied': 'Copied ✓',
      'kill': 'Kill stale instances', 'apply': 'Apply', 'clear': 'Clear',
      'proxyPlaceholder': 'http://127.0.0.1:10808 or socks5://127.0.0.1:7891',
      'foot1': 'Injects proxy into the Antigravity process tree only', 'foot2': 'No TUN · No system proxy alteration',
      'envNote': 'Go net/http ignores ALL_PROXY and registry proxy; HTTP(S)_PROXY is the only set language_server reads.',

      'idle.key': 'READY', 'idle.cn': 'Channels', 'idle.target': 'Click to probe',
      'scanning.key': 'SCANNING', 'scanning.cn': 'Probing Channels', 'scanning.target': 'Verifying proxy and install path',
      'armed.key': 'ARMED', 'armed.cn': 'Ready to Launch',
      'launching.key': 'LAUNCHING', 'launching.cn': 'Injecting and Launching',
      'launched.key': 'LAUNCHED', 'launched.cn': 'Launched',
      'blocked.key': 'BLOCKED', 'failed.key': 'FAILED', 'failed.cn': 'Launch Failed',
      'stale.key': 'STALE', 'stale.cn': 'Quit Old Instances First',
      'noproxy.key': 'NO PROXY', 'noproxy.cn': 'Proxy Unusable',

      'log.ready': 'Antigravity Launcher ready — process tree injection, no TUN, no registry tampering',
      'log.whyGo': 'Note: Go language_server only reads env vars, not system proxy registry',
      'log.startProbe': 'Probing started — checking system proxy then common local ports',
      'log.foundTarget': 'CH02 Located {path} ({source})',
      'log.noTarget': 'CH02 Antigravity not found, please specify manually',
      'log.proxyOk': 'CH01 Usable proxy: {ep} (kind {kind}, login verified, models {model})',
      'log.proxyOk.yes': 'verified', 'log.proxyOk.no': 'unverified',
      'log.proxyNone': 'CH01 No candidate passed CONNECT / SOCKS5 handshake',
      'log.running': 'CH03 Found {n} un-injected running instances: PID {pids}',
      'log.clean': 'CH03 Clean state, ready to launch',
      'log.launched': 'Launched PID {pid}, injected {ep}',
      'log.raised': 'CH03 Window raise result: {msg}',
      'log.spawnFail': 'Launch failed: {msg}',
      'log.killed': 'Terminated stale instances PID {pids}',
      'log.manualTarget': 'CH02 Manual target: {path}',
      'log.manualProxy': 'CH01 Set manual proxy: {url}',
      'log.clearedProxy': 'CH01 Cleared manual proxy, restored auto probe',
      'log.workDirSet': 'CH04 Work dir set to: {path}',
      'log.terminalOpened': 'CH04 Opened {type} terminal, dir: {dir}, proxy: {ep}',
      'log.copied': 'Copied command: {type}',
      'log.directIp': 'Direct egress IP: {ip} ({country})',
      'log.proxyIp': 'Proxy egress IP: {ip} ({country})',
      'log.pingOk': 'Ping {label}: {rtt} · OK',
      'log.pingFail': 'Ping {label} failed: {reason}',
      'log.candidateOk': 'CH01 Candidate {ep} [{origin}] → {kind} · LOGIN OK · MODELS {model}',
      'log.candidateFail': 'CH01 Candidate {ep} [{origin}] → {kind} · {detail}',
      'log.candPass.yes': 'OK', 'log.candPass.no': 'FAIL',

      'ch01.probing': 'Reading system proxy and probing handshakes…',
      'ch01.probeMeta': 'HTTP CONNECT & SOCKS5 dual-mode, un-resolved domain',
      'ch01.none': 'No candidate passed handshake',
      'ch01.noneMeta': 'Ensure proxy client is running or use Manual',
      'ch01.okMeta': 'Kind {kind} · Source {origin} · Handshake verified',
      'ch02.searching': 'Searching install path…',
      'ch02.none': 'Antigravity binary not located',
      'ch02.noneMeta': 'Click Select to point to exe / .app inner binary',
      'ch02.okMetaLs': 'Source {source} · Verified resources/bin/language_server',
      'ch02.okMetaNoLs': 'Source {source} · language_server unverified',
      'ch03.waiting': 'Waiting for CH01 & CH02',
      'ch03.clean': 'No stale instances',
      'ch03.cleanMeta': 'Clean state, child process will inherit proxy env',
      'ch03.stale': 'Detected {n} instances · PID {pids}',
      'ch03.staleMeta': 'Env cannot inject running process, quit old ones first',
      'ch03.launchedMeta': 'Child processes inherit the same proxy env',

      'err.noTarget': 'Antigravity binary not found',
      'err.noProxy': 'No usable local proxy endpoint',
      'err.stale': 'Must completely exit old instances first',
      'err.blockedStale': 'CH03 Blocked: detected stale instances, please kill them first',
    },
  };

  const EYE_ICONS = {
    show: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    hide: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  };

  function maskIp(ip) {
    if (!ip) return '—';
    const parts = String(ip).trim().split('.');
    if (parts.length === 4) return `${parts[0]}.***.***.${parts[3]}`;
    return ip.length > 7 ? `${ip.slice(0, 3)}****${ip.slice(-3)}` : '****';
  }

  function mount(el, ctx) {
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
