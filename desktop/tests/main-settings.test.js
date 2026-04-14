const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mainJsPath = path.join(__dirname, '..', 'main.js');
const preloadJsPath = path.join(__dirname, '..', 'preload.js');

function extractFunctionSource(source, functionName, filePath) {
  const signature = `function ${functionName}`;
  const asyncSignature = `async ${signature}`;
  const asyncStartIndex = source.indexOf(asyncSignature);
  const plainStartIndex = source.indexOf(signature);
  const startIndex = asyncStartIndex !== -1 ? asyncStartIndex : plainStartIndex;

  if (startIndex === -1) {
    assert.fail(`Expected ${path.basename(filePath)} to define ${functionName}()`);
  }

  let bodyStartIndex = -1;
  let parenDepth = 0;
  let seenParamList = false;

  const searchStartIndex = startIndex + (asyncStartIndex !== -1 ? asyncSignature.length : signature.length);

  for (let index = searchStartIndex; index < source.length; index += 1) {
    const char = source[index];

    if (char === '(') {
      parenDepth += 1;
      continue;
    }

    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        seenParamList = true;
      }
      continue;
    }

    if (seenParamList && char === '{') {
      bodyStartIndex = index;
      break;
    }
  }

  if (bodyStartIndex === -1) {
    assert.fail(`Unable to locate ${functionName}() body in ${path.basename(filePath)}`);
  }

  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = bodyStartIndex; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      if (!escaped && char === '\'') {
        inSingleQuote = false;
      }
      escaped = !escaped && char === '\\';
      continue;
    }

    if (inDoubleQuote) {
      if (!escaped && char === '"') {
        inDoubleQuote = false;
      }
      escaped = !escaped && char === '\\';
      continue;
    }

    if (inTemplateString) {
      if (!escaped && char === '`') {
        inTemplateString = false;
      }
      escaped = !escaped && char === '\\';
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === '\'') {
      inSingleQuote = true;
      escaped = false;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      escaped = false;
      continue;
    }

    if (char === '`') {
      inTemplateString = true;
      escaped = false;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  assert.fail(`Unable to parse ${functionName}() from ${path.basename(filePath)}`);
}

function loadFunctions(functionNames, contextOverrides = {}) {
  const source = fs.readFileSync(mainJsPath, 'utf8');
  const context = vm.createContext({
    console: {
      log() { }
    },
    ...contextOverrides
  });

  for (const functionName of functionNames) {
    const functionSource = extractFunctionSource(source, functionName, mainJsPath);
    vm.runInContext(`${functionSource};\nthis.${functionName} = ${functionName};`, context);
  }

  return context;
}

function getSettingsAllowlist() {
  return new Set([
    'apiUrl',
    'poePath',
    'autoStartSession',
    'notifications',
    'soundNotifications',
    'language',
    'poeVersion',
    'defaultLeaguePoe1',
    'defaultLeaguePoe2',
    'scanHotkey',
    'stashScanHotkey',
    'overlayEnabled',
    'theme'
  ]);
}

test('main overlay setting is disabled by default when no explicit setting exists', () => {
  const context = loadFunctions(['isOverlayEnabled'], {
    store: {
      get(key) {
        assert.equal(key, 'overlayEnabled');
        return undefined;
      }
    }
  });

  assert.equal(context.isOverlayEnabled(), false);
});

test('main overlay window guard skips creation when disabled and creates when enabled later', () => {
  const calls = [];
  let overlayEnabled = false;
  const context = loadFunctions(['isOverlayEnabled', 'ensureOverlayWindowForSettings'], {
    store: {
      get(key) {
        assert.equal(key, 'overlayEnabled');
        return overlayEnabled;
      }
    },
    app: {
      isReady() {
        calls.push(['isReady']);
        return true;
      }
    },
    createOverlayWindow() {
      calls.push(['createOverlayWindow']);
    },
    updateOverlayWindow() {
      calls.push(['updateOverlayWindow']);
    }
  });

  context.ensureOverlayWindowForSettings();
  overlayEnabled = true;
  context.ensureOverlayWindowForSettings();

  assert.deepEqual(calls, [
    ['updateOverlayWindow'],
    ['isReady'],
    ['createOverlayWindow'],
    ['updateOverlayWindow']
  ]);
});

test('openAuthUrlInBrowser uses shell.openExternal when it succeeds', async () => {
  const calls = [];
  const context = loadFunctions(['openAuthUrlInBrowser'], {
    shell: {
      openExternal: async (url) => {
        calls.push(['openExternal', url]);
      }
    },
    process: {
      platform: 'win32'
    },
    execFile() {
      calls.push(['execFile']);
    }
  });

  await context.openAuthUrlInBrowser('https://www.pathofexile.com/oauth/authorize');

  assert.deepEqual(calls, [['openExternal', 'https://www.pathofexile.com/oauth/authorize']]);
});

test('openAuthUrlInBrowser falls back to cmd start on Windows when shell.openExternal fails', async () => {
  const calls = [];
  const context = loadFunctions(['openAuthUrlInBrowser'], {
    shell: {
      openExternal: async (url) => {
        calls.push(['openExternal', url]);
        throw new Error('openExternal failed');
      }
    },
    process: {
      platform: 'win32'
    },
    execFile(command, args, callback) {
      calls.push(['execFile', command, args]);
      callback(null);
    }
  });

  await context.openAuthUrlInBrowser('https://www.pathofexile.com/oauth/authorize');

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['openExternal', 'https://www.pathofexile.com/oauth/authorize'],
    ['execFile', 'cmd', ['/c', 'start', '', 'https://www.pathofexile.com/oauth/authorize']]
  ]);
});

test('main settings reject invalid apiUrl updates before any settings side effects occur', () => {
  const writes = [];
  let registerGlobalShortcutsCalls = 0;
  let refreshTrayMenuCalls = 0;
  let setBaseURLCalls = 0;
  const context = loadFunctions(['applyDesktopSettings'], {
    SETTINGS_ALLOWLIST: getSettingsAllowlist(),
    store: {
      set(key, value) {
        writes.push([key, value]);
      }
    },
    getValidatedHotkeySettings: () => ({
      scanHotkey: 'Alt+F10',
      stashScanHotkey: 'CommandOrControl+Shift+K'
    }),
    isValidApiUrl: (value) => value === 'http://localhost:3001',
    apiClient: {
      setBaseURL() {
        setBaseURLCalls += 1;
      }
    },
    registerGlobalShortcuts() {
      registerGlobalShortcutsCalls += 1;
    },
    refreshTrayMenu() {
      refreshTrayMenuCalls += 1;
    }
  });

  assert.throws(() => {
    context.applyDesktopSettings({
      apiUrl: 'http://127.0.0.1:9999',
      language: 'tr',
      scanHotkey: 'alt+f10',
      stashScanHotkey: 'ctrl+shift+k'
    });
  }, /invalid api url/i);

  assert.equal(registerGlobalShortcutsCalls, 0);
  assert.equal(refreshTrayMenuCalls, 0);
  assert.equal(setBaseURLCalls, 0);
  assert.deepEqual(writes, []);
});

test('main settings reject blank apiUrl updates before persisting or mutating the live client', () => {
  const writes = [];
  let registerGlobalShortcutsCalls = 0;
  let refreshTrayMenuCalls = 0;
  let setBaseURLCalls = 0;
  const context = loadFunctions(['applyDesktopSettings'], {
    SETTINGS_ALLOWLIST: getSettingsAllowlist(),
    store: {
      set(key, value) {
        writes.push([key, value]);
      }
    },
    getValidatedHotkeySettings: () => ({
      scanHotkey: 'Alt+F10',
      stashScanHotkey: 'CommandOrControl+Shift+K'
    }),
    isValidApiUrl: (value) => value === 'http://localhost:3001',
    apiClient: {
      setBaseURL() {
        setBaseURLCalls += 1;
      }
    },
    registerGlobalShortcuts() {
      registerGlobalShortcutsCalls += 1;
    },
    refreshTrayMenu() {
      refreshTrayMenuCalls += 1;
    }
  });

  assert.throws(() => {
    context.applyDesktopSettings({
      apiUrl: ''
    });
  }, /api url/i);

  assert.equal(registerGlobalShortcutsCalls, 0);
  assert.equal(refreshTrayMenuCalls, 0);
  assert.equal(setBaseURLCalls, 0);
  assert.deepEqual(writes, []);
});

test('runtime game detection keeps the selected settings version while emitting runtime payload to the renderer', () => {
  const {
    createRuntimeSessionState,
    applyRuntimeEvent,
    clearRuntimeSessionState,
    cloneRuntimeSessionState
  } = require('../src/modules/runtimeSessionModel');
  const writes = [];
  const messages = [];
  const priceServiceCalls = [];
  let stopCalls = 0;
  let setupLogParserCalls = 0;
  const runtimeSessionState = createRuntimeSessionState();
  applyRuntimeEvent(runtimeSessionState, {
    type: 'area_entered',
    areaName: 'Stale Shores',
    at: '2026-04-09T12:00:00.000Z'
  });
  const storeState = {
    lastDetectedPoeVersion: 'poe1',
    poeVersion: 'poe1',
    poePath: 'C:/Users/test/Documents/Manual/Client.txt'
  };
  const context = loadFunctions([
    'getRuntimeSessionSnapshot',
    'clearRuntimeSession',
    'applyGameVersion'
  ], {
    store: {
      get(key) {
        return storeState[key];
      },
      set(key, value) {
        storeState[key] = value;
        writes.push([key, value]);
      }
    },
    GameDetector: {
      findLogPath() {
        return 'C:/Games/Path of Exile 2/logs/Client.txt';
      }
    },
    priceService: {
      setPoeVersion(version) {
        priceServiceCalls.push(['setPoeVersion', version]);
      },
      clearCache() {
        priceServiceCalls.push(['clearCache']);
      }
    },
    fs: {
      existsSync(filePath) {
        return filePath === storeState.poePath;
      }
    },
    logParser: {
      isRunning: true,
      stop() {
        stopCalls += 1;
      }
    },
    setupLogParser() {
      setupLogParserCalls += 1;
    },
    runtimeSessionState,
    clearRuntimeSessionState,
    cloneRuntimeSessionState,
    syncNativeGameInfoProducer() {},
    mainWindow: {
      webContents: {
        send(channel, payload) {
          messages.push({ channel, payload });
        }
      }
    }
  });

  context.applyGameVersion('poe2');

  assert.equal(storeState.poeVersion, 'poe1');
  assert.deepEqual(writes, [
    ['lastDetectedPoeVersion', 'poe2'],
    ['poePath', 'C:/Games/Path of Exile 2/logs/Client.txt']
  ]);
  assert.deepEqual(priceServiceCalls, [
    ['setPoeVersion', 'poe2'],
    ['clearCache']
  ]);
  assert.equal(stopCalls, 1);
  assert.equal(setupLogParserCalls, 1);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].channel, 'game-version-changed');
  assert.equal(messages[0].payload.version, 'poe2');
  assert.equal(messages[0].payload.settingsVersion, 'poe1');
  assert.equal(messages[0].payload.lastDetectedVersion, 'poe2');
  assert.equal(messages[0].payload.logPath, 'C:/Games/Path of Exile 2/logs/Client.txt');
  assert.equal(messages[0].payload.runtimeSession.currentInstance, null);
  assert.equal(messages[0].payload.runtimeSession.summary.status, 'idle');
  assert.equal(messages[0].payload.runtimeSession.summary.clearReason, 'log_parser_restarted');
  assert.match(messages[0].payload.runtimeSession.summary.clearedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('runtime game detection retargets pricing when the detected game matches the prior detection but not the saved settings version', () => {
  const {
    createRuntimeSessionState,
    clearRuntimeSessionState,
    cloneRuntimeSessionState
  } = require('../src/modules/runtimeSessionModel');
  const writes = [];
  const priceServiceCalls = [];
  let stopCalls = 0;
  let setupLogParserCalls = 0;
  const detectedLogPath = 'C:/Games/Path of Exile 2/logs/Client.txt';
  const storeState = {
    lastDetectedPoeVersion: 'poe2',
    poeVersion: 'poe1',
    poePath: detectedLogPath
  };
  const context = loadFunctions([
    'getRuntimeSessionSnapshot',
    'clearRuntimeSession',
    'applyGameVersion'
  ], {
    store: {
      get(key) {
        return storeState[key];
      },
      set(key, value) {
        storeState[key] = value;
        writes.push([key, value]);
      }
    },
    GameDetector: {
      findLogPath() {
        return detectedLogPath;
      }
    },
    priceService: {
      poeVersion: 'poe1',
      setPoeVersion(version) {
        this.poeVersion = version;
        priceServiceCalls.push(['setPoeVersion', version]);
      },
      clearCache() {
        priceServiceCalls.push(['clearCache']);
      }
    },
    fs: {
      existsSync(filePath) {
        return filePath === detectedLogPath;
      }
    },
    logParser: {
      isRunning: true,
      stop() {
        stopCalls += 1;
      }
    },
    setupLogParser() {
      setupLogParserCalls += 1;
    },
    runtimeSessionState: createRuntimeSessionState(),
    clearRuntimeSessionState,
    cloneRuntimeSessionState,
    syncNativeGameInfoProducer() {},
    mainWindow: null
  });

  context.applyGameVersion('poe2');

  assert.deepEqual(writes, [['lastDetectedPoeVersion', 'poe2']]);
  assert.deepEqual(priceServiceCalls, [
    ['setPoeVersion', 'poe2'],
    ['clearCache']
  ]);
  assert.equal(stopCalls, 0);
  assert.equal(setupLogParserCalls, 0);
  assert.equal(context.priceService.poeVersion, 'poe2');
});

test('runtime game detection starts the native game info producer for poe2', () => {
  const starts = [];
  const messages = [];
  const capturedProducerOptions = [];
  const gep = { name: 'gep' };
  const storeState = {
    lastDetectedPoeVersion: 'poe1',
    poeVersion: 'poe1',
    poePath: null
  };
  const context = loadFunctions([
    'emitActiveCharacterHint',
    'getNativeGameInfoGameId',
    'getNativeGameInfoProducer',
    'stopNativeGameInfoProducer',
    'syncNativeGameInfoProducer',
    'applyGameVersion'
  ], {
    store: {
      get(key) {
        return storeState[key];
      },
      set(key, value) {
        storeState[key] = value;
      }
    },
    GameDetector: {
      findLogPath() {
        return null;
      }
    },
    fs: {
      existsSync() {
        return false;
      }
    },
    priceService: null,
    logParser: {
      isRunning: true
    },
    nativeGameInfoProducerBinding: null,
    nativeGameInfoProducer: null,
    app: {
      overwolf: {
        packages: {
          gep
        }
      }
    },
    createNativeGameInfoProducer(options) {
      capturedProducerOptions.push(options);
      return {
        start: async (payload) => {
          starts.push(payload);
          return true;
        },
        stop: async () => true
      };
    },
    mainWindow: {
      webContents: {
        send(channel, payload) {
          messages.push({ channel, payload });
        }
      }
    }
  });

  context.applyGameVersion('poe2');

  assert.equal(capturedProducerOptions.length, 1);
  assert.equal(capturedProducerOptions[0].gep, gep);
  assert.equal(typeof capturedProducerOptions[0].emitHint, 'function');

  const nativeHint = {
    source: 'native-info',
    characterName: 'KELLEE'
  };
  capturedProducerOptions[0].emitHint(nativeHint);

  assert.deepEqual(JSON.parse(JSON.stringify(starts)), [{
    poeVersion: 'poe2',
    gameId: 24886
  }]);
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [
    {
      channel: 'game-version-changed',
      payload: {
        version: 'poe2',
        settingsVersion: 'poe1',
        lastDetectedVersion: 'poe2',
        logPath: null
      }
    },
    {
      channel: 'active-character-hint',
      payload: nativeHint
    }
  ]);
});

test('runtime game detection does not restart the native game info producer when the mapping is unchanged', async () => {
  const starts = [];
  const context = loadFunctions([
    'emitActiveCharacterHint',
    'clearNativeActiveCharacterHint',
    'getNativeGameInfoGameId',
    'getNativeGameInfoProducer',
    'stopNativeGameInfoProducer',
    'syncNativeGameInfoProducer'
  ], {
    nativeGameInfoProducerBinding: {
      detectedVersion: 'poe2',
      gameId: 24886
    },
    nativeGameInfoProducer: {
      start(payload) {
        starts.push(payload);
        return true;
      },
      stop() {
        assert.fail('stop should not run for an unchanged mapping');
      }
    },
    mainWindow: null,
    lastActiveCharacterHint: {
      characterName: 'KELLEE'
    }
  });

  const result = await context.syncNativeGameInfoProducer({
    detectedVersion: 'poe2',
    gameId: 24886
  });

  assert.equal(result, true);
  assert.deepEqual(starts, []);
  assert.deepEqual(JSON.parse(JSON.stringify(context.nativeGameInfoProducerBinding)), {
    detectedVersion: 'poe2',
    gameId: 24886
  });
  assert.deepEqual(JSON.parse(JSON.stringify(context.lastActiveCharacterHint)), {
    characterName: 'KELLEE'
  });
});

test('runtime game detection stops the native game info producer when the detected game has no native mapping', () => {
  let stopCalls = 0;
  const messages = [];
  const storeState = {
    lastDetectedPoeVersion: 'poe2',
    poeVersion: 'poe1',
    poePath: null
  };
  const context = loadFunctions([
    'emitActiveCharacterHint',
    'clearNativeActiveCharacterHint',
    'getNativeGameInfoGameId',
    'stopNativeGameInfoProducer',
    'syncNativeGameInfoProducer',
    'applyGameVersion'
  ], {
    store: {
      get(key) {
        return storeState[key];
      },
      set(key, value) {
        storeState[key] = value;
      }
    },
    GameDetector: {
      findLogPath() {
        return null;
      }
    },
    fs: {
      existsSync() {
        return false;
      }
    },
    priceService: null,
    logParser: {
      isRunning: true
    },
    nativeGameInfoProducerBinding: {
      detectedVersion: 'poe2',
      gameId: 24886
    },
    nativeGameInfoProducer: {
      stop() {
        stopCalls += 1;
        return true;
      }
    },
    nativeGameInfoProducerBinding: {
      detectedVersion: 'poe2',
      gameId: 24886
    },
    lastActiveCharacterHint: {
      characterName: 'KELLEE'
    },
    mainWindow: {
      webContents: {
        send(channel, payload) {
          messages.push({ channel, payload });
        }
      }
    }
  });

  context.applyGameVersion('poe1');

  assert.equal(stopCalls, 1);
  assert.equal(context.lastActiveCharacterHint, null);
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [
    {
      channel: 'active-character-hint',
      payload: null
    },
    {
      channel: 'game-version-changed',
      payload: {
        version: 'poe1',
        settingsVersion: 'poe1',
        lastDetectedVersion: 'poe1',
        logPath: null
      }
    }
  ]);
});

test('main runtime log events attach normalized runtime session state to existing map IPC payloads', () => {
  const {
    createRuntimeSessionState,
    applyRuntimeEvent,
    cloneRuntimeSessionState
  } = require('../src/modules/runtimeSessionModel');
  const messages = [];
  const context = loadFunctions([
    'normalizeRuntimeLogEvent',
    'getRuntimeSessionSnapshot',
    'publishRuntimeSessionEvent'
  ], {
    runtimeSessionState: createRuntimeSessionState(),
    applyRuntimeEvent,
    cloneRuntimeSessionState,
    mainWindow: {
      webContents: {
        send(channel, payload) {
          messages.push({ channel, payload });
        }
      }
    }
  });

  context.publishRuntimeSessionEvent('area_entered', {
    mapName: 'Crimson Shores',
    mapTier: 16,
    timestamp: new Date('2026-04-09T12:00:00.000Z')
  });
  context.publishRuntimeSessionEvent('area_exited', {
    mapName: 'Crimson Shores',
    timestamp: new Date('2026-04-09T12:05:30.000Z')
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].channel, 'map-entered');
  assert.equal(messages[0].payload.runtimeSession.currentInstance.areaName, 'Crimson Shores');
  assert.equal(messages[0].payload.runtimeSession.currentInstance.status, 'active');
  assert.equal(messages[1].channel, 'map-exited');
  assert.equal(messages[1].payload.runtimeSession.instances.length, 1);
  assert.equal(messages[1].payload.runtimeSession.instances[0].durationSeconds, 330);
  assert.equal(messages[1].payload.runtimeSession.summary.status, 'idle');
});

test('main runtime log events normalize parser-shaped payloads and malformed timestamps', () => {
  const {
    createRuntimeSessionState,
    applyRuntimeEvent,
    cloneRuntimeSessionState
  } = require('../src/modules/runtimeSessionModel');
  const messages = [];
  const context = loadFunctions([
    'normalizeRuntimeLogEvent',
    'getRuntimeSessionSnapshot',
    'publishRuntimeSessionEvent'
  ], {
    runtimeSessionState: createRuntimeSessionState(),
    applyRuntimeEvent,
    cloneRuntimeSessionState,
    mainWindow: {
      webContents: {
        send(channel, payload) {
          messages.push({ channel, payload });
        }
      }
    }
  });

  context.publishRuntimeSessionEvent('area_entered', {
    mapName: 'Crimson Shores',
    mapTier: 16,
    timestamp: {}
  });
  context.publishRuntimeSessionEvent('area_exited', {
    mapName: 'Crimson Shores',
    timestamp: '2026-04-09T12:05:30.000Z'
  });

  assert.equal(messages[0].payload.runtimeSession.currentInstance.areaName, 'Crimson Shores');
  assert.equal(messages[0].payload.runtimeSession.currentInstance.enteredAt, '1970-01-01T00:00:00.000Z');
  assert.equal(messages[1].payload.runtimeSession.instances[0].mapTier, 16);
  assert.ok(messages[1].payload.runtimeSession.instances[0].durationSeconds > 0);
});

test('desktop preload exposes native character hint listener', () => {
  const source = fs.readFileSync(preloadJsPath, 'utf8');

  assert.match(source, /onActiveCharacterHint:\s*\(callback\)\s*=>/);
  assert.match(source, /ipcRenderer\.on\('active-character-hint'/);
  assert.match(source, /getLastActiveCharacterHint:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('get-last-active-character-hint'\)/);
});

test('main process forwards native active-character hints to the renderer', () => {
  const payload = {
    source: 'native'
  };
  const messages = [];
  const context = loadFunctions(['emitActiveCharacterHint'], {
    mainWindow: {
      webContents: {
        send(channel, data) {
          messages.push({ channel, data });
        }
      }
    }
  });

  context.emitActiveCharacterHint(payload);

  assert.deepEqual(messages, [{
    channel: 'active-character-hint',
    data: payload
  }]);
});

test('main process caches the last native active-character hint for later retrieval', () => {
  const payload = {
    source: 'native',
    characterName: 'KELLEE'
  };
  const messages = [];
  const context = loadFunctions(['emitActiveCharacterHint'], {
    lastActiveCharacterHint: null,
    mainWindow: {
      webContents: {
        send(channel, data) {
          messages.push({ channel, data });
        }
      }
    }
  });

  context.emitActiveCharacterHint(payload);

  assert.deepEqual(messages, [{
    channel: 'active-character-hint',
    data: payload
  }]);
  assert.deepEqual(JSON.parse(JSON.stringify(context.lastActiveCharacterHint)), payload);
});

test('main game close clears active runtime session state before notifying renderer', () => {
  const {
    createRuntimeSessionState,
    applyRuntimeEvent,
    clearRuntimeSessionState,
    cloneRuntimeSessionState
  } = require('../src/modules/runtimeSessionModel');
  const messages = [];
  const runtimeSessionState = createRuntimeSessionState();
  applyRuntimeEvent(runtimeSessionState, {
    type: 'area_entered',
    areaName: 'Overgrown',
    at: '2026-04-09T12:00:00.000Z'
  });
  const context = loadFunctions([
    'getRuntimeSessionSnapshot',
    'clearRuntimeSession',
    'handleGameClosed'
  ], {
    runtimeSessionState,
    clearRuntimeSessionState,
    cloneRuntimeSessionState,
    console: {
      log() { }
    },
    stopNativeGameInfoProducer() {},
    mainWindow: {
      webContents: {
        send(channel, payload) {
          messages.push({ channel, payload });
        }
      }
    }
  });

  context.handleGameClosed('poe1', '2026-04-09T12:03:30.000Z');

  assert.equal(context.runtimeSessionState.currentInstance, null);
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{
    channel: 'game-closed',
    payload: {
      version: 'poe1',
      runtimeSession: {
        currentInstance: null,
        instances: [],
        totalActiveSeconds: 0,
        summary: {
          status: 'idle',
          currentAreaName: null,
          currentInstanceSeconds: 0,
          totalActiveSeconds: 0,
          instanceCount: 0,
          lastAreaName: null,
          lastExitedAt: null,
          clearReason: 'game_closed',
          clearedAt: '2026-04-09T12:03:30.000Z'
        }
      }
    }
  }]);
});

test('main game close stops the native game info producer', () => {
  const {
    createRuntimeSessionState,
    clearRuntimeSessionState,
    cloneRuntimeSessionState
  } = require('../src/modules/runtimeSessionModel');
  let stopCalls = 0;
  const messages = [];
  const context = loadFunctions([
    'emitActiveCharacterHint',
    'clearNativeActiveCharacterHint',
    'getRuntimeSessionSnapshot',
    'clearRuntimeSession',
    'stopNativeGameInfoProducer',
    'handleGameClosed'
  ], {
    runtimeSessionState: createRuntimeSessionState(),
    clearRuntimeSessionState,
    cloneRuntimeSessionState,
    console: {
      log() { }
    },
    nativeGameInfoProducer: {
      stop() {
        stopCalls += 1;
        return true;
      }
    },
    nativeGameInfoProducerBinding: {
      detectedVersion: 'poe2',
      gameId: 24886
    },
    lastActiveCharacterHint: {
      characterName: 'KELLEE'
    },
    mainWindow: {
      webContents: {
        send(channel, payload) {
          messages.push({ channel, payload });
        }
      }
    }
  });

  context.handleGameClosed('poe2', '2026-04-09T12:03:30.000Z');

  assert.equal(stopCalls, 1);
  assert.equal(context.lastActiveCharacterHint, null);
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [
    {
      channel: 'active-character-hint',
      payload: null
    },
    {
      channel: 'game-closed',
      payload: {
        version: 'poe2',
        runtimeSession: {
          currentInstance: null,
          instances: [],
          totalActiveSeconds: 0,
          summary: {
            status: 'idle',
            currentAreaName: null,
            currentInstanceSeconds: 0,
            totalActiveSeconds: 0,
            instanceCount: 0,
            lastAreaName: null,
            lastExitedAt: null,
            clearReason: 'game_closed',
            clearedAt: '2026-04-09T12:03:30.000Z'
          }
        }
      }
    }
  ]);
});

test('main logout stops the native game info producer while clearing desktop auth state', () => {
  const writes = [];
  const auditTrail = [];
  let stopCalls = 0;
  let clearAllCalls = 0;
  let clearDismissTimerCalls = 0;
  const overlayUpdates = [];
  let apiToken = 'token';
  const context = loadFunctions([
    'emitActiveCharacterHint',
    'clearNativeActiveCharacterHint',
    'stopNativeGameInfoProducer',
    'handleLogout'
  ], {
    appendAuditTrail(key) {
      auditTrail.push(key);
    },
    store: {
      set(key, value) {
        writes.push([key, value]);
      }
    },
    apiClient: {
      setToken(value) {
        apiToken = value;
      }
    },
    currentSession: {
      id: 'session-1'
    },
    stashAnalyzer: {
      clearAll() {
        clearAllCalls += 1;
      }
    },
    overlayMapResultState: {
      result: true
    },
    lastActiveCharacterHint: {
      characterName: 'KELLEE'
    },
    clearOverlayMapResultDismissTimer() {
      clearDismissTimerCalls += 1;
    },
    updateOverlayWindow(payload) {
      overlayUpdates.push(payload);
    },
    mainWindow: null,
    nativeGameInfoProducer: {
      stop() {
        stopCalls += 1;
        return true;
      }
    }
  });

  const result = context.handleLogout();

  assert.equal(result, true);
  assert.equal(stopCalls, 1);
  assert.deepEqual(auditTrail, ['auditLogout']);
  assert.deepEqual(writes, [
    ['authToken', null],
    ['authTokenEncrypted', null],
    ['currentUserId', null]
  ]);
  assert.equal(apiToken, null);
  assert.equal(context.currentSession, null);
  assert.equal(context.overlayMapResultState, null);
  assert.equal(context.lastActiveCharacterHint, null);
  assert.equal(clearAllCalls, 1);
  assert.equal(clearDismissTimerCalls, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(overlayUpdates)), [{ character: null }]);
});

test('main app shutdown stops the native game info producer with the rest of the main-process cleanup', () => {
  let stopCalls = 0;
  let unregisterAllCalls = 0;
  let logParserStopCalls = 0;
  let gameDetectorStopCalls = 0;
  let trayDestroyCalls = 0;
  let overlayDestroyCalls = 0;
  const clearedIntervals = [];
  const context = loadFunctions([
    'emitActiveCharacterHint',
    'clearNativeActiveCharacterHint',
    'stopNativeGameInfoProducer',
    'handleAppWillQuit'
  ], {
    globalShortcut: {
      unregisterAll() {
        unregisterAllCalls += 1;
      }
    },
    logParser: {
      stop() {
        logParserStopCalls += 1;
      }
    },
    gameDetector: {
      stop() {
        gameDetectorStopCalls += 1;
      }
    },
    ocrScanner: null,
    tray: {
      destroy() {
        trayDestroyCalls += 1;
      }
    },
    overlayWindow: {
      isDestroyed() {
        return false;
      },
      destroy() {
        overlayDestroyCalls += 1;
      }
    },
    lastActiveCharacterHint: {
      characterName: 'KELLEE'
    },
    mainWindow: null,
    pendingLootFlushInterval: 42,
    clearInterval(intervalId) {
      clearedIntervals.push(intervalId);
    },
    nativeGameInfoProducer: {
      stop() {
        stopCalls += 1;
        return true;
      }
    }
  });

  context.handleAppWillQuit();

  assert.equal(stopCalls, 1);
  assert.equal(unregisterAllCalls, 1);
  assert.equal(logParserStopCalls, 1);
  assert.equal(gameDetectorStopCalls, 1);
  assert.equal(trayDestroyCalls, 1);
  assert.equal(overlayDestroyCalls, 1);
  assert.deepEqual(clearedIntervals, [42]);
  assert.equal(context.lastActiveCharacterHint, null);
  assert.equal(context.tray, null);
  assert.equal(context.overlayWindow, null);
  assert.equal(context.pendingLootFlushInterval, null);
});

test('language migration preserves an existing saved locale while marking the migration complete', () => {
  const writes = [];
  const storeState = {
    language: 'tr',
    _langMigrated: undefined
  };
  const context = loadFunctions(['migrateLanguageSetting'], {
    store: {
      get(key) {
        return storeState[key];
      },
      set(key, value) {
        storeState[key] = value;
        writes.push([key, value]);
      }
    }
  });

  context.migrateLanguageSetting();

  assert.equal(storeState.language, 'tr');
  assert.deepEqual(writes, [['_langMigrated', true]]);
});

test('language migration backfills english only when no saved locale exists', () => {
  const writes = [];
  const storeState = {
    language: '',
    _langMigrated: undefined
  };
  const context = loadFunctions(['migrateLanguageSetting'], {
    store: {
      get(key) {
        return storeState[key];
      },
      set(key, value) {
        storeState[key] = value;
        writes.push([key, value]);
      }
    }
  });

  context.migrateLanguageSetting();

  assert.deepEqual(writes, [
    ['language', 'en'],
    ['_langMigrated', true]
  ]);
});
