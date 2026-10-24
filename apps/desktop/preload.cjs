const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', { action: action => { if (['reload', 'browser', 'menu'].includes(action)) ipcRenderer.send('action', action); }, theme: callback => ipcRenderer.on('theme', (_event, theme) => callback(theme)), status: callback => ipcRenderer.on('status', (_event, state) => callback(state)) });
