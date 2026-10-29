const { clipboard, app } = require('electron');
const { execFile, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VBS_PATH = path.join(__dirname, 'send_copy.vbs');
const READER_SRC = path.join(__dirname, 'selection-reader.cs');

/* --- UI Automation reader (Windows) ----------------------------------------
   Synthetic Ctrl+C is unreliable across apps: VS Code/Cursor ignore it, and a
   modifier the user still holds folds into Ctrl+Shift+C. UIA reads the focused
   control's TextPattern selection directly — no keys, no clipboard churn.
   A tiny .NET helper is compiled once with the csc that ships with the .NET
   Framework; anything going wrong here degrades to the clipboard path. */
let readerExe = null;
let readerBuildFailed = false;

function windowsDir() {
  return process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
}

function findCsc() {
  const base = path.join(windowsDir(), 'Microsoft.NET');
  for (const flavour of ['Framework64', 'Framework']) {
    const p = path.join(base, flavour, 'v4.0.30319', 'csc.exe');
    try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
  }
  return null;
}

function gacRef(name) {
  const base = path.join(windowsDir(), 'Microsoft.NET', 'assembly', 'GAC_MSIL', name);
  try {
    for (const dir of fs.readdirSync(base)) {
      const p = path.join(base, dir, `${name}.dll`);
      if (fs.existsSync(p)) return p;
    }
  } catch { /* ignore */ }
  return null;
}

function ensureReader() {
  if (readerExe) return readerExe;
  if (readerBuildFailed || process.platform !== 'win32') return null;
  try {
    const outDir = path.join(app.getPath('userData'), 'native');
    fs.mkdirSync(outDir, { recursive: true });
    const exe = path.join(outDir, 'OrbitSelectionReader.exe');
    let needBuild = !fs.existsSync(exe);
    if (!needBuild) {
      try { needBuild = fs.statSync(READER_SRC).mtimeMs > fs.statSync(exe).mtimeMs; } catch { /* ignore */ }
    }
    if (needBuild) {
      const csc = findCsc();
      const uia = gacRef('UIAutomationClient');
      const uiaTypes = gacRef('UIAutomationTypes');
      if (!csc || !uia || !uiaTypes) { readerBuildFailed = true; return null; }
      const res = spawnSync(csc, [
        '-nologo', '-target:exe', `-out:"${exe}"`,
        `-r:"${uia}"`, `-r:"${uiaTypes}"`, READER_SRC,
      ], { windowsHide: true, timeout: 20000 });
      if (res.status !== 0 || !fs.existsSync(exe)) { readerBuildFailed = true; return null; }
    }
    readerExe = exe;
    return exe;
  } catch {
    readerBuildFailed = true;
    return null;
  }
}

function readSelectionViaUia(timeoutMs = 800) {
  if (process.platform !== 'win32') return Promise.resolve({ supported: false, text: null });
  const exe = ensureReader();
  if (!exe) return Promise.resolve({ supported: false, text: null });
  return new Promise(resolve => {
    execFile(exe, [], { windowsHide: true, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      const code = err ? err.code : 0;
      // 3 = the focused control exposes text but has no selection: the clipboard
      // fallback would find nothing either, so skip it and keep the summon fast
      if (code === 3) return resolve({ supported: true, text: null });
      if (code !== 0 || !stdout) return resolve({ supported: false, text: null });
      try {
        const text = Buffer.from(String(stdout).trim(), 'base64').toString('utf8');
        resolve({ supported: true, text: text && text.trim() ? text.trim() : null });
      } catch { resolve({ supported: false, text: null }); }
    });
  });
}

function simulateCopy() {
  return new Promise(resolve => {
    const platform = process.platform;
    if (platform === 'win32') {
      // cscript startup alone measures ~190ms here; the old 150ms cap killed
      // the helper before SendKeys ran, so every capture silently failed.
      execFile('cscript', ['//nologo', VBS_PATH], { windowsHide: true, timeout: 600 }, err => {
        resolve(!err);
      });
    } else if (platform === 'darwin') {
      execFile('osascript', ['-e', 'tell application "System Events" to keystroke "c" using command down'], { windowsHide: true, timeout: 150 }, err => {
        resolve(!err);
      });
    } else {
      execFile('xdotool', ['key', '--clearmodifiers', 'ctrl+c'], { windowsHide: true, timeout: 150 }, err => {
        resolve(!err);
      });
    }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* Snapshot everything we are about to destroy. writeText() below replaces the
   whole clipboard, so a copied IMAGE or FILE list would be silently lost if we
   only remembered text — restore them verbatim instead. */
function snapshotClipboard() {
  const snap = { text: '', image: null, fileBuffer: null };
  try { snap.text = clipboard.readText() || ''; } catch { /* ignore */ }
  try {
    const img = clipboard.readImage();
    if (img && !img.isEmpty()) snap.image = img;
  } catch { /* ignore */ }
  try {
    if (clipboard.availableFormats().some(f => f.startsWith('FileName'))) {
      const buf = clipboard.readBuffer('FileNameW');
      if (buf && buf.length) snap.fileBuffer = buf;
    }
  } catch { /* ignore */ }
  return snap;
}

function restoreClipboardSnapshot(snap) {
  try {
    if (snap.fileBuffer) {
      // mirrors clip-history's copyItem: text first, FileNameW last —
      // every write* replaces the clipboard wholesale
      if (snap.text) clipboard.writeText(snap.text);
      clipboard.writeBuffer('FileNameW', snap.fileBuffer);
    } else if (snap.image) {
      clipboard.write({ image: snap.image, ...(snap.text ? { text: snap.text } : {}) });
    } else if (snap.text) {
      clipboard.writeText(snap.text);
    } else {
      clipboard.clear();
    }
  } catch { /* ignore */ }
}

/**
 * 捕获当前活动前台软件中划选的文本
 * @param {Object} opts
 * @param {boolean} opts.restoreClipboard 是否保留/恢复原系统剪贴板 (默认 true)
 * @param {number} opts.timeoutMs 最大捕获等待毫秒数 (默认 90ms)
 * @returns {Promise<{ ok: boolean, text: string|null }>}
 */
async function captureActiveSelection({ restoreClipboard = true, timeoutMs = 90 } = {}) {
  // 首选 UI Automation：直接读焦点控件的选区，不注入按键、不动剪贴板，
  // 在 VS Code / Cursor 这类忽略合成 Ctrl+C 的编辑器里也能拿到
  try {
    const uia = await readSelectionViaUia();
    if (uia.supported) return { ok: !!uia.text, text: uia.text || null };
  } catch { /* fall through to the clipboard path */ }

  const snap = snapshotClipboard();

  const sentinel = `__ORBIT_SEL_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  try {
    clipboard.writeText(sentinel);
  } catch { /* ignore */ }

  const copied = await simulateCopy();

  // 轮询检查目标应用是否写入了新内容（模拟复制失败时跳过——剪贴板不会变化）
  const start = Date.now();
  let captured = null;
  while (copied && Date.now() - start < timeoutMs) {
    await sleep(20);
    try {
      const cur = clipboard.readText() || '';
      if (cur && cur !== sentinel) {
        captured = cur;
        break;
      }
    } catch { /* ignore */ }
  }

  // 安全回滚：把快照原样写回，图片/文件剪贴板不被划选捕获破坏
  if (restoreClipboard) {
    restoreClipboardSnapshot(snap);
  }

  return {
    ok: !!(captured && captured.trim()),
    text: captured ? captured.trim() : null,
  };
}

module.exports = {
  captureActiveSelection,
  readSelectionViaUia,
  simulateCopy,
};
