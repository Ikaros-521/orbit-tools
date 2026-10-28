const { contextBridge, ipcRenderer } = require('electron');

const on = (channel, fn) => {
  const listener = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('host', {
  boot: () => ipcRenderer.invoke('boot'),
  pluginCall: (id, method, args) => ipcRenderer.invoke('plugin-call', { id, method, args }),
  setPluginEnabled: (id, on) => ipcRenderer.invoke('plugin-set-enabled', { id, on }),
  rescanPlugins: () => ipcRenderer.invoke('plugin-rescan'),
  setHotkey: accel => ipcRenderer.invoke('set-hotkey', accel),
  setPluginHotkey: (key, accel) => ipcRenderer.invoke('set-plugin-hotkey', { key, accel }),
  hotkeys: () => ipcRenderer.invoke('hotkeys'),
  setPref: (k, v) => ipcRenderer.invoke('set-pref', { k, v }),
  openExternal: url => ipcRenderer.invoke('open-external', { url }),
  openUserPlugins: () => ipcRenderer.invoke('open-user-plugins'),
  chooseUserPluginsDir: () => ipcRenderer.invoke('choose-user-plugins-dir'),
  setUserPluginsDir: dir => ipcRenderer.invoke('set-user-plugins-dir', dir),
  openPluginFolder: id => ipcRenderer.invoke('open-plugin-folder', id),
  chooseSavePng: () => ipcRenderer.invoke('choose-save-png'),
  win: action => ipcRenderer.send('win', action),
  onPluginEvent: (id, fn) => on(`plugin-event:${id}`, fn),
  onPaletteFocus: fn => on('palette-focus', fn),
});
