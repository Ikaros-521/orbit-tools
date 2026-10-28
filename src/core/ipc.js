/* The app's IPC surface, split out of main.js so tests can boot the whole
   stack (config + manager + hotkeys + handlers + real window) headlessly. */
const { ipcMain, shell, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const { WorkflowManager } = require('./workflows');

module.exports = function registerIpc({ app, cfg, manager, hotkeys, getHostWindow, getPaletteWindow, openWorkbench, toggleActionPalette }) {
  const workflowManager = new WorkflowManager(cfg, manager, {
    // auto-runs (clipboard triggers etc.) are mirrored to the host window so
    // the workflow console can show them live while the canvas is open
    onEvent: payload => {
      const host = getHostWindow && getHostWindow();
      if (host && !host.isDestroyed()) host.webContents.send('workflow-event', payload);
    }
  });

  ipcMain.handle('boot', () => ({
    platform: process.platform,
    appVersion: app.getVersion(),
    name: { en: 'Orbit Toolbox', zh: '轨道工具箱' },
    config: { hotkey: cfg.data.hotkey, actionPaletteHotkey: cfg.data.actionPaletteHotkey || 'Ctrl+K', lang: cfg.data.lang, theme: cfg.data.theme },
    plugins: manager.serialize(),
    hotkeys: hotkeys.status,
    workflows: workflowManager.list(),
    userPluginsDir: manager.userRoot,
    defaultUserPluginsDir: manager.defaultUserRoot,
    isCustomUserPluginsDir: manager.userRoot !== manager.defaultUserRoot,
    pluginDataDir: manager.dataRoot,
    defaultPluginDataDir: manager.defaultDataRoot,
    isCustomPluginDataDir: manager.dataRoot !== manager.defaultDataRoot,
  }));

  ipcMain.handle('plugin-call', async (e, payload) => {
    const { id, method, args } = payload || {};
    if (typeof id !== 'string' || typeof method !== 'string') return { ok: false, error: 'bad call' };
    try {
      const data = await manager.call(id, method, args, e);
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: String(err && err.message || err) };
    }
  });

  ipcMain.handle('plugin-set-enabled', (e, payload) => {
    manager.setEnabled(payload.id, payload.on);
    hotkeys.registerAll();
    return { plugins: manager.serialize(), hotkeys: hotkeys.status };
  });

  ipcMain.handle('plugin-rescan', () => {
    manager.deactivateAll();
    manager.discover();
    for (const p of manager.plugins.values()) if (p.enabled) manager.activate(p.id);
    hotkeys.registerAll();
    return { plugins: manager.serialize(), hotkeys: hotkeys.status };
  });

  ipcMain.handle('smart-peek-detect', (e, text) => manager.detectSmartPeek(text));
  ipcMain.handle('get-pipeline-actions', (e, envelope) => manager.getPipelineActions(envelope));
  ipcMain.handle('read-clipboard-text', () => {
    const { clipboard } = require('electron');
    return clipboard.readText();
  });
  ipcMain.handle('capture-selection', async () => {
    try {
      const { captureActiveSelection } = require('./selection');
      return await captureActiveSelection({ timeoutMs: 90 });
    } catch {
      return { ok: false, text: null };
    }
  });
  ipcMain.handle('write-clipboard-text', (e, text) => {
    const { clipboard } = require('electron');
    clipboard.writeText(String(text || ''));
    return true;
  });

  ipcMain.handle('set-hotkey', (e, accel) => hotkeys.setHostHotkey(String(accel || '')));
  ipcMain.handle('set-palette-hotkey', (e, accel) => hotkeys.setActionPaletteHotkey(accel ? String(accel) : null));
  ipcMain.handle('set-plugin-hotkey', (e, payload) => hotkeys.setPluginHotkey(payload.key, payload.accel || null));
  ipcMain.handle('hotkeys', () => hotkeys.status);

  ipcMain.handle('set-pref', (e, { k, v }) => {
    if (k === 'actionPaletteHotkey') {
      const res = hotkeys.setActionPaletteHotkey(v ? String(v) : null);
      return { ...cfg.data, hotkeyRes: res };
    }
    if (!['lang', 'theme'].includes(k)) return cfg.data;
    cfg.set({ [k]: v });
    return cfg.data;
  });

  ipcMain.handle('open-external', (e, { url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });

  ipcMain.handle('open-user-plugins', () => {
    fs.mkdirSync(manager.userRoot, { recursive: true });
    shell.openPath(manager.userRoot);
  });

  ipcMain.handle('choose-user-plugins-dir', async () => {
    const parent = getHostWindow();
    const r = await dialog.showOpenDialog(parent, {
      title: '选择用户插件目录 / Choose User Plugins Folder',
      defaultPath: manager.userRoot,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths || r.filePaths.length === 0) return null;
    return r.filePaths[0];
  });

  ipcMain.handle('set-user-plugins-dir', (e, newDir) => {
    const dirInfo = manager.setUserPluginsDir(newDir);
    hotkeys.registerAll();
    return {
      plugins: manager.serialize(),
      hotkeys: hotkeys.status,
      ...dirInfo,
    };
  });

  ipcMain.handle('open-plugin-data-dir', () => {
    fs.mkdirSync(manager.dataRoot, { recursive: true });
    shell.openPath(manager.dataRoot);
  });

  ipcMain.handle('choose-plugin-data-dir', async () => {
    const parent = getHostWindow();
    const r = await dialog.showOpenDialog(parent, {
      title: '选择通用数据存储目录 / Choose Plugin Data Folder',
      defaultPath: manager.dataRoot,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths || r.filePaths.length === 0) return null;
    return r.filePaths[0];
  });

  ipcMain.handle('set-plugin-data-dir', (e, newDir) => {
    const dirInfo = manager.setPluginDataDir(newDir);
    return {
      plugins: manager.serialize(),
      ...dirInfo,
    };
  });

  ipcMain.handle('open-plugin-folder', (e, id) => {
    const p = manager.plugins.get(id);
    if (p && p.root) shell.openPath(p.root);
  });

  ipcMain.handle('choose-save-png', async () => {
    const parent = getHostWindow();
    const r = await dialog.showSaveDialog(parent, {
      title: 'Save PNG',
      defaultPath: `orbit-${Date.now()}.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    return r.canceled ? null : r.filePath;
  });

  ipcMain.handle('workflow-list', () => workflowManager.list());
  ipcMain.handle('workflow-save', (e, wf) => workflowManager.save(wf));
  ipcMain.handle('workflow-delete', (e, id) => workflowManager.delete(id));
  ipcMain.handle('workflow-run', (e, { id, input }) => workflowManager.run(id, input));

  ipcMain.handle('open-workbench', (e, opts) => {
    if (typeof openWorkbench === 'function') openWorkbench(opts);
    return true;
  });

  ipcMain.handle('toggle-action-palette', () => {
    if (typeof toggleActionPalette === 'function') toggleActionPalette();
    return true;
  });

  ipcMain.on('win', (e, action) => {
    let win = null;
    try {
      win = BrowserWindow.fromWebContents(e.sender);
    } catch { /* fallback */ }
    if (!win) win = getHostWindow();
    if (!win) return;
    if (action === 'minimize') win.minimize();
    else if (action === 'hide') win.hide();
    else if (action === 'close') win.close();
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  });
};
