const $ = id => document.getElementById(id);
const t = (k, p) => window.I18N.t(k, p);

const els = {
  root: document.documentElement,
  tabs: $('tabs'), langSeg: $('langSeg'), themeSeg: $('themeSeg'),
  langSeg2: $('langSeg2'), themeSeg2: $('themeSeg2'), winctl: $('winctl'),
  search: $('search'), hotHint: $('hotHint'), apHint: $('apHint'), deckMeta: $('deckMeta'), deck: $('deck'), empty: $('empty'),
  smartPeek: $('smartPeek'),
  actionPaletteHotkeyCtrl: $('actionPaletteHotkeyCtrl'),
  actionPaletteMask: $('actionPaletteMask'),
  actionPalette: $('actionPalette'),
  apInput: $('apInput'),
  apList: $('apList'),
  apCloseKbd: $('apCloseKbd'),
  viewHome: $('viewHome'), viewPanel: $('viewPanel'), viewPlugins: $('viewPlugins'),
  viewSettings: $('viewSettings'), viewDevGuide: $('viewDevGuide'), viewWorkflows: $('viewWorkflows'),
  wfSelect: $('wfSelect'), btnWfNew: $('btnWfNew'), btnWfSave: $('btnWfSave'), btnWfDelete: $('btnWfDelete'),
  wfTestInput: $('wfTestInput'), btnWfRun: $('btnWfRun'), wfLibList: $('wfLibList'),
  wfNameInput: $('wfNameInput'), wfDescInput: $('wfDescInput'), wfEnabledToggle: $('wfEnabledToggle'),
  wfLibSearch: $('wfLibSearch'),
  wfInspector: $('wfInspector'), wfInspType: $('wfInspType'), wfInspClose: $('wfInspClose'), wfInspBody: $('wfInspBody'),
  wfSidebar: $('wfSidebar'), wfSidebarResizer: $('wfSidebarResizer'), wfConsoleResizer: $('wfConsoleResizer'),
  wfCanvasArea: $('wfCanvasArea'), wfCanvasViewport: $('wfCanvasViewport'), wfCanvasControls: $('wfCanvasControls'),
  wfSvgLayer: $('wfSvgLayer'), wfNodesContainer: $('wfNodesContainer'),
  btnWfZoomIn: $('btnWfZoomIn'), wfZoomScale: $('wfZoomScale'), btnWfZoomOut: $('btnWfZoomOut'),
  btnWfFitView: $('btnWfFitView'), btnWfResetView: $('btnWfResetView'),
  btnWfUndo: $('btnWfUndo'), btnWfRedo: $('btnWfRedo'),
  wfConsole: $('wfConsole'), wfConsoleBody: $('wfConsoleBody'), btnWfClearConsole: $('btnWfClearConsole'),
  btnBack: $('btnBack'), panelIcon: $('panelIcon'), panelName: $('panelName'), panelMeta: $('panelMeta'),
  panelHost: $('panelHost'),
  hotkeyCtrl: $('hotkeyCtrl'),
  // Dev guide banner & view elements
  btnOpenDevGuide: $('btnOpenDevGuide'), btnOpenDevSkillsRepo: $('btnOpenDevSkillsRepo'),
  btnOpenDevSkillsRepo2: $('btnOpenDevSkillsRepo2'), btnOpenDocInBrowser: $('btnOpenDocInBrowser'),
  btnBackFromDevGuide: $('btnBackFromDevGuide'), btnCopyPrompt: $('btnCopyPrompt'),
  samplePrompt: $('samplePrompt'), guideUserPluginsPath: $('guideUserPluginsPath'),
  btnOpenUserPluginsFromGuide: $('btnOpenUserPluginsFromGuide'), btnRescanFromGuide: $('btnRescanFromGuide'),
  btnGotoDevGuide: $('btnGotoDevGuide'),
  // Plugins view elements
  pluginSearch: $('pluginSearch'), btnPluginSearchClear: $('btnPluginSearchClear'),
  catFilter: $('catFilter'), statusFilter: $('statusFilter'),
  pluginMeta: $('pluginMeta'), pluginEmpty: $('pluginEmpty'), pluginList: $('pluginList'),
  paginationBar: $('paginationBar'), btnPagePrev: $('btnPagePrev'),
  pageIndicator: $('pageIndicator'), btnPageNext: $('btnPageNext'),
  btnRescan: $('btnRescan'), btnUserPlugins: $('btnUserPlugins'),
  btnChangeUserPluginsHeader: $('btnChangeUserPluginsHeader'),
  btnResetUserPluginsHeader: $('btnResetUserPluginsHeader'),
  userPluginsPath2: $('userPluginsPath2'), userPluginsBadge2: $('userPluginsBadge2'),
  userPluginsPath: $('userPluginsPath'), userPluginsBadge: $('userPluginsBadge'),
  btnChangeUserPlugins: $('btnChangeUserPlugins'),
  btnOpenUserPlugins2: $('btnOpenUserPlugins2'),
  btnResetUserPlugins: $('btnResetUserPlugins'),
  pluginDataPath: $('pluginDataPath'), pluginDataBadge: $('pluginDataBadge'),
  btnChangePluginData: $('btnChangePluginData'),
  btnOpenPluginData: $('btnOpenPluginData'),
  btnResetPluginData: $('btnResetPluginData'),
  btnGotoPlugins: $('btnGotoPlugins'),
  aboutVer: $('aboutVer'), btnRepo: $('btnRepo'),
  // Context menu elements
  cardContextMenu: $('cardContextMenu'), ctxTitle: $('ctxTitle'),
  ctxLaunch: $('ctxLaunch'), ctxConfig: $('ctxConfig'),
  ctxToggle: $('ctxToggle'), ctxToggleText: $('ctxToggleText'),
  ctxFolder: $('ctxFolder'),
};

const state = {
  platform: 'win32',
  appVersion: '0.0.0',
  plugins: [],
  config: { hotkey: 'Alt+Shift+Space', lang: 'zh', theme: 'auto' },
  hotkeys: [],           // [{key, accel, ok, conflictKey}] from main
  view: 'home',          // home | plugins | settings | panel
  openId: null,          // plugin whose panel is showing
  mounted: null,         // {def, ctx, unsubscribers[]}
  query: '',
  smartPeekData: null,
  actionPaletteOpen: false,
  actionPaletteItems: [],
  actionPaletteFiltered: [],
  actionPaletteIndex: 0,
  usage: {},            // usageId -> {n, t} frecency (persisted main-side)
  deckIndex: 0,         // keyboard-selected card on the home deck
  // Workflows canvas state
  workflows: [],
  currentWorkflowId: null,
  wfConnectingFrom: null,
  workflowsInited: false,
  wfLibQuery: '',
  // Plugins center state
  pluginQuery: '',
  pluginCat: 'all',
  pluginStatus: 'all',
  pluginPage: 1,
  pageSize: 8,
  ctxTargetPlugin: null,
  highlightPluginId: null,
  userPluginsDir: '',
  defaultUserPluginsDir: '',
  isCustomUserPluginsDir: false,
  pluginDataDir: '',
  defaultPluginDataDir: '',
  isCustomPluginDataDir: false,
};

/* Human name for a hotkey key ('host' or 'pluginId:actionId') — used to say
   WHAT a conflicting accelerator belongs to. */
function labelForKey(key) {
  if (key === 'host') return t('hotkey');
  if (key === 'action-palette') return window.I18N.lang === 'en' ? 'Action Palette' : '动作抽屉';
  const pid = key.split(':')[0];
  const p = state.plugins.find(x => x.id === pid);
  const a = p && p.actions.find(x => x.key === key);
  const an = a ? (window.I18N.lang === 'en' ? a.label.en : a.label.zh) : key;
  const pn = p ? (window.I18N.lang === 'en' ? p.name.en : p.name.zh) : pid;
  return `${an} · ${pn}`;
}
const hotkeyRow = key => state.hotkeys.find(r => r.key === key);

/* --- panel registry: plugin scripts call Toolbox.panel() when injected ------- */
const panelDefs = new Map();
let pendingPlugin = null;
window.Toolbox = { panel(def) { if (pendingPlugin) panelDefs.set(pendingPlugin, def); pendingPlugin = null; } };
const scriptLoads = new Map(); // id -> Promise<void> once injected

/* --- theme & language ------------------------------------------------------- */
function applyTheme(mode) {
  els.root.dataset.theme = mode;
  for (const seg of [els.themeSeg, els.themeSeg2]) {
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.theme === mode)));
  }
}
function applyLang(lang) {
  window.I18N.setLang(lang);
  document.body.classList.toggle('lang-zh', lang === 'zh');
  window.I18N.applyStatic(document);
  for (const seg of [els.langSeg, els.langSeg2]) {
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  }
  renderDeck(); renderPlugins(); renderSettings();
}

/* --- deck (tool cards + search) ---------------------------------------------- */
function pluginText(p) {
  const base = [p.id, p.name.zh, p.name.en, p.desc.zh, p.desc.en, ...p.keywords].join('\n').toLowerCase();
  // 拼音全拼+首字母并入匹配域：jt / jietu 也能命中「截图悬浮」
  return window.PaletteSearch.enrich(base, `${p.name.zh || ''} ${p.name.en || ''}`);
}
function visibleDeckPlugins() {
  const q = state.query.trim().toLowerCase();
  return state.plugins.filter(p => p.enabled && (!q || pluginText(p).includes(q)));
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
    card.innerHTML = `
      <span class="card-icon">${p.iconSvg || escapeHtml(p.iconText)}</span>
      <span class="card-name"></span>
      <span class="card-desc"></span>
      <span class="card-tags"></span>`;
    card.querySelector('.card-name').textContent = window.I18N.lang === 'en' ? (p.name.en || p.name.zh) : (p.name.zh || p.name.en);
    card.querySelector('.card-desc').textContent = window.I18N.lang === 'en' ? (p.desc.en || p.desc.zh) : (p.desc.zh || p.desc.en);
    const tags = card.querySelector('.card-tags');
    for (const a of p.actions) {
      if (a.hotkey) {
        const kbd = document.createElement('kbd');
        kbd.textContent = a.hotkey;
        kbd.title = (window.I18N.lang === 'en' ? a.label.en : a.label.zh);
        tags.appendChild(kbd);
      }
    }
    card.addEventListener('click', () => openPlugin(p.id));
    card.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      showCardContextMenu(p, e.clientX, e.clientY);
    });
    card.addEventListener('mouseenter', () => { hoveredPlugin = p; state.deckIndex = i; updateDeckSelection(false); });
    card.addEventListener('mouseleave', () => { if (hoveredPlugin === p) hoveredPlugin = null; });
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
    els.deck.appendChild(card);
  });
  const enabledCount = state.plugins.filter(p => p.enabled).length;
  els.deckMeta.textContent = state.query.trim() ? t('deckMeta', { n: shown.length }) : t('deckMeta', { n: enabledCount });
  const emptyMsg = enabledCount === 0 ? t('noTools') : t('empty');
  els.empty.textContent = emptyMsg;
  els.empty.hidden = shown.length > 0;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* --- smart-peek (zero-click detection & inline banner) -------------------------- */
let peekCheckSeq = 0;
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
  const pluginLabel = data.pluginName && (window.I18N.lang === 'en' ? (data.pluginName.en || data.pluginName.zh) : (data.pluginName.zh || data.pluginName.en)) || t('openPlugin') || '打开插件';
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

  const btnCopy = $('btnPeekCopy');
  if (btnCopy) {
    btnCopy.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.host.writeClipboardText(data.copyValue);
      const orig = btnCopy.innerHTML;
      btnCopy.innerHTML = '<span>✓ 已复制</span>';
      setTimeout(() => { if (btnCopy) btnCopy.innerHTML = orig; }, 1000);
    });
  }

  const btnOpen = $('btnPeekOpen');
  if (btnOpen) {
    btnOpen.addEventListener('click', (e) => {
      e.stopPropagation();
      openPlugin(data.pluginId);
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
          $('btnPeekCopyPid')?.addEventListener('click', async () => {
            await window.host.writeClipboardText(String(item.pid));
            const b = $('btnPeekCopyPid');
            if (b) b.innerHTML = '<span>✓ 已复制</span>';
          });
          $('btnPeekKill')?.addEventListener('click', async () => {
            // 结束进程不可逆——横幅上的误点不该直接杀掉系统进程
            if (!confirm(`确定结束进程 "${procName}" (PID ${item.pid}) 吗？此操作不可恢复。`)) return;
            const killRes = await window.host.pluginCall('port-scope', 'kill', { pid: item.pid, force: true });
            if (killRes && killRes.ok) {
              if (previewEl) previewEl.innerHTML = `<span style="color:#2ecc71">●</span> PID ${item.pid} 已成功结束`;
              $('btnPeekKill')?.remove();
            }
          });
          $('btnPeekOpen')?.addEventListener('click', () => openPlugin('port-scope'));
        }
      } else {
        if (previewEl) previewEl.innerHTML = `<span style="color:#2ecc71">●</span> 端口 :${res.port} 当前空闲未被占用`;
        if (subEl) subEl.textContent = '可直接用于本地开发与服务绑定';
      }
    }).catch(() => {});
  }
}

/* --- plugin panel lifecycle ---------------------------------------------------- */
async function openPlugin(id, opts = {}) {
  const p = state.plugins.find(x => x.id === id);
  if (!p || !p.panel) return;
  closePanel();
  state.openId = id;
  setView('panel');
  els.panelIcon.innerHTML = p.iconSvg || escapeHtml(p.iconText);
  els.panelName.textContent = window.I18N.lang === 'en' ? (p.name.en || p.name.zh) : (p.name.zh || p.name.en);
  const bits = [`v${p.version}`, t(p.source === 'user' ? 'sourceUser' : 'sourceBuiltin')];
  if (p.author) bits.push(p.author);
  els.panelMeta.textContent = bits.join(' · ');
  els.panelHost.innerHTML = '';

  const mount = async () => {
    const def = await loadPanelScript(p);
    const el = document.createElement('div');
    el.className = 'panel-view';
    els.panelHost.appendChild(el);
    const unsubs = [];
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
    if (typeof def.mount === 'function') def.mount(el, ctx);
    state.mounted = { def, ctx, unsubs };
  };

  mount().catch(err => {
    if (state.openId !== id) return;
    els.panelHost.innerHTML = `<div class="panel-error"><b>${escapeHtml(t('loadError'))}</b><code>${escapeHtml(err.message)}</code></div>`;
  });
}

function loadPanelScript(p) {
  if (!scriptLoads.has(p.id)) {
    scriptLoads.set(p.id, new Promise((resolve, reject) => {
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
  }
  return scriptLoads.get(p.id);
}

function closePanel() {
  if (state.mounted) {
    try { state.mounted.def.unmount && state.mounted.def.unmount(); } catch { /* ignore */ }
    for (const off of state.mounted.unsubs) { try { off(); } catch { /* ignore */ } }
    state.mounted = null;
  }
  state.openId = null;
  els.panelHost.innerHTML = '';
}

/* --- views ----------------------------------------------------------------------- */
function setView(view) {
  hideCardContextMenu();
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
    checkClipboardSmartPeek();
  } else {
    hideSmartPeek();
  }
  if (view === 'workflows') {
    initWorkflowsView();
  } else if (view === 'plugins') {
    renderPlugins();
    els.pluginSearch.focus();
  } else if (view === 'dev-guide') {
    if (els.guideUserPluginsPath) els.guideUserPluginsPath.textContent = state.userPluginsDir || '';
  }
}

/* --- hotkey recorder ---------------------------------------------------------------- */
function accelFromEvent(e) {
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');
  let key = e.key;
  if (key === ' ') key = 'Space';
  if (/^[a-z]$/i.test(key)) key = key.toUpperCase();
  const isF = /^F([1-9]|1[0-2])$/.test(key);
  const plain = /^[A-Z0-9]$/.test(key) || key === 'Space';
  if (isF) return [...mods, key].join('+');
  if (plain && mods.length) return [...mods, key].join('+');
  return null; // not a mappable key
}

function hotkeyEditor({ initial, allowClear = false, onApply }) {
  const wrap = document.createElement('div');
  wrap.className = 'hke';
  const input = document.createElement('input');
  input.readOnly = true;
  input.className = 'input mono hke-input';
  input.value = initial || '';
  input.placeholder = t('hotkeyRecord');
  const apply = document.createElement('button');
  apply.type = 'button'; apply.className = 'btn'; apply.textContent = t('apply');
  const clear = document.createElement('button');
  clear.type = 'button'; clear.className = 'btn ghost'; clear.textContent = t('clearHotkey');
  const status = document.createElement('span');
  status.className = 'hke-status';
  wrap.append(input, apply);
  if (allowClear) wrap.append(clear);
  wrap.append(status);

  let candidate = initial || null;
  let recording = false;
  input.addEventListener('click', () => {
    recording = true;
    input.classList.add('recording');
    input.value = '';
    status.textContent = '';
  });
  input.addEventListener('keydown', e => {
    if (!recording) return;
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') {
      recording = false; input.classList.remove('recording');
      input.value = candidate || '';
      return;
    }
    const accel = accelFromEvent(e);
    if (accel) { candidate = accel; input.value = accel; recording = false; input.classList.remove('recording'); }
  });
  apply.addEventListener('click', async () => {
    if (!candidate) return;
    apply.disabled = true;
    const res = await onApply(candidate);
    apply.disabled = false;
    status.classList.remove('bad');
    if (res && res.ok === false) {
      status.textContent = res.conflictKey
        ? t('conflictWith', { name: labelForKey(res.conflictKey) })
        : t('hotkeyBad');
      status.classList.add('bad');
    } else {
      status.textContent = '✓';
      input.value = res && res.hotkey ? res.hotkey : candidate;
    }
  });
  clear.addEventListener('click', async () => {
    candidate = null; input.value = ''; status.textContent = '';
    await onApply(null);
  });
  return wrap;
}

/* --- plugins center & settings ------------------------------------------------ */
function renderPlugins() {
  const q = state.pluginQuery.trim().toLowerCase();
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

  els.pluginMeta.textContent = t('pluginMeta', { total: state.plugins.length, shown: filtered.length });
  els.pluginEmpty.textContent = t('noPluginMatch');
  els.pluginEmpty.hidden = filtered.length > 0;
  els.paginationBar.hidden = filtered.length === 0;

  els.btnPagePrev.disabled = state.pluginPage <= 1;
  els.btnPageNext.disabled = state.pluginPage >= totalPages;
  els.pageIndicator.textContent = t('pageIndicator', { current: state.pluginPage, total: totalPages });

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
    nameB.textContent = window.I18N.lang === 'en' ? (p.name.en || p.name.zh) : (p.name.zh || p.name.en);
    nameLine.append(nameB);

    const ver = document.createElement('span');
    ver.className = 'chip mono'; ver.textContent = `v${p.version}`;

    const src = document.createElement('span');
    src.className = 'chip ghost'; src.textContent = t(p.source === 'user' ? 'sourceUser' : 'sourceBuiltin');

    const catKey = p.category === 'media' ? 'catMedia' : p.category === 'system' ? 'catSystem' : p.category === 'dev' ? 'catDev' : 'catOther';
    const catChip = document.createElement('span');
    catChip.className = 'chip ghost';
    catChip.textContent = t(catKey);

    nameLine.append(ver, src, catChip);

    const btnFolder = document.createElement('button');
    btnFolder.type = 'button';
    btnFolder.className = 'btn ghost small';
    btnFolder.title = t('openFolder');
    btnFolder.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> <span>${t('openFolder')}</span>`;
    btnFolder.addEventListener('click', () => window.host.openPluginFolder(p.id));
    nameLine.append(btnFolder);

    if (p.loadError) {
      const err = document.createElement('span');
      err.className = 'chip warn'; err.textContent = `${t('loadError')}: ${p.loadError}`; err.title = p.loadError;
      nameLine.append(err);
    }

    const desc = document.createElement('div');
    desc.className = 'prow-desc';
    desc.textContent = window.I18N.lang === 'en' ? (p.desc.en || p.desc.zh) : (p.desc.zh || p.desc.en);
    mid.append(nameLine, desc);

    if (p.actions.length) {
      const acts = document.createElement('div');
      acts.className = 'prow-acts';
      const label = document.createElement('span');
      label.className = 'prow-acts-label'; label.textContent = t('actions');
      acts.append(label);
      for (const a of p.actions) {
        const aLabel = document.createElement('span');
        aLabel.className = 'prow-act-name';
        aLabel.textContent = window.I18N.lang === 'en' ? (a.label.en || a.label.zh) : (a.label.zh || a.label.en);
        acts.append(aLabel, hotkeyEditor({
          initial: a.hotkey,
          allowClear: true,
          onApply: async accel => {
            const res = await window.host.setPluginHotkey(a.key, accel);
            if (res.ok) {
              a.hotkey = res.hotkey || null;
              state.hotkeys = await window.host.hotkeys();
              renderDeck();
              renderPlugins();
            }
            return res;
          },
        }));
        const rowHk = hotkeyRow(a.key);
        if (rowHk && !rowHk.ok) {
          const chip = document.createElement('span');
          chip.className = 'chip warn';
          chip.textContent = rowHk.conflictKey
            ? t('conflictWith', { name: labelForKey(rowHk.conflictKey) })
            : t('hotkeyBad');
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
      if (state.openId === p.id) { closePanel(); setView('home'); }
      renderDeck();
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

function showCardContextMenu(p, x, y) {
  state.ctxTargetPlugin = p;
  els.ctxTitle.textContent = window.I18N.lang === 'en' ? (p.name.en || p.name.zh) : (p.name.zh || p.name.en);
  els.ctxLaunch.hidden = !p.panel;
  els.ctxToggleText.textContent = p.enabled ? t('ctxToggleDisable') : t('ctxToggleEnable');

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

/* --- settings ------------------------------------------------------------------------ */
function renderUserPluginsDirInfo() {
  const isCustom = !!state.isCustomUserPluginsDir;
  const dir = state.userPluginsDir || '';
  const badgeText = t(isCustom ? 'userPluginsCustom' : 'userPluginsDefault');

  if (els.userPluginsPath) {
    els.userPluginsPath.textContent = dir;
    els.userPluginsPath.title = dir;
  }
  if (els.userPluginsBadge) {
    els.userPluginsBadge.textContent = badgeText;
    els.userPluginsBadge.className = 'chip ' + (isCustom ? 'warn' : 'ghost');
  }
  if (els.btnResetUserPlugins) {
    els.btnResetUserPlugins.hidden = !isCustom;
  }

  if (els.userPluginsPath2) {
    els.userPluginsPath2.textContent = dir;
    els.userPluginsPath2.title = dir;
  }
  if (els.userPluginsBadge2) {
    els.userPluginsBadge2.textContent = badgeText;
    els.userPluginsBadge2.className = 'chip ' + (isCustom ? 'warn' : 'ghost');
  }
  if (els.btnResetUserPluginsHeader) {
    els.btnResetUserPluginsHeader.hidden = !isCustom;
  }
  if (els.guideUserPluginsPath) {
    els.guideUserPluginsPath.textContent = dir;
    els.guideUserPluginsPath.title = dir;
  }
}

async function applyUserPluginsDir(dir) {
  const res = await window.host.setUserPluginsDir(dir);
  state.plugins = [...res.plugins].sort((a, b) => a.id.localeCompare(b.id));
  state.hotkeys = res.hotkeys;
  state.userPluginsDir = res.userPluginsDir;
  state.defaultUserPluginsDir = res.defaultUserPluginsDir;
  state.isCustomUserPluginsDir = res.isCustom;
  renderUserPluginsDirInfo();
  renderDeck();
  renderPlugins();
  return res;
}
window.__setUserPluginsDirForTest = applyUserPluginsDir;

async function changeUserPluginsDir() {
  const chosen = await window.host.chooseUserPluginsDir();
  if (!chosen) return;
  await applyUserPluginsDir(chosen);
}

async function resetUserPluginsDir() {
  await applyUserPluginsDir(null);
}

function renderPluginDataDirInfo() {
  const isCustom = !!state.isCustomPluginDataDir;
  const dir = state.pluginDataDir || '';
  const badgeText = t(isCustom ? 'pluginDataCustom' : 'pluginDataDefault');

  if (els.pluginDataPath) {
    els.pluginDataPath.textContent = dir;
    els.pluginDataPath.title = dir;
  }
  if (els.pluginDataBadge) {
    els.pluginDataBadge.textContent = badgeText;
    els.pluginDataBadge.className = 'chip ' + (isCustom ? 'warn' : 'ghost');
  }
  if (els.btnResetPluginData) {
    els.btnResetPluginData.hidden = !isCustom;
  }
}

async function applyPluginDataDir(dir) {
  const res = await window.host.setPluginDataDir(dir);
  state.pluginDataDir = res.pluginDataDir;
  state.defaultPluginDataDir = res.defaultPluginDataDir;
  state.isCustomPluginDataDir = res.isCustom;
  renderPluginDataDirInfo();
  return res;
}
window.__setPluginDataDirForTest = applyPluginDataDir;

async function changePluginDataDir() {
  const chosen = await window.host.choosePluginDataDir();
  if (!chosen) return;
  await applyPluginDataDir(chosen);
}

async function resetPluginDataDir() {
  await applyPluginDataDir(null);
}

function renderSettings() {
  renderUserPluginsDirInfo();
  renderPluginDataDirInfo();
  els.hotkeyCtrl.innerHTML = '';
  els.hotkeyCtrl.appendChild(hotkeyEditor({
    initial: state.config.hotkey,
    onApply: async accel => {
      const res = await window.host.setHotkey(accel);
      if (res.ok) {
        state.config.hotkey = res.hotkey;
        els.hotHint.textContent = res.hotkey;
        state.hotkeys = await window.host.hotkeys();
        renderSettings();
      }
      return res;
    },
  }));
  const hostRow = hotkeyRow('host');
  if (hostRow && !hostRow.ok) {
    const chip = document.createElement('span');
    chip.className = 'chip warn';
    chip.textContent = hostRow.conflictKey
      ? t('conflictWith', { name: labelForKey(hostRow.conflictKey) })
      : t('hotkeyBad');
    els.hotkeyCtrl.appendChild(chip);
  }

  if (els.actionPaletteHotkeyCtrl) {
    els.actionPaletteHotkeyCtrl.innerHTML = '';
    els.actionPaletteHotkeyCtrl.appendChild(hotkeyEditor({
      initial: state.config.actionPaletteHotkey || 'Ctrl+K',
      onApply: async accel => {
        const res = await window.host.setPaletteHotkey(accel);
        if (res && res.ok) {
          state.config.actionPaletteHotkey = res.hotkey || accel;
          if (els.apHint) els.apHint.textContent = state.config.actionPaletteHotkey;
          state.hotkeys = await window.host.hotkeys();
          renderSettings();
        }
        return res;
      }
    }));
    const apRow = hotkeyRow('action-palette');
    if (apRow && !apRow.ok) {
      const chip = document.createElement('span');
      chip.className = 'chip bad';
      chip.textContent = apRow.conflictKey
        ? t('conflictWith', { name: labelForKey(apRow.conflictKey) })
        : t('hotkeyBad');
      els.actionPaletteHotkeyCtrl.appendChild(chip);
    }
  }
}

/* --- boot ------------------------------------------------------------------------------ */
async function init() {
  const boot = await window.host.boot();
  state.platform = boot.platform;
  state.appVersion = boot.appVersion;
  state.plugins = [...boot.plugins].sort((a, b) => a.id.localeCompare(b.id));
  state.config = { ...state.config, ...boot.config };
  state.hotkeys = boot.hotkeys || [];
  state.usage = boot.usage || {};
  state.userPluginsDir = boot.userPluginsDir;
  state.defaultUserPluginsDir = boot.defaultUserPluginsDir;
  state.isCustomUserPluginsDir = boot.isCustomUserPluginsDir;
  state.pluginDataDir = boot.pluginDataDir;
  state.defaultPluginDataDir = boot.defaultPluginDataDir;
  state.isCustomPluginDataDir = boot.isCustomPluginDataDir;
  const hostRow = state.hotkeys.find(r => r.key === 'host');
  if (hostRow && hostRow.ok) state.config.hotkey = hostRow.accel;
  document.body.className = `platform-${boot.platform} lang-${state.config.lang}`;
  els.aboutVer.textContent = `${boot.name.en} · ${boot.name.zh}  v${boot.appVersion}`;
  els.hotHint.textContent = state.config.hotkey;
  if (els.apHint) {
    els.apHint.textContent = state.config.actionPaletteHotkey || 'Ctrl+K';
    els.apHint.addEventListener('click', () => openActionPalette());
  }
  applyTheme(state.config.theme);
  applyLang(state.config.lang);
  renderUserPluginsDirInfo();
  renderPluginDataDirInfo();
  setView('home');
}

/* --- events ----------------------------------------------------------------------------- */
els.tabs.addEventListener('click', e => {
  const b = e.target.closest('button[data-view]');
  if (b) { closePanel(); setView(b.dataset.view); }
});
els.btnBack.addEventListener('click', () => { closePanel(); setView('home'); });
els.search.addEventListener('input', () => {
  state.query = els.search.value;
  state.deckIndex = 0;
  renderDeck();
  checkClipboardSmartPeek();
});
els.search.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const shown = visibleDeckPlugins();
    if (shown.length === 0) return;
    e.preventDefault();
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    state.deckIndex = (state.deckIndex + delta + shown.length) % shown.length;
    updateDeckSelection();
    return;
  }
  if (e.key === 'Enter') {
    if (state.smartPeekData) {
      e.preventDefault();
      const copyVal = state.smartPeekData.copyValue;
      window.host.writeClipboardText(copyVal);
      const btn = $('btnPeekCopy') || $('btnPeekCopyPid');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<span>✓ 已复制</span>';
        setTimeout(() => { if (btn) btn.innerHTML = orig; }, 1000);
      }
      return;
    }
    const shown = visibleDeckPlugins();
    const target = shown[Math.min(state.deckIndex, shown.length - 1)];
    if (target) openPlugin(target.id);
  } else if (e.key === 'Tab' && state.smartPeekData) {
    e.preventDefault();
    openPlugin(state.smartPeekData.pluginId);
  } else if (e.key === 'Escape') {
    if (state.smartPeekData) {
      hideSmartPeek();
    }
    if (els.search.value) { els.search.value = ''; state.query = ''; renderDeck(); }
    else els.search.blur();
  }
});
for (const seg of [els.langSeg, els.langSeg2]) {
  seg.addEventListener('click', async e => {
    const b = e.target.closest('button[data-lang]');
    if (!b) return;
    state.config.lang = b.dataset.lang;
    await window.host.setPref('lang', b.dataset.lang);
    applyLang(b.dataset.lang);
  });
}
for (const seg of [els.themeSeg, els.themeSeg2]) {
  seg.addEventListener('click', async e => {
    const b = e.target.closest('button[data-theme]');
    if (!b) return;
    state.config.theme = b.dataset.theme;
    await window.host.setPref('theme', b.dataset.theme);
    applyTheme(b.dataset.theme);
  });
}
els.winctl.addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  if (b) window.host.win(b.dataset.act);
});
const railEl = document.querySelector('.rail');
if (railEl) {
  railEl.addEventListener('dblclick', e => {
    if (e.target.closest('button, input, [role=tab], .seg, .winctl')) return;
    window.host.win('maximize');
  });
}
els.btnRescan.addEventListener('click', async () => {
  const res = await window.host.rescanPlugins();
  state.plugins = [...res.plugins].sort((a, b) => a.id.localeCompare(b.id));
  state.hotkeys = res.hotkeys;
  renderDeck(); renderPlugins(); renderSettings();
});
els.btnUserPlugins.addEventListener('click', () => window.host.openUserPlugins());
els.btnRepo.addEventListener('click', () => window.host.openExternal('https://github.com/Ikaros-521/orbit-tools'));
els.btnGotoPlugins.addEventListener('click', () => setView('plugins'));

/* --- plugin center filters & pagination events ------------------------------------------ */
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

/* --- card context menu events ----------------------------------------------------------- */
els.ctxLaunch.addEventListener('click', () => {
  const p = state.ctxTargetPlugin;
  hideCardContextMenu();
  if (p && p.panel) openPlugin(p.id);
});
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
  setView('plugins');
});
els.ctxToggle.addEventListener('click', async () => {
  const p = state.ctxTargetPlugin;
  hideCardContextMenu();
  if (!p) return;
  const res = await window.host.setPluginEnabled(p.id, !p.enabled);
  state.plugins = [...res.plugins].sort((a, b) => a.id.localeCompare(b.id));
  state.hotkeys = res.hotkeys;
  if (state.openId === p.id) { closePanel(); setView('home'); }
  renderDeck();
  renderPlugins();
});
els.ctxFolder.addEventListener('click', () => {
  const p = state.ctxTargetPlugin;
  hideCardContextMenu();
  if (p) window.host.openPluginFolder(p.id);
});

window.addEventListener('click', e => {
  if (!e.target.closest('#cardContextMenu')) hideCardContextMenu();
});
window.addEventListener('contextmenu', e => {
  if (!e.target.closest('.card')) hideCardContextMenu();
});
window.addEventListener('scroll', () => hideCardContextMenu(), true);

/* --- user plugins dir events ------------------------------------------------------------ */
for (const btn of [els.btnChangeUserPlugins, els.btnChangeUserPluginsHeader]) {
  if (btn) btn.addEventListener('click', changeUserPluginsDir);
}
for (const btn of [els.btnResetUserPlugins, els.btnResetUserPluginsHeader]) {
  if (btn) btn.addEventListener('click', resetUserPluginsDir);
}
for (const el of [els.userPluginsPath, els.userPluginsPath2, els.btnOpenUserPlugins2]) {
  if (el) el.addEventListener('click', () => window.host.openUserPlugins());
}

/* --- plugin data dir events ------------------------------------------------------------- */
if (els.btnChangePluginData) els.btnChangePluginData.addEventListener('click', changePluginDataDir);
if (els.btnResetPluginData) els.btnResetPluginData.addEventListener('click', resetPluginDataDir);
for (const el of [els.pluginDataPath, els.btnOpenPluginData]) {
  if (el) el.addEventListener('click', () => window.host.openPluginDataDir());
}

/* --- dev guide view events -------------------------------------------------------------- */
if (els.btnOpenDevGuide) els.btnOpenDevGuide.addEventListener('click', () => setView('dev-guide'));
if (els.btnGotoDevGuide) els.btnGotoDevGuide.addEventListener('click', () => setView('dev-guide'));
if (els.btnBackFromDevGuide) els.btnBackFromDevGuide.addEventListener('click', () => setView('plugins'));

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
    els.btnCopyPrompt.textContent = t('promptCopied');
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
    renderDeck(); renderPlugins(); renderSettings();
    const orig = els.btnRescanFromGuide.textContent;
    els.btnRescanFromGuide.textContent = '✓ 扫描完成';
    setTimeout(() => { els.btnRescanFromGuide.textContent = orig; }, 1200);
  });
}

/* --- workflows canvas controller ----------------------------------------------- */
let currentWorkflow = null;

/* --- canvas undo/redo ------------------------------------------------------------
   Snapshot-based (nodes+edges deep-copied). The canvas is full of one-gesture
   destructive edits (right-click deletes a node, pulling a wire disconnects
   it) with 500ms autosave — without undo those misfires are unrecoverable. */
const wfHistory = { undo: [], redo: [], wfId: null };

function wfSnapshot() {
  if (!currentWorkflow) return null;
  return { nodes: structuredClone(currentWorkflow.nodes), edges: structuredClone(currentWorkflow.edges) };
}
function pushWfHistory() {
  if (!currentWorkflow) return;
  if (wfHistory.wfId !== currentWorkflow.id) {
    wfHistory.undo = [];
    wfHistory.redo = [];
    wfHistory.wfId = currentWorkflow.id;
  }
  const snap = wfSnapshot();
  if (!snap) return;
  wfHistory.undo.push(snap);
  if (wfHistory.undo.length > 60) wfHistory.undo.shift();
  wfHistory.redo.length = 0;
  updateWfUndoButtons();
}
function applyWfSnapshot(snap) {
  currentWorkflow.nodes = snap.nodes;
  currentWorkflow.edges = snap.edges;
  wfCanvas.selectedNodeId = null;
  wfCanvas.selectedEdgeId = null;
  cancelDraftConnection();
  renderWorkflowCanvas();
  scheduleWfAutosave();
  updateWfUndoButtons();
}
function undoWf() {
  if (!currentWorkflow || wfHistory.undo.length === 0) return;
  wfHistory.redo.push(wfSnapshot());
  applyWfSnapshot(wfHistory.undo.pop());
  logToWfConsole('↶ 已撤销');
}
function redoWf() {
  if (!currentWorkflow || wfHistory.redo.length === 0) return;
  wfHistory.undo.push(wfSnapshot());
  applyWfSnapshot(wfHistory.redo.pop());
  logToWfConsole('↷ 已重做');
}
function updateWfUndoButtons() {
  if (els.btnWfUndo) els.btnWfUndo.disabled = wfHistory.undo.length === 0;
  if (els.btnWfRedo) els.btnWfRedo.disabled = wfHistory.redo.length === 0;
}
/* Push once per field focus so typing a config value doesn't flood the stack
   with per-keystroke snapshots. */
function beginWfFieldEdit(inputEl) {
  if (!inputEl || inputEl.dataset.wfHist) return;
  inputEl.dataset.wfHist = '1';
  inputEl.addEventListener('blur', () => { delete inputEl.dataset.wfHist; }, { once: true });
  pushWfHistory();
}
function duplicateSelectedNode() {
  if (!currentWorkflow || !wfCanvas.selectedNodeId) return;
  const src = currentWorkflow.nodes.find(n => n.id === wfCanvas.selectedNodeId);
  if (!src) return;
  pushWfHistory();
  const copy = structuredClone(src);
  copy.id = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  copy.x = (src.x || 0) + 32;
  copy.y = (src.y || 0) + 32;
  currentWorkflow.nodes.push(copy);
  wfCanvas.selectedNodeId = copy.id;
  renderWorkflowCanvas();
  scheduleWfAutosave();
  logToWfConsole(`⧉ 已复制节点 [${copy.title}] (Ctrl+D)`);
}

// Infinite Canvas & Connection State Machine
const wfCanvas = {
  panX: 0,
  panY: 0,
  scale: 1,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  selectedEdgeId: null,
  selectedNodeId: null,
  connecting: null // { active, fromNodeId, fromType: 'out'|'in', fromPortEl, startX, startY, dragDistance }
};

function applyCanvasTransform() {
  if (els.wfCanvasViewport) {
    els.wfCanvasViewport.style.transform = `translate(${wfCanvas.panX}px, ${wfCanvas.panY}px) scale(${wfCanvas.scale})`;
  }
  if (els.wfCanvasArea) {
    els.wfCanvasArea.style.backgroundPosition = `${wfCanvas.panX}px ${wfCanvas.panY}px`;
    els.wfCanvasArea.style.backgroundSize = `${20 * wfCanvas.scale}px ${20 * wfCanvas.scale}px`;
  }
  if (els.wfZoomScale) {
    els.wfZoomScale.textContent = `${Math.round(wfCanvas.scale * 100)}%`;
  }
}

function screenToCanvas(clientX, clientY) {
  if (!els.wfCanvasArea) return { x: clientX, y: clientY };
  const rect = els.wfCanvasArea.getBoundingClientRect();
  return {
    x: (clientX - rect.left - wfCanvas.panX) / wfCanvas.scale,
    y: (clientY - rect.top - wfCanvas.panY) / wfCanvas.scale
  };
}

function fitWorkflowCanvas() {
  if (!currentWorkflow || !currentWorkflow.nodes || !currentWorkflow.nodes.length || !els.wfCanvasArea) return;
  const nodes = currentWorkflow.nodes;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    const x = n.x || 0, y = n.y || 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + 220);
    maxY = Math.max(maxY, y + 90);
  });
  const rect = els.wfCanvasArea.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const pad = 50;
  const contentW = Math.max(160, maxX - minX + pad * 2);
  const contentH = Math.max(160, maxY - minY + pad * 2);
  const sX = rect.width / contentW;
  const sY = rect.height / contentH;
  const targetScale = Math.min(1.2, Math.max(0.45, Math.min(sX, sY)));

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  wfCanvas.scale = targetScale;
  wfCanvas.panX = (rect.width / 2) - centerX * targetScale;
  wfCanvas.panY = (rect.height / 2) - centerY * targetScale;
  applyCanvasTransform();
}

function cancelDraftConnection() {
  if (!wfCanvas.connecting) return;
  if (wfCanvas.connecting.fromPortEl) {
    wfCanvas.connecting.fromPortEl.classList.remove('connecting-source');
  }
  const draft = els.wfSvgLayer ? els.wfSvgLayer.querySelector('#wfDraftPath') : null;
  if (draft) draft.remove();
  document.querySelectorAll('.wf-port.snap-target').forEach(p => p.classList.remove('snap-target'));
  wfCanvas.connecting = null;
}

function findPortUnderCursor(clientX, clientY) {
  const elements = document.elementsFromPoint(clientX, clientY) || [];
  return elements.find(el => el.classList.contains('wf-port')) || null;
}

function isPortCompatible(portEl, connecting) {
  if (!portEl || !connecting) return false;
  const targetNodeEl = portEl.closest('.wf-node');
  if (!targetNodeEl) return false;
  const targetNodeId = targetNodeEl.dataset.id;
  if (targetNodeId === connecting.fromNodeId) return false; // 禁止节点自身自环
  const isTargetIn = portEl.classList.contains('in');
  return connecting.fromType === 'out' ? isTargetIn : !isTargetIn;
}

function completeConnection(fromNodeId, fromType, targetNodeId, targetType) {
  if (!currentWorkflow) return;
  const src = fromType === 'out' ? fromNodeId : targetNodeId;
  const dst = fromType === 'out' ? targetNodeId : fromNodeId;
  if (!currentWorkflow.edges.some(ed => ed.from === src && ed.to === dst)) {
    const fromNode = currentWorkflow.nodes.find(n => n.id === src);
    const toNode = currentWorkflow.nodes.find(n => n.id === dst);
    pushWfHistory();
    currentWorkflow.edges.push({ id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, from: src, to: dst });
    renderWorkflowCanvas();
    logToWfConsole(`✓ 连线建立成功: [${fromNode?.title || src}] ➔ [${toNode?.title || dst}]`);
  } else {
    logToWfConsole(`⚠️ 节点间已有连线，无需重复连接`);
  }
}

function startDraftConnection(node, portEl, fromType) {
  cancelDraftConnection();
  const startX = fromType === 'out' ? ((node.x || 0) + 220) : (node.x || 0);
  const startY = (node.y || 0) + 38;

  wfCanvas.connecting = {
    active: true,
    fromNodeId: node.id,
    fromType,
    fromPortEl: portEl,
    startX,
    startY,
    dragDistance: 0
  };
  portEl.classList.add('connecting-source');

  let draft = els.wfSvgLayer.querySelector('#wfDraftPath');
  if (!draft) {
    draft = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    draft.setAttribute('id', 'wfDraftPath');
    draft.setAttribute('class', 'wf-draft-path');
    els.wfSvgLayer.appendChild(draft);
  }

  const onMouseMove = (ev) => {
    if (!wfCanvas.connecting || !wfCanvas.connecting.active) return;
    wfCanvas.connecting.dragDistance += Math.hypot(ev.movementX || 0, ev.movementY || 0);
    const canvasPos = screenToCanvas(ev.clientX, ev.clientY);

    let x1, y1, x2, y2;
    if (fromType === 'out') {
      x1 = startX; y1 = startY;
      x2 = canvasPos.x; y2 = canvasPos.y;
    } else {
      x1 = canvasPos.x; y1 = canvasPos.y;
      x2 = startX; y2 = startY;
    }
    const dx = Math.max(30, Math.abs(x2 - x1) * 0.5);
    draft.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);

    const hoveredPort = findPortUnderCursor(ev.clientX, ev.clientY);
    document.querySelectorAll('.wf-port.snap-target').forEach(p => {
      if (p !== hoveredPort) p.classList.remove('snap-target');
    });
    if (hoveredPort && isPortCompatible(hoveredPort, wfCanvas.connecting)) {
      hoveredPort.classList.add('snap-target');
    }
  };

  const onMouseUp = (ev) => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);

    const hoveredPort = findPortUnderCursor(ev.clientX, ev.clientY);
    if (hoveredPort && isPortCompatible(hoveredPort, wfCanvas.connecting)) {
      const targetNodeEl = hoveredPort.closest('.wf-node');
      const targetNodeId = targetNodeEl ? targetNodeEl.dataset.id : null;
      const targetType = hoveredPort.classList.contains('in') ? 'in' : 'out';
      if (targetNodeId) {
        completeConnection(wfCanvas.connecting.fromNodeId, wfCanvas.connecting.fromType, targetNodeId, targetType);
      }
      cancelDraftConnection();
    } else {
      // 若几乎没有拖动位移（小于 6px），说明是单击端口，保留等待目标端口点击
      if (wfCanvas.connecting && wfCanvas.connecting.dragDistance < 6) {
        logToWfConsole(`🔗 已激活端口连接引导，请拖动或点击目标端口成线 (Esc 取消)`);
      } else {
        cancelDraftConnection();
      }
    }
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

async function initWorkflowsView() {
  if (!window.host.listWorkflows) return;
  // Re-fetching on every view switch would silently discard unsaved canvas
  // edits, so bootstrap once; selectWorkflow() refreshes on demand instead.
  if (state.workflowsInited) {
    renderWorkflowLib();
    return;
  }
  state.workflowsInited = true;
  state.workflows = await window.host.listWorkflows().catch(() => []);
  if (state.workflows.length > 0 && !state.currentWorkflowId) {
    state.currentWorkflowId = state.workflows[0].id;
  }
  renderWorkflowSelector();
  renderWorkflowLib();
  loadCurrentWorkflow();
  setTimeout(() => { fitWorkflowCanvas(); }, 40);
}

async function selectWorkflow(id) {
  if (!window.host.listWorkflows) return;
  if (!state.workflows.length || !state.workflows.some(w => w.id === id)) {
    state.workflows = await window.host.listWorkflows().catch(() => state.workflows);
    state.workflowsInited = true;
  }
  if (!state.workflows.some(w => w.id === id)) return;
  state.currentWorkflowId = id;
  renderWorkflowSelector();
  loadCurrentWorkflow();
  setTimeout(() => { fitWorkflowCanvas(); }, 40);
}

function renderWorkflowSelector() {
  if (!els.wfSelect) return;
  els.wfSelect.innerHTML = '';
  state.workflows.forEach(wf => {
    const opt = document.createElement('option');
    opt.value = wf.id;
    opt.textContent = `${wf.name} (${(wf.nodes || []).length} 节点)`;
    if (wf.id === state.currentWorkflowId) opt.selected = true;
    els.wfSelect.appendChild(opt);
  });
}

function loadCurrentWorkflow() {
  currentWorkflow = state.workflows.find(w => w.id === state.currentWorkflowId);
  if (!currentWorkflow && state.workflows.length > 0) {
    currentWorkflow = state.workflows[0];
    state.currentWorkflowId = currentWorkflow.id;
  }
  // 历史栈按工作流隔离：切换目标后清空，避免撤销跨流串档
  if (wfHistory.wfId !== state.currentWorkflowId) {
    wfHistory.undo = [];
    wfHistory.redo = [];
    wfHistory.wfId = state.currentWorkflowId || null;
  }
  cancelDraftConnection();
  wfCanvas.selectedEdgeId = null;
  applyCanvasTransform();
  renderWorkflowCanvas();
  renderWorkflowMeta();
  updateWfUndoButtons();
}

/* --- workflow meta editor (name / desc / auto-trigger switch) ----------------- */
function renderWorkflowMeta() {
  if (!els.wfNameInput) return;
  const has = !!currentWorkflow;
  els.wfNameInput.disabled = !has;
  els.wfDescInput.disabled = !has;
  els.wfEnabledToggle.disabled = !has;
  els.wfNameInput.value = has ? (currentWorkflow.name || '') : '';
  els.wfDescInput.value = has ? (currentWorkflow.desc || '') : '';
  els.wfEnabledToggle.checked = has ? currentWorkflow.enabled !== false : false;
}

let wfAutosaveTimer = null;
function scheduleWfAutosave() {
  clearTimeout(wfAutosaveTimer);
  wfAutosaveTimer = setTimeout(async () => {
    if (!currentWorkflow) return;
    try {
      state.workflows = await window.host.saveWorkflow(currentWorkflow);
      renderWorkflowSelector();
    } catch { /* keep editing; 保存 button still works */ }
  }, 500);
}

/* --- node library catalogue ----------------------------------------------------
   Built-in nodes cover triggers, data sources and composable text/JSON
   utilities; plugin capabilities are appended dynamically below. */
const WF_TRIGGER_TYPE_OPTIONS = [
  ['any', '任意文本'],
  ['application/json', 'JSON'],
  ['text/timestamp', '时间戳'],
  ['text/base64', 'Base64'],
  ['text/hex', 'Hex 十六进制'],
  ['text/unicode', 'Unicode 转义'],
  ['text/url', 'URL'],
  ['text/jwt', 'JWT'],
  ['system/port', '端口号'],
  ['text/plain', '纯文本 (未识别类型)'],
];

const WF_LIB_CATALOG = [
  {
    id: 'triggers', title: '⚡ 触发器 · Triggers', items: [
      { type: 'trigger/clipboard', title: '剪贴板监听', icon: '📋', desc: '剪贴板出现匹配内容时自动运行', config: { type: 'any' } },
      { type: 'trigger/manual', title: '手动 / 快捷键', icon: '🖱️', desc: '点击「运行测试」或从动作抽屉触发' },
    ]
  },
  {
    id: 'sources', title: '📄 数据源 · Sources', items: [
      { type: 'source/text', title: '静态文本', icon: '🔤', desc: '以固定文本作为流程起点', config: { text: '', type: 'text/plain' } },
    ]
  },
  {
    id: 'utils', title: '🧰 内置工具 · Utilities', items: [
      { type: 'util/text-template', title: '文本模板', icon: '🧵', desc: '拼接输出，支持 {{value}} {{type}} {{date}}', config: { template: '{{value}}' } },
      { type: 'util/regex-extract', title: '正则提取', icon: '🔎', desc: '按正则提取命中的内容/捕获组', config: { pattern: '', flags: '', group: 0 } },
      { type: 'util/replace', title: '查找替换', icon: '🔁', desc: '普通文本或正则模式替换', config: { find: '', replace: '', regex: false } },
      { type: 'util/json-field', title: 'JSON 字段提取', icon: '🗂️', desc: '按 a.b[0].c 路径取出字段值', config: { path: '' } },
      { type: 'util/condition', title: '条件判断', icon: '🚦', desc: '不满足时终止该分支下游节点', config: { mode: 'contains', value: '' } },
      { type: 'util/delay', title: '延时等待', icon: '⏱️', desc: '延迟指定毫秒后继续 (0-15000)', config: { ms: 300 } },
    ]
  },
  { id: 'plugins', title: '🧩 插件能力 · Plugin Actions', dynamic: true },
  {
    id: 'outputs', title: '📤 交付输出 · Outputs', items: [
      { type: 'output/clipboard', title: '写入系统剪贴板', icon: '📝', desc: '把结果写回系统剪贴板' },
      { type: 'output/notification', title: '显示系统通知', icon: '🔔', desc: '以系统通知弹窗展示结果' },
      { type: 'output/panel', title: '唤起对应面板', icon: '🚀', desc: '打开指定插件的工具面板' },
    ]
  },
];

function wfPluginLibItems() {
  const items = [];
  state.plugins.forEach(p => {
    if (!p.enabled) return;
    const caps = Array.isArray(p.capabilities) ? p.capabilities : [];
    caps.forEach(cap => {
      const capTitle = cap.title ? (cap.title.zh || cap.title.en || cap.id) : cap.id;
      items.push({
        type: 'action/plugin',
        title: `${p.name.zh || p.id}: ${capTitle}`,
        icon: '🧩',
        desc: `由插件 ${p.id} 提供 · 能力 ${cap.id}`,
        extra: { pluginId: p.id, capabilityId: cap.id }
      });
    });
  });
  return items;
}

function renderWorkflowLib() {
  if (!els.wfLibList) return;
  const q = (state.wfLibQuery || '').trim().toLowerCase();
  els.wfLibList.innerHTML = '';

  WF_LIB_CATALOG.forEach(group => {
    const items = group.dynamic ? wfPluginLibItems() : (group.items || []);
    const matched = q
      ? items.filter(it => `${it.title} ${it.desc || ''} ${it.type}`.toLowerCase().includes(q))
      : items;
    if (matched.length === 0) return;

    const box = document.createElement('details');
    box.className = 'wf-lib-group';
    box.open = true;
    const summary = document.createElement('summary');
    summary.className = 'wf-lib-group-title';
    summary.textContent = `${group.title} (${matched.length})`;
    box.appendChild(summary);

    matched.forEach(item => {
      const el = document.createElement('div');
      el.className = 'wf-lib-item';
      el.setAttribute('draggable', 'true');
      el.innerHTML = `
        <span class="icon">${item.icon || '🧩'}</span>
        <span class="wf-lib-item-text">
          <span class="wf-lib-item-title">${escapeHtml(item.title)}</span>
          <span class="wf-lib-item-desc">${escapeHtml(item.desc || '')}</span>
        </span>`;
      el.title = `${item.desc || ''} (点击或拖拽至画布)`;
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({
          type: item.type, title: item.title, config: item.config || null, extra: item.extra || null
        }));
      });
      el.addEventListener('click', () => addNodeToCanvas(item.type, item.title, {
        ...(item.config || {}), ...(item.extra || {})
      }));
      box.appendChild(el);
    });
    els.wfLibList.appendChild(box);
  });

  if (!els.wfLibList.querySelector('.wf-lib-group')) {
    const empty = document.createElement('div');
    empty.className = 'wf-lib-empty';
    empty.textContent = q ? '没有匹配的节点' : '暂无可用插件能力';
    els.wfLibList.appendChild(empty);
  }
}

/* 点击节点库添加时的默认落点：当前视口中心（拖拽添加会带显式坐标）。
   画布可能被平移/缩放得很远——固定级联偏移会让新节点落在视野外。 */
function defaultNodePosition() {
  const n = currentWorkflow ? currentWorkflow.nodes.length : 0;
  const jitter = (n % 5);
  if (!els.wfCanvasArea) return { x: 120 + jitter * 40, y: 90 + jitter * 40 };
  const rect = els.wfCanvasArea.getBoundingClientRect();
  const cx = (rect.width / 2 - wfCanvas.panX) / wfCanvas.scale;
  const cy = (rect.height / 2 - wfCanvas.panY) / wfCanvas.scale;
  return { x: Math.round(cx - 110 + jitter * 26), y: Math.round(cy - 34 + jitter * 20) };
}

function addNodeToCanvas(type, title, extra = {}) {
  if (!currentWorkflow) return;
  const { config, ...rest } = extra;
  const id = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const pos = extra.x !== undefined ? { x: extra.x, y: extra.y } : defaultNodePosition();
  pushWfHistory();
  const newNode = {
    id,
    type,
    title,
    x: pos.x,
    y: pos.y,
    ...(config && Object.keys(config).length ? { config: { ...config } } : {}),
    ...rest
  };
  currentWorkflow.nodes.push(newNode);
  wfCanvas.selectedNodeId = id;
  renderWorkflowCanvas();
  updateWfUndoButtons();
  logToWfConsole(`+ 已添加节点 [${title}]，可在右侧检查器配置参数`);
}

/* --- per-node-type config summary shown on the canvas card ------------------- */
function wfNodeConfigSummary(node) {
  const cfg = node.config || {};
  switch (node.type) {
    case 'trigger/clipboard': {
      const found = WF_TRIGGER_TYPE_OPTIONS.find(([v]) => v === (cfg.type || 'any'));
      return `匹配: ${found ? found[1] : cfg.type || '任意文本'}`;
    }
    case 'source/text': {
      const txt = String(cfg.text ?? '');
      return txt ? `文本: ${txt.slice(0, 26)}${txt.length > 26 ? '…' : ''}` : '(未设置文本)';
    }
    case 'util/text-template': return `模板: ${String(cfg.template ?? '{{value}}').slice(0, 30)}`;
    case 'util/regex-extract': return `/${cfg.pattern || '?'}/${cfg.flags || ''}`;
    case 'util/replace': return `${cfg.find || '?'} → ${String(cfg.replace ?? '').slice(0, 12)}`;
    case 'util/json-field': return `路径: ${cfg.path || '?'}`;
    case 'util/condition': {
      const labels = { contains: '包含', equals: '等于', startsWith: '开头为', regex: '匹配正则', notEmpty: '非空', empty: '为空' };
      const m = labels[cfg.mode || 'contains'] || cfg.mode;
      return `若 ${m} ${cfg.mode === 'notEmpty' || cfg.mode === 'empty' ? '' : String(cfg.value ?? '').slice(0, 14)}`.trim();
    }
    case 'util/delay': return `延迟 ${cfg.ms || 0}ms`;
    case 'action/plugin': return `${node.pluginId || '?'} : ${node.capabilityId || '?'}`;
    case 'output/panel': {
      if (!node.pluginId) return '(未配置目标插件)';
      const p = state.plugins.find(x => x.id === node.pluginId);
      return `唤起 ${p ? (p.name.zh || p.id) : node.pluginId}`;
    }
    default: return '';
  }
}

/* --- node inspector: edit title & type-specific config for the selection ----- */
const WF_NODE_FIELDS = {
  'trigger/clipboard': [
    { key: 'type', label: '匹配内容类型', kind: 'select', options: WF_TRIGGER_TYPE_OPTIONS, def: 'any' }
  ],
  'source/text': [
    { key: 'text', label: '静态文本内容', kind: 'textarea', def: '' },
    { key: 'type', label: 'MIME 类型', kind: 'text', def: 'text/plain' }
  ],
  'util/text-template': [
    { key: 'template', label: '模板 (支持 {{value}} {{type}} {{date}})', kind: 'textarea', def: '{{value}}' }
  ],
  'util/regex-extract': [
    { key: 'pattern', label: '正则表达式', kind: 'text', def: '' },
    { key: 'flags', label: '标志 (如 gi)', kind: 'text', def: '' },
    { key: 'group', label: '捕获组序号 (0=整体)', kind: 'number', def: 0 }
  ],
  'util/replace': [
    { key: 'find', label: '查找内容', kind: 'text', def: '' },
    { key: 'replace', label: '替换为', kind: 'text', def: '' },
    { key: 'regex', label: '按正则模式替换', kind: 'checkbox', def: false }
  ],
  'util/json-field': [
    { key: 'path', label: '字段路径 (a.b[0].c)', kind: 'text', def: '' }
  ],
  'util/condition': [
    {
      key: 'mode', label: '判断方式', kind: 'select', def: 'contains',
      options: [['contains', '包含…'], ['equals', '等于…'], ['startsWith', '以…开头'], ['regex', '匹配正则…'], ['notEmpty', '内容非空'], ['empty', '内容为空']]
    },
    { key: 'value', label: '判断值 (非空/为空时忽略)', kind: 'text', def: '' }
  ],
  'util/delay': [
    { key: 'ms', label: '延迟毫秒 (0-15000)', kind: 'number', def: 300 }
  ],
  'output/panel': [
    { key: 'pluginId', label: '目标插件', kind: 'plugin', target: 'node' }
  ],
};

function syncWfInspector() {
  if (!els.wfInspector) return;
  const node = currentWorkflow && wfCanvas.selectedNodeId
    ? currentWorkflow.nodes.find(n => n.id === wfCanvas.selectedNodeId)
    : null;
  if (!node) {
    els.wfInspector.hidden = true;
    return;
  }
  renderWfInspector(node);
}

function renderWfInspector(node) {
  els.wfInspector.hidden = false;
  els.wfInspType.textContent = node.type;
  els.wfInspBody.innerHTML = '';

  const makeField = (labelText, inputEl, hint) => {
    const field = document.createElement('label');
    field.className = 'wf-insp-field';
    const lab = document.createElement('span');
    lab.className = 'wf-insp-label';
    lab.textContent = labelText;
    field.append(lab, inputEl);
    if (hint) {
      const h = document.createElement('span');
      h.className = 'wf-insp-hint';
      h.textContent = hint;
      field.appendChild(h);
    }
    return field;
  };

  // title (all node types)
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'wf-insp-input';
  titleInput.value = node.title || '';
  titleInput.addEventListener('input', () => {
    beginWfFieldEdit(titleInput);
    node.title = titleInput.value;
    renderWorkflowCanvas();
  });
  els.wfInspBody.appendChild(makeField('节点标题', titleInput));

  // plugin info (read-only)
  if (node.type === 'action/plugin') {
    const info = document.createElement('div');
    info.className = 'wf-insp-info mono';
    info.textContent = `插件 ${node.pluginId || '?'} · 能力 ${node.capabilityId || '?'}，由插件后端或内置转换执行`;
    els.wfInspBody.appendChild(info);
  }

  const fields = WF_NODE_FIELDS[node.type] || [];
  if (fields.length === 0 && node.type !== 'action/plugin') {
    const info = document.createElement('div');
    info.className = 'wf-insp-info';
    info.textContent = '此节点类型无可配置参数';
    els.wfInspBody.appendChild(info);
  }

  fields.forEach(f => {
    // target:'node' 的字段 (如唤起面板的 pluginId) 写在节点根上而非 config
    const readVal = () => (f.target === 'node' ? node[f.key] : (node.config || {})[f.key]);
    const writeVal = v => {
      if (f.target === 'node') node[f.key] = v;
      else {
        if (!node.config) node.config = {};
        node.config[f.key] = v;
      }
    };
    let input;
    if (f.kind === 'plugin') {
      input = document.createElement('select');
      input.className = 'wf-insp-input';
      const panelPlugins = state.plugins.filter(p => p.enabled && p.panel);
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = panelPlugins.length ? '选择插件…' : '暂无带面板的已启用插件';
      input.appendChild(placeholder);
      panelPlugins.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = window.I18N.lang === 'en' ? (p.name.en || p.name.zh) : (p.name.zh || p.name.en);
        input.appendChild(opt);
      });
      input.value = readVal() ?? '';
      input.addEventListener('change', () => {
        pushWfHistory();
        writeVal(input.value || null);
        renderWorkflowCanvas(); // 末尾会 syncWfInspector 刷新摘要
      });
    } else if (f.kind === 'select') {
      input = document.createElement('select');
      input.className = 'wf-insp-input';
      (f.options || []).forEach(([v, label]) => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = label;
        input.appendChild(opt);
      });
      input.value = readVal() ?? f.def;
      input.addEventListener('change', () => {
        pushWfHistory();
        writeVal(input.value);
        renderWorkflowCanvas();
      });
    } else if (f.kind === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'wf-insp-check';
      input.checked = !!readVal();
      input.addEventListener('change', () => {
        pushWfHistory();
        writeVal(input.checked);
        renderWorkflowCanvas();
      });
    } else if (f.kind === 'textarea') {
      input = document.createElement('textarea');
      input.className = 'wf-insp-input wf-insp-textarea';
      input.rows = 3;
      input.value = readVal() ?? f.def;
      input.addEventListener('input', () => {
        beginWfFieldEdit(input);
        writeVal(input.value);
        renderWorkflowCanvas();
      });
    } else {
      input = document.createElement('input');
      input.type = f.kind === 'number' ? 'number' : 'text';
      input.className = 'wf-insp-input';
      input.value = readVal() ?? f.def;
      input.addEventListener('input', () => {
        beginWfFieldEdit(input);
        writeVal(f.kind === 'number' ? Number(input.value) : input.value);
        renderWorkflowCanvas();
      });
    }
    els.wfInspBody.appendChild(makeField(f.label, input));
  });
}

function renderWorkflowCanvas() {
  if (!els.wfNodesContainer || !els.wfSvgLayer) return;
  els.wfNodesContainer.innerHTML = '';
  els.wfSvgLayer.innerHTML = '';
  if (!currentWorkflow) return;

  // 1. 先渲染 Nodes 元素进 DOM，以便精确获取卡片实际高度及端口位置
  currentWorkflow.nodes.forEach(node => {
    const el = document.createElement('div');
    el.className = 'wf-node' + (wfCanvas.selectedNodeId === node.id ? ' selected' : '');
    el.style.left = `${node.x || 0}px`;
    el.style.top = `${node.y || 0}px`;
    el.dataset.id = node.id;

    let isPluginDisabled = false;
    if (node.type === 'action/plugin' && node.pluginId) {
      const p = state.plugins.find(x => x.id === node.pluginId);
      if (!p || !p.enabled) isPluginDisabled = true;
    }

    const headClass = isPluginDisabled
      ? 'warn'
      : (node.type.startsWith('trigger')
        ? 'trigger'
        : node.type.startsWith('output')
          ? 'output'
          : node.type.startsWith('util/')
            ? 'util'
            : node.type.startsWith('source/')
              ? 'source'
              : 'action');

    const cfgSummary = wfNodeConfigSummary(node);
    el.innerHTML = `
      <div class="wf-node-head ${headClass}">
        <span>${escapeHtml(node.title)}</span>
        <button type="button" class="wf-node-del" title="删除节点">×</button>
      </div>
      <div class="wf-node-body">
        <span class="mono">${escapeHtml(node.type)}</span>
        ${cfgSummary ? `<span class="wf-node-cfg">${escapeHtml(cfgSummary)}</span>` : ''}
        ${isPluginDisabled ? '<span class="wf-node-warn">⚠️ 所属插件已禁用 (熔断保护)</span>' : ''}
      </div>
      ${!node.type.startsWith('trigger') ? '<div class="wf-port in" title="连线入口 (拖拽或点击成线)"></div>' : ''}
      ${!node.type.startsWith('output') ? '<div class="wf-port out" title="连线出口 (按住拖出连线)"></div>' : ''}
    `;

    const delBtn = el.querySelector('.wf-node-del');
    if (delBtn) {
      delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pushWfHistory();
        currentWorkflow.nodes = currentWorkflow.nodes.filter(n => n.id !== node.id);
        currentWorkflow.edges = currentWorkflow.edges.filter(ed => ed.from !== node.id && ed.to !== node.id);
        if (wfCanvas.selectedNodeId === node.id) wfCanvas.selectedNodeId = null;
        renderWorkflowCanvas();
        logToWfConsole(`已删除节点 [${node.title}]`);
      });
    }

    // 卡片右键快捷删除节点
    el.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.wf-port') || e.target.closest('.wf-node-del')) return;
      e.preventDefault();
      e.stopPropagation();
      pushWfHistory();
      currentWorkflow.nodes = currentWorkflow.nodes.filter(n => n.id !== node.id);
      currentWorkflow.edges = currentWorkflow.edges.filter(ed => ed.from !== node.id && ed.to !== node.id);
      if (wfCanvas.selectedNodeId === node.id) wfCanvas.selectedNodeId = null;
      renderWorkflowCanvas();
      logToWfConsole(`✂️ 右键已删除节点 [${node.title}]`);
    });

    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('.wf-port') || e.target.closest('.wf-node-del')) return;
      e.stopPropagation();
      wfCanvas.selectedNodeId = node.id;
      wfCanvas.selectedEdgeId = null;
      document.querySelectorAll('.wf-node.selected').forEach(n => { if (n !== el) n.classList.remove('selected'); });
      el.classList.add('selected');
      el.style.zIndex = 30; // 拖动时提升至最顶层
      syncWfInspector();

      let startX = e.clientX, startY = e.clientY;
      let origX = node.x || 0, origY = node.y || 0;
      let dragHistPushed = false;

      const onMouseMove = (ev) => {
        // 纯点击选中不产生历史；首次真正位移时才入栈
        if (!dragHistPushed) { pushWfHistory(); dragHistPushed = true; }
        node.x = Math.max(10, origX + (ev.clientX - startX) / wfCanvas.scale);
        node.y = Math.max(10, origY + (ev.clientY - startY) / wfCanvas.scale);
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        updateSvgEdgesOnly();
      };
      const onMouseUp = () => {
        el.style.zIndex = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    const outPort = el.querySelector('.wf-port.out');
    if (outPort) {
      outPort.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        startDraftConnection(node, outPort, 'out');
      });
      // 右键输出端口：直接断开从此端口引出的所有连线
      outPort.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const beforeLen = currentWorkflow.edges.length;
        pushWfHistory();
        currentWorkflow.edges = currentWorkflow.edges.filter(ed => ed.from !== node.id);
        if (currentWorkflow.edges.length !== beforeLen) {
          renderWorkflowCanvas();
          logToWfConsole(`✂️ 已断开节点 [${node.title}] 的所有输出连线`);
        }
      });
      outPort.addEventListener('click', (e) => {
        e.stopPropagation();
        if (wfCanvas.connecting && wfCanvas.connecting.fromType === 'in' && wfCanvas.connecting.fromNodeId !== node.id) {
          completeConnection(wfCanvas.connecting.fromNodeId, 'in', node.id, 'out');
          cancelDraftConnection();
        }
      });
    }

    const inPort = el.querySelector('.wf-port.in');
    if (inPort) {
      inPort.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        // 主流脱线交互（拔线/拔插头）：若已有上游连线接入，直接将连线拔出并跟随鼠标，松开空白处即断开，拖至新端口即重连
        const existingInEdge = currentWorkflow.edges.find(ed => ed.to === node.id);
        if (existingInEdge) {
          const upstreamNode = currentWorkflow.nodes.find(n => n.id === existingInEdge.from);
          pushWfHistory();
          currentWorkflow.edges = currentWorkflow.edges.filter(ed => ed !== existingInEdge);
          renderWorkflowCanvas();
          if (upstreamNode) {
            const upstreamEl = els.wfNodesContainer.querySelector(`.wf-node[data-id="${upstreamNode.id}"]`);
            const upstreamOutPort = upstreamEl ? upstreamEl.querySelector('.wf-port.out') : inPort;
            startDraftConnection(upstreamNode, upstreamOutPort, 'out');
            logToWfConsole(`✂️ 已拔出连线 [${upstreamNode.title} ➔ ${node.title}]：甩至空白处松手即断开，或拖至新端口重连`);
            return;
          }
        }
        startDraftConnection(node, inPort, 'in');
      });
      // 右键输入端口：直接断开接入此端口的所有连线
      inPort.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const beforeLen = currentWorkflow.edges.length;
        pushWfHistory();
        currentWorkflow.edges = currentWorkflow.edges.filter(ed => ed.to !== node.id);
        if (currentWorkflow.edges.length !== beforeLen) {
          renderWorkflowCanvas();
          logToWfConsole(`✂️ 已断开节点 [${node.title}] 的所有输入连线`);
        }
      });
      inPort.addEventListener('click', (e) => {
        e.stopPropagation();
        if (wfCanvas.connecting && wfCanvas.connecting.fromType === 'out' && wfCanvas.connecting.fromNodeId !== node.id) {
          completeConnection(wfCanvas.connecting.fromNodeId, 'out', node.id, 'in');
          cancelDraftConnection();
        }
      });
    }

    els.wfNodesContainer.appendChild(el);
  });

  // 2. 渲染 SVG Edges (Cubic Bézier)，端点精准对齐真实端口中心，支持悬停徽标、右键及点击断开
  (currentWorkflow.edges || []).forEach(edge => {
    const fromNode = currentWorkflow.nodes.find(n => n.id === edge.from);
    const toNode = currentWorkflow.nodes.find(n => n.id === edge.to);
    if (!fromNode || !toNode) return;

    const fromEl = els.wfNodesContainer.querySelector(`.wf-node[data-id="${edge.from}"]`);
    const toEl = els.wfNodesContainer.querySelector(`.wf-node[data-id="${edge.to}"]`);

    const x1 = (fromNode.x || 0) + 220;
    const y1 = (fromNode.y || 0) + (fromEl ? (fromEl.offsetHeight / 2) : 36);
    const x2 = (toNode.x || 0);
    const y2 = (toNode.y || 0) + (toEl ? (toEl.offsetHeight / 2) : 36);

    const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    const edgeKey = edge.id || `edge-${edge.from}-${edge.to}`;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'wf-edge-group' + (wfCanvas.selectedEdgeId === edgeKey ? ' selected' : ''));
    g.setAttribute('id', `edge-group-${edge.from}-${edge.to}`);
    g.setAttribute('data-id', edgeKey);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('id', `edge-${edge.from}-${edge.to}`);
    path.setAttribute('class', 'wf-edge-line');
    path.setAttribute('data-id', edgeKey);
    path.style.cursor = 'pointer';

    const removeThisEdge = (actionDesc = '断开') => {
      pushWfHistory();
      currentWorkflow.edges = currentWorkflow.edges.filter(x => x !== edge);
      if (wfCanvas.selectedEdgeId === edgeKey) wfCanvas.selectedEdgeId = null;
      renderWorkflowCanvas();
      logToWfConsole(`✂️ ${actionDesc}连线: [${fromNode.title}] ➔ [${toNode.title}]`);
    };

    // 右键点击连线直接断开
    path.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeThisEdge('右键已断开');
    });

    path.addEventListener('click', (e) => {
      e.stopPropagation();
      if (wfCanvas.selectedEdgeId === edgeKey) {
        removeThisEdge('再次点击已断开');
      } else {
        wfCanvas.selectedEdgeId = edgeKey;
        renderWorkflowCanvas();
        logToWfConsole(`已选中连线 [${fromNode.title} ➔ ${toNode.title}]，按 Delete 键或右键/点击 × 即可断开`);
      }
    });

    g.appendChild(path);

    // 悬停中点微型删除徽标 (Hover Delete Badge)
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    badge.setAttribute('class', 'wf-edge-badge');
    badge.setAttribute('id', `edge-badge-${edge.from}-${edge.to}`);
    badge.setAttribute('transform', `translate(${midX}, ${midY})`);
    badge.setAttribute('title', '点击断开此连线');
    badge.innerHTML = `
      <circle cx="0" cy="0" r="8.5"></circle>
      <text x="0" y="0.5">✕</text>
    `;
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      removeThisEdge('点击徽标已断开');
    });
    badge.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeThisEdge('右键已断开');
    });

    g.appendChild(badge);
    els.wfSvgLayer.appendChild(g);
  });

  syncWfInspector();
}

function updateSvgEdgesOnly() {
  if (!currentWorkflow || !els.wfSvgLayer) return;
  (currentWorkflow.edges || []).forEach(edge => {
    const fromNode = currentWorkflow.nodes.find(n => n.id === edge.from);
    const toNode = currentWorkflow.nodes.find(n => n.id === edge.to);
    if (!fromNode || !toNode) return;
    const path = els.wfSvgLayer.querySelector(`#edge-${edge.from}-${edge.to}`);
    const badge = els.wfSvgLayer.querySelector(`#edge-badge-${edge.from}-${edge.to}`);
    if (path) {
      const fromEl = els.wfNodesContainer.querySelector(`.wf-node[data-id="${edge.from}"]`);
      const toEl = els.wfNodesContainer.querySelector(`.wf-node[data-id="${edge.to}"]`);
      const x1 = (fromNode.x || 0) + 220;
      const y1 = (fromNode.y || 0) + (fromEl ? (fromEl.offsetHeight / 2) : 36);
      const x2 = (toNode.x || 0);
      const y2 = (toNode.y || 0) + (toEl ? (toEl.offsetHeight / 2) : 36);
      const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
      path.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
      if (badge) {
        badge.setAttribute('transform', `translate(${(x1 + x2) / 2}, ${(y1 + y2) / 2})`);
      }
    }
  });
}

function logToWfConsole(msg) {
  if (!els.wfConsoleBody) return;
  const ts = new Date().toLocaleTimeString();
  els.wfConsoleBody.textContent = `[${ts}] ${msg}\n` + els.wfConsoleBody.textContent;
}

async function runCurrentWorkflow() {
  if (!currentWorkflow) return;
  const testInputVal = els.wfTestInput ? els.wfTestInput.value.trim() : '';
  let initialPayload;
  if (testInputVal) {
    initialPayload = { type: 'text/plain', value: testInputVal };
    logToWfConsole(`▶ 使用输入框测试数据执行 [${currentWorkflow.name}]…`);
  } else {
    const clip = await window.host.readClipboardText().catch(() => '');
    if (clip && clip.trim()) {
      initialPayload = { type: 'text/plain', value: clip };
      logToWfConsole(`▶ 输入框为空，已改用剪贴板内容 (${clip.length} 字符) 执行 [${currentWorkflow.name}]…`);
    } else {
      initialPayload = { type: 'text/plain', value: '' };
      logToWfConsole(`▶ 输入框与剪贴板均为空，以空数据执行 [${currentWorkflow.name}]…`);
    }
  }

  const paths = els.wfSvgLayer.querySelectorAll('path');
  paths.forEach(p => p.classList.add('active'));

  try {
    // Run Test executes against the main-process copy — sync unsaved canvas
    // edits first so what you see is exactly what runs.
    state.workflows = await window.host.saveWorkflow(currentWorkflow);
    renderWorkflowSelector();
    const res = await window.host.runWorkflow(currentWorkflow.id, initialPayload);
    paths.forEach(p => p.classList.remove('active'));

    if (res.ok) {
      const totalMs = (res.logs || []).reduce((acc, l) => acc + (l.duration || 0), 0);
      logToWfConsole(`✓ 工作流执行成功！总耗时: ${totalMs}ms`);
      (res.logs || []).forEach(l => {
        if (!l.ok) logToWfConsole(`  ├─ ❌ 节点 [${l.title}]: ${l.error || '执行失败'}`);
        else logToWfConsole(`  ├─ ${l.skipped ? '⏭' : '✓'} 节点 [${l.title}]: ${l.summary || 'OK'}${l.duration ? ` (${l.duration}ms)` : ''}`);
      });
      if (res.finalOutput) {
        logToWfConsole(`  └─ 最终输出: ${JSON.stringify(res.finalOutput.value ?? res.finalOutput)}`);
      }
    } else {
      logToWfConsole(`❌ 执行异常: ${res.error}`);
      (res.logs || []).filter(l => !l.ok).forEach(l => {
        logToWfConsole(`  ├─ ❌ 节点 [${l.title}]: ${l.error || ''}`);
      });
    }
  } catch (err) {
    paths.forEach(p => p.classList.remove('active'));
    logToWfConsole(`❌ 系统调用失败: ${err.message}`);
  }
}

// Canvas & Toolbar Events
if (els.wfCanvasArea) {
  els.wfCanvasArea.addEventListener('mousedown', (e) => {
    const isBlankTarget = (e.target === els.wfCanvasArea || e.target === els.wfSvgLayer || e.target === els.wfCanvasViewport || e.target === els.wfNodesContainer);
    if (isBlankTarget || e.button === 1) {
      cancelDraftConnection();
      if (wfCanvas.selectedNodeId) {
        wfCanvas.selectedNodeId = null;
        document.querySelectorAll('.wf-node.selected').forEach(n => n.classList.remove('selected'));
        syncWfInspector();
      }
      if (wfCanvas.selectedEdgeId) {
        wfCanvas.selectedEdgeId = null;
        renderWorkflowCanvas();
      }
      wfCanvas.isPanning = true;
      els.wfCanvasArea.classList.add('panning');
      wfCanvas.panStartX = e.clientX - wfCanvas.panX;
      wfCanvas.panStartY = e.clientY - wfCanvas.panY;

      const onPanMove = (ev) => {
        if (!wfCanvas.isPanning) return;
        wfCanvas.panX = ev.clientX - wfCanvas.panStartX;
        wfCanvas.panY = ev.clientY - wfCanvas.panStartY;
        applyCanvasTransform();
      };
      const onPanUp = () => {
        wfCanvas.isPanning = false;
        els.wfCanvasArea.classList.remove('panning');
        window.removeEventListener('mousemove', onPanMove);
        window.removeEventListener('mouseup', onPanUp);
      };
      window.addEventListener('mousemove', onPanMove);
      window.addEventListener('mouseup', onPanUp);
    }
  });

  els.wfCanvasArea.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = els.wfCanvasArea.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const newScale = Math.min(1.8, Math.max(0.4, wfCanvas.scale * zoomFactor));
    if (newScale !== wfCanvas.scale) {
      wfCanvas.panX = mouseX - (mouseX - wfCanvas.panX) * (newScale / wfCanvas.scale);
      wfCanvas.panY = mouseY - (mouseY - wfCanvas.panY) * (newScale / wfCanvas.scale);
      wfCanvas.scale = newScale;
      applyCanvasTransform();
    }
  }, { passive: false });

  els.wfCanvasArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  els.wfCanvasArea.addEventListener('drop', (e) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const pos = screenToCanvas(e.clientX, e.clientY);
      addNodeToCanvas(data.type, data.title, {
        x: Math.round(pos.x - 110),
        y: Math.round(pos.y - 30),
        ...(data.extra || {})
      });
    } catch {}
  });
}

if (els.btnWfZoomIn) {
  els.btnWfZoomIn.addEventListener('click', () => {
    wfCanvas.scale = Math.min(1.8, wfCanvas.scale * 1.15);
    applyCanvasTransform();
  });
}
if (els.btnWfZoomOut) {
  els.btnWfZoomOut.addEventListener('click', () => {
    wfCanvas.scale = Math.max(0.4, wfCanvas.scale * 0.85);
    applyCanvasTransform();
  });
}
if (els.btnWfResetView) {
  els.btnWfResetView.addEventListener('click', () => {
    wfCanvas.scale = 1;
    wfCanvas.panX = 0;
    wfCanvas.panY = 0;
    applyCanvasTransform();
  });
}
if (els.btnWfFitView) {
  els.btnWfFitView.addEventListener('click', () => {
    fitWorkflowCanvas();
  });
}

// Sidebar width resizer (水平边缘拖拽调整)
if (els.wfSidebarResizer && els.wfSidebar) {
  try {
    const savedW = localStorage.getItem('orbit.wfSidebarWidth');
    if (savedW) document.documentElement.style.setProperty('--wf-sidebar-w', `${savedW}px`);
  } catch {}

  els.wfSidebarResizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    els.wfSidebarResizer.classList.add('resizing');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    const startX = e.clientX;
    const origW = els.wfSidebar.getBoundingClientRect().width;

    const onMove = (ev) => {
      const newW = Math.min(480, Math.max(170, Math.round(origW + (ev.clientX - startX))));
      document.documentElement.style.setProperty('--wf-sidebar-w', `${newW}px`);
    };
    const onUp = (ev) => {
      els.wfSidebarResizer.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const finalW = Math.min(480, Math.max(170, Math.round(origW + (ev.clientX - startX))));
      try { localStorage.setItem('orbit.wfSidebarWidth', String(finalW)); } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

// Console height resizer (垂直边缘拖拽调整)
if (els.wfConsoleResizer && els.wfConsole) {
  try {
    const savedH = localStorage.getItem('orbit.wfConsoleHeight');
    if (savedH) document.documentElement.style.setProperty('--wf-console-h', `${savedH}px`);
  } catch {}

  els.wfConsoleResizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    els.wfConsoleResizer.classList.add('resizing');
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    const startY = e.clientY;
    const origH = els.wfConsole.getBoundingClientRect().height;

    const onMove = (ev) => {
      const newH = Math.min(520, Math.max(65, Math.round(origH + (startY - ev.clientY))));
      document.documentElement.style.setProperty('--wf-console-h', `${newH}px`);
    };
    const onUp = (ev) => {
      els.wfConsoleResizer.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const finalH = Math.min(520, Math.max(65, Math.round(origH + (startY - ev.clientY))));
      try { localStorage.setItem('orbit.wfConsoleHeight', String(finalH)); } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

// Global Keyboard Events for Workflow
window.addEventListener('keydown', (e) => {
  if (state.view !== 'workflows') return;
  if (e.key === 'Escape') {
    cancelDraftConnection();
    if (wfCanvas.selectedEdgeId) {
      wfCanvas.selectedEdgeId = null;
      renderWorkflowCanvas();
    }
    return;
  }
  const ae = document.activeElement;
  const aeTag = ae && ae.tagName;
  const typing = aeTag === 'INPUT' || aeTag === 'TEXTAREA' || aeTag === 'SELECT' || (ae && ae.isContentEditable);
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    if (e.shiftKey) redoWf(); else undoWf();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing && (e.key === 'y' || e.key === 'Y')) {
    e.preventDefault();
    redoWf();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing && (e.key === 'd' || e.key === 'D')) {
    e.preventDefault();
    duplicateSelectedNode();
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && currentWorkflow) {
    if (typing) return;
    if (wfCanvas.selectedNodeId) {
      const targetNode = currentWorkflow.nodes.find(n => n.id === wfCanvas.selectedNodeId);
      if (targetNode) {
        pushWfHistory();
        currentWorkflow.nodes = currentWorkflow.nodes.filter(n => n.id !== targetNode.id);
        currentWorkflow.edges = currentWorkflow.edges.filter(ed => ed.from !== targetNode.id && ed.to !== targetNode.id);
        wfCanvas.selectedNodeId = null;
        renderWorkflowCanvas();
        logToWfConsole(`✓ 已删除选中的节点 [${targetNode.title}]`);
        return;
      }
    }
    const removedEdge = currentWorkflow.edges.find(ed => (ed.id || `edge-${ed.from}-${ed.to}`) === wfCanvas.selectedEdgeId);
    if (removedEdge) {
      pushWfHistory();
      currentWorkflow.edges = currentWorkflow.edges.filter(ed => ed !== removedEdge);
      wfCanvas.selectedEdgeId = null;
      renderWorkflowCanvas();
      logToWfConsole(`✓ 已删除选中的连线`);
    }
  }
});

if (els.wfSelect) {
  els.wfSelect.addEventListener('change', () => {
    state.currentWorkflowId = els.wfSelect.value;
    loadCurrentWorkflow();
  });
}
if (els.btnWfNew) {
  els.btnWfNew.addEventListener('click', async () => {
    const id = `wf-${Date.now()}`;
    const newWf = {
      id,
      name: `新建工作流 ${state.workflows.length + 1}`,
      desc: '',
      enabled: true,
      nodes: [
        { id: 'node-1', type: 'trigger/manual', title: '手动触发', x: 80, y: 120 }
      ],
      edges: []
    };
    state.workflows.push(newWf);
    state.currentWorkflowId = id;
    renderWorkflowSelector();
    loadCurrentWorkflow();
    await window.host.saveWorkflow(newWf).catch(() => {});
    state.workflows = await window.host.listWorkflows().catch(() => state.workflows);
    renderWorkflowSelector();
    logToWfConsole(`✓ 已创建新工作流，直接在上方输入名称与描述即可 (自动保存)`);
    // 引导用户立即命名：聚焦并全选名称输入框
    if (els.wfNameInput) {
      els.wfNameInput.focus();
      els.wfNameInput.select();
    }
  });
}
if (els.wfNameInput) {
  els.wfNameInput.addEventListener('input', () => {
    if (!currentWorkflow) return;
    currentWorkflow.name = els.wfNameInput.value;
    renderWorkflowSelector();
    scheduleWfAutosave();
  });
}
if (els.wfDescInput) {
  els.wfDescInput.addEventListener('input', () => {
    if (!currentWorkflow) return;
    currentWorkflow.desc = els.wfDescInput.value;
    scheduleWfAutosave();
  });
}
if (els.wfEnabledToggle) {
  els.wfEnabledToggle.addEventListener('change', () => {
    if (!currentWorkflow) return;
    currentWorkflow.enabled = els.wfEnabledToggle.checked;
    scheduleWfAutosave();
    logToWfConsole(currentWorkflow.enabled
      ? '⚡ 已启用自动触发：匹配的剪贴板内容变化将自动运行此工作流'
      : '🛑 已禁用自动触发：仅可手动运行测试');
  });
}
if (els.wfLibSearch) {
  els.wfLibSearch.addEventListener('input', () => {
    state.wfLibQuery = els.wfLibSearch.value;
    renderWorkflowLib();
  });
}
if (els.wfInspClose) {
  els.wfInspClose.addEventListener('click', () => {
    wfCanvas.selectedNodeId = null;
    document.querySelectorAll('.wf-node.selected').forEach(n => n.classList.remove('selected'));
    syncWfInspector();
  });
}
if (els.btnWfSave) {
  els.btnWfSave.addEventListener('click', async () => {
    if (!currentWorkflow) return;
    state.workflows = await window.host.saveWorkflow(currentWorkflow);
    renderWorkflowSelector();
    const orig = els.btnWfSave.textContent;
    els.btnWfSave.textContent = '✓ 已保存';
    setTimeout(() => { if (els.btnWfSave) els.btnWfSave.textContent = orig; }, 1000);
    logToWfConsole(`✓ 工作流 [${currentWorkflow.name}] 已保存`);
  });
}
if (els.btnWfUndo) {
  els.btnWfUndo.addEventListener('click', () => undoWf());
}
if (els.btnWfRedo) {
  els.btnWfRedo.addEventListener('click', () => redoWf());
}
if (els.btnWfDelete) {
  els.btnWfDelete.addEventListener('click', async () => {
    if (!currentWorkflow) return;
    if (confirm(`确定删除工作流 "${currentWorkflow.name}" 吗？`)) {
      state.workflows = await window.host.deleteWorkflow(currentWorkflow.id);
      state.currentWorkflowId = state.workflows.length > 0 ? state.workflows[0].id : null;
      renderWorkflowSelector();
      loadCurrentWorkflow();
      logToWfConsole(`已删除工作流`);
    }
  });
}
if (els.btnWfRun) {
  els.btnWfRun.addEventListener('click', () => runCurrentWorkflow());
}
if (els.btnWfClearConsole) {
  els.btnWfClearConsole.addEventListener('click', () => {
    if (els.wfConsoleBody) els.wfConsoleBody.textContent = '日志已清空';
  });
}

window.host.onPaletteFocus(() => {
  if (state.view === 'home') {
    els.search.focus();
    els.search.select();
    checkClipboardSmartPeek();
  }
});

// 自动触发 (剪贴板监听等) 的执行结果实时镜像到工作流控制台
if (window.host.onWorkflowEvent) {
  window.host.onWorkflowEvent(p => {
    if (!p) return;
    if (p.event === 'auto-skip') {
      logToWfConsole(`⏭ 类型不匹配已跳过 [${p.name}] (需 ${p.need} · 实际 ${p.detectedType})`);
      return;
    }
    if (p.event !== 'auto-run') return;
    if (p.ok) {
      const totalMs = (p.logs || []).reduce((acc, l) => acc + (l.duration || 0), 0);
      logToWfConsole(`⚡ 自动触发 [${p.name}] (剪贴板 · ${p.detectedType}) ✓ 成功 · ${totalMs}ms`);
    } else {
      logToWfConsole(`⚡ 自动触发 [${p.name}] (剪贴板 · ${p.detectedType}) ❌ 失败: ${p.error || '未知错误'}`);
    }
  });
}

// 供 UI 自动化测试驱动工作流视图
window.__wfTestApi = {
  selectWorkflow,
  runCurrentWorkflow,
  addNodeToCanvas,
  getCurrentWorkflow: () => currentWorkflow,
  getCanvasState: () => ({ ...wfCanvas }),
};
if (window.host.onOpenPlugin) {
  window.host.onOpenPlugin(id => {
    openPlugin(id);
  });
}
if (window.host.onNavigateTo) {
  window.host.onNavigateTo(opts => {
    if (!opts) return;
    if (opts.view === 'panel' && opts.pluginId) {
      openPlugin(opts.pluginId, { payload: opts.payload });
    } else if (opts.view === 'workflows') {
      closePanel();
      setView('workflows');
      if (opts.workflowId && typeof selectWorkflow === 'function') {
        // 悬浮抽屉「运行工作流」条目带 run:true — 选中后立即执行
        selectWorkflow(opts.workflowId).then(() => {
          if (opts.run && typeof runCurrentWorkflow === 'function') {
            setTimeout(() => runCurrentWorkflow(), 60);
          }
        });
      }
    } else if (opts.view) {
      closePanel();
      setView(opts.view);
    }
  });
}

if (window.host.onOpenActionPalette) {
  window.host.onOpenActionPalette(payload => {
    if (state.actionPaletteOpen && payload && payload.wasActive) {
      closeActionPalette();
      window.host.win('hide');
    } else {
      openActionPalette();
    }
  });
}

/* --- action palette controller ------------------------------------------------ */
let hoveredPlugin = null;

function matchHotkey(e, targetAccel) {
  if (!targetAccel) return false;
  const current = accelFromEvent(e);
  if (!current) return false;
  return current.toLowerCase() === targetAccel.toLowerCase();
}

async function collectActionPaletteItems() {
  const items = [];
  const lang = window.I18N.lang;
  const isZh = lang !== 'en';

  // 1. 正在浏览的上下文插件
  const activePlugin = (state.view === 'panel' && state.plugins.find(p => p.id === state.openId))
    || state.ctxTargetPlugin
    || hoveredPlugin;

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
    // 统一走共享检测模块（含 base64），与悬浮抽屉 / Smart Peek 行为一致
    const detected = window.PayloadType.detect(currentText);
    const type = detected ? detected.type : 'text/plain';

    const envelope = { type, value: currentText };
    // 固定排序让默认 Enter 行为可预期
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
        run: () => openPlugin(pa.pluginId, { payload: envelope }),
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
          openPlugin(p.id);
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
            openPlugin(p.id);
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
          setView('workflows');
          // await the switch — a fixed timer could fire before the async
          // selection finished and run the PREVIOUS workflow
          if (typeof selectWorkflow === 'function') await selectWorkflow(wf.id);
          if (state.currentWorkflowId === wf.id && typeof runCurrentWorkflow === 'function') {
            runCurrentWorkflow();
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
    () => { closePanel(); setView('home'); });
  sys('🧩', isZh ? '打开插件中心' : 'Plugin Center', 'View', 'plugin center 插件中心 市场', 'sys:plugins',
    () => { closePanel(); setView('plugins'); });
  sys('🔀', isZh ? '打开工作流画布' : 'Workflow Canvas', 'View', 'workflow 工作流 画布 DAG', 'sys:workflows',
    () => { closePanel(); setView('workflows'); });
  sys('⚙️', isZh ? '打开偏好设置' : 'Preferences', 'View', 'settings 设置 偏好', 'sys:settings',
    () => { closePanel(); setView('settings'); });
  sys('🔄', isZh ? '重新扫描插件' : 'Rescan Plugins', 'Action', 'rescan 重新扫描 刷新插件', 'sys:rescan',
    async () => {
      const res = await window.host.rescanPlugins();
      state.plugins = [...res.plugins].sort((a, b) => a.id.localeCompare(b.id));
      state.hotkeys = res.hotkeys;
      renderDeck(); renderPlugins(); renderSettings();
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
      applyTheme(next);
    });
  sys('🌐', isZh ? '切换界面语言 (中文 / English)' : 'Switch Language', 'Pref', 'language 语言 中文 英文 english', 'sys:lang',
    async () => {
      const next = state.config.lang === 'zh' ? 'en' : 'zh';
      state.config.lang = next;
      await window.host.setPref('lang', next);
      applyLang(next);
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
  state.actionPaletteItems = await collectActionPaletteItems();
  state.actionPaletteIndex = 0;
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
}

function trackActionRun(item) {
  if (!item || !item.usageId || !window.host.bumpUsage) return;
  const u = state.usage[item.usageId] || { n: 0, t: 0 };
  u.n += 1;
  u.t = Date.now();
  state.usage[item.usageId] = u;
  window.host.bumpUsage(item.usageId)
    .then(us => { if (us && us[item.usageId]) state.usage = us; })
    .catch(() => {});
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
    state.actionPaletteItems, q, state.usage, window.I18N.lang === 'en'
  );

  if (state.actionPaletteIndex >= state.actionPaletteFiltered.length) {
    state.actionPaletteIndex = Math.max(0, state.actionPaletteFiltered.length - 1);
  }

  els.apList.innerHTML = '';
  if (state.actionPaletteFiltered.length === 0) {
    els.apList.innerHTML = `<div class="ap-empty">${window.I18N && window.I18N.lang === 'en' ? 'No matching plugins or actions' : '无匹配的插件或动作'}</div>`;
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

window.addEventListener('keydown', e => {
  if (state.actionPaletteOpen) {
    if (e.altKey && /^[1-9]$/.test(e.key)) {
      const item = state.actionPaletteFiltered[Number(e.key) - 1];
      if (item) {
        e.preventDefault();
        executeActionPaletteItem(item);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeActionPalette();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (state.actionPaletteFiltered.length > 0) {
        state.actionPaletteIndex = (state.actionPaletteIndex + 1) % state.actionPaletteFiltered.length;
        updateActionPaletteSelection();
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (state.actionPaletteFiltered.length > 0) {
        state.actionPaletteIndex = (state.actionPaletteIndex - 1 + state.actionPaletteFiltered.length) % state.actionPaletteFiltered.length;
        updateActionPaletteSelection();
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      executeActionPaletteItem(state.actionPaletteFiltered[state.actionPaletteIndex]);
      return;
    }
    return;
  }

  // 匹配动作面板自定义快捷键 (默认 Ctrl+K，同时软件内也始终支持 Ctrl+K)
  const apHotkey = state.config.actionPaletteHotkey || 'Ctrl+K';
  if (matchHotkey(e, apHotkey) || (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K'))) {
    e.preventDefault();
    openActionPalette();
    return;
  }

  if (e.key === 'Escape' && state.view === 'panel') { closePanel(); setView('home'); window.host.win('hide'); }
  else if (e.key === 'Escape' && state.view === 'dev-guide') { setView('plugins'); }
  else if (e.key === 'Escape' && state.view === 'home') {
    if (state.smartPeekData) hideSmartPeek();
    else if (els.search.value) { els.search.value = ''; state.query = ''; renderDeck(); }
    else window.host.win('hide');
  }
});

init();
