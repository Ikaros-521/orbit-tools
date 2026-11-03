const { app, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

const REPO_OWNER = 'Ikaros-521';
const REPO_NAME = 'orbit-tools';
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const RELEASES_PAGE_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`;

/**
 * 比较两个语义化版本号
 * @param {string} v1 当前版本
 * @param {string} v2 远端最新版本
 * @returns {number} 1: v1 > v2, -1: v1 < v2 (有更新), 0: v1 == v2
 */
function compareVersions(v1, v2) {
  const clean = v => String(v || '').trim().replace(/^[vV]/, '');
  const s1 = clean(v1);
  const s2 = clean(v2);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 0;

  // 分离主版本号与先行版本号 (例如 1.0.0-beta.1)
  const [core1, pre1] = s1.split('-');
  const [core2, pre2] = s2.split('-');

  const parts1 = core1.split('.').map(n => parseInt(n, 10) || 0);
  const parts2 = core2.split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < len; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  // 若核心版本相等，检查先行版本号（无先行版本 > 有先行版本，如 1.0.0 > 1.0.0-beta）
  if (!pre1 && pre2) return 1;
  if (pre1 && !pre2) return -1;
  if (pre1 && pre2) return pre1.localeCompare(pre2);

  return 0;
}

/**
 * 根据平台架构智能匹配安装包 Asset
 * @param {Array} assets Release Assets 列表
 * @param {string} [platform] 运行平台 (默认 process.platform)
 * @param {string} [arch] 架构 (默认 process.arch)
 * @returns {object|null} 最匹配的 asset
 */
function matchPlatformAsset(assets, platform = process.platform, arch = process.arch) {
  if (!Array.isArray(assets) || assets.length === 0) return null;

  const isWin = platform === 'win32';
  const isMac = platform === 'darwin';
  const isLinux = platform === 'linux';

  // 统一转小写用于规则比对
  const normalized = assets.map(a => ({
    ...a,
    lowerName: (a.name || '').toLowerCase()
  }));

  if (isWin) {
    // 优先寻找安装版 Setup exe，其次便携版 exe
    const exeAssets = normalized.filter(a => a.lowerName.endsWith('.exe'));
    const archMatch = exeAssets.filter(a => a.lowerName.includes(arch) || (arch === 'x64' && a.lowerName.includes('win-x64')));
    const pool = archMatch.length > 0 ? archMatch : exeAssets;
    const setup = pool.find(a => a.lowerName.includes('setup'));
    return setup || pool[0] || null;
  }

  if (isMac) {
    // 优先寻找 dmg，其次 zip
    const macAssets = normalized.filter(a => a.lowerName.endsWith('.dmg') || a.lowerName.endsWith('.zip'));
    const archTarget = arch === 'arm64' ? 'arm64' : 'x64';
    const archMatch = macAssets.filter(a => a.lowerName.includes(archTarget));
    const pool = archMatch.length > 0 ? archMatch : macAssets;
    const dmg = pool.find(a => a.lowerName.endsWith('.dmg'));
    return dmg || pool[0] || null;
  }

  if (isLinux) {
    // 优先寻找 AppImage，其次 deb
    const linuxAssets = normalized.filter(a => a.lowerName.endsWith('.appimage') || a.lowerName.endsWith('.deb'));
    const archTarget = arch === 'arm64' ? 'arm64' : 'x64';
    const archMatch = linuxAssets.filter(a => a.lowerName.includes(archTarget));
    const pool = archMatch.length > 0 ? archMatch : linuxAssets;
    const appImage = pool.find(a => a.lowerName.endsWith('.appimage'));
    return appImage || pool[0] || null;
  }

  return null;
}

class UpdateManager {
  constructor({ cfg, appVersion } = {}) {
    this.cfg = cfg;
    this.appVersion = appVersion || (app && app.getVersion ? app.getVersion() : '0.0.0');
    this.activeDownloadRequest = null;
    this.downloadAbortController = null;
    this.cachedUpdateInfo = null;
  }

  /**
   * 检查 GitHub 是否有新版本
   * @param {object} [options]
   * @param {boolean} [options.manual=false] 是否是用户主动点击检查
   * @returns {Promise<object>} 更新检查结果
   */
  async checkForUpdates({ manual = false } = {}) {
    try {
      const release = await this._fetchLatestRelease();
      const latestTag = release.tag_name || release.name || '';
      const latestVersion = latestTag.replace(/^[vV]/, '');
      const hasUpdate = compareVersions(this.appVersion, latestVersion) < 0;

      const asset = matchPlatformAsset(release.assets || []);

      const result = {
        ok: true,
        hasUpdate,
        currentVersion: this.appVersion,
        latestVersion,
        tagName: latestTag,
        releaseName: release.name || latestTag,
        releaseNotes: release.body || '',
        publishedAt: release.published_at || '',
        releaseUrl: release.html_url || RELEASES_PAGE_URL,
        asset: asset ? {
          name: asset.name,
          size: asset.size,
          downloadUrl: asset.browser_download_url,
        } : null,
        manual,
      };

      this.cachedUpdateInfo = result;
      return result;
    } catch (err) {
      return {
        ok: false,
        hasUpdate: false,
        currentVersion: this.appVersion,
        error: String(err && err.message || err),
        releaseUrl: RELEASES_PAGE_URL,
        manual,
      };
    }
  }

  /**
   * 下载安装包资产并提供进度回调
   * @param {string} downloadUrl 目标文件下载地址
   * @param {string} fileName 保存文件名
   * @param {function} [onProgress] 进度回调函数 ({ percent, transferred, total, speed })
   * @returns {Promise<{ ok: boolean, filePath?: string, error?: string }>}
   */
  async downloadUpdate(downloadUrl, fileName, onProgress) {
    if (!downloadUrl) {
      throw new Error('未提供下载地址');
    }

    if (this.activeDownloadRequest) {
      throw new Error('已有正在进行的下载任务');
    }

    const tempDir = app && app.getPath ? app.getPath('temp') : path.join(require('os').tmpdir(), 'orbit-update');
    fs.mkdirSync(tempDir, { recursive: true });
    const targetFile = path.join(tempDir, fileName || `orbit-update-${Date.now()}.bin`);

    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(targetFile);
      let transferred = 0;
      let total = 0;
      let startTime = Date.now();
      let lastTime = startTime;
      let lastTransferred = 0;
      let isCancelled = false;

      // 使用 electron.net 以尊重系统网络代理设置，若不可用降级为 https
      const requestSender = (url, redirectCount = 0) => {
        if (redirectCount > 5) {
          fileStream.close();
          try { fs.unlinkSync(targetFile); } catch {}
          return reject(new Error('重定向次数过多'));
        }

        const client = net ? net : https;
        const req = client.request(url, res => {
          // 处理 301/302 重定向 (GitHub Releases 资产通常重定向至 AWS S3 / CDN)
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let redirectUrl = res.headers.location;
            if (Array.isArray(redirectUrl)) redirectUrl = redirectUrl[0];
            return requestSender(redirectUrl, redirectCount + 1);
          }

          if (res.statusCode !== 200) {
            fileStream.close();
            try { fs.unlinkSync(targetFile); } catch {}
            this.activeDownloadRequest = null;
            return reject(new Error(`下载失败，HTTP 状态码: ${res.statusCode}`));
          }

          const rawTotal = res.headers['content-length'] || (res.headers.get && res.headers.get('content-length'));
          total = parseInt(rawTotal, 10) || 0;

          res.on('data', chunk => {
            if (isCancelled) return;
            transferred += chunk.length;
            fileStream.write(chunk);

            const now = Date.now();
            if (now - lastTime >= 200 || transferred === total) {
              const deltaSec = (now - lastTime) / 1000;
              const speed = deltaSec > 0 ? (transferred - lastTransferred) / deltaSec : 0;
              lastTime = now;
              lastTransferred = transferred;

              const percent = total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0;
              if (typeof onProgress === 'function') {
                onProgress({
                  percent,
                  transferred,
                  total,
                  speed: Math.round(speed),
                });
              }
            }
          });

          res.on('end', () => {
            fileStream.end();
            this.activeDownloadRequest = null;
            if (!isCancelled) {
              resolve({ ok: true, filePath: targetFile, total });
            }
          });

          res.on('error', err => {
            fileStream.close();
            try { fs.unlinkSync(targetFile); } catch {}
            this.activeDownloadRequest = null;
            reject(err);
          });
        });

        req.setHeader('User-Agent', `Orbit-Toolbox-Updater/${this.appVersion}`);
        req.on('error', err => {
          fileStream.close();
          try { fs.unlinkSync(targetFile); } catch {}
          this.activeDownloadRequest = null;
          reject(err);
        });

        this.downloadAbortController = () => {
          isCancelled = true;
          req.abort();
          fileStream.close();
          try { fs.unlinkSync(targetFile); } catch {}
          this.activeDownloadRequest = null;
          reject(new Error('用户取消了下载'));
        };

        this.activeDownloadRequest = req;
        req.end();
      };

      requestSender(downloadUrl);
    });
  }

  /**
   * 取消当前下载
   */
  cancelDownload() {
    if (typeof this.downloadAbortController === 'function') {
      this.downloadAbortController();
      this.downloadAbortController = null;
      return true;
    }
    return false;
  }

  /**
   * 执行安装更新包并平稳退出主程序
   * @param {string} filePath 下载好的安装包路径
   */
  async installUpdate(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`安装包文件不存在: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();

    if (process.platform === 'win32' && ext === '.exe') {
      // 独立运行 setup.exe 并退出当前应用，避免锁定程序
      spawn(filePath, [], {
        detached: true,
        stdio: 'ignore'
      }).unref();
      setTimeout(() => {
        if (app && app.quit) app.quit();
      }, 500);
      return { ok: true };
    }

    if (process.platform === 'darwin' && ext === '.dmg') {
      // macOS 挂载 dmg
      await shell.openPath(filePath);
      return { ok: true };
    }

    // 其他情况或 Linux 使用系统默认程序打开
    const err = await shell.openPath(filePath);
    if (err) {
      throw new Error(err);
    }
    return { ok: true };
  }

  /**
   * 底层通过 HTTP 获取 GitHub 最新 Release 数据
   */
  _fetchLatestRelease() {
    return new Promise((resolve, reject) => {
      const client = net ? net : https;
      const req = client.request(GITHUB_API_URL, res => {
        let rawData = '';
        res.setEncoding ? res.setEncoding('utf8') : null;

        res.on('data', chunk => {
          rawData += chunk.toString();
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(rawData);
              resolve(parsed);
            } catch (err) {
              reject(new Error(`解析 Release 数据失败: ${err.message}`));
            }
          } else if (res.statusCode === 403 && rawData.includes('API rate limit')) {
            reject(new Error('GitHub API 访问速率超限，请稍后重试或前往 GitHub 页面查看'));
          } else {
            reject(new Error(`GitHub 请求返回 HTTP ${res.statusCode}`));
          }
        });

        res.on('error', reject);
      });

      req.setHeader('User-Agent', `Orbit-Toolbox-Updater/${this.appVersion}`);
      req.setHeader('Accept', 'application/vnd.github.v3+json');

      req.on('error', err => {
        reject(new Error(`连接 GitHub 失败: ${err.message || '网络连接超时'}`));
      });

      // 设置 10 秒超时
      if (req.setTimeout) {
        req.setTimeout(10000, () => {
          req.abort();
          reject(new Error('连接 GitHub 超时，请检查网络或代理设置'));
        });
      }

      req.end();
    });
  }
}

module.exports = {
  UpdateManager,
  compareVersions,
  matchPlatformAsset,
  REPO_OWNER,
  REPO_NAME,
  RELEASES_PAGE_URL,
};
