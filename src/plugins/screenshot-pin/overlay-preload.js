const { contextBridge, ipcRenderer } = require('electron');

const P = 'screenshot-pin:';

contextBridge.exposeInMainWorld('overlay', {
  ready: () => ipcRenderer.send(`${P}ready`),
  displayed: () => ipcRenderer.send(`${P}displayed`),
  select: rect => ipcRenderer.send(`${P}select`, { rect }),
  selectComposed: (dataUrl, rect) => ipcRenderer.send(`${P}select-composed`, { dataUrl, rect }),
  copy: dataUrl => ipcRenderer.send(`${P}overlay-copy`, { dataUrl }),
  save: dataUrl => ipcRenderer.invoke(`${P}overlay-save`, { dataUrl }),
  cancel: () => ipcRenderer.send(`${P}cancel`),
  onImage: fn => ipcRenderer.on(`${P}image`, (_e, payload) => fn(payload)),
});
