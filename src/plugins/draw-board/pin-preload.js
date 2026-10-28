const { contextBridge, ipcRenderer } = require('electron');

const P = 'draw-board:';

contextBridge.exposeInMainWorld('pin', {
  ready: () => ipcRenderer.send(`${P}pin-ready`),
  close: () => ipcRenderer.send(`${P}pin-close`),
  copy: dataUrl => ipcRenderer.send(`${P}pin-copy`, { dataUrl }),
  save: async dataUrl => ipcRenderer.invoke(`${P}pin-save`, { dataUrl }),
  startMove: (screenX, screenY) => ipcRenderer.send(`${P}pin-start-move`, { screenX, screenY }),
  move: (screenX, screenY) => ipcRenderer.send(`${P}pin-move`, { screenX, screenY }),
  endMove: () => ipcRenderer.send(`${P}pin-end-move`),
  showMenu: () => ipcRenderer.send(`${P}pin-show-menu`),
  onInit: fn => ipcRenderer.on(`${P}pin-init`, (_e, payload) => fn(payload)),
  onAction: (channel, fn) => {
    const listener = (_e, payload) => fn(payload);
    ipcRenderer.on(`${P}${channel}`, listener);
    return () => ipcRenderer.removeListener(`${P}${channel}`, listener);
  },
});
