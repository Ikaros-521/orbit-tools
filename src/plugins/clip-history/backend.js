/* clip-history backend: lightweight, high-performance clipboard observer.
   Zero-lag principles:
   - Poll files & text first; never decode full images unless availableFormats includes an image
   - Smart thumbnail generation (fast preview rendering in UI)
   - FIFO cap with pinned/favorite protection
   - Avoid echo: self-written clipboard content updates the last-hash cache immediately */
const { clipboard, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULT_MAX_ITEMS = 80;
const MIN_MAX_ITEMS = 10;
const MAX_ALLOWED_ITEMS = 1000;
const POLL_INTERVAL = 800; // ms
let timer = null;

const URL_REGEX = /^(https?|ftp|file):\/\/[^\s/$.?#].[^\s]*$/i;
function isUrl(str) {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim();
  if (s.length > 2000) return false;
  return URL_REGEX.test(s);
}

function readClipboardFilePath() {
  try {
    if (process.platform === 'win32') {
      const bufW = clipboard.readBuffer('FileNameW');
      if (bufW && bufW.length > 0) {
        const p = bufW.toString('utf16le').replace(/\0+$/, '').trim();
        if (p && (fs.existsSync(p) || /^[a-zA-Z]:[\\/]/.test(p))) {
          return p;
        }
      }
    }
  } catch {}
  return null;
}

function getFileMetadata(filePath) {
  const name = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  let size = 0;
  let isDirectory = false;
  try {
    const stat = fs.statSync(filePath);
    size = stat.size;
    isDirectory = stat.isDirectory();
  } catch {}
  return { path: filePath, name, ext, size, isDirectory };
}

module.exports = {
  activate(ctx) {
    const data = ctx.data.get() || {};
    let list = Array.isArray(data.items) ? data.items : [];
    let maxItems = (typeof data.maxItems === 'number' && data.maxItems >= MIN_MAX_ITEMS && data.maxItems <= MAX_ALLOWED_ITEMS)
      ? Math.floor(data.maxItems)
      : DEFAULT_MAX_ITEMS;

    let lastText = (list.length > 0 && (list[0].type === 'text' || list[0].type === 'link')) ? list[0].content : '';
    let lastImageHash = (list.length > 0 && list[0].type === 'image') ? list[0].hash : '';
    let lastFilePath = (list.length > 0 && list[0].type === 'file') ? list[0].path : '';

    const save = () => {
      ctx.data.set({ items: list, maxItems });
    };

    const pruneList = () => {
      while (list.length > maxItems) {
        let removed = false;
        for (let i = list.length - 1; i >= 0; i--) {
          if (!list[i].pinned) {
            list.splice(i, 1);
            removed = true;
            break;
          }
        }
        if (!removed) break; // All remaining items are pinned
      }
    };

    const addItem = item => {
      // De-duplicate matching content by promoting it to top
      if (item.type === 'text' || item.type === 'link') {
        const idx = list.findIndex(x => (x.type === 'text' || x.type === 'link') && x.content === item.content);
        if (idx >= 0) {
          const existing = list.splice(idx, 1)[0];
          item.pinned = existing.pinned;
        }
      } else if (item.type === 'file') {
        const idx = list.findIndex(x => x.type === 'file' && x.path === item.path);
        if (idx >= 0) {
          const existing = list.splice(idx, 1)[0];
          item.pinned = existing.pinned;
        }
      } else if (item.type === 'image') {
        const idx = list.findIndex(x => x.type === 'image' && x.hash === item.hash);
        if (idx >= 0) {
          const existing = list.splice(idx, 1)[0];
          item.pinned = existing.pinned;
        }
      }

      list.unshift(item);
      pruneList();

      save();
      ctx.send('new-clip', item);
    };

    const poll = () => {
      try {
        // 1. Check for system clipboard files (lightweight buffer check)
        const sysFile = readClipboardFilePath();
        if (sysFile && sysFile !== lastFilePath) {
          lastFilePath = sysFile;
          const meta = getFileMetadata(sysFile);
          addItem({
            id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'file',
            ...meta,
            timestamp: Date.now(),
            pinned: false,
          });
          return;
        }

        // 2. Check for text or links
        const text = clipboard.readText();
        if (text && text.trim() && text !== lastText) {
          lastText = text;
          const trimmed = text.trim();

          // Check if text is a single existing local file path
          if ((/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('/')) && !trimmed.includes('\n') && fs.existsSync(trimmed)) {
            lastFilePath = trimmed;
            const meta = getFileMetadata(trimmed);
            addItem({
              id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: 'file',
              ...meta,
              timestamp: Date.now(),
              pinned: false,
            });
            return;
          }

          // Check if text is a URL
          if (isUrl(trimmed)) {
            addItem({
              id: `url_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: 'link',
              content: trimmed,
              url: trimmed,
              timestamp: Date.now(),
              pinned: false,
            });
            return;
          }

          // Standard text
          addItem({
            id: `txt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'text',
            content: text,
            charCount: text.length,
            timestamp: Date.now(),
            pinned: false,
          });
          return;
        }

        // 3. Only inspect image if clipboard declares an image format
        const formats = clipboard.availableFormats();
        const hasImg = formats.some(f => f.toLowerCase().includes('image') || f.includes('png') || f.includes('jpeg'));
        if (hasImg) {
          const img = clipboard.readImage();
          if (!img.isEmpty()) {
            const size = img.getSize();
            const bmp = img.getBitmap();
            const sample = bmp.slice(0, Math.min(32, bmp.length)).toString('hex');
            const hash = `${size.width}x${size.height}_${sample}`;

            if (hash !== lastImageHash) {
              lastImageHash = hash;

              // Generate lightweight thumbnail for high-FPS scrolling in renderer
              const maxThumb = 180;
              let thumb = img;
              if (size.width > maxThumb || size.height > maxThumb) {
                const ratio = Math.min(maxThumb / size.width, maxThumb / size.height);
                thumb = img.resize({
                  width: Math.max(1, Math.round(size.width * ratio)),
                  height: Math.max(1, Math.round(size.height * ratio)),
                  quality: 'good',
                });
              }

              // Constrain full image storage to avoid multi-megapixel memory blowouts
              let full = img;
              const maxFull = 1920;
              if (size.width > maxFull || size.height > maxFull) {
                const r = Math.min(maxFull / size.width, maxFull / size.height);
                full = img.resize({
                  width: Math.max(1, Math.round(size.width * r)),
                  height: Math.max(1, Math.round(size.height * r)),
                  quality: 'better',
                });
              }

              addItem({
                id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                type: 'image',
                thumbnail: thumb.toDataURL(),
                fullImage: full.toDataURL(),
                width: size.width,
                height: size.height,
                hash,
                timestamp: Date.now(),
                pinned: false,
              });
            }
          }
        }
      } catch (err) {
        // Guard against clipboard lock contention from external apps
      }
    };

    timer = setInterval(poll, POLL_INTERVAL);

    /* --- IPC Handlers -------------------------------------------------------- */

    ctx.ipc.handle('getHistory', () => list);

    ctx.ipc.handle('copyItem', (args) => {
      const { id } = args || {};
      const item = list.find(x => x.id === id);
      if (!item) return { ok: false, error: 'item not found' };

      if (item.type === 'text' || item.type === 'link') {
        lastText = item.content; // Prevent self-echo loop
        clipboard.writeText(item.content);
      } else if (item.type === 'file') {
        lastFilePath = item.path;
        lastText = item.path;
        if (process.platform === 'win32') {
          clipboard.writeBuffer('FileNameW', Buffer.from(item.path + '\0', 'utf16le'));
        }
        clipboard.writeText(item.path);
      } else if (item.type === 'image') {
        lastImageHash = item.hash; // Prevent self-echo loop
        const img = nativeImage.createFromDataURL(item.fullImage || item.thumbnail);
        clipboard.writeImage(img);
      }

      ctx.send('item-copied', { id });
      return { ok: true };
    });

    ctx.ipc.handle('showInFolder', (args) => {
      const { path: p } = args || {};
      if (p && fs.existsSync(p)) {
        shell.showItemInFolder(p);
        return { ok: true };
      }
      return { ok: false, error: 'file not found' };
    });

    ctx.ipc.handle('openExternal', (args) => {
      const { url } = args || {};
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        shell.openExternal(url);
        return { ok: true };
      }
      return { ok: false };
    });

    ctx.ipc.handle('deleteItem', (args) => {
      const { id } = args || {};
      const idx = list.findIndex(x => x.id === id);
      if (idx >= 0) {
        list.splice(idx, 1);
        save();
        ctx.send('item-deleted', { id });
        return { ok: true };
      }
      return { ok: false };
    });

    ctx.ipc.handle('togglePin', (args) => {
      const { id } = args || {};
      const item = list.find(x => x.id === id);
      if (item) {
        item.pinned = !item.pinned;
        save();
        ctx.send('item-pin-toggled', { id, pinned: item.pinned });
        return { ok: true, pinned: item.pinned };
      }
      return { ok: false };
    });

    ctx.ipc.handle('clearAll', (args) => {
      const { keepPinned = true } = args || {};
      if (keepPinned) {
        list = list.filter(x => x.pinned);
      } else {
        list = [];
      }
      save();
      ctx.send('cleared', { count: list.length });
      return { ok: true, remaining: list.length };
    });

    ctx.ipc.handle('getConfig', () => ({
      maxItems,
      defaultMaxItems: DEFAULT_MAX_ITEMS,
      minMaxItems: MIN_MAX_ITEMS,
      maxAllowedItems: MAX_ALLOWED_ITEMS,
    }));

    ctx.ipc.handle('setMaxItems', (args) => {
      const raw = Number(args && args.maxItems);
      if (!Number.isFinite(raw)) return { ok: false, error: 'invalid number' };
      const val = Math.min(MAX_ALLOWED_ITEMS, Math.max(MIN_MAX_ITEMS, Math.floor(raw)));
      maxItems = val;
      pruneList();
      save();
      ctx.send('config-updated', { maxItems, count: list.length });
      return { ok: true, maxItems, count: list.length };
    });

    ctx.ipc.handle('openPanel', () => {
      const host = ctx.getHostWindow();
      if (host && !host.isDestroyed()) {
        host.show();
        host.focus();
      }
      return { ok: true };
    });
  },

  deactivate() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
};
