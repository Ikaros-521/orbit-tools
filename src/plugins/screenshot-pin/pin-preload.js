const { contextBridge, ipcRenderer } = require('electron');

const P = 'screenshot-pin:';

contextBridge.exposeInMainWorld('pin', {
  close: () => ipcRenderer.send(`${P}close-pin`),
  startMove: (screenX, screenY) => ipcRenderer.send(`${P}start-move-pin`, { screenX, screenY }),
  move: (screenX, screenY) => ipcRenderer.send(`${P}move-pin`, { screenX, screenY }),
  endMove: () => ipcRenderer.send(`${P}end-move-pin`),
  showMenu: () => ipcRenderer.send(`${P}show-pin-menu`),
  setAnnotating: (annotating, extraHeight) => ipcRenderer.send(`${P}set-pin-annotating`, { annotating, extraHeight }),
  copy: dataUrl => ipcRenderer.send(`${P}copy-image`, { dataUrl }),
  save: async dataUrl => ipcRenderer.invoke(`${P}save`, { dataUrl }),
  onInit: fn => ipcRenderer.on(`${P}init`, (_e, payload) => fn(payload)),
  onToggleAnnotate: fn => ipcRenderer.on(`${P}toggle-annotate`, () => fn()),
  onTriggerCopy: fn => ipcRenderer.on(`${P}trigger-copy`, () => fn()),
  onTriggerSave: fn => ipcRenderer.on(`${P}trigger-save`, () => fn()),
  onSetOpacity: fn => ipcRenderer.on(`${P}set-opacity`, (_e, val) => fn(val)),
  onResetZoom: fn => ipcRenderer.on(`${P}reset-zoom`, () => fn()),
});
