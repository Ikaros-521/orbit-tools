const assert = require('assert');
const { UpdateManager, compareVersions, matchPlatformAsset } = require('../src/core/updater');

async function run() {
  console.log('--- 1. Testing version comparison edge cases ---');
  assert.strictEqual(compareVersions('0.3.2', '0.3.2'), 0);
  assert.strictEqual(compareVersions('0.3.2', '0.3.3'), -1);
  assert.strictEqual(compareVersions('0.3.3', '0.3.2'), 1);
  assert.strictEqual(compareVersions('v0.3.2', '0.3.3'), -1);
  assert.strictEqual(compareVersions('0.3.2', 'v0.3.3'), -1);
  assert.strictEqual(compareVersions('v1.10.2', 'v1.9.9'), 1);
  assert.strictEqual(compareVersions('1.0.0', '1.0.0-alpha'), 1);
  assert.strictEqual(compareVersions('1.0.0-alpha', '1.0.0-beta'), -1);
  console.log('Version comparison OK');

  console.log('--- 2. Testing platform asset matcher ---');
  const mockAssets = [
    { name: 'Orbit Toolbox-Setup-0.3.3-win-x64.exe', size: 1024, browser_download_url: 'https://win-setup' },
    { name: 'Orbit Toolbox-0.3.3-win-x64.exe', size: 1024, browser_download_url: 'https://win-portable' },
    { name: 'Orbit Toolbox-0.3.3-mac-arm64.dmg', size: 1024, browser_download_url: 'https://mac-arm' },
    { name: 'Orbit Toolbox-0.3.3-mac-x64.dmg', size: 1024, browser_download_url: 'https://mac-x64' },
    { name: 'Orbit Toolbox-0.3.3-linux-x64.AppImage', size: 1024, browser_download_url: 'https://linux-appimage' },
  ];

  const winSetup = matchPlatformAsset(mockAssets, 'win32', 'x64');
  assert.strictEqual(winSetup.name, 'Orbit Toolbox-Setup-0.3.3-win-x64.exe');
  assert.strictEqual(winSetup.browser_download_url, 'https://win-setup');

  const macArm = matchPlatformAsset(mockAssets, 'darwin', 'arm64');
  assert.strictEqual(macArm.name, 'Orbit Toolbox-0.3.3-mac-arm64.dmg');

  const linux = matchPlatformAsset(mockAssets, 'linux', 'x64');
  assert.strictEqual(linux.name, 'Orbit Toolbox-0.3.3-linux-x64.AppImage');

  assert.strictEqual(matchPlatformAsset([], 'win32', 'x64'), null);
  assert.strictEqual(matchPlatformAsset(null, 'win32', 'x64'), null);
  console.log('Platform asset matcher OK');

  console.log('--- 3. Testing UpdateManager mocked update check ---');
  const um = new UpdateManager({ appVersion: '0.3.2' });

  // 模拟 _fetchLatestRelease 返回有新版本
  um._fetchLatestRelease = async () => ({
    tag_name: 'v0.3.3',
    name: 'Orbit Toolbox v0.3.3 性能优化与新功能发布',
    body: '## 更新日志\n- 新增在线检查更新功能\n- 优化工作流画布渲染性能',
    published_at: '2026-11-03T08:00:00Z',
    html_url: 'https://github.com/Ikaros-521/orbit-tools/releases/tag/v0.3.3',
    assets: mockAssets,
  });

  const checkRes = await um.checkForUpdates({ manual: true });
  assert.strictEqual(checkRes.ok, true);
  assert.strictEqual(checkRes.hasUpdate, true);
  assert.strictEqual(checkRes.currentVersion, '0.3.2');
  assert.strictEqual(checkRes.latestVersion, '0.3.3');
  assert.strictEqual(checkRes.manual, true);
  assert(checkRes.asset !== null, 'Asset should be matched');
  assert.strictEqual(checkRes.asset.name, 'Orbit Toolbox-Setup-0.3.3-win-x64.exe');
  console.log('Mocked check hasUpdate OK');

  // 模拟 _fetchLatestRelease 返回已是最新版本
  um._fetchLatestRelease = async () => ({
    tag_name: 'v0.3.2',
    name: 'v0.3.2',
    body: '当前版本',
    assets: mockAssets,
  });
  const checkResLatest = await um.checkForUpdates();
  assert.strictEqual(checkResLatest.ok, true);
  assert.strictEqual(checkResLatest.hasUpdate, false);
  console.log('Mocked check latest version OK');

  // 模拟 GitHub API 故障/超时
  um._fetchLatestRelease = async () => {
    throw new Error('Connection timed out');
  };
  const checkResError = await um.checkForUpdates({ manual: true });
  assert.strictEqual(checkResError.ok, false);
  assert.strictEqual(checkResError.hasUpdate, false);
  assert(checkResError.error.includes('Connection timed out'));
  console.log('Mocked network error graceful fallback OK');

  console.log('ALL UPDATER FLOW TESTS PASSED!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
