const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  toggleMapResultOverlayPin: () => ipcRenderer.invoke('toggle-map-result-overlay-pin'),
  dismissMapResultOverlay: () => ipcRenderer.invoke('dismiss-map-result-overlay'),
  getOverlayCursorPosition: () => ipcRenderer.invoke('get-overlay-cursor-position'),
  setOverlayPointerPassthrough: (ignore) => ipcRenderer.invoke('set-overlay-pointer-passthrough', ignore),
  confirmStartMapPromptOverlay: (payload) => ipcRenderer.invoke('confirm-start-map-prompt-overlay', payload),
  cancelStartMapPromptOverlay: () => ipcRenderer.invoke('cancel-start-map-prompt-overlay')
});
