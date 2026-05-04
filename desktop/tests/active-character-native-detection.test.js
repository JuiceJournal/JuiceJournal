const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const desktopDir = path.resolve(__dirname, '..');
const appJsPath = path.join(desktopDir, 'src', 'app.js');

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}`;
  const asyncSignature = `async ${signature}`;
  const asyncStartIndex = source.indexOf(asyncSignature);
  const plainStartIndex = source.indexOf(signature);
  const startIndex = asyncStartIndex !== -1 ? asyncStartIndex : plainStartIndex;

  if (startIndex === -1) {
    assert.fail(`Expected app.js to define ${functionName}()`);
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
    assert.fail(`Unable to locate ${functionName}() body in app.js`);
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

  assert.fail(`Unable to parse ${functionName}() from app.js`);
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

test('renderer applies a high-confidence native poe2 character hint without waiting for api refresh', () => {
  let renderCalls = 0;
  let overlayRefreshCalls = 0;
  const context = loadFunctions(['applyNativeCharacterHint'], {
    state: {
      detectedGameVersion: 'poe2',
      account: {
        activePoeVersion: 'poe2',
        charactersByGame: {
          poe2: [
            { id: 'char-koca', name: 'KocaAyVeMasha', className: 'Druid2', league: 'Fate of the Vaal', poeVersion: 'poe2' },
            { id: 'char-kellee', name: 'KELLEE', className: 'Monk2', league: 'Standard', poeVersion: 'poe2' }
          ]
        },
        summary: { status: 'ready', name: 'KocaAyVeMasha' }
      }
    },
    renderCharacterSummaryCard() {
      renderCalls += 1;
    },
    refreshRendererOverlayState() {
      overlayRefreshCalls += 1;
    }
  });

  const result = context.applyNativeCharacterHint({
    source: 'native-game-info',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    className: 'Monk2',
    league: 'Standard',
    confidence: 'high'
  });

  assert.equal(result, true);
  assert.equal(context.state.account.selectedCharacter.id, 'char-kellee');
  assert.equal(context.state.account.summary.name, 'KELLEE');
  assert.equal(context.state.account.summary.className, 'Monk2');
  assert.equal(context.state.account.summary.league, 'Standard');
  assert.equal(renderCalls, 1);
  assert.equal(overlayRefreshCalls, 1);
});

test('renderer marks a high-confidence native hint as the active-character refresh source and clears the api fallback', () => {
  let clearedRefreshes = 0;
  const context = loadFunctions(['applyNativeCharacterHint'], {
    state: {
      detectedGameVersion: 'poe2',
      activeCharacterRefreshSource: null,
      account: {
        activePoeVersion: 'poe2',
        charactersByGame: {
          poe2: [
            { id: 'char-kellee', name: 'KELLEE', className: 'Monk2', league: 'Standard', poeVersion: 'poe2' }
          ]
        },
        summary: { status: 'ready', name: 'Unknown' }
      }
    },
    renderCharacterSummaryCard() {},
    refreshRendererOverlayState() {},
    clearActiveCharacterRefreshTimers() {
      clearedRefreshes += 1;
    }
  });

  const result = context.applyNativeCharacterHint({
    source: 'native-game-info',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    className: 'Monk2',
    league: 'Standard',
    confidence: 'high'
  });

  assert.equal(result, true);
  assert.equal(context.state.activeCharacterRefreshSource, 'native-high-confidence');
  assert.equal(clearedRefreshes, 1);
});

test('renderer matches quoted native character names to account characters before falling back', () => {
  const context = loadFunctions(['applyNativeCharacterHint'], {
    state: {
      detectedGameVersion: 'poe2',
      account: {
        activePoeVersion: 'poe2',
        charactersByGame: {
          poe2: [
            {
              id: 'char-koca',
              name: 'KocaAyVeMasha',
              level: 96,
              className: 'Druid',
              ascendancy: 'Shaman',
              league: 'Fate of the Vaal',
              poeVersion: 'poe2'
            }
          ]
        },
        summary: { status: 'ready', name: 'OldCharacter' }
      }
    },
    renderCharacterSummaryCard() {},
    refreshRendererOverlayState() {}
  });

  const result = context.applyNativeCharacterHint({
    source: 'native-game-info',
    poeVersion: 'poe2',
    characterName: '"KocaAyVeMasha"',
    className: 'Druid',
    level: 96,
    confidence: 'high'
  });

  assert.equal(result, true);
  assert.equal(context.state.account.selectedCharacter.id, 'char-koca');
  assert.equal(context.state.account.summary.name, 'KocaAyVeMasha');
  assert.equal(context.state.account.summary.league, 'Fate of the Vaal');
  assert.equal(context.state.account.summary.className, 'Druid');
  assert.equal(context.state.account.summary.ascendancy, 'Shaman');
  assert.equal(context.state.account.charactersByGame.poe2.length, 1);
});

test('renderer applies an unmatched native character as the active runtime character', () => {
  let renderCalls = 0;
  const context = loadFunctions(['applyNativeCharacterHint'], {
    state: {
      detectedGameVersion: 'poe2',
      account: {
        accountName: 'AuthenticatedA',
        activePoeVersion: 'poe2',
        characters: [
          { id: 'char-a', name: 'AccountACharacter', className: 'Druid2', league: 'Standard', poeVersion: 'poe2' }
        ],
        charactersByGame: {
          poe2: [
            { id: 'char-a', name: 'AccountACharacter', className: 'Druid2', league: 'Standard', poeVersion: 'poe2' }
          ]
        },
        selectedCharacterByGame: { poe2: 'char-a' },
        summary: { status: 'ready', name: 'AccountACharacter' }
      }
    },
    renderCharacterSummaryCard() {
      renderCalls += 1;
    },
    refreshRendererOverlayState() {}
  });

  const result = context.applyNativeCharacterHint({
    source: 'native-game-info',
    poeVersion: 'poe2',
    characterName: 'FriendBCharacter',
    className: 'Monk2',
    ascendancy: 'Invoker',
    level: 94,
    league: 'Standard',
    confidence: 'high'
  });

  assert.equal(result, true);
  assert.equal(context.state.account.selectedCharacter.name, 'FriendBCharacter');
  assert.equal(context.state.account.summary.name, 'FriendBCharacter');
  assert.equal(context.state.account.summary.level, 94);
  assert.equal(context.state.account.summary.className, 'Monk2');
  assert.equal(context.state.account.summary.ascendancy, 'Invoker');
  assert.equal(context.state.account.selectedCharacterByGame.poe2, context.state.account.selectedCharacter.id);
  assert.match(context.state.account.selectedCharacter.id, /^native:poe2:/);
  assert.equal(context.state.account.charactersByGame.poe2.length, 2);
  assert.equal(renderCalls, 1);
});

test('renderer ignores a high-confidence native hint for a different game version', () => {
  let renderCalls = 0;
  const context = loadFunctions(['applyNativeCharacterHint'], {
    state: {
      detectedGameVersion: 'poe1',
      settings: { poeVersion: 'poe1' },
      account: {
        activePoeVersion: 'poe1',
        charactersByGame: {
          poe1: [
            { id: 'char-templar', name: 'JaylenBaliston', className: 'Templar', league: 'Mirage', poeVersion: 'poe1' }
          ],
          poe2: [
            { id: 'char-kellee', name: 'KELLEE', className: 'Monk2', league: 'Standard', poeVersion: 'poe2' }
          ]
        },
        summary: { status: 'ready', name: 'JaylenBaliston' }
      }
    },
    renderCharacterSummaryCard() {
      renderCalls += 1;
    },
    refreshRendererOverlayState() {}
  });

  const result = context.applyNativeCharacterHint({
    source: 'native-game-info',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    className: 'Monk2',
    confidence: 'high'
  });

  assert.equal(result, false);
  assert.equal(context.state.account.summary.name, 'JaylenBaliston');
  assert.equal(renderCalls, 0);
});

test('renderer subscribes native active-character hints through setupIPCListeners', () => {
  const calls = [];
  const context = loadFunctions(['setupIPCListeners'], {
    window: {
      t: (key) => key,
      electronAPI: {
        onMapEntered() {},
        onMapExited() {},
        onSessionStarted() {},
        onSessionEnded() {},
        onLootAdded() {},
        onGameVersionChanged() {},
        onGameClosed() {},
        onNavigate() {},
        onActiveCharacterHint(handler) {
          this._activeCharacterHintHandler = handler;
        }
      }
    },
    showToast() {},
    formatDuration() { return '0m 0s'; },
    refreshTrackerData() {},
    updateActiveSessionUI() {},
    ensureSessionClock() {},
    stopSessionClock() {},
    isPageActive() { return false; },
    renderPendingSyncState() {},
    renderAuditTrail() {},
    renderProfitReport() {},
    setRuntimeSessionState() {},
    syncRendererGameContext() {},
    refreshAccountStateFromCurrentUser() {},
    renderCharacterSummaryCard() {},
    applyNativeCharacterHint: (hint) => calls.push(hint),
    scheduleActiveCharacterRefresh() {},
    stashState: { pricesSynced: false },
    elements: { priceItemCount: { textContent: '' } },
    currencyState: { poeVersion: 'poe1', type: '' },
    document: { querySelectorAll: () => [] },
    updateTypeFilterDropdown() {},
    loadCurrencyLeagues() {},
    loadCurrencyPrices() {},
    clearActiveCharacterRefreshTimers() {},
    navigateTo() {},
    state: {}
  });

  context.setupIPCListeners();
  context.window.electronAPI._activeCharacterHintHandler({
    source: 'native-game-info',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    confidence: 'high'
  });

  assert.deepEqual(calls, [
    {
      source: 'native-game-info',
      poeVersion: 'poe2',
      characterName: 'KELLEE',
      confidence: 'high'
    }
  ]);
});
