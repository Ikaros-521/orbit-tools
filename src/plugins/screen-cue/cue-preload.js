/* Shared preload for all screen-cue overlay windows (ink / draw / mag).
   Namespaced one-way bridge — fire-and-forget sends plus subscribe-only
   channels, mirroring screenshot-pin's overlay-preload pattern. */
const { contextBridge, ipcRenderer } = require('electron');

const P = 'screen-cue:';

contextBridge.exposeInMainWorld('cue', {
  ready: () => ipcRenderer.send(`${P}ready`),
  displayed: () => ipcRenderer.send(`${P}displayed`),
  commit: stroke => ipcRenderer.send(`${P}commit`, { stroke }),
  undo: () => ipcRenderer.send(`${P}undo`),
  clearInk: () => ipcRenderer.send(`${P}clear-ink`),
  exitDraw: () => ipcRenderer.send(`${P}exit-draw`),
  toolState: state => ipcRenderer.send(`${P}tool-state`, { state }),
  zoom: dir => ipcRenderer.send(`${P}zoom`, { dir }),
  /* renderer-side self rescue: close this window even if the backend hangs */
  closeMe: () => ipcRenderer.send(`${P}close-me`),
  onInit: fn => ipcRenderer.on(`${P}init`, (_e, p) => fn(p)),
  onStrokes: fn => ipcRenderer.on(`${P}strokes`, (_e, p) => fn(p)),
  onInkSettings: fn => ipcRenderer.on(`${P}ink-settings`, (_e, p) => fn(p)),
  onLensSettings: fn => ipcRenderer.on(`${P}lens-settings`, (_e, p) => fn(p)),
  onCursor: fn => ipcRenderer.on(`${P}cursor`, (_e, p) => fn(p)),
  onFrame: fn => ipcRenderer.on(`${P}frame`, (_e, p) => fn(p)),
});
