const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

const FEATURES = ['gep_internal', 'me', 'match_info', 'game_info', 'death', 'kill'];
const GAME_TARGETS = [
  { poeVersion: 'poe1', gameId: 7212, label: 'Path of Exile' },
  { poeVersion: 'poe2', gameId: 24886, label: 'Path of Exile 2' }
];
const GEP_READY_TIMEOUT_MS = 15000;

let activeCapture = null;
let mainWindow = null;

function getGep() {
  return app?.overwolf?.packages?.gep || null;
}

function getPackageManager() {
  return app?.overwolf?.packages || null;
}

function sendRecord(webContents, record) {
  if (!webContents || webContents.isDestroyed()) {
    return;
  }

  webContents.send('gep:capture-record', record);
}

function serializeError(error) {
  return {
    message: error?.message || String(error),
    name: error?.name || 'Error'
  };
}

function redactChatEvent(event) {
  if (!event || typeof event !== 'object') {
    return event;
  }

  const name = String(event.name || event.event || '').toLowerCase();
  if (name !== 'chat') {
    return event;
  }

  return {
    ...event,
    data: '[redacted-chat-event]'
  };
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (Array.isArray(payload.events)) {
    return {
      ...payload,
      events: payload.events.map(redactChatEvent)
    };
  }

  return redactChatEvent(payload);
}

function removeGepListener(gep, eventName, handler) {
  if (typeof gep?.removeListener === 'function') {
    gep.removeListener(eventName, handler);
    return;
  }

  if (typeof gep?.off === 'function') {
    gep.off(eventName, handler);
  }
}

function removePackageManagerListener(packageManager, eventName, handler) {
  if (typeof packageManager?.removeListener === 'function') {
    packageManager.removeListener(eventName, handler);
    return;
  }

  if (typeof packageManager?.off === 'function') {
    packageManager.off(eventName, handler);
  }
}

function getPackageManagerStatus(packageManager) {
  if (!packageManager) {
    return {
      available: false
    };
  }

  let pendingUpdates = null;
  try {
    if (typeof packageManager.hasPendingUpdates === 'function') {
      pendingUpdates = packageManager.hasPendingUpdates();
    }
  } catch {}

  return {
    available: true,
    hasGep: Boolean(packageManager.gep),
    logsFolderPath: packageManager.logsFolderPath || null,
    pendingUpdates
  };
}

function waitForGepPackage(webContents, timeoutMs = GEP_READY_TIMEOUT_MS) {
  const existingGep = getGep();
  if (existingGep) {
    return Promise.resolve(existingGep);
  }

  const packageManager = getPackageManager();
  if (!packageManager || typeof packageManager.on !== 'function') {
    return Promise.resolve(null);
  }

  sendRecord(webContents, {
    type: 'package-manager-status',
    status: getPackageManagerStatus(packageManager)
  });

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      removePackageManagerListener(packageManager, 'ready', readyHandler);
      removePackageManagerListener(packageManager, 'failed-to-initialize', failedHandler);
    };

    const settle = (callback, value) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback(value);
    };

    const readyHandler = (_event, packageName, version) => {
      sendRecord(webContents, {
        type: 'package-ready',
        packageName,
        version
      });

      if (packageName === 'gep') {
        settle(resolve, getGep());
      }
    };

    const failedHandler = (_event, packageName) => {
      sendRecord(webContents, {
        type: 'package-failed-to-initialize',
        packageName
      });

      if (packageName === 'gep') {
        settle(reject, new Error('GEP package failed to initialize.'));
      }
    };

    const timer = setTimeout(() => {
      settle(resolve, getGep());
    }, timeoutMs);

    packageManager.on('ready', readyHandler);
    packageManager.on('failed-to-initialize', failedHandler);
  });
}

function stopCapture() {
  if (!activeCapture) {
    return;
  }

  const { gep, handlers } = activeCapture;
  for (const [eventName, handler] of handlers) {
    try {
      removeGepListener(gep, eventName, handler);
    } catch {}
  }

  activeCapture = null;
}

async function emitInfoSnapshot(gep, webContents, target) {
  try {
    const info = await gep.getInfo(target.gameId);
    sendRecord(webContents, {
      type: 'info',
      target,
      payload: sanitizePayload(info)
    });
  } catch (error) {
    sendRecord(webContents, {
      type: 'error',
      target,
      error: serializeError(error)
    });
  }
}

async function startCapture(webContents) {
  stopCapture();

  sendRecord(webContents, {
    type: 'target-games',
    targets: GAME_TARGETS,
    features: FEATURES
  });

  let gep = null;
  try {
    gep = await waitForGepPackage(webContents);
  } catch (error) {
    sendRecord(webContents, {
      type: 'error',
      error: serializeError(error)
    });
    return {
      success: false,
      error: serializeError(error)
    };
  }

  if (
    !gep
    || typeof gep.setRequiredFeatures !== 'function'
    || typeof gep.getInfo !== 'function'
    || typeof gep.on !== 'function'
  ) {
    const reason = 'app.overwolf.packages.gep is unavailable. Run this harness with ow-electron and the Overwolf client.';
    sendRecord(webContents, {
      type: 'error',
      message: reason
    });
    return {
      success: false,
      reason
    };
  }

  const infoUpdateHandler = async (_event, gameId, payload) => {
    const target = GAME_TARGETS.find((candidate) => candidate.gameId === gameId) || { gameId };
    sendRecord(webContents, {
      type: 'info-update-event',
      target,
      payload: sanitizePayload(payload)
    });
    await emitInfoSnapshot(gep, webContents, target);
  };

  const gameEventHandler = (_event, gameId, payload) => {
    const target = GAME_TARGETS.find((candidate) => candidate.gameId === gameId) || { gameId };
    sendRecord(webContents, {
      type: 'game-event',
      target,
      payload: sanitizePayload(payload)
    });
  };

  const gameExitHandler = (_event, gameId) => {
    const target = GAME_TARGETS.find((candidate) => candidate.gameId === gameId) || { gameId };
    sendRecord(webContents, {
      type: 'game-exit',
      target
    });
  };

  const handlers = [
    ['new-info-update', infoUpdateHandler],
    ['new-game-event', gameEventHandler],
    ['game-exit', gameExitHandler]
  ];

  try {
    for (const [eventName, handler] of handlers) {
      gep.on(eventName, handler);
    }
    activeCapture = { gep, handlers };

    for (const target of GAME_TARGETS) {
      await gep.setRequiredFeatures(target.gameId, FEATURES);
      sendRecord(webContents, {
        type: 'set-required-features',
        target,
        features: FEATURES
      });
      await emitInfoSnapshot(gep, webContents, target);
    }
  } catch (error) {
    stopCapture();
    sendRecord(webContents, {
      type: 'error',
      error: serializeError(error)
    });
    return {
      success: false,
      error: serializeError(error)
    };
  }

  return {
    success: true,
    targets: GAME_TARGETS
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Juice Journal GEP Capture',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('gep:start-capture', (event) => startCapture(event.sender));

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopCapture();
  app.quit();
});
