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
    getAccountStateModel: () => ({
      deriveAccountState: require('../src/modules/accountStateModel').deriveAccountState,
      createAccountStateCache: require('../src/modules/accountStateModel').createAccountStateCache
    })
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

test('renderer logout clears normalized account state', async () => {
  const calls = [];
  const state = {
    currentUser: { username: 'RangerMain' },
    currentSession: { id: 'session-1' },
    sessions: [{ id: 'session-1' }],
    mapResults: [{ id: 'map-result-1' }],
    recentLoot: [{ id: 'loot-1' }],
    poeLink: { linked: true },
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
    window: {
      electronAPI: {
        logout: async () => calls.push(['logout'])
      }
    },
    closeSessionDrawer: () => calls.push(['closeSessionDrawer']),
    renderUserIdentity: () => calls.push(['renderUserIdentity']),
    resetDashboardSummary: () => calls.push(['resetDashboardSummary']),
    updateActiveSessionUI: () => calls.push(['updateActiveSessionUI']),
    renderSessionsList: () => calls.push(['renderSessionsList']),
    renderRecentLoot: () => calls.push(['renderRecentLoot']),
    renderPoeLinkStatus: () => calls.push(['renderPoeLinkStatus']),
    showLoginModal: () => calls.push(['showLoginModal'])
  });

  await context.handleLogout();

  assert.equal(state.account, null);
  assert.equal(state.currentUser, null);
  assert.equal(Array.isArray(state.mapResults), true);
  assert.equal(state.mapResults.length, 0);
  assert.equal(stashState.beforeSnapshotId, null);
  assert.equal(stashState.afterSnapshotId, null);
  assert.equal(stashState.beforeSnapshot, null);
  assert.equal(stashState.afterSnapshot, null);
  assert.equal(stashState.mapResultContext, null);
  assert.equal(stashState.lastMapResult, null);
  assert.equal(stashState.pricesSynced, false);
  assert.deepEqual(calls.map(([name]) => name), [
    'clearActiveCharacterRefreshTimers',
    'logout',
    'closeSessionDrawer',
    'renderUserIdentity',
    'resetDashboardSummary',
    'updateActiveSessionUI',
    'renderSessionsList',
    'renderRecentLoot',
    'renderPoeLinkStatus',
    'showLoginModal'
  ]);
});
