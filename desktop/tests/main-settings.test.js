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
    'applyGameVersion',
    'isValidPoePath'
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
      send: (channel, state) => {
        calls.push(['send', channel, state.language]);
      }
    }
  };
  let visible = false;
  let derivedLanguage = null;
  const context = loadFunctions(['getLanguage', 'buildOverlayState', 'updateOverlayWindow'], {
    store: { get: (key) => (key === 'language' ? 'tr' : undefined) },
    getStoredCustomFarmTypes: () => [],
    overlayMapResultState: null,
    overlayInventoryStatus: null,
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
    deriveOverlayState({ language }) {
      derivedLanguage = language;
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
    ['send', 'overlay-render-state', 'tr']
  ]);
  assert.equal(derivedLanguage, 'tr');

  // A quit destroyed the overlay; one made after that would cancel the quit.
  calls.length = 0;
  context.overlayWindow = null;
  context.app.isQuiting = true;
  context.updateOverlayWindow();
  assert.deepEqual(calls, [['isReady']]);
  assert.equal(context.overlayWindow, null);
});

// buildOverlayState with a map result on show and an inventory note that may be set; the overlay switch is a parameter.
function buildOverlayWithInventoryStatus({ overlayOn, inventoryStatus }) {
  const mapResult = { id: 'result-1', mapName: 'Tower' };
  const context = loadFunctions(['buildOverlayState'], {
    overlayInventoryStatus: inventoryStatus,
    overlayMapResultState: { visible: true, result: mapResult },
    overlayStartMapPromptState: null,
    overlayCharacterPromptState: null,
    overlayCharacterState: null,
    overlayRuntimeState: null,
    currentSession: null,
    isOverlayEnabled: () => overlayOn,
    deriveMapResultOverlayState: ({ currentOverlayState }) => currentOverlayState,
    deriveOverlayState: () => ({ visibility: 'hidden' }),
    getActiveSessionOverlayState: () => null,
    getLanguage: () => 'en'
  });
  return JSON.parse(JSON.stringify(context.buildOverlayState()));
}

test('main overlay state puts an inventory status over a map result while the overlay is on', () => {
  const status = { kind: 'saved', primaryLine: 'Inventory noted', secondaryLine: 'Your next map counts from here.' };

  assert.deepEqual(buildOverlayWithInventoryStatus({ overlayOn: true, inventoryStatus: status }), {
    visibility: 'visible',
    mode: 'inventory-status',
    primaryLine: 'Inventory noted',
    secondaryLine: 'Your next map counts from here.'
  });
  // Without a status, the map result shows as before.
  assert.equal(buildOverlayWithInventoryStatus({ overlayOn: true, inventoryStatus: null }).mode, 'map-result');
});

test('main overlay state never lets an inventory status hide a prompt that waits for an answer', () => {
  const context = loadFunctions(['buildOverlayState'], {
    overlayInventoryStatus: { kind: 'inMap', primaryLine: 'Loot counts when the map ends', secondaryLine: '' },
    overlayMapResultState: null,
    overlayStartMapPromptState: { mapName: 'Tower' },
    overlayCharacterPromptState: null,
    overlayCharacterState: null,
    overlayRuntimeState: null,
    currentSession: null,
    store: { get: () => undefined },
    isOverlayEnabled: () => true,
    getLanguage: () => 'en',
    getActiveSessionOverlayState: () => null,
    deriveMapResultOverlayState: () => ({ visible: false }),
    deriveOverlayState: ({ startMapPrompt }) => ({ visibility: 'visible', mode: startMapPrompt ? 'start-map-prompt' : 'runtime' })
  });

  assert.equal(context.buildOverlayState().mode, 'start-map-prompt');
});

test('main overlay state ignores an inventory status while the overlay is off', () => {
  const status = { kind: 'saved', primaryLine: 'Inventory noted', secondaryLine: '' };

  assert.notEqual(buildOverlayWithInventoryStatus({ overlayOn: false, inventoryStatus: status }).mode, 'inventory-status');
});

test('main overlay window is not created again while the app quits', () => {
  const calls = [];
  const context = loadFunctions(['buildOverlayState', 'updateOverlayWindow'], {
    getLanguage: () => 'en',
    overlayMapResultState: null,
    overlayInventoryStatus: null,
    overlayStartMapPromptState: null,
    overlayCharacterPromptState: null,
    overlayCharacterState: null,
    overlayRuntimeState: null,
    overlayWindow: null,
    currentSession: null,
    app: {
      isQuiting: true,
      isReady() {
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
      return { visibility: 'visible', primaryLine: 'Tower', secondaryLine: 'Expedition', metaLine: '1m' };
    },
    getActiveSessionOverlayState() {
      return null;
    },
    createOverlayWindow() {
      calls.push(['createOverlayWindow']);
    },
    applyOverlayWindowVisibility() {
      calls.push(['applyOverlayWindowVisibility']);
    }
  });

  assert.equal(context.updateOverlayWindow().visibility, 'visible');
  assert.deepEqual(calls, []);
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

test('main settings forget the stored session when the server origin changes, and only then', () => {
  const writes = [];
  let originChanged = false;
  const context = loadFunctions(['applyDesktopSettings'], {
    SETTINGS_ALLOWLIST: getSettingsAllowlist(),
    isValidApiUrl: () => true,
    store: {
      set(key, value) {
        writes.push([key, value]);
      }
    },
    apiClient: {
      isNewOrigin: () => originChanged,
      setBaseURL() {}
    }
  });

  context.applyDesktopSettings({ apiUrl: 'http://localhost:3001/' });
  assert.deepEqual(writes, [['apiUrl', 'http://localhost:3001/']]);

  writes.length = 0;
  originChanged = true;
  context.applyDesktopSettings({ apiUrl: 'https://other.example' });
  assert.deepEqual(writes, [['authToken', null], ['authTokenEncrypted', null], ['apiUrl', 'https://other.example']]);
});

for (const failingKey of ['authToken', 'authTokenEncrypted', 'apiUrl', 'theme']) {
  test(`main settings keep the old session away from a new server when the ${failingKey} write fails, and on the retry`, () => {
    const APIClient = require('../src/modules/apiClient');
    const oldUrl = 'https://old.example';
    const newUrl = 'https://new.example';
    const stored = { apiUrl: oldUrl, authToken: 'old-cookie', authTokenEncrypted: 'old-sealed' };
    const client = new APIClient(oldUrl, 'old-cookie', { online: true });
    let failed = false;
    const context = loadFunctions(['applyDesktopSettings'], {
      SETTINGS_ALLOWLIST: getSettingsAllowlist(),
      isValidApiUrl: () => true,
      store: {
        set(key, value) {
          if (key === failingKey && !failed) {
            failed = true;
            throw new Error('config write failed');
          }
          stored[key] = value;
        }
      },
      apiClient: client
    });
    const settings = { apiUrl: newUrl, onlineEnabled: true, theme: 'dark' };

    assert.throws(() => context.applyDesktopSettings(settings), /config write failed/);
    if (stored.authToken || stored.authTokenEncrypted) {
      assert.equal(stored.apiUrl, oldUrl);
    }
    if (client.token) {
      assert.equal(client.baseURL, oldUrl);
    }

    context.applyDesktopSettings(settings);
    assert.equal(stored.apiUrl, newUrl);
    assert.equal(stored.authToken, null);
    assert.equal(stored.authTokenEncrypted, null);
    assert.equal(client.baseURL, newUrl);
    assert.equal(client.token, null);
  });
}

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
  // A public address carries the password and the session cookie, so it needs https. Only this PC may use http.
  assert.equal(context.isValidApiUrl('http://api.juicejournal.example'), false);
  assert.equal(context.isValidApiUrl('http://[2606:4700::1111]/'), false);
  assert.equal(context.isValidApiUrl('http://8.8.8.8:3001'), false);
  assert.equal(context.isValidApiUrl('https://localhost:3001'), true);
  // Only an address counts as this PC: these are public names that start like one.
  assert.equal(context.isValidApiUrl('http://127.0.0.1.nip.io/'), false);
  assert.equal(context.isValidApiUrl('http://127.attacker.example:3001/'), false);
  assert.equal(context.isValidApiUrl('https://127.0.0.1.nip.io/'), true);
  assert.equal(context.isValidApiUrl('http://127.0.0.2:3001/'), true);
  assert.equal(context.isValidApiUrl('http://127.0.0.1:9999'), false);
  assert.equal(context.isValidApiUrl('https://user:pass@api.juicejournal.example'), false);
  assert.equal(context.isValidApiUrl('http://192.168.1.10:3001'), false);
  assert.equal(context.isValidApiUrl('http://10.0.0.5:3001'), false);
  assert.equal(context.isValidApiUrl('http://[fd00::1]:3001'), false);
  // URL writes IPv4-mapped addresses in hex, and the other ::/8 forms reach the same places.
  assert.equal(context.isValidApiUrl('http://[::ffff:10.0.0.1]/'), false);
  assert.equal(context.isValidApiUrl('http://[::ffff:127.0.0.1]:22/'), false);
  assert.equal(context.isValidApiUrl('http://[0:0:0:0:0:ffff:c0a8:101]/'), false);
  assert.equal(context.isValidApiUrl('http://[::]:22/'), false);
  assert.equal(context.isValidApiUrl('http://[::1]:3001/'), true);
  assert.equal(context.isValidApiUrl('http://[::1]:22/'), false);
  assert.equal(context.isValidApiUrl('https://[2606:4700::1111]/'), true);
});

test('runtime game detection makes the detected game the Settings game and tells the renderer', () => {
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
    'applyGameVersion',
    'isValidPoePath'
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

  assert.equal(storeState.poeVersion, 'poe2');
  assert.deepEqual(writes, [
    ['lastDetectedPoeVersion', 'poe2'],
    ['poeVersion', 'poe2'],
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
  assert.equal(messages[0].payload.settingsVersion, 'poe2');
  assert.equal(messages[0].payload.lastDetectedVersion, 'poe2');
  assert.equal(messages[0].payload.logPath, 'C:/Games/Path of Exile 2/logs/Client.txt');
  assert.equal(messages[0].payload.runtimeSession.currentInstance, null);
  assert.equal(messages[0].payload.runtimeSession.summary.status, 'idle');
  assert.equal(messages[0].payload.runtimeSession.summary.clearReason, 'log_parser_restarted');
  assert.match(messages[0].payload.runtimeSession.summary.clearedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('runtime game detection retargets pricing and the Settings game when the detected game matches the prior detection', () => {
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
    'applyGameVersion',
    'isValidPoePath'
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

  assert.deepEqual(writes, [['lastDetectedPoeVersion', 'poe2'], ['poeVersion', 'poe2']]);
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

// On Windows, closing a window made with closable: false cancels app.quit(), and will-quit never comes. Delete
// everything's restart and the tray's Quit both go through before-quit.
test('a quit ends the run first, then destroys the overlay before it closes the windows', async () => {
  const mainSource = fs.readFileSync(mainJsPath, 'utf8');
  assert.ok(mainSource.includes("app.on('before-quit', handleAppBeforeQuit);"));
  const quitEvent = () => ({
    prevented: false,
    preventDefault() {
      this.prevented = true;
    }
  });

  for (const outcome of ['ended', 'failed']) {
    const calls = [];
    let finishRun;
    const overlayWindow = {
      isDestroyed: () => false,
      destroy: () => calls.push('overlay.destroy')
    };
    const context = loadFunctions(['handleAppBeforeQuit'], {
      app: { quit: () => calls.push('app.quit') },
      overlayWindow,
      isFinalizingQuitSession: false,
      didFinalizeQuitSession: false,
      installUpdateOnQuit: false,
      finalizeActiveSessionOnShutdown: () => new Promise((resolve, reject) => {
        calls.push('finalize');
        finishRun = outcome === 'ended' ? resolve : reject;
      }),
      console: { warn: () => calls.push('warn') }
    });

    const first = quitEvent();
    context.handleAppBeforeQuit(first);
    assert.equal(first.prevented, true, outcome);
    assert.equal(context.app.isQuiting, true, outcome);
    // The overlay stays while the run ends.
    assert.deepEqual(calls, ['finalize'], outcome);

    finishRun(outcome === 'ended' ? null : new Error('journal write failed'));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, ['finalize', ...(outcome === 'ended' ? [] : ['warn']), 'overlay.destroy', 'app.quit'], outcome);
    assert.equal(context.overlayWindow, null, outcome);

    // The second quit goes through: nothing waits, and the run is not ended twice.
    const second = quitEvent();
    context.handleAppBeforeQuit(second);
    assert.equal(second.prevented, false, outcome);
    assert.equal(calls.filter((call) => call === 'finalize').length, 1, outcome);
    assert.equal(calls.filter((call) => call === 'app.quit').length, 1, outcome);
  }

  // Without an overlay, or with one already gone, the quit goes on all the same.
  for (const overlayWindow of [null, { isDestroyed: () => true, destroy: () => assert.fail('destroyed twice') }]) {
    const calls = [];
    const context = loadFunctions(['handleAppBeforeQuit'], {
      app: { quit: () => calls.push('app.quit') },
      overlayWindow,
      isFinalizingQuitSession: false,
      didFinalizeQuitSession: false,
      installUpdateOnQuit: false,
      finalizeActiveSessionOnShutdown: async () => null
    });
    context.handleAppBeforeQuit(quitEvent());
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, ['app.quit']);
  }
});

test('an update install starts only after the run is saved and the overlay is gone', async () => {
  for (const outcome of ['ended', 'failed']) {
    const calls = [];
    let finishRun;
    const context = loadFunctions(['handleAppBeforeQuit'], {
      app: { quit: () => calls.push('app.quit') },
      appUpdateFlow: {
        install: () => {
          calls.push('install');
          return true;
        }
      },
      overlayWindow: {
        isDestroyed: () => false,
        destroy: () => calls.push('overlay.destroy')
      },
      isFinalizingQuitSession: false,
      didFinalizeQuitSession: false,
      installUpdateOnQuit: true,
      finalizeActiveSessionOnShutdown: () => new Promise((resolve, reject) => {
        calls.push('finalize');
        finishRun = outcome === 'ended' ? resolve : reject;
      }),
      console: { warn: () => {} }
    });

    context.handleAppBeforeQuit({ preventDefault() {} });
    assert.deepEqual(calls, ['finalize']);

    finishRun(new Error('save failed'));
    await new Promise(setImmediate);

    assert.deepEqual(calls, ['finalize', 'overlay.destroy', 'install']);
  }
});

test('an install that cannot start still finishes the quit', async () => {
  const calls = [];
  const context = loadFunctions(['handleAppBeforeQuit'], {
    app: { quit: () => calls.push('app.quit') },
    appUpdateFlow: { install: () => false },
    overlayWindow: null,
    isFinalizingQuitSession: false,
    didFinalizeQuitSession: false,
    installUpdateOnQuit: true,
    finalizeActiveSessionOnShutdown: async () => null
  });

  context.handleAppBeforeQuit({ preventDefault() {} });
  await new Promise(setImmediate);

  assert.deepEqual(calls, ['app.quit']);
});

test('a second quit waits for the run to end instead of closing the app', async () => {
  const calls = [];
  let finishRun;
  const context = loadFunctions(['handleAppBeforeQuit'], {
    app: { quit: () => calls.push('app.quit') },
    overlayWindow: null,
    isFinalizingQuitSession: false,
    didFinalizeQuitSession: false,
    installUpdateOnQuit: false,
    finalizeActiveSessionOnShutdown: () => new Promise((resolve) => {
      calls.push('finalize');
      finishRun = resolve;
    })
  });
  const quitEvent = () => ({
    prevented: false,
    preventDefault() {
      this.prevented = true;
    }
  });

  context.handleAppBeforeQuit(quitEvent());
  const second = quitEvent();
  context.handleAppBeforeQuit(second);

  assert.equal(second.prevented, true);
  assert.deepEqual(calls, ['finalize']);

  finishRun();
  await new Promise(setImmediate);

  assert.deepEqual(calls, ['finalize', 'app.quit']);
});

test('main quit destroys the overlay before Electron closes the windows', async () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');
  const quitSource = source.slice(source.indexOf('let isFinalizingQuitSession'), source.indexOf("app.on('will-quit'"));
  const calls = [];
  const handlers = {};
  const context = vm.createContext({
    console,
    overlayWindow: {
      isDestroyed: () => false,
      destroy() {
        calls.push('destroyOverlay');
      }
    },
    app: {
      on(eventName, handler) {
        handlers[eventName] = handler;
      },
      quit() {
        calls.push('quit');
      }
    },
    async finalizeActiveSessionOnShutdown() {
      calls.push('finalize');
    }
  });

  vm.runInContext(quitSource, context);
  handlers['before-quit']({
    preventDefault() {
      calls.push('preventDefault');
    }
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, ['preventDefault', 'finalize', 'destroyOverlay', 'quit']);
  assert.equal(context.overlayWindow, null);
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

test('Settings game migration moves a store left by an older build to the last game played, once', () => {
  const load = (storeState, writes) => loadFunctions(['normalizePoeVersion', 'migrateSettingsGameToLastDetected'], {
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

  // An older build kept the Settings game on PoE 2 while PoE 1 was played.
  const stale = { poeVersion: 'poe2', lastDetectedPoeVersion: 'poe1' };
  const staleWrites = [];
  const staleContext = load(stale, staleWrites);
  staleContext.migrateSettingsGameToLastDetected();
  assert.equal(stale.poeVersion, 'poe1');
  assert.deepEqual(staleWrites, [['poeVersion', 'poe1'], ['_settingsGameMigrated', true]]);

  // A Settings choice made after the migration stays on later launches.
  stale.poeVersion = 'poe2';
  staleContext.migrateSettingsGameToLastDetected();
  assert.equal(stale.poeVersion, 'poe2');
  assert.equal(staleWrites.length, 2);

  // No game seen yet, or a Settings game that already matches, leaves the Settings game alone.
  for (const storeState of [{ poeVersion: 'poe2' }, { poeVersion: 'poe1', lastDetectedPoeVersion: 'poe1' }]) {
    const writes = [];
    const { poeVersion } = storeState;
    load(storeState, writes).migrateSettingsGameToLastDetected();
    assert.equal(storeState.poeVersion, poeVersion);
    assert.deepEqual(writes, [['_settingsGameMigrated', true]]);
  }

  assert.match(fs.readFileSync(mainJsPath, 'utf8'), /^migrateSettingsGameToLastDetected\(\);$/m);
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

  const context = loadFunctions(['setupLogParser', 'isValidPoePath'], {
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
    refreshRedactionTargets() { },
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

  const shownAt = Date.now();
  context.showCharacterPromptOverlay(PROMPT);
  assert.equal(context.overlayCharacterPromptState.characters.length, 2);
  assert.equal(timers[0].delay, 8000);
  const { expiresAt } = context.overlayCharacterPromptState;
  assert.ok(expiresAt >= shownAt + 8000 && expiresAt <= Date.now() + 8000, 'expiresAt matches the 8 s timer');

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
  return loadFunctions(['closePoeAuthServer', 'readPoeAuthCallback', 'waitForPoeAuthorizationCode'], {
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

test('main device sign-in answers requests without its state and keeps waiting for the real redirect', async () => {
  const redirectUri = 'http://127.0.0.1:34992/oauth/poe/callback';
  const statuses = [];
  const context = loadPoeDeviceAuthMain(async () => {
    for (const stray of [
      `${redirectUri}?code=code-1&state=forged`,
      `${redirectUri}?code=code-1`,
      `${redirectUri}?error=attacker%20text`,
      `${redirectUri}?error=attacker%20text&state=forged`,
      'http://127.0.0.1:34992//',
      'http://127.0.0.1:34992/favicon.ico'
    ]) {
      statuses.push(await getLoopback(stray));
    }
    statuses.push(await getLoopback(`${redirectUri}?code=code-real&state=state-1`));
  });

  const code = await context.waitForPoeAuthorizationCode({
    authUrl: 'https://www.pathofexile.com/oauth/authorize',
    redirectUri,
    expectedState: 'state-1'
  });

  assert.equal(code, 'code-real');
  assert.deepEqual(statuses, [400, 400, 400, 400, 400, 400, 200]);
  assert.equal(context.poeAuthServer, null);
});

test('main device sign-in finishes promptly while other connections stay open', async () => {
  const redirectUri = 'http://127.0.0.1:34994/oauth/poe/callback';
  const held = [];
  const context = loadPoeDeviceAuthMain(async () => {
    for (const bytes of [null, 'GET / HTTP/1.1\r\nHost: x\r\n']) {
      await new Promise((resolve) => {
        const socket = net.connect(34994, '127.0.0.1', () => {
          if (bytes) {
            socket.write(bytes);
          }
          resolve();
        });
        socket.on('error', () => {});
        held.push(socket);
      });
    }
    await getLoopback(`${redirectUri}?code=code-1&state=state-1`);
  });

  const startedAt = Date.now();
  const code = await context.waitForPoeAuthorizationCode({
    authUrl: 'https://www.pathofexile.com/oauth/authorize',
    redirectUri,
    expectedState: 'state-1'
  });
  held.forEach((socket) => socket.destroy());

  assert.equal(code, 'code-1');
  assert.ok(Date.now() - startedAt < 2000);
  assert.equal(context.poeAuthServer, null);
});

test('main device sign-in stops on an error from the redirect that carries its state', async () => {
  const redirectUri = 'http://127.0.0.1:34993/oauth/poe/callback';
  const context = loadPoeDeviceAuthMain(async () => {
    await getLoopback(`${redirectUri}?error=access_denied&state=state-1`);
  });

  await assert.rejects(context.waitForPoeAuthorizationCode({
    authUrl: 'https://www.pathofexile.com/oauth/authorize',
    redirectUri,
    expectedState: 'state-1'
  }), /access_denied/);
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

const POE_PATH_HELPERS = ['isValidPoePath'];

test('isValidPoePath accepts a .txt file on a drive letter and nothing else', () => {
  const { isValidPoePath } = loadFunctions(POE_PATH_HELPERS);
  const unc = String.raw`\\srv\share\Client.txt`;
  assert.equal(unc, '\\\\srv\\share\\Client.txt');
  assert.equal(String.raw`\\?\C:\a\Client.txt`, '\\\\?\\C:\\a\\Client.txt');
  assert.equal(String.raw`C:\a\\Client.txt`, 'C:\\a\\\\Client.txt');

  for (const accepted of [
    String.raw`E:\Grinding Gear Games\Path of Exile\logs\Client.txt`,
    'C:/Path of Exile/logs/Client.txt',
    String.raw`D:\SteamLibrary\steamapps\common\Path of Exile 2\logs\Client.txt`,
    String.raw`C:\x\KakaoClient.txt`
  ]) {
    assert.equal(isValidPoePath(accepted), true, accepted);
  }

  for (const rejected of [
    unc,
    '//srv/share/Client.txt',
    String.raw`\\?\C:\a\Client.txt`,
    String.raw`\\.\C:\a\Client.txt`,
    String.raw`\\?\UNC\srv\share\Client.txt`,
    'C:Client.txt',
    String.raw`C:\a\Client.txt:ads`,
    String.raw`C:\a\\Client.txt`,
    '/Client.txt',
    'file:///C:/Client.txt',
    String.raw`C:\a\x.exe`,
    `C:\\${'a'.repeat(300)}.txt`,
    '',
    null,
    undefined,
    5
  ]) {
    assert.equal(isValidPoePath(rejected), false, String(rejected));
  }
});

function loadPoePathSettings() {
  const writes = [];
  let registerGlobalShortcutsCalls = 0;
  const context = loadFunctions(['applyDesktopSettings', 'isValidPoePath'], {
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
    registerGlobalShortcuts() {
      registerGlobalShortcutsCalls += 1;
    },
    releaseInactiveScanHotkeys() { },
    refreshTrayMenu() { }
  });
  return { context, writes, getShortcutCalls: () => registerGlobalShortcutsCalls };
}

test('main settings reject a network Client.txt path before any write or hotkey registration', () => {
  const { context, writes, getShortcutCalls } = loadPoePathSettings();

  assert.throws(() => {
    context.applyDesktopSettings({
      poePath: String.raw`\\srv\share\Client.txt`,
      language: 'tr',
      scanHotkey: 'alt+f10',
      stashScanHotkey: 'ctrl+shift+k'
    });
  }, /Invalid Client\.txt path/);

  assert.equal(getShortcutCalls(), 0);
  assert.deepEqual(writes, []);
});

test('main settings store an empty Client.txt path as empty and a padded one trimmed', () => {
  const { context, writes } = loadPoePathSettings();

  context.applyDesktopSettings({ poePath: '' });
  context.applyDesktopSettings({ poePath: '  C:/Games/logs/Client.txt  ' });

  assert.deepEqual(writes, [['poePath', ''], ['poePath', 'C:/Games/logs/Client.txt']]);
});

test('main settings reject a Client.txt path that is not text, and a save without one is fine', () => {
  const { context, writes } = loadPoePathSettings();

  assert.throws(() => context.applyDesktopSettings({ poePath: null }), /Invalid Client\.txt path/);
  assert.throws(() => context.applyDesktopSettings({ poePath: 5 }), /Invalid Client\.txt path/);
  assert.deepEqual(writes, []);

  assert.doesNotThrow(() => context.applyDesktopSettings({ language: 'en' }));
  assert.deepEqual(writes, [['language', 'en']]);
});

function loadSetupLogParser({ existing, storedPath }) {
  const storeState = { poePath: storedPath };
  const checked = [];
  const created = [];
  class FakeLogParser {
    constructor(logPath) {
      this.logPath = logPath;
      created.push(logPath);
    }

    on() { }

    start() { }

    bootstrapFromTail() {
      return false;
    }
  }
  const context = loadFunctions(['setupLogParser', 'isValidPoePath'], {
    store: {
      get: (key) => storeState[key],
      set(key, value) {
        storeState[key] = value;
      }
    },
    require: () => ({
      existsSync(filePath) {
        checked.push(filePath);
        return existing.includes(filePath);
      }
    }),
    DEFAULT_POE_LOG_PATH: 'C:/Default/Client.txt',
    refreshRedactionTargets() { },
    LogParser: FakeLogParser,
    normalizePoeVersion: (version) => version || null
  });
  return { context, storeState, checked, created };
}

test('setupLogParser never opens a stored network path and falls back to the default Client.txt', () => {
  const unc = String.raw`\\srv\share\Client.txt`;
  const { context, storeState, checked, created } = loadSetupLogParser({
    existing: ['C:/Default/Client.txt', unc],
    storedPath: unc
  });

  context.setupLogParser();

  assert.ok(!checked.includes(unc));
  assert.deepEqual(created, ['C:/Default/Client.txt']);
  assert.equal(storeState.poePath, 'C:/Default/Client.txt');
});

test('setupLogParser starts no parser for a stored network path when there is no default Client.txt', () => {
  const unc = String.raw`\\srv\share\Client.txt`;
  const { context, storeState, checked, created } = loadSetupLogParser({ existing: [unc], storedPath: unc });

  context.setupLogParser();

  assert.ok(!checked.includes(unc));
  assert.deepEqual(created, []);
  assert.equal(storeState.poePath, unc);
});

test('applyGameVersion never opens a stored network path', () => {
  const unc = String.raw`\\srv\share\Client.txt`;
  const checked = [];
  const { applyGameVersion } = loadMainWithMocks({
    storeState: { poePath: unc },
    fs: {
      existsSync(filePath) {
        checked.push(filePath);
        return true;
      }
    }
  });

  applyGameVersion('poe1');

  assert.ok(!checked.includes(unc));
});

function loadOnlineConfirm(storeState) {
  return loadFunctions([
    'normalizeHostname',
    'getUrlPort',
    'isLoopbackHost',
    'isPrivateOrReservedIp',
    'isValidApiUrl',
    'isOnlineEnabled',
    'getOnlineConfirmOrigin'
  ], {
    URL,
    net,
    LOCAL_API_PORTS: new Set([80, 443, 3000, 3001]),
    store: { get: (key) => storeState[key] }
  });
}

test('getOnlineConfirmOrigin prompts with the origin only when online goes from off to on', () => {
  const stored = { onlineEnabled: false, apiUrl: 'https://api.juicejournal.example/v1/?a=1' };
  const { getOnlineConfirmOrigin } = loadOnlineConfirm(stored);

  assert.equal(getOnlineConfirmOrigin({ onlineEnabled: true }), 'https://api.juicejournal.example');
  assert.equal(
    getOnlineConfirmOrigin({ onlineEnabled: true, apiUrl: ' https://other.example/path/ ' }),
    'https://other.example'
  );
});

test('getOnlineConfirmOrigin stays quiet while online is on and the origin does not change', () => {
  const { getOnlineConfirmOrigin } = loadOnlineConfirm({ onlineEnabled: true, apiUrl: 'https://api.juicejournal.example/' });

  assert.equal(getOnlineConfirmOrigin({ onlineEnabled: true }), null);
  assert.equal(getOnlineConfirmOrigin({ apiUrl: 'https://api.juicejournal.example' }), null);
  assert.equal(getOnlineConfirmOrigin({ apiUrl: 'https://api.juicejournal.example/other/path' }), null);
  assert.equal(
    getOnlineConfirmOrigin({ onlineEnabled: true, apiUrl: 'https://api.juicejournal.example/x/' }),
    null
  );
});

test('getOnlineConfirmOrigin prompts for a new origin while online is on', () => {
  const { getOnlineConfirmOrigin } = loadOnlineConfirm({ onlineEnabled: true, apiUrl: 'https://api.juicejournal.example' });

  assert.equal(getOnlineConfirmOrigin({ apiUrl: 'https://other.example/api' }), 'https://other.example');
  assert.equal(getOnlineConfirmOrigin({ apiUrl: 'https://api.juicejournal.example:8443' }), 'https://api.juicejournal.example:8443');
});

test('getOnlineConfirmOrigin stays quiet when online ends up off or the save does not touch it', () => {
  const { getOnlineConfirmOrigin } = loadOnlineConfirm({ onlineEnabled: false, apiUrl: 'https://api.juicejournal.example' });

  assert.equal(getOnlineConfirmOrigin({ apiUrl: 'https://other.example' }), null);
  assert.equal(getOnlineConfirmOrigin({ onlineEnabled: false, apiUrl: 'https://other.example' }), null);
  assert.equal(getOnlineConfirmOrigin({ language: 'en', poePath: 'C:/a/Client.txt' }), null);
  for (const notSettings of [null, undefined, 'onlineEnabled', 5]) {
    assert.equal(getOnlineConfirmOrigin(notSettings), null, String(notSettings));
  }
});

test('getOnlineConfirmOrigin leaves an address in the save that fails the check to applyDesktopSettings', () => {
  const { getOnlineConfirmOrigin } = loadOnlineConfirm({ onlineEnabled: false, apiUrl: 'https://api.juicejournal.example' });

  assert.equal(getOnlineConfirmOrigin({ onlineEnabled: true, apiUrl: 'http://192.168.1.5:3001' }), null);
  assert.equal(getOnlineConfirmOrigin({ onlineEnabled: true, apiUrl: 'https://user:pw@host.example' }), null);
  assert.equal(getOnlineConfirmOrigin({ onlineEnabled: true, apiUrl: '' }), null);
  assert.equal(getOnlineConfirmOrigin({ onlineEnabled: true, apiUrl: 'not a url' }), null);
});

test('getOnlineConfirmOrigin only parses the stored address, which can predate the check', () => {
  const stored = { onlineEnabled: false, apiUrl: 'http://127.0.0.1:54321' };
  const { getOnlineConfirmOrigin, isValidApiUrl } = loadOnlineConfirm(stored);

  assert.equal(isValidApiUrl(stored.apiUrl), false);
  assert.equal(getOnlineConfirmOrigin({ onlineEnabled: true }), 'http://127.0.0.1:54321');

  stored.apiUrl = 'not a url';
  assert.equal(getOnlineConfirmOrigin({ onlineEnabled: true }), null);
});

function loadConfirmOnlineSend({ language = 'en', showMessageBox } = {}) {
  const boxes = [];
  const mainWindow = { id: 'main' };
  const source = fs.readFileSync(mainJsPath, 'utf8').replace(/\r\n/g, '\n');
  const translationsStart = source.indexOf('const MAIN_PROCESS_TRANSLATIONS = {');
  assert.notEqual(translationsStart, -1);
  const translations = source.slice(translationsStart, source.indexOf('\n};', translationsStart) + 3);
  // extractFunctionSource would match the first async function whose name starts with t, so t() is cut out here.
  const tStart = source.indexOf('function t(key, values = {}) {');
  assert.notEqual(tStart, -1);
  const tSource = source.slice(tStart, source.indexOf('\n}\n', tStart) + 3);
  const context = loadFunctions(['getLanguage', 'confirmOnlineSend'], {
    store: { get: (key) => (key === 'language' ? language : undefined) },
    mainWindow,
    getOnlineConfirmOrigin: (settings) => settings?.origin || null,
    dialog: {
      showMessageBox: (...args) => {
        boxes.push(args);
        return showMessageBox(...args);
      }
    }
  });
  vm.runInContext(`${translations}\n${tSource}\nlet onlineConfirmOpen = false;`, context);
  return { context, boxes, mainWindow };
}

test('confirmOnlineSend asks nothing and allows the save when there is no server to ask about', async () => {
  const { context, boxes } = loadConfirmOnlineSend({ showMessageBox: async () => ({ response: 1 }) });

  assert.equal(await context.confirmOnlineSend({}), true);
  assert.equal(await context.confirmOnlineSend(undefined), true);
  assert.equal(boxes.length, 0);
});

test('confirmOnlineSend shows a warning that names the server and defaults to Cancel', async () => {
  const { context, boxes, mainWindow } = loadConfirmOnlineSend({ showMessageBox: async () => ({ response: 0 }) });

  assert.equal(await context.confirmOnlineSend({ origin: 'https://api.example:8443' }), true);

  assert.equal(boxes.length, 1);
  assert.equal(boxes[0][0], mainWindow);
  const options = JSON.parse(JSON.stringify(boxes[0][1]));
  assert.deepEqual(options.buttons, ['Allow', 'Cancel']);
  assert.equal(options.type, 'warning');
  assert.equal(options.defaultId, 1);
  assert.equal(options.cancelId, 1);
  assert.equal(options.noLink, true);
  assert.equal(options.title, 'Use online features');
  assert.equal(options.message, 'Send data to https://api.example:8443?');
  assert.match(options.detail, /go to this server/);
});

test('confirmOnlineSend treats Cancel and a dialog that fails as a no', async () => {
  const cancel = loadConfirmOnlineSend({ showMessageBox: async () => ({ response: 1 }) });
  assert.equal(await cancel.context.confirmOnlineSend({ origin: 'https://api.example' }), false);

  const failing = loadConfirmOnlineSend({
    showMessageBox: async () => {
      throw new Error('dialog failed');
    }
  });
  assert.equal(await failing.context.confirmOnlineSend({ origin: 'https://api.example' }), false);
  // The failure leaves the lock open for the next save.
  assert.equal(await failing.context.confirmOnlineSend({ origin: 'https://api.example' }), false);
  assert.equal(failing.boxes.length, 2);
});

test('confirmOnlineSend refuses a second save while its dialog is open and asks again after it closes', async () => {
  let answer;
  const { context, boxes } = loadConfirmOnlineSend({
    showMessageBox: () => new Promise((resolve) => {
      answer = resolve;
    })
  });

  const first = context.confirmOnlineSend({ origin: 'https://api.example' });
  assert.equal(await context.confirmOnlineSend({ origin: 'https://api.example' }), false);
  assert.equal(boxes.length, 1);

  answer({ response: 0 });
  assert.equal(await first, true);

  const third = context.confirmOnlineSend({ origin: 'https://api.example' });
  assert.equal(boxes.length, 2);
  answer({ response: 1 });
  assert.equal(await third, false);
});

test('the set-settings handler waits for the online prompt and saves nothing when it is declined', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');

  assert.match(
    source,
    /ipcMain\.handle\('set-settings', async \(event, settings\) => \{[\s\S]{0,200}?if \(!\(await confirmOnlineSend\(settings\)\)\) \{\s*return \{ canceled: true \};\s*\}\s*try \{\s*return applyDesktopSettings\(settings\);/
  );
});

function loadLegacyTokenMigration({ stored, encryptionAvailable = true, encryptFails = false } = {}) {
  const storeState = { ...stored };
  const writes = [];
  const safeStorage = {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString(value) {
      if (encryptFails) {
        throw new Error('encryption failed');
      }
      return Buffer.from(`sealed:${value.toString()}`);
    },
    decryptString(buffer) {
      const text = buffer.toString();
      if (!text.startsWith('sealed:')) {
        throw new Error('cannot decrypt');
      }
      return text.slice('sealed:'.length);
    }
  };
  const context = loadFunctions(['encryptAuthToken', 'getDecryptedAuthToken', 'migrateLegacyAuthToken'], {
    Buffer,
    safeStorage,
    store: {
      get: (key) => storeState[key],
      set(key, value) {
        storeState[key] = value;
        writes.push([key, value]);
      }
    }
  });
  return { context, storeState, writes };
}

const sealToken = (token) => Buffer.from(`sealed:${token}`).toString('base64');

test('legacy auth token migration seals the plain token first and clears the plain copy after', () => {
  const { context, writes, storeState } = loadLegacyTokenMigration({ stored: { authToken: 'cookie-1' } });

  context.migrateLegacyAuthToken();

  assert.deepEqual(writes, [['authTokenEncrypted', sealToken('cookie-1')], ['authToken', null]]);
  assert.equal(storeState.authToken, null);
});

test('legacy auth token migration keeps a sealed copy that still opens and only clears the plain one', () => {
  const { context, writes } = loadLegacyTokenMigration({
    stored: { authToken: 'old-plain', authTokenEncrypted: sealToken('current') }
  });

  context.migrateLegacyAuthToken();

  assert.deepEqual(writes, [['authToken', null]]);
});

test('legacy auth token migration replaces a sealed copy this machine cannot open', () => {
  const { context, writes } = loadLegacyTokenMigration({
    stored: { authToken: 'cookie-2', authTokenEncrypted: Buffer.from('garbage').toString('base64') }
  });

  context.migrateLegacyAuthToken();

  assert.deepEqual(writes, [['authTokenEncrypted', sealToken('cookie-2')], ['authToken', null]]);
});

test('legacy auth token migration leaves the plain token alone when it cannot be sealed', () => {
  const unavailable = loadLegacyTokenMigration({ stored: { authToken: 'cookie-3' }, encryptionAvailable: false });
  unavailable.context.migrateLegacyAuthToken();
  assert.deepEqual(unavailable.writes, []);
  assert.equal(unavailable.storeState.authToken, 'cookie-3');

  const failing = loadLegacyTokenMigration({ stored: { authToken: 'cookie-3' }, encryptFails: true });
  failing.context.migrateLegacyAuthToken();
  assert.deepEqual(failing.writes, []);
  assert.equal(failing.storeState.authToken, 'cookie-3');
});

test('legacy auth token migration does nothing without a plain token', () => {
  const none = loadLegacyTokenMigration({ stored: {} });
  none.context.migrateLegacyAuthToken();
  assert.deepEqual(none.writes, []);

  const sealedOnly = loadLegacyTokenMigration({ stored: { authToken: null, authTokenEncrypted: sealToken('current') } });
  sealedOnly.context.migrateLegacyAuthToken();
  assert.deepEqual(sealedOnly.writes, []);
});

test('the migrated auth token reads back as the original one', () => {
  const { context } = loadLegacyTokenMigration({ stored: { authToken: 'cookie-4' } });

  context.migrateLegacyAuthToken();

  assert.equal(context.getDecryptedAuthToken(), 'cookie-4');
});

test('app start migrates the legacy auth token right before it reads it', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');
  const whenReady = source.indexOf('app.whenReady().then(() => {');
  assert.notEqual(whenReady, -1);

  const match = /migrateLegacyAuthToken\(\);\s*const resolvedToken = getDecryptedAuthToken\(\);/.exec(source);
  assert.ok(match, 'migrateLegacyAuthToken(); should come right before getDecryptedAuthToken()');
  assert.ok(match.index > whenReady, 'the migration belongs inside app.whenReady');
  assert.equal(source.split('migrateLegacyAuthToken();').length - 1, 1);
});
