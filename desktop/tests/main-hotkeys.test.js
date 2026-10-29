const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mainJsPath = path.join(__dirname, '..', 'main.js');
const appJsPath = path.join(__dirname, '..', 'src', 'app.js');

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

function loadFunctions(filePath, functionNames, contextOverrides = {}) {
  const source = fs.readFileSync(filePath, 'utf8');
  const context = vm.createContext({
    console,
    ...contextOverrides
  });

  for (const functionName of functionNames) {
    const functionSource = extractFunctionSource(source, functionName, filePath);
    vm.runInContext(`${functionSource};\nthis.${functionName} = ${functionName};`, context);
  }

  return context;
}

function createHotkeyField(initialValue = '') {
  const listeners = new Map();

  return {
    value: initialValue,
    selected: false,
    blurred: false,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    dispatch(type, event) {
      const handler = listeners.get(type);
      if (!handler) {
        assert.fail(`Expected listener for ${type}`);
      }
      handler(event);
    },
    blur() {
      this.blurred = true;
    },
    select() {
      this.selected = true;
    }
  };
}

test('main hotkeys register stored accelerators instead of hardcoded defaults', () => {
  const registrations = [];
  let unregisterAllCalls = 0;
  const context = loadFunctions(mainJsPath, ['registerHotkeySet', 'registerGlobalShortcuts'], {
    globalShortcut: {
      unregisterAll() {
        unregisterAllCalls += 1;
      },
      register(accelerator, handler) {
        registrations.push({ accelerator, handler });
        return true;
      }
    },
    getValidatedHotkeySettings: () => ({
      scanHotkey: 'Alt+F10',
      stashScanHotkey: 'CommandOrControl+Shift+K'
    }),
    captureAndScan() {}
  });

  context.registerGlobalShortcuts();

  assert.equal(unregisterAllCalls, 1);
  assert.deepEqual(
    registrations.map(({ accelerator }) => accelerator),
    ['Alt+F10', 'CommandOrControl+Shift+K']
  );
  assert.equal(typeof registrations[0].handler, 'function');
  assert.equal(typeof registrations[1].handler, 'function');
});

test('main hotkeys roll back to existing registrations when a new shortcut cannot be registered', () => {
  const operations = [];
  const context = loadFunctions(mainJsPath, ['registerHotkeySet', 'registerGlobalShortcuts'], {
    globalShortcut: {
      unregisterAll() {
        operations.push(['unregisterAll']);
      },
      register(accelerator) {
        operations.push(['register', accelerator]);
        return accelerator !== 'CommandOrControl+Shift+K';
      }
    },
    getValidatedHotkeySettings: (overrides = {}) => (
      Object.keys(overrides).length
        ? { scanHotkey: 'Alt+F10', stashScanHotkey: 'CommandOrControl+Shift+K' }
        : { scanHotkey: 'F9', stashScanHotkey: 'CommandOrControl+Shift+L' }
    ),
    captureAndScan() {}
  });

  assert.throws(
    () => context.registerGlobalShortcuts({
      scanHotkey: 'Alt+F10',
      stashScanHotkey: 'CommandOrControl+Shift+K'
    }),
    /unable to register global shortcut/i
  );

  assert.deepEqual(operations, [
    ['unregisterAll'],
    ['register', 'Alt+F10'],
    ['register', 'CommandOrControl+Shift+K'],
    ['unregisterAll'],
    ['unregisterAll'],
    ['register', 'F9'],
    ['register', 'CommandOrControl+Shift+L']
  ]);
});

test('hotkey registration from the OCR gate warns instead of throwing', () => {
  const warnings = [];
  const context = loadFunctions(mainJsPath, ['tryRegisterGlobalShortcuts'], {
    registerGlobalShortcuts() {
      throw new Error('Unable to register global shortcut: F9');
    },
    console: {
      warn(message) {
        warnings.push(message);
      }
    }
  });

  assert.doesNotThrow(() => context.tryRegisterGlobalShortcuts());
  assert.deepEqual(warnings, ['[Hotkeys] Unable to register global shortcut: F9']);
});

function loadScanHotkeyGate(overrides = {}) {
  const operations = [];
  const context = loadFunctions(mainJsPath, ['syncScanHotkeys'], {
    shouldEnableScanHotkeys: require('../src/modules/hotkeyModel').shouldEnableScanHotkeys,
    currentSession: { id: 'session-1' },
    scanHotkeysActive: false,
    win32Probe: {
      getForegroundProcessId() {
        operations.push(['getForegroundProcessId']);
        return context.foregroundProcessId;
      }
    },
    foregroundProcessId: 4120,
    gameDetector: {
      getDetectedProcesses: () => [{ Name: 'PathOfExile.exe', ProcessId: 4120 }]
    },
    tryRegisterGlobalShortcuts() {
      operations.push(['register']);
    },
    globalShortcut: {
      unregisterAll() {
        operations.push(['unregisterAll']);
      }
    },
    ...overrides
  });

  return { context, operations };
}

test('OCR hotkeys are registered while the game has focus and released on alt-tab', () => {
  const { context, operations } = loadScanHotkeyGate();

  context.syncScanHotkeys();
  context.syncScanHotkeys();
  context.foregroundProcessId = 9000;
  context.syncScanHotkeys();

  assert.deepEqual(operations.filter(([name]) => name !== 'getForegroundProcessId'), [
    ['register'],
    ['unregisterAll']
  ]);
  assert.equal(context.scanHotkeysActive, false);
});

test('OCR hotkeys are released when the session ends and the foreground is not read without a session', () => {
  const { context, operations } = loadScanHotkeyGate();

  context.syncScanHotkeys();
  context.currentSession = null;
  operations.length = 0;
  context.syncScanHotkeys();
  context.syncScanHotkeys();

  assert.deepEqual(operations, [['unregisterAll']]);
});

test('OCR hotkeys follow the session alone when the foreground window cannot be read', () => {
  const { context, operations } = loadScanHotkeyGate({
    win32Probe: {
      getForegroundProcessId() {
        throw new Error('user32 unavailable');
      }
    },
    gameDetector: null
  });

  context.syncScanHotkeys();

  assert.deepEqual(operations, [['register']]);
  assert.equal(context.scanHotkeysActive, true);
});

test('saving hotkeys outside the game releases them again after the registration check', () => {
  const operations = [];
  const context = loadFunctions(mainJsPath, ['releaseInactiveScanHotkeys', 'applyDesktopSettings'], {
    SETTINGS_ALLOWLIST: new Set(['scanHotkey', 'stashScanHotkey']),
    store: {
      set(key, value) {
        operations.push(['store', key, value]);
      }
    },
    getValidatedHotkeySettings: (overrides = {}) => (
      Object.keys(overrides).length
        ? { scanHotkey: 'Alt+F10', stashScanHotkey: 'CommandOrControl+Shift+K' }
        : { scanHotkey: 'F9', stashScanHotkey: 'CommandOrControl+Shift+L' }
    ),
    isValidApiUrl: () => true,
    apiClient: null,
    scanHotkeysActive: false,
    globalShortcut: {
      unregisterAll() {
        operations.push(['unregisterAll']);
      }
    },
    registerGlobalShortcuts() {
      operations.push(['registerGlobalShortcuts']);
    },
    refreshTrayMenu() {}
  });

  context.applyDesktopSettings({ scanHotkey: 'alt+f10' });

  assert.deepEqual(operations, [
    ['registerGlobalShortcuts'],
    ['unregisterAll'],
    ['store', 'scanHotkey', 'Alt+F10']
  ]);
});

test('saving desktop settings persists normalized hotkeys and re-registers shortcuts', () => {
  const writes = [];
  let registerGlobalShortcutsCalls = 0;
  let refreshTrayMenuCalls = 0;
  const storeValues = {
    scanHotkey: 'F9',
    stashScanHotkey: 'CommandOrControl+Shift+L'
  };
  const context = loadFunctions(mainJsPath, ['applyDesktopSettings'], {
    SETTINGS_ALLOWLIST: new Set([
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
      'theme'
    ]),
    store: {
      get(key) {
        return storeValues[key];
      },
      set(key, value) {
        storeValues[key] = value;
        writes.push([key, value]);
      }
    },
    getValidatedHotkeySettings: (overrides = {}) => (
      Object.keys(overrides).length
        ? { scanHotkey: 'Alt+F10', stashScanHotkey: 'CommandOrControl+Shift+K' }
        : { scanHotkey: storeValues.scanHotkey, stashScanHotkey: storeValues.stashScanHotkey }
    ),
    isValidApiUrl: () => true,
    apiClient: {
      setBaseURL() {}
    },
    registerGlobalShortcuts() {
      registerGlobalShortcutsCalls += 1;
    },
    releaseInactiveScanHotkeys() {},
    refreshTrayMenu() {
      refreshTrayMenuCalls += 1;
    }
  });

  context.applyDesktopSettings({
    scanHotkey: ' alt+f10 ',
    stashScanHotkey: ' ctrl+shift+k '
  });

  assert.deepEqual(
    writes.filter(([key]) => key === 'scanHotkey' || key === 'stashScanHotkey'),
    [
      ['scanHotkey', 'Alt+F10'],
      ['stashScanHotkey', 'CommandOrControl+Shift+K']
    ]
  );
  assert.equal(registerGlobalShortcutsCalls, 1);
  assert.equal(refreshTrayMenuCalls, 1);
});

test('saving a partial hotkey update preserves the stored custom shortcut for the omitted key', () => {
  const writes = [];
  const registeredHotkeySets = [];
  let refreshTrayMenuCalls = 0;
  const storeValues = {
    scanHotkey: 'Shift+F9',
    stashScanHotkey: 'CommandOrControl+Alt+J'
  };
  const context = loadFunctions(mainJsPath, ['applyDesktopSettings'], {
    SETTINGS_ALLOWLIST: new Set([
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
      'theme'
    ]),
    store: {
      get(key) {
        return storeValues[key];
      },
      set(key, value) {
        storeValues[key] = value;
        writes.push([key, value]);
      }
    },
    getValidatedHotkeySettings: (overrides = {}) => {
      const requestedScanHotkey = Object.prototype.hasOwnProperty.call(overrides, 'scanHotkey')
        ? overrides.scanHotkey
        : storeValues.scanHotkey;
      const requestedStashScanHotkey = Object.prototype.hasOwnProperty.call(overrides, 'stashScanHotkey')
        ? overrides.stashScanHotkey
        : storeValues.stashScanHotkey;

      return {
        scanHotkey: requestedScanHotkey || 'F9',
        stashScanHotkey: requestedStashScanHotkey || 'CommandOrControl+Shift+L'
      };
    },
    isValidApiUrl: () => true,
    apiClient: {
      setBaseURL() {}
    },
    registerGlobalShortcuts(hotkeys) {
      registeredHotkeySets.push({ ...hotkeys });
    },
    releaseInactiveScanHotkeys() {},
    refreshTrayMenu() {
      refreshTrayMenuCalls += 1;
    }
  });

  context.applyDesktopSettings({
    scanHotkey: 'Alt+F10'
  });

  assert.deepEqual(registeredHotkeySets, [{
    scanHotkey: 'Alt+F10',
    stashScanHotkey: 'CommandOrControl+Alt+J'
  }]);
  assert.deepEqual(writes, [['scanHotkey', 'Alt+F10']]);
  assert.equal(refreshTrayMenuCalls, 1);
});

test('saving desktop settings does not persist unusable hotkeys when registration fails', () => {
  const writes = [];
  let releaseCalls = 0;
  const context = loadFunctions(mainJsPath, ['applyDesktopSettings'], {
    SETTINGS_ALLOWLIST: new Set([
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
      'theme'
    ]),
    store: {
      set(key, value) {
        writes.push([key, value]);
      }
    },
    getValidatedHotkeySettings: (overrides = {}) => (
      Object.keys(overrides).length
        ? { scanHotkey: 'Alt+F10', stashScanHotkey: 'CommandOrControl+Shift+K' }
        : { scanHotkey: 'F9', stashScanHotkey: 'CommandOrControl+Shift+L' }
    ),
    isValidApiUrl: () => true,
    apiClient: {
      setBaseURL() {}
    },
    registerGlobalShortcuts() {
      throw new Error('Unable to register global shortcut: CommandOrControl+Shift+K');
    },
    releaseInactiveScanHotkeys() {
      releaseCalls += 1;
    },
    refreshTrayMenu() {}
  });

  assert.throws(
    () => context.applyDesktopSettings({
      scanHotkey: 'alt+f10',
      stashScanHotkey: 'ctrl+shift+k'
    }),
    /unable to register global shortcut/i
  );
  assert.deepEqual(writes, []);
  assert.equal(releaseCalls, 1);
});

test('saving unchanged hotkeys skips the registration check so a key held elsewhere cannot block the save', () => {
  const writes = [];
  let registerGlobalShortcutsCalls = 0;
  const context = loadFunctions(mainJsPath, ['applyDesktopSettings'], {
    SETTINGS_ALLOWLIST: new Set(['language', 'scanHotkey', 'stashScanHotkey']),
    store: {
      set(key, value) {
        writes.push([key, value]);
      }
    },
    getValidatedHotkeySettings: () => ({
      scanHotkey: 'F9',
      stashScanHotkey: 'CommandOrControl+Shift+L'
    }),
    isValidApiUrl: () => true,
    apiClient: null,
    registerGlobalShortcuts() {
      registerGlobalShortcutsCalls += 1;
      throw new Error('Unable to register global shortcut: F9');
    },
    releaseInactiveScanHotkeys() {},
    refreshTrayMenu() {}
  });

  context.applyDesktopSettings({
    language: 'tr',
    scanHotkey: 'F9',
    stashScanHotkey: 'CommandOrControl+Shift+L'
  });

  assert.equal(registerGlobalShortcutsCalls, 0);
  assert.deepEqual(writes, [
    ['language', 'tr'],
    ['scanHotkey', 'F9'],
    ['stashScanHotkey', 'CommandOrControl+Shift+L']
  ]);
});

test('saved hotkeys stay registered while the game has focus', () => {
  let unregisterAllCalls = 0;
  const context = loadFunctions(mainJsPath, ['releaseInactiveScanHotkeys'], {
    scanHotkeysActive: true,
    globalShortcut: {
      unregisterAll() {
        unregisterAllCalls += 1;
      }
    }
  });

  context.releaseInactiveScanHotkeys();

  assert.equal(unregisterAllCalls, 0);
});

test('renderer displays friendly hotkey labels, captures input, and saves normalized accelerators', async () => {
  const hotkeyModel = require('../src/modules/hotkeyModel');
  const scanHotkey = createHotkeyField();
  const stashScanHotkey = createHotkeyField();
  const savedSettings = [];
  const elements = {
    apiUrl: { value: 'http://localhost:3001' },
    poePath: { value: '' },
    autoStartSession: { checked: true },
    enableNotifications: { checked: true },
    soundNotifications: { checked: false },
    globalLanguage: { value: 'en' },
    scanHotkey,
    scanHotkeyDisplay: { textContent: '' },
    scanHotkeyBadge: { textContent: '' },
    stashScanHotkey,
    stashScanHotkeyDisplay: { textContent: '' },
    defaultLeague: { value: 'Standard' },
    defaultLeagueSelect: { value: 'Standard' },
    onlineEnabled: { checked: true }
  };
  const context = loadFunctions(appJsPath, [
    'getHotkeyModel',
    'getDefaultHotkeySettings',
    'getCompleteHotkeySettings',
    'getHotkeyDisplayPlatform',
    'syncHotkeyFieldDisplay',
    'syncHotkeyDisplays',
    'applySettingsDraftToDom',
    'setupHotkeyCaptureFields',
    'handleSaveSettings'
  ], {
    window: {
      hotkeyModel,
      t: (key) => key,
      electronAPI: {
        async setSettings(settings) {
          savedSettings.push(settings);
        }
      }
    },
    navigator: { platform: 'Win32' },
    elements,
    document: {
      querySelector() {
        return { dataset: { version: 'poe1' } };
      }
    },
    getSelectedTrackerContext: () => ({ poeVersion: 'poe1', league: 'Standard' }),
    normalizePoeVersion: (value) => value,
    getSettingsLeagueVersion: () => 'poe1',
    getLeagueSettingKey: () => 'defaultLeaguePoe1',
    getActiveLeagueFieldValue: () => 'Standard',
    setActiveLeagueFieldValue(value) {
      elements.defaultLeague.value = value;
      elements.defaultLeagueSelect.value = value;
    },
    showToast() {},
    markButtonSaved() {},
    getUserFacingErrorMessage: (error) => error.message,
    state: { settings: {}, currentUser: null },
    activeLeagueInputState: { dirty: false },
    updateActiveLeagueFieldContext() {},
    refreshOnlineAccount: async () => {},
    refreshTrackerData: async () => {}
  });

  context.applySettingsDraftToDom({
    apiUrl: 'http://localhost:3001',
    autoStartSession: true,
    notifications: true,
    soundNotifications: false,
    language: 'en',
    poeVersion: 'poe1',
    defaultLeaguePoe1: 'Standard',
    scanHotkey: 'F9',
    stashScanHotkey: 'CommandOrControl+Shift+L'
  });
  assert.equal(scanHotkey.value, 'F9');
  assert.equal(stashScanHotkey.value, 'Ctrl+Shift+L');
  assert.equal(elements.stashScanHotkeyDisplay.textContent, 'Ctrl+Shift+L');
  assert.equal(elements.scanHotkeyBadge.textContent, 'F9');

  context.setupHotkeyCaptureFields();
  const keydownEvent = {
    key: 'k',
    ctrlKey: true,
    shiftKey: true,
    altKey: false,
    metaKey: false,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    }
  };

  scanHotkey.dispatch('keydown', keydownEvent);

  assert.equal(keydownEvent.prevented, true);
  assert.equal(scanHotkey.value, 'Ctrl+Shift+K');
  assert.equal(elements.scanHotkeyDisplay.textContent, 'Ctrl+Shift+K');
  // The dashboard badge shows the saved hotkey, not an unsaved capture.
  assert.equal(elements.scanHotkeyBadge.textContent, 'F9');
  assert.equal(elements.onlineEnabled.checked, false);
  elements.onlineEnabled.checked = true;

  await context.handleSaveSettings();

  assert.equal(elements.scanHotkeyBadge.textContent, 'Ctrl+Shift+K');

  assert.equal(savedSettings.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(savedSettings[0])), {
    apiUrl: 'http://localhost:3001',
    onlineEnabled: true,
    poePath: '',
    autoStartSession: true,
    overlayEnabled: false,
    notifications: true,
    soundNotifications: false,
    language: 'en',
    poeVersion: 'poe1',
    defaultLeaguePoe1: 'Standard',
    scanHotkey: 'CommandOrControl+Shift+K',
    stashScanHotkey: 'CommandOrControl+Shift+L'
  });
});

test('renderer scan button swaps only its label while scanning, so the icon survives', async () => {
  const buttonTextWrites = [];
  const duringScan = [];
  const scanScreenBtn = {
    disabled: false,
    set textContent(value) {
      buttonTextWrites.push(value);
    }
  };
  const scanScreenLabel = { textContent: 'dashboard.scanScreen' };
  const toasts = [];
  const context = loadFunctions(appJsPath, ['handleScanScreen'], {
    state: { currentSession: { id: 'session-1' } },
    elements: { scanScreenBtn, scanScreenLabel },
    window: {
      t: (key) => key,
      electronAPI: {
        async scanScreen() {
          duringScan.push([scanScreenBtn.disabled, scanScreenLabel.textContent]);
          return { count: 3 };
        }
      }
    },
    showToast: (...args) => toasts.push(args),
    getUserFacingErrorMessage: (error) => error.message
  });

  await context.handleScanScreen();

  assert.deepEqual(buttonTextWrites, []);
  assert.deepEqual(duringScan, [[true, 'dashboard.scanning']]);
  assert.equal(scanScreenBtn.disabled, false);
  assert.equal(scanScreenLabel.textContent, 'dashboard.scanScreen');
  assert.deepEqual(toasts, [['toast.lootAddedBody', '', 'success']]);
});

test('renderer Scan Loot shows the one outcome main reports for the scan', async () => {
  let journalChecks = 0;
  const scanWith = async (scanScreen, currentSession = { id: 'session-1' }) => {
    const toasts = [];
    const scanScreenBtn = { disabled: false };
    const scanScreenLabel = { textContent: 'dashboard.scanScreen' };
    const context = loadFunctions(appJsPath, ['handleScanScreen'], {
      state: { currentSession },
      elements: { scanScreenBtn, scanScreenLabel },
      window: {
        t: (key, values = {}) => (values.count === undefined ? key : `${key}|${values.count}`),
        electronAPI: { scanScreen }
      },
      showToast: (...args) => toasts.push(args),
      getUserFacingErrorMessage: (error, fallbackKey) => fallbackKey,
      loadJournalStatus: async () => {
        journalChecks += 1;
      }
    });
    await context.handleScanScreen();
    assert.equal(scanScreenBtn.disabled, false);
    assert.equal(scanScreenLabel.textContent, 'dashboard.scanScreen');
    return toasts;
  };

  assert.deepEqual(await scanWith(async () => ({ count: 1 })), [['toast.lootAddedBodyOne|1', '', 'success']]);
  assert.deepEqual(await scanWith(async () => ({ count: 3 })), [['toast.lootAddedBody|3', '', 'success']]);
  assert.deepEqual(
    await scanWith(async () => ({ reason: 'noItems' })),
    [['toast.scanNothingFound', 'toast.scanNothingFoundHint', 'warning']]
  );
  assert.deepEqual(
    await scanWith(async () => ({ reason: 'noSession' })),
    [['dashboard.noActiveMap', 'toast.noSession', 'warning']]
  );
  assert.equal(journalChecks, 0);
  // The loot could not go into the journal; the notice with Start a new journal is checked again as well.
  assert.deepEqual(
    await scanWith(async () => ({ reason: 'journalUnreadable' })),
    [['toast.scanFailed', 'errors.journalUnreadable', 'error']]
  );
  assert.equal(journalChecks, 1);
  assert.deepEqual(await scanWith(async () => undefined), [['toast.scanFailed', 'toast.tryAgain', 'error']]);
  assert.deepEqual(
    await scanWith(async () => ({ reason: 'captureFailed' })),
    [['toast.scanFailed', 'toast.tryAgain', 'error']]
  );
  assert.deepEqual(await scanWith(async () => {
    throw new Error('IPC channel closed');
  }), [['toast.scanFailed', 'toast.tryAgain', 'error']]);
  // Without a running map the button asks for one and does not scan.
  assert.deepEqual(
    await scanWith(async () => assert.fail('scanned without a map'), null),
    [['dashboard.noActiveMap', 'toast.noSession', 'warning']]
  );
  assert.equal(journalChecks, 1);
});

test('dashboard scan button sits next to End Map with the real hotkey, a label slot and no fallback wording', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  const actions = html.match(/<div class="session-actions">([\s\S]*?)\n\s*<\/div>/)[1];
  assert.match(actions, /id="end-session-btn"[\s\S]*id="scan-screen-btn"/);
  assert.match(
    actions,
    /<button id="scan-screen-btn" class="btn btn-primary hidden">\s*<svg[^>]*><use href="assets\/icons\.svg#scan"\/><\/svg>\s*<span class="btn-label" id="scan-screen-label" data-i18n="dashboard\.scanScreen">[^<]*<\/span>\s*<kbd class="btn-kbd" id="scan-hotkey-badge">/
  );
  assert.doesNotMatch(html, /quick-loot-card/);

  const context = vm.createContext({ window: {}, document: { querySelectorAll: () => [] } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'translations.js'), 'utf8'), context);
  const { en, tr } = context.window.Translations;
  assert.equal(en['dashboard.scanScreen'], 'Scan Loot');
  for (const dictionary of [en, tr]) {
    for (const key of ['dashboard.quickLoot', 'dashboard.scanHint', 'dashboard.scanScreen']) {
      assert.doesNotMatch(dictionary[key], /fallback/i, key);
    }
  }
});
