const DEFAULT_WINDOW_NAME = 'juice-journal-map-result-overlay';
const OVERLAY_MARGIN = 24;
const PASSIVE_PROFILE = 'passive';
const INTERACTIVE_PROFILE = 'interactive';
const WINDOW_PROFILES = {
  [PASSIVE_PROFILE]: {
    width: 360,
    height: 112,
    clickThrough: true,
    passthrough: 'passThroughAndNotify',
    focusable: false
  },
  [INTERACTIVE_PROFILE]: {
    width: 440,
    height: 286,
    clickThrough: false,
    passthrough: 'noPassThrough',
    focusable: true
  }
};

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

function closeOverlayWindow(overlayWindow) {
  if (typeof overlayWindow.destroy === 'function') {
    return overlayWindow.destroy();
  }

  if (typeof overlayWindow.close === 'function') {
    return overlayWindow.close();
  }

  return Promise.resolve(null);
}

function getProfileNameForState(state = {}) {
  return state?.visibility !== 'hidden' && state?.mode === 'start-map-prompt'
    ? INTERACTIVE_PROFILE
    : PASSIVE_PROFILE;
}

function getActiveGameWindowSize(overlayApi) {
  const activeGameInfo = typeof overlayApi?.getActiveGameInfo === 'function'
    ? overlayApi.getActiveGameInfo()
    : null;
  const size = activeGameInfo?.gameWindowInfo?.size
    || activeGameInfo?.gameWindowInfo?.clientSize
    || activeGameInfo?.gameWindowInfo?.windowSize
    || null;
  const width = Number(size?.width);
  const height = Number(size?.height);

  return {
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null
  };
}

function getWindowLayout({ overlayApi, profile }) {
  const profileOptions = WINDOW_PROFILES[profile] || WINDOW_PROFILES[PASSIVE_PROFILE];
  const gameSize = getActiveGameWindowSize(overlayApi);
  const width = profileOptions.width;
  const height = profileOptions.height;

  return {
    width,
    height,
    x: Math.max(OVERLAY_MARGIN, (gameSize.width || 0) - width - OVERLAY_MARGIN),
    y: OVERLAY_MARGIN
  };
}

function applyWindowLayout(overlayWindow, layout) {
  if (!overlayWindow || !layout) {
    return;
  }

  if (typeof overlayWindow.setBounds === 'function') {
    overlayWindow.setBounds(layout);
    return;
  }

  if (typeof overlayWindow.setSize === 'function') {
    overlayWindow.setSize(layout.width, layout.height);
  }

  if (typeof overlayWindow.setPosition === 'function') {
    overlayWindow.setPosition(layout.x, layout.y);
  }
}

function createWindowOptions({ overlayApi, windowName, profile, preloadPath }) {
  const profileOptions = WINDOW_PROFILES[profile] || WINDOW_PROFILES[PASSIVE_PROFILE];
  const layout = getWindowLayout({ overlayApi, profile });
  const windowOptions = {
    name: windowName,
    width: layout.width,
    height: layout.height,
    x: layout.x,
    y: layout.y,
    transparent: true,
    frame: false,
    resizable: false,
    show: false,
    passthrough: profileOptions.passthrough,
    zOrder: 'topMost',
    strictToGameWindow: true,
    focusable: profileOptions.focusable,
    alwaysOnTop: true
  };

  if (preloadPath) {
    windowOptions.webPreferences = {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    };
  }

  return windowOptions;
}

function createOverwolfOverlayProvider({
  overlayApi = null,
  entryPath = '',
  preloadPath = '',
  logger = console,
  windowName = DEFAULT_WINDOW_NAME
} = {}) {
  let overlayWindow = null;
  let overlayWindowProfile = null;
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

  async function ensureWindow(profile = PASSIVE_PROFILE) {
    if (overlayWindow && overlayWindowProfile === profile) {
      return Promise.resolve(overlayWindow);
    }

    if (!isAvailable()) {
      return Promise.reject(new Error('Overwolf overlay API is unavailable'));
    }

    if (overlayWindow) {
      const staleWindow = overlayWindow;
      overlayWindow = null;
      overlayWindowProfile = null;
      await Promise.resolve(hideOverlayWindow(staleWindow)).catch(() => null);
      await Promise.resolve(closeOverlayWindow(staleWindow)).catch(() => null);
    }

    if (!createWindowPromise) {
      const windowOptions = createWindowOptions({ overlayApi, windowName, profile, preloadPath });

      createWindowPromise = Promise.resolve(overlayApi.createWindow(windowOptions))
        .then((createdWindow) => {
          const normalizedWindow = normalizeOverlayWindow(createdWindow);
          if (!normalizedWindow) {
            throw new Error('Overwolf overlay window was not created');
          }

          overlayWindow = normalizedWindow;
          overlayWindowProfile = profile;
          return Promise.resolve(loadOverlayEntry(overlayWindow, entryPath)).then(() => overlayWindow);
        })
        .catch((error) => {
          overlayWindow = null;
          overlayWindowProfile = null;
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

    if (state.visibility === 'hidden') {
      if (overlayWindow) {
        await hideOverlayWindow(overlayWindow);
      }
      return {
        handled: true,
        provider: 'overwolf'
      };
    }

    const windowRef = await ensureWindow(getProfileNameForState(state));
    applyWindowLayout(windowRef, getWindowLayout({ overlayApi, profile: getProfileNameForState(state) }));
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
