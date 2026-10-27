const $ = id => document.getElementById(id);
const t = (k, p) => window.I18N.t(k, p);

const els = {
  root: document.documentElement,
  tabs: $('tabs'), langSeg: $('langSeg'), themeSeg: $('themeSeg'),
  langSeg2: $('langSeg2'), themeSeg2: $('themeSeg2'), winctl: $('winctl'),
  search: $('search'), hotHint: $('hotHint'), deckMeta: $('deckMeta'), deck: $('deck'), empty: $('empty'),
  viewHome: $('viewHome'), viewPanel: $('viewPanel'), viewSettings: $('viewSettings'),
  btnBack: $('btnBack'), panelIcon: $('panelIcon'), panelName: $('panelName'), panelMeta: $('panelMeta'),
  panelHost: $('panelHost'),
  hotkeyCtrl: $('hotkeyCtrl'), pluginList: $('pluginList'),
  btnRescan: $('btnRescan'), btnUserPlugins: $('btnUserPlugins'),
  aboutVer: $('aboutVer'), btnRepo: $('btnRepo'),
};

const state = {
  platform: 'win32',
  appVersion: '0.0.0',
  plugins: [],
  config: { hotkey: 'Alt+Space', lang: 'zh', theme: 'auto' },
  view: 'home',          // home | panel | settings
  openId: null,          // plugin whose panel is showing
  mounted: null,         // {def, ctx, unsubscribers[]}
  query: '',
};

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
  renderDeck(); renderSettings();
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

/* --- plugin panel lifecycle ---------------------------------------------------- */
async function openPlugin(id) {
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
  state.view = view;
  els.viewHome.hidden = view !== 'home';
  els.viewPanel.hidden = view !== 'panel';
  els.viewSettings.hidden = view !== 'settings';
  els.tabs.querySelectorAll('button').forEach(b =>
    b.classList.toggle('on', (b.dataset.view === 'panel' ? 'home' : b.dataset.view) === (view === 'panel' ? 'home' : view)));
  if (view === 'home') { els.search.focus(); els.search.select(); }
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
    if (res && res.ok === false) { status.textContent = t('hotkeyBad'); status.classList.add('bad'); }
    else { status.textContent = '✓'; status.classList.remove('bad'); input.value = res && res.hotkey ? res.hotkey : candidate; }
  });
  clear.addEventListener('click', async () => {
    candidate = null; input.value = ''; status.textContent = '';
    await onApply(null);
  });
  return wrap;
}

/* --- settings ------------------------------------------------------------------------ */
function renderSettings() {
  els.hotkeyCtrl.innerHTML = '';
  els.hotkeyCtrl.appendChild(hotkeyEditor({
    initial: state.config.hotkey,
    onApply: async accel => {
      const res = await window.host.setHotkey(accel);
      if (res.ok) { state.config.hotkey = res.hotkey; els.hotHint.textContent = res.hotkey; }
      return res;
    },
  }));

  els.pluginList.innerHTML = '';
  for (const p of state.plugins) {
    const row = document.createElement('div');
    row.className = 'prow' + (p.enabled ? '' : ' off');
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
    nameLine.append(ver, src);
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
              renderDeck();
            }
            return res;
          },
        }));
      }
      mid.append(acts);
    }

    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'switch' + (p.enabled ? ' on' : '');
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(p.enabled));
    sw.addEventListener('click', async () => {
      const list = await window.host.setPluginEnabled(p.id, !p.enabled);
      state.plugins = list;
      if (state.openId === p.id) { closePanel(); setView('home'); }
      renderDeck(); renderSettings();
    });

    row.append(icon, mid, sw);
    els.pluginList.appendChild(row);
  }
}

/* --- boot ------------------------------------------------------------------------------ */
async function init() {
  const boot = await window.host.boot();
  state.platform = boot.platform;
  state.appVersion = boot.appVersion;
  state.plugins = [...boot.plugins].sort((a, b) => a.id.localeCompare(b.id));
  state.config = { ...state.config, ...boot.config };
  document.body.className = `platform-${boot.platform} lang-${state.config.lang}`;
  els.aboutVer.textContent = `${boot.name.en} · ${boot.name.zh}  v${boot.appVersion}`;
  els.hotHint.textContent = state.config.hotkey;
  applyTheme(state.config.theme);
  applyLang(state.config.lang);
  setView('home');
}

/* --- events ----------------------------------------------------------------------------- */
els.tabs.addEventListener('click', e => {
  const b = e.target.closest('button[data-view]');
  if (b) { closePanel(); setView(b.dataset.view); }
});
els.btnBack.addEventListener('click', () => { closePanel(); setView('home'); });
els.search.addEventListener('input', () => { state.query = els.search.value; renderDeck(); });
els.search.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const q = state.query.trim().toLowerCase();
    const first = state.plugins.find(p => p.enabled && (!q || pluginText(p).includes(q)));
    if (first) openPlugin(first.id);
  } else if (e.key === 'Escape') {
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
els.btnRescan.addEventListener('click', async () => {
  state.plugins = [...await window.host.rescanPlugins()].sort((a, b) => a.id.localeCompare(b.id));
  renderDeck(); renderSettings();
});
els.btnUserPlugins.addEventListener('click', () => window.host.openUserPlugins());
els.btnRepo.addEventListener('click', () => window.host.openExternal('https://github.com/Ikaros-521/orbit-tools'));
window.host.onPaletteFocus(() => {
  if (state.view === 'home') { els.search.focus(); els.search.select(); }
});
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.view === 'panel') { closePanel(); setView('home'); }
});

init();
