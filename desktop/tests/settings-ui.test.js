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
    markButtonSaved: () => {},
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
  const saved = [];
  const saveButton = { id: 'save-settings' };
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
      defaultLeagueSelect: { value: '', hidden: true, disabled: true },
      saveSettingsBtn: saveButton
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
    markButtonSaved: (button) => saved.push(button),
    getUserFacingErrorMessage: (error) => String(error)
  });

  await context.handleSaveSettings();

  assert.equal(redraws, 1);
  // The save succeeds: Save reads Saved for a moment instead of a toast.
  assert.deepEqual(toasts, []);
  assert.deepEqual(saved, [saveButton]);
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
  assert.deepEqual(toasts, [['stash.unavailableTitle', 'stash.capabilityUnavailable.poe2', 'info']]);
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
  const mappedErrors = [];
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
    // The real mapping is checked with the error helpers; here the handler must hand the error over, never its text.
    getUserFacingErrorMessage: (error, fallbackKey) => {
      mappedErrors.push(error.message);
      return fallbackKey;
    }
  });

  await context.handleSaveSettings();

  assert.deepEqual(draftApplications, []);
  assert.equal(context.state.settings.apiUrl, 'http://localhost:3001');
  assert.equal(context.state.settings.poeVersion, 'poe1');
  assert.equal(context.state.settings.defaultLeaguePoe2, 'Dawn of the Hunt');
  assert.deepEqual(mappedErrors, ['Invalid API URL']);
  assert.deepEqual(savedToasts, [['toast.settingsError', 'toast.tryAgain', 'error']]);
});

test('renderer saves nothing and shows the error copy, not the raw text, when the hotkeys do not validate', async () => {
  const savedToasts = [];
  const saves = [];
  const context = loadFunctions(['handleSaveSettings'], {
    elements: {
      scanHotkey: { value: 'F9' },
      stashScanHotkey: { value: 'F9' }
    },
    document: { querySelector: () => null },
    getSelectedTrackerContext: () => ({ poeVersion: 'poe1', league: 'Standard' }),
    getHotkeyModel: () => ({
      validateHotkeys: () => {
        throw new Error("EPERM: operation not permitted, open 'C:\\Users\\someone\\settings.json'");
      }
    }),
    normalizePoeVersion: (value) => value,
    getSettingsLeagueVersion: () => 'poe1',
    getLeagueSettingKey: () => 'defaultLeaguePoe1',
    getActiveLeagueFieldValue: () => 'Standard',
    window: {
      electronAPI: { setSettings: async (settings) => saves.push(settings) },
      t: (key) => key
    },
    state: { settings: {} },
    showToast: (...args) => savedToasts.push(args),
    getUserFacingErrorMessage: (error, fallbackKey) => fallbackKey
  });

  await context.handleSaveSettings();

  assert.deepEqual(saves, []);
  assert.deepEqual(savedToasts, [['toast.settingsError', 'toast.tryAgain', 'error']]);
});

test('a save reads Saved on its own button for a moment, and the announcer reads it out', () => {
  const timers = [];
  const announcer = {
    lines: [],
    appendChild(line) {
      this.lines.push(line);
      line.remove = () => {
        this.lines = this.lines.filter((other) => other !== line);
      };
    }
  };
  const label = { textContent: 't:settings.save', getAttribute: (name) => (name === 'data-i18n' ? 'settings.save' : null) };
  const button = { querySelector: (selector) => (selector === '.btn-label' ? label : null) };
  const context = loadFunctions(['announceStatus', 'markButtonSaved'], {
    SAVED_STATE_MS: 2000,
    elements: { toastAnnouncer: announcer },
    document: { createElement: () => ({ textContent: '' }) },
    window: { t: (key) => `t:${key}` },
    setTimeout: (callback, delay) => timers.push([callback, delay])
  });

  context.markButtonSaved(button);
  assert.equal(label.textContent, 't:settings.savedState');
  assert.deepEqual(announcer.lines.map((line) => line.textContent), ['t:settings.savedState']);
  assert.deepEqual(timers.map(([, delay]) => delay), [2000, 2000]);

  timers.forEach(([callback]) => callback());
  assert.equal(label.textContent, 't:settings.save', 'the label is translated again, in case the language changed');
  assert.deepEqual(announcer.lines, []);

  // A button without a label span is left alone.
  assert.doesNotThrow(() => context.markButtonSaved({ querySelector: () => null }));
  assert.doesNotThrow(() => context.markButtonSaved(null));
  assert.equal(timers.length, 2);
});

function loadErrorHelpers() {
  const source = fs.readFileSync(appJsPath, 'utf8');
  const keyMapStart = source.indexOf('const ERROR_MESSAGE_KEY_MAP = {');
  assert.notEqual(keyMapStart, -1);
  const keyMap = source.slice(keyMapStart, source.indexOf('\n};', keyMapStart) + 3);
  // extractRawErrorMessage holds a regex with quotes, which the function extractor cannot read, so the error helpers
  // load as the one block they are, from extractRawErrorMessage through getUserFacingErrorMessage.
  const helpersStart = source.indexOf('function extractRawErrorMessage');
  const lastHelper = extractFunctionSource(source, 'getUserFacingErrorMessage');
  const helpers = source.slice(helpersStart, source.indexOf(lastHelper) + lastHelper.length);
  assert.match(helpers, /const ERROR_PATTERN_MAP = \[/);
  const context = vm.createContext({ window: { t: (key) => key } });
  vm.runInContext(
    `${keyMap}\n${helpers}\nthis.getUserFacingErrorMessage = getUserFacingErrorMessage;\nthis.extractRawErrorMessage = extractRawErrorMessage;`,
    context
  );
  return context;
}

test('errors the player can fix name the fix instead of try again', () => {
  const context = loadErrorHelpers();

  // Main rejects a server address it will not use; only a new address helps.
  assert.equal(context.getUserFacingErrorMessage(new Error('Invalid API URL'), 'toast.tryAgain'), 'errors.invalidApiUrl');
  assert.equal(
    context.getUserFacingErrorMessage(new Error("Error invoking remote method 'set-settings': Error: Invalid API URL"), 'toast.tryAgain'),
    'errors.invalidApiUrl'
  );
  // A reconnect with another Path of Exile account comes back as a reply with a code; its text is main's, so the
  // code decides.
  assert.equal(
    context.getUserFacingErrorMessage(
      { success: false, errorCode: 'POE_DIFFERENT_ACCOUNT', error: 'Bu farkli bir Path of Exile hesabi.' },
      'toast.tryAgain'
    ),
    'errors.poeDifferentAccount'
  );
  assert.equal(
    context.getUserFacingErrorMessage({ success: false, errorCode: 'EACCES', error: "EACCES: open 'C:\\Users\\someone\\a.json'" }, 'toast.tryAgain'),
    'toast.tryAgain'
  );
});

test('hotkey errors reach the toast as their own reason, from the renderer check or from main', () => {
  const context = loadErrorHelpers();

  // Every Error text hotkeyModel throws at the user, except the capture guard for a missing keyboard event.
  const hotkeyModelSource = fs.readFileSync(path.join(desktopDir, 'src', 'modules', 'hotkeyModel.js'), 'utf8');
  const thrown = [...new Set([...hotkeyModelSource.matchAll(/throw new Error\('([^']+)'\)/g)].map(([, text]) => text))]
    .filter((text) => text !== 'Keyboard event is required');
  assert.ok(thrown.length >= 4, thrown.join(', '));
  for (const text of thrown) {
    assert.match(context.getUserFacingErrorMessage(new Error(text), 'toast.tryAgain'), /^settings\.hotkeyError/, text);
    assert.match(
      context.getUserFacingErrorMessage(new Error(`Error invoking remote method 'set-settings': Error: ${text}`), 'toast.tryAgain'),
      /^settings\.hotkeyError/,
      text
    );
  }

  // Main cannot register a key another app holds; trying again would not help.
  assert.equal(
    context.getUserFacingErrorMessage(
      new Error("Error invoking remote method 'set-settings': Error: Unable to register global shortcut: Ctrl+Shift+L"),
      'toast.tryAgain'
    ),
    'settings.hotkeyErrorInUse'
  );
  // Anything else falls back to the hint, never to raw text.
  assert.equal(context.getUserFacingErrorMessage(new Error('EPERM: C:\\Users\\someone'), 'toast.tryAgain'), 'toast.tryAgain');
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
  assert.match(html, /<div class="connection-status is-off">\s*<div class="connection-dot" id="connection-dot"><\/div>\s*<span id="connection-text" data-i18n="settings\.onlineOffShort" role="status">/);

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
    'id="delete-all-local-data"',
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
  const failedToast = ['toast.logsClearFailedTitle', 'toast.logsClearFailed', 'error'];
  const outcomes = [
    ['cleared', async () => ({ cleared: true }), [['toast.logsCleared', '', 'success']], 1, true],
    ['canceled', async () => ({ canceled: true }), [], 0, false],
    ['busy', async () => ({ busy: true }), [['toast.dataActionBusy', '', 'warning']], 0, false],
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
  const failedToast = ['toast.dataFolderOpenFailed', 'toast.tryAgain', 'error'];
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
  assert.ok(body.includes("elements.deleteAllBtn.addEventListener('click', handleDeleteAllLocalData)"));
});

test('the Data tab ends with Delete everything, and its dialog asks with a checkbox and has no form', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const css = fs.readFileSync(stylesCssPath, 'utf8');
  const cssRule = (selector) => {
    const start = css.indexOf(`\n${selector} {`);
    assert.notEqual(start, -1, `Missing ${selector} rule`);
    return css.slice(start, css.indexOf('}', start));
  };

  const dataIndex = html.indexOf('id="settings-data"');
  const panel = html.slice(dataIndex, html.indexOf('<!-- About Tab -->', dataIndex));
  const groupStart = panel.indexOf('<div class="settings-group settings-group--wide settings-group--danger" id="delete-all-group">');
  assert.notEqual(groupStart, -1);
  // After Clear logs, and the last group of the tab.
  assert.ok(panel.indexOf('id="clear-logs"') < groupStart);
  assert.equal(panel.indexOf('<div class="settings-group', groupStart + 1), -1);
  const group = panel.slice(groupStart);
  for (const part of [
    '<h3 data-i18n="settings.deleteAll">Delete everything</h3>',
    '<p class="settings-desc" id="delete-all-note" data-i18n="settings.deleteAllDesc">',
    '<button id="delete-all-local-data" class="btn btn-danger btn-small" type="button" aria-describedby="delete-all-note" aria-haspopup="dialog">',
    '<use href="assets/icons.svg#trash"/>',
    '<span class="btn-label" data-i18n="settings.deleteAll">Delete everything</span>'
  ]) {
    assert.ok(group.includes(part), part);
  }

  // After the farm publish modal: auth-poe-ui.test.js reads the sign-in panel up to the New Map Session comment.
  const modalStart = html.indexOf('<!-- Delete Everything Modal -->');
  const mainStart = html.indexOf('<!-- Main Content -->');
  assert.ok(html.indexOf('id="farm-publish-modal"') < modalStart && modalStart < mainStart);
  const modal = html.slice(modalStart, mainStart);
  for (const part of [
    '<div id="delete-all-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="delete-all-title" aria-describedby="delete-all-body delete-all-kept">',
    // Holds focus while the delete runs.
    '<h2 id="delete-all-title" tabindex="-1" data-i18n="settings.deleteAllTitle">Delete everything?</h2>',
    '<p class="modal-subtitle" id="delete-all-body" data-i18n="settings.deleteAllBody">',
    '<p class="modal-subtitle" id="delete-all-kept" data-i18n="settings.deleteAllKept">',
    '<input id="delete-all-ack" type="checkbox">',
    '<label for="delete-all-ack" data-i18n="settings.deleteAllAck">I understand this cannot be undone</label>',
    '<button id="delete-all-cancel" type="button" class="btn btn-secondary" data-i18n="settings.deleteAllCancel">Cancel</button>',
    '<button id="delete-all-confirm" type="button" class="btn btn-danger" disabled>',
    '<span class="btn-label" data-i18n="settings.deleteAll">Delete everything</span>'
  ]) {
    assert.ok(modal.includes(part), part);
  }
  // Enter never submits: there is no form and no submit button. Cancel comes before Delete everything.
  assert.ok(!modal.includes('<form'));
  assert.ok(!modal.includes('type="submit"'));
  assert.ok(modal.indexOf('id="delete-all-ack"') < modal.indexOf('id="delete-all-cancel"'));
  assert.ok(modal.indexOf('id="delete-all-cancel"') < modal.indexOf('id="delete-all-confirm"'));
  for (const id of [
    'delete-all-group', 'delete-all-note', 'delete-all-local-data', 'delete-all-modal', 'delete-all-title',
    'delete-all-body', 'delete-all-kept', 'delete-all-ack', 'delete-all-cancel', 'delete-all-confirm'
  ]) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1, id);
  }

  assert.match(cssRule('.settings-group--danger'), /border-color: rgb\(var\(--loss-rgb\) \/ 0\.35\);/);
  assert.match(cssRule('.delete-all-content'), /width: min\(520px, calc\(100vw - 2rem\)\);/);
});

// The Delete everything dialog with fake controls: focus() moves document.activeElement, and every listener is kept
// by target and type, so tests can fire them and check that they are removed again. signInShown opens it over the
// sign-in screen, as the Try again of a failed delete does.
function createDeleteAllDialog({ signInShown = false } = {}) {
  const listeners = new Map();
  const doc = { activeElement: null };
  const listenable = (name, target) => Object.assign(target, {
    name,
    focus() {
      doc.activeElement = target;
    },
    addEventListener(type, handler) {
      listeners.set(`${name}:${type}`, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(`${name}:${type}`) === handler) listeners.delete(`${name}:${type}`);
    }
  });
  const ack = listenable('ack', { disabled: false, checked: true });
  const cancel = listenable('cancel', { disabled: false });
  const confirm = listenable('confirm', { disabled: false });
  const panel = listenable('panel', {});
  const modal = listenable('modal', createDatasetElement(['hidden']));
  modal.contains = (target) => [modal, panel, ack, cancel, confirm].includes(target);
  const deleteAllBtn = listenable('deleteAllBtn', {});
  const signInBtn = listenable('signInBtn', {});
  listenable('document', doc);
  doc.getElementById = (id) => (id === 'poe-oauth-login' ? signInBtn : null);
  const fire = (name, type, event = {}) => {
    let prevented = false;
    listeners.get(`${name}:${type}`)?.({ ...event, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  const context = loadFunctions(['getDeleteAllReturnFocus', 'requestDeleteAllConfirmation'], {
    document: doc,
    elements: {
      loginModal: createDatasetElement(signInShown ? [] : ['hidden']),
      deleteAllModal: modal,
      deleteAllAck: ack,
      deleteAllCancelBtn: cancel,
      deleteAllConfirmBtn: confirm,
      deleteAllBtn
    }
  });
  const open = () => {
    const outcome = { value: undefined };
    context.requestDeleteAllConfirmation().then((value) => {
      outcome.value = value;
    });
    return outcome;
  };
  return { ack, cancel, confirm, panel, modal, deleteAllBtn, signInBtn, doc, listeners, fire, open };
}

const settleMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

test('the Delete everything dialog opens on Cancel and enables Delete only while the box is ticked', async () => {
  const dialog = createDeleteAllDialog();
  const outcome = dialog.open();

  assert.equal(dialog.modal.classList.contains('hidden'), false);
  // A box ticked at the last visit starts unticked again.
  assert.equal(dialog.ack.checked, false);
  assert.equal(dialog.confirm.disabled, true);
  assert.equal(dialog.doc.activeElement, dialog.cancel);
  assert.deepEqual([...dialog.listeners.keys()].sort(), ['ack:change', 'cancel:click', 'confirm:click', 'document:keydown', 'modal:click']);

  dialog.ack.checked = true;
  dialog.fire('ack', 'change');
  assert.equal(dialog.confirm.disabled, false);
  dialog.ack.checked = false;
  dialog.fire('ack', 'change');
  assert.equal(dialog.confirm.disabled, true);

  // Neither a click on Delete while the box is unticked nor Enter does anything.
  dialog.fire('confirm', 'click');
  assert.equal(dialog.fire('document', 'keydown', { key: 'Enter' }), false);
  // A click inside the panel is not a backdrop click.
  dialog.fire('modal', 'click', { target: dialog.panel });
  await settleMicrotasks();
  assert.equal(outcome.value, undefined);
  assert.equal(dialog.modal.classList.contains('hidden'), false);
  assert.equal(dialog.listeners.size, 5);
});

test('Escape, Cancel and a backdrop click close the Delete everything dialog and return focus to its button', async () => {
  const ways = [
    ['Escape', (dialog) => dialog.fire('document', 'keydown', { key: 'Escape' })],
    ['Cancel', (dialog) => dialog.fire('cancel', 'click')],
    ['backdrop', (dialog) => dialog.fire('modal', 'click', { target: dialog.modal })],
    // Ticked first: closing still deletes nothing.
    ['Cancel after ticking', (dialog) => {
      dialog.ack.checked = true;
      dialog.fire('ack', 'change');
      dialog.fire('cancel', 'click');
    }]
  ];

  for (const [way, close] of ways) {
    const dialog = createDeleteAllDialog();
    const outcome = dialog.open();

    close(dialog);
    await settleMicrotasks();

    assert.equal(outcome.value, false, way);
    assert.equal(dialog.modal.classList.contains('hidden'), true, way);
    assert.equal(dialog.doc.activeElement, dialog.deleteAllBtn, way);
    assert.equal(dialog.listeners.size, 0, way);
  }
});

test('the Delete everything dialog opened over sign-in gives focus back to sign-in, not to the Data tab behind it', async () => {
  for (const key of ['Escape', 'Cancel']) {
    const dialog = createDeleteAllDialog({ signInShown: true });
    const outcome = dialog.open();
    assert.equal(dialog.doc.activeElement, dialog.cancel, key);

    if (key === 'Escape') {
      dialog.fire('document', 'keydown', { key });
    } else {
      dialog.fire('cancel', 'click');
    }
    await settleMicrotasks();

    assert.equal(outcome.value, false, key);
    assert.equal(dialog.doc.activeElement, dialog.signInBtn, key);
  }
});

test('Tab keeps focus in the Delete everything dialog and skips Delete while it is disabled', () => {
  const dialog = createDeleteAllDialog();
  dialog.open();
  const tab = (shiftKey = false) => dialog.fire('document', 'keydown', { key: 'Tab', shiftKey });

  // Delete disabled: the box and Cancel only.
  dialog.cancel.focus();
  assert.equal(tab(), true);
  assert.equal(dialog.doc.activeElement, dialog.ack);
  assert.equal(tab(), true);
  assert.equal(dialog.doc.activeElement, dialog.cancel);
  assert.equal(tab(true), true);
  assert.equal(dialog.doc.activeElement, dialog.ack);
  assert.equal(tab(true), true);
  assert.equal(dialog.doc.activeElement, dialog.cancel);

  // Delete enabled: it is the last control.
  dialog.ack.checked = true;
  dialog.fire('ack', 'change');
  assert.equal(tab(), true);
  assert.equal(dialog.doc.activeElement, dialog.confirm);
  assert.equal(tab(), true);
  assert.equal(dialog.doc.activeElement, dialog.ack);
  assert.equal(tab(true), true);
  assert.equal(dialog.doc.activeElement, dialog.confirm);

  // Focus outside the dialog comes back to its first control.
  dialog.deleteAllBtn.focus();
  assert.equal(tab(), true);
  assert.equal(dialog.doc.activeElement, dialog.ack);
});

test('ticking the box and pressing Delete everything resolves true with the dialog still open', async () => {
  const dialog = createDeleteAllDialog();
  const outcome = dialog.open();

  dialog.ack.checked = true;
  dialog.fire('ack', 'change');
  dialog.fire('confirm', 'click');
  await settleMicrotasks();

  assert.equal(outcome.value, true);
  // The dialog stays for the busy state, and focus is not sent behind it.
  assert.equal(dialog.modal.classList.contains('hidden'), false);
  assert.notEqual(dialog.doc.activeElement, dialog.deleteAllBtn);
  assert.equal(dialog.listeners.size, 0);
});

// handleDeleteAllLocalData with the dialog answered by a stub. Focus, busy, toast, sign-out and settings calls go into
// one list, so tests can check their order. signInShown runs it from the sign-in screen, as Try again does.
function loadDeleteAllContext(deleteAllLocalData, { confirmed = true, logoutFails = false, signInShown = false } = {}) {
  const events = [];
  const toasts = [];
  const keydown = new Map();
  const counts = { ipc: 0, logout: 0, signedOut: 0, loadSettings: 0 };
  const focusable = (name, extra = {}) => ({ ...extra, focus: () => events.push(`focus:${name}`) });
  const elements = {
    loginModal: createDatasetElement(signInShown ? [] : ['hidden']),
    deleteAllModal: createDatasetElement(),
    deleteAllTitle: focusable('title'),
    deleteAllAck: { disabled: false },
    deleteAllCancelBtn: { disabled: false },
    deleteAllConfirmBtn: { disabled: false },
    deleteAllBtn: focusable('deleteAllBtn')
  };
  const signInButton = focusable('signIn');
  const context = loadFunctions(['getDeleteAllReturnFocus', 'handleDeleteAllLocalData'], {
    elements,
    document: {
      getElementById: (id) => (id === 'poe-oauth-login' ? signInButton : null),
      addEventListener: (type, handler) => keydown.set(type, handler),
      removeEventListener: (type, handler) => {
        if (keydown.get(type) === handler) keydown.delete(type);
      }
    },
    window: {
      t: (key) => key,
      electronAPI: {
        deleteAllLocalData: (...args) => {
          counts.ipc += 1;
          assert.equal(args.length, 0);
          events.push('ipc');
          return deleteAllLocalData();
        },
        logout: async () => {
          counts.logout += 1;
          events.push('logout');
          if (logoutFails) throw new Error('EBUSY: C:\\Users\\someone\\AppData\\Roaming\\Juice Journal\\config.json');
        }
      }
    },
    requestDeleteAllConfirmation: async () => confirmed,
    setButtonBusy: (target, busy, label) => {
      assert.equal(target, elements.deleteAllConfirmBtn);
      target.disabled = busy;
      events.push(label ? `busy:${busy}:${label}` : `busy:${busy}`);
    },
    announceStatus: (text) => events.push(`announce:${text}`),
    showToast: (...args) => {
      toasts.push(args);
      events.push('toast');
    },
    clearActiveCharacterRefreshTimers: () => events.push('stopCharacterTimers'),
    characterReconcileTimer: 'reconcile',
    clearTimeout: (id) => events.push(`clearTimeout:${id}`),
    showSignedOutWindow: () => {
      counts.signedOut += 1;
      events.push('signedOut');
    },
    loadSettings: async () => {
      counts.loadSettings += 1;
      events.push('loadSettings');
    }
  });
  return { context, elements, events, toasts, keydown, counts };
}

test('Delete everything sends nothing when the dialog is canceled, and stays busy once main restarts the app', async () => {
  const canceled = loadDeleteAllContext(async () => assert.fail('deleted after Cancel'), { confirmed: false });
  await canceled.context.handleDeleteAllLocalData();
  assert.deepEqual(canceled.events, []);
  assert.equal(canceled.counts.ipc, 0);

  const deleted = loadDeleteAllContext(async () => ({ deleted: true }));
  await deleted.context.handleDeleteAllLocalData();
  assert.equal(deleted.counts.ipc, 1);
  // Busy before the call, focus held on the title, and nothing undone: the app is restarting.
  assert.deepEqual(deleted.events, [
    'busy:true:settings.deleteAllRunning',
    'focus:title',
    'announce:settings.deleteAllRunning',
    'ipc'
  ]);
  assert.deepEqual(deleted.toasts, []);
  assert.equal(deleted.counts.logout, 0);
  assert.equal(deleted.counts.signedOut, 0);
  assert.equal(deleted.elements.deleteAllModal.classList.contains('hidden'), false);
  assert.equal(deleted.elements.deleteAllAck.disabled, true);
  assert.equal(deleted.elements.deleteAllCancelBtn.disabled, true);
  assert.equal(deleted.elements.deleteAllConfirmBtn.disabled, true);
  // Every control is disabled, so Tab stays on the title instead of reaching the page behind the dialog.
  let prevented = false;
  deleted.keydown.get('keydown')({ key: 'Tab', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(deleted.events.at(-1), 'focus:title');
});

test('Delete everything answers busy with a warning and gives focus back to where the dialog was opened', async () => {
  for (const [from, signInShown, focus] of [['Data tab', false, 'focus:deleteAllBtn'], ['sign-in', true, 'focus:signIn']]) {
    const run = loadDeleteAllContext(async () => ({ deleted: false, reason: 'busy' }), { signInShown });

    await run.context.handleDeleteAllLocalData();

    assert.equal(run.counts.ipc, 1, from);
    assert.equal(run.counts.logout, 0, from);
    assert.equal(run.counts.signedOut, 0, from);
    assert.deepEqual(run.toasts, [['toast.dataActionBusy', '', 'warning']], from);
    assert.deepEqual(run.events.slice(-3), ['busy:false', focus, 'toast'], from);
    assert.equal(run.elements.deleteAllModal.classList.contains('hidden'), true, from);
    assert.equal(run.elements.deleteAllAck.disabled, false, from);
    assert.equal(run.elements.deleteAllCancelBtn.disabled, false, from);
    assert.equal(run.elements.deleteAllConfirmBtn.disabled, false, from);
    assert.equal(run.keydown.size, 0, from);
  }
});

test('a failed Delete everything shows sign-in with the settings main reset and one static error toast', async () => {
  const outcomes = [
    // Main signed out: the window resets without a second sign-out, which would write the cleared activity log.
    ['failed', async () => ({ deleted: false, reason: 'failed', failed: ['icon-cache'] }), {}, false],
    // Main did not answer, or its sign-out failed: the sign-out is tried again, and a failing one changes nothing.
    ['no reply', async () => undefined, {}, true],
    ['rejected', async () => {
      throw new Error("Error invoking remote method 'delete-all-local-data': Error: EPERM: C:\\Users\\someone\\AppData\\Roaming\\Juice Journal");
    }, {}, true],
    ['sign-out failed', async () => ({ deleted: false, reason: 'failed', failed: ['signOut', 'settings'] }), { logoutFails: true }, true]
  ];

  for (const [outcome, deleteAllLocalData, options, signsOutAgain] of outcomes) {
    const run = loadDeleteAllContext(deleteAllLocalData, options);

    await run.context.handleDeleteAllLocalData();

    assert.equal(run.counts.ipc, 1, outcome);
    assert.equal(run.counts.logout, signsOutAgain ? 1 : 0, outcome);
    assert.equal(run.counts.signedOut, 1, outcome);
    // The form shows the settings main reset, so the next Save cannot write the deleted ones back.
    assert.equal(run.counts.loadSettings, 1, outcome);
    assert.equal(run.toasts.length, 1, outcome);
    const [title, message, type, toastOptions] = run.toasts[0];
    assert.deepEqual([title, message, type], ['toast.deleteAllFailedTitle', 'toast.deleteAllFailed', 'error'], outcome);
    assert.equal(toastOptions.action.label, 'toast.deleteAllRetry', outcome);
    assert.ok(!JSON.stringify(run.toasts).includes('someone'), outcome);
    // The account's timers stop and the window resets before the settings load; focus goes to sign-in, which now
    // covers the Data tab, before the toast.
    const tail = [
      'busy:false', 'stopCharacterTimers', 'clearTimeout:reconcile', ...(signsOutAgain ? ['logout'] : []), 'signedOut',
      'loadSettings', 'focus:signIn', 'toast'
    ];
    assert.deepEqual(run.events.slice(-tail.length), tail, outcome);
    assert.ok(!run.events.includes('focus:deleteAllBtn'), outcome);
    assert.equal(run.elements.deleteAllModal.classList.contains('hidden'), true, outcome);
    assert.equal(run.elements.deleteAllAck.disabled, false, outcome);
    assert.equal(run.elements.deleteAllCancelBtn.disabled, false, outcome);
    assert.equal(run.keydown.size, 0, outcome);
  }
});

test('Try again on the failed Delete everything toast asks again over sign-in without a new sign-in', async () => {
  const replies = [{ deleted: false, reason: 'failed', failed: ['profiles'] }, { deleted: true }];
  const run = loadDeleteAllContext(async () => replies.shift());
  await run.context.handleDeleteAllLocalData();
  const { onSelect } = run.toasts[0][3].action;
  assert.equal(onSelect, run.context.handleDeleteAllLocalData);

  run.elements.loginModal.classList.remove('hidden');
  await onSelect();

  assert.equal(run.counts.ipc, 2);
  assert.equal(run.counts.logout, 0);
  assert.equal(run.toasts.length, 1);
  // The second delete went through: the dialog stays busy until main restarts the app.
  assert.equal(run.elements.deleteAllConfirmBtn.disabled, true);
  assert.equal(run.elements.deleteAllCancelBtn.disabled, true);
  assert.deepEqual(run.events.slice(-4), [
    'busy:true:settings.deleteAllRunning',
    'focus:title',
    'announce:settings.deleteAllRunning',
    'ipc'
  ]);
});

test('Dashboard and Sessions open with the journal notice, hidden until main says the journal cannot be read', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const css = fs.readFileSync(stylesCssPath, 'utf8');

  assert.deepEqual(
    [...html.matchAll(/<div class="inline-notice error journal-notice hidden" id="([a-z]+)-journal-notice" /g)].map(([, page]) => page),
    ['dashboard', 'sessions']
  );
  assert.equal(html.split(' journal-notice ').length - 1, 2);
  // First on the Dashboard; on Sessions under the page header, above the summary and the list.
  assert.match(html, /<section id="dashboard-page" class="page active">\s*<div class="inline-notice error journal-notice hidden" id="dashboard-journal-notice"/);
  assert.match(
    html,
    /<input id="session-search-filter"[^>]*>\s*<\/div>\s*<\/div>\s*<div class="inline-notice error journal-notice hidden" id="sessions-journal-notice"/
  );

  for (const [page, nextMarker] of [['dashboard', '<div class="dashboard-grid">'], ['sessions', '<div id="sessions-summary"']]) {
    const start = html.indexOf(`id="${page}-journal-notice"`);
    const notice = html.slice(start, html.indexOf(nextMarker, start));
    for (const part of [
      `role="region" aria-labelledby="${page}-journal-notice-title"`,
      '<span class="notice-mark" aria-hidden="true"><svg class="icon" width="14" height="14"><use href="assets/icons.svg#alert"/></svg></span>',
      `<p class="journal-notice-title" id="${page}-journal-notice-title" data-i18n="journal.unreadableTitle">`,
      '<p class="journal-notice-text" data-i18n="journal.unreadableBody">',
      '<button type="button" class="btn btn-secondary btn-small" data-journal-action="start-new" data-i18n="journal.startNew">',
      '<button type="button" class="btn btn-ghost btn-small" data-journal-action="open-folder" data-i18n="journal.openDataFolder">',
      '<button type="button" class="btn btn-link" data-journal-action="report" data-i18n="login.reportProblem">'
    ]) {
      assert.ok(notice.includes(part), `${page}: ${part}`);
    }
    assert.equal(notice.split('<button').length - 1, 3, page);
  }

  // A plate like the toast's, with no side stripe.
  const plate = css.slice(css.indexOf('\n.journal-notice {'), css.indexOf('}', css.indexOf('\n.journal-notice {')));
  assert.ok(plate.includes('background: linear-gradient(180deg, var(--plate-raised), var(--plate));'));
  assert.ok(plate.includes('border: 1px solid var(--line);'));
  assert.ok(plate.includes('border-radius: var(--bevel);'));
  for (const rule of css.match(/\.journal-notice[^{]*\{[^}]*\}/g)) {
    assert.doesNotMatch(rule, /border-left|box-shadow:\s*inset \d/, rule);
  }
});

test('the journal notice shows on both pages and is read out once each time it appears', () => {
  const notices = [createDatasetElement(['hidden']), createDatasetElement(['hidden'])];
  const announced = [];
  const state = { journalUnreadable: false };
  const context = loadFunctions(['setJournalUnreadable'], {
    state,
    elements: { journalNotices: notices },
    window: { t: (key) => key },
    announceStatus: (text) => announced.push(text)
  });
  const shown = () => notices.map((notice) => !notice.classList.contains('hidden'));

  context.setJournalUnreadable(true);
  assert.deepEqual(shown(), [true, true]);
  assert.equal(state.journalUnreadable, true);
  assert.deepEqual(announced, ['journal.unreadableTitle. journal.unreadableBody']);
  // A refresh that finds the journal still unreadable says nothing new.
  context.setJournalUnreadable(true);
  assert.equal(announced.length, 1);
  context.setJournalUnreadable(false);
  assert.deepEqual(shown(), [false, false]);
  assert.equal(state.journalUnreadable, false);
  context.setJournalUnreadable(true);
  assert.equal(announced.length, 2);
});

test('the journal notice follows only main\'s flag and keeps its state when the check fails', async () => {
  const notices = [createDatasetElement(['hidden']), createDatasetElement(['hidden'])];
  const announced = [];
  let reply = null;
  const context = loadFunctions(['setJournalUnreadable', 'loadJournalStatus'], {
    state: { journalUnreadable: false },
    elements: { journalNotices: notices },
    window: { t: (key) => `en:${key}`, electronAPI: { getJournalStatus: () => reply() } },
    announceStatus: (text) => announced.push(text)
  });
  const shown = () => notices.map((notice) => !notice.classList.contains('hidden'));

  reply = async () => ({ unreadable: true, path: 'C:\\Users\\someone\\journal.json' });
  await context.loadJournalStatus();
  assert.deepEqual(shown(), [true, true]);
  assert.deepEqual(announced, ['en:journal.unreadableTitle. en:journal.unreadableBody']);

  reply = async () => ({ unreadable: 'yes' });
  await context.loadJournalStatus();
  assert.deepEqual(shown(), [false, false]);

  reply = async () => ({ unreadable: true });
  await context.loadJournalStatus();
  reply = async () => {
    throw new Error("Error invoking remote method 'get-journal-status': Error: C:\\Users\\someone");
  };
  await assert.doesNotReject(() => context.loadJournalStatus());
  assert.deepEqual(shown(), [true, true]);
  assert.equal(announced.length, 2);
  assert.ok(!JSON.stringify(announced).includes('someone'));
});

// Records the busy, session, focus, toast and refresh calls of Start a new journal in one list, so tests can check their
// order.
function loadStartNewJournalContext(startNewJournal, { sessionsActive = false, mapRunning = false } = {}) {
  const events = [];
  const toasts = [];
  const notices = [createDatasetElement(), createDatasetElement()];
  const state = { journalUnreadable: true, currentSession: mapRunning ? { id: 's1', status: 'active' } : null };
  const focusable = (name) => ({ focus: () => events.push(`focus:${name}`) });
  const button = { disabled: false, focus: () => events.push('focus:button') };
  const context = loadFunctions(['setJournalUnreadable', 'handleStartNewJournal'], {
    state,
    elements: {
      journalNotices: notices,
      startSessionBtn: focusable('startSessionBtn'),
      endSessionBtn: focusable('endSessionBtn'),
      sessionFilter: focusable('sessionFilter')
    },
    window: { t: (key) => key, electronAPI: { startNewJournal } },
    setButtonBusy: (target, busy) => {
      assert.equal(target, button);
      target.disabled = busy;
      events.push(`busy:${busy}`);
    },
    // Start map shows while no map runs, End map while one does.
    updateActiveSessionUI: () => events.push(`session:${state.currentSession ? 'active' : 'none'}`),
    announceStatus: () => assert.fail('the notice was read out while it went away'),
    isPageActive: (page) => sessionsActive && page === 'sessions',
    showToast: (...args) => {
      toasts.push(args);
      events.push('toast');
    },
    refreshTrackerData: async (options) => {
      events.push(`refresh:${JSON.stringify(options)}`);
    }
  });
  const shown = () => notices.map((notice) => !notice.classList.contains('hidden'));
  return { context, button, state, events, toasts, shown };
}

test('Start a new journal reports each outcome with a static text and moves focus before the toast', async () => {
  const refresh = 'refresh:{"includeSessions":true}';
  const failedToast = ['toast.journalStartFailed', 'toast.logsClearFailed', 'error'];
  const startedToast = [['toast.journalStarted', '', 'success']];
  const readableToast = [['toast.journalReadable', '', 'info']];
  const outcomes = [
    ['started', async () => ({ started: true }), {}, startedToast, ['session:none', 'focus:startSessionBtn'], true],
    // Main dropped the old journal's map, so the Dashboard drops it too and Start map shows for the focus to land on.
    ['started mid-map', async () => ({ started: true }), { mapRunning: true }, startedToast, ['session:none', 'focus:startSessionBtn'], true],
    ['started on Sessions', async () => ({ started: true }), { sessionsActive: true }, startedToast, ['session:none', 'focus:sessionFilter'], true],
    ['readable', async () => ({ started: false, reason: 'readable' }), {}, readableToast, ['focus:startSessionBtn'], true],
    // The map still runs in main, so Start map is hidden and End map takes the focus.
    ['readable mid-map', async () => ({ started: false, reason: 'readable' }), { mapRunning: true }, readableToast, ['focus:endSessionBtn'], true],
    ['busy', async () => ({ started: false, reason: 'busy' }), {}, [['toast.dataActionBusy', '', 'warning']], [], false],
    ['canceled', async () => ({ started: false, reason: 'canceled' }), { mapRunning: true }, [], [], false],
    ['failed', async () => ({ started: false, reason: 'failed' }), { mapRunning: true }, [failedToast], [], true],
    ['no reply', async () => undefined, {}, [failedToast], [], true],
    ['rejected', async () => {
      throw new Error("Error invoking remote method 'start-new-journal': Error: EPERM: rename 'C:\\Users\\someone\\journal.json'");
    }, {}, [failedToast], [], true]
  ];

  for (const [outcome, startNewJournal, options, expectedToasts, noticeGone, refreshed] of outcomes) {
    const run = loadStartNewJournalContext(startNewJournal, options);

    await run.context.handleStartNewJournal({ currentTarget: run.button });

    assert.deepEqual(run.toasts, expectedToasts, outcome);
    assert.ok(!JSON.stringify(run.toasts).includes('someone'), outcome);
    // The native confirm took focus; it comes back to the button, and moves on to a control the page shows before the
    // toast when the notice goes away, so the toast is not cut off.
    assert.deepEqual(run.events, [
      'busy:true',
      'busy:false',
      'focus:button',
      ...noticeGone,
      ...expectedToasts.map(() => 'toast'),
      ...(refreshed ? [refresh] : [])
    ], outcome);
    assert.equal(run.button.disabled, false, outcome);
    // Only main's answer that the journal is set aside or readable hides the notice at once; after a failure the
    // refresh asks main again.
    assert.deepEqual(run.shown(), noticeGone.length ? [false, false] : [true, true], outcome);
    assert.equal(run.state.journalUnreadable, !noticeGone.length, outcome);
    const mapKept = options.mapRunning && !outcome.startsWith('started');
    assert.deepEqual(run.state.currentSession, mapKept ? { id: 's1', status: 'active' } : null, outcome);
  }
});

test('the journal notice\'s Open data folder busies and refocuses its own button', async () => {
  const events = [];
  const dataTabButton = { focus: () => events.push('focus:dataTab') };
  const noticeButton = { focus: () => events.push('focus:notice') };
  const event = { currentTarget: noticeButton };
  const context = loadFunctions(['handleOpenDataFolder'], {
    elements: { openDataFolderBtn: dataTabButton },
    window: {
      t: (key) => key,
      electronAPI: {
        openDataFolder: async () => {
          // As in the browser: once the click has been handled, the event no longer names its button.
          event.currentTarget = null;
          return { opened: true };
        }
      }
    },
    setButtonBusy: (target, busy) => events.push(`${target === noticeButton ? 'notice' : 'dataTab'}:${busy}`),
    showToast: () => assert.fail('a toast for a folder that opened')
  });

  await context.handleOpenDataFolder(event);

  assert.deepEqual(events, ['notice:true', 'notice:false', 'focus:notice']);
});

test('the journal notice\'s Report a problem opens the report in Settings > About and builds it once', () => {
  for (const aboutSelected of [false, true]) {
    const calls = [];
    const context = loadFunctions(['openAboutBugReport'], {
      elements: {
        settingsAboutTab: createDatasetElement(aboutSelected ? ['active'] : []),
        bugReportPreview: { focus: () => calls.push('focus') }
      },
      navigateTo: (page) => calls.push(['navigateTo', page]),
      showSettingsTab: (tab) => calls.push(['showSettingsTab', tab])
    });

    context.openAboutBugReport();

    // navigateTo builds the report of an About tab that is still selected; otherwise selecting About builds it.
    assert.deepEqual(calls, [
      ['navigateTo', 'settings'],
      ...(aboutSelected ? [] : [['showSettingsTab', 'about']]),
      'focus'
    ], `About selected: ${aboutSelected}`);
  }
});

test('the journal notice buttons are wired, and every tracker refresh checks the journal again', () => {
  const source = fs.readFileSync(appJsPath, 'utf8');
  const listeners = extractFunctionSource(source, 'setupEventListeners');

  for (const line of [
    "notice.querySelector('[data-journal-action=\"start-new\"]').addEventListener('click', handleStartNewJournal);",
    "notice.querySelector('[data-journal-action=\"open-folder\"]').addEventListener('click', handleOpenDataFolder);",
    "notice.querySelector('[data-journal-action=\"report\"]').addEventListener('click', openAboutBugReport);"
  ]) {
    assert.ok(listeners.includes(line), line);
  }
  assert.ok(listeners.includes('elements.journalNotices.forEach((notice) => {'));
  // Startup, sign-in, a profile change, Dashboard visits and the refresh after a new journal all run through here.
  assert.ok(extractFunctionSource(source, 'refreshTrackerData').includes('loadJournalStatus()'));
  assert.ok(source.includes("journalNotices: document.querySelectorAll('.journal-notice'),"));
});

test('a journal main cannot read reaches the map, run and list messages as its own reason', () => {
  const context = loadErrorHelpers();

  // Main's message is the code; Electron wraps it on the way.
  for (const channel of ['start-session', 'end-session', 'get-session-details', 'update-session-details', 'get-sessions', 'get-recent-loot']) {
    assert.equal(
      context.getUserFacingErrorMessage(new Error(`Error invoking remote method '${channel}': Error: JOURNAL_UNREADABLE`), 'toast.tryAgain'),
      'errors.journalUnreadable',
      channel
    );
  }
  // The Sessions list and the Recent loot card leave the reason to the notice by this exact message.
  for (const channel of ['get-sessions', 'get-recent-loot']) {
    assert.equal(
      context.extractRawErrorMessage(new Error(`Error invoking remote method '${channel}': Error: JOURNAL_UNREADABLE`)),
      'JOURNAL_UNREADABLE',
      channel
    );
  }
  // The parse error quotes the file, so its text never reaches a toast.
  assert.equal(
    context.getUserFacingErrorMessage(
      new Error('Error invoking remote method \'get-sessions\': SyntaxError: Unexpected token \'S\', "{"sessions": [ {"id": "a", "mapName": "Secret Map", "... is not valid JSON'),
      'toast.tryAgain'
    ),
    'toast.tryAgain'
  );
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
