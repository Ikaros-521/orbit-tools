const { contextBridge, ipcRenderer } = require('electron');

const P = 'color-lab:';

contextBridge.exposeInMainWorld('picker', {
  ready: () => ipcRenderer.send(`${P}ready`),
  displayed: () => ipcRenderer.send(`${P}displayed`),
  focus: () => ipcRenderer.send(`${P}focus`),
  probe: (x, y) => ipcRenderer.invoke(`${P}probe`, { x, y }),
  pick: (x, y, color) => ipcRenderer.send(`${P}pick`, { x, y, color }),
  cancel: () => ipcRenderer.send(`${P}cancel`),
  liveFailed: () => ipcRenderer.send(`${P}live-failed`),
  onInit: fn => { ipcRenderer.on(`${P}init`, (_e, payload) => fn(payload)); },
  onLiveFrame: fn => { ipcRenderer.on(`${P}live-frame`, (_e, payload) => fn(payload)); },
  onZoom: fn => { ipcRenderer.on(`${P}zoom`, (_e, payload) => fn(payload)); },
});
