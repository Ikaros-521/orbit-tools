const { contextBridge, ipcRenderer } = require('electron');

const P = 'screenshot-pin:';

contextBridge.exposeInMainWorld('pin', {
  close: () => ipcRenderer.send(`${P}close-pin`),
  move: (dx, dy) => ipcRenderer.send(`${P}move-pin`, { dx, dy }),
  copy: dataUrl => ipcRenderer.send(`${P}copy-image`, { dataUrl }),
  save: async dataUrl => ipcRenderer.invoke(`${P}save`, { dataUrl }),
  onInit: fn => ipcRenderer.on(`${P}init`, (_e, payload) => fn(payload)),
});
