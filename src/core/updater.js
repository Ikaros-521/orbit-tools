const { app, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { logger } = require('./logger');
const log = logger.scope('updater');

const REPO_OWNER = 'Ikaros-521';
const REPO_NAME = 'orbit-tools';
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const RELEASES_PAGE_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`;

/**
 * 转义正则特殊字符
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 异步计算文件散列值（同时产出 hex 与 base64，支持 sha256 / sha512 等）
 * @param {string} filePath 文件绝对路径
 * @param {string} [algorithm='sha512'] 散列算法
 * @returns {Promise<{ hex: string, base64: string }>}
 */
function computeFileHashes(filePath, algorithm = 'sha512') {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => {
      const hex = hash.digest('hex');
      const base64 = Buffer.from(hex, 'hex').toString('base64');
      resolve({ hex, base64 });
    });
    stream.on('error', reject);
  });
}

/**
 * 校验文件完整性，兼容 hex 与 base64 格式
 * @param {string} filePath 文件绝对路径
 * @param {string} expectedHash 预期的哈希字符串
 * @param {string} [algorithm='sha512'] 散列算法
 * @returns {Promise<{ ok: boolean, actualHash: string, actualBase64?: string, error?: string }>}
 */
async function verifyFileHash(filePath, expectedHash, algorithm = 'sha512') {
  if (!expectedHash || !expectedHash.trim()) {
    return { ok: true, actualHash: '' };
  }
  if (!fs.existsSync(filePath)) {
    return { ok: false, actualHash: '', error: '文件不存在' };
  }
  try {
    const { hex, base64 } = await computeFileHashes(filePath, algorithm);
    const target = expectedHash.trim();
    const matched = (target.toLowerCase() === hex.toLowerCase()) || (target === base64);
    return {
      ok: matched,
      actualHash: hex,
      actualBase64: base64,
      error: matched ? null : `文件完整性校验失败: 预期 ${target}, 实际 ${hex}`,
    };
  } catch (err) {
    return { ok: false, actualHash: '', error: `计算哈希失败: ${err.message}` };
  }
}

/**
 * 从 electron-builder 生成的 latest*.yml 内容中解析指定资产的 sha512
 * @param {string} manifestContent yml 文本
 * @param {string} assetName 资产文件名
 * @returns {string|null} sha512 base64 字符串
 */
function extractShaFromManifest(manifestContent, assetName) {
  if (!manifestContent || !assetName) return null;
  const regex = new RegExp(`url:\\s*${escapeRegex(assetName)}[\\s\\S]*?sha512:\\s*([A-Za-z0-9+/=]+)`, 'i');
  const m = manifestContent.match(regex);
  if (m && m[1]) return m[1].trim();
  const topMatch = manifestContent.match(/^sha512:\s*([A-Za-z0-9+/=]+)/m);
  if (topMatch && topMatch[1]) return topMatch[1].trim();
  return null;
}

/**
 * 从 GitHub Release 正文或更新说明中提取指定资产文件的预期哈希 (sha256/sha512)
 * @param {string} notes Release body 文本
 * @param {string} assetName 资产文件名
 * @returns {{ hash: string, algorithm: string }|null}
 */
function extractShaFromReleaseNotes(notes, assetName) {
  if (!notes || !assetName) return null;
  const baseName = escapeRegex(assetName);
  const p1 = new RegExp(`${baseName}[:\\s]+([a-fA-F0-9]{64}|[a-fA-F0-9]{128})`, 'i');
  const m1 = notes.match(p1);
  if (m1 && m1[1]) {
    return { hash: m1[1], algorithm: m1[1].length === 128 ? 'sha512' : 'sha256' };
  }
  const p2 = new RegExp(`([a-fA-F0-9]{64}|[a-fA-F0-9]{128})\\s+[*]?${baseName}`, 'i');
  const m2 = notes.match(p2);
  if (m2 && m2[1]) {
    return { hash: m2[1], algorithm: m2[1].length === 128 ? 'sha512' : 'sha256' };
  }
  return null;
}

/**
 * 寻找对应平台的 manifest yml 资产 (latest.yml, latest-mac.yml, latest-linux.yml)
 * @param {Array} assets
 * @param {string} [platform=process.platform]
 * @returns {object|null}
 */
function findPlatformManifest(assets, platform = process.platform) {
  if (!Array.isArray(assets) || assets.length === 0) return null;
  const isWin = platform === 'win32';
  const isMac = platform === 'darwin';
  const target = isWin ? 'latest.yml' : isMac ? 'latest-mac.yml' : 'latest-linux.yml';
  return assets.find(a => (a.name || '').toLowerCase() === target) || null;
}

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
  if (pre1 && pre2) {
    // semver 规范：数字段按数值比较（beta.10 > beta.2），字典段才按字符串，
    // 否则 localeCompare 的字典序会把 beta.10 误判为小于 beta.2
    const seg1 = pre1.split('.');
    const seg2 = pre2.split('.');
    const segLen = Math.max(seg1.length, seg2.length);
    for (let i = 0; i < segLen; i++) {
      const a = seg1[i];
      const b = seg2[i];
      if (a === undefined) return -1; // 段少者优先级低：beta < beta.1
      if (b === undefined) return 1;
      const aNum = /^\d+$/.test(a) ? parseInt(a, 10) : null;
      const bNum = /^\d+$/.test(b) ? parseInt(b, 10) : null;
      if (aNum !== null && bNum !== null) {
        if (aNum > bNum) return 1;
        if (aNum < bNum) return -1;
      } else {
        if (aNum !== null) return -1; // 数字段 < 字典段（semver 规则）
        if (bNum !== null) return 1;
        const cmp = a.localeCompare(b);
        if (cmp !== 0) return cmp > 0 ? 1 : -1;
      }
    }
  }

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
    this.currentPartFile = null;
    this.currentFinalFile = null;
  }

  /**
   * 获取专用更新临时缓存目录
   */
  getUpdateTempDir() {
    const base = app && app.getPath ? app.getPath('temp') : require('os').tmpdir();
    const dir = path.join(base, 'orbit-update');
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
    return dir;
  }

  /**
   * 彻底清理更新临时目录下的缓存与碎片文件
   * @param {string} [preserveFile] 可选保留的文件完整路径
   */
  cleanupUpdateCache(preserveFile = null) {
    try {
      const dir = this.getUpdateTempDir();
      if (!fs.existsSync(dir)) return true;
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const fullPath = path.join(dir, f);
        if (preserveFile && path.resolve(fullPath) === path.resolve(preserveFile)) {
          continue;
        }
        this._safeDeleteFile(fullPath);
      }
      return true;
    } catch (err) {
      log.warn('cleanupUpdateCache failed:', err && err.message);
      return false;
    }
  }

  /**
   * 安全删除单个文件，适配 Windows 下文件句柄延迟释放的情况
   */
  _safeDeleteFile(filePath, stream = null) {
    if (!filePath) return;
    const unlinkNow = () => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        // Windows 上若句柄刚释放，延迟 150ms 再次重试删除，确保彻底删除
        setTimeout(() => {
          try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch {}
        }, 150);
      }
    };

    if (stream && !stream.destroyed) {
      try {
        stream.destroy();
      } catch {}
      stream.once('close', unlinkNow);
    } else {
      unlinkNow();
    }
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
      const manifest = findPlatformManifest(release.assets || []);
      const expectedHashInfo = asset ? extractShaFromReleaseNotes(release.body || '', asset.name) : null;

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
          expectedHash: expectedHashInfo ? expectedHashInfo.hash : null,
          hashAlgorithm: expectedHashInfo ? expectedHashInfo.algorithm : null,
          manifestUrl: manifest ? manifest.browser_download_url : null,
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
   * 下载安装包资产并提供进度回调，支持停止、完整性校验与垃圾彻底清理
   * @param {string} downloadUrl 目标文件下载地址
   * @param {string} fileName 保存文件名
   * @param {function} [onProgress] 进度回调函数 ({ percent, transferred, total, speed })
   * @param {object} [options]
   * @param {string} [options.expectedHash] 预期校验和
   * @param {string} [options.hashAlgorithm='sha512'] 校验算法 (sha512/sha256)
   * @param {string} [options.manifestUrl] 对应的 yml 清单下载地址
   * @returns {Promise<{ ok: boolean, filePath?: string, total?: number, error?: string, verified?: boolean }>}
   */
  async downloadUpdate(downloadUrl, fileName, onProgress, options = {}) {
    if (!downloadUrl) {
      throw new Error('未提供下载地址');
    }

    if (this.activeDownloadRequest) {
      throw new Error('已有正在进行的下载任务');
    }

    const safeFileName = String(fileName || `orbit-update-${Date.now()}.bin`).replace(/[\\/:*?"<>|]/g, '_');
    const tempDir = this.getUpdateTempDir();

    let expectedHash = (options && options.expectedHash) || null;
    let hashAlgorithm = (options && options.hashAlgorithm) || 'sha512';

    // 若未显式传入预期哈希但存在 manifestUrl，尝试先静默拉取 yml 获取 sha512
    if (!expectedHash && options && options.manifestUrl) {
      try {
        const manifestText = await this._fetchText(options.manifestUrl);
        const sha = extractShaFromManifest(manifestText, safeFileName);
        if (sha) {
          expectedHash = sha;
          hashAlgorithm = 'sha512';
        }
      } catch (err) {
        log.warn('fetch manifest for hash verification failed, skipping:', err && err.message);
      }
    }

    // 在下载前，先清理之前可能残留的未完成 .part 碎片与历史旧安装包垃圾
    this.cleanupUpdateCache();

    // 采用 .part 后缀作为未完成分片，避免未下载完全的文件被当作正常安装包
    const partFile = path.join(tempDir, `${safeFileName}.part`);
    const finalFile = path.join(tempDir, safeFileName);
    this.currentPartFile = partFile;
    this.currentFinalFile = finalFile;

    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(partFile);
      // 写流失败（磁盘满 ENOSPC、%TEMP% 只读）以异步 'error' 事件抛出，
      // 无监听会直接击穿主进程 —— 在此兜住并终止下载。
      fileStream.on('error', err => {
        try { if (this.activeDownloadRequest) this.activeDownloadRequest.abort(); } catch {}
        this._safeDeleteFile(partFile, fileStream);
        this.currentPartFile = null;
        this.activeDownloadRequest = null;
        this.downloadAbortController = null;
        reject(new Error(`写入下载文件失败: ${err.message}`));
      });
      let transferred = 0;
      let total = 0;
      let startTime = Date.now();
      let lastTime = startTime;
      let lastTransferred = 0;
      let isCancelled = false;

      // 使用 electron.net 以尊重系统网络代理设置，若不可用降级为 https
      const requestSender = (url, redirectCount = 0) => {
        if (redirectCount > 5) {
          this._safeDeleteFile(partFile, fileStream);
          this.currentPartFile = null;
          this.activeDownloadRequest = null;
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
            this._safeDeleteFile(partFile, fileStream);
            this.currentPartFile = null;
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
            fileStream.end(async () => {
              try { req.setTimeout(0); } catch {} // 传输已完成，停用空闲超时
              this.activeDownloadRequest = null;
              this.downloadAbortController = null;
              if (isCancelled) {
                this._safeDeleteFile(partFile);
                this._safeDeleteFile(finalFile);
                return;
              }

              // 完整性校验：若配置了预期哈希，核对文件哈希，杜绝中间人劫持或下载损坏
              if (expectedHash) {
                const verifyRes = await verifyFileHash(partFile, expectedHash, hashAlgorithm);
                if (!verifyRes.ok) {
                  this._safeDeleteFile(partFile);
                  this.currentPartFile = null;
                  return reject(new Error(`更新包完整性校验未通过，已自动清理损坏文件: ${verifyRes.error}`));
                }
              }

              // 下载与校验完成，原子重命名为最终文件
              try {
                if (fs.existsSync(finalFile)) {
                  fs.unlinkSync(finalFile);
                }
                fs.renameSync(partFile, finalFile);
                this.currentPartFile = null;
                resolve({
                  ok: true,
                  filePath: finalFile,
                  total,
                  expectedHash,
                  verified: !!expectedHash,
                });
              } catch (err) {
                this._safeDeleteFile(partFile);
                this.currentPartFile = null;
                reject(new Error(`重命名完成文件失败: ${err.message}`));
              }
            });
          });

          res.on('error', err => {
            this._safeDeleteFile(partFile, fileStream);
            this.currentPartFile = null;
            this.activeDownloadRequest = null;
            this.downloadAbortController = null;
            reject(err);
          });
        });

        req.setHeader('User-Agent', `Orbit-Toolbox-Updater/${this.appVersion}`);
        // 空闲超时守卫：代理断流/Wi-Fi 切换等静默挂死的 socket 会让 promise
        // 永远 pending 并锁死后续下载（activeDownloadRequest 永不释放）。
        // destroy(err) 会走下方 req.on('error') 统一清理。
        req.setTimeout(30000, () => {
          req.destroy(new Error('下载连接超时（30 秒无数据进度）'));
        });
        req.on('error', err => {
          this._safeDeleteFile(partFile, fileStream);
          this.currentPartFile = null;
          this.activeDownloadRequest = null;
          this.downloadAbortController = null;
          reject(err);
        });

        // 绑定取消中断控制器，并彻底删除残留缓存垃圾
        this.downloadAbortController = () => {
          isCancelled = true;
          try {
            req.abort();
          } catch {}
          this._safeDeleteFile(partFile, fileStream);
          this._safeDeleteFile(finalFile);
          this.currentPartFile = null;
          this.activeDownloadRequest = null;
          this.downloadAbortController = null;
          reject(new Error('用户取消了更新下载，已清理临时文件'));
        };

        this.activeDownloadRequest = req;
        req.end();
      };

      requestSender(downloadUrl);
    });
  }

  /**
   * 取消当前下载，并确保磁盘上没有任何临时残留垃圾
   */
  cancelDownload() {
    let handled = false;
    if (typeof this.downloadAbortController === 'function') {
      try {
        this.downloadAbortController();
      } catch {}
      this.downloadAbortController = null;
      handled = true;
    }
    // 再次全面清理临时碎片
    if (this.currentPartFile) {
      this._safeDeleteFile(this.currentPartFile);
      this.currentPartFile = null;
    }
    this.cleanupUpdateCache();
    return handled;
  }

  /**
   * 执行安装更新包并平稳退出主程序
   * @param {string} filePath 下载好的安装包路径
   * @param {object} [options]
   * @param {string} [options.expectedHash] 预期的哈希字符串
   * @param {string} [options.hashAlgorithm='sha512'] 校验算法
   */
  async installUpdate(filePath, { expectedHash = null, hashAlgorithm = 'sha512' } = {}) {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`安装包文件不存在: ${filePath}`);
    }

    if (expectedHash) {
      const verifyRes = await verifyFileHash(filePath, expectedHash, hashAlgorithm);
      if (!verifyRes.ok) {
        throw new Error(`安装包校验失败，拒绝执行未受信任的文件: ${verifyRes.error}`);
      }
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
   * 底层通过 HTTP 获取远端文本数据（支持重定向与超时）
   * @param {string} url
   * @returns {Promise<string>}
   */
  _fetchText(url) {
    return new Promise((resolve, reject) => {
      const client = net ? net : https;
      const req = client.request(url, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let redirectUrl = res.headers.location;
          if (Array.isArray(redirectUrl)) redirectUrl = redirectUrl[0];
          return this._fetchText(redirectUrl).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          if (res.statusCode === 403) {
            return reject(new Error('GitHub API 访问速率超限，请稍后重试或前往 GitHub 页面查看'));
          }
          return reject(new Error(`HTTP 请求返回 ${res.statusCode}`));
        }
        let rawData = '';
        res.setEncoding ? res.setEncoding('utf8') : null;
        res.on('data', chunk => { rawData += chunk.toString(); });
        res.on('end', () => resolve(rawData));
        res.on('error', reject);
      });

      req.setHeader('User-Agent', `Orbit-Toolbox-Updater/${this.appVersion}`);
      req.setHeader('Accept', 'application/vnd.github.v3+json, text/plain, */*');

      if (req.setTimeout) {
        req.setTimeout(10000, () => {
          req.abort();
          reject(new Error('连接 GitHub 超时，请检查网络或代理设置'));
        });
      }

      req.on('error', err => {
        reject(new Error(`连接 GitHub 失败: ${err.message || '网络连接超时'}`));
      });

      req.end();
    });
  }

  /**
   * 底层通过 HTTP 获取 GitHub 最新 Release 数据
   */
  async _fetchLatestRelease() {
    const rawData = await this._fetchText(GITHUB_API_URL);
    try {
      return JSON.parse(rawData);
    } catch (err) {
      throw new Error(`解析 Release 数据失败: ${err.message}`);
    }
  }
}

module.exports = {
  UpdateManager,
  compareVersions,
  matchPlatformAsset,
  findPlatformManifest,
  extractShaFromManifest,
  extractShaFromReleaseNotes,
  computeFileHashes,
  verifyFileHash,
  REPO_OWNER,
  REPO_NAME,
  RELEASES_PAGE_URL,
};
