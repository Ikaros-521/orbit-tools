/* Plugin Center Module - Catalog, Filtering, Pagination, Hotkey Binding & Dev Guide
   Manages the plugins marketplace view, category filters, enable/disable switches, and developer guide. */
(() => {
  window.OrbitPluginCenter = window.OrbitPluginCenter || {};

  function init(ctx) {
    const { state, els, I18N, escapeHtml } = ctx;

    function renderPlugins() {
      const q = (state.pluginQuery || '').trim().toLowerCase();
      const cat = state.pluginCat;
      const status = state.pluginStatus;

      const filtered = state.plugins.filter(p => {
        if (cat !== 'all' && (p.category || 'other') !== cat) return false;
        if (status === 'enabled' && !p.enabled) return false;
        if (status === 'disabled' && p.enabled) return false;
        if (q) {
          const match = [p.id, p.name?.zh, p.name?.en, p.desc?.zh, p.desc?.en, ...(p.keywords || [])]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!match.includes(q)) return false;
        }
        return true;
      });

      const totalPages = Math.ceil(filtered.length / state.pageSize) || 1;
      if (state.pluginPage > totalPages) state.pluginPage = totalPages;
      if (state.pluginPage < 1) state.pluginPage = 1;

      els.pluginMeta.textContent = I18N.t('pluginMeta', { total: state.plugins.length, shown: filtered.length });
      els.pluginEmpty.textContent = I18N.t('noPluginMatch');
      els.pluginEmpty.hidden = filtered.length > 0;
      els.paginationBar.hidden = filtered.length === 0;

      els.btnPagePrev.disabled = state.pluginPage <= 1;
      els.btnPageNext.disabled = state.pluginPage >= totalPages;
      els.pageIndicator.textContent = I18N.t('pageIndicator', { current: state.pluginPage, total: totalPages });

      const startIdx = (state.pluginPage - 1) * state.pageSize;
      const pageItems = filtered.slice(startIdx, startIdx + state.pageSize);

      els.pluginList.innerHTML = '';
      let targetRowToScroll = null;

      for (const p of pageItems) {
        const row = document.createElement('div');
        const isHighlight = state.highlightPluginId === p.id;
        row.className = 'prow' + (p.enabled ? '' : ' off') + (isHighlight ? ' highlight' : '');
        if (isHighlight) {
          targetRowToScroll = row;
          state.highlightPluginId = null;
        }

        const icon = document.createElement('span');
        icon.className = 'card-icon small';
        icon.innerHTML = p.iconSvg || escapeHtml(p.iconText);

        const mid = document.createElement('div');
        mid.className = 'prow-mid';

        const nameLine = document.createElement('div');
        nameLine.className = 'prow-name';

        const nameB = document.createElement('b');
        nameB.textContent = I18N.lang === 'en' ? (p.name.en || p.name.zh) : (p.name.zh || p.name.en);
        nameLine.append(nameB);

        const ver = document.createElement('span');
        ver.className = 'chip mono'; ver.textContent = `v${p.version}`;

        const src = document.createElement('span');
        src.className = 'chip ghost'; src.textContent = I18N.t(p.source === 'user' ? 'sourceUser' : 'sourceBuiltin');

        const catKey = p.category === 'media' ? 'catMedia' : p.category === 'system' ? 'catSystem' : p.category === 'dev' ? 'catDev' : 'catOther';
        const catChip = document.createElement('span');
        catChip.className = 'chip ghost';
        catChip.textContent = I18N.t(catKey);

        nameLine.append(ver, src, catChip);

        const btnFolder = document.createElement('button');
        btnFolder.type = 'button';
        btnFolder.className = 'btn ghost small';
        btnFolder.title = I18N.t('openFolder');
        btnFolder.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> <span>${I18N.t('openFolder')}</span>`;
        btnFolder.addEventListener('click', () => window.host.openPluginFolder(p.id));
        nameLine.append(btnFolder);

        if (p.loadError) {
          const err = document.createElement('span');
          err.className = 'chip warn'; err.textContent = `${I18N.t('loadError')}: ${p.loadError}`; err.title = p.loadError;
          nameLine.append(err);
        }

        const desc = document.createElement('div');
        desc.className = 'prow-desc';
        desc.textContent = I18N.lang === 'en' ? (p.desc.en || p.desc.zh) : (p.desc.zh || p.desc.en);
        mid.append(nameLine, desc);

        if (p.actions.length) {
          const acts = document.createElement('div');
          acts.className = 'prow-acts';
          const label = document.createElement('span');
          label.className = 'prow-acts-label'; label.textContent = I18N.t('actions');
          acts.append(label);
          for (const a of p.actions) {
            const aLabel = document.createElement('span');
            aLabel.className = 'prow-act-name';
            aLabel.textContent = I18N.lang === 'en' ? (a.label.en || a.label.zh) : (a.label.zh || a.label.en);
            acts.append(aLabel, ctx.hotkeyEditor({
              initial: a.hotkey,
              allowClear: true,
              onApply: async accel => {
                const res = await window.host.setPluginHotkey(a.key, accel);
                if (res.ok) {
                  a.hotkey = res.hotkey || null;
                  state.hotkeys = await window.host.hotkeys();
                  ctx.renderDeck();
                  renderPlugins();
                }
                return res;
              },
            }));
            const rowHk = ctx.hotkeyRow(a.key);
            if (rowHk && !rowHk.ok) {
              const chip = document.createElement('span');
              chip.className = 'chip warn';
              chip.textContent = rowHk.conflictKey
                ? I18N.t('conflictWith', { name: ctx.labelForKey(rowHk.conflictKey) })
                : I18N.t('hotkeyBad');
              acts.append(chip);
            }
          }
          mid.append(acts);
        }

        const sw = document.createElement('button');
        sw.type = 'button';
        sw.className = 'switch' + (p.enabled ? ' on' : '');
        sw.setAttribute('role', 'switch');
        sw.setAttribute('aria-checked', String(p.enabled));
        sw.addEventListener('click', async () => {
          const res = await window.host.setPluginEnabled(p.id, !p.enabled);
          state.plugins = [...res.plugins].sort((a, b) => a.id.localeCompare(b.id));
          state.hotkeys = res.hotkeys;
          if (state.openId === p.id) { ctx.closePanel(); ctx.setView('home'); }
          ctx.renderDeck();
          renderPlugins();
        });

        row.append(icon, mid, sw);
        els.pluginList.appendChild(row);
      }

      if (targetRowToScroll) {
        setTimeout(() => {
          targetRowToScroll.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
      }
    }

    // Filter and search listeners
    els.pluginSearch.addEventListener('input', () => {
      state.pluginQuery = els.pluginSearch.value;
      els.btnPluginSearchClear.hidden = !state.pluginQuery;
      state.pluginPage = 1;
      renderPlugins();
    });
    els.btnPluginSearchClear.addEventListener('click', () => {
      els.pluginSearch.value = '';
      state.pluginQuery = '';
      els.btnPluginSearchClear.hidden = true;
      state.pluginPage = 1;
      renderPlugins();
      els.pluginSearch.focus();
    });
    els.catFilter.addEventListener('click', e => {
      const b = e.target.closest('button[data-cat]');
      if (!b) return;
      els.catFilter.querySelectorAll('.pill').forEach(x => x.classList.toggle('on', x === b));
      state.pluginCat = b.dataset.cat;
      state.pluginPage = 1;
      renderPlugins();
    });
    els.statusFilter.addEventListener('click', e => {
      const b = e.target.closest('button[data-status]');
      if (!b) return;
      els.statusFilter.querySelectorAll('.pill').forEach(x => x.classList.toggle('on', x === b));
      state.pluginStatus = b.dataset.status;
      state.pluginPage = 1;
      renderPlugins();
    });
    els.btnPagePrev.addEventListener('click', () => {
      if (state.pluginPage > 1) {
        state.pluginPage--;
        renderPlugins();
      }
    });
    els.btnPageNext.addEventListener('click', () => {
      state.pluginPage++;
      renderPlugins();
    });

    // Dev guide view events
    if (els.btnOpenDevGuide) els.btnOpenDevGuide.addEventListener('click', () => ctx.setView('dev-guide'));
    if (els.btnGotoDevGuide) els.btnGotoDevGuide.addEventListener('click', () => ctx.setView('dev-guide'));
    if (els.btnBackFromDevGuide) els.btnBackFromDevGuide.addEventListener('click', () => ctx.setView('plugins'));

    const openSkillsRepo = () => window.host.openExternal('https://github.com/Ikaros-521/orbit-plugin-developer');
    if (els.btnOpenDevSkillsRepo) els.btnOpenDevSkillsRepo.addEventListener('click', openSkillsRepo);
    if (els.btnOpenDevSkillsRepo2) els.btnOpenDevSkillsRepo2.addEventListener('click', openSkillsRepo);

    if (els.btnOpenDocInBrowser) {
      els.btnOpenDocInBrowser.addEventListener('click', () => {
        window.host.openExternal('https://github.com/Ikaros-521/orbit-tools/blob/main/docs/plugin-guide.md');
      });
    }

    let promptCopyTimer = null;
    if (els.btnCopyPrompt && els.samplePrompt) {
      els.btnCopyPrompt.addEventListener('click', async () => {
        await navigator.clipboard.writeText(els.samplePrompt.textContent.trim());
        const orig = els.btnCopyPrompt.textContent;
        els.btnCopyPrompt.textContent = I18N.t('promptCopied');
        els.btnCopyPrompt.style.color = 'var(--amber)';
        clearTimeout(promptCopyTimer);
        promptCopyTimer = setTimeout(() => {
          els.btnCopyPrompt.textContent = orig;
          els.btnCopyPrompt.style.color = '';
        }, 1200);
      });
    }

    if (els.btnOpenUserPluginsFromGuide) {
      els.btnOpenUserPluginsFromGuide.addEventListener('click', () => window.host.openUserPlugins());
    }
    if (els.btnRescanFromGuide) {
      els.btnRescanFromGuide.addEventListener('click', async () => {
        const res = await window.host.rescanPlugins();
        state.plugins = [...res.plugins].sort((a, b) => a.id.localeCompare(b.id));
        state.hotkeys = res.hotkeys;
        ctx.renderDeck();
        renderPlugins();
        if (ctx.renderSettings) ctx.renderSettings();
        const orig = els.btnRescanFromGuide.textContent;
        els.btnRescanFromGuide.textContent = '✓ 扫描完成';
        setTimeout(() => { els.btnRescanFromGuide.textContent = orig; }, 1200);
      });
    }

    return {
      renderPlugins,
    };
  }

  window.OrbitPluginCenter.init = init;
})();
