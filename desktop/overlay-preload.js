const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onOverlayState: (callback) => {
    ipcRenderer.on('overlay-render-state', (_event, state) => callback(state));
  },
  toggleMapResultOverlayPin: () => ipcRenderer.invoke('toggle-map-result-overlay-pin'),
  dismissMapResultOverlay: () => ipcRenderer.invoke('dismiss-map-result-overlay'),
  getOverlayCursorPosition: () => ipcRenderer.invoke('get-overlay-cursor-position'),
  confirmStartMapPromptOverlay: (payload) => ipcRenderer.invoke('confirm-start-map-prompt-overlay', payload),
  cancelStartMapPromptOverlay: () => ipcRenderer.invoke('cancel-start-map-prompt-overlay')
});
