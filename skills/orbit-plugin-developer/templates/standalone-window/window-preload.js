const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('myToolWin', {
  close: () => ipcRenderer.invoke('my-window-tool:close'),
});
