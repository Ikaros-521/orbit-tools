/* clip-history panel - lightweight, high-FPS clipboard manager UI */
(function () {
  function mount(el, ctx) {
    const isEn = ctx.lang === 'en';
    const T = {
      searchPlaceholder: isEn ? 'Search clipboard history...' : '搜索剪贴板历史...',
      all: isEn ? 'All' : '全部',
      text: isEn ? 'Text' : '文本',
      link: isEn ? 'Link' : '链接',
      image: isEn ? 'Image' : '图片',
      file: isEn ? 'File' : '文件',
      pinned: isEn ? 'Pinned' : '收藏',
      clear: isEn ? 'Clear' : '清空',
      confirmClear: isEn ? 'Clear non-pinned clipboard history?' : '确定清空所有未收藏的历史记录吗？',
      empty: isEn ? 'Clipboard history is empty. Copied text, links, files or images will appear here automatically.' : '剪贴板历史为空，复制文本、链接、文件或图片后将自动记录',
      emptyFiltered: isEn ? 'No matching clipboard items.' : '没有找到匹配的记录',
      copied: isEn ? 'Copied' : '已复制',
      pin: isEn ? 'Pin / Star' : '置顶收藏',
      unpin: isEn ? 'Unpin' : '取消收藏',
      del: isEn ? 'Delete' : '删除',
      openLink: isEn ? 'Open link in browser' : '在浏览器中打开链接',
      locateFile: isEn ? 'Locate in folder' : '在文件夹中定位',
      chars: isEn ? 'chars' : '字符',
      extractedLinks: (n) => isEn ? `${n} link${n > 1 ? 's' : ''}` : `${n} 个链接`,
      extractedLinksTitle: isEn ? 'Extracted Links' : '提取到的链接',
      copyLink: isEn ? 'Copy link' : '复制链接',
      linkCopied: isEn ? 'Link copied' : '链接已复制',
      totalCount: (n) => isEn ? `${n} items` : `共 ${n} 条记录`,
      capLabel: isEn ? 'Max:' : '上限:',
      capOption: (n, isDef) => isEn ? `${n} items${isDef ? ' (default)' : ''}` : `${n} 条${isDef ? ' (默认)' : ''}`,
      capCustomVal: (n) => isEn ? `${n} items (custom)` : `${n} 条 (自定义)`,
      capCustom: isEn ? 'Custom...' : '自定义数量...',
      customPrompt: isEn ? 'Set maximum clipboard history capacity (10 - 1000):' : '设置剪贴板历史记录数量上限（10 ~ 1000）：',
      customInvalid: isEn ? 'Please enter a valid integer between 10 and 1000.' : '请输入 10 到 1000 之间的整数。',
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

    function formatBytes(bytes) {
      if (!bytes || bytes <= 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1) + ' ' + sizes[i];
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

    const URL_REGEX = /(?:(?:https?|ftp|file):\/\/|www\.)[^\s"'\<\>`\u4e00-\u9fa5]+/gi;
    function extractUrls(str) {
      if (!str || typeof str !== 'string') return [];
      const source = str.length > 20000 ? str.slice(0, 20000) : str;
      const matches = source.match(URL_REGEX);
      if (!matches) return [];

      const results = [];
      const seen = new Set();

      for (let raw of matches) {
        let clean = raw.trim();
        clean = clean.replace(/[.,!?;:'"`，。？！；：（）【】《》“”‘’]+$/, '');
        while (clean.endsWith(')')) {
          const openCount = (clean.match(/\(/g) || []).length;
          const closeCount = (clean.match(/\)/g) || []).length;
          if (closeCount > openCount) clean = clean.slice(0, -1);
          else break;
        }
        while (clean.endsWith(']')) {
          const openCount = (clean.match(/\[/g) || []).length;
          const closeCount = (clean.match(/\]/g) || []).length;
          if (closeCount > openCount) clean = clean.slice(0, -1);
          else break;
        }
        if (!clean) continue;

        let normalized = clean;
        if (clean.toLowerCase().startsWith('www.')) {
          normalized = 'https://' + clean;
        }

        try {
          new URL(normalized);
          if (!seen.has(clean)) {
            seen.add(clean);
            results.push({ raw: clean, url: normalized });
          }
        } catch {
          if (clean.includes('.')) {
            if (!seen.has(clean)) {
              seen.add(clean);
              results.push({ raw: clean, url: normalized });
            }
          }
        }
      }
      return results;
    }

    function getItemLinks(item) {
      if (!item) return [];
      if (Array.isArray(item.links) && item.links.length > 0) {
        return item.links;
      }
      if (item.type === 'link') {
        const u = item.url || item.content;
        return [{ raw: item.content || u, url: u }];
      }
      if (item.type === 'text' && item.content) {
        return extractUrls(item.content);
      }
      return [];
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
            <button class="clip-filter-btn" data-filter="link">${T.link}</button>
            <button class="clip-filter-btn" data-filter="image">${T.image}</button>
            <button class="clip-filter-btn" data-filter="file">${T.file}</button>
            <button class="clip-filter-btn" data-filter="pinned">${T.pinned}</button>
          </div>
          <button class="clip-btn clip-btn-danger clip-btn-clear" title="${T.confirmClear}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            ${T.clear}
          </button>
          <div class="clip-cap-setting">
            <span class="clip-cap-label">${T.capLabel}</span>
            <select class="clip-cap-select" title="${T.capLabel}"></select>
          </div>
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
    const capSelect = el.querySelector('.clip-cap-select');
    const statsEl = el.querySelector('.clip-stats');
    const listEl = el.querySelector('.clip-list');
    const emptyEl = el.querySelector('.clip-empty');
    const emptyTextEl = el.querySelector('.clip-empty-text');

    let historyList = [];
    let currentFilter = 'all';
    let searchQuery = '';
    let searchDebounce = null;
    let currentMaxItems = 80;
    const PRESET_CAPS = [30, 50, 80, 150, 300];

    function renderCapSelect() {
      capSelect.innerHTML = '';
      const isCustom = !PRESET_CAPS.includes(currentMaxItems);
      if (isCustom) {
        const opt = document.createElement('option');
        opt.value = String(currentMaxItems);
        opt.textContent = T.capCustomVal(currentMaxItems);
        opt.selected = true;
        capSelect.appendChild(opt);
      }

      for (const val of PRESET_CAPS) {
        const opt = document.createElement('option');
        opt.value = String(val);
        opt.textContent = T.capOption(val, val === 80);
        if (val === currentMaxItems) opt.selected = true;
        capSelect.appendChild(opt);
      }

      const customOpt = document.createElement('option');
      customOpt.value = 'custom';
      customOpt.textContent = T.capCustom;
      capSelect.appendChild(customOpt);
    }

    async function applyMaxItems(num) {
      try {
        const res = await ctx.call('setMaxItems', { maxItems: num });
        if (res && res.ok) {
          currentMaxItems = res.maxItems;
          renderCapSelect();
          const refreshed = await ctx.call('getHistory');
          if (Array.isArray(refreshed)) {
            historyList = refreshed;
            renderList();
          }
        }
      } catch (err) {
        console.error('Failed to set maxItems:', err);
      }
    }

    capSelect.addEventListener('change', async () => {
      const selected = capSelect.value;
      if (selected === 'custom') {
        const input = prompt(T.customPrompt, String(currentMaxItems));
        if (input === null) {
          renderCapSelect();
          return;
        }
        const num = Math.floor(Number(input.trim()));
        if (!Number.isFinite(num) || num < 10 || num > 1000) {
          alert(T.customInvalid);
          renderCapSelect();
          return;
        }
        await applyMaxItems(num);
      } else {
        await applyMaxItems(Number(selected));
      }
    });

    el.__setCapForTest = applyMaxItems;

    function getFilteredList() {
      let filtered = historyList;
      if (currentFilter === 'text') {
        // 链接文本既属于文本，所有文本与链接均在【文本】分类中
        filtered = filtered.filter(x => x.type === 'text' || x.type === 'link');
      } else if (currentFilter === 'link') {
        // 凡是提取出链接或本身是链接的条目，均在【链接】分类中
        filtered = filtered.filter(x => x.type === 'link' || getItemLinks(x).length > 0);
      } else if (currentFilter === 'image') {
        filtered = filtered.filter(x => x.type === 'image');
      } else if (currentFilter === 'file') {
        filtered = filtered.filter(x => x.type === 'file');
      } else if (currentFilter === 'pinned') {
        filtered = filtered.filter(x => x.pinned);
      }

      const q = searchQuery.trim().toLowerCase();
      if (q) {
        filtered = filtered.filter(x => {
          if (x.type === 'text' || x.type === 'link') {
            const matchContent = (x.content || '').toLowerCase().includes(q);
            const links = getItemLinks(x);
            const matchLinks = links.some(l => (l.raw && l.raw.toLowerCase().includes(q)) || (l.url && l.url.toLowerCase().includes(q)));
            return matchContent || matchLinks;
          } else if (x.type === 'file') {
            return (x.name || '').toLowerCase().includes(q) || (x.path || '').toLowerCase().includes(q);
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

      const links = getItemLinks(item);
      const exactTime = formatExactTime(item.timestamp);
      const relTime = formatRelativeTime(item.timestamp);

      let badgeHtml = '';
      let bodyHtml = '';
      let extraActionHtml = '';

      if (item.type === 'text') {
        badgeHtml = `
          <span class="clip-badge clip-badge-text">
            <span>📄</span>
            <span>${item.charCount || (item.content ? item.content.length : 0)} ${T.chars}</span>
          </span>
        `;
        if (links.length > 0) {
          badgeHtml += `
            <span class="clip-badge clip-badge-link" title="${T.extractedLinksTitle}">
              <span>🔗</span>
              <span>${T.extractedLinks(links.length)}</span>
            </span>
          `;
        }

        let linksAreaHtml = '';
        if (links.length > 0) {
          linksAreaHtml = `
            <div class="clip-extracted-links">
              <div class="clip-extracted-links-title">
                <span>🔗</span>
                <span>${T.extractedLinksTitle} (${links.length})</span>
              </div>
              <div class="clip-extracted-links-list">
                ${links.map((lnk, idx) => {
                  const targetUrl = lnk.url || lnk.raw;
                  const displayStr = lnk.raw || lnk.url;
                  return `
                    <div class="clip-extracted-link-row" data-url="${escapeHtml(targetUrl)}">
                      <span class="clip-extracted-link-text" title="${escapeHtml(targetUrl)}">${escapeHtml(displayStr)}</span>
                      <div class="clip-extracted-link-actions">
                        <button class="clip-btn-ext-action clip-btn-open-ext" title="${T.openLink}" data-url="${escapeHtml(targetUrl)}">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </button>
                        <button class="clip-btn-ext-action clip-btn-copy-ext" title="${T.copyLink}" data-url="${escapeHtml(targetUrl)}">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        bodyHtml = `
          <div class="clip-text-content">${escapeHtml(item.content)}</div>
          ${linksAreaHtml}
        `;
      } else if (item.type === 'link') {
        const charLen = item.charCount || (item.content ? item.content.length : 0);
        badgeHtml = `
          <span class="clip-badge clip-badge-link">
            <span>🔗</span>
            <span>${T.link}</span>
          </span>
          <span class="clip-badge clip-badge-text">
            <span>📄</span>
            <span>${charLen} ${T.chars}</span>
          </span>
        `;
        bodyHtml = `
          <div class="clip-link-content">
            <span class="clip-link-text">${escapeHtml(item.content)}</span>
          </div>
        `;
        extraActionHtml = `
          <button class="clip-icon-btn clip-btn-open-link" title="${T.openLink}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </button>
        `;
      } else if (item.type === 'file') {
        badgeHtml = `
          <span class="clip-badge clip-badge-file">
            <span>${item.isDirectory ? '📁' : '📄'}</span>
            <span>${T.file}</span>
          </span>
        `;
        bodyHtml = `
          <div class="clip-file-content">
            <div class="clip-file-main">
              <span>${item.isDirectory ? '📁' : '📄'}</span>
              <span>${escapeHtml(item.name || item.path)}</span>
              <span class="clip-file-size">${formatBytes(item.size)}</span>
            </div>
            <div class="clip-file-path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</div>
          </div>
        `;
        extraActionHtml = `
          <button class="clip-icon-btn clip-btn-locate" title="${T.locateFile}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          </button>
        `;
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
            ${extraActionHtml}
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
        if (e.target.closest('.clip-actions') || e.target.closest('.clip-extracted-links')) return; // Ignore action clicks
        await copyToClipboard(item.id, card);
      });

      // Extracted links actions
      const extLinkRows = card.querySelectorAll('.clip-extracted-link-row');
      extLinkRows.forEach(row => {
        const url = row.dataset.url;
        const textEl = row.querySelector('.clip-extracted-link-text');
        const openBtn = row.querySelector('.clip-btn-open-ext');
        const copyBtn = row.querySelector('.clip-btn-copy-ext');

        if (textEl) {
          textEl.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (url) await ctx.call('openExternal', { url });
          });
        }
        if (openBtn) {
          openBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (url) await ctx.call('openExternal', { url });
          });
        }
        if (copyBtn) {
          copyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (url) {
              await ctx.call('writeClipboardText', { text: url });
              copyBtn.classList.add('copied');
              const origSvg = copyBtn.innerHTML;
              copyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
              setTimeout(() => {
                copyBtn.classList.remove('copied');
                copyBtn.innerHTML = origSvg;
              }, 1000);
            }
          });
        }
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

      // Open link button
      const openLinkBtn = card.querySelector('.clip-btn-open-link');
      if (openLinkBtn) {
        openLinkBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await ctx.call('openExternal', { url: item.content });
        });
      }

      // Locate file button
      const locateBtn = card.querySelector('.clip-btn-locate');
      if (locateBtn) {
        locateBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await ctx.call('showInFolder', { path: item.path });
        });
      }

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

    ctx.onEvent('config-updated', ({ maxItems }) => {
      currentMaxItems = maxItems;
      renderCapSelect();
      ctx.call('getHistory').then(list => {
        if (Array.isArray(list)) {
          historyList = list;
          renderList();
        }
      });
    });

    // Initial load
    ctx.call('getConfig').then(cfg => {
      if (cfg && typeof cfg.maxItems === 'number') {
        currentMaxItems = cfg.maxItems;
      }
      renderCapSelect();
    }).catch(() => {
      renderCapSelect();
    });

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
