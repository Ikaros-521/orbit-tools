/* Orbit Toolbox - Main Renderer Application Shell
   Coordinates theme, language, panel lifecycle, view routing, and child modules. */
(() => {
  const $ = id => document.getElementById(id);
  const t = (k, p) => window.I18N.t(k, p);
  const escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const els = {
    tabs: $('tabs'),
    viewHome: $('viewHome'), viewPanel: $('viewPanel'), viewPlugins: $('viewPlugins'),
    viewSettings: $('viewSettings'), viewWorkflows: $('viewWorkflows'), viewDevGuide: $('viewDevGuide'),
    search: $('search'), deck: $('deck'), empty: $('empty'), deckMeta: $('deckMeta'),
    deckSort: $('deckSort'),
    smartPeek: $('smartPeek'),
    panelHost: $('panelHost'), panelName: $('panelName'), panelIcon: $('panelIcon'), panelMeta: $('panelMeta'),
    btnBack: $('btnBack'),
    pluginList: $('pluginList'), pluginMeta: $('pluginMeta'),
    hotkeyCtrl: $('hotkeyCtrl'), actionPaletteHotkeyCtrl: $('actionPaletteHotkeyCtrl'),
    aboutVer: $('aboutVer'), hotHint: $('hotHint'), apHint: $('apHint'),
    langSeg: $('langSeg'), langSeg2: $('langSeg2'), themeSeg: $('themeSeg'), themeSeg2: $('themeSeg2'), winctl: $('winctl'),
    catFilter: $('catFilter'), statusFilter: $('statusFilter'),
    pluginSearch: $('pluginSearch'), btnPluginSearchClear: $('btnPluginSearchClear'),
    pluginEmpty: $('pluginEmpty'), paginationBar: $('paginationBar'),
    btnPagePrev: $('btnPagePrev'), btnPageNext: $('btnPageNext'), pageIndicator: $('pageIndicator'),
    cardContextMenu: $('cardContextMenu'), ctxTitle: $('ctxTitle'), ctxLaunch: $('ctxLaunch'),
    ctxConfig: $('ctxConfig'), ctxToggle: $('ctxToggle'), ctxToggleText: $('ctxToggleText'), ctxFolder: $('ctxFolder'),
    userPluginsPath: $('userPluginsPath'), userPluginsBadge: $('userPluginsBadge'),
    btnChooseUserPlugins: $('btnChooseUserPlugins'), btnResetUserPlugins: $('btnResetUserPlugins'),
    btnOpenUserPlugins: $('btnOpenUserPlugins'),
    userPluginsPath2: $('userPluginsPath2'), userPluginsBadge2: $('userPluginsBadge2'),
    btnChooseUserPluginsHeader: $('btnChooseUserPluginsHeader'), btnResetUserPluginsHeader: $('btnResetUserPluginsHeader'),
    btnOpenUserPluginsHeader: $('btnOpenUserPluginsHeader'),
    pluginDataPath: $('pluginDataPath'), pluginDataBadge: $('pluginDataBadge'),
    btnChoosePluginData: $('btnChoosePluginData'), btnResetPluginData: $('btnResetPluginData'),
    btnOpenPluginData: $('btnOpenPluginData'),
    btnOpenDevGuide: $('btnOpenDevGuide'), btnGotoDevGuide: $('btnGotoDevGuide'), btnBackFromDevGuide: $('btnBackFromDevGuide'),
    btnOpenDevSkillsRepo: $('btnOpenDevSkillsRepo'), btnOpenDevSkillsRepo2: $('btnOpenDevSkillsRepo2'),
    btnOpenDocInBrowser: $('btnOpenDocInBrowser'), btnCopyPrompt: $('btnCopyPrompt'), samplePrompt: $('samplePrompt'),
    guideUserPluginsPath: $('guideUserPluginsPath'), btnOpenUserPluginsFromGuide: $('btnOpenUserPluginsFromGuide'),
    btnRescanFromGuide: $('btnRescanFromGuide'),
    wfSelect: $('wfSelect'), btnWfNew: $('btnWfNew'), btnWfSave: $('btnWfSave'), btnWfDelete: $('btnWfDelete'),
    wfTestInput: $('wfTestInput'), btnWfRun: $('btnWfRun'), wfLibList: $('wfLibList'),
    wfNameInput: $('wfNameInput'), wfDescInput: $('wfDescInput'), wfEnabledToggle: $('wfEnabledToggle'),
    wfLibSearch: $('wfLibSearch'),
    wfInspector: $('wfInspector'), wfInspType: $('wfInspType'), wfInspClose: $('wfInspClose'), wfInspBody: $('wfInspBody'),
    wfSidebar: $('wfSidebar'), wfSidebarResizer: $('wfSidebarResizer'), wfConsoleResizer: $('wfConsoleResizer'),
    wfCanvasArea: $('wfCanvasArea'), wfCanvasViewport: $('wfCanvasViewport'), wfCanvasControls: $('wfCanvasControls'),
    wfSvgLayer: $('wfSvgLayer'), wfNodesContainer: $('wfNodesContainer'),
    btnWfZoomIn: $('btnWfZoomIn'), btnWfZoomOut: $('btnWfZoomOut'), btnWfResetView: $('btnWfResetView'), btnWfFitView: $('btnWfFitView'),
    btnWfUndo: $('btnWfUndo'), btnWfRedo: $('btnWfRedo'),
    wfConsole: $('wfConsole'), wfConsoleBody: $('wfConsoleBody'), btnWfCopyConsole: $('btnWfCopyConsole'), btnWfClearConsole: $('btnWfClearConsole'),
    actionPaletteMask: $('actionPaletteMask'), apInput: $('apInput'), apList: $('apList'), apCloseKbd: $('apCloseKbd'),
    btnCheckUpdate: $('btnCheckUpdate'), updateBadge: $('updateBadge'), chkAutoUpdate: $('chkAutoUpdate'),
    updateModalMask: $('updateModalMask'), updatePubDate: $('updatePubDate'), updateCurVer: $('updateCurVer'),
    updateNewVer: $('updateNewVer'), updateNotesBox: $('updateNotesBox'), updateDownloadArea: $('updateDownloadArea'),
    updateProgressFill: $('updateProgressFill'), updateProgressText: $('updateProgressText'),
    updateProgressSpeed: $('updateProgressSpeed'), updateErrorText: $('updateErrorText'),
    btnCancelDownload: $('btnCancelDownload'), btnUpdateCancel: $('btnUpdateCancel'),
    btnUpdateOpenBrowser: $('btnUpdateOpenBrowser'), btnUpdateAction: $('btnUpdateAction'),
    btnUpdateModalClose: $('btnUpdateModalClose'),
  };

  const state = {
    platform: 'unknown',
    appVersion: '0.0.0',
    plugins: [],
    config: { lang: 'zh', theme: 'auto', hotkey: 'Alt+Space', actionPaletteHotkey: 'Ctrl+K' },
    hotkeys: [],
    view: 'home',
    query: '',
    openId: null,
    mounted: null,
    pluginCat: 'all',
    pluginStatus: 'all',
    pluginQuery: '',
    pluginPage: 1,
    pageSize: 8,
    highlightPluginId: null,
    ctxTargetPlugin: null,
    userPluginsDir: '',
    defaultUserPluginsDir: '',
    isCustomUserPluginsDir: false,
    pluginDataDir: '',
    defaultPluginDataDir: '',
    isCustomPluginDataDir: false,
    deckIndex: 0,
    deckSort: 'default',
    workflows: [],
    workflowsInited: false,
    currentWorkflowId: null,
    wfConnectingFrom: null,
    wfLibQuery: '',
    smartPeekData: null,
    actionPaletteOpen: false,
    actionPaletteItems: [],
    actionPaletteFiltered: [],
    actionPaletteIndex: 0,
    usage: {},
    updateInfo: null,
    isCheckingUpdate: false,
    downloadingUpdate: false,
    downloadedFilePath: null,
  };

  let hoveredPlugin = null;

  function labelForKey(key) {
    if (key === 'host') return t('hostSummon');
    if (key === 'action-palette') return t('actionPaletteSummon') || '动作抽屉呼出';
    const row = state.hotkeys.find(r => r.key === key);
    return (row && row.actionLabel) ? row.actionLabel : key;
  }
  const hotkeyRow = key => state.hotkeys.find(r => r.key === key);

  /* --- panel registry --- */
  const panelDefs = new Map();
  let pendingPlugin = null;
  const scriptLoads = new Map();

  window.Toolbox = {
    panel(def) {
      if (pendingPlugin) panelDefs.set(pendingPlugin, def);
    },
  };

  /* --- theme & language --- */
  function applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    const themeButtons = document.querySelectorAll('#themeSeg button, #themeSeg2 button');
    for (const b of themeButtons) {
      const match = b.dataset.theme === mode;
      b.classList.toggle('on', match);
      b.setAttribute('aria-pressed', match ? 'true' : 'false');
    }
  }

  function applyLang(lang) {
    window.I18N.setLang(lang);
    document.body.className = document.body.className.replace(/\blang-\w+\b/, `lang-${lang}`);
    const langButtons = document.querySelectorAll('#langSeg button, #langSeg2 button');
    for (const b of langButtons) {
      const match = b.dataset.lang === lang;
      b.classList.toggle('on', match);
      b.setAttribute('aria-pressed', match ? 'true' : 'false');
    }
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.dataset.i18n;
      if (k) el.textContent = t(k);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const k = el.dataset.i18nPh;
      if (k) el.placeholder = t(k);
    });
    if (deckController) deckController.renderDeck();
    if (pluginCenterController) pluginCenterController.renderPlugins();
    if (settingsController) settingsController.renderSettings();
    const btnMax = document.getElementById('btnMax');
    if (btnMax) {
      const isMax = document.body.classList.contains('is-maximized') || document.body.classList.contains('is-fullscreen');
      btnMax.title = isMax ? (lang === 'zh' ? '向下还原' : 'Restore') : (lang === 'zh' ? '最大化' : 'Maximize');
      btnMax.setAttribute('aria-label', btnMax.title);
    }
  }

  /* --- plugin panel lifecycle --- */
  async function openPlugin(id, opts = {}) {
    const p = state.plugins.find(x => x.id === id);
    if (!p) return;
    if (!p.enabled) {
      const res = await window.host.setPluginEnabled(p.id, true);
      state.plugins = [...res.plugins].sort((a, b) => a.id.localeCompare(b.id));
      state.hotkeys = res.hotkeys;
      if (pluginCenterController) pluginCenterController.renderPlugins();
    }
    if (!p.panel) return;
    state.openId = id;
    els.panelName.textContent = window.I18N.lang === 'en' ? (p.name.en || p.name.zh) : (p.name.zh || p.name.en);
    els.panelIcon.innerHTML = p.iconSvg || escapeHtml(p.iconText);
    els.panelMeta.textContent = `${p.id} · v${p.version}`;
    setView('panel');
    els.panelHost.innerHTML = '<div class="panel-loading"><div class="spinner"></div></div>';

    const unsubs = [];
    const mount = async () => {
      const def = await loadPanelScript(p);
      if (state.openId !== id) return;
      els.panelHost.innerHTML = '';
      const el = document.createElement('div');
      el.className = 'panel-root panel-view';
      els.panelHost.appendChild(el);
      const ctx = {
        plugin: p,
        el,
        payload: opts.payload || null,
        platform: state.platform,
        lang: window.I18N.lang,
        call: (method, args) => window.host.pluginCall(p.id, method, args).then(r => {
          if (!r.ok) throw new Error(r.error);
          return r.data;
        }),
        onEvent: (channel, fn) => {
          unsubs.push(window.host.onPluginEvent(p.id, ev => { if (ev.channel === channel) fn(ev.payload); }));
        },
        openExternal: url => window.host.openExternal(url),
        savePng: () => window.host.chooseSavePng(),
      };
      if (typeof def.mount === 'function') await def.mount(el, ctx);
      state.mounted = { def, ctx, unsubs };
    };

    mount().catch(err => {
      if (state.openId !== id) return;
      els.panelHost.innerHTML = `<div class="panel-error"><b>${escapeHtml(t('loadError'))}</b><code>${escapeHtml(err.message)}</code></div>`;
    });
  }

  let panelLoadChain = Promise.resolve();
  function loadPanelScript(p) {
    if (!scriptLoads.has(p.id)) {
      const load = panelLoadChain.then(() => new Promise((resolve, reject) => {
        if (p.panel.style) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = `plugin://${p.id}/${p.panel.style}`;
          document.head.appendChild(link);
        }
        pendingPlugin = p.id;
        const s = document.createElement('script');
        s.src = `plugin://${p.id}/${p.panel.script}`;
        s.onload = () => {
          const def = panelDefs.get(p.id);
          def ? resolve(def) : reject(new Error(`panel def not registered (Toolbox.panel)`));
        };
        s.onerror = () => reject(new Error(`cannot load plugin://${p.id}/${p.panel.script}`));
        document.head.appendChild(s);
      }));
      panelLoadChain = load.catch(() => {});
      scriptLoads.set(p.id, load);
      load.catch(() => scriptLoads.delete(p.id));
    }
    return scriptLoads.get(p.id);
  }

  function closePanel() {
    if (state.mounted) {
      try {
        if (typeof state.mounted.def.unmount === 'function') state.mounted.def.unmount();
      } catch (err) {
        console.error('unmount error:', err);
      }
      for (const u of state.mounted.unsubs) {
        try { u(); } catch {}
      }
      state.mounted = null;
    }
    els.panelHost.innerHTML = '';
    state.openId = null;
  }

  /* --- views --- */
  function setView(view) {
    if (state.view === 'panel' && view !== 'panel') closePanel();
    if (deckController) deckController.hideCardContextMenu();
    state.view = view;
    els.viewHome.hidden = view !== 'home';
    els.viewPanel.hidden = view !== 'panel';
    els.viewPlugins.hidden = view !== 'plugins';
    els.viewSettings.hidden = view !== 'settings';
    if (els.viewWorkflows) els.viewWorkflows.hidden = view !== 'workflows';
    if (els.viewDevGuide) els.viewDevGuide.hidden = view !== 'dev-guide';
    els.tabs.querySelectorAll('button').forEach(b => {
      const tabTarget = (b.dataset.view === 'panel' ? 'home' : b.dataset.view);
      const activeTarget = (view === 'panel' ? 'home' : view === 'dev-guide' ? 'plugins' : view);
      b.classList.toggle('on', tabTarget === activeTarget);
    });
    if (view === 'home') {
      els.search.focus();
      els.search.select();
      if (deckController) {
        deckController.checkClipboardSmartPeek();
        if (state.deckSort === 'frequent' || state.deckSort === 'recent') deckController.renderDeck();
      }
    } else {
      if (deckController) deckController.hideSmartPeek();
    }
    if (view === 'workflows') {
      initWorkflowsView();
    } else if (view === 'plugins') {
      if (pluginCenterController) {
        pluginCenterController.renderPlugins();
        els.pluginSearch.focus();
      }
    } else if (view === 'dev-guide') {
      if (els.guideUserPluginsPath) els.guideUserPluginsPath.textContent = state.userPluginsDir || '';
    }
  }

  /* --- Child Controllers Setup --- */
  let workflowController = null;
  let deckController = null;
  let pluginCenterController = null;
  let settingsController = null;
  let updaterController = null;
  let actionPaletteController = null;

  const sharedCtx = {
    state,
    els,
    I18N: window.I18N,
    escapeHtml,
    t,
    labelForKey,
    hotkeyRow,
    getHoveredPlugin: () => hoveredPlugin,
    setHoveredPlugin: p => { hoveredPlugin = p; },
    openPlugin,
    closePanel,
    setView,
    renderDeck: () => deckController && deckController.renderDeck(),
    renderPlugins: () => pluginCenterController && pluginCenterController.renderPlugins(),
    renderSettings: () => settingsController && settingsController.renderSettings(),
    checkForUpdates: (manual) => updaterController && updaterController.checkForUpdates(manual),
    hotkeyEditor: (opts) => settingsController && settingsController.hotkeyEditor(opts),
    bumpUsageId: (id) => actionPaletteController && actionPaletteController.bumpUsageId(id),
    accelFromEvent: (e) => window.OrbitSettingsView.accelFromEvent(e),
    selectWorkflow: (id) => selectWorkflow(id),
    runCurrentWorkflow: () => runCurrentWorkflow(),
    applyTheme,
    applyLang,
  };

  function ensureWorkflowController() {
    if (!workflowController && window.OrbitWorkflows && window.OrbitWorkflows.init) {
      workflowController = window.OrbitWorkflows.init(sharedCtx);
    }
    return workflowController;
  }

  function initWorkflowsView() {
    const ctrl = ensureWorkflowController();
    return ctrl ? ctrl.initWorkflowsView() : Promise.resolve();
  }

  function selectWorkflow(id) {
    const ctrl = ensureWorkflowController();
    return ctrl ? ctrl.selectWorkflow(id) : Promise.resolve();
  }

  function runCurrentWorkflow() {
    const ctrl = ensureWorkflowController();
    return ctrl ? ctrl.runCurrentWorkflow() : Promise.resolve();
  }

  /* --- boot --- */
  async function init() {
    const boot = await window.host.boot();
    state.platform = boot.platform;
    state.appVersion = boot.appVersion;
    state.plugins = [...boot.plugins].sort((a, b) => a.id.localeCompare(b.id));
    state.config = { ...state.config, ...boot.config };
    state.hotkeys = boot.hotkeys || [];
    if (Array.isArray(boot.workflows)) state.workflows = boot.workflows;
    state.usage = boot.usage || {};
    state.deckSort = ['default', 'frequent', 'recent', 'name'].includes(boot.config.deckSort) ? boot.config.deckSort : 'default';
    state.userPluginsDir = boot.userPluginsDir;
    state.defaultUserPluginsDir = boot.defaultUserPluginsDir;
    state.isCustomUserPluginsDir = boot.isCustomUserPluginsDir;
    state.pluginDataDir = boot.pluginDataDir;
    state.defaultPluginDataDir = boot.defaultPluginDataDir;
    state.isCustomPluginDataDir = boot.isCustomPluginDataDir;

    const hostRowData = state.hotkeys.find(r => r.key === 'host');
    if (hostRowData && hostRowData.ok) state.config.hotkey = hostRowData.accel;
    document.body.className = `platform-${boot.platform} lang-${state.config.lang}`;
    els.aboutVer.textContent = `${boot.name.en} · ${boot.name.zh}  v${boot.appVersion}`;
    els.hotHint.textContent = state.config.hotkey;
    if (els.apHint) {
      els.apHint.textContent = state.config.actionPaletteHotkey || 'Ctrl+K';
      els.apHint.addEventListener('click', () => actionPaletteController && actionPaletteController.openActionPalette());
    }

    // Initialize child domain modules
    if (window.OrbitDeckView && window.OrbitDeckView.init) {
      deckController = window.OrbitDeckView.init(sharedCtx);
    }
    if (window.OrbitSettingsView && window.OrbitSettingsView.init) {
      settingsController = window.OrbitSettingsView.init(sharedCtx);
    }
    if (window.OrbitPluginCenter && window.OrbitPluginCenter.init) {
      pluginCenterController = window.OrbitPluginCenter.init(sharedCtx);
    }
    if (window.OrbitUpdaterView && window.OrbitUpdaterView.init) {
      updaterController = window.OrbitUpdaterView.init(sharedCtx);
    }
    if (window.OrbitActionPaletteView && window.OrbitActionPaletteView.init) {
      actionPaletteController = window.OrbitActionPaletteView.init(sharedCtx);
    }
    ensureWorkflowController();

    applyTheme(state.config.theme);
    applyLang(state.config.lang);
    if (settingsController) {
      settingsController.renderUserPluginsDirInfo();
      settingsController.renderPluginDataDirInfo();
    }

    // Expose helpers for tests and global callers
    window.bumpUsageId = (id) => actionPaletteController && actionPaletteController.bumpUsageId(id);
    window.openPlugin = openPlugin;
    window.closePanel = closePanel;
    window.setView = setView;
    window.renderDeck = () => deckController && deckController.renderDeck();
    window.renderPlugins = () => pluginCenterController && pluginCenterController.renderPlugins();
    window.renderSettings = () => settingsController && settingsController.renderSettings();

    setView('home');
  }

  /* --- shell events & shortcuts --- */
  els.tabs.addEventListener('click', e => {
    const b = e.target.closest('button[data-view]');
    if (b) { closePanel(); setView(b.dataset.view); }
  });

  els.btnBack.addEventListener('click', () => { closePanel(); setView('home'); });

  els.search.addEventListener('input', () => {
    state.query = els.search.value;
    state.deckIndex = 0;
    if (deckController) {
      deckController.renderDeck();
      deckController.checkClipboardSmartPeek();
    }
  });

  els.search.addEventListener('keydown', e => {
    if (state.smartPeekData) {
      if (e.key === 'Tab') {
        e.preventDefault();
        openPlugin(state.smartPeekData.pluginId, { payload: state.smartPeekData.payload });
        return;
      }
      if (e.key === 'Enter') {
        const copyBtn = document.getElementById('btnPeekCopy') || document.getElementById('btnPeekCopyPid');
        if (copyBtn) {
          e.preventDefault();
          copyBtn.click();
          return;
        }
      }
    }
    const visible = deckController ? deckController.visibleDeckPlugins() : [];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.deckIndex = (state.deckIndex + 1) % Math.max(1, visible.length);
      if (deckController) deckController.updateDeckSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.deckIndex = (state.deckIndex - 1 + visible.length) % Math.max(1, visible.length);
      if (deckController) deckController.updateDeckSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const p = visible[state.deckIndex];
      if (p && deckController) deckController.useDeckTool(p);
    }
  });

  const handleThemeChange = e => {
    const b = e.target.closest('button[data-theme]');
    if (!b) return;
    const mode = b.dataset.theme;
    state.config.theme = mode;
    applyTheme(mode);
    window.host.setPref('theme', mode);
  };
  if (els.themeSeg) els.themeSeg.addEventListener('click', handleThemeChange);
  if (els.themeSeg2) els.themeSeg2.addEventListener('click', handleThemeChange);

  const handleLangChange = e => {
    const b = e.target.closest('button[data-lang]');
    if (!b) return;
    const lang = b.dataset.lang;
    state.config.lang = lang;
    applyLang(lang);
    window.host.setPref('lang', lang);
  };
  if (els.langSeg) els.langSeg.addEventListener('click', handleLangChange);
  if (els.langSeg2) els.langSeg2.addEventListener('click', handleLangChange);

  els.winctl.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    window.host.win(b.dataset.act);
  });

  function applyWindowState(st) {
    if (!st) return;
    const isMax = Boolean(st.maximized);
    const isFull = Boolean(st.fullscreen);
    document.body.classList.toggle('is-maximized', isMax);
    document.body.classList.toggle('is-fullscreen', isFull);
    const btnMax = document.getElementById('btnMax');
    if (btnMax) {
      if (isMax || isFull) {
        btnMax.textContent = '❐';
        btnMax.title = (state.config && state.config.lang === 'zh') ? '向下还原' : 'Restore';
        btnMax.setAttribute('aria-label', btnMax.title);
      } else {
        btnMax.textContent = '▢';
        btnMax.title = (state.config && state.config.lang === 'zh') ? '最大化' : 'Maximize';
        btnMax.setAttribute('aria-label', btnMax.title);
      }
    }
  }

  if (window.host.onWindowStateChange) {
    window.host.onWindowStateChange(applyWindowState);
  }
  if (window.host.getWindowState) {
    window.host.getWindowState().then(applyWindowState).catch(() => {});
  }

  window.host.onPaletteFocus(() => {
    if (state.view === 'home') {
      els.search.focus();
      els.search.select();
      if (deckController) deckController.checkClipboardSmartPeek();
    }
  });

  if (window.host.onOpenPlugin) {
    window.host.onOpenPlugin(id => { openPlugin(id); });
  }

  if (window.host.onNavigateTo) {
    window.host.onNavigateTo(opts => {
      if (!opts) return;
      if ((opts.view === 'panel' || (!opts.view && opts.pluginId)) && opts.pluginId) {
        openPlugin(opts.pluginId, { payload: opts.payload });
      } else if (opts.view === 'workflows') {
        closePanel();
        setView('workflows');
        if (opts.workflowId && typeof selectWorkflow === 'function') {
          selectWorkflow(opts.workflowId).then(() => {
            if (opts.run && typeof runCurrentWorkflow === 'function') {
              setTimeout(() => runCurrentWorkflow(), 60);
            }
          });
        }
      } else if (opts.view) {
        closePanel();
        setView(opts.view);
        if (opts.action === 'check-update' && updaterController) {
          setTimeout(() => updaterController.checkForUpdates(true), 120);
        }
      }
    });
  }

  if (window.host.onOpenActionPalette) {
    window.host.onOpenActionPalette(payload => {
      if (state.actionPaletteOpen && payload && payload.wasActive) {
        if (actionPaletteController) actionPaletteController.closeActionPalette();
        window.host.win('hide');
      } else {
        if (actionPaletteController) actionPaletteController.openActionPalette();
      }
    });
  }

  window.addEventListener('keydown', e => {
    if (state.actionPaletteOpen) {
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const item = state.actionPaletteFiltered[Number(e.key) - 1];
        if (item && actionPaletteController) {
          e.preventDefault();
          actionPaletteController.executeActionPaletteItem(item);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (actionPaletteController) actionPaletteController.closeActionPalette();
        return;
      }
      return;
    }

    const apHotkey = state.config.actionPaletteHotkey || 'Ctrl+K';
    const isCtrlK = (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K'));
    if (isCtrlK || (actionPaletteController && actionPaletteController.matchHotkey(e, apHotkey))) {
      e.preventDefault();
      if (actionPaletteController) actionPaletteController.openActionPalette();
      return;
    }

    if (e.key === 'Escape' && state.view === 'panel') { closePanel(); setView('home'); window.host.win('hide'); }
    else if (e.key === 'Escape' && state.view === 'dev-guide') { setView('plugins'); }
    else if (e.key === 'Escape' && state.view === 'home') {
      if (state.smartPeekData && deckController) deckController.hideSmartPeek();
      else if (els.search.value) { els.search.value = ''; state.query = ''; if (deckController) deckController.renderDeck(); }
      else window.host.win('hide');
    }
  });

  init();
})();
