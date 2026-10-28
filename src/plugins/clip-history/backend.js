/* clip-history backend: lightweight, high-performance clipboard observer.
   Zero-lag principles:
   - Poll text first; never decode full images unless availableFormats includes an image
   - Smart thumbnail generation (fast preview rendering in UI)
   - FIFO cap with pinned/favorite protection
   - Avoid echo: self-written clipboard content updates the last-hash cache immediately */
const { clipboard, nativeImage } = require('electron');

const MAX_ITEMS = 80;
const POLL_INTERVAL = 800; // ms
let timer = null;

module.exports = {
  activate(ctx) {
    const data = ctx.data.get() || {};
    let list = Array.isArray(data.items) ? data.items : [];

    let lastText = (list.length > 0 && list[0].type === 'text') ? list[0].content : '';
    let lastImageHash = (list.length > 0 && list[0].type === 'image') ? list[0].hash : '';

    const save = () => {
      ctx.data.set({ items: list });
    };

    const addItem = item => {
      // De-duplicate matching content by promoting it to top
      if (item.type === 'text') {
        const idx = list.findIndex(x => x.type === 'text' && x.content === item.content);
        if (idx >= 0) {
          const existing = list.splice(idx, 1)[0];
          item.pinned = existing.pinned;
        }
      }

      list.unshift(item);

      // FIFO pruning with pinned item protection
      if (list.length > MAX_ITEMS) {
        let removed = false;
        for (let i = list.length - 1; i >= 0; i--) {
          if (!list[i].pinned) {
            list.splice(i, 1);
            removed = true;
            break;
          }
        }
        if (!removed) list.pop();
      }

      save();
      ctx.send('new-clip', item);
    };

    const poll = () => {
      try {
        const text = clipboard.readText();
        if (text && text.trim() && text !== lastText) {
          lastText = text;
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

        // Only inspect image if clipboard declares an image format
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

      if (item.type === 'text') {
        lastText = item.content; // Prevent self-echo loop
        clipboard.writeText(item.content);
      } else if (item.type === 'image') {
        lastImageHash = item.hash; // Prevent self-echo loop
        const img = nativeImage.createFromDataURL(item.fullImage || item.thumbnail);
        clipboard.writeImage(img);
      }

      ctx.send('item-copied', { id });
      return { ok: true };
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
