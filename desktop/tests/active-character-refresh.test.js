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

test('game version change schedules a delayed character refresh from GGG', async () => {
  const timers = [];
  const calls = [];
  const context = loadFunctions(['clearActiveCharacterRefreshTimers', 'runActiveCharacterRefresh', 'scheduleActiveCharacterRefresh'], {
    activeCharacterRefreshTimer: null,
    activeCharacterRefreshRetryTimer: null,
    activeCharacterRefreshRequestId: 0,
    state: { currentUser: { id: 'profile-1' } },
    refreshDeviceCharacters: async (version) => {
      calls.push(version);
      return true;
    },
    setTimeout(fn, delay) {
      timers.push({ fn, delay });
      return timers.length;
    },
    clearTimeout() {}
  });

  context.scheduleActiveCharacterRefresh({ version: 'poe2' });

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 3000);

  await timers[0].fn();

  assert.deepEqual(calls, ['poe2']);
});

test('refresh scheduler does not stack duplicate timers across repeated game-change events', () => {
  const cleared = [];
  const timers = [];
  const context = loadFunctions(['clearActiveCharacterRefreshTimers', 'runActiveCharacterRefresh', 'scheduleActiveCharacterRefresh'], {
    activeCharacterRefreshTimer: null,
    activeCharacterRefreshRetryTimer: null,
    activeCharacterRefreshRequestId: 0,
    state: { currentUser: { id: 'profile-1' } },
    refreshDeviceCharacters: async () => true,
    setTimeout(fn, delay) {
      timers.push({ fn, delay });
      return `timer-${timers.length}`;
    },
    clearTimeout(timerId) {
      cleared.push(timerId);
    }
  });

  context.scheduleActiveCharacterRefresh({ version: 'poe2' });
  context.scheduleActiveCharacterRefresh({ version: 'poe2' });

  assert.deepEqual(cleared, ['timer-1']);
  assert.equal(timers.length, 2);
});

test('refresh scheduler clears the pending timer when the detected game becomes null', () => {
  const cleared = [];
  const context = loadFunctions(['clearActiveCharacterRefreshTimers', 'runActiveCharacterRefresh', 'scheduleActiveCharacterRefresh'], {
    activeCharacterRefreshTimer: 'timer-1',
    activeCharacterRefreshRetryTimer: null,
    activeCharacterRefreshRequestId: 0,
    state: { currentUser: { id: 'user-1' } },
    clearTimeout(timerId) {
      cleared.push(timerId);
    }
  });

  context.scheduleActiveCharacterRefresh({ version: null });

  assert.deepEqual(cleared, ['timer-1']);
});

test('a refresh cancelled before it fires does not reach GGG', async () => {
  const calls = [];
  const timers = [];
  const context = loadFunctions(['clearActiveCharacterRefreshTimers', 'runActiveCharacterRefresh', 'scheduleActiveCharacterRefresh'], {
    activeCharacterRefreshTimer: null,
    activeCharacterRefreshRetryTimer: null,
    activeCharacterRefreshRequestId: 0,
    state: { currentUser: { id: 'profile-1' } },
    refreshDeviceCharacters: async (version) => {
      calls.push(version);
      return true;
    },
    setTimeout(fn, delay) {
      timers.push({ fn, delay });
      return `timer-${timers.length}`;
    },
    clearTimeout() {}
  });

  context.scheduleActiveCharacterRefresh({ version: 'poe2' });
  context.clearActiveCharacterRefreshTimers();
  await timers[0].fn();

  assert.deepEqual(calls, []);
});

test('failed character refresh keeps the previous character visible', async () => {
  const existingUser = { username: 'Esquetta4179' };
  const context = loadFunctions(['runActiveCharacterRefresh'], {
    activeCharacterRefreshRequestId: 0,
    state: { currentUser: existingUser },
    refreshDeviceCharacters: async () => false
  });

  const result = await context.runActiveCharacterRefresh({ version: 'poe2' });

  assert.equal(result, false);
  assert.equal(context.state.currentUser, existingUser);
});

test('failed scheduled refresh retries once after 5 seconds', async () => {
  const timers = [];
  let attempts = 0;
  const context = loadFunctions(['clearActiveCharacterRefreshTimers', 'runActiveCharacterRefresh', 'scheduleActiveCharacterRefresh'], {
    activeCharacterRefreshTimer: null,
    activeCharacterRefreshRetryTimer: null,
    activeCharacterRefreshRequestId: 0,
    state: { currentUser: { id: 'profile-1' } },
    refreshDeviceCharacters: async () => {
      attempts += 1;
      return false;
    },
    setTimeout(fn, delay) {
      timers.push({ fn, delay });
      return `timer-${timers.length}`;
    },
    clearTimeout() {}
  });

  context.scheduleActiveCharacterRefresh({ version: 'poe2' });

  await timers[0].fn();

  assert.equal(attempts, 1);
  assert.equal(timers[1].delay, 5000);
});

test('syncRendererGameContext schedules an active-character refresh for detected games', () => {
  const scheduled = [];
  const versionButtons = [
    {
      dataset: { version: 'poe1' },
      classList: { toggle() {} },
      setAttribute() {}
    },
    {
      dataset: { version: 'poe2' },
      classList: { toggle() {} },
      setAttribute() {}
    }
  ];

  const context = loadFunctions(['setToggleButtonPressed', 'syncRendererGameContext'], {
    normalizePoeVersion: (value) => value,
    state: {
      currentUser: { id: 'user-1' },
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
    loadSettingsLeagueOptions: async () => {},
    updateGameStatusIndicator() {},
    updateActiveLeagueFieldContext() {},
    applyDashboardCapabilities() {},
    scheduleActiveCharacterRefresh: (options) => {
      scheduled.push(options);
    }
  });

  context.syncRendererGameContext('poe2', { logPath: 'C:/Games/Client.txt' });

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].version, 'poe2');
});

test('game-version change triggers active character refresh scheduling for poe2', () => {
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
        onGameVersionChanged(handler) {
          this._handler = handler;
        },
        onNavigate() {}
      }
    },
    showToast() {},
    formatDuration() { return '0m 0s'; },
    refreshTrackerData() {},
    updateActiveSessionUI() {},
    ensureSessionClock() {},
    stopSessionClock() {},
    isPageActive() { return false; },
    renderAuditTrail() {},
    renderProfitReport() {},
    setRuntimeSessionState() {},
    syncRendererGameContext(version, options) {
      calls.push(['syncRendererGameContext', version, options?.logPath || null]);
      context.scheduleActiveCharacterRefresh({ version });
    },
    refreshAccountStateFromCurrentUser() {},
    renderCharacterSummaryCard() {},
    scheduleActiveCharacterRefresh: (payload) => calls.push(payload),
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
  context.window.electronAPI._handler({ version: 'poe2', logPath: 'F:/SteamLibrary/steamapps/common/Path of Exile 2/Client.txt' });

  assert.deepEqual(calls, [
    ['syncRendererGameContext', 'poe2', 'F:/SteamLibrary/steamapps/common/Path of Exile 2/Client.txt'],
    { version: 'poe2' }
  ]);
});

test('a GGG answer that lands after sign-out is dropped', async () => {
  const state = { currentUser: { id: 'profile-1' }, poeDeviceConnected: true, deviceCharactersByGame: {}, settings: {} };
  const rendered = [];
  const context = loadFunctions(['refreshDeviceCharacters'], {
    state,
    normalizePoeVersion: (value) => value,
    window: {
      electronAPI: {
        getPoeDeviceCharacters: async () => {
          state.currentUser = null;
          state.poeDeviceConnected = false;
          return { connected: true, characters: [{ id: 'char-1', name: 'OldAccountChar', current: true }] };
        }
      }
    },
    renderPoeLinkStatus: () => rendered.push('renderPoeLinkStatus'),
    renderCharacterSummaryCard: () => rendered.push('renderCharacterSummaryCard')
  });

  assert.equal(await context.refreshDeviceCharacters('poe1'), false);
  assert.equal(state.poeDeviceConnected, false);
  assert.deepEqual(state.deviceCharactersByGame, {});
  assert.deepEqual(rendered, []);
});
