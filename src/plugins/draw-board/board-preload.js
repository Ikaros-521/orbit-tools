const { contextBridge, ipcRenderer } = require('electron');

const P = 'draw-board:';

contextBridge.exposeInMainWorld('board', {
  ready: () => ipcRenderer.send(`${P}ready`),
  exit: () => ipcRenderer.send(`${P}exit`),
  save: async dataUrl => ipcRenderer.invoke(`${P}save`, { dataUrl }),
  copy: async dataUrl => ipcRenderer.invoke(`${P}copy`, { dataUrl }),
  pin: async payload => ipcRenderer.invoke(`${P}pin`, payload),
  onInit: fn => ipcRenderer.on(`${P}init`, (_e, payload) => fn(payload)),
});
