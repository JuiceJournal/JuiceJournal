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
    'onlineEnabled',
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
    overlayCharacterPromptState: null,
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
  const authUrl = 'https://www.pathofexile.com/oauth/authorize?client_id=juicejournal&state=a;b';
  const context = loadFunctions(['isAllowedExternalAuthUrl', 'openUrlWithWindowsFallback', 'openAuthUrlInBrowser'], {
    shell: {
      openExternal: async (url) => {
        calls.push(['openExternal', url]);
        throw new Error('openExternal failed');
      }
    },
    process: {
      platform: 'win32',
      env: { SystemRoot: 'C:\\Windows' }
    },
    URL,
    execFile(command, args, options, callback) {
      calls.push(['execFile', command, args, options]);
      callback(null);
    }
  });

  await context.openAuthUrlInBrowser(authUrl);

  // PowerShell joins every argument after -Command into its script text, so
  // the URL travels in the environment and never reaches the parser.
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['openExternal', authUrl],
    [
      'execFile',
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'Start-Process -FilePath $env:JJ_OPEN_URL'
      ],
      {
        windowsHide: true,
        env: { SystemRoot: 'C:\\Windows', JJ_OPEN_URL: authUrl }
      }
    ]
  ]);
});

test('openAuthUrlInBrowser rejects with the openExternal error when the Windows fallback also fails', async () => {
  const openExternalError = new Error('openExternal failed');
  const context = loadFunctions(['isAllowedExternalAuthUrl', 'openUrlWithWindowsFallback', 'openAuthUrlInBrowser'], {
    shell: {
      openExternal: async () => {
        throw openExternalError;
      }
    },
    process: {
      platform: 'win32',
      env: {}
    },
    URL,
    execFile(command, args, options, callback) {
      callback(new Error('powershell failed'));
    }
  });

  await assert.rejects(
    context.openAuthUrlInBrowser('https://www.pathofexile.com/oauth/authorize'),
    (error) => error === openExternalError
  );
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

test('main online features start off and the setting switches the live API client', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');
  assert.match(source, /defaults: \{\s*apiUrl: 'http:\/\/localhost:3001',\s*onlineEnabled: false,/);
  assert.match(source, /new APIClient\(store\.get\('apiUrl'\), resolvedToken, \{ online: isOnlineEnabled\(\) \}\)/);

  const writes = [];
  const onlineCalls = [];
  const context = loadFunctions(['applyDesktopSettings'], {
    SETTINGS_ALLOWLIST: getSettingsAllowlist(),
    store: {
      set(key, value) {
        writes.push([key, value]);
      }
    },
    apiClient: {
      setOnline(online) {
        onlineCalls.push(online);
      }
    }
  });

  context.applyDesktopSettings({ onlineEnabled: true });
  context.applyDesktopSettings({ onlineEnabled: 'true' });
  context.applyDesktopSettings({ language: 'en' });

  assert.deepEqual(writes, [['onlineEnabled', true], ['onlineEnabled', false], ['language', 'en']]);
  assert.deepEqual(onlineCalls, [true, false]);
});

test('main farm sharing stops before the server while online features are off', async () => {
  let publishCalls = 0;
  const context = loadFunctions(['publishMapResultsToFarmingHub'], {
    isOnlineEnabled: () => false,
    apiClient: {
      token: 'online-token',
      async publishFarmRun() {
        publishCalls += 1;
        return { id: 'run-1' };
      }
    }
  });

  await assert.rejects(context.publishMapResultsToFarmingHub({ resultIds: ['run-1'] }), { code: 'ONLINE_DISABLED' });
  assert.equal(publishCalls, 0);
});

test('main online connection test sends nothing while online features are off', async () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');

  assert.match(source, /ipcMain\.handle\('test-online-connection'[\s\S]*?new APIClient\(url, null, \{ online: isOnlineEnabled\(\) \}\)\.healthCheck\(\)/);
  assert.match(source, /if \(apiClient && isOnlineEnabled\(\)\) \{\s*const startedAt = Date\.now\(\);\s*try \{\s*const health = await apiClient\.healthCheck\(\);/);
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
  const poeTokenWrites = [];
  let poeClearCalls = 0;
  let apiToken = 'token';
  const context = loadFunctions([
    'handleLogout'
  ], {
    poeApiClient: {
      clearTokens() {
        poeClearCalls += 1;
      }
    },
    persistPoeClientTokens(tokens) {
      poeTokenWrites.push(tokens);
    },
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
    ['currentUserId', null],
    ['activeProfileId', null]
  ]);
  assert.equal(apiToken, null);
  assert.equal(context.currentSession, null);
  assert.equal(context.overlayMapResultState, null);
  assert.equal(clearAllCalls, 1);
  assert.equal(clearDismissTimerCalls, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(overlayUpdates)), [{ character: null }]);
  assert.equal(poeClearCalls, 1);
  assert.deepEqual(poeTokenWrites, [null]);
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
    scanHotkeyGateInterval: 7,
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
  assert.deepEqual(clearedIntervals, [7]);
  assert.equal(context.tray, null);
  assert.equal(context.overlayWindow, null);
  assert.equal(context.scanHotkeyGateInterval, null);
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

test('setupLogParser forwards game session events from Client.txt to the renderer', () => {
  const { EventEmitter } = require('node:events');
  const messages = [];
  const storeState = {
    poePath: 'F:/SteamLibrary/steamapps/common/Path of Exile 2/logs/Client.txt',
    lastDetectedPoeVersion: 'poe2'
  };

  class FakeLogParser extends EventEmitter {
    constructor(logPath, options) {
      super();
      this.logPath = logPath;
      this.poeVersion = options.poeVersion;
    }

    start() { }

    bootstrapFromTail() {
      return false;
    }
  }

  const context = loadFunctions(['setupLogParser'], {
    store: {
      get(key) {
        return storeState[key];
      },
      set(key, value) {
        storeState[key] = value;
      }
    },
    require: () => ({ existsSync: () => true }),
    DEFAULT_POE_LOG_PATH: 'C:/Client.txt',
    LogParser: FakeLogParser,
    normalizePoeVersion: (version) => version || null,
    mainWindow: {
      webContents: {
        send(channel, payload) {
          messages.push({ channel, payload });
        }
      }
    }
  });

  context.setupLogParser();
  context.logParser.emit('gameSessionEntered', { poeVersion: 'poe2' });
  context.logParser.emit('gameSessionLeft', { poeVersion: 'poe2', reason: 'character_select' });
  context.logParser.emit('characterLogLine', { poeVersion: 'poe2', name: 'ExampleRanger', kind: 'level_up' });

  assert.equal(context.logParser.poeVersion, 'poe2');
  assert.deepEqual(messages, [
    { channel: 'game-session-entered', payload: { poeVersion: 'poe2' } },
    { channel: 'game-session-left', payload: { poeVersion: 'poe2', reason: 'character_select' } },
    { channel: 'character-log-line', payload: { poeVersion: 'poe2', name: 'ExampleRanger', kind: 'level_up' } }
  ]);
});

function loadCharacterPromptMain() {
  const sent = [];
  const overlayUpdates = [];
  const timers = [];
  const context = loadFunctions([
    'normalizeOverlayCharacter',
    'clearCharacterPromptOverlay',
    'showCharacterPromptOverlay',
    'chooseCharacterPromptOverlay'
  ], {
    overlayCharacterPromptState: null,
    overlayCharacterPromptTimer: null,
    CHARACTER_PROMPT_OVERLAY_DURATION_MS: 8000,
    normalizePoeVersion: (value) => value === 'poe1' || value === 'poe2' ? value : null,
    updateOverlayWindow: () => {
      overlayUpdates.push(context.overlayCharacterPromptState);
      return null;
    },
    setTimeout: (callback, delay) => {
      timers.push({ callback, delay, cleared: false });
      return timers.length;
    },
    clearTimeout: (id) => {
      if (timers[id - 1]) {
        timers[id - 1].cleared = true;
      }
    },
    mainWindow: {
      isDestroyed: () => false,
      webContents: {
        send(channel, payload) {
          sent.push({ channel, payload });
        }
      }
    }
  });

  return { context, sent, overlayUpdates, timers };
}

const PROMPT = {
  poeVersion: 'poe2',
  selectedId: 'poe2-alt',
  characters: [
    { id: 'poe2-high', name: 'HighLevelDeadeye', className: 'Deadeye', level: 94, league: 'Standard' },
    { id: 'poe2-alt', name: 'AltShaman', className: 'Shaman', level: 88, league: 'Standard' },
    { id: '', name: 'NoId' }
  ]
};

test('main character prompt reports the picked character to the renderer and closes', () => {
  const { context, sent, timers } = loadCharacterPromptMain();

  context.showCharacterPromptOverlay(PROMPT);
  assert.equal(context.overlayCharacterPromptState.characters.length, 2);
  assert.equal(timers[0].delay, 8000);

  const result = context.chooseCharacterPromptOverlay({ characterId: 'poe2-high' });

  assert.deepEqual({ ...result }, { poeVersion: 'poe2', characterId: 'poe2-high' });
  assert.deepEqual(sent.map((message) => message.channel), ['character-prompt-overlay-result']);
  assert.equal(context.overlayCharacterPromptState, null);
  assert.equal(timers[0].cleared, true);
});

test('main character prompt ignores ids it did not offer and closes itself after the timeout', () => {
  const { context, sent, timers } = loadCharacterPromptMain();

  context.showCharacterPromptOverlay(PROMPT);
  assert.equal(context.chooseCharacterPromptOverlay({ characterId: 'someone-else' }), null);
  assert.deepEqual(sent, []);

  context.showCharacterPromptOverlay(PROMPT);
  timers.at(-1).callback();
  assert.equal(context.overlayCharacterPromptState, null);
  assert.deepEqual(sent, []);
});

test('main overlay character accepts only short display fields from the renderer', () => {
  const { context } = loadCharacterPromptMain();

  assert.deepEqual({ ...context.normalizeOverlayCharacter({
    id: 'poe2-alt',
    name: `  ${'A'.repeat(80)}  `,
    league: 'Standard',
    className: 'Shaman',
    level: 88,
    portrait: 'file:///C:/evil.png'
  }) }, {
    id: 'poe2-alt',
    name: 'A'.repeat(64),
    league: 'Standard',
    className: 'Shaman',
    level: 88
  });
  assert.equal(context.normalizeOverlayCharacter({ level: 5 }), null);
  assert.equal(context.normalizeOverlayCharacter('AltShaman'), null);
  assert.equal(context.normalizeOverlayCharacter({ name: 'AltShaman', level: 1e9 }).level, null);
});

function loadPoeDeviceAuthMain(onOpen) {
  return loadFunctions(['closePoeAuthServer', 'waitForPoeAuthorizationCode'], {
    http: require('node:http'),
    URL,
    poeAuthServer: null,
    setTimeout,
    clearTimeout,
    renderBrowserCallbackPage: (title) => `<title>${title}</title>`,
    openAuthUrlInBrowser: async (url) => onOpen(url)
  });
}

function getLoopback(url) {
  return new Promise((resolve, reject) => {
    require('node:http').get(url, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    }).on('error', reject);
  });
}

test('main device sign-in takes the code from the loopback redirect and closes the listener', async () => {
  const redirectUri = 'http://127.0.0.1:34991/oauth/poe/callback';
  let callbackStatus = null;
  const context = loadPoeDeviceAuthMain(async (url) => {
    assert.equal(url, 'https://www.pathofexile.com/oauth/authorize?x=1');
    callbackStatus = await getLoopback(`${redirectUri}?code=code-1&state=state-1`);
  });

  const code = await context.waitForPoeAuthorizationCode({
    authUrl: 'https://www.pathofexile.com/oauth/authorize?x=1',
    redirectUri,
    expectedState: 'state-1'
  });

  assert.equal(code, 'code-1');
  assert.equal(callbackStatus, 200);
  assert.equal(context.poeAuthServer, null);
});

test('main device sign-in rejects a redirect with the wrong state', async () => {
  const redirectUri = 'http://127.0.0.1:34992/oauth/poe/callback';
  const context = loadPoeDeviceAuthMain(async () => {
    await getLoopback(`${redirectUri}?code=code-1&state=forged`);
  });

  await assert.rejects(context.waitForPoeAuthorizationCode({
    authUrl: 'https://www.pathofexile.com/oauth/authorize',
    redirectUri,
    expectedState: 'state-1'
  }), /Invalid callback state/);
  assert.equal(context.poeAuthServer, null);
});

test('main device characters map GGG errors to renderer-safe results', async () => {
  const outcomes = [
    { characters: [{ id: 'c1', name: 'AltShaman', level: 89, class: 'Shaman', league: 'Standard', current: true, equipment: [] }] },
    { error: Object.assign(new Error('limit'), { code: 'POE_RATE_LIMITED', retryAfter: 60 }) },
    { error: Object.assign(new Error('expired'), { code: 'POE_AUTH_EXPIRED' }) }
  ];
  const context = loadFunctions(['normalizeDeviceCharacter', 'getPoeDeviceCharacters'], {
    normalizePoeVersion: (value) => value === 'poe1' || value === 'poe2' ? value : null,
    poeApiClient: {
      isAuthenticated: () => true,
      async listCharacters() {
        const outcome = outcomes.shift();
        if (outcome.error) {
          throw outcome.error;
        }
        return outcome.characters;
      }
    }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(await context.getPoeDeviceCharacters('poe2'))), {
    connected: true,
    characters: [{ id: 'c1', name: 'AltShaman', level: 89, class: 'Shaman', league: 'Standard', poeVersion: 'poe2', current: true }]
  });
  assert.deepEqual({ ...(await context.getPoeDeviceCharacters('poe2')) }, {
    connected: true, characters: null, error: 'rate_limited', retryAfter: 60
  });
  assert.deepEqual({ ...(await context.getPoeDeviceCharacters('poe2')) }, {
    connected: false, characters: null, error: 'auth_expired'
  });
});
