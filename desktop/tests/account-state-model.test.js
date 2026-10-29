const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ACCOUNT_MODEL_REQUEST = '../src/modules/accountStateModel';
const desktopDir = path.resolve(__dirname, '..');
const appJsPath = path.join(desktopDir, 'src', 'app.js');

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadAccountStateModel() {
  try {
    return require(ACCOUNT_MODEL_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, ACCOUNT_MODEL_REQUEST)) {
      throw error;
    }

    return { __loadError: error };
  }
}

function getAccountStateModelExport(exportName) {
  const accountStateModel = loadAccountStateModel();

  if (accountStateModel.__loadError) {
    const { code, message } = accountStateModel.__loadError;
    assert.fail(
      `Expected desktop/src/modules/accountStateModel.js to exist and export ${exportName}. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof accountStateModel[exportName],
    'function',
    `Expected accountStateModel.${exportName} to be a function`
  );

  return accountStateModel[exportName];
}

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

test('account state model picks the selected character and formats summary fields', () => {
  const deriveAccountState = getAccountStateModelExport('deriveAccountState');

  const result = deriveAccountState({
    accountName: 'KocaGyVeMasha',
    selectedCharacterId: 'char-2',
    characters: [
      { id: 'char-1', name: 'AltOne', level: 91, class: 'Monk', ascendancy: 'Invoker', league: 'Standard' },
      { id: 'char-2', name: 'MainOne', level: 96, class: 'Shaman', ascendancy: 'Ritualist', league: 'Fate of the Vaal' }
    ]
  });

  assert.equal(result.selectedCharacter.name, 'MainOne');
  assert.equal(result.summary.league, 'Fate of the Vaal');
  assert.equal(result.summary.level, 96);
});

test('account state model falls back cleanly when no character list is available', () => {
  const deriveAccountState = getAccountStateModelExport('deriveAccountState');

  const result = deriveAccountState({ accountName: 'Solo', characters: [] });

  assert.equal(result.selectedCharacter, null);
  assert.equal(result.summary.status, 'no_character_selected');
});

test('account state model uses selected character payload when list cannot resolve selection', () => {
  const deriveAccountState = getAccountStateModelExport('deriveAccountState');

  const result = deriveAccountState({
    accountName: 'Solo',
    selectedCharacterId: 'char-2',
    selectedCharacter: {
      id: 'char-2',
      name: 'DetachedMain',
      level: '94',
      class: 'Mercenary',
      ascendancy: 'Witchhunter',
      league: 'Fate of the Vaal'
    },
    characters: [
      { id: 'char-1', name: 'ListedAlt', level: 12, class: 'Warrior', league: 'Standard' }
    ]
  });

  assert.equal(result.selectedCharacter.name, 'DetachedMain');
  assert.equal(result.summary.level, 94);
  assert.equal(result.summary.className, 'Mercenary');
});

test('account state model selects the active game character from poe1 and poe2 pools', () => {
  const deriveAccountState = getAccountStateModelExport('deriveAccountState');

  const result = deriveAccountState({
    accountName: 'HybridAccount',
    activePoeVersion: 'poe2',
    selectedCharacterByGame: {
      poe1: 'poe1-main',
      poe2: 'poe2-main'
    },
    characters: [
      { id: 'poe1-main', name: 'PoeOneRanger', level: 95, class: 'Ranger', league: 'Mercenaries', poeVersion: 'poe1' },
      { id: 'poe2-main', name: 'PoeTwoShaman', level: 96, class: 'Shaman', league: 'Fate of the Vaal', poeVersion: 'poe2' }
    ]
  });

  assert.equal(result.selectedCharacter.name, 'PoeTwoShaman');
  assert.equal(result.summary.poeVersion, 'poe2');
  assert.equal(result.summary.className, 'Shaman');
  assert.equal(result.charactersByGame.poe1[0].name, 'PoeOneRanger');
  assert.equal(result.charactersByGame.poe2[0].name, 'PoeTwoShaman');
});

test('refreshed poe2 payload prefers selectedCharacterByGame for the active game over stale selection fields', () => {
  const deriveAccountState = getAccountStateModelExport('deriveAccountState');

  const result = deriveAccountState({
    accountName: 'Esquetta#4179',
    activePoeVersion: 'poe2',
    selectedCharacterId: 'char-koca',
    selectedCharacterByGame: { poe2: 'char-kellee' },
    selectedCharacter: {
      id: 'char-koca',
      name: 'KocaAyVeMasha',
      level: 96,
      class: 'Druid2',
      league: 'Fate of the Vaal',
      poeVersion: 'poe2'
    },
    cachedAccountState: {
      selectedCharacterByGame: { poe2: 'char-koca' }
    },
    characters: [
      { id: 'char-koca', name: 'KocaAyVeMasha', level: 96, class: 'Druid2', league: 'Fate of the Vaal', poeVersion: 'poe2' },
      { id: 'char-kellee', name: 'KELLEE', level: 92, class: 'Monk2', league: 'Standard', poeVersion: 'poe2' }
    ]
  });

  assert.equal(result.selectedCharacter.id, 'char-kellee');
  assert.equal(result.summary.name, 'KELLEE');
});

test('account state model falls back to first character for active game when no selected id exists', () => {
  const deriveAccountState = getAccountStateModelExport('deriveAccountState');

  const result = deriveAccountState({
    accountName: 'HybridAccount',
    activePoeVersion: 'poe2',
    characters: [
      { id: 'poe1-main', name: 'PoeOneRanger', level: 95, class: 'Ranger', league: 'Mercenaries', poeVersion: 'poe1' },
      { id: 'poe2-alt', name: 'PoeTwoDruid', level: 80, class: 'Druid', league: 'Fate of the Vaal', poeVersion: 'poe2' }
    ]
  });

  assert.equal(result.selectedCharacter.name, 'PoeTwoDruid');
  assert.equal(result.summary.poeVersion, 'poe2');
});

test('account state model uses last known character cache when live payload has no characters', () => {
  const deriveAccountState = getAccountStateModelExport('deriveAccountState');

  const result = deriveAccountState({
    accountName: 'HybridAccount',
    activePoeVersion: 'poe2',
    characters: [],
    cachedAccountState: {
      accountName: 'HybridAccount',
      selectedCharacterByGame: {
        poe2: 'cached-shaman'
      },
      characters: [
        { id: 'cached-shaman', name: 'CachedShaman', level: 96, class: 'Shaman', league: 'Fate of the Vaal', poeVersion: 'poe2' }
      ]
    }
  });

  assert.equal(result.selectedCharacter.name, 'CachedShaman');
  assert.equal(result.summary.status, 'ready');
  assert.equal(result.summary.poeVersion, 'poe2');
});

test('account state model creates a last known cache from current account state', () => {
  const deriveAccountState = getAccountStateModelExport('deriveAccountState');
  const createAccountStateCache = getAccountStateModelExport('createAccountStateCache');
  const accountState = deriveAccountState({
    accountName: 'HybridAccount',
    activePoeVersion: 'poe2',
    characters: [
      { id: 'poe1-main', name: 'PoeOneRanger', level: 95, class: 'Ranger', league: 'Mercenaries', poeVersion: 'poe1' },
      { id: 'poe2-main', name: 'PoeTwoShaman', level: 96, class: 'Shaman', league: 'Fate of the Vaal', poeVersion: 'poe2' }
    ]
  });

  const cache = createAccountStateCache(accountState);

  assert.equal(cache.accountName, 'HybridAccount');
  assert.equal(cache.selectedCharacterByGame.poe2, 'poe2-main');
  assert.equal(cache.charactersByGame.poe2[0].name, 'PoeTwoShaman');
});

test('account state model prefers the character confirmed in game over the server default', () => {
  const deriveAccountState = getAccountStateModelExport('deriveAccountState');
  const characters = [
    { id: 'poe2-high', name: 'HighLevelDeadeye', level: 94, class: 'Deadeye', league: 'Standard', poeVersion: 'poe2' },
    { id: 'poe2-alt', name: 'AltShaman', level: 88, class: 'Shaman', league: 'Standard', poeVersion: 'poe2' }
  ];

  const confirmed = deriveAccountState({
    activePoeVersion: 'poe2',
    selectedCharacterByGame: { poe2: 'poe2-high' },
    characters,
    cachedAccountState: { confirmedCharacterByGame: { poe2: 'poe2-alt', poe1: 'poe1-gone' } }
  });
  assert.equal(confirmed.selectedCharacter.id, 'poe2-alt');
  assert.deepEqual(confirmed.confirmedCharacterByGame, { poe1: 'poe1-gone', poe2: 'poe2-alt' });

  const deleted = deriveAccountState({
    activePoeVersion: 'poe2',
    selectedCharacterByGame: { poe2: 'poe2-high' },
    characters,
    cachedAccountState: { confirmedCharacterByGame: { poe2: 'poe2-deleted' } }
  });
  assert.equal(deleted.selectedCharacter.id, 'poe2-high');
});

test('account state cache keeps the confirmed character for each game', () => {
  const deriveAccountState = getAccountStateModelExport('deriveAccountState');
  const createAccountStateCache = getAccountStateModelExport('createAccountStateCache');
  const accountState = deriveAccountState({
    activePoeVersion: 'poe2',
    characters: [
      { id: 'poe1-main', name: 'PoeOneRanger', level: 95, class: 'Ranger', poeVersion: 'poe1' },
      { id: 'poe2-main', name: 'PoeTwoShaman', level: 96, class: 'Shaman', poeVersion: 'poe2' }
    ],
    cachedAccountState: { confirmedCharacterByGame: { poe1: 'poe1-main', poe2: 'poe2-main' } }
  });

  assert.deepEqual(createAccountStateCache(accountState).confirmedCharacterByGame, { poe1: 'poe1-main', poe2: 'poe2-main' });
});

test('account state model finds only the account own characters by log name', () => {
  const deriveAccountState = getAccountStateModelExport('deriveAccountState');
  const findCharacterByName = getAccountStateModelExport('findCharacterByName');
  const accountState = deriveAccountState({
    activePoeVersion: 'poe2',
    characters: [
      { id: 'poe1-main', name: 'SameNameRanger', level: 95, class: 'Ranger', poeVersion: 'poe1' },
      { id: 'poe2-main', name: 'PoeTwoShaman', level: 96, class: 'Shaman', poeVersion: 'poe2' }
    ]
  });

  assert.equal(findCharacterByName(accountState, 'poe2', 'PoeTwoShaman').id, 'poe2-main');
  assert.equal(findCharacterByName(accountState, 'poe2', 'PartyFriend'), null);
  assert.equal(findCharacterByName(accountState, 'poe2', 'SameNameRanger'), null);
  assert.equal(findCharacterByName(null, 'poe2', 'PoeTwoShaman'), null);
});

test('renderer setCurrentUser stores normalized account state for later dashboard consumption', () => {
  const calls = [];
  const persistedSettings = [];
  const state = {
    settings: {
      lastKnownAccountState: {
        accountName: 'CachedAccount',
        selectedCharacterByGame: { poe2: 'cached-shaman' },
        characters: [
          { id: 'cached-shaman', name: 'CachedShaman', level: 96, class: 'Shaman', league: 'Fate of the Vaal', poeVersion: 'poe2' }
        ]
      }
    },
    detectedGameVersion: 'poe2'
  };
  const context = loadFunctions(['persistLastKnownAccountState', 'refreshAccountStateFromCurrentUser', 'setCurrentUser'], {
    state,
    normalizePoeVersion: (value) => value,
    window: {
      electronAPI: {
        setSettings: async (settings) => {
          persistedSettings.push(settings);
        }
      }
    },
    renderUserIdentity: () => calls.push(['renderUserIdentity']),
    getAccountStateModel: () => require('../src/modules/accountStateModel')
  });

  context.setCurrentUser({
    username: 'RangerMain',
    accountName: 'KocaGyVeMasha',
    characters: []
  });

  assert.equal(state.account.accountName, 'KocaGyVeMasha');
  assert.equal(state.account.summary.name, 'CachedShaman');
  assert.equal(state.account.summary.poeVersion, 'poe2');
  assert.deepEqual(calls, [['renderUserIdentity']]);
  assert.equal(persistedSettings.length, 1);
  assert.equal(persistedSettings[0].lastKnownAccountState.selectedCharacterByGame.poe2, 'cached-shaman');
});

test('renderer uses the last detected game for cached dashboard character when no game is active', () => {
  const persistedSettings = [];
  const state = {
    settings: {
      poeVersion: 'poe1',
      lastDetectedPoeVersion: 'poe2',
      lastKnownAccountState: {
        accountName: 'CachedAccount',
        selectedCharacterByGame: { poe2: 'cached-shaman' },
        characters: [
          { id: 'cached-ranger', name: 'CachedRanger', level: 94, class: 'Ranger', league: 'Mercenaries', poeVersion: 'poe1' },
          { id: 'cached-shaman', name: 'CachedShaman', level: 96, class: 'Shaman', league: 'Fate of the Vaal', poeVersion: 'poe2' }
        ]
      }
    },
    detectedGameVersion: null
  };
  const context = loadFunctions(['persistLastKnownAccountState', 'refreshAccountStateFromCurrentUser', 'setCurrentUser'], {
    state,
    normalizePoeVersion: (value) => value === 'poe1' || value === 'poe2' ? value : null,
    window: {
      electronAPI: {
        setSettings: async (settings) => {
          persistedSettings.push(settings);
        }
      }
    },
    renderUserIdentity: () => {},
    getAccountStateModel: () => require('../src/modules/accountStateModel')
  });

  context.setCurrentUser({
    username: 'RangerMain',
    accountName: 'KocaGyVeMasha',
    characters: []
  });

  assert.equal(state.account.summary.name, 'CachedShaman');
  assert.equal(state.account.summary.poeVersion, 'poe2');
  assert.equal(state.account.selectedCharacter.id, 'cached-shaman');
  assert.equal(persistedSettings.length, 1);
});

function loadCharacterSessionRenderer({ lastKnownAccountState, poeDeviceConnected = false, deviceCharacters = null } = {}) {
  const calls = [];
  const persistedSettings = [];
  const timers = [];
  const deviceRequests = [];
  const accountStateModel = require('../src/modules/accountStateModel');
  const state = {
    currentUser: {
      accountName: 'HybridAccount',
      selectedCharacterByGame: { poe2: 'poe2-high' },
      characters: [
        { id: 'poe1-main', name: 'PoeOneRanger', level: 95, class: 'Ranger', poeVersion: 'poe1' },
        { id: 'poe2-high', name: 'HighLevelDeadeye', level: 94, class: 'Deadeye', poeVersion: 'poe2' },
        { id: 'poe2-alt', name: 'AltShaman', level: 88, class: 'Shaman', poeVersion: 'poe2' }
      ]
    },
    settings: { lastKnownAccountState },
    detectedGameVersion: 'poe2',
    characterSession: null,
    deviceCharactersByGame: {},
    poeDeviceConnected
  };
  const overlayCharacters = [];
  const characterPrompts = [];
  const context = loadFunctions([
    'persistLastKnownAccountState',
    'refreshAccountStateFromCurrentUser',
    'syncOverlayCharacter',
    'handleGameSessionEntered',
    'handleCharacterChosen',
    'handleCharacterLogLine',
    'refreshDeviceCharacters',
    'confirmActiveCharacter'
  ], {
    state,
    normalizePoeVersion: (value) => value === 'poe1' || value === 'poe2' ? value : null,
    characterReconcileTimer: null,
    CHARACTER_RECONCILE_DELAY_MS: 660000,
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
    clearTimeout: () => {},
    window: {
      electronAPI: {
        setSettings: async (settings) => {
          persistedSettings.push(settings);
        },
        setOverlayCharacter: async (character) => {
          overlayCharacters.push(character);
        },
        showCharacterPromptOverlay: async (prompt) => {
          characterPrompts.push(prompt);
        },
        getPoeDeviceCharacters: async (poeVersion) => {
          deviceRequests.push(poeVersion);
          return { connected: true, characters: deviceCharacters };
        }
      }
    },
    renderPoeLinkStatus: () => {},
    renderCharacterSummaryCard: () => calls.push('renderCharacterSummaryCard'),
    refreshRendererOverlayState: () => calls.push('refreshRendererOverlayState'),
    getAccountStateModel: () => accountStateModel
  });

  context.refreshAccountStateFromCurrentUser();
  persistedSettings.length = 0;
  overlayCharacters.length = 0;
  return { context, state, calls, persistedSettings, overlayCharacters, characterPrompts, timers, deviceRequests };
}

const DEVICE_POE2_CHARACTERS = [
  { id: 'poe2-high', name: 'HighLevelDeadeye', level: 94, class: 'Deadeye', poeVersion: 'poe2', current: false },
  { id: 'poe2-alt', name: 'AltShaman', level: 89, class: 'Shaman', poeVersion: 'poe2', current: true },
  { id: 'poe2-new', name: 'FreshMonk', level: 2, class: 'Monk', poeVersion: 'poe2', current: false }
];

test('renderer adopts the GGG current flag only when it moved and this Play is not confirmed', async () => {
  const { context, state } = loadCharacterSessionRenderer({
    lastKnownAccountState: { confirmedCharacterByGame: { poe2: 'poe2-high' }, apiCurrentByGame: { poe2: 'poe2-high' } },
    poeDeviceConnected: true,
    deviceCharacters: DEVICE_POE2_CHARACTERS
  });

  assert.equal(await context.refreshDeviceCharacters('poe2'), true);
  assert.equal(state.account.summary.name, 'AltShaman');
  assert.equal(state.account.summary.level, 89);
  assert.equal(state.settings.lastKnownAccountState.apiCurrentByGame.poe2, 'poe2-alt');

  // Same flag again: the player's own later pick stays.
  context.handleCharacterChosen({ poeVersion: 'poe2', characterId: 'poe2-high' });
  await context.refreshDeviceCharacters('poe2');
  assert.equal(state.account.summary.name, 'HighLevelDeadeye');
});

test('renderer keeps a confirmed Play when GGG still reports the previous character', async () => {
  const { context, state } = loadCharacterSessionRenderer({
    lastKnownAccountState: { apiCurrentByGame: { poe2: 'poe2-high' } },
    poeDeviceConnected: true,
    deviceCharacters: DEVICE_POE2_CHARACTERS
  });

  context.handleGameSessionEntered({ poeVersion: 'poe2' });
  context.handleCharacterChosen({ poeVersion: 'poe2', characterId: 'poe2-high' });
  await context.refreshDeviceCharacters('poe2');

  assert.equal(state.account.summary.name, 'HighLevelDeadeye');
});

test('renderer reconciles an unconfirmed Play with GGG eleven minutes later', async () => {
  const { context, state, timers, deviceRequests } = loadCharacterSessionRenderer({
    lastKnownAccountState: { confirmedCharacterByGame: { poe2: 'poe2-high' }, apiCurrentByGame: { poe2: 'poe2-high' } },
    poeDeviceConnected: true,
    deviceCharacters: DEVICE_POE2_CHARACTERS
  });

  context.handleGameSessionEntered({ poeVersion: 'poe2' });
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 660000);
  assert.deepEqual(deviceRequests, []);

  timers[0].callback();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(deviceRequests, ['poe2']);
  assert.equal(state.account.summary.name, 'AltShaman');
});

test('renderer fetches once for a level 2 character it does not know yet', async () => {
  const { context, state, deviceRequests } = loadCharacterSessionRenderer({
    poeDeviceConnected: true,
    deviceCharacters: DEVICE_POE2_CHARACTERS.map((character) => ({ ...character, current: false }))
  });

  await context.handleCharacterLogLine({ poeVersion: 'poe2', name: 'PartyFriend', kind: 'level_up', level: 40 });
  assert.deepEqual(deviceRequests, []);

  await context.handleCharacterLogLine({ poeVersion: 'poe2', name: 'FreshMonk', kind: 'level_up', level: 2 });
  assert.deepEqual(deviceRequests, ['poe2']);
  assert.equal(state.account.summary.name, 'FreshMonk');
});

test('renderer keeps the last confirmed character on Play and marks the session unconfirmed', () => {
  const { context, state, calls } = loadCharacterSessionRenderer({
    lastKnownAccountState: { confirmedCharacterByGame: { poe2: 'poe2-alt' } }
  });

  context.handleGameSessionEntered({ poeVersion: 'poe2' });

  assert.deepEqual({ ...state.characterSession }, { poeVersion: 'poe2', confirmed: false });
  assert.equal(state.account.summary.name, 'AltShaman');
  assert.deepEqual(calls, ['renderCharacterSummaryCard', 'refreshRendererOverlayState']);
});

test('renderer switches to and remembers an own character named in Client.txt', () => {
  const { context, state, calls, persistedSettings } = loadCharacterSessionRenderer();
  assert.equal(state.account.summary.name, 'HighLevelDeadeye');

  context.handleGameSessionEntered({ poeVersion: 'poe2' });
  context.handleCharacterLogLine({ poeVersion: 'poe2', name: 'AltShaman', kind: 'level_up' });

  assert.equal(state.account.summary.name, 'AltShaman');
  assert.equal(state.characterSession.confirmed, true);
  assert.equal(calls.length, 4);
  assert.deepEqual(
    { ...persistedSettings.at(-1).lastKnownAccountState.confirmedCharacterByGame },
    { poe2: 'poe2-alt' }
  );
});

test('renderer ignores party members and other-game names from Client.txt', () => {
  const { context, state, calls, persistedSettings } = loadCharacterSessionRenderer();

  context.handleCharacterLogLine({ poeVersion: 'poe2', name: 'PartyFriend', kind: 'slain' });
  context.handleCharacterLogLine({ poeVersion: 'poe2', name: 'PoeOneRanger', kind: 'level_up' });

  assert.equal(state.account.summary.name, 'HighLevelDeadeye');
  assert.deepEqual(calls, []);
  assert.deepEqual(persistedSettings, []);
});

test('renderer asks in the overlay on Play and sends the card character to the overlay', () => {
  const { context, overlayCharacters, characterPrompts } = loadCharacterSessionRenderer({
    lastKnownAccountState: { confirmedCharacterByGame: { poe2: 'poe2-alt' } }
  });

  context.handleGameSessionEntered({ poeVersion: 'poe2' });

  assert.equal(overlayCharacters.at(-1).name, 'AltShaman');
  assert.equal(characterPrompts.length, 1);
  assert.equal(characterPrompts[0].poeVersion, 'poe2');
  assert.equal(characterPrompts[0].selectedId, 'poe2-alt');
  assert.deepEqual([...characterPrompts[0].characters].map((character) => character.id), ['poe2-high', 'poe2-alt']);
});

test('renderer confirms a character picked in the overlay or on the card, but only an own one', () => {
  const { context, state, persistedSettings, overlayCharacters } = loadCharacterSessionRenderer();

  context.handleGameSessionEntered({ poeVersion: 'poe2' });
  context.handleCharacterChosen({ poeVersion: 'poe2', characterId: 'someone-else' });
  assert.equal(state.characterSession.confirmed, false);

  context.handleCharacterChosen({ poeVersion: 'poe2', characterId: 'poe2-alt' });
  assert.equal(state.account.summary.name, 'AltShaman');
  assert.equal(state.characterSession.confirmed, true);
  assert.equal(overlayCharacters.at(-1).name, 'AltShaman');
  assert.equal(persistedSettings.at(-1).lastKnownAccountState.confirmedCharacterByGame.poe2, 'poe2-alt');
});

test('renderer logout clears normalized account state', async () => {
  const calls = [];
  const state = {
    currentUser: { username: 'RangerMain' },
    currentSession: { id: 'session-1' },
    sessions: [{ id: 'session-1' }],
    mapResults: [{ id: 'map-result-1' }],
    recentLoot: [{ id: 'loot-1' }],
    poeDeviceConnected: true,
    onlineAccount: { enabled: true, signedIn: true },
    account: {
      accountName: 'KocaGyVeMasha',
      selectedCharacter: { id: 'char-1', name: 'MainOne' }
    }
  };
  const stashState = {
    beforeSnapshotId: 'before',
    afterSnapshotId: 'after',
    beforeSnapshot: { items: [{}] },
    afterSnapshot: { items: [{}] },
    mapResultContext: { farmTypeId: 'ritual' },
    lastMapResult: { id: 'map-result-1' },
    pricesSynced: true
  };
  const context = loadFunctions(['handleLogout'], {
    state,
    stashState,
    clearActiveCharacterRefreshTimers: () => calls.push(['clearActiveCharacterRefreshTimers']),
    clearTimeout: () => {},
    characterReconcileTimer: null,
    window: {
      electronAPI: {
        logout: async () => calls.push(['logout'])
      }
    },
    closeSessionDrawer: () => calls.push(['closeSessionDrawer']),
    renderUserIdentity: () => calls.push(['renderUserIdentity']),
    renderOnlineSettings: () => calls.push(['renderOnlineSettings']),
    resetDashboardSummary: () => calls.push(['resetDashboardSummary']),
    updateActiveSessionUI: () => calls.push(['updateActiveSessionUI']),
    renderSessionsList: () => calls.push(['renderSessionsList']),
    renderRecentLoot: () => calls.push(['renderRecentLoot']),
    setJournalUnreadable: (unreadable) => calls.push(['setJournalUnreadable', unreadable]),
    renderPoeLinkStatus: () => calls.push(['renderPoeLinkStatus']),
    showLoginModal: () => calls.push(['showLoginModal'])
  });

  await context.handleLogout();

  assert.equal(state.account, null);
  assert.equal(state.currentUser, null);
  assert.equal(state.poeDeviceConnected, false);
  assert.equal(Array.isArray(state.mapResults), true);
  assert.equal(state.mapResults.length, 0);
  assert.equal(stashState.beforeSnapshotId, null);
  assert.equal(stashState.afterSnapshotId, null);
  assert.equal(stashState.beforeSnapshot, null);
  assert.equal(stashState.afterSnapshot, null);
  assert.equal(stashState.mapResultContext, null);
  assert.equal(stashState.lastMapResult, null);
  assert.equal(stashState.pricesSynced, false);
  assert.equal(state.onlineAccount.enabled, true);
  assert.equal(state.onlineAccount.signedIn, false);
  assert.deepEqual(calls.map(([name]) => name), [
    'clearActiveCharacterRefreshTimers',
    'logout',
    'closeSessionDrawer',
    'renderUserIdentity',
    'renderOnlineSettings',
    'resetDashboardSummary',
    'updateActiveSessionUI',
    'renderSessionsList',
    'renderRecentLoot',
    'setJournalUnreadable',
    'renderPoeLinkStatus',
    'showLoginModal'
  ]);
  // The journal notice goes with the profile, so the next sign-in reads it out again if its journal is unreadable too.
  assert.deepEqual(calls.find(([name]) => name === 'setJournalUnreadable'), ['setJournalUnreadable', false]);
});
