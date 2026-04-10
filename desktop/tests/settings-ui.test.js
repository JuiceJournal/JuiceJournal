const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const desktopDir = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(desktopDir, 'src', 'index.html');
const appJsPath = path.join(desktopDir, 'src', 'app.js');
const mainJsPath = path.join(desktopDir, 'main.js');
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
      poeLink: null
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
  const context = loadFunctions([
    'renderUserIdentity',
    'renderPoeLinkStatus',
    'applyLocalizedChrome'
  ], {
    elements,
    state: {
      currentUser: { username: 'Esquetta4179' },
      poeLink: {
        linked: true,
        mock: false,
        accountName: 'RangerMain'
      }
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
    syncDesktopCurrencyIcons: () => {},
    refreshTrackerData: async () => {},
    showToast: () => {},
    getUserFacingErrorMessage: (error) => String(error)
  });

  await context.handleSaveSettings();

  assert.equal(savedSettings.length, 1);
  assert.equal(savedSettings[0].poeVersion, 'poe2');
  assert.equal(savedSettings[0].defaultLeaguePoe2, 'Dawn of the Hunt');
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
      poeLink: {
        linked: true,
        mock: true,
        accountName: 'RangerMain'
      }
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
    updateActiveLeagueFieldContext: () => {},
    syncDesktopCurrencyIcons: () => {},
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
  assert.equal(elements.poeLinkStatus.textContent, 'settings.poeLinkedMock');
  assert.equal(elements.poeLinkMode.textContent, 'settings.poeMockMode');
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
  const currencySyncCalls = [];
  const versionButtons = [
    {
      dataset: { version: 'poe1' },
      classList: {
        toggle: (className, isActive) => {
          assert.equal(className, 'active');
          versionButtons[0].active = isActive;
        }
      }
    },
    {
      dataset: { version: 'poe2' },
      classList: {
        toggle: (className, isActive) => {
          assert.equal(className, 'active');
          versionButtons[1].active = isActive;
        }
      }
    }
  ];
  const context = loadFunctions(['syncRendererGameContext'], {
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
    syncDesktopCurrencyIcons: () => {
      currencySyncCalls.push('sync');
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
  assert.deepEqual(currencySyncCalls, ['sync']);
  assert.equal(versionButtons[0].active, true);
  assert.equal(versionButtons[1].active, false);
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
      }
    },
    {
      dataset: { version: 'poe2' },
      classList: {
        toggle: (className, isActive) => {
          assert.equal(className, 'active');
          versionButtons[1].active = isActive;
        }
      }
    }
  ];
  const context = loadFunctions(['syncRendererGameContext'], {
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
    syncDesktopCurrencyIcons: () => {},
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
    }
  });

  context.applyDashboardCapabilities();

  assert.equal(context.state.capabilities.stashTracking.enabled, false);
  assert.equal(stashTrackerCard.dataset.stashCapability, 'unavailable');
  assert.equal(stashCapabilityUnavailable.hidden, false);
  assert.equal(stashCapabilityUnavailable.textContent, 'stash.capabilityUnavailable.poe2');
  assert.deepEqual(buttons.map((button) => button.disabled), [true, true, true, true]);
  assert.equal(context.elements.resetSnapshotsBtn.disabled, true);
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
    syncDesktopCurrencyIcons: () => {},
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
