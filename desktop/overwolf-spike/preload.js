const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gepCapture', {
  start: () => ipcRenderer.invoke('gep:start-capture'),
  onRecord: (listener) => {
    if (typeof listener !== 'function') {
      return () => {};
    }

    const handler = (_event, record) => {
      listener(record);
    };

    ipcRenderer.on('gep:capture-record', handler);

    return () => {
      ipcRenderer.removeListener('gep:capture-record', handler);
    };
  }
});
