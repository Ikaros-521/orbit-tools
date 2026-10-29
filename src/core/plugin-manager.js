/* Plugin lifecycle + IPC router.
   A plugin is a folder with a plugin.json manifest. Folders under src/plugins
   are built-in; folders under <userData>/plugins are user-installed and, on id
   collision, override the built-in one. Everything a plugin owns — backend
   module, IPC handlers, auxiliary windows — is tracked here so enable/disable
   and rescan tear it down completely. */
const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');
const { CapabilityRouter } = require('./capabilities');

const ID_RE = /^[a-z][a-z0-9-]*$/;

const i18n = v => {
  if (typeof v === 'string') return { zh: v, en: v };
  if (v && typeof v === 'object') return { zh: v.zh || v.en || '', en: v.en || v.zh || '' };
  return { zh: '', en: '' };
};

class PluginManager {
  constructor({ userDataDir, config, getHostWindow }) {
    this.builtinRoot = path.join(__dirname, '..', 'plugins');
    this.defaultUserRoot = path.join(userDataDir, 'plugins');
    const customUserDir = config && config.data && config.data.userPluginsDir;
    this.userRoot = (typeof customUserDir === 'string' && customUserDir.trim())
      ? path.resolve(customUserDir.trim())
      : this.defaultUserRoot;
    this.defaultDataRoot = path.join(userDataDir, 'plugin-data');
    const customDataDir = config && config.data && config.data.pluginDataDir;
    this.dataRoot = (typeof customDataDir === 'string' && customDataDir.trim())
      ? path.resolve(customDataDir.trim())
      : this.defaultDataRoot;
    this.config = config;
    this.getHostWindow = getHostWindow;
    this.plugins = new Map();  // id -> record {id, root, source, manifest, enabled}
    this.active = new Map();   // id -> {mod, handlers:Map, windows:Set, data}
    this.loadErrors = new Map();
    this.capabilities = new CapabilityRouter(this);
  }

  detectSmartPeek(text) {
    return this.capabilities.detect(text);
  }

  getPipelineActions(envelope) {
    return this.capabilities.getPipelineActions(envelope);
  }

  setUserPluginsDir(newDir) {
    if (newDir && typeof newDir === 'string' && newDir.trim()) {
      this.userRoot = path.resolve(newDir.trim());
      this.config.set({ userPluginsDir: this.userRoot });
    } else {
      this.userRoot = this.defaultUserRoot;
      this.config.set({ userPluginsDir: null });
    }
    try { fs.mkdirSync(this.userRoot, { recursive: true }); } catch { /* ignore */ }
    this.deactivateAll();
    this.discover();
    for (const p of this.plugins.values()) if (p.enabled) this.activate(p.id);
    return {
      userPluginsDir: this.userRoot,
      defaultUserPluginsDir: this.defaultUserRoot,
      isCustom: this.userRoot !== this.defaultUserRoot,
    };
  }

  setPluginDataDir(newDir) {
    if (newDir && typeof newDir === 'string' && newDir.trim()) {
      this.dataRoot = path.resolve(newDir.trim());
      this.config.set({ pluginDataDir: this.dataRoot });
    } else {
      this.dataRoot = this.defaultDataRoot;
      this.config.set({ pluginDataDir: null });
    }
    try { fs.mkdirSync(this.dataRoot, { recursive: true }); } catch { /* ignore */ }
    for (const state of this.active.values()) {
      state.data = null;
    }
    return {
      pluginDataDir: this.dataRoot,
      defaultPluginDataDir: this.defaultDataRoot,
      isCustom: this.dataRoot !== this.defaultDataRoot,
    };
  }

  /* --- discovery ---------------------------------------------------------- */

  discover() {
    this.plugins.clear();
    this.loadErrors.clear();
    // user plugins win over built-ins on the same id, so scan them first
    for (const { root, source } of [
      { root: this.userRoot, source: 'user' },
      { root: this.builtinRoot, source: 'builtin' },
    ]) {
      let entries = [];
      try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { /* no dir yet */ }
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        // dot-folders / node_modules aren't plugin attempts — don't report them
        if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
        let manifest;
        try {
          manifest = JSON.parse(fs.readFileSync(path.join(root, ent.name, 'plugin.json'), 'utf8'));
        } catch {
          this.loadErrors.set(ent.name, 'plugin.json missing/invalid');
          continue;
        }
        const id = String(manifest.id || ent.name).toLowerCase();
        if (!ID_RE.test(id)) { this.loadErrors.set(ent.name, `bad id "${id}"`); continue; }
        if (!manifest.name) { this.loadErrors.set(ent.name, 'manifest.name missing'); continue; }
        if (manifest.panel && (!Array.isArray(manifest.actions) || manifest.actions.length === 0)) {
          const zh = (manifest.name && manifest.name.zh) || manifest.name || id;
          const en = (manifest.name && manifest.name.en) || manifest.name || id;
          manifest.actions = [
            {
              id: 'open',
              label: { zh: `打开${zh}`, en: `Open ${en}` },
              method: 'openPanel',
              hotkey: null,
            },
          ];
        }
        if (this.plugins.has(id)) continue; // user copy shadows the built-in
        this.plugins.set(id, {
          id,
          root: path.join(root, ent.name),
          source,
          manifest,
          enabled: this.config.data.enabled[id] !== undefined
            ? !!this.config.data.enabled[id]
            : manifest.defaultEnabled !== false,
        });
      }
    }
    return [...this.plugins.values()];
  }

  /* --- serialization for the renderer -------------------------------------- */

  serialize() {
    const out = [];
    for (const p of this.plugins.values()) {
      const m = p.manifest;
      let iconSvg = null, iconText = null;
      try {
        if (typeof m.icon === 'string' && m.icon.endsWith('.svg')) {
          iconSvg = fs.readFileSync(path.join(p.root, m.icon), 'utf8');
        } else if (typeof m.icon === 'string' && m.icon.trim().startsWith('<svg')) {
          iconSvg = m.icon;
        } else if (typeof m.icon === 'string') {
          iconText = m.icon;
        }
      } catch { /* fall back to text */ }
      if (!iconSvg && !iconText) iconText = '🧩';
      const actions = Array.isArray(m.actions) ? m.actions.map(a => ({
        key: `${p.id}:${a.id}`,
        label: i18n(a.label),
        hotkey: this.config.data.pluginHotkeys[`${p.id}:${a.id}`] ?? a.hotkey ?? null,
        defaultHotkey: a.hotkey ?? null,
      })) : [];
      out.push({
        id: p.id,
        name: i18n(m.name),
        desc: i18n(m.desc || ''),
        version: m.version || '0.0.0',
        author: m.author || '',
        keywords: Array.isArray(m.keywords) ? m.keywords.map(String) : [],
        category: m.category || 'other',
        iconSvg, iconText,
        source: p.source,
        enabled: p.enabled,
        hasBackend: !!m.backend,
        panel: m.panel && m.panel.script ? { script: m.panel.script, style: m.panel.style || null } : null,
        actions,
        capabilities: Array.isArray(m.capabilities) ? m.capabilities : [],
        loadError: this.loadErrors.get(p.id) || null,
      });
    }
    // Discovery failures (missing/invalid plugin.json, bad id…) never enter
    // this.plugins, so surface them as disabled stubs — otherwise a broken
    // user plugin is silently invisible in the UI.
    for (const [folder, reason] of this.loadErrors) {
      if (this.plugins.has(folder)) continue; // a real plugin owns this id already
      out.push({
        id: folder,
        name: { zh: folder, en: folder },
        desc: { zh: '插件加载失败：未通过清单校验', en: 'Plugin failed manifest validation' },
        version: '0.0.0',
        author: '',
        keywords: [],
        category: 'other',
        iconSvg: null,
        iconText: '⚠️',
        source: 'user',
        enabled: false,
        hasBackend: false,
        panel: null,
        actions: [],
        capabilities: [],
        loadError: reason,
      });
    }
    return out;
  }

  /* --- activation ---------------------------------------------------------- */

  activate(id) {
    const p = this.plugins.get(id);
    if (!p || this.active.has(id)) return false;
    const state = { mod: null, handlers: new Map(), windows: new Set(), data: null };
    if (p.manifest.backend) {
      const file = path.join(p.root, p.manifest.backend);
      if (!fs.existsSync(file)) {
        // Registering the state below would leave a ghost entry that blocks
        // re-activation forever; surface the reason in the UI instead.
        this.loadErrors.set(id, 'backend file missing');
        return false;
      }
    }
    this.active.set(id, state);
    if (p.manifest.backend) {
      const file = path.join(p.root, p.manifest.backend);
      delete require.cache[require.resolve(file)];
      try {
        state.mod = require(file);
      } catch (err) {
        this.loadErrors.set(id, String(err && err.message || err));
        this.active.delete(id);
        return false;
      }
      if (state.mod && typeof state.mod.activate === 'function') {
        try { state.mod.activate(this.makeContext(p, state)); }
        catch (err) { this.loadErrors.set(id, `activate(): ${err.message}`); }
      }
    }
    return true;
  }

  deactivate(id) {
    const state = this.active.get(id);
    if (!state) return;
    if (state.mod && typeof state.mod.deactivate === 'function') {
      try { state.mod.deactivate(); } catch { /* plugin's own problem */ }
    }
    for (const win of [...state.windows]) { if (!win.isDestroyed()) win.destroy(); }
    state.windows.clear();
    state.handlers.clear();
    this.active.delete(id);
  }

  deactivateAll() { for (const id of [...this.active.keys()]) this.deactivate(id); }

  setEnabled(id, on) {
    const p = this.plugins.get(id);
    if (!p) return false;
    p.enabled = !!on;
    this.config.set({ enabled: { ...this.config.data.enabled, [id]: p.enabled } });
    if (p.enabled) this.activate(id); else this.deactivate(id);
    return true;
  }

  /* --- IPC routing --------------------------------------------------------- */

  bringToForeground(targetWin) {
    if (!targetWin || (typeof targetWin.isDestroyed === 'function' && targetWin.isDestroyed())) return;
    if (typeof targetWin.isMinimized === 'function' && targetWin.isMinimized()) targetWin.restore();
    if (typeof targetWin.show === 'function') targetWin.show();
    if (process.platform === 'win32') {
      if (typeof targetWin.setAlwaysOnTop === 'function') {
        targetWin.setAlwaysOnTop(true);
        targetWin.setAlwaysOnTop(false);
      }
      if (typeof targetWin.moveTop === 'function') targetWin.moveTop();
    }
    if (typeof targetWin.focus === 'function') targetWin.focus();
  }

  async call(id, method, args, event) {
    const state = this.active.get(id);
    const handler = state && state.handlers.get(method);
    if (!handler) {
      if (method === 'openPanel') {
        const host = this.getHostWindow && this.getHostWindow();
        if (host && !host.isDestroyed()) {
          this.bringToForeground(host);
          if (host.webContents && !host.webContents.isDestroyed()) {
            host.webContents.send('open-plugin', id);
          }
        }
        return { ok: true };
      }
      throw new Error(`plugin "${id}" has no handler "${method}"`);
    }
    const result = await handler(args === undefined ? {} : args, event);
    if (method === 'openPanel') {
      const host = this.getHostWindow && this.getHostWindow();
      if (host && !host.isDestroyed()) {
        this.bringToForeground(host);
        if (host.webContents && !host.webContents.isDestroyed()) {
          host.webContents.send('open-plugin', id);
        }
      }
    }
    return result;
  }

  // Backend -> every renderer that cares about this plugin (host + its own windows).
  broadcast(id, channel, payload) {
    const host = this.getHostWindow();
    if (host && !host.isDestroyed()) {
      host.webContents.send(`plugin-event:${id}`, { channel, payload });
    }
    const state = this.active.get(id);
    if (state) {
      for (const win of state.windows) {
        if (!win.isDestroyed()) win.webContents.send(`plugin-event:${id}`, { channel, payload });
      }
    }
  }

  windowsOf(id) {
    const state = this.active.get(id);
    return state ? [...state.windows] : [];
  }

  makeContext(p, state) {
    const getDataFile = () => path.join(this.dataRoot, `${p.id}.json`);
    const readData = () => {
      if (!state.data) {
        try { state.data = JSON.parse(fs.readFileSync(getDataFile(), 'utf8')); }
        catch { state.data = {}; }
      }
      return state.data;
    };
    return {
      id: p.id,
      root: p.root,
      getHostWindow: () => this.getHostWindow(),
      url: rel => `plugin://${p.id}/${String(rel).replace(/^\/+/, '')}`,
      send: (channel, payload) => this.broadcast(p.id, channel, payload),
      ipc: {
        handle: (method, fn) => state.handlers.set(method, fn),
      },
      windows: {
        create: (opts = {}) => {
          const { preload, ...rest } = opts;
          const win = new BrowserWindow({
            show: false,
            skipTaskbar: true,
            backgroundColor: '#0a0c0d',
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
              ...(preload ? { preload: path.resolve(p.root, preload) } : {}),
            },
            ...rest,
          });
          state.windows.add(win);
          win.on('closed', () => state.windows.delete(win));
          return win;
        },
        closeAll: () => {
          for (const win of [...state.windows]) { if (!win.isDestroyed()) win.close(); }
        },
      },
      data: {
        get: () => readData(),
        set: patch => {
          state.data = { ...readData(), ...patch };
          try {
            fs.mkdirSync(this.dataRoot, { recursive: true });
            fs.writeFileSync(getDataFile(), JSON.stringify(state.data, null, 2));
          } catch { /* ignore */ }
          return state.data;
        },
      },
    };
  }
}

module.exports = PluginManager;
