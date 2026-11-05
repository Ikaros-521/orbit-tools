/* mirror-hub panel - domestic mirrors, terminal proxy launcher & custom mirrors */
(function () {
  function mount(el, ctx) {
    const isEn = ctx.lang === 'en';
    const isWin = typeof navigator !== 'undefined' && (
      (Boolean(navigator.platform) && navigator.platform.includes('Win')) ||
      (Boolean(navigator.userAgent) && navigator.userAgent.includes('Windows'))
    );
    let currentShell = 'powershell'; // 'powershell' | 'cmd'

    const T = {
      proxyLabel: isEn ? 'Proxy URL:' : '本地代理地址:',
      proxyPlaceholder: 'http://127.0.0.1:7890',
      detectProxy: isEn ? 'Auto Detect' : '自动读取',
      detectProxyTip: isEn ? 'Auto-detect system proxy or active local proxy client' : '自动读取本机系统代理或本地代理客户端端口',
      detectingProxy: isEn ? 'Detecting...' : '检测中...',
      detectedProxyOk: isEn ? '✓ Detected' : '✓ 已读取',
      pkgLabel: isEn ? 'Package / Repo:' : '包名 / 仓库名:',
      pkgLabelDocker: isEn ? 'Image / Tag:' : '镜像名 / Tag:',
      pkgLabelGit: isEn ? 'Repo (Owner/Repo):' : '仓库名 (用户名/仓库):',
      pkgLabelGeneral: isEn ? 'Package Name:' : '包名 / 模块名:',
      shellLabel: isEn ? 'Shell:' : '终端类型:',
      shellPwsh: 'PowerShell',
      shellCmd: 'CMD',
      tagCross: isEn ? 'UNIVERSAL' : '跨终端通用',
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
            buildCmd: ({ mirror, pkg, downloadInput, shell }) => {
              const url = buildReleaseDownloadUrl(mirror, downloadInput, pkg);
              const curlCmd = (isWin && shell === 'powershell') ? 'curl.exe' : 'curl';
              return `${curlCmd} -L -C - -O "${url}"`;
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
            buildCmd: ({ mirror, pkg, shell }) => {
              const cleanRepo = (pkg || 'Ikaros-521/orbit-tools').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
              const cleanBase = mirror.replace(/\/https:\/\/github\.com\/?$/, '');
              const curlCmd = (isWin && shell === 'powershell') ? 'curl.exe' : 'curl';
              return `${curlCmd} -fsSL ${cleanBase}/https://raw.githubusercontent.com/${cleanRepo}/main/README.md -o README.md`;
            },
          },
          {
            id: 'ssh-443',
            title: isEn ? 'GitHub SSH over Port 443' : 'GitHub 443 端口 SSH 配置 (突破 22 端口屏蔽)',
            tag: 'tagMirror',
            desc: isEn ? 'Configures SSH to use port 443 for firewalled network environments' : '在校园网或企业内网屏蔽 22 端口时，通过 GitHub 官方备用 443 端口正常使用 SSH',
            hasMirror: false,
            buildCmd: ({ shell }) => {
              if (isWin) {
                if (shell === 'cmd') {
                  return `(echo. && echo Host github.com && echo   Hostname ssh.github.com && echo   Port 443 && echo   User git) >> %USERPROFILE%\\.ssh\\config`;
                }
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
            buildCmd: ({ proxy, shell }) => {
              if (isWin && shell === 'cmd') {
                return `git config --global http.proxy ${proxy} && git config --global https.proxy ${proxy}`;
              }
              return `git config --global http.proxy ${proxy}; git config --global https.proxy ${proxy}`;
            },
          },
          {
            id: 'git-unproxy',
            title: isEn ? 'Clear Git Global Proxy' : '清除 Git 全局代理设置',
            tag: 'tagReset',
            desc: isEn ? 'Unsets git global http.proxy and https.proxy' : '取消全局代理，恢复直接网络直连',
            hasMirror: false,
            buildCmd: ({ shell }) => {
              if (isWin && shell === 'cmd') {
                return `git config --global --unset http.proxy && git config --global --unset https.proxy`;
              }
              return `git config --global --unset http.proxy; git config --global --unset https.proxy`;
            },
          },
        ],
      },
      {
        id: 'docker',
        name: 'Docker',
        defaultPkg: 'nginx:latest',
        mirrors: [
          { name: 'DaoCloud 镜像站 (daocloud.io)', url: 'docker.m.daocloud.io' },
          { name: '1Panel 镜像站 (1panel.live)', url: 'docker.1panel.live' },
          { name: '南京大学 (NJU)', url: 'docker.nju.edu.cn' },
          { name: '上海交通大学 (SJTU)', url: 'docker.mirrors.sjtug.sjtu.edu.cn' },
          { name: 'DockerPull 镜像站 (dockerpull.cn)', url: 'dockerpull.cn' },
          { name: '网易云镜像 (163)', url: 'hub-mirror.c.163.com' },
          { name: '百度云镜像 (Baidu)', url: 'mirror.baidubce.com' },
          { name: '阿里云个人加速器 (替换为自己ID)', url: 'https://<your-id>.mirror.aliyuncs.com' },
        ],
        cards: [
          {
            id: 'docker-pull',
            title: isEn ? 'Pull Image via Domestic Mirror' : '使用国内镜像直接拉取 (docker pull)',
            tag: 'tagMirror',
            desc: isEn ? 'Pulls image through domestic accelerator mirror, then tags back to original' : '使用选中的国内镜像源直接拉取 Docker 镜像，拉取后自动重命名为原始镜像名，无需修改配置文件',
            hasMirror: true,
            buildCmd: ({ mirror, pkg, shell }) => {
              const cleanMirror = (mirror || 'docker.m.daocloud.io').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
              const rawPkg = (pkg || 'nginx:latest').trim();
              const pullImage = rawPkg.includes('/') ? rawPkg : ('library/' + rawPkg);
              const mirrorImage = `${cleanMirror}/${pullImage}`;
              if (isWin && shell === 'cmd') {
                return `docker pull ${mirrorImage} && docker tag ${mirrorImage} ${rawPkg}`;
              }
              return `docker pull ${mirrorImage}; docker tag ${mirrorImage} ${rawPkg}`;
            },
          },
          {
            id: 'docker-daemon',
            title: isEn ? 'Configure Docker daemon.json Mirrors' : '配置 Docker 守护进程国内镜像源 (daemon.json)',
            tag: 'tagMirror',
            desc: isEn ? 'Adds mirror to registry-mirrors in Docker daemon.json (restart Docker Desktop to take effect)' : '向 Docker 配置文件添加 registry-mirrors，重启 Docker 守护进程后拉取官方镜像自动走国内镜像源',
            hasMirror: true,
            buildCmd: ({ mirror, shell }) => {
              const cleanUrl = mirror.startsWith('http') ? mirror.replace(/\/+$/, '') : ('https://' + mirror.replace(/\/+$/, ''));
              if (isWin) {
                if (shell === 'cmd') {
                  return `powershell -NoProfile -Command "$p=\\"$HOME\\.docker\\daemon.json\\"; if (!(Test-Path \\"$HOME\\.docker\\")) { New-Item -Type Dir \\"$HOME\\.docker\\" | Out-Null }; $c = if (Test-Path $p) { Get-Content $p -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }; if (!$c.psobject.Properties['registry-mirrors']) { $c | Add-Member -NotePropertyName 'registry-mirrors' -NotePropertyValue @() }; if ($c.'registry-mirrors' -notcontains '${cleanUrl}') { $c.'registry-mirrors' += '${cleanUrl}' }; $c | ConvertTo-Json -Depth 5 | Set-Content $p -Encoding utf8; Write-Host 'Docker daemon.json 已更新，请重启 Docker Desktop 生效'"`;
                }
                return `$p = "$HOME\\.docker\\daemon.json"; if (-not (Test-Path "$HOME\\.docker")) { New-Item -ItemType Directory -Path "$HOME\\.docker" | Out-Null }; $cfg = if (Test-Path $p) { Get-Content $p -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }; if (-not $cfg.psobject.Properties['registry-mirrors']) { $cfg | Add-Member -NotePropertyName 'registry-mirrors' -NotePropertyValue @() }; if ($cfg.'registry-mirrors' -notcontains '${cleanUrl}') { $cfg.'registry-mirrors' += '${cleanUrl}' }; $cfg | ConvertTo-Json -Depth 5 | Set-Content $p -Encoding utf8; Write-Host "Docker daemon.json 已更新，请重启 Docker Desktop 生效"`;
              }
              return `sudo mkdir -p /etc/docker && sudo tee /etc/docker/daemon.json <<EOF\n{\n  "registry-mirrors": ["${cleanUrl}"]\n}\nEOF\nsudo systemctl daemon-reload && sudo systemctl restart docker`;
            },
          },
          {
            id: 'docker-session-proxy',
            title: isEn ? 'Docker Client Session Proxy' : 'Docker 客户端当前会话代理 (临时加速)',
            tag: 'tagProxy',
            desc: isEn ? 'Sets HTTP_PROXY & HTTPS_PROXY in current terminal session' : '在当前终端会话注入代理环境变量，临时加速 docker CLI 命令与 docker build 构建拉取',
            hasMirror: false,
            buildCmd: ({ proxy, shell }) => {
              if (isWin) {
                if (shell === 'cmd') {
                  return `set HTTP_PROXY=${proxy} && set HTTPS_PROXY=${proxy}`;
                }
                return `$env:HTTP_PROXY="${proxy}"; $env:HTTPS_PROXY="${proxy}"`;
              }
              return `export HTTP_PROXY="${proxy}" HTTPS_PROXY="${proxy}"`;
            },
          },
          {
            id: 'docker-client-config',
            title: isEn ? 'Configure Docker Client Global Proxy (~/.docker/config.json)' : '配置 Docker 客户端全局代理 (~/.docker/config.json)',
            tag: 'tagProxy',
            desc: isEn ? 'Injects proxies configuration into ~/.docker/config.json so docker build & run use proxy by default' : '向 ~/.docker/config.json 写入 proxies 字段，使所有 docker build 与容器命令默认走本地代理',
            hasMirror: false,
            buildCmd: ({ proxy, shell }) => {
              if (isWin) {
                if (shell === 'cmd') {
                  return `powershell -NoProfile -Command "$p=\\"$HOME\\.docker\\config.json\\"; if (!(Test-Path \\"$HOME\\.docker\\")) { New-Item -Type Dir \\"$HOME\\.docker\\" | Out-Null }; $c = if (Test-Path $p) { Get-Content $p -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }; $c | Add-Member -NotePropertyName 'proxies' -NotePropertyValue @{ default = @{ httpProxy = '${proxy}'; httpsProxy = '${proxy}' } } -Force; $c | ConvertTo-Json -Depth 5 | Set-Content $p -Encoding utf8; Write-Host 'Docker 客户端代理已配置为: ${proxy}'"`;
                }
                return `$p = "$HOME\\.docker\\config.json"; if (-not (Test-Path "$HOME\\.docker")) { New-Item -ItemType Directory -Path "$HOME\\.docker" | Out-Null }; $cfg = if (Test-Path $p) { Get-Content $p -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }; $cfg | Add-Member -NotePropertyName 'proxies' -NotePropertyValue @{ default = @{ httpProxy = '${proxy}'; httpsProxy = '${proxy}' } } -Force; $cfg | ConvertTo-Json -Depth 5 | Set-Content $p -Encoding utf8; Write-Host "Docker 客户端代理已配置为: ${proxy}"`;
              }
              return `mkdir -p ~/.docker && cat <<EOF > ~/.docker/config.json\n{\n  "proxies": {\n    "default": {\n      "httpProxy": "${proxy}",\n      "httpsProxy": "${proxy}"\n    }\n  }\n}\nEOF`;
            },
          },
          {
            id: 'docker-clear-proxy',
            title: isEn ? 'Clear Docker Client Global Proxy' : '清除 Docker 客户端全局代理',
            tag: 'tagReset',
            desc: isEn ? 'Removes proxies configuration from ~/.docker/config.json and restores direct connection' : '从 ~/.docker/config.json 中移除 proxies 配置，恢复直接网络直连',
            hasMirror: false,
            buildCmd: ({ shell }) => {
              if (isWin) {
                if (shell === 'cmd') {
                  return `powershell -NoProfile -Command "$p=\\"$HOME\\.docker\\config.json\\"; if (Test-Path $p) { $c = Get-Content $p -Raw | ConvertFrom-Json; if ($c.psobject.Properties['proxies']) { $c.psobject.Properties.Remove('proxies'); $c | ConvertTo-Json -Depth 5 | Set-Content $p -Encoding utf8; Write-Host 'Docker 客户端代理配置已清除' } }"`;
                }
                return `$p = "$HOME\\.docker\\config.json"; if (Test-Path $p) { $cfg = Get-Content $p -Raw | ConvertFrom-Json; if ($cfg.psobject.Properties['proxies']) { $cfg.psobject.Properties.Remove('proxies'); $cfg | ConvertTo-Json -Depth 5 | Set-Content $p -Encoding utf8; Write-Host "Docker 客户端代理配置已清除" } }`;
              }
              return `sed -i '/"proxies":/,/}/d' ~/.docker/config.json`;
            },
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
            buildCmd: ({ proxy, shell }) => {
              if (isWin && shell === 'cmd') {
                return `npm config set proxy ${proxy} && npm config set https-proxy ${proxy}`;
              }
              return `npm config set proxy ${proxy}; npm config set https-proxy ${proxy}`;
            },
          },
          {
            title: isEn ? 'Restore Official npmjs' : '恢复官方默认源 & 清除代理',
            tag: 'tagReset',
            desc: isEn ? 'Restores official npmjs registry and unsets proxy configurations' : '恢复为官方 npmjs.org 源并清理已设置的代理',
            hasMirror: false,
            buildCmd: ({ shell }) => {
              if (isWin && shell === 'cmd') {
                return `npm config set registry https://registry.npmjs.org/ && npm config delete proxy && npm config delete https-proxy`;
              }
              return `npm config set registry https://registry.npmjs.org/; npm config delete proxy; npm config delete https-proxy`;
            },
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
          { name: '字节跳动 (Bytedance)', url: 'rsproxy' },
        ],
        cards: [
          {
            title: isEn ? 'Set Cargo Registry in config.toml' : '写入 Cargo 国内镜像源配置',
            tag: 'tagMirror',
            desc: isEn ? 'Echoes recommended mirror configuration for ~/.cargo/config.toml' : '向 ~/.cargo/config.toml 快速写入 crates.io 国内镜像替换配置',
            hasMirror: true,
            buildCmd: ({ mirror, shell }) => {
              const urlMap = {
                ustc: 'https://mirrors.ustc.edu.cn/crates.io-index',
                tuna: 'https://mirrors.tuna.tsinghua.edu.cn/git/crates.io-index.git',
                sjtu: 'https://mirrors.sjtug.sjtu.edu.cn/git/crates.io-index/',
                rsproxy: 'https://rsproxy.cn/crates.io-index',
              };
              const target = urlMap[mirror] || urlMap.ustc;
              if (isWin) {
                if (shell === 'cmd') {
                  return `if not exist "%USERPROFILE%\\.cargo" mkdir "%USERPROFILE%\\.cargo" && (echo [source.crates-io] && echo replace-with = 'mirror' && echo. && echo [source.mirror] && echo registry = "sparse+${target}") >> "%USERPROFILE%\\.cargo\\config.toml"`;
                }
                return `if (-not (Test-Path "$HOME\\.cargo")) { New-Item -ItemType Directory -Path "$HOME\\.cargo" | Out-Null }; Add-Content -Path "$HOME\\.cargo\\config.toml" -Value "[source.crates-io]\`nreplace-with = 'mirror'\`n\`n[source.mirror]\`nregistry = \\"sparse+${target}\\""`;
              }
              return `mkdir -p ~/.cargo && printf "[source.crates-io]\\nreplace-with = 'mirror'\\n\\n[source.mirror]\\nregistry = \\"sparse+${target}\\"\\n" >> ~/.cargo/config.toml`;
            },
          },
          {
            title: isEn ? 'Cargo Run with Terminal Proxy' : '携带代理编译 Cargo 项目',
            tag: 'tagProxy',
            desc: isEn ? 'Sets temporary proxy environment variables for current cargo invocation' : '注入临时 HTTP_PROXY 与 HTTPS_PROXY 环境变量，走代理直接编译拉取',
            hasMirror: false,
            buildCmd: ({ proxy, pkg, shell }) => {
              if (isWin) {
                if (shell === 'cmd') {
                  return `set HTTP_PROXY=${proxy} && set HTTPS_PROXY=${proxy} && cargo add ${pkg}`;
                }
                return `$env:HTTP_PROXY="${proxy}"; $env:HTTPS_PROXY="${proxy}"; cargo add ${pkg}`;
              }
              return `export HTTP_PROXY="${proxy}" HTTPS_PROXY="${proxy}" && cargo add ${pkg}`;
            },
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
            id: 'terminal-session-proxy',
            title: isEn ? 'Terminal Session Proxy' : '当前终端会话代理 (临时加速)',
            tag: 'tagProxy',
            desc: isEn ? 'Sets HTTP_PROXY & HTTPS_PROXY for the current terminal session' : '在当前命令行窗口临时注入代理环境变量，关闭窗口后自动失效',
            hasMirror: false,
            buildCmd: ({ proxy, shell }) => {
              if (isWin) {
                if (shell === 'cmd') {
                  return `set http_proxy=${proxy} && set https_proxy=${proxy}`;
                }
                return `$env:http_proxy="${proxy}"; $env:https_proxy="${proxy}"`;
              }
              return `export http_proxy="${proxy}" https_proxy="${proxy}"`;
            },
          },
          {
            id: 'terminal-unset-proxy',
            title: isEn ? 'Clear Terminal Session Proxy' : '清除当前终端会话代理',
            tag: 'tagReset',
            desc: isEn ? 'Clears temporary proxy environment variables' : '清空当前终端会话中的代理环境变量，恢复直接网络直连',
            hasMirror: false,
            buildCmd: ({ shell }) => {
              if (isWin) {
                if (shell === 'cmd') {
                  return `set http_proxy= && set https_proxy=`;
                }
                return `$env:http_proxy=""; $env:https_proxy=""`;
              }
              return `unset http_proxy https_proxy`;
            },
          },
          {
            id: 'terminal-bash-proxy',
            title: isEn ? 'Bash / Zsh / Git Bash / WSL Proxy' : 'Bash / Zsh / Git Bash / WSL 终端代理',
            tag: 'tagProxy',
            desc: isEn ? 'Export proxy variables for Unix shells' : '适用于 Git Bash、WSL、macOS 与 Linux 的终端单次会话代理命令',
            hasMirror: false,
            buildCmd: ({ proxy }) => `export http_proxy="${proxy}" https_proxy="${proxy}"`,
          },
          {
            id: 'terminal-bash-unset',
            title: isEn ? 'Bash / Zsh / WSL Clear Proxy' : 'Bash / Zsh / WSL 清除终端代理',
            tag: 'tagReset',
            desc: isEn ? 'Unsets proxy variables in Unix shells' : '清除 Bash / Zsh / WSL 终端中的代理环境变量',
            hasMirror: false,
            buildCmd: () => `unset http_proxy https_proxy`,
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

    function getPkgLabel() {
      if (currentEnvId === 'docker') return T.pkgLabelDocker;
      if (currentEnvId === 'git') return T.pkgLabelGit;
      return T.pkgLabelGeneral;
    }

    function updatePkgLabel() {
      const lbl = el.querySelector('.mhub-pkg-field-label');
      if (lbl) lbl.textContent = getPkgLabel();
    }

    function updateShellButtons() {
      const btns = el.querySelectorAll('.mhub-segmented-shell .mhub-seg-btn');
      btns.forEach(b => {
        if (b.dataset.shell === currentShell) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
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
            <span class="mhub-field-label mhub-pkg-field-label">${getPkgLabel()}</span>
            <input type="text" class="mhub-field-input mhub-pkg-input" spellcheck="false" value="${currentPkgName}" />
          </div>
          ${isWin ? `
          <div class="mhub-field mhub-shell-field">
            <span class="mhub-field-label">${T.shellLabel}</span>
            <div class="mhub-segmented-shell">
              <button type="button" class="mhub-seg-btn${currentShell === 'powershell' ? ' active' : ''}" data-shell="powershell">${T.shellPwsh}</button>
              <button type="button" class="mhub-seg-btn${currentShell === 'cmd' ? ' active' : ''}" data-shell="cmd">${T.shellCmd}</button>
            </div>
          </div>
          ` : ''}
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
        const cmdArgs = {
          mirror: activeMirror,
          proxy: currentProxyUrl,
          pkg: currentPkgName || currentEnv.defaultPkg || 'pkg',
          downloadInput: currentDownloadInput,
          shell: currentShell,
        };
        const cmd = cardDef.buildCmd(cmdArgs);

        let hasShellDiff = false;
        if (isWin) {
          const pwshCmd = cardDef.buildCmd({ ...cmdArgs, shell: 'powershell' });
          const cmdCmd = cardDef.buildCmd({ ...cmdArgs, shell: 'cmd' });
          hasShellDiff = (pwshCmd !== cmdCmd);
        }

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

        let shellBadgeHtml = '';
        if (isWin) {
          if (hasShellDiff) {
            shellBadgeHtml = `
              <span class="mhub-card-shell-badge shell-${currentShell}">
                ${currentShell === 'cmd' ? 'CMD' : 'PowerShell'}
              </span>
            `;
          } else {
            shellBadgeHtml = `
              <span class="mhub-card-shell-badge shell-cross">
                ${T.tagCross}
              </span>
            `;
          }
        }

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
              ${shellBadgeHtml}
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
            const caret = dlInput.selectionStart;
            renderCards();
            // renderCards 整卡重绘会销毁输入框——恢复焦点与光标，否则每敲一键丢一次焦点
            const revived = bodyEl.querySelector('.mhub-download-input');
            if (revived) {
              revived.focus();
              try { revived.setSelectionRange(caret, caret); } catch { /* ignore */ }
            }
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
            await ctx.call('runInTerminal', { command: cmd, shell: currentShell });
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
    /* --- Manage modal (extracted to manage-modal.js) --- */
    const manageState = {};
    Object.defineProperties(manageState, {
      currentEnvId:    { get: () => currentEnvId, set: v => { currentEnvId = v; }, configurable: true },
      currentPkgName:  { get: () => currentPkgName, set: v => { currentPkgName = v; }, configurable: true },
      currentProxyUrl: { get: () => currentProxyUrl, set: v => { currentProxyUrl = v; }, configurable: true },
      currentShell:    { get: () => currentShell, set: v => { currentShell = v; }, configurable: true },
      customMirrorsMap:{ get: () => customMirrorsMap, set: v => { customMirrorsMap = v; }, configurable: true }
    });
    let openManageModal = () => {};
    // 纯 mock 环境无 document.head 时静默跳过注入（管理弹窗不可用但不影响主视图）
    if (typeof document !== 'undefined' && document.head && document.createElement) {
      const s = document.createElement('script');
      s.src = 'plugin://mirror-hub/manage-modal.js';
      s.onload = () => {
        const factory = window.MirrorHubManageModal && window.MirrorHubManageModal.createManageModal;
        if (!factory) return;
        ({ openManageModal } = factory({
          state: manageState,
          ENVS, T, escapeHtml,
          pingResultsMap, selectedMirrors,
          getEnvMirrors, renderCards, updatePkgLabel, updateShellButtons,
          manageBtn, navBtns, pkgInput, proxyInput,
          call, isZh
        }));
      };
      document.head.appendChild(s);
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
        updatePkgLabel();
        renderCards();
      });
    });

    // Shell toggle switch (PowerShell / CMD on Windows)
    if (isWin) {
      const shellBtns = el.querySelectorAll('.mhub-segmented-shell .mhub-seg-btn');
      shellBtns.forEach(b => {
        b.addEventListener('click', async () => {
          const target = b.dataset.shell;
          if (target === currentShell) return;
          currentShell = target;
          updateShellButtons();
          renderCards();
          try {
            await ctx.call('saveSettings', { shellType: currentShell });
          } catch (err) {
            console.error('Failed to save shell settings:', err);
          }
        });
      });
    }

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
      if (s) {
        if (s.proxyUrl) {
          currentProxyUrl = s.proxyUrl;
          proxyInput.value = currentProxyUrl;
        }
        if (s.shellType === 'cmd' || s.shellType === 'powershell') {
          currentShell = s.shellType;
          updateShellButtons();
        }
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
      if (s) {
        if (s.proxyUrl) {
          currentProxyUrl = s.proxyUrl;
          proxyInput.value = currentProxyUrl;
        }
        if (s.shellType === 'cmd' || s.shellType === 'powershell') {
          currentShell = s.shellType;
          updateShellButtons();
        }
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

    el.__setShellForTest = async (shell) => {
      currentShell = shell;
      updateShellButtons();
      renderCards();
      await ctx.call('saveSettings', { shellType: shell });
    };

    el.__openModalForTest = openManageModal;
  }

  function unmount() {
    // Teardown if needed
  }

  window.Toolbox.panel({ mount, unmount });
})();
