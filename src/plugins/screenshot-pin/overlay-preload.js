const { contextBridge, ipcRenderer } = require('electron');

const P = 'screenshot-pin:';

contextBridge.exposeInMainWorld('overlay', {
  ready: () => ipcRenderer.send(`${P}ready`),
  select: rect => ipcRenderer.send(`${P}select`, { rect }),
  cancel: () => ipcRenderer.send(`${P}cancel`),
  onImage: fn => ipcRenderer.on(`${P}image`, (_e, payload) => fn(payload)),
});
