/* Standalone Floating Action Palette Controller */
(() => {
  const $ = id => document.getElementById(id);
  const els = {
    input: $('apInput'),
    list: $('apList'),
    closeKbd: $('apCloseKbd'),
  };

  let state = {
    plugins: [],
    workflows: [],
    config: {},
    items: [],
    filtered: [],
    index: 0,
    lang: 'zh',
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
    els.input.placeholder = lang === 'en'
      ? 'Search actions, plugins or commands…'
      : '输入动作、插件名称或命令…';
  }

  async function collectItems() {
    const items = [];
    const isZh = state.lang !== 'en';

    // 1. 跨插件管道流转 (Pipeline)
    const currentText = els.input.value.trim() || (await window.host.readClipboardText().catch(() => ''));
    if (currentText) {
      let type = 'text/plain';
      if (/^\s*[\{\[]/.test(currentText)) {
        try { JSON.parse(currentText); type = 'application/json'; } catch {}
      } else if (/^\d{10}(\d{3})?$/.test(currentText)) {
        type = 'text/timestamp';
      } else if (/^ey[A-Za-z0-9_-]+\.ey/.test(currentText)) {
        type = 'text/jwt';
      } else if (/^https?:\/\//.test(currentText)) {
        type = 'text/url';
      }

      const envelope = { type, value: currentText };
      const pipeActions = await window.host.getPipelineActions(envelope).catch(() => []);
      for (const pa of pipeActions) {
        const pTitle = isZh ? (pa.title.zh || pa.title.en) : (pa.title.en || pa.title.zh);
        items.push({
          group: isZh ? '⚡ 跨插件管道流转 (Pipeline)' : '⚡ Pipeline Transit',
          icon: '⚡',
          title: pTitle,
          sub: `${type} ➔ ${pa.pluginId}`,
          badge: 'Transit',
          searchKey: `pipeline 流转 管道 ${pTitle} ${pa.pluginId}`.toLowerCase(),
          run: () => {
            window.host.win('hide');
            window.host.openWorkbench({ view: 'panel', pluginId: pa.pluginId, payload: envelope });
          },
        });
      }
    }

    // 2. 所有已启用的工具与插件 (All Plugins)
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
        searchKey,
        run: () => {
          window.host.win('hide');
          if (p.panel) {
            window.host.openWorkbench({ view: 'panel', pluginId: p.id });
          } else if (p.actions && p.actions.length > 0) {
            const firstAct = p.actions[0];
            window.host.pluginCall(p.id, firstAct.method || firstAct.id, {}).catch(() => {});
          }
        },
      });
    }

    // 3. 插件快捷动作 (Plugin Actions)
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

    // 4. 可视化工作流 (Visual Workflows)
    if (Array.isArray(state.workflows) && state.workflows.length > 0) {
      for (const wf of state.workflows) {
        items.push({
          group: isZh ? '🔀 可视化工作流' : '🔀 Workflows',
          icon: '🔀',
          title: isZh ? `运行工作流: ${wf.name}` : `Run Workflow: ${wf.name}`,
          sub: `${(wf.nodes || []).length} 节点 · ${wf.desc || wf.id}`,
          badge: 'Workflow',
          searchKey: `workflow 工作流 ${wf.name} ${wf.desc || ''}`.toLowerCase(),
          run: async () => {
            window.host.win('hide');
            window.host.openWorkbench({ view: 'workflows', workflowId: wf.id });
          },
        });
      }
    }

    // 5. 快速导航与系统动作 (System & Navigation)
    items.push({
      group: isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation',
      icon: '🏠',
      title: isZh ? '打开工具主页 (工作台)' : 'Open Toolbox Home',
      badge: 'Workbench',
      searchKey: 'home 主页 工作台 返回'.toLowerCase(),
      run: () => {
        window.host.win('hide');
        window.host.openWorkbench({ view: 'home' });
      },
    });
    items.push({
      group: isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation',
      icon: '🧩',
      title: isZh ? '打开插件中心' : 'Plugin Center',
      badge: 'Workbench',
      searchKey: 'plugin center 插件中心 市场'.toLowerCase(),
      run: () => {
        window.host.win('hide');
        window.host.openWorkbench({ view: 'plugins' });
      },
    });
    items.push({
      group: isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation',
      icon: '🔀',
      title: isZh ? '打开工作流画布' : 'Workflow Canvas',
      badge: 'Workbench',
      searchKey: 'workflow 工作流 画布 DAG'.toLowerCase(),
      run: () => {
        window.host.win('hide');
        window.host.openWorkbench({ view: 'workflows' });
      },
    });
    items.push({
      group: isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation',
      icon: '⚙️',
      title: isZh ? '打开偏好设置' : 'Preferences',
      badge: 'Workbench',
      searchKey: 'settings 设置 偏好'.toLowerCase(),
      run: () => {
        window.host.win('hide');
        window.host.openWorkbench({ view: 'settings' });
      },
    });
    items.push({
      group: isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation',
      icon: '🔄',
      title: isZh ? '重新扫描插件' : 'Rescan Plugins',
      badge: 'Action',
      searchKey: 'rescan 重新扫描 刷新插件'.toLowerCase(),
      run: async () => {
        const res = await window.host.rescanPlugins();
        state.plugins = [...res.plugins].sort((a, b) => a.id.localeCompare(b.id));
        state.items = await collectItems();
        renderList();
      },
    });
    items.push({
      group: isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation',
      icon: '📁',
      title: isZh ? '打开通用数据存储目录' : 'Open Plugin Data Folder',
      badge: 'Folder',
      searchKey: 'data folder 存储目录 数据'.toLowerCase(),
      run: () => {
        window.host.win('hide');
        window.host.openPluginDataDir();
      },
    });
    items.push({
      group: isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation',
      icon: '📂',
      title: isZh ? '打开用户插件目录' : 'Open User Plugins Folder',
      badge: 'Folder',
      searchKey: 'user plugins folder 用户插件目录'.toLowerCase(),
      run: () => {
        window.host.win('hide');
        window.host.openUserPlugins();
      },
    });
    items.push({
      group: isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation',
      icon: '🌓',
      title: isZh ? '切换主题模式 (深色/浅色)' : 'Toggle Theme',
      badge: 'Pref',
      searchKey: 'theme 主题 浅色 深色 暗黑 模式'.toLowerCase(),
      run: async () => {
        const next = state.config.theme === 'dark' ? 'light' : 'dark';
        state.config.theme = next;
        await window.host.setPref('theme', next);
        applyTheme(next);
      },
    });
    items.push({
      group: isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation',
      icon: '🌐',
      title: isZh ? '切换界面语言 (中文 / English)' : 'Switch Language',
      badge: 'Pref',
      searchKey: 'language 语言 中文 英文 english'.toLowerCase(),
      run: async () => {
        const next = state.config.lang === 'zh' ? 'en' : 'zh';
        state.config.lang = next;
        await window.host.setPref('lang', next);
        applyLang(next);
        state.items = await collectItems();
        renderList();
      },
    });

    return items;
  }

  function renderList() {
    const q = els.input.value.trim().toLowerCase();
    state.filtered = state.items.filter(item => {
      if (!q) return true;
      if (item.title && item.title.toLowerCase().includes(q)) return true;
      if (item.sub && item.sub.toLowerCase().includes(q)) return true;
      if (item.searchKey && item.searchKey.includes(q)) return true;
      if (item.group && item.group.toLowerCase().includes(q)) return true;
      return false;
    });

    if (state.index >= state.filtered.length) {
      state.index = Math.max(0, state.filtered.length - 1);
    }

    els.list.innerHTML = '';
    if (state.filtered.length === 0) {
      els.list.innerHTML = `<div class="ap-empty">${state.lang === 'en' ? 'No matching plugins or actions' : '无匹配的插件或动作'}</div>`;
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
          <span class="ap-item-title">${escapeHtml(item.title)}</span>
          ${item.sub ? `<span class="ap-item-sub">${escapeHtml(item.sub)}</span>` : ''}
        </div>
        ${item.badge ? `<span class="ap-item-badge">${escapeHtml(item.badge)}</span>` : ''}
      `;
      row.addEventListener('click', () => {
        item.run();
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
  }

  function updateSelection() {
    const items = els.list.querySelectorAll('.ap-item');
    items.forEach((el, idx) => {
      el.classList.toggle('selected', idx === state.index);
    });
    const selectedEl = els.list.querySelector('.ap-item.selected');
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
  }

  els.closeKbd.addEventListener('click', () => {
    window.host.win('hide');
  });

  els.input.addEventListener('input', () => {
    state.index = 0;
    renderList();
  });

  window.addEventListener('keydown', e => {
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
      const item = state.filtered[state.index];
      if (item) {
        item.run();
      }
      return;
    }
  });

  window.host.onPaletteFocus(async () => {
    els.input.value = '';
    state.index = 0;
    state.items = await collectItems();
    renderList();
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
    applyTheme(state.config.theme || 'auto');
    applyLang(state.config.lang || 'zh');
    state.items = await collectItems();
    renderList();
    setTimeout(() => {
      els.input.focus();
      els.input.select();
    }, 50);
  }

  init();
})();
