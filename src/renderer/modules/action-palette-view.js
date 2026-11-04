/* Action Palette View Module - In-Window Ctrl+K Quick Summon Drawer
   Manages action search, pipeline payload routing, plugin quick actions, workflows, and keyboard navigation. */
(() => {
  window.OrbitActionPaletteView = window.OrbitActionPaletteView || {};

  function matchHotkey(e, targetAccel, accelFromEvent) {
    if (!targetAccel) return false;
    const current = accelFromEvent(e);
    if (!current) return false;
    return current.toLowerCase() === targetAccel.toLowerCase();
  }

  function init(ctx) {
    const { state, els, I18N, escapeHtml, accelFromEvent } = ctx;

    async function collectActionPaletteItems() {
      const items = [];
      const lang = I18N.lang;
      const isZh = lang !== 'en';

      // 1. 正在浏览的上下文插件
      const activePlugin = (state.view === 'panel' && state.plugins.find(p => p.id === state.openId))
        || state.ctxTargetPlugin
        || ctx.getHoveredPlugin();

      if (activePlugin) {
        const pName = isZh ? (activePlugin.name.zh || activePlugin.name.en) : (activePlugin.name.en || activePlugin.name.zh);
        items.push({
          group: isZh ? `当前插件 · ${pName}` : `Current Plugin · ${pName}`,
          icon: '📂',
          iconSvg: activePlugin.iconSvg || null,
          title: isZh ? '打开插件安装目录' : 'Open Plugin Folder',
          sub: activePlugin.root || '',
          badge: 'Folder',
          usageId: `ctx:${activePlugin.id}:folder`,
          searchKey: window.PaletteSearch.enrich(`${pName} folder 插件目录 文件夹 ${activePlugin.id}`, isZh ? '打开插件安装目录' : 'Open Plugin Folder'),
          run: () => window.host.openPluginFolder(activePlugin.id),
        });
        items.push({
          group: isZh ? `当前插件 · ${pName}` : `Current Plugin · ${pName}`,
          icon: '📋',
          title: isZh ? '复制插件 ID' : 'Copy Plugin ID',
          sub: activePlugin.id,
          badge: 'Copy',
          usageId: `ctx:${activePlugin.id}:copyid`,
          searchKey: window.PaletteSearch.enrich(`${pName} id 复制 标识 ${activePlugin.id}`, isZh ? '复制插件 ID' : 'Copy Plugin ID'),
          run: () => window.host.writeClipboardText(activePlugin.id),
        });
      }

      // 2. 跨插件管道流转 (Pipeline)
      let windowSel = '';
      try { windowSel = window.getSelection ? window.getSelection().toString().trim() : ''; } catch {}
      const currentText = windowSel || els.search.value.trim() || (await window.host.readClipboardText().catch(() => ''));
      const isFromSel = !!windowSel;
      if (currentText) {
        const detected = window.PayloadType.detect(currentText);
        const type = detected ? detected.type : 'text/plain';

        const envelope = { type, value: currentText };
        const pipeActions = (await window.host.getPipelineActions(envelope).catch(() => []))
          .sort((a, b) => String(a.pluginId).localeCompare(String(b.pluginId)));
        const groupTitle = isZh
          ? (isFromSel ? '⚡ 划选内容管道流转 (Selection)' : '⚡ 跨插件管道流转 (Pipeline)')
          : (isFromSel ? '⚡ Selection Transit' : '⚡ Pipeline Transit');
        for (const pa of pipeActions) {
          const pTitle = isZh ? (pa.title.zh || pa.title.en) : (pa.title.en || pa.title.zh);
          items.push({
            group: groupTitle,
            icon: '⚡',
            title: pTitle,
            sub: `${type} ➔ ${pa.pluginId}`,
            badge: isFromSel ? (isZh ? '划选直达' : 'Selection') : 'Transit',
            usageId: `pipeline:${pa.pluginId}:${type}`,
            searchKey: window.PaletteSearch.enrich(`pipeline 流转 管道 划选 ${pTitle} ${pa.pluginId}`, pTitle),
            run: () => ctx.openPlugin(pa.pluginId, { payload: envelope }),
          });
        }
      }

      // 3. 所有已启用的工具与插件 (All Plugins)
      const enabledPlugins = (state.plugins || []).filter(p => p.enabled);
      for (const p of enabledPlugins) {
        const pName = isZh ? (p.name.zh || p.name.en) : (p.name.en || p.name.zh);
        const pDesc = isZh ? (p.desc.zh || p.desc.en) : (p.desc.en || p.desc.zh);
        const searchKey = [
          p.id,
          p.name.zh || '',
          p.name.en || '',
          p.desc.zh || '',
          p.desc.en || '',
          ...(p.keywords || [])
        ].join(' ').toLowerCase();

        items.push({
          group: isZh ? '🧩 工具与插件' : '🧩 Tools & Plugins',
          icon: p.iconText || '🧩',
          iconSvg: p.iconSvg || null,
          title: pName,
          sub: pDesc || p.id,
          badge: isZh ? '插件' : 'Plugin',
          usageId: `plugin:${p.id}`,
          searchKey: window.PaletteSearch.enrich(searchKey, pName),
          run: () => {
            if (p.panel) {
              ctx.openPlugin(p.id);
            } else if (p.actions && p.actions.length > 0) {
              const firstAct = p.actions[0];
              window.host.pluginCall(p.id, firstAct.method || firstAct.id, {}).catch(() => {});
            }
          },
        });
      }

      // 4. 插件快捷动作 (Plugin Actions)
      for (const p of enabledPlugins) {
        if (!Array.isArray(p.actions) || p.actions.length === 0) continue;
        const pName = isZh ? (p.name.zh || p.name.en) : (p.name.en || p.name.zh);
        for (const a of p.actions) {
          const aLabel = isZh ? (a.label.zh || a.label.en) : (a.label.en || a.label.zh);
          if (p.panel && (aLabel === `打开${pName}` || aLabel === `Open ${pName}`)) continue;
          const searchKey = [
            p.id,
            pName,
            aLabel,
            a.key,
            ...(p.keywords || [])
          ].join(' ').toLowerCase();

          items.push({
            group: isZh ? '🎯 插件快捷动作' : '🎯 Plugin Actions',
            icon: p.iconText || '⚡',
            iconSvg: p.iconSvg || null,
            title: `${pName} · ${aLabel}`,
            sub: a.method ? `调用 ${p.id}:${a.method}` : a.key,
            badge: a.hotkey || (isZh ? '动作' : 'Action'),
            usageId: `action:${p.id}:${a.key || aLabel}`,
            searchKey: window.PaletteSearch.enrich(searchKey, `${pName} ${aLabel}`),
            run: async () => {
              if (a.method) {
                await window.host.pluginCall(p.id, a.method, {}).catch(() => {});
              } else {
                ctx.openPlugin(p.id);
              }
            },
          });
        }
      }

      // 5. 可视化工作流 (Visual Workflows)
      if (Array.isArray(state.workflows) && state.workflows.length > 0) {
        for (const wf of state.workflows) {
          const wfTitle = isZh ? `运行工作流: ${wf.name}` : `Run Workflow: ${wf.name}`;
          items.push({
            group: isZh ? '🔀 可视化工作流' : '🔀 Workflows',
            icon: '🔀',
            title: wfTitle,
            sub: `${(wf.nodes || []).length} 节点 · ${wf.desc || wf.id}`,
            badge: 'Workflow',
            usageId: `workflow:${wf.id}`,
            searchKey: window.PaletteSearch.enrich(`workflow 工作流 ${wf.name} ${wf.desc || ''}`, wfTitle),
            run: async () => {
              ctx.setView('workflows');
              if (typeof ctx.selectWorkflow === 'function') await ctx.selectWorkflow(wf.id);
              if (state.currentWorkflowId === wf.id && typeof ctx.runCurrentWorkflow === 'function') {
                ctx.runCurrentWorkflow();
              }
            },
          });
        }
      }

      // 6. 快速导航与系统动作 (System & Navigation)
      const sysGroup = isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation';
      const sys = (icon, title, badge, key, usageId, run) => {
        items.push({
          group: sysGroup, icon, title, badge, usageId,
          searchKey: window.PaletteSearch.enrich(key, title),
          run,
        });
      };
      sys('🏠', isZh ? '返回工具主页' : 'Go to Home', 'View', 'home 主页 返回', 'sys:home',
        () => { ctx.closePanel(); ctx.setView('home'); });
      sys('🧩', isZh ? '打开插件中心' : 'Plugin Center', 'View', 'plugin center 插件中心 市场', 'sys:plugins',
        () => { ctx.closePanel(); ctx.setView('plugins'); });
      sys('🔀', isZh ? '打开工作流画布' : 'Workflow Canvas', 'View', 'workflow 工作流 画布 DAG', 'sys:workflows',
        () => { ctx.closePanel(); ctx.setView('workflows'); });
      sys('⚙️', isZh ? '打开偏好设置' : 'Preferences', 'View', 'settings 设置 偏好', 'sys:settings',
        () => { ctx.closePanel(); ctx.setView('settings'); });
      sys('🚀', isZh ? '检查软件更新' : 'Check for Updates', 'System', 'update 更新 检查更新 版本 升级 upgrade', 'sys:update',
        () => ctx.checkForUpdates(true));
      sys('🔄', isZh ? '重新扫描插件' : 'Rescan Plugins', 'Action', 'rescan 重新扫描 刷新插件', 'sys:rescan',
        async () => {
          const res = await window.host.rescanPlugins();
          state.plugins = [...res.plugins].sort((a, b) => a.id.localeCompare(b.id));
          state.hotkeys = res.hotkeys;
          if (ctx.renderDeck) ctx.renderDeck();
          if (ctx.renderPlugins) ctx.renderPlugins();
          if (ctx.renderSettings) ctx.renderSettings();
        });
      sys('📁', isZh ? '打开通用数据存储目录' : 'Open Plugin Data Folder', 'Folder', 'data folder 存储目录 数据', 'sys:data-dir',
        () => window.host.openPluginDataDir());
      sys('📂', isZh ? '打开用户插件目录' : 'Open User Plugins Folder', 'Folder', 'user plugins folder 用户插件目录', 'sys:user-plugins',
        () => window.host.openUserPlugins());
      sys('🌓', isZh ? '切换主题模式 (深色/浅色)' : 'Toggle Theme', 'Pref', 'theme 主题 浅色 深色 暗黑 模式', 'sys:theme',
        async () => {
          const next = state.config.theme === 'dark' ? 'light' : 'dark';
          state.config.theme = next;
          await window.host.setPref('theme', next);
          ctx.applyTheme(next);
        });
      sys('🌐', isZh ? '切换界面语言 (中文 / English)' : 'Switch Language', 'Pref', 'language 语言 中文 英文 english', 'sys:lang',
        async () => {
          const next = state.config.lang === 'zh' ? 'en' : 'zh';
          state.config.lang = next;
          await window.host.setPref('lang', next);
          ctx.applyLang(next);
        });

      return items;
    }

    async function openActionPalette() {
      if (state.actionPaletteOpen) {
        els.apInput.focus();
        els.apInput.select();
        return;
      }
      state.actionPaletteOpen = true;
      els.actionPaletteMask.hidden = false;
      els.apInput.value = '';
      state.actionPaletteIndex = 0; // collect 完成前先复位，闪烁期按键不再错位
      state.actionPaletteItems = await collectActionPaletteItems();
      renderActionPaletteList();
      setTimeout(() => {
        els.apInput.focus();
        els.apInput.select();
      }, 20);
    }

    function closeActionPalette() {
      if (!state.actionPaletteOpen) return;
      state.actionPaletteOpen = false;
      els.actionPaletteMask.hidden = true;
      state.actionPaletteItems = [];
      state.actionPaletteFiltered = [];
      // 清掉上次的列表 DOM：重开时 collect 的 IPC 往返期间旧列表会闪现，
      // 且 index 归零晚于显示会导致闪烁期按键索引错位
      if (els.apList) els.apList.innerHTML = '';
    }

    function bumpUsageId(id) {
      if (!id || !window.host.bumpUsage) return;
      const u = state.usage[id] || { n: 0, t: 0 };
      u.n += 1;
      u.t = Date.now();
      state.usage[id] = u;
      window.host.bumpUsage(id)
        .then(us => { if (us && us[id]) state.usage = us; })
        .catch(() => {});
    }

    function trackActionRun(item) {
      bumpUsageId(item && item.usageId);
    }

    function executeActionPaletteItem(item) {
      if (!item) return;
      trackActionRun(item);
      closeActionPalette();
      item.run();
    }

    function renderActionPaletteList() {
      const q = els.apInput.value.trim().toLowerCase();
      state.actionPaletteFiltered = window.PaletteSearch.filterAndRank(
        state.actionPaletteItems, q, state.usage, I18N.lang === 'en'
      );

      if (state.actionPaletteIndex >= state.actionPaletteFiltered.length) {
        state.actionPaletteIndex = Math.max(0, state.actionPaletteFiltered.length - 1);
      }

      els.apList.innerHTML = '';
      if (state.actionPaletteFiltered.length === 0) {
        els.apList.innerHTML = `<div class="ap-empty">${I18N.lang === 'en' ? 'No matching plugins or actions' : '无匹配的插件或动作'}</div>`;
        return;
      }

      let currentGroup = '';
      state.actionPaletteFiltered.forEach((item, idx) => {
        if (item.group && item.group !== currentGroup) {
          currentGroup = item.group;
          const groupEl = document.createElement('div');
          groupEl.className = 'ap-group-title';
          groupEl.textContent = currentGroup;
          els.apList.appendChild(groupEl);
        }

        const row = document.createElement('div');
        row.className = `ap-item ${idx === state.actionPaletteIndex ? 'selected' : ''}`;
        const iconHtml = item.iconSvg
          ? `<span class="ap-item-icon ap-svg">${item.iconSvg}</span>`
          : `<span class="ap-item-icon">${item.icon || '⚡'}</span>`;
        row.innerHTML = `
          <div class="ap-item-left">
            ${iconHtml}
            <span class="ap-item-title">${window.PaletteSearch.highlightHtml(item.title, q)}</span>
            ${item.sub ? `<span class="ap-item-sub">${escapeHtml(item.sub)}</span>` : ''}
          </div>
          ${item.badge ? `<span class="ap-item-badge">${escapeHtml(item.badge)}</span>` : ''}
        `;
        row.addEventListener('click', () => {
          executeActionPaletteItem(item);
        });
        row.addEventListener('mousemove', () => {
          if (state.actionPaletteIndex !== idx) {
            state.actionPaletteIndex = idx;
            updateActionPaletteSelection();
          }
        });
        els.apList.appendChild(row);
      });

      const selectedEl = els.apList.querySelector('.ap-item.selected');
      if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
    }

    function updateActionPaletteSelection() {
      const items = els.apList.querySelectorAll('.ap-item');
      items.forEach((el, idx) => {
        el.classList.toggle('selected', idx === state.actionPaletteIndex);
      });
      const selectedEl = els.apList.querySelector('.ap-item.selected');
      if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
    }

    if (els.actionPaletteMask) {
      els.actionPaletteMask.addEventListener('click', e => {
        if (e.target === els.actionPaletteMask) closeActionPalette();
      });
    }
    if (els.apCloseKbd) {
      els.apCloseKbd.addEventListener('click', closeActionPalette);
    }
    if (els.apInput) {
      els.apInput.addEventListener('input', () => {
        state.actionPaletteIndex = 0;
        renderActionPaletteList();
      });
    }

    return {
      matchHotkey: (e, targetAccel) => matchHotkey(e, targetAccel, accelFromEvent),
      openActionPalette,
      closeActionPalette,
      executeActionPaletteItem,
      bumpUsageId,
    };
  }

  window.OrbitActionPaletteView.init = init;
  window.OrbitActionPaletteView.matchHotkey = matchHotkey;
})();
