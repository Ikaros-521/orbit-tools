/* clip-history panel - lightweight, high-FPS clipboard manager UI */
(function () {
  function mount(el, ctx) {
    const isEn = ctx.lang === 'en';
    const T = {
      searchPlaceholder: isEn ? 'Search clipboard history...' : '搜索剪贴板历史...',
      all: isEn ? 'All' : '全部',
      text: isEn ? 'Text' : '文本',
      image: isEn ? 'Image' : '图片',
      pinned: isEn ? 'Pinned' : '收藏',
      clear: isEn ? 'Clear' : '清空',
      confirmClear: isEn ? 'Clear non-pinned clipboard history?' : '确定清空所有未收藏的历史记录吗？',
      empty: isEn ? 'Clipboard history is empty. Copied text or images will appear here automatically.' : '剪贴板历史为空，复制文本或图片后将自动记录',
      emptyFiltered: isEn ? 'No matching clipboard items.' : '没有找到匹配的记录',
      copied: isEn ? 'Copied' : '已复制',
      pin: isEn ? 'Pin / Star' : '置顶收藏',
      unpin: isEn ? 'Unpin' : '取消收藏',
      del: isEn ? 'Delete' : '删除',
      chars: isEn ? 'chars' : '字符',
      totalCount: (n) => isEn ? `${n} items` : `共 ${n} 条记录`,
      justNow: isEn ? 'Just now' : '刚刚',
      minsAgo: (n) => isEn ? `${n}m ago` : `${n} 分钟前`,
      hoursAgo: (n) => isEn ? `${n}h ago` : `${n} 小时前`,
      yesterday: isEn ? 'Yesterday' : '昨天',
      daysAgo: (n) => isEn ? `${n}d ago` : `${n} 天前`,
    };

    function escapeHtml(str) {
      return String(str || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    }

    function formatRelativeTime(ts) {
      if (!ts) return '';
      const now = Date.now();
      const diff = Math.max(0, now - ts);
      const sec = Math.floor(diff / 1000);
      if (sec < 60) return T.justNow;
      const min = Math.floor(sec / 60);
      if (min < 60) return T.minsAgo(min);
      const hr = Math.floor(min / 60);
      if (hr < 24) return T.hoursAgo(hr);
      const day = Math.floor(hr / 24);
      if (day === 1) return T.yesterday;
      if (day < 30) return T.daysAgo(day);
      const d = new Date(ts);
      return `${d.getMonth() + 1}-${d.getDate()}`;
    }

    function formatExactTime(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    el.innerHTML = `
      <div class="clip-container">
        <div class="clip-toolbar">
          <div class="clip-search-box">
            <input type="text" class="clip-search-input" placeholder="${T.searchPlaceholder}" spellcheck="false" />
          </div>
          <div class="clip-filter-seg">
            <button class="clip-filter-btn active" data-filter="all">${T.all}</button>
            <button class="clip-filter-btn" data-filter="text">${T.text}</button>
            <button class="clip-filter-btn" data-filter="image">${T.image}</button>
            <button class="clip-filter-btn" data-filter="pinned">${T.pinned}</button>
          </div>
          <button class="clip-btn clip-btn-danger clip-btn-clear" title="${T.confirmClear}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            ${T.clear}
          </button>
          <div class="clip-stats">0 条</div>
        </div>
        <div class="clip-list"></div>
        <div class="clip-empty" hidden>
          <div class="clip-empty-icon">📋</div>
          <div class="clip-empty-text">${T.empty}</div>
        </div>
      </div>
    `;

    const searchInput = el.querySelector('.clip-search-input');
    const filterBtns = el.querySelectorAll('.clip-filter-btn');
    const clearBtn = el.querySelector('.clip-btn-clear');
    const statsEl = el.querySelector('.clip-stats');
    const listEl = el.querySelector('.clip-list');
    const emptyEl = el.querySelector('.clip-empty');
    const emptyTextEl = el.querySelector('.clip-empty-text');

    let historyList = [];
    let currentFilter = 'all';
    let searchQuery = '';
    let searchDebounce = null;

    function getFilteredList() {
      let filtered = historyList;
      if (currentFilter === 'text') {
        filtered = filtered.filter(x => x.type === 'text');
      } else if (currentFilter === 'image') {
        filtered = filtered.filter(x => x.type === 'image');
      } else if (currentFilter === 'pinned') {
        filtered = filtered.filter(x => x.pinned);
      }

      const q = searchQuery.trim().toLowerCase();
      if (q) {
        filtered = filtered.filter(x => {
          if (x.type === 'text') {
            return (x.content || '').toLowerCase().includes(q);
          } else if (x.type === 'image') {
            const sizeStr = `${x.width || ''}x${x.height || ''}`;
            return sizeStr.includes(q) || '图片 image'.includes(q);
          }
          return false;
        });
      }
      return filtered;
    }

    function createCardElement(item) {
      const card = document.createElement('div');
      card.className = `clip-card${item.pinned ? ' pinned' : ''}`;
      card.dataset.id = item.id;

      const exactTime = formatExactTime(item.timestamp);
      const relTime = formatRelativeTime(item.timestamp);

      let badgeHtml = '';
      let bodyHtml = '';

      if (item.type === 'text') {
        badgeHtml = `
          <span class="clip-badge clip-badge-text">
            <span>📄</span>
            <span>${item.charCount || (item.content ? item.content.length : 0)} ${T.chars}</span>
          </span>
        `;
        bodyHtml = `<div class="clip-text-content">${escapeHtml(item.content)}</div>`;
      } else if (item.type === 'image') {
        badgeHtml = `
          <span class="clip-badge clip-badge-image">
            <span>🖼️</span>
            <span>${item.width || 0}×${item.height || 0}</span>
          </span>
        `;
        const thumbSrc = item.thumbnail || item.fullImage || '';
        bodyHtml = `
          <div class="clip-image-preview">
            <img src="${escapeHtml(thumbSrc)}" alt="preview" loading="lazy" />
          </div>
        `;
      }

      card.innerHTML = `
        <div class="clip-card-header">
          <div class="clip-badge-group">
            ${badgeHtml}
            ${item.pinned ? `<span class="clip-badge clip-badge-pin">★</span>` : ''}
          </div>
          <div class="clip-time" title="${exactTime}">${relTime}</div>
          <div class="clip-actions">
            <button class="clip-icon-btn clip-btn-pin${item.pinned ? ' active' : ''}" title="${item.pinned ? T.unpin : T.pin}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="${item.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
            </button>
            <button class="clip-icon-btn clip-icon-btn-danger clip-btn-delete" title="${T.del}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
        <div class="clip-card-body">
          ${bodyHtml}
        </div>
      `;

      // Click card to restore/copy
      card.addEventListener('click', async (e) => {
        if (e.target.closest('.clip-actions')) return; // Ignore action button clicks
        await copyToClipboard(item.id, card);
      });

      // Pin button
      const pinBtn = card.querySelector('.clip-btn-pin');
      pinBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await togglePin(item.id);
      });

      // Delete button
      const delBtn = card.querySelector('.clip-btn-delete');
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteItem(item.id);
      });

      return card;
    }

    function renderList() {
      const filtered = getFilteredList();
      statsEl.textContent = T.totalCount(historyList.length);

      if (filtered.length === 0) {
        listEl.innerHTML = '';
        listEl.hidden = true;
        emptyEl.hidden = false;
        emptyTextEl.textContent = searchQuery ? T.emptyFiltered : T.empty;
        return;
      }

      listEl.hidden = false;
      emptyEl.hidden = true;
      listEl.innerHTML = '';

      // High FPS rendering: render visible items without layout thrashing
      const frag = document.createDocumentFragment();
      for (const item of filtered) {
        frag.appendChild(createCardElement(item));
      }
      listEl.appendChild(frag);
    }

    async function copyToClipboard(id, cardEl) {
      try {
        await ctx.call('copyItem', { id });
        showCopyToast(cardEl);
      } catch (err) {
        console.error('Failed to copy item:', err);
      }
    }

    function showCopyToast(cardEl) {
      if (!cardEl) return;
      cardEl.classList.add('copied');

      let toast = cardEl.querySelector('.clip-copied-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.className = 'clip-copied-toast';
        toast.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> ${T.copied}`;
        cardEl.appendChild(toast);
      }

      setTimeout(() => {
        cardEl.classList.remove('copied');
        if (toast && toast.parentNode) {
          toast.remove();
        }
      }, 1000);
    }

    async function togglePin(id) {
      try {
        const res = await ctx.call('togglePin', { id });
        const item = historyList.find(x => x.id === id);
        if (item) {
          item.pinned = res.pinned;
          renderList();
        }
      } catch (err) {
        console.error('Failed to toggle pin:', err);
      }
    }

    async function deleteItem(id) {
      try {
        await ctx.call('deleteItem', { id });
        const idx = historyList.findIndex(x => x.id === id);
        if (idx >= 0) {
          historyList.splice(idx, 1);
          renderList();
        }
      } catch (err) {
        console.error('Failed to delete item:', err);
      }
    }

    // Filter segment buttons
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderList();
      });
    });

    // Search input with debounce
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        searchQuery = searchInput.value;
        renderList();
      }, 120);
    });

    // Clear non-pinned items
    clearBtn.addEventListener('click', async () => {
      if (confirm(T.confirmClear)) {
        try {
          await ctx.call('clearAll', { keepPinned: true });
          historyList = historyList.filter(x => x.pinned);
          renderList();
        } catch (err) {
          console.error('Failed to clear clipboard:', err);
        }
      }
    });

    // Realtime Events from backend
    ctx.onEvent('new-clip', (newItem) => {
      // Check if item already exists (promoted to top)
      const existingIdx = historyList.findIndex(x => x.id === newItem.id);
      if (existingIdx >= 0) {
        historyList.splice(existingIdx, 1);
      }
      historyList.unshift(newItem);
      renderList();
    });

    ctx.onEvent('item-deleted', ({ id }) => {
      const idx = historyList.findIndex(x => x.id === id);
      if (idx >= 0) {
        historyList.splice(idx, 1);
        renderList();
      }
    });

    ctx.onEvent('item-pin-toggled', ({ id, pinned }) => {
      const item = historyList.find(x => x.id === id);
      if (item) {
        item.pinned = pinned;
        renderList();
      }
    });

    ctx.onEvent('cleared', () => {
      historyList = historyList.filter(x => x.pinned);
      renderList();
    });

    // Initial load
    ctx.call('getHistory').then(data => {
      if (Array.isArray(data)) {
        historyList = data;
        renderList();
      }
    }).catch(err => {
      console.error('Failed to fetch initial clipboard history:', err);
    });
  }

  function unmount() {
    // Cleanup if needed
  }

  window.Toolbox.panel({ mount, unmount });
})();
