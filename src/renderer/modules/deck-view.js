/* Deck View Module - Tool Cards, Frecency Sorting, Smart Peek & Context Menu
   Manages tool cards deck rendering, search matching, usage recency, and zero-click clipboard preview. */
(() => {
  window.OrbitDeckView = window.OrbitDeckView || {};

  const DECK_SORTS = ['default', 'frequent', 'recent', 'name'];

  function init(ctx) {
    const { state, els, I18N, escapeHtml } = ctx;
    let peekCheckSeq = 0;

    function pluginText(p) {
      const base = [p.id, p.name.zh, p.name.en, p.desc.zh, p.desc.en, ...p.keywords].join('\n').toLowerCase();
      return window.PaletteSearch.enrich(base, `${p.name.zh || ''} ${p.name.en || ''}`);
    }

    function pluginUsageIndex() {
      const idx = Object.create(null);
      for (const [key, u] of Object.entries(state.usage || {})) {
        const bits = key.split(':');
        if (!u || bits.length < 2 || bits[0] === 'workflow') continue;
        const cur = idx[bits[1]] || (idx[bits[1]] = { n: 0, t: 0 });
        cur.n += u.n || 0;
        cur.t = Math.max(cur.t, u.t || 0);
      }
      return idx;
    }

    const deckToolName = p => (I18N.lang === 'en' ? (p.name.en || p.name.zh) : (p.name.zh || p.name.en)) || p.id;

    function sortDeck(list) {
      const mode = state.deckSort;
      if (mode === 'default') return list;
      const byId = (a, b) => a.id.localeCompare(b.id);
      const arr = [...list];
      if (mode === 'name') {
        const loc = I18N.lang === 'en' ? 'en' : 'zh';
        arr.sort((a, b) => deckToolName(a).localeCompare(deckToolName(b), loc) || byId(a, b));
        return arr;
      }
      const idx = pluginUsageIndex();
      if (mode === 'recent') {
        arr.sort((a, b) => ((idx[b.id] || {}).t || 0) - ((idx[a.id] || {}).t || 0) || byId(a, b));
        return arr;
      }
      const ps = window.PaletteSearch;
      arr.sort((a, b) => ps.usageScore(idx, b.id) - ps.usageScore(idx, a.id) || byId(a, b));
      return arr;
    }

    function visibleDeckPlugins() {
      const q = (state.query || '').trim().toLowerCase();
      return sortDeck(state.plugins.filter(p => p.enabled && (!q || pluginText(p).includes(q))));
    }

    function useDeckTool(p) {
      if (!p) return;
      ctx.bumpUsageId(`plugin:${p.id}`);
      // 无面板的动作型插件：与独立抽屉一致路由到首个动作，否则计入使用却无任何响应
      if (!p.panel) {
        if (p.actions && p.actions.length > 0) {
          const act = p.actions[0];
          window.host.pluginCall(p.id, act.method || act.id, {}).catch(() => {});
        }
        return;
      }
      ctx.openPlugin(p.id);
    }

    function updateDeckSelection(scroll = true) {
      const cards = els.deck.querySelectorAll('.card');
      cards.forEach((el, idx) => el.classList.toggle('selected', idx === state.deckIndex));
      if (scroll) {
        const sel = cards[state.deckIndex];
        if (sel) sel.scrollIntoView({ block: 'nearest' });
      }
    }

    function renderDeck() {
      const shown = visibleDeckPlugins();
      if (state.deckIndex >= shown.length) state.deckIndex = Math.max(0, shown.length - 1);
      els.deck.innerHTML = '';
      shown.forEach((p, i) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `card${i === state.deckIndex ? ' selected' : ''}`;
        card.dataset.id = p.id;
        card.innerHTML = `
          <span class="card-icon">${p.iconSvg || escapeHtml(p.iconText)}</span>
          <span class="card-name"></span>
          <span class="card-desc"></span>
          <span class="card-tags"></span>`;
        card.querySelector('.card-name').textContent = deckToolName(p);
        card.querySelector('.card-desc').textContent = I18N.lang === 'en' ? (p.desc.en || p.desc.zh) : (p.desc.zh || p.desc.en);
        const tags = card.querySelector('.card-tags');
        for (const a of p.actions) {
          if (a.hotkey) {
            const kbd = document.createElement('kbd');
            kbd.textContent = a.hotkey;
            kbd.title = (I18N.lang === 'en' ? a.label.en : a.label.zh);
            tags.appendChild(kbd);
          }
        }
        card.addEventListener('click', () => useDeckTool(p));
        card.addEventListener('contextmenu', e => {
          e.preventDefault();
          e.stopPropagation();
          showCardContextMenu(p, e.clientX, e.clientY);
        });
        card.addEventListener('mouseenter', () => { ctx.setHoveredPlugin(p); state.deckIndex = i; updateDeckSelection(false); });
        card.addEventListener('mouseleave', () => { if (ctx.getHoveredPlugin() === p) ctx.setHoveredPlugin(null); });
        card.addEventListener('mousemove', e => {
          const r = card.getBoundingClientRect();
          card.style.setProperty('--mx', `${e.clientX - r.left}px`);
          card.style.setProperty('--my', `${e.clientY - r.top}px`);
        });
        els.deck.appendChild(card);
      });
      const enabledCount = state.plugins.filter(p => p.enabled).length;
      let meta = (state.query || '').trim() ? I18N.t('deckMeta', { n: shown.length }) : I18N.t('deckMeta', { n: enabledCount });
      if ((state.deckSort === 'frequent' || state.deckSort === 'recent')
        && Object.keys(pluginUsageIndex()).length === 0) {
        meta += ` · ${I18N.t('noUsageYet')}`;
      }
      els.deckMeta.textContent = meta;
      for (const b of els.deckSort.querySelectorAll('button')) {
        b.classList.toggle('on', b.dataset.sort === state.deckSort);
      }
      const emptyMsg = enabledCount === 0 ? I18N.t('noTools') : I18N.t('empty');
      els.empty.textContent = emptyMsg;
      els.empty.hidden = shown.length > 0;
    }

    /* --- Smart Peek --- */
    async function checkClipboardSmartPeek() {
      if (state.view !== 'home') return;
      const seq = ++peekCheckSeq;
      const q = els.search.value.trim();
      const textToCheck = q || (await window.host.readClipboardText().catch(() => ''));
      if (!textToCheck) {
        hideSmartPeek();
        return;
      }
      const result = await window.host.detectSmartPeek(textToCheck).catch(() => null);
      if (seq !== peekCheckSeq) return;
      if (!result) {
        hideSmartPeek();
        return;
      }
      renderSmartPeek(result);
    }

    function hideSmartPeek() {
      state.smartPeekData = null;
      if (els.smartPeek) {
        els.smartPeek.hidden = true;
        els.smartPeek.innerHTML = '';
      }
    }

    function renderSmartPeek(data) {
      state.smartPeekData = data;
      if (!els.smartPeek) return;
      els.smartPeek.hidden = false;
      const pluginLabel = data.pluginName && (I18N.lang === 'en' ? (data.pluginName.en || data.pluginName.zh) : (data.pluginName.zh || data.pluginName.en)) || I18N.t('openPlugin') || '打开插件';
      els.smartPeek.innerHTML = `
        <div class="peek-main">
          <span class="peek-badge">${escapeHtml(data.badge)}</span>
          <div class="peek-content">
            <span class="peek-preview">${escapeHtml(data.preview)}</span>
            <span class="peek-sub">${escapeHtml(data.subText || '')}</span>
          </div>
        </div>
        <div class="peek-actions">
          <button type="button" class="peek-btn primary" id="btnPeekCopy">
            <span>复制结果</span> <kbd>Enter</kbd>
          </button>
          <button type="button" class="peek-btn ghost" id="btnPeekOpen">
            <span>${escapeHtml(pluginLabel)}</span> <kbd>Tab</kbd>
          </button>
        </div>
      `;

      const btnCopy = document.getElementById('btnPeekCopy');
      if (btnCopy) {
        btnCopy.addEventListener('click', async (e) => {
          e.stopPropagation();
          await window.host.writeClipboardText(data.copyValue);
          const orig = btnCopy.innerHTML;
          btnCopy.innerHTML = '<span>✓ 已复制</span>';
          setTimeout(() => { if (btnCopy) btnCopy.innerHTML = orig; }, 1000);
        });
      }

      const btnOpen = document.getElementById('btnPeekOpen');
      if (btnOpen) {
        btnOpen.addEventListener('click', (e) => {
          e.stopPropagation();
          ctx.openPlugin(data.pluginId, { payload: data.payload });
        });
      }

      if (data.asyncProbe) {
        const { pluginId, method, args } = data.asyncProbe;
        window.host.pluginCall(pluginId, method, args).then(res => {
          if (!res || !res.ok) return;
          if (state.smartPeekData !== data) return;
          const matches = res.matches || [];
          const previewEl = els.smartPeek.querySelector('.peek-preview');
          const subEl = els.smartPeek.querySelector('.peek-sub');
          const actionsEl = els.smartPeek.querySelector('.peek-actions');
          if (matches.length > 0) {
            const item = matches[0];
            const procName = item.process || '未知进程';
            if (previewEl) previewEl.innerHTML = `<span style="color:#ff6b6b">●</span> 端口 :${res.port} 已被占用`;
            if (subEl) subEl.textContent = `进程: ${procName} (PID: ${item.pid}) · 状态: ${item.state || item.proto}`;
            if (actionsEl) {
              actionsEl.innerHTML = `
                <button type="button" class="peek-btn primary" id="btnPeekCopyPid">
                  <span>复制 PID ${item.pid}</span> <kbd>Enter</kbd>
                </button>
                <button type="button" class="peek-btn warn" id="btnPeekKill">
                  <span>结束进程</span>
                </button>
                <button type="button" class="peek-btn ghost" id="btnPeekOpen">
                  <span>端口详情</span> <kbd>Tab</kbd>
                </button>
              `;
              data.copyValue = String(item.pid);
              document.getElementById('btnPeekCopyPid')?.addEventListener('click', async () => {
                await window.host.writeClipboardText(String(item.pid));
                const b = document.getElementById('btnPeekCopyPid');
                if (b) b.innerHTML = '<span>✓ 已复制</span>';
              });
              document.getElementById('btnPeekKill')?.addEventListener('click', async () => {
                if (!confirm(`确定结束进程 "${procName}" (PID ${item.pid}) 吗？此操作不可恢复。`)) return;
                const killRes = await window.host.pluginCall('port-scope', 'kill', { pid: item.pid, force: true });
                if (killRes && killRes.ok) {
                  if (previewEl) previewEl.innerHTML = `<span style="color:#2ecc71">●</span> PID ${item.pid} 已成功结束`;
                  document.getElementById('btnPeekKill')?.remove();
                }
              });
              document.getElementById('btnPeekOpen')?.addEventListener('click', () => ctx.openPlugin('port-scope'));
            }
          } else {
            if (previewEl) previewEl.innerHTML = `<span style="color:#2ecc71">●</span> 端口 :${res.port} 当前空闲未被占用`;
            if (subEl) subEl.textContent = '可直接用于本地开发与服务绑定';
          }
        }).catch(() => {});
      }
    }

    /* --- Card Context Menu --- */
    function showCardContextMenu(p, x, y) {
      state.ctxTargetPlugin = p;
      els.ctxTitle.textContent = I18N.lang === 'en' ? (p.name.en || p.name.zh) : (p.name.zh || p.name.en);
      els.ctxLaunch.hidden = !p.panel;
      els.ctxToggleText.textContent = p.enabled ? I18N.t('ctxToggleDisable') : I18N.t('ctxToggleEnable');

      els.cardContextMenu.hidden = false;
      const menuWidth = els.cardContextMenu.offsetWidth || 180;
      const menuHeight = els.cardContextMenu.offsetHeight || 140;
      const maxX = window.innerWidth - menuWidth - 8;
      const maxY = window.innerHeight - menuHeight - 8;

      els.cardContextMenu.style.left = `${Math.min(x, Math.max(8, maxX))}px`;
      els.cardContextMenu.style.top = `${Math.min(y, Math.max(8, maxY))}px`;
    }

    function hideCardContextMenu() {
      if (els.cardContextMenu) els.cardContextMenu.hidden = true;
      state.ctxTargetPlugin = null;
    }

    // Context menu event listeners
    if (els.ctxLaunch) {
      els.ctxLaunch.addEventListener('click', () => {
        const p = state.ctxTargetPlugin;
        hideCardContextMenu();
        if (p && p.panel) ctx.openPlugin(p.id);
      });
    }
    if (els.ctxConfig) {
      els.ctxConfig.addEventListener('click', () => {
        const target = state.ctxTargetPlugin;
        hideCardContextMenu();
        if (!target) return;
        state.pluginQuery = '';
        els.pluginSearch.value = '';
        els.btnPluginSearchClear.hidden = true;
        state.pluginCat = 'all';
        els.catFilter.querySelectorAll('.pill').forEach(b => b.classList.toggle('on', b.dataset.cat === 'all'));
        state.pluginStatus = 'all';
        els.statusFilter.querySelectorAll('.pill').forEach(b => b.classList.toggle('on', b.dataset.status === 'all'));

        const idx = state.plugins.findIndex(x => x.id === target.id);
        state.pluginPage = idx >= 0 ? Math.floor(idx / state.pageSize) + 1 : 1;
        state.highlightPluginId = target.id;
        ctx.setView('plugins');
      });
    }
    if (els.ctxToggle) {
      els.ctxToggle.addEventListener('click', async () => {
        const p = state.ctxTargetPlugin;
        hideCardContextMenu();
        if (!p) return;
        const res = await window.host.setPluginEnabled(p.id, !p.enabled);
        state.plugins = [...res.plugins].sort((a, b) => a.id.localeCompare(b.id));
        state.hotkeys = res.hotkeys;
        if (state.openId === p.id) { ctx.closePanel(); ctx.setView('home'); }
        renderDeck();
        if (ctx.renderPlugins) ctx.renderPlugins();
      });
    }
    if (els.ctxFolder) {
      els.ctxFolder.addEventListener('click', () => {
        const p = state.ctxTargetPlugin;
        hideCardContextMenu();
        if (p) window.host.openPluginFolder(p.id);
      });
    }

    window.addEventListener('click', e => {
      if (!e.target.closest('#cardContextMenu')) hideCardContextMenu();
    });
    window.addEventListener('contextmenu', e => {
      if (!e.target.closest('.card')) hideCardContextMenu();
    });
    window.addEventListener('scroll', () => hideCardContextMenu(), true);

    // Deck sort buttons
    if (els.deckSort) {
      els.deckSort.addEventListener('click', async e => {
        const b = e.target.closest('button[data-sort]');
        if (!b || b.dataset.sort === state.deckSort) return;
        state.deckSort = b.dataset.sort;
        renderDeck();
        await window.host.setPref('deckSort', state.deckSort);
      });
    }

    return {
      DECK_SORTS,
      renderDeck,
      visibleDeckPlugins,
      updateDeckSelection,
      useDeckTool,
      checkClipboardSmartPeek,
      hideSmartPeek,
      renderSmartPeek,
      showCardContextMenu,
      hideCardContextMenu,
    };
  }

  window.OrbitDeckView.init = init;
})();
