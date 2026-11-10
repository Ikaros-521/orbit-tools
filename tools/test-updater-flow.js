const assert = require('assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  UpdateManager,
  compareVersions,
  matchPlatformAsset,
  findPlatformManifest,
  extractShaFromManifest,
  extractShaFromReleaseNotes,
  computeFileHashes,
  verifyFileHash,
} = require('../src/core/updater');

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

  console.log('--- 4. Testing cancelDownload & cache cleanup ---');
  const tempDir = um.getUpdateTempDir();
  
  // 模拟写入临时碎片文件
  const testPart = path.join(tempDir, 'test-download.bin.part');
  const testOldBin = path.join(tempDir, 'old-installer.exe');
  fs.writeFileSync(testPart, 'dummy partial chunk');
  fs.writeFileSync(testOldBin, 'dummy old file');
  assert(fs.existsSync(testPart), 'Part file created');
  assert(fs.existsSync(testOldBin), 'Old bin created');

  // 调用清理
  um.cleanupUpdateCache();
  assert(!fs.existsSync(testPart), 'Part file must be completely removed');
  assert(!fs.existsSync(testOldBin), 'Old installer must be completely removed');
  console.log('Cache cleanup & anti-residue OK');

  console.log('--- 5. Testing binary hash computation & verification ---');
  const testSampleFile = path.join(tempDir, 'sample-installer.bin');
  const sampleContent = 'orbit-tools binary payload content for sha test 2026';
  fs.writeFileSync(testSampleFile, sampleContent);

  const realSha512Hex = crypto.createHash('sha512').update(sampleContent).digest('hex');
  const realSha512Base64 = crypto.createHash('sha512').update(sampleContent).digest('base64');
  const realSha256Hex = crypto.createHash('sha256').update(sampleContent).digest('hex');

  const { hex, base64 } = await computeFileHashes(testSampleFile, 'sha512');
  assert.strictEqual(hex, realSha512Hex);
  assert.strictEqual(base64, realSha512Base64);

  // 1) 匹配正确 hex sha512
  const vHex = await verifyFileHash(testSampleFile, realSha512Hex, 'sha512');
  assert.strictEqual(vHex.ok, true);

  // 2) 匹配正确 base64 sha512 (electron-builder latest.yml 格式)
  const vBase64 = await verifyFileHash(testSampleFile, realSha512Base64, 'sha512');
  assert.strictEqual(vBase64.ok, true);

  // 3) 匹配正确 sha256
  const v256 = await verifyFileHash(testSampleFile, realSha256Hex, 'sha256');
  assert.strictEqual(v256.ok, true);

  // 4) 篡改哈希拦截
  const fakeHash = '0000000000000000000000000000000000000000000000000000000000000000';
  const vTampered = await verifyFileHash(testSampleFile, fakeHash, 'sha256');
  assert.strictEqual(vTampered.ok, false);
  assert(vTampered.error.includes('文件完整性校验失败'));

  // 5) 空预期哈希（向前兼容放行）
  const vEmpty = await verifyFileHash(testSampleFile, null);
  assert.strictEqual(vEmpty.ok, true);

  console.log('Binary hash computation & verification OK');

  console.log('--- 6. Testing manifest & release notes hash parsers ---');
  const mockYaml = `
version: 0.3.9
files:
  - url: Orbit-Toolbox-Setup-0.3.9-win-x64.exe
    sha512: dGVzdC1zaGE1MTItYmFzZTY0LWNvbnRlbnQ=
    size: 89123456
path: Orbit-Toolbox-Setup-0.3.9-win-x64.exe
sha512: dGVzdC1zaGE1MTItYmFzZTY0LWNvbnRlbnQ=
releaseDate: '2026-11-09T09:57:00.000Z'
`;
  const extractedYmlSha = extractShaFromManifest(mockYaml, 'Orbit-Toolbox-Setup-0.3.9-win-x64.exe');
  assert.strictEqual(extractedYmlSha, 'dGVzdC1zaGE1MTItYmFzZTY0LWNvbnRlbnQ=');

  const mockNotes = `
## 更新日志
- 修复若干问题

### SHA256 校验和
Orbit-Toolbox-Setup-0.3.9-win-x64.exe: 8f4e2b1a9c3d5e7f8a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f
`;
  const extractedNotesSha = extractShaFromReleaseNotes(mockNotes, 'Orbit-Toolbox-Setup-0.3.9-win-x64.exe');
  assert(extractedNotesSha !== null);
  assert.strictEqual(extractedNotesSha.hash, '8f4e2b1a9c3d5e7f8a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f');
  assert.strictEqual(extractedNotesSha.algorithm, 'sha256');

  // 测试 manifest 平台匹配
  const mockManifestAssets = [
    { name: 'latest.yml', browser_download_url: 'https://latest.yml' },
    { name: 'latest-mac.yml', browser_download_url: 'https://latest-mac.yml' },
    { name: 'latest-linux.yml', browser_download_url: 'https://latest-linux.yml' },
  ];
  assert.strictEqual(findPlatformManifest(mockManifestAssets, 'win32').name, 'latest.yml');
  assert.strictEqual(findPlatformManifest(mockManifestAssets, 'darwin').name, 'latest-mac.yml');
  assert.strictEqual(findPlatformManifest(mockManifestAssets, 'linux').name, 'latest-linux.yml');
  console.log('Manifest and Release notes hash extraction OK');

  console.log('--- 7. Testing installUpdate integrity enforcement ---');
  let installRejected = false;
  try {
    await um.installUpdate(testSampleFile, { expectedHash: fakeHash, hashAlgorithm: 'sha256' });
  } catch (err) {
    installRejected = true;
    assert(err.message.includes('安装包校验失败'));
  }
  assert(installRejected, 'Untrusted / tampered installer must be rejected before execution');
  console.log('Untrusted installer execution rejected OK');

  fs.unlinkSync(testSampleFile);

  console.log('ALL UPDATER FLOW TESTS PASSED!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
