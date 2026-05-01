const DEFAULT_WINDOW_NAME = 'juice-journal-map-result-overlay';

function createStatus(available, reason = null) {
  return {
    provider: 'overwolf',
    available,
    reason
  };
}

function normalizeOverlayWindow(createdWindow) {
  if (!createdWindow) {
    return null;
  }

  return createdWindow.window || createdWindow.browserWindow || createdWindow;
}

function toFileUrl(filePath) {
  const normalizedPath = String(filePath || '').replace(/\\/g, '/');
  return normalizedPath.startsWith('file://') ? normalizedPath : `file://${normalizedPath}`;
}

function executeOverlayScript(overlayWindow, script) {
  if (typeof overlayWindow.executeJavaScript === 'function') {
    return overlayWindow.executeJavaScript(script, true);
  }

  if (typeof overlayWindow.webContents?.executeJavaScript === 'function') {
    return overlayWindow.webContents.executeJavaScript(script, true);
  }

  return Promise.resolve(null);
}

function loadOverlayEntry(overlayWindow, entryPath) {
  if (typeof overlayWindow.loadFile === 'function') {
    return overlayWindow.loadFile(entryPath);
  }

  if (typeof overlayWindow.loadURL === 'function') {
    return overlayWindow.loadURL(toFileUrl(entryPath));
  }

  return Promise.resolve(null);
}

function showOverlayWindow(overlayWindow) {
  if (typeof overlayWindow.showInactive === 'function') {
    return overlayWindow.showInactive();
  }

  if (typeof overlayWindow.show === 'function') {
    return overlayWindow.show();
  }

  return Promise.resolve(null);
}

function hideOverlayWindow(overlayWindow) {
  if (typeof overlayWindow.hide === 'function') {
    return overlayWindow.hide();
  }

  return Promise.resolve(null);
}

function createOverwolfOverlayProvider({
  overlayApi = null,
  entryPath = '',
  logger = console,
  windowName = DEFAULT_WINDOW_NAME
} = {}) {
  let overlayWindow = null;
  let createWindowPromise = null;

  function isAvailable() {
    return Boolean(overlayApi && typeof overlayApi.createWindow === 'function');
  }

  function getStatus() {
    if (!isAvailable()) {
      return createStatus(false, 'overlay-api-unavailable');
    }

    return createStatus(true);
  }

  function ensureWindow() {
    if (overlayWindow) {
      return Promise.resolve(overlayWindow);
    }

    if (!isAvailable()) {
      return Promise.reject(new Error('Overwolf overlay API is unavailable'));
    }

    if (!createWindowPromise) {
      const windowOptions = {
        name: windowName,
        width: 360,
        height: 112,
        x: 0,
        y: 24,
        transparent: true,
        frameless: true,
        resizable: false,
        show: false,
        clickThrough: true,
        gameTargeting: 'active-game',
        alwaysOnTop: true
      };

      createWindowPromise = Promise.resolve(overlayApi.createWindow(windowOptions))
        .then((createdWindow) => {
          const normalizedWindow = normalizeOverlayWindow(createdWindow);
          if (!normalizedWindow) {
            throw new Error('Overwolf overlay window was not created');
          }

          overlayWindow = normalizedWindow;
          return Promise.resolve(loadOverlayEntry(overlayWindow, entryPath)).then(() => overlayWindow);
        })
        .catch((error) => {
          overlayWindow = null;
          logger?.warn?.('[OverwolfOverlayProvider] Failed to create overlay window', error);
          throw error;
        })
        .finally(() => {
          createWindowPromise = null;
        });
    }

    return createWindowPromise;
  }

  async function renderState(state = {}) {
    if (!isAvailable()) {
      return {
        handled: false,
        provider: 'overwolf',
        reason: 'overlay-api-unavailable'
      };
    }

    const windowRef = await ensureWindow();
    if (state.visibility === 'hidden') {
      await hideOverlayWindow(windowRef);
      return {
        handled: true,
        provider: 'overwolf'
      };
    }

    await showOverlayWindow(windowRef);

    const serializedState = JSON.stringify(state).replace(/</g, '\\u003c');
    await executeOverlayScript(
      windowRef,
      `window.JuiceOverlay && window.JuiceOverlay.renderState(${serializedState});`
    );

    return {
      handled: true,
      provider: 'overwolf'
    };
  }

  function hide() {
    if (!overlayWindow) {
      return Promise.resolve(false);
    }

    return Promise.resolve(hideOverlayWindow(overlayWindow)).then(() => true);
  }

  return {
    isAvailable,
    getStatus,
    renderState,
    hide
  };
}

module.exports = {
  createOverwolfOverlayProvider
};
