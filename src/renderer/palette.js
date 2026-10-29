/* Standalone Floating Action Palette Controller */
(() => {
  const $ = id => document.getElementById(id);
  const els = {
    input: $('apInput'),
    list: $('apList'),
    closeKbd: $('apCloseKbd'),
  };

  const PS = () => window.PaletteSearch;

  let state = {
    plugins: [],
    workflows: [],
    config: {},
    items: [],
    filtered: [],
    index: 0,
    lang: 'zh',
    selectedText: null, // 划选/选中文本
    usage: {},          // usageId -> {n, t} (frecency, persisted main-side)
    payload: null,      // { text, source: selection|input|clipboard, detected, envelope, pipeActions }
  };

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark' || theme === 'light') {
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
    } else {
      root.dataset.theme = 'auto';
      root.style.colorScheme = 'light dark';
    }
  }

  function applyLang(lang) {
    state.lang = lang;
    document.body.className = `lang-${lang}`;
    if (window.I18N) window.I18N.lang = lang;
    updatePlaceholder();
  }

  function updatePlaceholder() {
    const isZh = state.lang !== 'en';
    if (state.payload && state.payload.text) {
      const preview = state.payload.text.length > 24
        ? `${state.payload.text.slice(0, 24)}…`
        : state.payload.text;
      els.input.placeholder = isZh
        ? `针对划选「${preview}」搜索处理动作或插件…`
        : `Search actions for selection "${preview}"…`;
    } else {
      els.input.placeholder = isZh
        ? '输入动作、插件名称或命令… (支持拼音)'
        : 'Search actions, plugins or commands…';
    }
  }

  function trackRun(item) {
    if (!item || !item.usageId || !window.host.bumpUsage) return;
    const u = state.usage[item.usageId] || { n: 0, t: 0 };
    u.n += 1;
    u.t = Date.now();
    state.usage[item.usageId] = u;
    window.host.bumpUsage(item.usageId)
      .then(us => { if (us && us[item.usageId]) state.usage = us; })
      .catch(() => {});
  }

  function executeItem(item) {
    if (!item) return;
    trackRun(item);
    item.run();
  }

  /* --- item builders ----------------------------------------------------- */

  /* Payload-derived recommendations. Rows are capability-level when the plugin
     declares one for the detected type ("JSON 校验与格式化", "时间戳转换") —
     that is the quick action the user is after; plugins without a matching
     capability keep the generic "send to <plugin>" row. Every row is pinned so
     the recency reshuffle cannot bury a fresh selection. */
  function buildPipelineItems(payload) {
    const isZh = state.lang !== 'en';
    const specific = []; // capability-level rows: the actual quick action
    const generic = [];  // plugin-level fallback ("send to <plugin>")
    if (!payload || !payload.pipeActions || payload.pipeActions.length === 0) return [];

    const groupLabel = payload.source === 'selection'
      ? (isZh ? '⚡ 划选直达 (Selection)' : '⚡ Selection Transit')
      : payload.source === 'input'
        ? (isZh ? '⌨️ 输入直达 (Input)' : '⌨️ Input Transit')
        : (isZh ? '📋 剪贴板直达 (Clipboard)' : '📋 Clipboard Transit');

    const badgeLabel = payload.source === 'selection'
      ? (isZh ? '划选直达' : 'Selection')
      : payload.source === 'input'
        ? (isZh ? '输入内容' : 'Input')
        : (isZh ? '剪贴板' : 'Clipboard');

    const previewText = payload.text.length > 40
      ? `${payload.text.slice(0, 40).replace(/[\r\n]+/g, ' ')}…`
      : payload.text.replace(/[\r\n]+/g, ' ');
    const typeLabel = isZh ? payload.detected.labelZh : payload.detected.labelEn;

    const openPanel = pluginId => {
      window.host.win('hide');
      window.host.openWorkbench({ view: 'panel', pluginId, payload: payload.envelope });
    };

    for (const pa of payload.pipeActions) {
      const pName = isZh ? (pa.pluginName.zh || pa.pluginId) : (pa.pluginName.en || pa.pluginId);
      const pluginRec = (state.plugins || []).find(p => p.id === pa.pluginId);
      const caps = (pluginRec && Array.isArray(pluginRec.capabilities) ? pluginRec.capabilities : [])
        .filter(c => c && c.type === payload.envelope.type);

      if (caps.length > 0) {
        for (const cap of caps) {
          const capTitle = isZh
            ? ((cap.title && (cap.title.zh || cap.title.en)) || cap.id)
            : ((cap.title && (cap.title.en || cap.title.zh)) || cap.id);
          specific.push({
            group: groupLabel,
            icon: '⚡',
            title: capTitle,
            sub: `[${typeLabel}] "${previewText}" · ${pName}`,
            badge: badgeLabel,
            usageId: `pipeline:${pa.pluginId}:${payload.envelope.type}:${cap.id}`,
            searchKey: PS().enrich(`pipeline 流转 管道 划选 选中 投递 ${capTitle} ${pName} ${pa.pluginId} ${payload.detected.labelZh} ${payload.detected.labelEn} ${payload.envelope.type}`, capTitle),
            pinned: true,
            run: () => openPanel(pa.pluginId),
          });
        }
        continue;
      }

      const pTitle = isZh ? `投递处理 ➔ ${pName}` : `Send to ➔ ${pName}`;
      generic.push({
        group: groupLabel,
        icon: '⚡',
        title: pTitle,
        sub: `[${typeLabel}] "${previewText}"`,
        badge: badgeLabel,
        usageId: `pipeline:${pa.pluginId}:${payload.envelope.type}`,
        searchKey: PS().enrich(`pipeline 流转 管道 划选 选中 投递 ${pName} ${pa.pluginId} ${payload.detected.labelZh} ${payload.detected.labelEn} ${payload.envelope.type}`, pTitle),
        pinned: true,
        run: () => openPanel(pa.pluginId),
      });
    }
    return [...specific, ...generic];
  }

  function buildStaticItems(envelope) {
    const items = [];
    const isZh = state.lang !== 'en';

    // 1. 所有已启用的工具与插件 (All Plugins)
    const enabledPlugins = (state.plugins || []).filter(p => p.enabled);
    for (const p of enabledPlugins) {
      const pName = isZh ? (p.name.zh || p.name.en) : (p.name.en || p.name.zh);
      const pDesc = isZh ? (p.desc.zh || p.desc.en) : (p.desc.en || p.desc.zh);
      const searchKey = PS().enrich([
        p.id,
        p.name.zh || '',
        p.name.en || '',
        p.desc.zh || '',
        p.desc.en || '',
        ...(p.keywords || [])
      ].join(' '), pName);

      items.push({
        group: isZh ? '🧩 工具与插件' : '🧩 Tools & Plugins',
        icon: p.iconText || '🧩',
        iconSvg: p.iconSvg || null,
        title: pName,
        sub: pDesc || p.id,
        badge: isZh ? '插件' : 'Plugin',
        usageId: `plugin:${p.id}`,
        searchKey,
        run: () => {
          window.host.win('hide');
          if (p.panel) {
            window.host.openWorkbench({
              view: 'panel',
              pluginId: p.id,
              payload: envelope || null
            });
          } else if (p.actions && p.actions.length > 0) {
            const firstAct = p.actions[0];
            window.host.pluginCall(p.id, firstAct.method || firstAct.id, {}).catch(() => {});
          }
        },
      });
    }

    // 2. 插件快捷动作 (Plugin Actions)
    for (const p of enabledPlugins) {
      if (!Array.isArray(p.actions) || p.actions.length === 0) continue;
      const pName = isZh ? (p.name.zh || p.name.en) : (p.name.en || p.name.zh);
      for (const a of p.actions) {
        const aLabel = isZh ? (a.label.zh || a.label.en) : (a.label.en || a.label.zh);
        if (p.panel && (aLabel === `打开${pName}` || aLabel === `Open ${pName}`)) continue;
        const searchKey = PS().enrich([
          p.id,
          pName,
          aLabel,
          a.key,
          ...(p.keywords || [])
        ].join(' '), `${pName} ${aLabel}`);

        items.push({
          group: isZh ? '🎯 插件快捷动作' : '🎯 Plugin Actions',
          icon: p.iconText || '⚡',
          iconSvg: p.iconSvg || null,
          title: `${pName} · ${aLabel}`,
          sub: a.method ? `调用 ${p.id}:${a.method}` : a.key,
          badge: a.hotkey || (isZh ? '动作' : 'Action'),
          usageId: `action:${p.id}:${a.key || aLabel}`,
          searchKey,
          run: async () => {
            window.host.win('hide');
            if (a.method) {
              await window.host.pluginCall(p.id, a.method, {}).catch(() => {});
            } else {
              window.host.openWorkbench({ view: 'panel', pluginId: p.id });
            }
          },
        });
      }
    }

    // 3. 可视化工作流 (Visual Workflows)
    if (Array.isArray(state.workflows) && state.workflows.length > 0) {
      for (const wf of state.workflows) {
        const title = isZh ? `运行工作流: ${wf.name}` : `Run Workflow: ${wf.name}`;
        items.push({
          group: isZh ? '🔀 可视化工作流' : '🔀 Workflows',
          icon: '🔀',
          title,
          sub: `${(wf.nodes || []).length} 节点 · ${wf.desc || wf.id}`,
          badge: 'Workflow',
          usageId: `workflow:${wf.id}`,
          searchKey: PS().enrich(`workflow 工作流 ${wf.name} ${wf.desc || ''}`, title),
          run: () => {
            window.host.win('hide');
            // run:true — 标题承诺的是“运行”，切到工作台后自动执行而不只是选中
            window.host.openWorkbench({ view: 'workflows', workflowId: wf.id, run: true });
          },
        });
      }
    }

    // 4. 快速导航与系统动作 (System & Navigation)
    const sysGroup = isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation';
    const sys = (icon, title, badge, key, usageId, run) => {
      items.push({
        group: sysGroup, icon, title, badge, usageId,
        searchKey: PS().enrich(key, title),
        run,
      });
    };
    sys('🏠', isZh ? '打开工具主页 (工作台)' : 'Open Toolbox Home', 'Workbench', 'home 主页 工作台 返回', 'sys:home',
      () => { window.host.win('hide'); window.host.openWorkbench({ view: 'home' }); });
    sys('🧩', isZh ? '打开插件中心' : 'Plugin Center', 'Workbench', 'plugin center 插件中心 市场', 'sys:plugins',
      () => { window.host.win('hide'); window.host.openWorkbench({ view: 'plugins' }); });
    sys('🔀', isZh ? '打开工作流画布' : 'Workflow Canvas', 'Workbench', 'workflow 工作流 画布 DAG', 'sys:workflows',
      () => { window.host.win('hide'); window.host.openWorkbench({ view: 'workflows' }); });
    sys('⚙️', isZh ? '打开偏好设置' : 'Preferences', 'Workbench', 'settings 设置 偏好', 'sys:settings',
      () => { window.host.win('hide'); window.host.openWorkbench({ view: 'settings' }); });
    sys('🔄', isZh ? '重新扫描插件' : 'Rescan Plugins', 'Action', 'rescan 重新扫描 刷新插件', 'sys:rescan',
      async () => {
        const res = await window.host.rescanPlugins();
        state.plugins = [...res.plugins].sort((a, b) => a.id.localeCompare(b.id));
        await refreshItems();
      });
    sys('📁', isZh ? '打开通用数据存储目录' : 'Open Plugin Data Folder', 'Folder', 'data folder 存储目录 数据', 'sys:data-dir',
      () => { window.host.win('hide'); window.host.openPluginDataDir(); });
    sys('📂', isZh ? '打开用户插件目录' : 'Open User Plugins Folder', 'Folder', 'user plugins folder 用户插件目录', 'sys:user-plugins',
      () => { window.host.win('hide'); window.host.openUserPlugins(); });
    sys('🌓', isZh ? '切换主题模式 (深色/浅色)' : 'Toggle Theme', 'Pref', 'theme 主题 浅色 深色 暗黑 模式', 'sys:theme',
      async () => {
        const next = state.config.theme === 'dark' ? 'light' : 'dark';
        state.config.theme = next;
        await window.host.setPref('theme', next);
        applyTheme(next);
      });
    sys('🌐', isZh ? '切换界面语言 (中文 / English)' : 'Switch Language', 'Pref', 'language 语言 中文 英文 english', 'sys:lang',
      async () => {
        const next = state.config.lang === 'zh' ? 'en' : 'zh';
        state.config.lang = next;
        await window.host.setPref('lang', next);
        applyLang(next);
        await refreshItems();
      });

    return items;
  }

  /* Two-phase refresh: static items render synchronously (zero IPC → instant
     first paint on summon); payload-derived recommendations re-render in a
     second pass a few ms later.
     Recommendation tiers, highest first: selection > typed payload > clipboard.
     When a selection exists the clipboard is still consulted as a second tier
     (structured content only) — the selection stays the primary payload. */
  async function refreshItems() {
    state.payload = null;
    state.items = buildStaticItems(null);
    updatePlaceholder();
    computeFiltered();
    renderList();

    // 划选 > 输入框特征文本 > 剪贴板
    let text = state.selectedText;
    let source = 'selection';
    if (!text && els.input.value.trim()) {
      const inputVal = els.input.value.trim();
      const detectedInput = window.PayloadType.detect(inputVal);
      if (detectedInput && detectedInput.type !== 'text/plain') {
        text = inputVal;
        source = 'input';
      }
    }
    const clipRaw = await window.host.readClipboardText().catch(() => '');
    const clipText = clipRaw && clipRaw.trim() ? clipRaw.trim() : '';
    if (!text && clipText) {
      text = clipText;
      source = 'clipboard';
    }

    const recs = [];
    if (text) {
      const detected = window.PayloadType.detect(text) || { type: 'text/plain', labelZh: '文本内容', labelEn: 'Text' };
      const envelope = { type: detected.type, value: text };
      // deterministic order: Map iteration order is scan order, which reads
      // as "random" to users hitting Enter on the default row
      const pipeActions = (await window.host.getPipelineActions(envelope).catch(() => []))
        .sort((a, b) => String(a.pluginId).localeCompare(String(b.pluginId)));
      state.payload = { text, source, detected, envelope, pipeActions };
      recs.push(...buildPipelineItems(state.payload));
    }

    // 第二梯队：剪贴板与主载荷不同、且是结构化内容时也给出直达推荐
    if (clipText && clipText !== text) {
      const clipDetected = window.PayloadType.detect(clipText);
      if (clipDetected && clipDetected.type !== 'text/plain') {
        const clipEnvelope = { type: clipDetected.type, value: clipText };
        const clipPipe = (await window.host.getPipelineActions(clipEnvelope).catch(() => []))
          .sort((a, b) => String(a.pluginId).localeCompare(String(b.pluginId)));
        recs.push(...buildPipelineItems({
          text: clipText,
          source: 'clipboard',
          detected: clipDetected,
          envelope: clipEnvelope,
          pipeActions: clipPipe,
        }));
      }
    }

    if (recs.length > 0) {
      state.items = [...recs, ...buildStaticItems(state.payload ? state.payload.envelope : null)];
      updatePlaceholder();
      computeFiltered();
      renderList();
    }
  }

  /* --- render -------------------------------------------------------------- */

  function computeFiltered() {
    const q = els.input.value.trim().toLowerCase();
    state.filtered = PS().filterAndRank(state.items, q, state.usage, state.lang === 'en');
  }

  function renderList() {
    if (state.index >= state.filtered.length) {
      state.index = Math.max(0, state.filtered.length - 1);
    }
    const q = els.input.value.trim().toLowerCase();

    els.list.innerHTML = '';
    if (state.filtered.length === 0) {
      els.list.innerHTML = `<div class="ap-empty">${state.lang === 'en' ? 'No matching plugins or actions' : '无匹配的插件或动作'}</div>`;
      requestPaletteResize();
      return;
    }

    let currentGroup = '';
    state.filtered.forEach((item, idx) => {
      if (item.group && item.group !== currentGroup) {
        currentGroup = item.group;
        const groupEl = document.createElement('div');
        groupEl.className = 'ap-group-title';
        groupEl.textContent = currentGroup;
        els.list.appendChild(groupEl);
      }

      const row = document.createElement('div');
      row.className = `ap-item ${idx === state.index ? 'selected' : ''}`;
      const iconHtml = item.iconSvg
        ? `<span class="ap-item-icon ap-svg">${item.iconSvg}</span>`
        : `<span class="ap-item-icon">${item.icon || '⚡'}</span>`;
      row.innerHTML = `
        <div class="ap-item-left">
          ${iconHtml}
          <span class="ap-item-title">${PS().highlightHtml(item.title, q)}</span>
          ${item.sub ? `<span class="ap-item-sub">${escapeHtml(item.sub)}</span>` : ''}
        </div>
        ${item.badge ? `<span class="ap-item-badge">${escapeHtml(item.badge)}</span>` : ''}
      `;
      row.addEventListener('click', () => {
        executeItem(item);
      });
      row.addEventListener('mousemove', () => {
        if (state.index !== idx) {
          state.index = idx;
          updateSelection();
        }
      });
      els.list.appendChild(row);
    });

    const selectedEl = els.list.querySelector('.ap-item.selected');
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
    requestPaletteResize();
  }

  function updateSelection() {
    const items = els.list.querySelectorAll('.ap-item');
    items.forEach((el, idx) => {
      el.classList.toggle('selected', idx === state.index);
    });
    const selectedEl = els.list.querySelector('.ap-item.selected');
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
  }

  /* The palette window sizes itself to its content (min 230 / max 560 set
     main-side). Measured after paint via rAF; skips sub-4px churn. */
  let lastResizeHeight = 0;
  function requestPaletteResize() {
    if (!window.host.resizePalette) return;
    requestAnimationFrame(() => {
      const pal = document.querySelector('.action-palette');
      if (!pal) return;
      const header = pal.querySelector('.ap-header');
      const list = pal.querySelector('.ap-list');
      const footer = pal.querySelector('.ap-footer');
      if (!header || !list || !footer) return;
      const desired = Math.round(
        pal.offsetTop + header.offsetHeight +
        Math.min(list.scrollHeight + 4, 400) +
        footer.offsetHeight + 14
      );
      if (Math.abs(desired - lastResizeHeight) <= 4) return;
      lastResizeHeight = desired;
      window.host.resizePalette(desired).catch(() => {});
    });
  }

  els.closeKbd.addEventListener('click', () => {
    window.host.win('hide');
  });

  let inputDebounceTimer = null;
  els.input.addEventListener('input', () => {
    state.index = 0;
    const val = els.input.value.trim();
    // 输入/清除特征文本（JSON / URL / 时间戳 / Base64 / JWT…）时重新收集管道项
    const detected = val ? window.PayloadType.detect(val) : null;
    const isPayloadShaped = !!(detected && detected.type !== 'text/plain');
    const wasPayloadInput = !!(state.payload && state.payload.source === 'input');
    if (isPayloadShaped || (wasPayloadInput && !isPayloadShaped)) {
      clearTimeout(inputDebounceTimer);
      inputDebounceTimer = setTimeout(() => refreshItems(), 120);
    } else {
      computeFiltered();
      renderList();
    }
  });

  window.addEventListener('keydown', e => {
    if (e.altKey && /^[1-9]$/.test(e.key)) {
      const item = state.filtered[Number(e.key) - 1];
      if (item) {
        e.preventDefault();
        executeItem(item);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      window.host.win('hide');
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (state.filtered.length > 0) {
        state.index = (state.index + 1) % state.filtered.length;
        updateSelection();
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (state.filtered.length > 0) {
        state.index = (state.index - 1 + state.filtered.length) % state.filtered.length;
        updateSelection();
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      executeItem(state.filtered[state.index]);
      return;
    }
  });

  window.host.onPaletteFocus(async payload => {
    els.input.value = '';
    state.index = 0;
    state.selectedText = (payload && payload.selectedText) ? String(payload.selectedText).trim() : null;
    await refreshItems();
    setTimeout(() => {
      els.input.focus();
      els.input.select();
    }, 20);
  });

  async function init() {
    const bootData = await window.host.boot();
    state.plugins = bootData.plugins || [];
    state.workflows = bootData.workflows || [];
    state.config = bootData.config || {};
    state.usage = bootData.usage || {};
    applyTheme(state.config.theme || 'auto');
    applyLang(state.config.lang || 'zh');
    await refreshItems();
    setTimeout(() => {
      els.input.focus();
      els.input.select();
    }, 50);
  }

  init();
})();
