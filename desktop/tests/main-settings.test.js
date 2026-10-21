const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
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

function loadMainWithMocks({
  fs: fsOverride,
  GameDetector: gameDetectorOverride,
  logParser,
  mainWindow,
  priceService,
  store,
  storeState,
  ...contextOverrides
} = {}) {
  const messages = [];
  const runtimeStoreState = {
    lastDetectedPoeVersion: 'poe1',
    poeVersion: 'poe1',
    poePath: null,
    ...storeState
  };
  const context = loadFunctions([
    'applyGameVersion'
  ], {
    store: store || {
      get(key) {
        return runtimeStoreState[key];
      },
      set(key, value) {
        runtimeStoreState[key] = value;
      }
    },
    GameDetector: gameDetectorOverride || {
      findLogPath() {
        return null;
      }
    },
    fs: fsOverride || {
      existsSync() {
        return false;
      }
    },
    priceService: priceService ?? null,
    logParser: logParser || {
      isRunning: true
    },
    mainWindow: mainWindow || {
      webContents: {
        send(channel, payload) {
          messages.push({ channel, payload });
        }
      }
    },
    ...contextOverrides
  });

  return {
    ...context,
    messages,
    storeState: runtimeStoreState,
    async handleDetectedGameChange({ game } = {}) {
      context.applyGameVersion(game);
      return context;
    }
  };
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

test('main process store default keeps passive overlay disabled on startup', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');

  assert.match(source, /overlayEnabled:\s*false/);
});

test('main overlay window guard defers creation to visible overlay state', () => {
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
    ['updateOverlayWindow']
  ]);
});

test('main overlay window is created lazily only when overlay state is visible', () => {
  const calls = [];
  const overlayWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel) => {
        calls.push(['send', channel]);
      }
    }
  };
  let visible = false;
  const context = loadFunctions(['buildOverlayState', 'updateOverlayWindow'], {
    overlayMapResultState: null,
    overlayStartMapPromptState: null,
    overlayCharacterState: null,
    overlayRuntimeState: null,
    overlayWindow: null,
    currentSession: null,
    app: {
      isReady() {
        calls.push(['isReady']);
        return true;
      }
    },
    isOverlayEnabled() {
      return true;
    },
    deriveMapResultOverlayState() {
      return { visible: false };
    },
    deriveOverlayState() {
      return visible
        ? { visibility: 'visible', primaryLine: 'Tower', secondaryLine: 'Expedition', metaLine: '1m' }
        : { visibility: 'hidden', primaryLine: '', secondaryLine: '', metaLine: '' };
    },
    getActiveSessionOverlayState() {
      return null;
    },
    createOverlayWindow() {
      calls.push(['createOverlayWindow']);
      context.overlayWindow = overlayWindow;
      return overlayWindow;
    },
    applyOverlayWindowVisibility(overlayState) {
      calls.push(['applyOverlayWindowVisibility', overlayState.visibility]);
    }
  });

  context.updateOverlayWindow();
  visible = true;
  context.updateOverlayWindow();

  assert.deepEqual(calls, [
    ['isReady'],
    ['createOverlayWindow'],
    ['applyOverlayWindowVisibility', 'visible'],
    ['send', 'overlay-render-state']
  ]);
});

function createOverlayWindowMock(calls, { visible = false, bounds = { x: 0, y: 0, width: 0, height: 0 } } = {}) {
  let currentBounds = bounds;
  let isVisible = visible;
  return {
    isDestroyed: () => false,
    isVisible: () => isVisible,
    hide() { calls.push(['hide']); isVisible = false; },
    showInactive() { calls.push(['showInactive']); isVisible = true; },
    getBounds: () => currentBounds,
    setBounds(next) { calls.push(['setBounds', next]); currentBounds = next; },
    setIgnoreMouseEvents(...args) { calls.push(['setIgnoreMouseEvents', ...args]); },
    setFocusable(value) { calls.push(['setFocusable', value]); }
  };
}

test('main overlay never becomes focusable and only clickable modes take mouse input', () => {
  const calls = [];
  const bounds = { x: 10, y: 20, width: 360, height: 112 };
  const context = loadFunctions(['applyOverlayWindowVisibility'], {
    OVERLAY_CLICKABLE_MODES: new Set(['start-map-prompt', 'map-result']),
    overlayWindowIgnoresMouse: true,
    overlayWindow: createOverlayWindowMock(calls, { bounds }),
    getOverlayWindowBounds: () => bounds
  });

  context.applyOverlayWindowVisibility({ visibility: 'visible', mode: 'runtime' });
  context.applyOverlayWindowVisibility({ visibility: 'visible', mode: 'start-map-prompt' });
  context.applyOverlayWindowVisibility({ visibility: 'visible', mode: 'map-result' });
  context.applyOverlayWindowVisibility({ visibility: 'visible', mode: 'runtime' });

  assert.deepEqual(calls, [
    ['showInactive'],
    ['setIgnoreMouseEvents', false],
    ['setIgnoreMouseEvents', true]
  ]);
});

test('main overlay applies bounds only when they change', () => {
  const calls = [];
  let nextBounds = { x: 10, y: 20, width: 360, height: 112 };
  const context = loadFunctions(['applyOverlayWindowVisibility'], {
    OVERLAY_CLICKABLE_MODES: new Set(['start-map-prompt', 'map-result']),
    overlayWindowIgnoresMouse: true,
    overlayWindow: createOverlayWindowMock(calls, { visible: true, bounds: { ...nextBounds } }),
    getOverlayWindowBounds: () => nextBounds
  });

  context.applyOverlayWindowVisibility({ visibility: 'visible', mode: 'runtime' });
  nextBounds = { x: -1500, y: 20, width: 360, height: 112 };
  context.applyOverlayWindowVisibility({ visibility: 'visible', mode: 'runtime' });
  context.applyOverlayWindowVisibility({ visibility: 'hidden', mode: 'runtime' });

  assert.deepEqual(calls, [
    ['setBounds', { x: -1500, y: 20, width: 360, height: 112 }],
    ['hide']
  ]);
});

test('main overlay is placed on the display that shows the game window', () => {
  const primary = { id: 1, workArea: { x: 0, y: 0, width: 2560, height: 1400 } };
  const secondary = { id: 2, workArea: { x: -1920, y: 0, width: 1920, height: 1040 } };
  const lookups = [];
  let gameWindow = { x: -1920, y: 0, width: 1920, height: 1080, minimized: false };
  const context = loadFunctions(['getOverlayDisplay'], {
    gameDetector: { getDetectedProcesses: () => [{ Name: 'PathOfExileSteam.exe', ProcessId: 4242 }] },
    win32Probe: {
      findProcessWindow(pids) {
        lookups.push(pids);
        return gameWindow;
      }
    },
    screen: {
      getPrimaryDisplay: () => primary,
      screenToDipRect: (_window, rect) => rect,
      getDisplayMatching: (rect) => (rect.x < 0 ? secondary : primary)
    }
  });

  assert.equal(context.getOverlayDisplay(), secondary);
  gameWindow = { ...gameWindow, minimized: true };
  assert.equal(context.getOverlayDisplay(), primary);
  gameWindow = null;
  assert.equal(context.getOverlayDisplay(), primary);
  assert.deepEqual(lookups, [[4242], [4242], [4242]]);
});

test('main overlay falls back to the primary display when the game window lookup throws', () => {
  const primary = { id: 1, workArea: { x: 0, y: 0, width: 2560, height: 1400 } };
  const context = loadFunctions(['getOverlayDisplay'], {
    console: { error() { } },
    gameDetector: { getDetectedProcesses: () => [{ ProcessId: 1 }] },
    win32Probe: { findProcessWindow() { throw new Error('koffi missing'); } },
    screen: { getPrimaryDisplay: () => primary }
  });

  assert.equal(context.getOverlayDisplay(), primary);
});

test('overlay has no mouse forwarding hook, focus toggle or script injection path', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');
  const overlayPreload = fs.readFileSync(path.join(__dirname, '..', 'overlay-preload.js'), 'utf8');
  const mainPreload = fs.readFileSync(preloadJsPath, 'utf8');

  assert.doesNotMatch(source, /forward:\s*true/);
  assert.doesNotMatch(source, /overlayWindow\.setFocusable/);
  assert.doesNotMatch(source, /executeJavaScript/);
  assert.doesNotMatch(source, /set-overlay-pointer-passthrough/);
  assert.doesNotMatch(overlayPreload, /setOverlayPointerPassthrough/);
  assert.doesNotMatch(mainPreload, /setOverlayPointerPassthrough|set-overlay-pointer-passthrough/);
  assert.match(overlayPreload, /ipcRenderer\.on\('overlay-render-state'/);
});

test('openAuthUrlInBrowser uses shell.openExternal when it succeeds', async () => {
  const calls = [];
  const context = loadFunctions(['isAllowedExternalAuthUrl', 'openUrlWithWindowsFallback', 'openAuthUrlInBrowser'], {
    shell: {
      openExternal: async (url) => {
        calls.push(['openExternal', url]);
      }
    },
    process: {
      platform: 'win32'
    },
    URL,
    execFile() {
      calls.push(['execFile']);
    }
  });

  await context.openAuthUrlInBrowser('https://www.pathofexile.com/oauth/authorize');

  assert.deepEqual(calls, [['openExternal', 'https://www.pathofexile.com/oauth/authorize']]);
});

test('openAuthUrlInBrowser falls back to a hidden PowerShell Start-Process on Windows when shell.openExternal fails', async () => {
  const calls = [];
  const context = loadFunctions(['isAllowedExternalAuthUrl', 'openUrlWithWindowsFallback', 'openAuthUrlInBrowser'], {
    shell: {
      openExternal: async (url) => {
        calls.push(['openExternal', url]);
        throw new Error('openExternal failed');
      }
    },
    process: {
      platform: 'win32'
    },
    URL,
    execFile(command, args, options, callback) {
      calls.push(['execFile', command, args]);
      assert.equal(options.windowsHide, true);
      callback(null);
    }
  });

  await context.openAuthUrlInBrowser('https://www.pathofexile.com/oauth/authorize');

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['openExternal', 'https://www.pathofexile.com/oauth/authorize'],
    [
      'execFile',
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'Start-Process -FilePath $args[0]',
        'https://www.pathofexile.com/oauth/authorize'
      ]
    ]
  ]);
});

test('openAuthUrlInBrowser rejects unsafe external URLs before invoking the shell', async () => {
  const calls = [];
  const context = loadFunctions(['isAllowedExternalAuthUrl', 'openUrlWithWindowsFallback', 'openAuthUrlInBrowser'], {
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
    },
    URL
  });

  assert.throws(
    () => context.openAuthUrlInBrowser('javascript:alert(1)'),
    /invalid external auth url/i
  );

  assert.throws(
    () => context.openAuthUrlInBrowser('https://evil.example.com/oauth/authorize'),
    /invalid external auth url/i
  );

  assert.deepEqual(calls, []);
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

test('main apiUrl validation allows expected localhost ports and rejects credentialed or private-network targets', () => {
  const context = loadFunctions([
    'normalizeHostname',
    'getUrlPort',
    'isLoopbackHost',
    'isPrivateOrReservedIp',
    'isValidApiUrl'
  ], {
    URL,
    net,
    LOCAL_API_PORTS: new Set([80, 443, 3000, 3001])
  });

  assert.equal(context.isValidApiUrl('http://localhost:3001'), true);
  assert.equal(context.isValidApiUrl('https://api.juicejournal.example'), true);
  assert.equal(context.isValidApiUrl('http://127.0.0.1:9999'), false);
  assert.equal(context.isValidApiUrl('https://user:pass@api.juicejournal.example'), false);
  assert.equal(context.isValidApiUrl('http://192.168.1.10:3001'), false);
  assert.equal(context.isValidApiUrl('http://10.0.0.5:3001'), false);
  assert.equal(context.isValidApiUrl('http://[fd00::1]:3001'), false);
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

test('main logout clears desktop auth state', () => {
  const writes = [];
  const auditTrail = [];
  let clearAllCalls = 0;
  let clearDismissTimerCalls = 0;
  const overlayUpdates = [];
  let apiToken = 'token';
  const context = loadFunctions([
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
    clearOverlayMapResultDismissTimer() {
      clearDismissTimerCalls += 1;
    },
    updateOverlayWindow(payload) {
      overlayUpdates.push(payload);
    },
    mainWindow: null
  });

  const result = context.handleLogout();

  assert.equal(result, true);
  assert.deepEqual(auditTrail, ['auditLogout']);
  assert.deepEqual(writes, [
    ['authToken', null],
    ['authTokenEncrypted', null],
    ['currentUserId', null]
  ]);
  assert.equal(apiToken, null);
  assert.equal(context.currentSession, null);
  assert.equal(context.overlayMapResultState, null);
  assert.equal(clearAllCalls, 1);
  assert.equal(clearDismissTimerCalls, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(overlayUpdates)), [{ character: null }]);
});

test('main app shutdown cleans up main-process resources', () => {
  let unregisterAllCalls = 0;
  let logParserStopCalls = 0;
  let gameDetectorStopCalls = 0;
  let trayDestroyCalls = 0;
  let overlayDestroyCalls = 0;
  const clearedIntervals = [];
  const context = loadFunctions([
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
    mainWindow: null,
    pendingLootFlushInterval: 42,
    clearInterval(intervalId) {
      clearedIntervals.push(intervalId);
    }
  });

  context.handleAppWillQuit();

  assert.equal(unregisterAllCalls, 1);
  assert.equal(logParserStopCalls, 1);
  assert.equal(gameDetectorStopCalls, 1);
  assert.equal(trayDestroyCalls, 1);
  assert.equal(overlayDestroyCalls, 1);
  assert.deepEqual(clearedIntervals, [42]);
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
