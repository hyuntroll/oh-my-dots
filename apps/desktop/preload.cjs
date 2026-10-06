const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', { action: action => { if (['reload', 'browser', 'menu'].includes(action)) ipcRenderer.send('action', action); }, status: callback => ipcRenderer.on('status', (_event, state) => callback(state)) });
