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
  viewSettings: $('viewSettings'), viewDevGuide: $('viewDevGuide'),
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
  if (view === 'plugins') {
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
        state.config.actionPaletteHotkey = accel;
        if (els.apHint) els.apHint.textContent = accel;
        await window.host.setPref('actionPaletteHotkey', accel);
        return { ok: true, hotkey: accel };
      }
    }));
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
/* --- action palette (Ctrl+K) controller --------------------------------------- */
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

  // 1. 当前上下文插件 (正在浏览的插件 / 右键选中的 / 鼠标悬停的)
  const activePlugin = (state.view === 'panel' && state.plugins.find(p => p.id === state.openId))
    || state.ctxTargetPlugin
    || hoveredPlugin;

  if (activePlugin) {
    const pName = isZh ? (activePlugin.name.zh || activePlugin.name.en) : (activePlugin.name.en || activePlugin.name.zh);
    items.push({
      group: isZh ? `当前插件 · ${pName}` : `Current Plugin · ${pName}`,
      icon: '🚀',
      title: isZh ? `打开 ${pName}` : `Open ${pName}`,
      sub: activePlugin.id,
      run: () => openPlugin(activePlugin.id),
    });
    items.push({
      group: isZh ? `当前插件 · ${pName}` : `Current Plugin · ${pName}`,
      icon: '📂',
      title: isZh ? '打开插件安装目录' : 'Open Plugin Folder',
      sub: activePlugin.root || '',
      run: () => window.host.openPluginFolder(activePlugin.id),
    });
    items.push({
      group: isZh ? `当前插件 · ${pName}` : `Current Plugin · ${pName}`,
      icon: '📋',
      title: isZh ? '复制插件 ID' : 'Copy Plugin ID',
      sub: activePlugin.id,
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
        group: isZh ? '跨插件管道流转 (Pipeline)' : 'Pipeline Transit',
        icon: '⚡',
        title: pTitle,
        sub: `${type} ➔ ${pa.pluginId}`,
        badge: 'Transit',
        run: () => openPlugin(pa.pluginId, { payload: envelope }),
      });
    }
  }

  // 3. 全局导航与系统动作
  items.push({
    group: isZh ? '快速导航与系统操作' : 'System & Navigation',
    icon: '🏠',
    title: isZh ? '返回工具主页' : 'Go to Home',
    badge: 'View',
    run: () => { closePanel(); setView('home'); },
  });
  items.push({
    group: isZh ? '快速导航与系统操作' : 'System & Navigation',
    icon: '🧩',
    title: isZh ? '打开插件中心' : 'Plugin Center',
    badge: 'View',
    run: () => { closePanel(); setView('plugins'); },
  });
  items.push({
    group: isZh ? '快速导航与系统操作' : 'System & Navigation',
    icon: '⚙️',
    title: isZh ? '打开偏好设置' : 'Preferences',
    badge: 'View',
    run: () => { closePanel(); setView('settings'); },
  });
  items.push({
    group: isZh ? '快速导航与系统操作' : 'System & Navigation',
    icon: '🔄',
    title: isZh ? '重新扫描插件' : 'Rescan Plugins',
    run: async () => {
      const res = await window.host.rescanPlugins();
      state.plugins = [...res.plugins].sort((a, b) => a.id.localeCompare(b.id));
      state.hotkeys = res.hotkeys;
      renderDeck(); renderPlugins(); renderSettings();
    },
  });
  items.push({
    group: isZh ? '快速导航与系统操作' : 'System & Navigation',
    icon: '📁',
    title: isZh ? '打开通用数据存储目录' : 'Open Plugin Data Folder',
    run: () => window.host.openPluginDataDir(),
  });
  items.push({
    group: isZh ? '快速导航与系统操作' : 'System & Navigation',
    icon: '📂',
    title: isZh ? '打开用户插件目录' : 'Open User Plugins Folder',
    run: () => window.host.openUserPlugins(),
  });
  items.push({
    group: isZh ? '快速导航与系统操作' : 'System & Navigation',
    icon: '🌓',
    title: isZh ? '切换主题模式 (深色/浅色)' : 'Toggle Theme',
    run: async () => {
      const next = state.config.theme === 'dark' ? 'light' : 'dark';
      state.config.theme = next;
      await window.host.setPref('theme', next);
      applyTheme(next);
    },
  });
  items.push({
    group: isZh ? '快速导航与系统操作' : 'System & Navigation',
    icon: '🌐',
    title: isZh ? '切换界面语言 (中文 / English)' : 'Switch Language',
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
  if (state.actionPaletteOpen) return;
  state.actionPaletteOpen = true;
  els.actionPaletteMask.hidden = false;
  els.apInput.value = '';
  state.actionPaletteItems = await collectActionPaletteItems();
  state.actionPaletteIndex = 0;
  renderActionPaletteList();
  setTimeout(() => els.apInput.focus(), 30);
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
    return item.title.toLowerCase().includes(q) || (item.sub && item.sub.toLowerCase().includes(q));
  });

  if (state.actionPaletteIndex >= state.actionPaletteFiltered.length) {
    state.actionPaletteIndex = Math.max(0, state.actionPaletteFiltered.length - 1);
  }

  els.apList.innerHTML = '';
  if (state.actionPaletteFiltered.length === 0) {
    els.apList.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--ink-faint); font-size: 13px;">无匹配动作</div>`;
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
    row.innerHTML = `
      <div class="ap-item-left">
        <span class="ap-item-icon">${item.icon || '⚡'}</span>
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

  // 匹配动作面板自定义快捷键 (默认 Ctrl+K)
  const apHotkey = state.config.actionPaletteHotkey || 'Ctrl+K';
  if (matchHotkey(e, apHotkey)) {
    e.preventDefault();
    openActionPalette();
    return;
  }

  if (e.key === 'Escape' && state.view === 'panel') { closePanel(); setView('home'); }
  else if (e.key === 'Escape' && state.view === 'dev-guide') { setView('plugins'); }
});

init();
