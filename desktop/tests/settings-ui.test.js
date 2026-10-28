const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const desktopDir = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(desktopDir, 'src', 'index.html');
const appJsPath = path.join(desktopDir, 'src', 'app.js');
const mainJsPath = path.join(desktopDir, 'main.js');
const stylesCssPath = path.join(desktopDir, 'src', 'styles.css');
const translationsJsPath = path.join(desktopDir, 'src', 'modules', 'translations.js');

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}`;
  const asyncSignature = `async ${signature}`;
  const asyncStartIndex = source.indexOf(asyncSignature);
  const plainStartIndex = source.indexOf(signature);
  const startIndex = asyncStartIndex !== -1 ? asyncStartIndex : plainStartIndex;

  if (startIndex === -1) {
    assert.fail(`Expected ${path.basename(appJsPath)} to define ${functionName}()`);
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
    assert.fail(`Unable to locate ${functionName}() body in ${path.basename(appJsPath)}`);
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

  assert.fail(`Unable to parse ${functionName}() from ${path.basename(appJsPath)}`);
}

function loadFunctions(functionNames, contextOverrides = {}) {
  const source = fs.readFileSync(appJsPath, 'utf8');
  const context = vm.createContext({
    console,
    ...contextOverrides
  });

  for (const functionName of functionNames) {
    const functionSource = extractFunctionSource(source, functionName);
    vm.runInContext(`${functionSource};\nthis.${functionName} = ${functionName};`, context);
  }

  return context;
}

function createLeagueFieldElements() {
  return {
    defaultLeague: {
      value: '',
      hidden: false,
      disabled: false,
      placeholder: ''
    },
    defaultLeagueSelect: {
      value: '',
      hidden: true,
      disabled: true,
      innerHTML: ''
    },
    activeLeagueContext: {
      textContent: ''
    }
  };
}

function createToggleButton(initialClasses = []) {
  const classes = new Set(initialClasses);

  return {
    classes,
    classList: {
      add: (className) => {
        classes.add(className);
      },
      remove: (className) => {
        classes.delete(className);
      },
      contains: (className) => classes.has(className)
    }
  };
}

function createDatasetElement(initialClasses = []) {
  const classes = new Set(initialClasses);

  return {
    dataset: {},
    classList: {
      add: (className) => {
        classes.add(className);
      },
      remove: (className) => {
        classes.delete(className);
      },
      toggle: (className, isActive) => {
        if (isActive) {
          classes.add(className);
        } else {
          classes.delete(className);
        }
      },
      contains: (className) => classes.has(className)
    }
  };
}

test('settings html includes a progressive active league control', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="default-league-select"/);
  assert.match(html, /<input[^>]*id="default-league"/);
  assert.match(html, /id="active-league-context"/);
});

test('dashboard html includes an explicit stash capability unavailable state', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="stash-tracker-card"/);
  assert.match(html, /id="stash-capability-unavailable"/);
  assert.match(html, /data-i18n="stash.capabilityUnavailable.poe2"/);
  assert.doesNotMatch(html, /PoE 2 stash tracking is unavailable/);
});

test('auth chrome html does not bind dynamic identity copy to static translation keys', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.doesNotMatch(html, /id="username"[^>]*data-i18n=/);
  assert.doesNotMatch(html, /id="poe-link-status"[^>]*data-i18n=/);
  assert.doesNotMatch(html, /id="poe-account-name"[^>]*data-i18n=/);
  assert.doesNotMatch(html, /id="poe-link-mode"[^>]*data-i18n=/);
});

test('main process strips encrypted auth fields from get-settings payloads', () => {
  const mainJs = fs.readFileSync(mainJsPath, 'utf8');

  assert.match(mainJs, /delete allSettings\.authTokenEncrypted;/);
  assert.match(mainJs, /delete allSettings\.poeOAuthTokensEncrypted;/);
});

test('all locale blocks define the signed-out poe mode copy', () => {
  const source = fs.readFileSync(translationsJsPath, 'utf8');
  const context = vm.createContext({ window: {} });
  vm.runInContext(source, context);

  const locales = context.window.Translations;
  for (const [localeCode, localeStrings] of Object.entries(locales)) {
    assert.equal(
      typeof localeStrings['settings.poeSignedOutMode'],
      'string',
      `Expected locale ${localeCode} to define settings.poeSignedOutMode`
    );
    assert.notEqual(localeStrings['settings.poeSignedOutMode'].trim(), '');
  }
});

test('all locale blocks define stash capability unavailable copy', () => {
  const source = fs.readFileSync(translationsJsPath, 'utf8');
  const context = vm.createContext({ window: {} });
  vm.runInContext(source, context);

  const locales = context.window.Translations;
  for (const [localeCode, localeStrings] of Object.entries(locales)) {
    for (const translationKey of [
      'stash.capabilityUnavailable.poe2',
      'stash.capabilityUnavailable.generic'
    ]) {
      assert.equal(
        typeof localeStrings[translationKey],
        'string',
        `Expected locale ${localeCode} to define ${translationKey}`
      );
      assert.notEqual(localeStrings[translationKey].trim(), '');
    }
  }
});

test('renderer shows a select when active leagues are available', () => {
  const elements = createLeagueFieldElements();
  const activeLeagueInputState = { dirty: false, version: null };
  const context = loadFunctions([
    'getActiveLeagueControlType',
    'getActiveLeagueFieldElement',
    'getActiveLeagueFieldValue',
    'setActiveLeagueFieldValue',
    'updateActiveLeagueFieldContext'
  ], {
    elements,
    activeLeagueInputState,
    getSettingsLeagueVersion: () => 'poe1',
    getLeagueFieldStateForVersion: () => ({
      controlType: 'select',
      options: ['Mercenaries', 'Hardcore Mercenaries'],
      value: 'Hardcore Mercenaries'
    }),
    escapeHTML: (value) => String(value),
    window: {
      t: (key, params) => (params ? `${key}:${params.game}` : key)
    }
  });

  context.updateActiveLeagueFieldContext({ syncValue: true });

  assert.equal(elements.defaultLeague.hidden, true);
  assert.equal(elements.defaultLeague.disabled, true);
  assert.equal(elements.defaultLeagueSelect.hidden, false);
  assert.equal(elements.defaultLeagueSelect.disabled, false);
  assert.match(elements.defaultLeagueSelect.innerHTML, /Mercenaries/);
  assert.match(elements.defaultLeagueSelect.innerHTML, /Hardcore Mercenaries/);
  assert.equal(elements.defaultLeagueSelect.value, 'Hardcore Mercenaries');
  assert.equal(activeLeagueInputState.dirty, false);
  assert.equal(activeLeagueInputState.version, 'poe1');
});

test('renderer falls back to text input when no active league options exist', () => {
  const elements = createLeagueFieldElements();
  const activeLeagueInputState = { dirty: false, version: null };
  const context = loadFunctions([
    'getActiveLeagueControlType',
    'getActiveLeagueFieldElement',
    'getActiveLeagueFieldValue',
    'setActiveLeagueFieldValue',
    'updateActiveLeagueFieldContext'
  ], {
    elements,
    activeLeagueInputState,
    getSettingsLeagueVersion: () => 'poe2',
    getLeagueFieldStateForVersion: () => ({
      controlType: 'input',
      options: [],
      value: 'Standard'
    }),
    escapeHTML: (value) => String(value),
    window: {
      t: (key, params) => (params ? `${key}:${params.game}` : key)
    }
  });

  context.updateActiveLeagueFieldContext({ syncValue: true });

  assert.equal(elements.defaultLeague.hidden, false);
  assert.equal(elements.defaultLeague.disabled, false);
  assert.equal(elements.defaultLeague.value, 'Standard');
  assert.equal(elements.defaultLeague.placeholder, 'settings.leaguePlaceholderPoe2');
  assert.equal(elements.defaultLeagueSelect.hidden, true);
  assert.equal(elements.defaultLeagueSelect.disabled, true);
  assert.equal(elements.activeLeagueContext.textContent, 'settings.leagueContextHint:settings.leagueContextPoe2');
});

test('renderer derives league placeholder and help copy from the selected settings version', () => {
  const elements = createLeagueFieldElements();
  const activeLeagueInputState = { dirty: false, version: null };
  const context = loadFunctions([
    'getActiveLeagueControlType',
    'getActiveLeagueFieldElement',
    'getActiveLeagueFieldValue',
    'setActiveLeagueFieldValue',
    'updateActiveLeagueFieldContext'
  ], {
    elements,
    activeLeagueInputState,
    getSettingsLeagueVersion: () => 'poe1',
    getLeagueFieldStateForVersion: () => ({
      controlType: 'input',
      options: [],
      value: 'Standard'
    }),
    escapeHTML: (value) => String(value),
    window: {
      t: (key, params) => (params ? `${key}:${params.game}` : key)
    }
  });

  context.updateActiveLeagueFieldContext({ syncValue: true });

  assert.equal(elements.defaultLeague.placeholder, 'settings.leaguePlaceholderPoe1');
  assert.equal(elements.activeLeagueContext.textContent, 'settings.leagueContextHint:settings.leagueContextPoe1');
});

test('signed-out poe account chrome uses dedicated signed-out copy instead of mock-mode text', () => {
  const connectBtn = createToggleButton(['hidden']);
  const disconnectBtn = createToggleButton();
  const elements = {
    poeLinkStatus: { textContent: '' },
    poeAccountName: { textContent: '' },
    poeLinkMode: { textContent: '' },
    poeConnectBtn: connectBtn,
    poeDisconnectBtn: disconnectBtn
  };
  const context = loadFunctions(['renderPoeLinkStatus'], {
    elements,
    state: {
      currentUser: null,
      poeDeviceConnected: false
    },
    window: {
      t: (key) => key
    }
  });

  context.renderPoeLinkStatus();

  assert.equal(elements.poeLinkStatus.textContent, 'settings.poeSignInRequired');
  assert.equal(elements.poeAccountName.textContent, 'settings.poeSignInHint');
  assert.equal(elements.poeLinkMode.textContent, 'settings.poeSignedOutMode');
  assert.equal(connectBtn.classList.contains('hidden'), false);
  assert.equal(disconnectBtn.classList.contains('hidden'), true);
});

test('generic translation passes reapply authenticated chrome after static copy updates', () => {
  const connectBtn = createToggleButton();
  const disconnectBtn = createToggleButton(['hidden']);
  const elements = {
    username: { textContent: '' },
    userAvatar: { textContent: '' },
    poeLinkStatus: { textContent: '' },
    poeAccountName: { textContent: '' },
    poeLinkMode: { textContent: '' },
    poeConnectBtn: connectBtn,
    poeDisconnectBtn: disconnectBtn
  };
  let activeSessionRedraws = 0;
  let recentLootRedraws = 0;
  const context = loadFunctions([
    'renderUserIdentity',
    'renderPoeLinkStatus',
    'applyLocalizedChrome'
  ], {
    elements,
    updateActiveSessionUI: () => { activeSessionRedraws += 1; },
    renderRecentLoot: () => { recentLootRedraws += 1; },
    state: {
      currentUser: { username: 'Esquetta4179', accountName: 'RangerMain' },
      poeDeviceConnected: true
    },
    window: {
      t: (key) => key,
      applyTranslations: () => {
        elements.username.textContent = 'settings.user.guest';
        elements.userAvatar.textContent = '?';
        elements.poeLinkStatus.textContent = 'settings.poeNotLinked';
        elements.poeAccountName.textContent = 'settings.poeNoAccount';
        elements.poeLinkMode.textContent = 'settings.poeMockMode';
      }
    }
  });

  context.applyLocalizedChrome();

  assert.equal(activeSessionRedraws, 1, 'the active map card follows the new language');
  assert.equal(recentLootRedraws, 1, "Recent Loot's empty state follows the new language");
  assert.equal(elements.username.textContent, 'Esquetta4179');
  assert.equal(elements.userAvatar.textContent, 'E');
  assert.equal(elements.poeLinkStatus.textContent, 'settings.poeLinked');
  assert.equal(elements.poeAccountName.textContent, 'RangerMain');
  assert.equal(elements.poeLinkMode.textContent, 'settings.poeLiveMode');
  assert.equal(connectBtn.classList.contains('hidden'), true);
  assert.equal(disconnectBtn.classList.contains('hidden'), false);
});

test('saving settings uses the visible league control for the active PoE version', async () => {
  const savedSettings = [];
  const context = loadFunctions([
    'getActiveLeagueControlType',
    'getActiveLeagueFieldElement',
    'getActiveLeagueFieldValue',
    'handleSaveSettings'
  ], {
    elements: {
      apiUrl: { value: 'http://localhost:3001' },
      poePath: { value: '' },
      autoStartSession: { checked: true },
      enableNotifications: { checked: true },
      soundNotifications: { checked: false },
      globalLanguage: { value: 'en' },
      scanHotkey: { value: 'F9' },
      stashScanHotkey: { value: 'Ctrl+Shift+L' },
      defaultLeague: { value: 'Standard', hidden: true, disabled: true },
      defaultLeagueSelect: { value: 'Dawn of the Hunt', hidden: false, disabled: false }
    },
    document: {
      querySelector: (selector) => (
        selector === '.version-btn.active'
          ? { dataset: { version: 'poe2' } }
          : null
      )
    },
    getSelectedTrackerContext: () => ({ poeVersion: 'poe1', league: 'Standard' }),
    getHotkeyModel: () => ({
      validateHotkeys: (hotkeys) => ({
        scanHotkey: hotkeys.scanHotkey,
        stashScanHotkey: hotkeys.stashScanHotkey
      })
    }),
    normalizePoeVersion: (value) => value,
    getSettingsLeagueVersion: () => 'poe1',
    getLeagueSettingKey: (value) => (value === 'poe2' ? 'defaultLeaguePoe2' : 'defaultLeaguePoe1'),
    window: {
      electronAPI: {
        setSettings: async (settings) => {
          savedSettings.push(settings);
        }
      },
      t: (key) => key
    },
    state: {
      settings: {},
      currentUser: null
    },
    activeLeagueInputState: {
      dirty: true,
      version: 'poe2'
    },
    applySettingsDraftToDom: () => {},
    updateActiveLeagueFieldContext: () => {},
    refreshTrackerData: async () => {},
    showToast: () => {},
    getUserFacingErrorMessage: (error) => String(error)
  });

  await context.handleSaveSettings();

  assert.equal(savedSettings.length, 1);
  assert.equal(savedSettings[0].poeVersion, 'poe2');
  assert.equal(savedSettings[0].defaultLeaguePoe2, 'Dawn of the Hunt');
});

test('saving settings redraws the idle map card so its auto-start hint follows the setting', async () => {
  let redraws = 0;
  const toasts = [];
  const context = loadFunctions([
    'getActiveLeagueControlType',
    'getActiveLeagueFieldElement',
    'getActiveLeagueFieldValue',
    'handleSaveSettings'
  ], {
    elements: {
      apiUrl: { value: 'http://localhost:3001' },
      poePath: { value: '' },
      autoStartSession: { checked: false },
      enableNotifications: { checked: true },
      soundNotifications: { checked: false },
      globalLanguage: { value: 'en' },
      scanHotkey: { value: 'F9' },
      stashScanHotkey: { value: 'Ctrl+Shift+L' },
      defaultLeague: { value: 'Standard', hidden: false, disabled: false },
      defaultLeagueSelect: { value: '', hidden: true, disabled: true }
    },
    document: {
      querySelector: (selector) => (
        selector === '.version-btn.active'
          ? { dataset: { version: 'poe1' } }
          : null
      )
    },
    getSelectedTrackerContext: () => ({ poeVersion: 'poe1', league: 'Standard' }),
    getHotkeyModel: () => ({
      validateHotkeys: (hotkeys) => ({
        scanHotkey: hotkeys.scanHotkey,
        stashScanHotkey: hotkeys.stashScanHotkey
      })
    }),
    normalizePoeVersion: (value) => value,
    getSettingsLeagueVersion: () => 'poe1',
    getLeagueSettingKey: (value) => (value === 'poe2' ? 'defaultLeaguePoe2' : 'defaultLeaguePoe1'),
    window: {
      electronAPI: {
        setSettings: async () => {}
      },
      t: (key) => key
    },
    state: {
      settings: { autoStartSession: true },
      currentUser: null
    },
    activeLeagueInputState: {
      dirty: false,
      version: 'poe1'
    },
    applySettingsDraftToDom: () => {},
    updateActiveSessionUI: () => {
      redraws += 1;
      assert.equal(context.state.settings.autoStartSession, false, 'the card redraws with the saved setting');
    },
    refreshOnlineAccount: async () => {},
    updateActiveLeagueFieldContext: () => {},
    refreshTrackerData: async () => {},
    showToast: (title, message, type) => toasts.push(type),
    getUserFacingErrorMessage: (error) => String(error)
  });

  await context.handleSaveSettings();

  assert.equal(redraws, 1);
  assert.deepEqual(toasts, [undefined], 'the save succeeds');
});

test('reset settings persists only resettable settings and preserves signed-in header identity', async () => {
  const savedSettings = [];
  const capabilityCalls = [];
  const elements = {
    username: { textContent: 'Guest' },
    userAvatar: { textContent: '?' },
    poeLinkStatus: { textContent: '' },
    poeAccountName: { textContent: '' },
    poeLinkMode: { textContent: '' },
    poeConnectBtn: createToggleButton(['hidden']),
    poeDisconnectBtn: createToggleButton(),
  };
  const context = loadFunctions([
    'renderUserIdentity',
    'renderPoeLinkStatus',
    'applyLocalizedChrome',
    'handleResetSettings'
  ], {
    confirm: () => true,
    elements,
    state: {
      currentUser: { username: 'Esquetta4179' },
      settings: {
        language: 'tr',
        poeVersion: 'poe2',
        defaultLeaguePoe1: 'Mercenaries',
        defaultLeaguePoe2: 'Dawn of the Hunt'
      },
      poeDeviceConnected: true
    },
    activeLeagueInputState: {
      dirty: true,
      version: 'poe2'
    },
    getSettingsModel: () => ({
      buildResetSettingsDraft: () => ({
        settings: {
          apiUrl: 'http://localhost:3001',
          poePath: '',
          autoStartSession: true,
          notifications: true,
          soundNotifications: false,
          language: 'en',
          poeVersion: 'poe1',
          defaultLeaguePoe1: 'Standard',
          defaultLeaguePoe2: 'Standard'
        },
        headerUsername: 'Guest'
      })
    }),
    getSelectedTrackerContext: () => ({
      poeVersion: 'poe1',
      league: 'Standard'
    }),
    getDefaultHotkeySettings: () => ({
      scanHotkey: 'F9',
      stashScanHotkey: 'Ctrl+Shift+L'
    }),
    applySettingsVersionSelection: (version) => version,
    applySettingsDraftToDom: () => {},
    refreshOnlineAccount: async () => {},
    updateActiveLeagueFieldContext: () => {},
    applyDashboardCapabilities: () => {
      capabilityCalls.push({
        detectedGameVersion: context.state.detectedGameVersion,
        settingsVersion: context.state.settings.poeVersion
      });
    },
    loadSettingsLeagueOptions: async () => {},
    refreshTrackerData: async () => {},
    showToast: () => {},
    getUserFacingErrorMessage: (error) => String(error),
    window: {
      _appState: { language: 'tr' },
      t: (key) => key,
      applyTranslations: () => {
        elements.username.textContent = 'settings.user.guest';
        elements.userAvatar.textContent = '?';
        elements.poeLinkStatus.textContent = 'settings.poeNotLinked';
        elements.poeAccountName.textContent = 'settings.poeNoAccount';
        elements.poeLinkMode.textContent = 'settings.poeMockMode';
      },
      electronAPI: {
        setSettings: async (settings) => {
          savedSettings.push(settings);
        }
      }
    }
  });

  await context.handleResetSettings();

  assert.equal(savedSettings.length, 1);
  assert.equal(JSON.stringify(savedSettings[0]), JSON.stringify({
    apiUrl: 'http://localhost:3001',
    poePath: '',
    autoStartSession: true,
    notifications: true,
    soundNotifications: false,
    language: 'en',
    poeVersion: 'poe1',
    defaultLeaguePoe1: 'Standard',
    defaultLeaguePoe2: 'Standard',
    scanHotkey: 'F9',
    stashScanHotkey: 'Ctrl+Shift+L'
  }));
  assert.equal(context.state.currentUser.username, 'Esquetta4179');
  assert.equal(elements.username.textContent, 'Esquetta4179');
  assert.equal(elements.userAvatar.textContent, 'E');
  assert.equal(elements.poeLinkStatus.textContent, 'settings.poeLinked');
  assert.equal(elements.poeLinkMode.textContent, 'settings.poeLiveMode');
  assert.deepEqual(capabilityCalls, [{
    detectedGameVersion: undefined,
    settingsVersion: 'poe1'
  }]);
});

test('league options loader keeps only usable active IPC entries and prefers displayName', async () => {
  const updateCalls = [];
  const context = loadFunctions([
    'extractUsableActiveLeagues',
    'loadSettingsLeagueOptions'
  ], {
    normalizePoeVersion: (value) => value,
    getSettingsLeagueVersion: () => 'poe2',
    window: {
      electronAPI: {
        getCurrencyLeagues: async () => ({
          activeLeagues: [
            { displayName: 'Dawn of the Hunt', name: 'Internal Dawn' },
            { displayName: '  ', name: 'Mercenaries' },
            { displayName: 'Ignored League', active: false },
            { name: 'Ignored Current False', current: false },
            null,
            '',
            { displayName: '', name: '  ' }
          ]
        })
      }
    },
    state: {
      activeLeagueOptions: {},
      leagueOptionsLoaded: false
    },
    updateActiveLeagueFieldContext: (options) => {
      updateCalls.push(options);
    }
  });

  await context.loadSettingsLeagueOptions('poe2');

  assert.deepEqual(
    Array.from(context.state.activeLeagueOptions.poe2),
    ['Dawn of the Hunt', 'Mercenaries']
  );
  assert.equal(context.state.leagueOptionsLoaded, true);
  assert.equal(JSON.stringify(updateCalls), JSON.stringify([{ syncValue: true }]));
});

test('league options loader leaves manual fallback available when IPC has no usable active leagues', async () => {
  const { deriveLeagueFieldState } = require('../src/modules/settingsModel');
  const context = loadFunctions([
    'extractUsableActiveLeagues',
    'loadSettingsLeagueOptions'
  ], {
    normalizePoeVersion: (value) => value,
    getSettingsLeagueVersion: () => 'poe1',
    window: {
      electronAPI: {
        getCurrencyLeagues: async () => ({
          activeLeagues: [
            { displayName: 'Ignored League', active: false },
            { name: 'Ignored Current False', current: false },
            { displayName: ' ', name: '' },
            null
          ]
        })
      }
    },
    state: {
      activeLeagueOptions: {},
      leagueOptionsLoaded: false
    },
    updateActiveLeagueFieldContext: () => {}
  });

  await context.loadSettingsLeagueOptions('poe1');

  assert.deepEqual(Array.from(context.state.activeLeagueOptions.poe1), []);

  const fieldState = deriveLeagueFieldState({
    storedLeague: 'Custom League',
    activeLeagues: context.state.activeLeagueOptions.poe1,
    apiReachable: context.state.leagueOptionsLoaded
  });

  assert.equal(fieldState.controlType, 'input');
  assert.equal(fieldState.value, 'Custom League');
});

test('runtime game-version sync updates settings league context from the selected version path', () => {
  const loadCalls = [];
  const uiCalls = [];
  const statusCalls = [];
  const versionButtons = [
    {
      dataset: { version: 'poe1' },
      classList: {
        toggle: (className, isActive) => {
          assert.equal(className, 'active');
          versionButtons[0].active = isActive;
        }
      },
      setAttribute: (name, value) => {
        versionButtons[0][name] = value;
      }
    },
    {
      dataset: { version: 'poe2' },
      classList: {
        toggle: (className, isActive) => {
          assert.equal(className, 'active');
          versionButtons[1].active = isActive;
        }
      },
      setAttribute: (name, value) => {
        versionButtons[1][name] = value;
      }
    }
  ];
  const context = loadFunctions(['setToggleButtonPressed', 'syncRendererGameContext'], {
    normalizePoeVersion: (value) => value,
    state: {
      detectedGameVersion: null,
      settings: {
        poeVersion: 'poe1',
        lastDetectedPoeVersion: 'poe1',
        poePath: ''
      }
    },
    elements: {
      versionBtns: versionButtons
    },
    loadSettingsLeagueOptions: async (version) => {
      loadCalls.push(version);
    },
    updateGameStatusIndicator: (version) => {
      statusCalls.push(version);
    },
    updateActiveLeagueFieldContext: (options) => {
      uiCalls.push({
        options,
        settingsVersion: context.state.settings.poeVersion
      });
    }
  });

  context.syncRendererGameContext('poe2', {
    settingsVersion: 'poe1',
    lastDetectedVersion: 'poe2',
    logPath: 'C:/Games/Client.txt'
  });

  assert.equal(context.state.detectedGameVersion, 'poe2');
  assert.equal(context.state.settings.lastDetectedPoeVersion, 'poe2');
  assert.equal(context.state.settings.poeVersion, 'poe1');
  assert.equal(context.state.settings.poePath, 'C:/Games/Client.txt');
  assert.deepEqual(loadCalls, ['poe1']);
  assert.deepEqual(statusCalls, ['poe2']);
  assert.equal(versionButtons[0].active, true);
  assert.equal(versionButtons[1].active, false);
  assert.equal(versionButtons[0]['aria-pressed'], 'true');
  assert.equal(versionButtons[1]['aria-pressed'], 'false');
  assert.equal(JSON.stringify(uiCalls), JSON.stringify([{
    options: { syncValue: true },
    settingsVersion: 'poe1'
  }]));
});

test('runtime game-version sync preserves the current settings version when the payload omits it', () => {
  const loadCalls = [];
  const uiCalls = [];
  const statusCalls = [];
  const versionButtons = [
    {
      dataset: { version: 'poe1' },
      classList: {
        toggle: (className, isActive) => {
          assert.equal(className, 'active');
          versionButtons[0].active = isActive;
        }
      },
      setAttribute: (name, value) => {
        versionButtons[0][name] = value;
      }
    },
    {
      dataset: { version: 'poe2' },
      classList: {
        toggle: (className, isActive) => {
          assert.equal(className, 'active');
          versionButtons[1].active = isActive;
        }
      },
      setAttribute: (name, value) => {
        versionButtons[1][name] = value;
      }
    }
  ];
  const context = loadFunctions(['setToggleButtonPressed', 'syncRendererGameContext'], {
    normalizePoeVersion: (value) => value,
    state: {
      detectedGameVersion: null,
      settings: {
        poeVersion: 'poe1',
        lastDetectedPoeVersion: 'poe1',
        poePath: ''
      }
    },
    elements: {
      versionBtns: versionButtons
    },
    loadSettingsLeagueOptions: async (version) => {
      loadCalls.push(version);
    },
    updateGameStatusIndicator: (version) => {
      statusCalls.push(version);
    },
    updateActiveLeagueFieldContext: (options) => {
      uiCalls.push({
        options,
        settingsVersion: context.state.settings.poeVersion
      });
    }
  });

  context.syncRendererGameContext('poe2', {
    lastDetectedVersion: 'poe2',
    logPath: 'C:/Games/Client.txt'
  });

  assert.equal(context.state.detectedGameVersion, 'poe2');
  assert.equal(context.state.settings.lastDetectedPoeVersion, 'poe2');
  assert.equal(context.state.settings.poeVersion, 'poe1');
  assert.deepEqual(loadCalls, ['poe1']);
  assert.deepEqual(statusCalls, ['poe2']);
  assert.equal(versionButtons[0].active, true);
  assert.equal(versionButtons[1].active, false);
  assert.equal(JSON.stringify(uiCalls), JSON.stringify([{
    options: { syncValue: true },
    settingsVersion: 'poe1'
  }]));
});

test('runtime game-version sync reports no active game without falling back to poe1', () => {
  const statusCalls = [];
  const versionButtons = [
    {
      dataset: { version: 'poe1' },
      classList: {
        toggle: (className, isActive) => {
          assert.equal(className, 'active');
          versionButtons[0].active = isActive;
        }
      },
      setAttribute: (name, value) => {
        versionButtons[0][name] = value;
      }
    },
    {
      dataset: { version: 'poe2' },
      classList: {
        toggle: (className, isActive) => {
          assert.equal(className, 'active');
          versionButtons[1].active = isActive;
        }
      },
      setAttribute: (name, value) => {
        versionButtons[1][name] = value;
      }
    }
  ];
  const context = loadFunctions(['setToggleButtonPressed', 'syncRendererGameContext'], {
    normalizePoeVersion: (value) => value === 'poe1' || value === 'poe2' ? value : null,
    state: {
      detectedGameVersion: 'poe2',
      settings: {
        poeVersion: 'poe1',
        lastDetectedPoeVersion: 'poe2',
        poePath: ''
      }
    },
    elements: {
      versionBtns: versionButtons
    },
    loadSettingsLeagueOptions: async () => {},
    updateGameStatusIndicator: (version) => {
      statusCalls.push(version);
    },
    updateActiveLeagueFieldContext: () => {}
  });

  context.syncRendererGameContext(null, {
    settingsVersion: 'poe1',
    lastDetectedVersion: 'poe2'
  });

  assert.equal(context.state.detectedGameVersion, null);
  assert.equal(context.state.settings.lastDetectedPoeVersion, 'poe2');
  assert.equal(context.state.settings.poeVersion, 'poe1');
  assert.deepEqual(statusCalls, [null]);
  assert.equal(versionButtons[0].active, true);
  assert.equal(versionButtons[1].active, false);
});

test('renderer disables stash dashboard controls when poe2 stash capability is unavailable', () => {
  const stashTrackerCard = createDatasetElement();
  const stashCapabilityUnavailable = {
    hidden: true,
    textContent: ''
  };
  const buttons = [
    { disabled: false },
    { disabled: false },
    { disabled: false },
    { disabled: false }
  ];
  const context = loadFunctions([
    'getResolvedCapabilityGameVersion',
    'getStashCapabilityUnavailableKey',
    'getStashCapabilityUnavailableText',
    'applyDashboardCapabilities'
  ], {
    normalizePoeVersion: (value) => value,
    getCapabilityModel: () => ({
      getCapabilitiesForGame: (poeVersion) => ({
        characterSummary: { enabled: true, reason: null },
        runtimeTracking: { enabled: true, reason: null },
        stashTracking: poeVersion === 'poe2'
          ? { enabled: false, reason: 'poe2_not_supported_yet' }
          : { enabled: true, reason: null }
      })
    }),
    state: {
      detectedGameVersion: null,
      settings: {
        poeVersion: 'poe2'
      },
      capabilities: null
    },
    elements: {
      stashTrackerCard,
      stashCapabilityUnavailable,
      syncPricesBtn: buttons[0],
      takeBeforeSnapshotBtn: buttons[1],
      takeAfterSnapshotBtn: buttons[2],
      calculateProfitBtn: buttons[3],
      resetSnapshotsBtn: { disabled: false },
      stashTrackerStatus: {
        textContent: '',
        style: {}
      }
    },
    window: {
      t: (key) => key
    }
  });

  context.applyDashboardCapabilities();

  assert.equal(context.state.capabilities.stashTracking.enabled, false);
  assert.equal(stashTrackerCard.dataset.stashCapability, 'unavailable');
  assert.equal(stashCapabilityUnavailable.hidden, false);
  assert.equal(stashCapabilityUnavailable.textContent, 'stash.capabilityUnavailable.poe2');
  // The sentence is shown once in the card body; the header badge only says the tracker is off.
  assert.equal(context.elements.stashTrackerStatus.textContent, 'stash.off');
  assert.deepEqual(buttons.map((button) => button.disabled), [true, true, true, true]);
  assert.equal(context.elements.resetSnapshotsBtn.disabled, true);
});

test('stash status badge stays short while stash tracking is unavailable', () => {
  const context = loadFunctions(['updateStashTrackerStatus'], {
    state: {
      capabilities: {
        stashTracking: { enabled: false, reason: 'stash_scope_missing' }
      }
    },
    stashState: {
      beforeSnapshotId: null,
      afterSnapshotId: null
    },
    elements: {
      stashTrackerStatus: {
        textContent: '',
        style: { color: 'red' }
      }
    },
    window: {
      t: (key) => key
    }
  });

  context.updateStashTrackerStatus();

  assert.equal(context.elements.stashTrackerStatus.textContent, 'stash.off');
  assert.equal(context.elements.stashTrackerStatus.style.color, '');
});

test('unavailable stash card hides its snapshot controls', () => {
  const stylesCss = fs.readFileSync(path.join(desktopDir, 'src', 'styles.css'), 'utf8');

  assert.match(
    stylesCss,
    /\.stash-tracker-card\[data-stash-capability="unavailable"\] \.stash-tracker-content\s*\{[^}]*display:\s*none;/
  );
});

test('renderer keeps poe2 detected runtime capability when settings selection is poe1', () => {
  const context = loadFunctions([
    'getResolvedCapabilityGameVersion',
    'getStashCapabilityUnavailableKey',
    'getStashCapabilityUnavailableText',
    'applyDashboardCapabilities'
  ], {
    normalizePoeVersion: (value) => value,
    getCapabilityModel: () => ({
      getCapabilitiesForGame: (poeVersion) => ({
        characterSummary: { enabled: true, reason: null },
        runtimeTracking: { enabled: true, reason: null },
        stashTracking: poeVersion === 'poe2'
          ? { enabled: false, reason: 'poe2_not_supported_yet' }
          : { enabled: true, reason: null }
      })
    }),
    updateStashTrackerStatus: () => {},
    stashState: {
      beforeSnapshotId: null
    },
    state: {
      detectedGameVersion: 'poe2',
      settings: {
        poeVersion: 'poe1'
      },
      capabilities: null
    },
    elements: {
      stashTrackerCard: createDatasetElement(),
      stashCapabilityUnavailable: {
        hidden: true,
        textContent: ''
      },
      syncPricesBtn: { disabled: false },
      takeBeforeSnapshotBtn: { disabled: false },
      takeAfterSnapshotBtn: { disabled: false },
      calculateProfitBtn: { disabled: false },
      resetSnapshotsBtn: { disabled: false },
      stashTrackerStatus: {
        textContent: '',
        style: {}
      }
    },
    window: {
      t: (key) => key
    }
  });

  context.applyDashboardCapabilities('poe1');

  assert.equal(context.state.capabilities.stashTracking.enabled, false);
  assert.equal(context.elements.stashTrackerCard.dataset.stashCapability, 'unavailable');
  assert.equal(context.elements.syncPricesBtn.disabled, true);
});

test('renderer preserves stash snapshot workflow controls when poe1 stash capability is available', () => {
  const context = loadFunctions([
    'getResolvedCapabilityGameVersion',
    'getStashCapabilityUnavailableKey',
    'getStashCapabilityUnavailableText',
    'applyDashboardCapabilities'
  ], {
    normalizePoeVersion: (value) => value,
    getCapabilityModel: () => ({
      getCapabilitiesForGame: () => ({
        characterSummary: { enabled: true, reason: null },
        runtimeTracking: { enabled: true, reason: null },
        stashTracking: { enabled: true, reason: null }
      })
    }),
    updateStashTrackerStatus: () => {},
    stashState: {
      beforeSnapshotId: null
    },
    state: {
      detectedGameVersion: null,
      settings: {
        poeVersion: 'poe1'
      },
      capabilities: null
    },
    elements: {
      stashTrackerCard: createDatasetElement(['capability-unavailable']),
      stashCapabilityUnavailable: {
        hidden: false,
        textContent: '',
        classList: createDatasetElement(['hidden']).classList
      },
      syncPricesBtn: { disabled: true },
      takeBeforeSnapshotBtn: { disabled: true },
      takeAfterSnapshotBtn: { disabled: true },
      calculateProfitBtn: { disabled: true },
      resetSnapshotsBtn: { disabled: true },
      stashTrackerStatus: {
        textContent: '',
        style: {}
      }
    }
  });

  context.applyDashboardCapabilities();

  assert.equal(context.state.capabilities.stashTracking.enabled, true);
  assert.equal(context.elements.stashTrackerCard.dataset.stashCapability, 'enabled');
  assert.equal(context.elements.stashCapabilityUnavailable.hidden, true);
  assert.deepEqual([
    context.elements.syncPricesBtn.disabled,
    context.elements.takeBeforeSnapshotBtn.disabled,
    context.elements.takeAfterSnapshotBtn.disabled,
    context.elements.calculateProfitBtn.disabled,
    context.elements.resetSnapshotsBtn.disabled
  ], [false, false, true, false, false]);
});

test('reset snapshots is blocked while stash tracking is unavailable', () => {
  const toasts = [];
  const context = loadFunctions([
    'getResolvedCapabilityGameVersion',
    'getStashCapabilityUnavailableKey',
    'getStashCapabilityUnavailableText',
    'isStashTrackingUnavailable',
    'getCurrentStashUnavailableText',
    'showStashUnavailableToast',
    'handleResetSnapshots'
  ], {
    normalizePoeVersion: (value) => value,
    getResolvedLeagueVersion: () => 'poe2',
    state: {
      capabilities: {
        stashTracking: { enabled: false, reason: 'poe2_not_supported_yet' }
      }
    },
    stashState: {
      beforeSnapshotId: 'before',
      afterSnapshotId: 'after'
    },
    elements: {
      takeAfterSnapshotBtn: { disabled: false },
      calculateProfitBtn: createToggleButton(),
      stashProfitResult: createToggleButton(),
      stashTrackerStatus: {
        textContent: 'PoE 2 unavailable',
        style: {}
      }
    },
    showToast: (...args) => {
      toasts.push(args);
    },
    window: {
      t: (key) => key
    }
  });

  context.handleResetSnapshots();

  assert.equal(context.stashState.beforeSnapshotId, 'before');
  assert.equal(context.stashState.afterSnapshotId, 'after');
  assert.equal(context.elements.takeAfterSnapshotBtn.disabled, false);
  assert.deepEqual(toasts, [['toast.error', 'stash.capabilityUnavailable.poe2', 'warning']]);
});

test('async price sync completion does not re-enable or mutate stale stash UI after capability changes', async () => {
  const context = loadFunctions([
    'getStashCapabilityUnavailableText',
    'isStashTrackingEnabled',
    'handleSyncPrices'
  ], {
    getResolvedLeagueVersion: () => 'poe2',
    getResolvedActiveLeague: () => 'Standard',
    state: {
      capabilities: {
        stashTracking: { enabled: true, reason: null }
      }
    },
    stashState: {
      pricesSynced: false
    },
    elements: {
      syncPricesBtn: {
        disabled: false,
        innerHTML: 'Sync'
      },
      priceItemCount: {
        textContent: ''
      }
    },
    window: {
      t: (key) => key,
      electronAPI: {
        syncPrices: async () => {
          context.state.capabilities = {
            stashTracking: { enabled: false, reason: 'poe2_not_supported_yet' }
          };
          return { itemCount: 42 };
        }
      }
    },
    showToast: () => {},
    getUserFacingErrorMessage: (error) => String(error)
  });

  await context.handleSyncPrices();

  assert.equal(context.stashState.pricesSynced, false);
  assert.equal(context.elements.priceItemCount.textContent, '');
  assert.equal(context.elements.syncPricesBtn.disabled, true);
});

test('stale profit result rendering is ignored while stash tracking is unavailable', () => {
  const context = loadFunctions([
    'isStashTrackingUnavailable',
    'renderProfitReport'
  ], {
    state: {
      capabilities: {
        stashTracking: { enabled: false, reason: 'poe2_not_supported_yet' }
      }
    },
    elements: {
      stashProfitResult: createToggleButton(['hidden']),
      calculateProfitBtn: createToggleButton(),
      profitChaosValue: { textContent: '', className: '' },
      profitDivineValue: { textContent: '' },
      profitGainedValue: { textContent: '' },
      profitLostValue: { textContent: '' },
      profitItemsList: { innerHTML: '' },
      stashTrackerStatus: {
        textContent: 'stash.capabilityUnavailable.poe2',
        style: {}
      }
    },
    escapeHTML: (value) => String(value)
  });

  context.renderProfitReport({
    summary: {
      netProfitChaos: 99,
      netProfitDivine: 1.2,
      totalGainedChaos: 120,
      totalLostChaos: 21
    },
    gained: [{ name: 'Chaos Orb', quantityDiff: 10, totalChaosValue: 10 }],
    lost: []
  });

  assert.equal(context.elements.stashProfitResult.classList.contains('hidden'), true);
  assert.equal(context.elements.profitChaosValue.textContent, '');
  assert.equal(context.elements.stashTrackerStatus.textContent, 'stash.capabilityUnavailable.poe2');
});

test('renderer keeps prior settings state and shows an error when settings save is rejected', async () => {
  const savedToasts = [];
  const draftApplications = [];
  const context = loadFunctions([
    'getActiveLeagueControlType',
    'getActiveLeagueFieldElement',
    'getActiveLeagueFieldValue',
    'handleSaveSettings'
  ], {
    elements: {
      apiUrl: { value: 'http://127.0.0.1:9999' },
      poePath: { value: 'C:/Old/Client.txt' },
      autoStartSession: { checked: false },
      enableNotifications: { checked: false },
      soundNotifications: { checked: true },
      globalLanguage: { value: 'tr' },
      scanHotkey: { value: 'F9' },
      stashScanHotkey: { value: 'Ctrl+Shift+L' },
      defaultLeague: { value: 'Mercenaries', hidden: false, disabled: false },
      defaultLeagueSelect: { value: 'Mercenaries', hidden: true, disabled: true }
    },
    document: {
      querySelector: (selector) => (
        selector === '.version-btn.active'
          ? { dataset: { version: 'poe2' } }
          : null
      )
    },
    getSelectedTrackerContext: () => ({ poeVersion: 'poe1', league: 'Standard' }),
    getHotkeyModel: () => ({
      validateHotkeys: (hotkeys) => ({
        scanHotkey: hotkeys.scanHotkey,
        stashScanHotkey: hotkeys.stashScanHotkey
      })
    }),
    normalizePoeVersion: (value) => value,
    getSettingsLeagueVersion: () => 'poe1',
    getLeagueSettingKey: (value) => (value === 'poe2' ? 'defaultLeaguePoe2' : 'defaultLeaguePoe1'),
    window: {
      electronAPI: {
        setSettings: async () => {
          throw new Error('Invalid API URL');
        }
      },
      t: (key) => key
    },
    state: {
      settings: {
        apiUrl: 'http://localhost:3001',
        poePath: 'C:/Existing/Client.txt',
        autoStartSession: true,
        notifications: true,
        soundNotifications: false,
        language: 'en',
        poeVersion: 'poe1',
        defaultLeaguePoe1: 'Standard',
        defaultLeaguePoe2: 'Dawn of the Hunt'
      },
      currentUser: null
    },
    activeLeagueInputState: {
      dirty: true,
      version: 'poe2'
    },
    applySettingsDraftToDom: (settings) => {
      draftApplications.push({ ...settings });
    },
    updateActiveLeagueFieldContext: () => {},
    refreshTrackerData: async () => {},
    showToast: (...args) => {
      savedToasts.push(args);
    },
    getUserFacingErrorMessage: (error) => String(error.message || error)
  });

  await context.handleSaveSettings();

  assert.deepEqual(draftApplications, []);
  assert.equal(context.state.settings.apiUrl, 'http://localhost:3001');
  assert.equal(context.state.settings.poeVersion, 'poe1');
  assert.equal(context.state.settings.defaultLeaguePoe2, 'Dawn of the Hunt');
  assert.equal(savedToasts.length, 1);
  assert.deepEqual(savedToasts[0], ['toast.error', 'Invalid API URL', 'error']);
});

test('choosing a settings version marks only that button as pressed', () => {
  const createToggle = (version) => {
    const attributes = {};
    const classes = new Set();
    return {
      dataset: { version },
      attributes,
      classes,
      classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
      setAttribute: (name, value) => {
        attributes[name] = value;
      }
    };
  };
  const versionBtns = [createToggle('poe1'), createToggle('poe2')];
  const context = loadFunctions(['normalizePoeVersion', 'setToggleButtonPressed', 'applySettingsVersionSelection'], {
    state: { settings: { poeVersion: 'poe1' } },
    elements: { versionBtns }
  });

  assert.equal(context.applySettingsVersionSelection('poe2'), 'poe2');
  assert.deepEqual(versionBtns.map((btn) => [btn.classes.has('active'), btn.attributes['aria-pressed']]), [
    [false, 'false'],
    [true, 'true']
  ]);
});

test('online status reads a grey Off while online is off, Disconnected once on, and keeps a test result', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  // Online is off by default, so the markup already reads Off before init renders it.
  assert.match(html, /<div class="connection-status is-off">\s*<div class="connection-dot" id="connection-dot"><\/div>\s*<span id="connection-text" data-i18n="settings\.onlineOffShort">/);

  const connectionStatus = createDatasetElement();
  const connectionDot = createDatasetElement(['connected']);
  const connectionText = { dataset: {}, textContent: '' };
  const state = { onlineAccount: { enabled: false, signedIn: false } };
  const context = loadFunctions(['renderOnlineSettings'], {
    state,
    elements: { connectionStatus, connectionDot, connectionText },
    window: { t: (key) => `t:${key}` }
  });

  context.renderOnlineSettings();
  assert.equal(connectionStatus.classList.contains('is-off'), true);
  assert.equal(connectionDot.classList.contains('connected'), false);
  assert.equal(connectionText.dataset.i18n, 'settings.onlineOffShort');
  assert.equal(connectionText.textContent, 't:settings.onlineOffShort');

  state.onlineAccount = { enabled: true, signedIn: false };
  context.renderOnlineSettings();
  assert.equal(connectionStatus.classList.contains('is-off'), false);
  assert.equal(connectionText.dataset.i18n, 'settings.disconnected');
  assert.equal(connectionText.textContent, 't:settings.disconnected');

  // handleTestConnection writes its result and then renders again; the result stays while online stays on.
  connectionDot.classList.add('connected');
  connectionText.textContent = 't:settings.connected';
  context.renderOnlineSettings();
  assert.equal(connectionDot.classList.contains('connected'), true);
  assert.equal(connectionText.textContent, 't:settings.connected');

  state.onlineAccount = { enabled: false, signedIn: false };
  context.renderOnlineSettings();
  assert.equal(connectionStatus.classList.contains('is-off'), true);
  assert.equal(connectionDot.classList.contains('connected'), false);
  assert.equal(connectionText.textContent, 't:settings.onlineOffShort');
});

test('settings tabs use two columns, with full-width groups for long content', () => {
  const css = fs.readFileSync(stylesCssPath, 'utf8');
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const cssRule = (selector) => {
    const start = css.indexOf(`\n${selector} {`);
    assert.notEqual(start, -1, `Missing ${selector} rule`);
    return css.slice(start, css.indexOf('}', start));
  };
  const groupOpeningTag = (marker) => {
    const markerIndex = html.indexOf(marker);
    assert.notEqual(markerIndex, -1, `Missing ${marker}`);
    const groupStart = html.lastIndexOf('<div class="settings-group', markerIndex);
    return html.slice(groupStart, html.indexOf('>', groupStart) + 1);
  };

  assert.match(cssRule('.settings-layout'), /max-width: 1120px;/);
  const activeTab = cssRule('.settings-tab.active');
  assert.match(activeTab, /display: grid;/);
  assert.match(activeTab, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  // Paired groups end at one height.
  assert.match(activeTab, /align-items: stretch;/);
  assert.match(activeTab, /animation: pageIn /);
  // Without dense packing the Tab order stays the visual order.
  assert.doesNotMatch(activeTab, /grid-auto-flow/);
  assert.doesNotMatch(cssRule('.settings-group'), /margin-bottom/);
  assert.match(cssRule('.settings-group--wide'), /grid-column: 1 \/ -1;/);
  assert.match(css, /@media \(max-width: 1100px\) \{\s*\.settings-tab\.active \{\s*grid-template-columns: minmax\(0, 1fr\);/);

  for (const marker of [
    'data-i18n="settings.poeVersion"',
    'id="poe-path"',
    'class="poe-account-card"',
    'id="online-enabled"',
    'data-i18n="settings.onlineAccount"',
    'id="diagnostics-mode"',
    'id="data-folder-path"',
    'id="audit-trail-list"',
    'about-info',
    'id="bug-report-preview"',
    // The only group of its tab, or the last one of an odd count.
    'id="enable-notifications"',
    'id="app-update-status"'
  ]) {
    assert.match(groupOpeningTag(marker), /settings-group--wide/, marker);
  }
  for (const marker of ['id="global-language"', 'id="default-league"', 'id="scan-hotkey"', 'id="connection-text"']) {
    assert.doesNotMatch(groupOpeningTag(marker), /settings-group--wide/, marker);
  }
});

test('Settings has a Data tab before About with the folder, its size and the logs', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const css = fs.readFileSync(stylesCssPath, 'utf8');
  const cssRule = (selector) => {
    const start = css.indexOf(`\n${selector} {`);
    assert.notEqual(start, -1, `Missing ${selector} rule`);
    return css.slice(start, css.indexOf('}', start));
  };

  assert.deepEqual(
    [...html.matchAll(/data-settings-tab="([^"]+)"/g)].map(([, tab]) => tab),
    ['general', 'poe', 'hotkeys', 'notifications', 'api', 'data', 'about']
  );
  const navMarker = html.indexOf('data-settings-tab="data"');
  const navButton = html.slice(html.lastIndexOf('<button', navMarker), html.indexOf('</button>', navMarker));
  for (const part of [
    '<use href="assets/icons.svg#chest"/>',
    '<span data-i18n="settings.data">Data</span>',
    'role="tab"',
    'aria-selected="false"'
  ]) {
    assert.ok(navButton.includes(part), part);
  }

  const apiIndex = html.indexOf('id="settings-api"');
  const dataIndex = html.indexOf('id="settings-data"');
  const aboutIndex = html.indexOf('id="settings-about"');
  assert.ok(apiIndex !== -1 && apiIndex < dataIndex && dataIndex < aboutIndex, 'Online, Data, About');

  const panel = html.slice(html.lastIndexOf('<div', dataIndex), html.indexOf('<!-- About Tab -->', dataIndex));
  assert.ok(panel.startsWith('<div class="settings-tab" id="settings-data" role="tabpanel">'));
  // A tab-wide line first: the buttons below act right away, and the Save bar stays as on About.
  assert.ok(
    panel.slice(panel.indexOf('>') + 1).trimStart()
      .startsWith('<p class="settings-desc settings-tab-note" data-i18n="settings.dataAppliesNow">')
  );
  for (const part of [
    // Filled with textContent by loadDataSummary, so no data-i18n would overwrite them.
    '<code id="data-folder-path" class="data-folder-path"></code>',
    '<p id="data-total-size" class="settings-desc"></p>',
    '<button id="open-data-folder" class="btn btn-secondary btn-small" type="button">',
    '<use href="assets/icons.svg#folder"/>',
    '<span class="btn-label" data-i18n="settings.openDataFolder">',
    '<h3 data-i18n="settings.auditTrail">Activity log</h3>',
    'id="audit-trail-list"',
    '<p class="settings-desc clear-logs-note" id="clear-logs-note" data-i18n="settings.clearLogsDesc">',
    '<button id="clear-logs" class="btn btn-danger btn-small" type="button" aria-describedby="clear-logs-note">',
    '<use href="assets/icons.svg#trash"/>',
    '<span class="btn-label" data-i18n="settings.clearLogs">'
  ]) {
    assert.ok(panel.includes(part), part);
  }
  // The activity log moved here from the Online tab.
  assert.ok(!html.slice(apiIndex, dataIndex).includes('audit-trail-list'));
  for (const id of [
    'settings-data',
    'data-folder-path',
    'data-total-size',
    'open-data-folder',
    'audit-trail-list',
    'clear-logs-note',
    'clear-logs'
  ]) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1, id);
  }

  assert.match(cssRule('.settings-tab-note'), /grid-column: 1 \/ -1;/);
  const folderPath = cssRule('.data-folder-path');
  for (const declaration of [
    'font-family: var(--font-mono);',
    'border-radius: var(--bevel-sm);',
    'overflow-wrap: anywhere;'
  ]) {
    assert.ok(folderPath.includes(declaration), declaration);
  }
});

test('the Data tab measures the folder on each visit', () => {
  const tabs = ['api', 'data', 'about'];
  const navButtons = tabs.map((tab) => ({ ...createDatasetElement(), dataset: { settingsTab: tab }, setAttribute: () => {} }));
  const panels = tabs.map((tab) => ({ ...createDatasetElement(), id: `settings-${tab}` }));
  const counts = { reports: 0, data: 0 };
  const context = loadFunctions(['showSettingsTab', 'navigateTo'], {
    elements: {
      settingsNavBtns: navButtons,
      settingsTabs: panels,
      settingsDataTab: panels[1],
      settingsAboutTab: panels[2],
      loginModal: createDatasetElement(['hidden']),
      navButtons: [],
      pages: []
    },
    bugReportViews: { about: {}, login: {} },
    closeSessionDrawer: () => {},
    loadBugReportPreview: async () => {
      counts.reports += 1;
    },
    loadDataSummary: async () => {
      counts.data += 1;
    }
  });

  context.showSettingsTab('api');
  assert.deepEqual(counts, { reports: 0, data: 0 });
  context.showSettingsTab('data');
  assert.deepEqual(counts, { reports: 0, data: 1 });
  // The selected tab survives leaving Settings, so coming back measures again.
  context.navigateTo('settings');
  assert.deepEqual(counts, { reports: 0, data: 2 });

  context.showSettingsTab('about');
  assert.deepEqual(counts, { reports: 1, data: 2 });
  context.navigateTo('settings');
  assert.deepEqual(counts, { reports: 2, data: 2 });
});

test('data sizes count in 1024s: whole KB below 1 MB, then MB with one decimal', () => {
  const { formatDataSize } = loadFunctions(['formatDataSize']);

  for (const [bytes, expected] of [
    [0, '0 KB'],
    [NaN, '0 KB'],
    [undefined, '0 KB'],
    [1, '1 KB'],
    [1536, '2 KB'],
    [1048575, '1 MB'],
    [1048576, '1 MB'],
    [1572864, '1.5 MB'],
    [5 * 1024 ** 3, '5,120 MB']
  ]) {
    assert.equal(formatDataSize(bytes), expected, String(bytes));
  }
});

function loadDataSummaryContext(getLocalDataSummary) {
  const attrs = {};
  const elements = {
    dataFolderPath: { textContent: '' },
    dataTotalSize: {
      textContent: '',
      attrs,
      setAttribute: (name, value) => {
        attrs[name] = String(value);
      },
      removeAttribute: (name) => {
        delete attrs[name];
      }
    }
  };
  const toasts = [];
  const context = loadFunctions(['formatDataSize', 'loadDataSummary'], {
    dataSummaryRequestId: 0,
    elements,
    window: {
      t: (key, values) => (values ? `${key} ${JSON.stringify(values)}` : key),
      electronAPI: { getLocalDataSummary }
    },
    showToast: (...args) => toasts.push(args)
  });
  return { context, elements, toasts };
}

test('the Data tab writes the folder and its size as text, and a newer load wins', async () => {
  let resolveSummary;
  const pending = loadDataSummaryContext(() => new Promise((resolve) => {
    resolveSummary = resolve;
  }));
  const load = pending.context.loadDataSummary();
  assert.equal(pending.elements.dataTotalSize.textContent, 'settings.dataSizeLoading');
  assert.equal(pending.elements.dataTotalSize.attrs['aria-busy'], 'true');
  resolveSummary({ folderPath: 'X', totalBytes: 1572864 });
  await load;
  assert.equal(pending.elements.dataFolderPath.textContent, 'X');
  assert.equal(pending.elements.dataTotalSize.textContent, 'settings.dataTotalSize {"size":"1.5 MB"}');
  assert.equal(pending.elements.dataTotalSize.attrs['aria-busy'], undefined);

  // A failed measurement says so in the size line only; a toast would interrupt every visit.
  const failed = loadDataSummaryContext(async () => {
    throw new Error('EPERM: C:\\Users\\someone\\AppData\\Roaming\\Juice Journal');
  });
  await failed.context.loadDataSummary();
  assert.equal(failed.elements.dataTotalSize.textContent, 'settings.dataSizeUnavailable');
  assert.equal(failed.elements.dataFolderPath.textContent, '');
  assert.equal(failed.elements.dataTotalSize.attrs['aria-busy'], undefined);
  assert.deepEqual(failed.toasts, []);

  // The first visit answers last: the second visit's numbers stay.
  const resolvers = [];
  const overlapping = loadDataSummaryContext(() => new Promise((resolve) => resolvers.push(resolve)));
  const first = overlapping.context.loadDataSummary();
  const second = overlapping.context.loadDataSummary();
  resolvers[1]({ folderPath: 'new', totalBytes: 2048 });
  await second;
  resolvers[0]({ folderPath: 'old', totalBytes: 1024 });
  await first;
  assert.equal(overlapping.elements.dataFolderPath.textContent, 'new');
  assert.equal(overlapping.elements.dataTotalSize.textContent, 'settings.dataTotalSize {"size":"2 KB"}');
  assert.equal(overlapping.elements.dataTotalSize.attrs['aria-busy'], undefined);
});

test('a language change writes the size line of an open Data tab again in the new language', async () => {
  let language = 'tr';
  const dataTab = createDatasetElement(['active']);
  const elements = {
    settingsDataTab: dataTab,
    dataFolderPath: { textContent: '' },
    dataTotalSize: { textContent: '', setAttribute: () => {}, removeAttribute: () => {} }
  };
  let summaries = 0;
  const context = loadFunctions(['formatDataSize', 'loadDataSummary', 'applyLocalizedChrome'], {
    dataSummaryRequestId: 0,
    elements,
    renderUserIdentity: () => {},
    renderPoeLinkStatus: () => {},
    window: {
      applyTranslations: () => {},
      t: (key, values) => `${language}:${key}${values ? ` ${values.size}` : ''}`,
      electronAPI: {
        getLocalDataSummary: async () => {
          summaries += 1;
          return { folderPath: 'X', totalBytes: 2048 };
        }
      }
    }
  });
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  await context.loadDataSummary();
  assert.equal(elements.dataTotalSize.textContent, 'tr:settings.dataTotalSize 2 KB');

  // Reset to Defaults on the Data tab sets English and redraws the chrome; the size line has no data-i18n.
  language = 'en';
  context.applyLocalizedChrome();
  assert.equal(elements.dataTotalSize.textContent, 'en:settings.dataSizeLoading');
  await settle();
  assert.equal(elements.dataTotalSize.textContent, 'en:settings.dataTotalSize 2 KB');
  assert.equal(summaries, 2);

  // A Data tab that is not open is measured on its next visit instead.
  dataTab.classList.remove('active');
  language = 'tr';
  context.applyLocalizedChrome();
  await settle();
  assert.equal(summaries, 2);
});

test('a language change redraws the activity log in the new language', () => {
  let language = 'en';
  const elements = { auditTrailList: { innerHTML: '' } };
  const context = loadFunctions(['renderAuditTrail', 'applyLocalizedChrome'], {
    elements,
    state: { auditTrail: [{ key: 'audit.login', createdAt: '2026-10-28T10:00:00.000Z', level: 'info' }] },
    escapeHTML: (value) => value,
    timeAgo: () => 'now',
    renderUserIdentity: () => {},
    renderPoeLinkStatus: () => {},
    window: {
      applyTranslations: () => {},
      t: (key) => `${language}:${key}`
    }
  });

  context.renderAuditTrail();
  assert.match(elements.auditTrailList.innerHTML, /en:audit\.login/);

  language = 'tr';
  context.applyLocalizedChrome();
  assert.match(elements.auditTrailList.innerHTML, /tr:audit\.login/);
  assert.doesNotMatch(elements.auditTrailList.innerHTML, /en:audit\.login/);
});

// Records the button, toast and reload calls of a Data tab handler in one list, so tests can check their order.
function loadDataHandlerContext(functionName, buttonKey, electronAPI) {
  const events = [];
  const toasts = [];
  const counts = { reloads: 0 };
  const button = {
    disabled: false,
    focusCount: 0,
    focus() {
      this.focusCount += 1;
      events.push('focus');
    }
  };
  const createView = () => ({
    preview: { textContent: 'error: e2e renderer failure' },
    openButton: { disabled: false },
    copyButton: { disabled: false },
    reportId: 3
  });
  const views = { about: createView(), login: createView() };
  const context = loadFunctions([functionName], {
    elements: { [buttonKey]: button },
    bugReportViews: views,
    window: { t: (key) => key, electronAPI },
    setButtonBusy: (target, busy) => {
      assert.equal(target, button);
      target.disabled = busy;
      events.push(`busy:${busy}`);
    },
    showToast: (...args) => {
      toasts.push(args);
      events.push('toast');
    },
    loadDataSummary: async () => {
      counts.reloads += 1;
    }
  });
  return { context, button, views, events, toasts, counts };
}

test('Clear logs reports each outcome with a static text, after the button gets its focus back', async () => {
  const failedToast = ['toast.error', 'toast.logsClearFailed', 'error'];
  const outcomes = [
    ['cleared', async () => ({ cleared: true }), [['settings.data', 'toast.logsCleared', 'success']], 1, true],
    ['canceled', async () => ({ canceled: true }), [], 0, false],
    ['busy', async () => ({ busy: true }), [['settings.data', 'toast.dataActionBusy', 'warning']], 0, false],
    ['partial', async () => ({ cleared: false, failed: ['errorLog'] }), [failedToast], 1, true],
    ['confirm failed', async () => ({ cleared: false, failed: ['confirm'] }), [failedToast], 1, true],
    ['rejected', async () => {
      throw new Error('EBUSY: C:\\Users\\someone\\AppData\\Roaming\\Juice Journal\\logs\\errors.jsonl');
    }, [failedToast], 1, true]
  ];

  for (const [outcome, clearLogs, expectedToasts, expectedReloads, viewsReset] of outcomes) {
    const run = loadDataHandlerContext('handleClearLogs', 'clearLogsBtn', { clearLogs });

    await run.context.handleClearLogs();

    assert.deepEqual(run.toasts, expectedToasts, outcome);
    assert.ok(!JSON.stringify(run.toasts).includes('someone'), outcome);
    assert.equal(run.counts.reloads, expectedReloads, outcome);
    // The native confirm took focus; it comes back before the toast, so moving it does not cut the toast off.
    assert.deepEqual(run.events, ['busy:true', 'busy:false', 'focus', ...expectedToasts.map(() => 'toast')], outcome);
    assert.equal(run.button.focusCount, 1, outcome);
    assert.equal(run.button.disabled, false, outcome);
    // Once the logs may have changed, no report view keeps the cleared lines or a Copy for them.
    for (const view of Object.values(run.views)) {
      assert.deepEqual(
        [view.preview.textContent, view.reportId, view.openButton.disabled, view.copyButton.disabled],
        viewsReset ? ['', null, true, true] : ['error: e2e renderer failure', 3, false, false],
        outcome
      );
    }
  }
});

test('Open folder warns with a static text only when the folder did not open, after the button gets its focus back', async () => {
  const failedToast = ['toast.error', 'toast.dataFolderOpenFailed', 'error'];
  const outcomes = [
    ['opened', async () => ({ opened: true }), []],
    ['not opened', async () => ({ opened: false }), [failedToast]],
    ['rejected', async () => {
      throw new Error('C:\\Users\\someone\\AppData\\Roaming\\Juice Journal: Access is denied.');
    }, [failedToast]]
  ];

  for (const [outcome, openDataFolder, expectedToasts] of outcomes) {
    const run = loadDataHandlerContext('handleOpenDataFolder', 'openDataFolderBtn', { openDataFolder });

    await run.context.handleOpenDataFolder();

    assert.deepEqual(run.toasts, expectedToasts, outcome);
    assert.deepEqual(run.events, ['busy:true', 'busy:false', 'focus', ...expectedToasts.map(() => 'toast')], outcome);
    assert.equal(run.button.disabled, false, outcome);
    assert.equal(run.counts.reloads, 0, outcome);
  }
});

test('the Data tab buttons are wired to their handlers', () => {
  const body = extractFunctionSource(fs.readFileSync(appJsPath, 'utf8'), 'setupEventListeners');

  assert.ok(body.includes("elements.openDataFolderBtn.addEventListener('click', handleOpenDataFolder)"));
  assert.ok(body.includes("elements.clearLogsBtn.addEventListener('click', handleClearLogs)"));
});

test('hotkey fields are the keycaps and explain how to capture', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const css = fs.readFileSync(stylesCssPath, 'utf8');

  // The save flow and the hotkey tests read these fields and badges, so they stay in the DOM.
  for (const id of ['scan-hotkey', 'scan-hotkey-display', 'stash-scan-hotkey', 'stash-scan-hotkey-display']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.equal(html.match(/data-i18n="settings\.hotkeyCaptureHint"/g)?.length, 2);
  for (const id of ['scan-hotkey', 'stash-scan-hotkey']) {
    const input = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))[0];
    // With the badge hidden, the readonly field is the only control, so it takes its name from the heading.
    assert.match(input, new RegExp(`aria-labelledby="${id}-title"`));
    assert.match(input, new RegExp(`aria-describedby="${id}-hint"`));
    assert.match(html, new RegExp(`<h3 id="${id}-title" data-i18n="settings\\.`));
    assert.match(html, new RegExp(`<p class="settings-desc hotkey-hint" id="${id}-hint" data-i18n="settings\\.hotkeyCaptureHint">`));
  }

  assert.match(css, /\.hotkey-input \.hotkey-badge \{\s*display: none;\s*\}/);
  assert.match(css, /\.hotkey-input \.hotkey-field \{[^}]*border-radius: var\(--bevel-sm\);/);
  // Focus selects the value; the system selection colour must not cover the gold keycap text.
  assert.match(css, /\.hotkey-input \.hotkey-field::selection \{\s*color: var\(--gold-light\);\s*background: transparent;\s*\}/);
  assert.match(css, /\.connection-status\.is-off \.connection-dot \{\s*background: var\(--text-muted\);\s*box-shadow: none;\s*\}/);
});
