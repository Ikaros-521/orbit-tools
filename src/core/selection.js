const { clipboard } = require('electron');
const { execFile } = require('child_process');
const path = require('path');

const VBS_PATH = path.join(__dirname, 'send_copy.vbs');

function simulateCopy() {
  return new Promise(resolve => {
    const platform = process.platform;
    if (platform === 'win32') {
      execFile('cscript', ['//nologo', VBS_PATH], { windowsHide: true, timeout: 150 }, err => {
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

function restoreClipboard(snap) {
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
  const snap = snapshotClipboard();

  const sentinel = `__ORBIT_SEL_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  try {
    clipboard.writeText(sentinel);
  } catch { /* ignore */ }

  await simulateCopy();

  // 轮询检查目标应用是否写入了新内容
  const start = Date.now();
  let captured = null;
  while (Date.now() - start < timeoutMs) {
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
    restoreClipboard(snap);
  }

  return {
    ok: !!(captured && captured.trim()),
    text: captured ? captured.trim() : null,
  };
}

module.exports = {
  captureActiveSelection,
  simulateCopy,
};
