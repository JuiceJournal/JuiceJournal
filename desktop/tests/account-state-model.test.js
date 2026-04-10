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

test('renderer setCurrentUser stores normalized account state for later dashboard consumption', () => {
  const calls = [];
  const state = {};
  const context = loadFunctions(['setCurrentUser'], {
    state,
    renderUserIdentity: () => calls.push(['renderUserIdentity']),
    getAccountStateModel: () => ({
      deriveAccountState: (payload) => ({
        accountName: payload.accountName,
        selectedCharacter: payload.characters[0],
        summary: { status: 'ready', name: payload.characters[0].name }
      })
    })
  });

  context.setCurrentUser({
    username: 'RangerMain',
    accountName: 'KocaGyVeMasha',
    selectedCharacterId: 'char-1',
    characters: [
      { id: 'char-1', name: 'MainOne', level: 96, class: 'Shaman' }
    ]
  });

  assert.equal(state.account.accountName, 'KocaGyVeMasha');
  assert.equal(state.account.summary.name, 'MainOne');
  assert.deepEqual(calls, [['renderUserIdentity']]);
});

test('renderer logout clears normalized account state', async () => {
  const calls = [];
  const state = {
    currentUser: { username: 'RangerMain' },
    currentSession: { id: 'session-1' },
    sessions: [{ id: 'session-1' }],
    recentLoot: [{ id: 'loot-1' }],
    poeLink: { linked: true },
    account: {
      accountName: 'KocaGyVeMasha',
      selectedCharacter: { id: 'char-1', name: 'MainOne' }
    }
  };
  const context = loadFunctions(['handleLogout'], {
    state,
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
  assert.deepEqual(calls.map(([name]) => name), [
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
