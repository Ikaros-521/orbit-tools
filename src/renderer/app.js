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
  wfSidebar: $('wfSidebar'), wfSidebarResizer: $('wfSidebarResizer'), wfConsoleResizer: $('wfConsoleResizer'),
  wfCanvasArea: $('wfCanvasArea'), wfCanvasViewport: $('wfCanvasViewport'), wfCanvasControls: $('wfCanvasControls'),
  wfSvgLayer: $('wfSvgLayer'), wfNodesContainer: $('wfNodesContainer'),
  btnWfZoomIn: $('btnWfZoomIn'), wfZoomScale: $('wfZoomScale'), btnWfZoomOut: $('btnWfZoomOut'),
  btnWfFitView: $('btnWfFitView'), btnWfResetView: $('btnWfResetView'),
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
  // Workflows canvas state
  workflows: [],
  currentWorkflowId: null,
  wfConnectingFrom: null,
  // Plugins center state
  pluginQuery: '',
  pluginCat: 'all',
  pluginStatus: 'all',
  pluginPage: 1,
  pageSize: 4,
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
  return [p.id, p.name.zh, p.name.en, p.desc.zh, p.desc.en, ...p.keywords].join('\n').toLowerCase();
}
function renderDeck() {
  const q = state.query.trim().toLowerCase();
  const shown = state.plugins.filter(p => p.enabled && (!q || pluginText(p).includes(q)));
  els.deck.innerHTML = '';
  for (const p of shown) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
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
    card.addEventListener('mouseenter', () => { hoveredPlugin = p; });
    card.addEventListener('mouseleave', () => { if (hoveredPlugin === p) hoveredPlugin = null; });
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
    els.deck.appendChild(card);
  }
  const enabledCount = state.plugins.filter(p => p.enabled).length;
  els.deckMeta.textContent = q ? t('deckMeta', { n: shown.length }) : t('deckMeta', { n: enabledCount });
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
  renderDeck();
  checkClipboardSmartPeek();
});
els.search.addEventListener('keydown', e => {
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
    const q = state.query.trim().toLowerCase();
    const first = state.plugins.find(p => p.enabled && (!q || pluginText(p).includes(q)));
    if (first) openPlugin(first.id);
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
  state.workflows = await window.host.listWorkflows().catch(() => []);
  if (state.workflows.length > 0 && !state.currentWorkflowId) {
    state.currentWorkflowId = state.workflows[0].id;
  }
  renderWorkflowSelector();
  renderWorkflowLib();
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
  cancelDraftConnection();
  wfCanvas.selectedEdgeId = null;
  applyCanvasTransform();
  renderWorkflowCanvas();
}

function renderWorkflowLib() {
  if (!els.wfLibList) return;
  els.wfLibList.innerHTML = '';

  // 1. Triggers
  const trigGroup = document.createElement('div');
  trigGroup.className = 'wf-lib-group-title';
  trigGroup.textContent = '1. 触发节点 (Triggers)';
  els.wfLibList.appendChild(trigGroup);

  const triggers = [
    { type: 'trigger/clipboard', title: '剪贴板监听', icon: '📋', desc: '监听剪贴板特定内容' },
    { type: 'trigger/manual', title: '手动 / 快捷键', icon: '⚡', desc: '按快捷键或手动触发' }
  ];
  triggers.forEach(t => {
    const item = document.createElement('div');
    item.className = 'wf-lib-item';
    item.setAttribute('draggable', 'true');
    item.innerHTML = `<span class="icon">${t.icon}</span> <span>${t.title}</span>`;
    item.title = `${t.desc} (点击或拖拽至画布)`;
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: t.type, title: t.title }));
    });
    item.addEventListener('click', () => addNodeToCanvas(t.type, t.title));
    els.wfLibList.appendChild(item);
  });

  // 2. Plugin Actions (Dynamic from state.plugins capabilities)
  const actGroup = document.createElement('div');
  actGroup.className = 'wf-lib-group-title';
  actGroup.textContent = '2. 插件能力 (Actions)';
  els.wfLibList.appendChild(actGroup);

  state.plugins.forEach(p => {
    if (!p.enabled) return;
    const caps = Array.isArray(p.capabilities) ? p.capabilities : [];
    caps.forEach(cap => {
      const item = document.createElement('div');
      item.className = 'wf-lib-item';
      item.setAttribute('draggable', 'true');
      const title = cap.title ? (cap.title.zh || cap.title.en || cap.id) : cap.id;
      item.innerHTML = `<span class="icon">🧩</span> <span>${escapeHtml(p.name.zh || p.id)}: ${escapeHtml(title)}</span>`;
      item.title = `由插件 [${p.name.zh || p.id}] 提供 (点击或拖拽至画布)`;
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({
          type: 'action/plugin',
          title: `${p.name.zh || p.id}: ${title}`,
          extra: { pluginId: p.id, capabilityId: cap.id }
        }));
      });
      item.addEventListener('click', () => addNodeToCanvas('action/plugin', `${p.name.zh || p.id}: ${title}`, {
        pluginId: p.id,
        capabilityId: cap.id
      }));
      els.wfLibList.appendChild(item);
    });
  });

  // 3. Outputs
  const outGroup = document.createElement('div');
  outGroup.className = 'wf-lib-group-title';
  outGroup.textContent = '3. 交付输出 (Outputs)';
  els.wfLibList.appendChild(outGroup);

  const outputs = [
    { type: 'output/clipboard', title: '写入系统剪贴板', icon: '📝' },
    { type: 'output/notification', title: '显示系统通知', icon: '🔔' },
    { type: 'output/panel', title: '唤起对应面板', icon: '🚀' }
  ];
  outputs.forEach(o => {
    const item = document.createElement('div');
    item.className = 'wf-lib-item';
    item.setAttribute('draggable', 'true');
    item.innerHTML = `<span class="icon">${o.icon}</span> <span>${o.title}</span>`;
    item.title = '交付目标节点 (点击或拖拽至画布)';
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: o.type, title: o.title }));
    });
    item.addEventListener('click', () => addNodeToCanvas(o.type, o.title));
    els.wfLibList.appendChild(item);
  });
}

function addNodeToCanvas(type, title, extra = {}) {
  if (!currentWorkflow) return;
  const id = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const newNode = {
    id,
    type,
    title,
    x: extra.x !== undefined ? extra.x : (120 + (currentWorkflow.nodes.length % 5) * 40),
    y: extra.y !== undefined ? extra.y : (90 + (currentWorkflow.nodes.length % 5) * 40),
    ...extra
  };
  currentWorkflow.nodes.push(newNode);
  renderWorkflowCanvas();
  logToWfConsole(`+ 已添加节点 [${title}]`);
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
      : (node.type.startsWith('trigger') ? 'trigger' : (node.type.startsWith('output') ? 'output' : 'action'));

    el.innerHTML = `
      <div class="wf-node-head ${headClass}">
        <span>${escapeHtml(node.title)}</span>
        <button type="button" class="wf-node-del" title="删除节点">×</button>
      </div>
      <div class="wf-node-body">
        <span class="mono">${escapeHtml(node.type)}</span>
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

      let startX = e.clientX, startY = e.clientY;
      let origX = node.x || 0, origY = node.y || 0;

      const onMouseMove = (ev) => {
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
  const initialPayload = { type: 'text/plain', value: testInputVal || '{"appName":"orbit","demo":true}' };

  logToWfConsole(`▶ 开始执行工作流 [${currentWorkflow.name}]…`);
  const paths = els.wfSvgLayer.querySelectorAll('path');
  paths.forEach(p => p.classList.add('active'));

  try {
    const res = await window.host.runWorkflow(currentWorkflow.id, initialPayload);
    paths.forEach(p => p.classList.remove('active'));

    if (res.ok) {
      const totalMs = (res.logs || []).reduce((acc, l) => acc + (l.duration || 0), 0);
      logToWfConsole(`✓ 工作流执行成功！总耗时: ${totalMs}ms`);
      (res.logs || []).forEach(l => {
        logToWfConsole(`  ├─ 节点 [${l.title}]: ${l.summary || 'OK'} (${l.duration}ms)`);
      });
      if (res.finalOutput) {
        logToWfConsole(`  └─ 最终输出: ${JSON.stringify(res.finalOutput.value || res.finalOutput)}`);
      }
    } else {
      logToWfConsole(`❌ 执行异常: ${res.error}`);
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
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && currentWorkflow) {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
    if (wfCanvas.selectedNodeId) {
      const targetNode = currentWorkflow.nodes.find(n => n.id === wfCanvas.selectedNodeId);
      if (targetNode) {
        currentWorkflow.nodes = currentWorkflow.nodes.filter(n => n.id !== targetNode.id);
        currentWorkflow.edges = currentWorkflow.edges.filter(ed => ed.from !== targetNode.id && ed.to !== targetNode.id);
        wfCanvas.selectedNodeId = null;
        renderWorkflowCanvas();
        logToWfConsole(`✓ 已删除选中的节点 [${targetNode.title}]`);
        return;
      }
    }
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
    const removedEdge = currentWorkflow.edges.find(ed => (ed.id || `edge-${ed.from}-${ed.to}`) === wfCanvas.selectedEdgeId);
    if (removedEdge) {
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
  els.btnWfNew.addEventListener('click', () => {
    const id = `wf-${Date.now()}`;
    const newWf = {
      id,
      name: `新建工作流 ${state.workflows.length + 1}`,
      desc: '自定义编排流',
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
    window.host.saveWorkflow(newWf);
    logToWfConsole(`✓ 已创建新工作流: ${newWf.name}`);
  });
}
if (els.btnWfSave) {
  els.btnWfSave.addEventListener('click', async () => {
    if (!currentWorkflow) return;
    await window.host.saveWorkflow(currentWorkflow);
    const orig = els.btnWfSave.textContent;
    els.btnWfSave.textContent = '✓ 已保存';
    setTimeout(() => { if (els.btnWfSave) els.btnWfSave.textContent = orig; }, 1000);
    logToWfConsole(`✓ 工作流 [${currentWorkflow.name}] 已保存`);
  });
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
        selectWorkflow(opts.workflowId);
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
      searchKey: `${pName} folder 插件目录 文件夹 ${activePlugin.id}`.toLowerCase(),
      run: () => window.host.openPluginFolder(activePlugin.id),
    });
    items.push({
      group: isZh ? `当前插件 · ${pName}` : `Current Plugin · ${pName}`,
      icon: '📋',
      title: isZh ? '复制插件 ID' : 'Copy Plugin ID',
      sub: activePlugin.id,
      badge: 'Copy',
      searchKey: `${pName} id 复制 标识 ${activePlugin.id}`.toLowerCase(),
      run: () => window.host.writeClipboardText(activePlugin.id),
    });
  }

  // 2. 跨插件管道流转 (Pipeline)
  const currentText = els.search.value.trim() || (await window.host.readClipboardText().catch(() => ''));
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
      searchKey,
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
        searchKey,
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
      items.push({
        group: isZh ? '🔀 可视化工作流' : '🔀 Workflows',
        icon: '🔀',
        title: isZh ? `运行工作流: ${wf.name}` : `Run Workflow: ${wf.name}`,
        sub: `${(wf.nodes || []).length} 节点 · ${wf.desc || wf.id}`,
        badge: 'Workflow',
        searchKey: `workflow 工作流 ${wf.name} ${wf.desc || ''}`.toLowerCase(),
        run: async () => {
          setView('workflows');
          if (typeof selectWorkflow === 'function') selectWorkflow(wf.id);
          if (typeof runCurrentWorkflow === 'function') setTimeout(runCurrentWorkflow, 100);
        },
      });
    }
  }

  // 6. 快速导航与系统动作 (System & Navigation)
  items.push({
    group: isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation',
    icon: '🏠',
    title: isZh ? '返回工具主页' : 'Go to Home',
    badge: 'View',
    searchKey: 'home 主页 返回'.toLowerCase(),
    run: () => { closePanel(); setView('home'); },
  });
  items.push({
    group: isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation',
    icon: '🧩',
    title: isZh ? '打开插件中心' : 'Plugin Center',
    badge: 'View',
    searchKey: 'plugin center 插件中心 市场'.toLowerCase(),
    run: () => { closePanel(); setView('plugins'); },
  });
  items.push({
    group: isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation',
    icon: '🔀',
    title: isZh ? '打开工作流画布' : 'Workflow Canvas',
    badge: 'View',
    searchKey: 'workflow 工作流 画布 DAG'.toLowerCase(),
    run: () => { closePanel(); setView('workflows'); },
  });
  items.push({
    group: isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation',
    icon: '⚙️',
    title: isZh ? '打开偏好设置' : 'Preferences',
    badge: 'View',
    searchKey: 'settings 设置 偏好'.toLowerCase(),
    run: () => { closePanel(); setView('settings'); },
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
      state.hotkeys = res.hotkeys;
      renderDeck(); renderPlugins(); renderSettings();
    },
  });
  items.push({
    group: isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation',
    icon: '📁',
    title: isZh ? '打开通用数据存储目录' : 'Open Plugin Data Folder',
    badge: 'Folder',
    searchKey: 'data folder 存储目录 数据'.toLowerCase(),
    run: () => window.host.openPluginDataDir(),
  });
  items.push({
    group: isZh ? '⚙️ 快速导航与系统操作' : '⚙️ System & Navigation',
    icon: '📂',
    title: isZh ? '打开用户插件目录' : 'Open User Plugins Folder',
    badge: 'Folder',
    searchKey: 'user plugins folder 用户插件目录'.toLowerCase(),
    run: () => window.host.openUserPlugins(),
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
    },
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

function renderActionPaletteList() {
  const q = els.apInput.value.trim().toLowerCase();
  state.actionPaletteFiltered = state.actionPaletteItems.filter(item => {
    if (!q) return true;
    if (item.title && item.title.toLowerCase().includes(q)) return true;
    if (item.sub && item.sub.toLowerCase().includes(q)) return true;
    if (item.searchKey && item.searchKey.includes(q)) return true;
    if (item.group && item.group.toLowerCase().includes(q)) return true;
    return false;
  });

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
        <span class="ap-item-title">${escapeHtml(item.title)}</span>
        ${item.sub ? `<span class="ap-item-sub">${escapeHtml(item.sub)}</span>` : ''}
      </div>
      ${item.badge ? `<span class="ap-item-badge">${escapeHtml(item.badge)}</span>` : ''}
    `;
    row.addEventListener('click', () => {
      closeActionPalette();
      item.run();
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
      const item = state.actionPaletteFiltered[state.actionPaletteIndex];
      if (item) {
        closeActionPalette();
        item.run();
      }
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

  if (e.key === 'Escape' && state.view === 'panel') { closePanel(); setView('home'); }
  else if (e.key === 'Escape' && state.view === 'dev-guide') { setView('plugins'); }
  else if (e.key === 'Escape' && state.view === 'home') {
    if (state.smartPeekData) hideSmartPeek();
    else if (els.search.value) { els.search.value = ''; state.query = ''; renderDeck(); }
    else window.host.win('hide');
  }
});

init();
