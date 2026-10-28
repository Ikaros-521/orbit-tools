/* mirror-hub panel - domestic mirrors & terminal proxy launcher */
(function () {
  function mount(el, ctx) {
    const isEn = ctx.lang === 'en';
    const T = {
      proxyLabel: isEn ? 'Proxy URL:' : '本地代理地址:',
      proxyPlaceholder: 'http://127.0.0.1:7890',
      pkgLabel: isEn ? 'Package / Repo:' : '包名 / 仓库名:',
      copy: isEn ? 'Copy' : '复制命令',
      copied: isEn ? '✓ Copied' : '✓ 已复制',
      run: isEn ? 'Run in Terminal' : '🚀 打开终端执行',
      running: isEn ? '✓ Launched' : '✓ 终端已运行',
      selectMirror: isEn ? 'Mirror:' : '镜像源:',
      tagMirror: isEn ? 'MIRROR' : '国内镜像',
      tagProxy: isEn ? 'PROXY' : '网络代理',
      tagReset: isEn ? 'DEFAULT' : '恢复默认',
    };

    const ENVS = [
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
        id: 'git',
        name: 'Git & GitHub',
        defaultPkg: 'Ikaros-521/orbit-tools',
        mirrors: [
          { name: 'ghfast 加速代理', url: 'https://ghfast.top/https://github.com/' },
          { name: 'ghproxy 加速镜像', url: 'https://ghproxy.net/https://github.com/' },
        ],
        cards: [
          {
            title: isEn ? 'Set Git Global HTTP Proxy' : '配置 Git 全局 HTTP 代理',
            tag: 'tagProxy',
            desc: isEn ? 'Routes all git clone & push through your local proxy' : '让所有 git clone 和 git push 通过本地客户端代理端口加速',
            hasMirror: false,
            buildCmd: ({ proxy }) => `git config --global http.proxy ${proxy}; git config --global https.proxy ${proxy}`,
          },
          {
            title: isEn ? 'Clear Git Global Proxy' : '清除 Git 全局代理设置',
            tag: 'tagReset',
            desc: isEn ? 'Unsets git global http.proxy and https.proxy' : '取消全局代理，恢复直接网络直连',
            hasMirror: false,
            buildCmd: () => `git config --global --unset http.proxy; git config --global --unset https.proxy`,
          },
          {
            title: isEn ? 'Fast GitHub Clone via Accelerator' : 'GitHub 仓库免翻墙克隆加速',
            tag: 'tagMirror',
            desc: isEn ? 'Clones public GitHub repository via web accelerator reverse proxy' : '使用公网反向代理加速镜像，免代理高速克隆 GitHub 项目',
            hasMirror: true,
            buildCmd: ({ mirror, pkg }) => `git clone ${mirror}${pkg}.git`,
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

    let currentEnvId = 'pip';
    let currentProxyUrl = 'http://127.0.0.1:7890';
    let currentPkgName = 'requests';
    let selectedMirrors = {}; // envId -> selectedUrl

    // Pre-populate default mirrors
    for (const env of ENVS) {
      if (env.mirrors && env.mirrors.length > 0) {
        selectedMirrors[env.id] = env.mirrors[0].url;
      }
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
          </div>
          <div class="mhub-field">
            <span class="mhub-field-label">${T.pkgLabel}</span>
            <input type="text" class="mhub-field-input mhub-pkg-input" spellcheck="false" value="${currentPkgName}" />
          </div>
        </div>
        <div class="mhub-body"></div>
      </div>
    `;

    const navBtns = el.querySelectorAll('.mhub-tab-btn');
    const proxyInput = el.querySelector('.mhub-proxy-input');
    const pkgInput = el.querySelector('.mhub-pkg-input');
    const bodyEl = el.querySelector('.mhub-body');

    function escapeHtml(str) {
      return String(str || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    }

    function renderCards() {
      const currentEnv = ENVS.find(x => x.id === currentEnvId) || ENVS[0];
      const activeMirror = selectedMirrors[currentEnv.id] || (currentEnv.mirrors[0] && currentEnv.mirrors[0].url) || '';

      bodyEl.innerHTML = '';
      const frag = document.createDocumentFragment();

      for (const cardDef of currentEnv.cards) {
        const cmd = cardDef.buildCmd({
          mirror: activeMirror,
          proxy: currentProxyUrl,
          pkg: currentPkgName || currentEnv.defaultPkg || 'pkg',
        });

        const card = document.createElement('div');
        card.className = 'mhub-card';

        let mirrorSelectHtml = '';
        if (cardDef.hasMirror && currentEnv.mirrors.length > 0) {
          mirrorSelectHtml = `
            <select class="mhub-mirror-select">
              ${currentEnv.mirrors.map(m => `
                <option value="${m.url}"${m.url === activeMirror ? ' selected' : ''}>${m.name}</option>
              `).join('')}
            </select>
          `;
        }

        const tagClass = cardDef.tag === 'tagProxy' ? 'mhub-tag-proxy' : cardDef.tag === 'tagReset' ? 'mhub-tag-reset' : 'mhub-tag-mirror';
        const tagText = T[cardDef.tag] || '';

        card.innerHTML = `
          <div class="mhub-card-head">
            <div class="mhub-card-title-group">
              <span class="mhub-card-title">${cardDef.title}</span>
              <span class="mhub-card-tag ${tagClass}">${tagText}</span>
            </div>
            ${mirrorSelectHtml}
          </div>
          <div class="mhub-card-desc">${cardDef.desc}</div>
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

        // Handle mirror switch inside card
        const select = card.querySelector('.mhub-mirror-select');
        if (select) {
          select.addEventListener('change', () => {
            selectedMirrors[currentEnv.id] = select.value;
            renderCards();
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

    // Package input change
    pkgInput.addEventListener('input', () => {
      currentPkgName = pkgInput.value.trim();
      renderCards();
    });

    // Initial load settings
    ctx.call('getSettings').then(s => {
      if (s && s.proxyUrl) {
        currentProxyUrl = s.proxyUrl;
        proxyInput.value = currentProxyUrl;
      }
      renderCards();
    }).catch(() => {
      renderCards();
    });

    // Listen to background sync
    ctx.onEvent('settings-changed', s => {
      if (s && s.proxyUrl) {
        currentProxyUrl = s.proxyUrl;
        proxyInput.value = currentProxyUrl;
        renderCards();
      }
    });

    el.__setProxyForTest = async (url) => {
      proxyInput.value = url;
      await saveProxy();
    };
  }

  function unmount() {
    // Teardown if needed
  }

  window.Toolbox.panel({ mount, unmount });
})();
