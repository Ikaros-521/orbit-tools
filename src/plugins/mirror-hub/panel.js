/* mirror-hub panel - domestic mirrors, terminal proxy launcher & custom mirrors */
(function () {
  function mount(el, ctx) {
    const isEn = ctx.lang === 'en';
    const T = {
      proxyLabel: isEn ? 'Proxy URL:' : '本地代理地址:',
      proxyPlaceholder: 'http://127.0.0.1:7890',
      detectProxy: isEn ? 'Auto Detect' : '自动读取',
      detectProxyTip: isEn ? 'Auto-detect system proxy or active local proxy client' : '自动读取本机系统代理或本地代理客户端端口',
      detectingProxy: isEn ? 'Detecting...' : '检测中...',
      detectedProxyOk: isEn ? '✓ Detected' : '✓ 已读取',
      pkgLabel: isEn ? 'Package / Repo:' : '包名 / 仓库名:',
      copy: isEn ? 'Copy' : '复制命令',
      copied: isEn ? '✓ Copied' : '✓ 已复制',
      run: isEn ? 'Run in Terminal' : '🚀 打开终端执行',
      running: isEn ? '✓ Launched' : '✓ 终端已运行',
      openUrl: isEn ? '🌐 Direct Download' : '🌐 浏览器直接下载',
      copyUrl: isEn ? '📋 Copy Link' : '📋 复制直链',
      selectMirror: isEn ? 'Mirror:' : '镜像源:',
      tagMirror: isEn ? 'MIRROR' : '国内镜像',
      tagProxy: isEn ? 'PROXY' : '网络代理',
      tagReset: isEn ? 'DEFAULT' : '恢复默认',
      pingAll: isEn ? '⚡ Ping Test' : '⚡ 测速',
      pinging: isEn ? 'Pinging...' : '测速中...',
      manageMirrors: isEn ? '⚙ Custom Mirrors' : '⚙ 自定义源',
      modalTitle: isEn ? 'Manage Mirrors' : '镜像加速源管理',
      formName: isEn ? 'Mirror Name' : '镜像名称',
      formNamePlaceholder: isEn ? 'e.g. My Fast Mirror' : '例如：香港自建加速节点',
      formUrl: isEn ? 'Mirror URL / Prefix' : '镜像地址前缀',
      formUrlPlaceholder: isEn ? 'e.g. https://gh.example.com/https://github.com/' : '例如：https://my-proxy.com/https://github.com/',
      formNote: isEn ? 'Notes (Optional)' : '备注说明（可选）',
      formNotePlaceholder: isEn ? 'Optional description' : '可选说明，如无缓存/不限速等',
      btnAdd: isEn ? 'Add Mirror' : '添加镜像源',
      thName: isEn ? 'Name' : '名称',
      thUrl: isEn ? 'URL Prefix' : '地址前缀',
      thLatency: isEn ? 'Latency' : '延迟',
      thAction: isEn ? 'Action' : '操作',
      badgeBuiltin: isEn ? 'Builtin' : '内置',
      badgeCustom: isEn ? 'Custom' : '自定义',
      del: isEn ? 'Delete' : '删除',
      close: isEn ? 'Close' : '关闭',
      alertRequired: isEn ? 'Please fill in both Name and URL prefix.' : '请填写镜像名称与地址前缀。',
      confirmDel: isEn ? 'Delete this custom mirror?' : '确定删除该自定义镜像源吗？',
      downloadInputLabel: isEn ? 'Release File / Direct URL:' : 'Release 文件直链或文件名:',
      downloadInputPlaceholder: isEn ? 'Paste full release asset URL, or file name (e.g. app-setup.exe)' : '粘贴完整 Release 文件直链，或输入文件名（如 app.exe）',
    };

    const ENVS = [
      {
        id: 'git',
        name: 'Git & GitHub',
        defaultPkg: 'Ikaros-521/orbit-tools',
        mirrors: [
          // 2026-10 实测高速高可用节点（按延迟排序）
          { name: '香港节点 (hk.gh-proxy.org)', url: 'https://hk.gh-proxy.org/https://github.com/' },
          { name: 'Cloudflare CDN (ghpxy.hwinzniej.top)', url: 'https://ghpxy.hwinzniej.top/https://github.com/' },
          { name: '多线加速 (ghps.cc)', url: 'https://ghps.cc/https://github.com/' },
          { name: 'Cloudflare CDN (gh.chjina.com)', url: 'https://gh.chjina.com/https://github.com/' },
          { name: '公益主站 (gh-proxy.org)', url: 'https://gh-proxy.org/https://github.com/' },
          { name: 'Cloudflare CDN (github.ednovas.xyz)', url: 'https://github.ednovas.xyz/https://github.com/' },
          { name: 'Anycast CDN (ghfast.top)', url: 'https://ghfast.top/https://github.com/' },
          { name: '经典公益源 (gh-proxy.com)', url: 'https://gh-proxy.com/https://github.com/' },
          { name: '备用源 (gh-proxy.net)', url: 'https://gh-proxy.net/https://github.com/' },
          { name: '香港节点 (hk.gh-proxy.com)', url: 'https://hk.gh-proxy.com/https://github.com/' },
          { name: '美国 CDN (gh.monlor.com)', url: 'https://gh.monlor.com/https://github.com/' },
          { name: 'CrashMC CDN (cdn.crashmc.com)', url: 'https://cdn.crashmc.com/https://github.com/' },
          { name: 'Boki CDN (github.boki.moe)', url: 'https://github.boki.moe/https://github.com/' },
        ],
        cards: [
          {
            id: 'release-download',
            title: isEn ? 'Fast GitHub Release & Asset Download' : 'GitHub Release / 归档文件加速下载',
            tag: 'tagMirror',
            desc: isEn ? 'Converts any GitHub release download URL into high-speed accelerated direct link' : '支持将任意 GitHub 文件或 Release 下载直链转换为国内免翻墙高速下载链接',
            hasMirror: true,
            isDownloadHelper: true,
            buildCmd: ({ mirror, pkg, downloadInput }) => {
              const url = buildReleaseDownloadUrl(mirror, downloadInput, pkg);
              return `curl -L -C - -O "${url}"`;
            },
          },
          {
            id: 'git-clone',
            title: isEn ? 'Fast GitHub Clone via Accelerator' : 'GitHub 仓库免翻墙克隆加速 (git clone)',
            tag: 'tagMirror',
            desc: isEn ? 'Clones public GitHub repository via web accelerator reverse proxy' : '使用公网反向代理加速镜像，免代理高速克隆 GitHub 项目',
            hasMirror: true,
            buildCmd: ({ mirror, pkg }) => {
              const cleanRepo = (pkg || 'Ikaros-521/orbit-tools').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
              return `git clone ${mirror}${cleanRepo}.git`;
            },
          },
          {
            id: 'raw-get',
            title: isEn ? 'Fast GitHub Raw File Pull' : 'GitHub Raw 文件加速获取',
            tag: 'tagMirror',
            desc: isEn ? 'Downloads raw scripts or files from raw.githubusercontent.com via proxy' : '快速免翻墙获取 raw.githubusercontent.com 上的脚本或文档',
            hasMirror: true,
            buildCmd: ({ mirror, pkg }) => {
              const cleanRepo = (pkg || 'Ikaros-521/orbit-tools').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
              const cleanBase = mirror.replace(/\/https:\/\/github\.com\/?$/, '');
              return `curl -fsSL ${cleanBase}/https://raw.githubusercontent.com/${cleanRepo}/main/README.md -o README.md`;
            },
          },
          {
            id: 'ssh-443',
            title: isEn ? 'GitHub SSH over Port 443' : 'GitHub 443 端口 SSH 配置 (突破 22 端口屏蔽)',
            tag: 'tagMirror',
            desc: isEn ? 'Configures SSH to use port 443 for firewalled network environments' : '在校园网或企业内网屏蔽 22 端口时，通过 GitHub 官方备用 443 端口正常使用 SSH',
            hasMirror: false,
            buildCmd: () => {
              const isWin = typeof navigator !== 'undefined' && (navigator.platform.includes('Win') || navigator.userAgent.includes('Windows'));
              if (isWin) {
                return `Add-Content -Path $HOME\\.ssh\\config -Value "\`nHost github.com\`n  Hostname ssh.github.com\`n  Port 443\`n  User git"`;
              }
              return `printf "\\nHost github.com\\n  Hostname ssh.github.com\\n  Port 443\\n  User git\\n" >> ~/.ssh/config`;
            },
          },
          {
            id: 'git-proxy',
            title: isEn ? 'Set Git Global HTTP Proxy' : '配置 Git 全局 HTTP 代理',
            tag: 'tagProxy',
            desc: isEn ? 'Routes all git clone & push through your local proxy' : '让所有 git clone 和 git push 通过本地客户端代理端口加速',
            hasMirror: false,
            buildCmd: ({ proxy }) => `git config --global http.proxy ${proxy}; git config --global https.proxy ${proxy}`,
          },
          {
            id: 'git-unproxy',
            title: isEn ? 'Clear Git Global Proxy' : '清除 Git 全局代理设置',
            tag: 'tagReset',
            desc: isEn ? 'Unsets git global http.proxy and https.proxy' : '取消全局代理，恢复直接网络直连',
            hasMirror: false,
            buildCmd: () => `git config --global --unset http.proxy; git config --global --unset https.proxy`,
          },
        ],
      },
      {
        id: 'pip',
        name: 'Python (pip)',
        defaultPkg: 'requests',
        mirrors: [
          { name: '清华大学 (TUNA)', url: 'https://pypi.tuna.tsinghua.edu.cn/simple' },
          { name: '阿里云 (Aliyun)', url: 'https://mirrors.aliyun.com/pypi/simple/' },
          { name: '腾讯云 (Tencent)', url: 'https://mirrors.cloud.tencent.com/pypi/simple/' },
          { name: '华为云 (Huawei)', url: 'https://repo.huaweicloud.com/repository/pypi/simple/' },
          { name: '中国科技大学 (USTC)', url: 'https://pypi.mirrors.ustc.edu.cn/simple/' },
        ],
        cards: [
          {
            title: isEn ? 'Set Global Domestic Mirror' : '永久设置全局国内源',
            tag: 'tagMirror',
            desc: isEn ? 'Configures pip to always download packages from selected mirror' : '修改全局配置，今后使用 pip install 将默认通过选中的国内镜像源下载',
            hasMirror: true,
            buildCmd: ({ mirror }) => `pip config set global.index-url ${mirror}`,
          },
          {
            title: isEn ? 'Install via Mirror (Once)' : '单次使用国内镜像安装',
            tag: 'tagMirror',
            desc: isEn ? 'Installs specific package using temporary mirror flag without modifying config' : '单次安装指定软件包，携带 -i 参数，不改变全局系统配置',
            hasMirror: true,
            buildCmd: ({ mirror, pkg }) => `pip install ${pkg} -i ${mirror}`,
          },
          {
            title: isEn ? 'Install via Proxy (Once)' : '携带本地代理单次安装',
            tag: 'tagProxy',
            desc: isEn ? 'Routes pip connection directly through your local HTTP proxy' : '让 pip 直连本地代理进行下载安装，适合需要翻墙拉取国外二进制 wheel 包场景',
            hasMirror: false,
            buildCmd: ({ proxy, pkg }) => `pip install ${pkg} --proxy ${proxy}`,
          },
          {
            title: isEn ? 'Restore Official PyPI' : '恢复官方默认源',
            tag: 'tagReset',
            desc: isEn ? 'Removes global.index-url and restores official python index' : '清除自定义全局镜像源配置，恢复官方原始 PyPI 源',
            hasMirror: false,
            buildCmd: () => `pip config unset global.index-url`,
          },
        ],
      },
      {
        id: 'npm',
        name: 'Node.js (npm)',
        defaultPkg: 'vite',
        mirrors: [
          { name: '淘宝 / npmmirror', url: 'https://registry.npmmirror.com' },
          { name: '腾讯云 (Tencent)', url: 'https://mirrors.cloud.tencent.com/npm/' },
          { name: '华为云 (Huawei)', url: 'https://repo.huaweicloud.com/repository/npm/' },
          { name: '官方 (npmjs.org)', url: 'https://registry.npmjs.org/' },
        ],
        cards: [
          {
            title: isEn ? 'Set Global npm Registry' : '永久设置 npm 镜像源',
            tag: 'tagMirror',
            desc: isEn ? 'Configures npm registry globally for high-speed download' : '将 npm 全局 registry 切换为选中的国内源',
            hasMirror: true,
            buildCmd: ({ mirror }) => `npm config set registry ${mirror}`,
          },
          {
            title: isEn ? 'Install via Registry (Once)' : '单次使用指定源安装',
            tag: 'tagMirror',
            desc: isEn ? 'Install single package using temporary --registry flag' : '单次安装指定包，携带 --registry 参数，不修改全局配置',
            hasMirror: true,
            buildCmd: ({ mirror, pkg }) => `npm install ${pkg} --registry=${mirror}`,
          },
          {
            title: isEn ? 'Configure npm Global Proxy' : '配置 npm 走本地代理',
            tag: 'tagProxy',
            desc: isEn ? 'Routes npm and node-gyp through your local HTTP proxy' : '设置 npm 的 proxy 与 https-proxy 环境变量，直连代理拉取',
            hasMirror: false,
            buildCmd: ({ proxy }) => `npm config set proxy ${proxy}; npm config set https-proxy ${proxy}`,
          },
          {
            title: isEn ? 'Restore Official npmjs' : '恢复官方默认源 & 清除代理',
            tag: 'tagReset',
            desc: isEn ? 'Restores official npmjs registry and unsets proxy configurations' : '恢复为官方 npmjs.org 源并清理已设置的代理',
            hasMirror: false,
            buildCmd: () => `npm config set registry https://registry.npmjs.org/; npm config delete proxy; npm config delete https-proxy`,
          },
        ],
      },
      {
        id: 'go',
        name: 'Go (GOPROXY)',
        defaultPkg: 'github.com/gin-gonic/gin@latest',
        mirrors: [
          { name: '七牛云 (goproxy.cn)', url: 'https://goproxy.cn,direct' },
          { name: '官方加速 (goproxy.io)', url: 'https://goproxy.io,direct' },
          { name: '阿里云 (Aliyun)', url: 'https://mirrors.aliyun.com/goproxy/,direct' },
        ],
        cards: [
          {
            title: isEn ? 'Set Global GOPROXY' : '永久设置国内 GOPROXY',
            tag: 'tagMirror',
            desc: isEn ? 'Writes GOPROXY into user go environment for ultra-fast module downloads' : '使用 go env -w 永久配置 GOPROXY 国内镜像代理',
            hasMirror: true,
            buildCmd: ({ mirror }) => `go env -w GOPROXY=${mirror}`,
          },
          {
            title: isEn ? 'Install Go Module (Once)' : '安装指定 Go 模块',
            tag: 'tagMirror',
            desc: isEn ? 'Runs go get for the module' : '快速执行 go get 拉取指定包',
            hasMirror: false,
            buildCmd: ({ pkg }) => `go get ${pkg}`,
          },
          {
            title: isEn ? 'Restore Official GOPROXY' : '恢复官方默认 GOPROXY',
            tag: 'tagReset',
            desc: isEn ? 'Restores default proxy.golang.org' : '恢复官方代理源 proxy.golang.org,direct',
            hasMirror: false,
            buildCmd: () => `go env -w GOPROXY=https://proxy.golang.org,direct`,
          },
        ],
      },
      {
        id: 'cargo',
        name: 'Rust (Cargo)',
        defaultPkg: 'tokio',
        mirrors: [
          { name: '中国科技大学 (USTC)', url: 'ustc' },
          { name: '清华大学 (TUNA)', url: 'tuna' },
          { name: '字节跳动 (Bytedance)', url: 'sjtu' },
        ],
        cards: [
          {
            title: isEn ? 'Set Cargo Registry in config.toml' : '写入 Cargo 国内镜像源配置',
            tag: 'tagMirror',
            desc: isEn ? 'Echoes recommended mirror configuration for ~/.cargo/config.toml' : '向 ~/.cargo/config.toml 快速写入 crates.io 国内镜像替换配置',
            hasMirror: true,
            buildCmd: ({ mirror }) => {
              const urlMap = {
                ustc: 'https://mirrors.ustc.edu.cn/crates.io-index',
                tuna: 'https://mirrors.tuna.tsinghua.edu.cn/git/crates.io-index.git',
                sjtu: 'https://mirrors.sjtug.sjtu.edu.cn/git/crates.io-index/',
              };
              const target = urlMap[mirror] || urlMap.ustc;
              return `[source.crates-io]\nreplace-with = 'mirror'\n\n[source.mirror]\nregistry = "sparse+${target}"`;
            },
          },
          {
            title: isEn ? 'Cargo Run with Terminal Proxy' : '携带代理编译 Cargo 项目',
            tag: 'tagProxy',
            desc: isEn ? 'Sets temporary proxy environment variables for current cargo invocation' : '注入临时 HTTP_PROXY 与 HTTPS_PROXY 环境变量，走代理直接编译拉取',
            hasMirror: false,
            buildCmd: ({ proxy, pkg }) => `$env:HTTP_PROXY="${proxy}"; $env:HTTPS_PROXY="${proxy}"; cargo add ${pkg}`,
          },
        ],
      },
      {
        id: 'terminal',
        name: '终端环境变量 (Shell)',
        defaultPkg: 'curl -I https://google.com',
        mirrors: [],
        cards: [
          {
            title: isEn ? 'PowerShell Session Proxy' : 'PowerShell 当前会话代理',
            tag: 'tagProxy',
            desc: isEn ? 'Temporarily sets $env:http_proxy and $env:https_proxy for current session' : '在当前 PowerShell 窗口临时注入代理环境变量，关闭窗口后自动失效',
            hasMirror: false,
            buildCmd: ({ proxy }) => `$env:http_proxy="${proxy}"; $env:https_proxy="${proxy}"`,
          },
          {
            title: isEn ? 'CMD Session Proxy' : 'CMD 命令行会话代理',
            tag: 'tagProxy',
            desc: isEn ? 'Sets http_proxy and https_proxy in cmd.exe' : '在传统 CMD 命令提示符中临时设置代理环境变量',
            hasMirror: false,
            buildCmd: ({ proxy }) => `set http_proxy=${proxy} && set https_proxy=${proxy}`,
          },
          {
            title: isEn ? 'Bash / Zsh / Git Bash Proxy' : 'Bash / Zsh / Linux 终端代理',
            tag: 'tagProxy',
            desc: isEn ? 'Export proxy variables for Unix shells' : '适用于 Git Bash、WSL、macOS 与 Linux 的终端单次代理命令',
            hasMirror: false,
            buildCmd: ({ proxy }) => `export http_proxy="${proxy}" https_proxy="${proxy}"`,
          },
          {
            title: isEn ? 'PowerShell Unset Proxy' : 'PowerShell 清除当前会话代理',
            tag: 'tagReset',
            desc: isEn ? 'Clears temporary proxy variables' : '清空当前 PowerShell 会话中的代理环境变量',
            hasMirror: false,
            buildCmd: () => `$env:http_proxy=""; $env:https_proxy=""`,
          },
        ],
      },
    ];

    let currentEnvId = 'git'; // Default to git for convenience
    let currentProxyUrl = 'http://127.0.0.1:7890';
    let currentPkgName = 'Ikaros-521/orbit-tools';
    let currentDownloadInput = '';
    let selectedMirrors = {}; // envId -> selectedUrl
    let customMirrorsMap = {}; // envId -> [ { id, name, url, note } ]
    let pingResultsMap = {}; // url -> { ok, ms, status }

    function getEnvMirrors(envId) {
      const env = ENVS.find(x => x.id === envId);
      const builtins = (env && env.mirrors) ? env.mirrors.map(m => ({ ...m, isCustom: false })) : [];
      const customs = (customMirrorsMap[envId] || []).map(m => ({ ...m, isCustom: true }));
      return [...builtins, ...customs];
    }

    function buildReleaseDownloadUrl(mirrorPrefix, downloadInput, pkg) {
      const rawInput = (downloadInput || '').trim();
      let fullUrl = '';
      if (/^https?:\/\/github\.com\//i.test(rawInput)) {
        fullUrl = rawInput;
      } else if (rawInput.includes('/releases/download/')) {
        fullUrl = `https://github.com/${rawInput.replace(/^\/+/, '')}`;
      } else if (rawInput) {
        const repo = (pkg || 'Ikaros-521/orbit-tools').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
        fullUrl = `https://github.com/${repo}/releases/latest/download/${rawInput.replace(/^\/+/, '')}`;
      } else {
        const repo = (pkg || 'Ikaros-521/orbit-tools').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
        fullUrl = `https://github.com/${repo}/archive/refs/heads/main.zip`;
      }
      const cleanPrefix = mirrorPrefix.replace(/\/https:\/\/github\.com\/?$/i, '').replace(/\/+$/, '');
      return `${cleanPrefix}/${fullUrl}`;
    }

    function escapeHtml(str) {
      return String(str || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    }

    el.innerHTML = `
      <div class="mhub-container">
        <div class="mhub-nav">
          ${ENVS.map(e => `
            <button type="button" class="mhub-tab-btn${e.id === currentEnvId ? ' active' : ''}" data-env="${e.id}">
              ${e.name}
            </button>
          `).join('')}
        </div>
        <div class="mhub-config-bar">
          <div class="mhub-field">
            <span class="mhub-field-label">${T.proxyLabel}</span>
            <input type="text" class="mhub-field-input mhub-proxy-input" spellcheck="false" value="${currentProxyUrl}" placeholder="${T.proxyPlaceholder}" />
            <button type="button" class="mhub-btn-detect-proxy" title="${T.detectProxyTip}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
              <span>${T.detectProxy}</span>
            </button>
          </div>
          <div class="mhub-field">
            <span class="mhub-field-label">${T.pkgLabel}</span>
            <input type="text" class="mhub-field-input mhub-pkg-input" spellcheck="false" value="${currentPkgName}" />
          </div>
          <div class="mhub-toolbar-actions">
            <button type="button" class="mhub-btn mhub-btn-ping" title="${T.pingAll}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              <span>${T.pingAll}</span>
            </button>
            <button type="button" class="mhub-btn mhub-btn-manage-mirrors" title="${T.manageMirrors}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              <span>${T.manageMirrors}</span>
            </button>
          </div>
        </div>
        <div class="mhub-body"></div>
      </div>
    `;

    const navBtns = el.querySelectorAll('.mhub-tab-btn');
    const proxyInput = el.querySelector('.mhub-proxy-input');
    const pkgInput = el.querySelector('.mhub-pkg-input');
    const pingBtn = el.querySelector('.mhub-btn-ping');
    const manageBtn = el.querySelector('.mhub-btn-manage-mirrors');
    const bodyEl = el.querySelector('.mhub-body');

    function renderCards() {
      const currentEnv = ENVS.find(x => x.id === currentEnvId) || ENVS[0];
      const allMirrors = getEnvMirrors(currentEnv.id);
      const activeMirror = selectedMirrors[currentEnv.id] || (allMirrors[0] && allMirrors[0].url) || '';

      bodyEl.innerHTML = '';
      const frag = document.createDocumentFragment();

      for (const cardDef of currentEnv.cards) {
        const cmd = cardDef.buildCmd({
          mirror: activeMirror,
          proxy: currentProxyUrl,
          pkg: currentPkgName || currentEnv.defaultPkg || 'pkg',
          downloadInput: currentDownloadInput,
        });

        const card = document.createElement('div');
        card.className = 'mhub-card';
        if (cardDef.id) card.dataset.cardId = cardDef.id;

        let mirrorSelectHtml = '';
        if (cardDef.hasMirror && allMirrors.length > 0) {
          mirrorSelectHtml = `
            <select class="mhub-mirror-select">
              ${allMirrors.map(m => {
                const ping = pingResultsMap[m.url];
                const latencyLabel = ping ? (ping.ok ? ` [${ping.ms}ms]` : ' [异常]') : '';
                const tag = m.isCustom ? ` [${T.badgeCustom}]` : '';
                return `
                  <option value="${escapeHtml(m.url)}"${m.url === activeMirror ? ' selected' : ''}>
                    ${escapeHtml(m.name)}${tag}${latencyLabel}
                  </option>
                `;
              }).join('')}
            </select>
          `;
        }

        const tagClass = cardDef.tag === 'tagProxy' ? 'mhub-tag-proxy' : cardDef.tag === 'tagReset' ? 'mhub-tag-reset' : 'mhub-tag-mirror';
        const tagText = T[cardDef.tag] || '';

        let downloadHelperHtml = '';
        if (cardDef.isDownloadHelper) {
          const directUrl = buildReleaseDownloadUrl(activeMirror, currentDownloadInput, currentPkgName);
          downloadHelperHtml = `
            <div class="mhub-download-input-row">
              <input type="text" class="mhub-download-input" placeholder="${T.downloadInputPlaceholder}" value="${escapeHtml(currentDownloadInput)}" />
              <button type="button" class="mhub-btn mhub-btn-copy-url" title="${T.copyUrl}" data-url="${escapeHtml(directUrl)}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <span>${T.copyUrl}</span>
              </button>
              <button type="button" class="mhub-btn mhub-btn-open-url" title="${T.openUrl}" data-url="${escapeHtml(directUrl)}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                <span>${T.openUrl}</span>
              </button>
            </div>
          `;
        }

        card.innerHTML = `
          <div class="mhub-card-head">
            <div class="mhub-card-title-group">
              <span class="mhub-card-title">${cardDef.title}</span>
              <span class="mhub-card-tag ${tagClass}">${tagText}</span>
            </div>
            ${mirrorSelectHtml}
          </div>
          <div class="mhub-card-desc">${cardDef.desc}</div>
          ${downloadHelperHtml}
          <div class="mhub-code-box">
            <code class="mhub-code-text">${escapeHtml(cmd)}</code>
            <div class="mhub-actions">
              <button type="button" class="mhub-btn mhub-btn-copy" title="${T.copy}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <span>${T.copy}</span>
              </button>
              <button type="button" class="mhub-btn mhub-btn-run" title="${T.run}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                <span>${T.run}</span>
              </button>
            </div>
          </div>
        `;

        // Handle mirror switch
        const select = card.querySelector('.mhub-mirror-select');
        if (select) {
          select.addEventListener('change', () => {
            selectedMirrors[currentEnv.id] = select.value;
            renderCards();
          });
        }

        // Handle download helper input
        const dlInput = card.querySelector('.mhub-download-input');
        if (dlInput) {
          dlInput.addEventListener('input', () => {
            currentDownloadInput = dlInput.value;
            renderCards();
          });
        }

        // Direct download button
        const openUrlBtn = card.querySelector('.mhub-btn-open-url');
        if (openUrlBtn) {
          openUrlBtn.addEventListener('click', async () => {
            const u = openUrlBtn.dataset.url;
            if (u) await ctx.call('openExternal', { url: u });
          });
        }

        // Copy direct download url button
        const copyUrlBtn = card.querySelector('.mhub-btn-copy-url');
        if (copyUrlBtn) {
          copyUrlBtn.addEventListener('click', async () => {
            const u = copyUrlBtn.dataset.url;
            if (u) {
              await ctx.call('copyCommand', { command: u });
              copyUrlBtn.classList.add('copied');
              copyUrlBtn.querySelector('span').textContent = T.copied;
              setTimeout(() => {
                copyUrlBtn.classList.remove('copied');
                copyUrlBtn.querySelector('span').textContent = T.copyUrl;
              }, 1000);
            }
          });
        }

        // Copy button
        const copyBtn = card.querySelector('.mhub-btn-copy');
        copyBtn.addEventListener('click', async () => {
          try {
            await ctx.call('copyCommand', { command: cmd });
            copyBtn.classList.add('copied');
            copyBtn.querySelector('span').textContent = T.copied;
            setTimeout(() => {
              copyBtn.classList.remove('copied');
              copyBtn.querySelector('span').textContent = T.copy;
            }, 1000);
          } catch (err) {
            console.error('Failed to copy command:', err);
          }
        });

        // Run button
        const runBtn = card.querySelector('.mhub-btn-run');
        runBtn.addEventListener('click', async () => {
          try {
            runBtn.classList.add('running');
            runBtn.querySelector('span').textContent = T.running;
            await ctx.call('runInTerminal', { command: cmd });
            setTimeout(() => {
              runBtn.classList.remove('running');
              runBtn.querySelector('span').textContent = T.run;
            }, 1200);
          } catch (err) {
            console.error('Failed to launch terminal:', err);
          }
        });

        frag.appendChild(card);
      }

      bodyEl.appendChild(frag);
    }

    // Ping test action
    pingBtn.addEventListener('click', async () => {
      pingBtn.disabled = true;
      pingBtn.querySelector('span').textContent = T.pinging;
      try {
        const mirrors = getEnvMirrors(currentEnvId);
        const urls = mirrors.map(m => m.url);
        const res = await ctx.call('pingMirrors', { urls, timeoutMs: 4000 });
        if (res && res.ok && Array.isArray(res.results)) {
          for (const item of res.results) {
            pingResultsMap[item.url] = item;
          }
          // If active mirror is slow/broken, optionally select fastest one
          const available = res.results.filter(r => r.ok).sort((a, b) => a.ms - b.ms);
          if (available.length > 0) {
            selectedMirrors[currentEnvId] = available[0].url;
          }
        }
      } catch (err) {
        console.error('Ping test failed:', err);
      } finally {
        pingBtn.disabled = false;
        pingBtn.querySelector('span').textContent = T.pingAll;
        renderCards();
      }
    });

    // Manage custom mirrors dialog
    function openManageModal() {
      const existing = el.querySelector('.mhub-modal-backdrop');
      if (existing) existing.remove();

      const env = ENVS.find(x => x.id === currentEnvId) || ENVS[0];
      const mirrors = getEnvMirrors(currentEnvId);

      const backdrop = document.createElement('div');
      backdrop.className = 'mhub-modal-backdrop';

      backdrop.innerHTML = `
        <div class="mhub-modal">
          <div class="mhub-modal-header">
            <div class="mhub-modal-title">
              <span>⚙</span>
              <span>${T.modalTitle} - ${env.name}</span>
            </div>
            <button type="button" class="mhub-modal-close" title="${T.close}">✕</button>
          </div>
          <div class="mhub-modal-body">
            <div class="mhub-form-grid">
              <div class="mhub-form-item">
                <span class="mhub-form-label">${T.formName} *</span>
                <input type="text" class="mhub-form-input mhub-input-name" placeholder="${T.formNamePlaceholder}" />
              </div>
              <div class="mhub-form-item">
                <span class="mhub-form-label">${T.formUrl} *</span>
                <input type="text" class="mhub-form-input mhub-input-url" placeholder="${T.formUrlPlaceholder}" />
              </div>
              <div class="mhub-form-item full-width">
                <span class="mhub-form-label">${T.formNote}</span>
                <input type="text" class="mhub-form-input mhub-input-note" placeholder="${T.formNotePlaceholder}" />
              </div>
              <div class="mhub-form-actions">
                <button type="button" class="mhub-btn mhub-btn-add">
                  <span>+ ${T.btnAdd}</span>
                </button>
              </div>
            </div>
            <table class="mhub-mirror-table">
              <thead>
                <tr>
                  <th style="width: 140px;">${T.thName}</th>
                  <th>${T.thUrl}</th>
                  <th style="width: 80px;">${T.thLatency}</th>
                  <th style="width: 60px;">${T.thAction}</th>
                </tr>
              </thead>
              <tbody>
                ${mirrors.map(m => {
                  const pingInfo = pingResultsMap[m.url];
                  const latencyHtml = pingInfo ? (pingInfo.ok ? `${pingInfo.ms}ms` : '异常') : '-';
                  return `
                    <tr data-id="${m.id || ''}">
                      <td>
                        <div class="mhub-table-name">
                          <span>${escapeHtml(m.name)}</span>
                          <span class="mhub-table-badge ${m.isCustom ? 'mhub-table-badge-custom' : 'mhub-table-badge-built'}">
                            ${m.isCustom ? T.badgeCustom : T.badgeBuiltin}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div class="mhub-table-url" title="${escapeHtml(m.url)}">${escapeHtml(m.url)}</div>
                      </td>
                      <td>
                        <span class="mhub-table-latency">${latencyHtml}</span>
                      </td>
                      <td>
                        ${m.isCustom ? `<button type="button" class="mhub-btn-del" data-id="${m.id}" title="${T.del}">✕</button>` : `<span style="color:var(--ink-dim);font-size:11px;">-</span>`}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      backdrop.querySelector('.mhub-modal-close').addEventListener('click', () => backdrop.remove());
      backdrop.addEventListener('click', e => {
        if (e.target === backdrop) backdrop.remove();
      });

      const nameIn = backdrop.querySelector('.mhub-input-name');
      const urlIn = backdrop.querySelector('.mhub-input-url');
      const noteIn = backdrop.querySelector('.mhub-input-note');
      const addBtn = backdrop.querySelector('.mhub-btn-add');

      addBtn.addEventListener('click', async () => {
        const name = nameIn.value.trim();
        const url = urlIn.value.trim();
        const note = noteIn.value.trim();
        if (!name || !url) {
          alert(T.alertRequired);
          return;
        }
        try {
          await ctx.call('addCustomMirror', { envId: currentEnvId, mirror: { name, url, note } });
          const refreshed = await ctx.call('getCustomMirrors');
          if (refreshed) customMirrorsMap = refreshed;
          selectedMirrors[currentEnvId] = url;
          backdrop.remove();
          renderCards();
          openManageModal();
        } catch (err) {
          console.error('Failed to add mirror:', err);
        }
      });

      backdrop.querySelectorAll('.mhub-btn-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          if (id && confirm(T.confirmDel)) {
            try {
              await ctx.call('removeCustomMirror', { envId: currentEnvId, id });
              const refreshed = await ctx.call('getCustomMirrors');
              if (refreshed) customMirrorsMap = refreshed;
              backdrop.remove();
              renderCards();
              openManageModal();
            } catch (err) {
              console.error('Failed to delete mirror:', err);
            }
          }
        });
      });

      el.appendChild(backdrop);
    }

    manageBtn.addEventListener('click', openManageModal);

    // Switch environments
    navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentEnvId = btn.dataset.env;
        const env = ENVS.find(x => x.id === currentEnvId);
        if (env && env.defaultPkg) {
          currentPkgName = env.defaultPkg;
          pkgInput.value = currentPkgName;
        }
        renderCards();
      });
    });

    // Proxy input save
    const saveProxy = async () => {
      const val = proxyInput.value.trim() || 'http://127.0.0.1:7890';
      currentProxyUrl = val;
      renderCards();
      try {
        await ctx.call('saveSettings', { proxyUrl: val });
      } catch (err) {
        console.error('Failed to save proxy settings:', err);
      }
    };
    proxyInput.addEventListener('change', saveProxy);
    proxyInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveProxy(); });

    // Auto detect proxy
    const detectProxyBtn = el.querySelector('.mhub-btn-detect-proxy');
    if (detectProxyBtn) {
      detectProxyBtn.onclick = async () => {
        const textSpan = detectProxyBtn.querySelector('span');
        const origText = textSpan ? textSpan.textContent : '';
        if (textSpan) textSpan.textContent = T.detectingProxy;
        detectProxyBtn.disabled = true;
        try {
          const res = await ctx.call('detectProxy');
          if (res && res.url) {
            currentProxyUrl = res.url;
            proxyInput.value = currentProxyUrl;
            renderCards();
            if (textSpan) textSpan.textContent = T.detectedProxyOk;
            setTimeout(() => {
              if (textSpan) textSpan.textContent = origText;
              detectProxyBtn.disabled = false;
            }, 1200);
            return;
          }
        } catch (err) {
          console.error('Failed to detect proxy:', err);
        }
        if (textSpan) textSpan.textContent = origText;
        detectProxyBtn.disabled = false;
      };
    }

    // Package input change
    pkgInput.addEventListener('input', () => {
      currentPkgName = pkgInput.value.trim();
      renderCards();
    });

    // Initial load: settings & custom mirrors
    Promise.all([
      ctx.call('getSettings'),
      ctx.call('getCustomMirrors'),
    ]).then(([s, customs]) => {
      if (s && s.proxyUrl) {
        currentProxyUrl = s.proxyUrl;
        proxyInput.value = currentProxyUrl;
      }
      if (customs && typeof customs === 'object') {
        customMirrorsMap = customs;
      }
      renderCards();
    }).catch(() => {
      renderCards();
    });

    // Background sync listeners
    ctx.onEvent('settings-changed', s => {
      if (s && s.proxyUrl) {
        currentProxyUrl = s.proxyUrl;
        proxyInput.value = currentProxyUrl;
        renderCards();
      }
    });

    ctx.onEvent('custom-mirrors-changed', customs => {
      if (customs && typeof customs === 'object') {
        customMirrorsMap = customs;
        renderCards();
      }
    });

    el.__setProxyForTest = async (url) => {
      proxyInput.value = url;
      await saveProxy();
    };

    el.__openModalForTest = openManageModal;
  }

  function unmount() {
    // Teardown if needed
  }

  window.Toolbox.panel({ mount, unmount });
})();
