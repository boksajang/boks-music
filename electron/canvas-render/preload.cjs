// Minimal bridge for the hidden GPU render window: receive one job, stream encoded chunks back.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('boksCanvasRender', {
  onJob: callback => ipcRenderer.once('canvas-render:job', (_event, job) => callback(job)),
  chunk: bytes => ipcRenderer.send('canvas-render:chunk', bytes),
  progress: value => ipcRenderer.send('canvas-render:progress', value),
  done: report => ipcRenderer.send('canvas-render:done', report),
  fail: message => ipcRenderer.send('canvas-render:fail', String(message)),
});
