const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const desktopDir = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(desktopDir, 'src', 'index.html');
const appJsPath = path.join(desktopDir, 'src', 'app.js');

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

test('dashboard map session flow includes farm type selector controls before map start', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="session-farm-type-select"/);
  assert.match(html, /id="clear-farm-type-btn"/);
});

test('dashboard loads the profit currency model before renderer app code', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /modules\/profitCurrencyModel\.js[\s\S]*app\.js/);
});

test('renderer formats map profit with adaptive divine and mirror denominations', () => {
  const context = loadFunctions([
    'normalizeProfitPoeVersion',
    'getProfitCurrencyModel',
    'getProfitCurrencyLeague',
    'getProfitCurrencyRateKey',
    'getProfitCurrencyRates',
    'profitCurrencyHTML',
    'formatAdaptiveProfitText'
  ], {
    state: {
      settings: { poeVersion: 'poe1' },
      profitCurrencyRates: {
        poe1: { divineChaos: 100, mirrorChaos: 300000 }
      }
    },
    window: {
      profitCurrencyModel: {
        selectProfitCurrency(chaosValue, rates) {
          if (Math.abs(chaosValue) >= rates.mirrorChaos) {
            return { type: 'mirror', value: chaosValue / rates.mirrorChaos };
          }
          if (Math.abs(chaosValue) >= rates.divineChaos) {
            return { type: 'divine', value: chaosValue / rates.divineChaos };
          }
          return { type: 'chaos', value: chaosValue };
        },
        formatProfitCurrencyText(chaosValue, rates, options = {}) {
          const selected = this.selectProfitCurrency(chaosValue, rates);
          const sign = options.signed && chaosValue > 0 ? '+' : chaosValue < 0 ? '-' : '';
          const value = Math.abs(selected.value);
          if (selected.type === 'divine') return `${sign}${value.toFixed(2)} div`;
          if (selected.type === 'mirror') return `${sign}${value.toFixed(2)} mirror`;
          return `${sign}${value.toFixed(1)}c`;
        }
      }
    },
    currencyHTML: (value, type, iconSize, poeVersion) => `${value}|${type}|${iconSize}|${poeVersion}`
  });

  assert.equal(context.profitCurrencyHTML(5000, 16, 'poe1'), '50|divine|16|poe1');
  assert.equal(context.profitCurrencyHTML(600000, 16, 'poe1'), '2|mirror|16|poe1');
  assert.equal(context.formatAdaptiveProfitText(5000, 'poe1', { signed: true }), '+50.00 div');
});

test('dashboard provides a branded new map session modal instead of native prompts', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="map-session-modal"/);
  assert.match(html, /id="map-session-name-input"/);
  assert.match(html, /id="map-session-farm-type-select"/);
  assert.match(html, /id="map-session-confirm-btn"/);
  assert.match(html, /id="map-session-cancel-btn"/);
  assert.match(html, /data-modal-purpose="new-map-session"/);
});

test('ending a map session uses the branded modal instead of a native confirm', () => {
  const source = extractFunctionSource(fs.readFileSync(appJsPath, 'utf8'), 'handleEndSession');

  assert.match(source, /requestEndSessionConfirmation/);
  assert.doesNotMatch(source, /confirm\(/);
});

test('renderer farm type selector populates options and reflects the active farm type', () => {
  const elements = {
    sessionFarmTypeSelect: {
      innerHTML: '',
      value: '',
      disabled: false
    },
    clearFarmTypeBtn: {
      disabled: false
    }
  };
  const state = {
    currentSession: null,
    farmType: {
      selectedFarmTypeId: 'ritual'
    }
  };
  const context = loadFunctions(['renderFarmTypeSelector'], {
    elements,
    state,
    escapeHTML: (value) => String(value),
    getFarmTypeModel: () => ({
      listFarmTypes: () => ([
        { id: 'abyss', label: 'Abyss' },
        { id: 'ritual', label: 'Ritual' }
      ])
    })
  });

  context.renderFarmTypeSelector();

  assert.match(elements.sessionFarmTypeSelect.innerHTML, /value="abyss"/);
  assert.match(elements.sessionFarmTypeSelect.innerHTML, /value="ritual"/);
  assert.equal(elements.sessionFarmTypeSelect.value, 'ritual');
  assert.equal(elements.sessionFarmTypeSelect.disabled, false);
  assert.equal(elements.clearFarmTypeBtn.disabled, false);
});

test('renderer farm type selector filters options by active PoE version', () => {
  const elements = {
    sessionFarmTypeSelect: {
      innerHTML: '',
      value: '',
      disabled: false
    },
    clearFarmTypeBtn: {
      disabled: false
    }
  };
  const listCalls = [];
  const context = loadFunctions(['renderFarmTypeSelector'], {
    elements,
    state: {
      currentSession: null,
      farmType: {
        selectedFarmTypeId: 'blight'
      }
    },
    escapeHTML: (value) => String(value),
    getResolvedLeagueVersion: () => 'poe2',
    getFarmTypeModel: () => ({
      listFarmTypes: (options) => {
        listCalls.push({ ...options });
        return [
          { id: 'abyss', label: 'Abyss' },
          { id: 'ritual', label: 'Ritual' }
        ];
      }
    })
  });

  context.renderFarmTypeSelector();

  assert.deepEqual(listCalls, [{ poeVersion: 'poe2' }]);
  assert.match(elements.sessionFarmTypeSelect.innerHTML, /value="abyss"/);
  assert.doesNotMatch(elements.sessionFarmTypeSelect.innerHTML, /value="blight"/);
  assert.equal(elements.sessionFarmTypeSelect.value, '');
  assert.equal(elements.clearFarmTypeBtn.disabled, true);
});

test('renderer selection changes sync the active farm type to the main process', async () => {
  const calls = [];
  const elements = {
    sessionFarmTypeSelect: {
      value: 'essence'
    },
    clearFarmTypeBtn: {
      disabled: false
    }
  };
  const farmTypeState = {
    selectedFarmTypeId: null
  };
  const context = loadFunctions(['handleFarmTypeSelectionChange', 'handleFarmTypeSelectionClear'], {
    elements,
    state: {
      farmType: farmTypeState
    },
    getFarmTypeModel: () => ({
      selectFarmType(state, farmTypeId, options) {
        calls.push(['selectFarmType', farmTypeId, { ...options }]);
        state.selectedFarmTypeId = farmTypeId || null;
        return state.selectedFarmTypeId;
      },
      clearFarmType(state) {
        state.selectedFarmTypeId = null;
      }
    }),
    getResolvedLeagueVersion: () => 'poe2',
    renderFarmTypeSelector: () => calls.push(['renderFarmTypeSelector']),
    window: {
      electronAPI: {
        async setActiveFarmType(farmTypeId) {
          calls.push(['setActiveFarmType', farmTypeId]);
        }
      }
    }
  });

  await context.handleFarmTypeSelectionChange();
  await context.handleFarmTypeSelectionClear();

  assert.deepEqual(calls, [
    ['selectFarmType', 'essence', { poeVersion: 'poe2' }],
    ['setActiveFarmType', 'essence'],
    ['renderFarmTypeSelector'],
    ['setActiveFarmType', null],
    ['renderFarmTypeSelector']
  ]);
});

test('renderer clears unsupported farm type selection after a game-version sync', async () => {
  const calls = [];
  const farmTypeState = {
    selectedFarmTypeId: 'blight'
  };
  const context = loadFunctions(['syncFarmTypeSelectionForVersion'], {
    state: {
      farmType: farmTypeState
    },
    normalizePoeVersion: (version) => version === 'poe1' || version === 'poe2' ? version : null,
    getResolvedLeagueVersion: () => 'poe2',
    getFarmTypeModel: () => ({
      isFarmTypeSupported: (farmTypeId, options) => {
        calls.push(['isFarmTypeSupported', farmTypeId, { ...options }]);
        return false;
      },
      clearFarmType: (state) => {
        calls.push(['clearFarmType']);
        state.selectedFarmTypeId = null;
      }
    }),
    renderFarmTypeSelector: () => calls.push(['renderFarmTypeSelector']),
    window: {
      electronAPI: {
        setActiveFarmType: async (farmTypeId) => {
          calls.push(['setActiveFarmType', farmTypeId]);
        }
      }
    }
  });

  await context.syncFarmTypeSelectionForVersion('poe2');

  assert.equal(farmTypeState.selectedFarmTypeId, null);
  assert.deepEqual(calls, [
    ['isFarmTypeSupported', 'blight', { poeVersion: 'poe2' }],
    ['clearFarmType'],
    ['setActiveFarmType', null],
    ['renderFarmTypeSelector']
  ]);
});

test('runtime game-version sync reconciles farm type support for the active version', () => {
  const calls = [];
  const state = {
    settings: {
      poeVersion: 'poe1'
    }
  };
  const elements = {
    versionBtns: [
      { dataset: { version: 'poe1' }, classList: { toggle: () => {} }, setAttribute: () => {} },
      { dataset: { version: 'poe2' }, classList: { toggle: () => {} }, setAttribute: () => {} }
    ]
  };
  const context = loadFunctions(['setToggleButtonPressed', 'syncRendererGameContext'], {
    state,
    elements,
    normalizePoeVersion: (version) => version === 'poe1' || version === 'poe2' ? version : null,
    loadSettingsLeagueOptions: () => Promise.resolve(),
    updateGameStatusIndicator: () => {},
    updateActiveLeagueFieldContext: () => {},
    applyDashboardCapabilities: () => {},
    scheduleActiveCharacterRefresh: () => {},
    syncFarmTypeSelectionForVersion: (version) => {
      calls.push(version);
    }
  });

  context.syncRendererGameContext('poe2', { settingsVersion: 'poe2' });

  assert.deepEqual(calls, ['poe2']);
});

test('tracker context prefers the active character league over the default settings league', () => {
  const context = loadFunctions(['getSelectedTrackerContext'], {
    state: {
      account: {
        summary: {
          status: 'ready',
          poeVersion: 'poe2',
          league: 'Fate of the Vaal'
        }
      },
      farmType: {
        selectedFarmTypeId: 'breach'
      }
    },
    getResolvedLeagueVersion: () => 'poe2',
    getResolvedActiveLeague: () => 'Standard'
  });

  assert.deepEqual({ ...context.getSelectedTrackerContext() }, {
    poeVersion: 'poe2',
    league: 'Fate of the Vaal',
    farmTypeId: 'breach',
    label: 'PoE 2 • Fate of the Vaal'
  });
});

test('starting a map session opens the branded modal with detected map name and selected farm type', async () => {
  const startSessionCalls = [];
  const activeFarmTypeCalls = [];
  let modalRequest = null;
  const context = loadFunctions(['normalizeSessionMapName', 'getRuntimeSessionMapName', 'handleStartSession'], {
    state: {
      runtimeSession: {
        summary: {
          currentAreaName: 'Dunes Map'
        }
      }
    },
    window: {
      t: (key) => key,
      electronAPI: {
        startSession: async (payload) => {
          startSessionCalls.push(payload);
          return { id: 'session-1' };
        },
        setActiveFarmType: async (farmTypeId) => {
          activeFarmTypeCalls.push(farmTypeId);
        }
      }
    },
    requestMapSessionDetails: async (request) => {
      modalRequest = request;
      return {
        mapName: request.defaultName,
        farmTypeId: 'expedition'
      };
    },
    getSelectedTrackerContext: () => ({
      poeVersion: 'poe2',
      league: 'Fate of the Vaal',
      farmTypeId: 'breach',
      label: 'PoE 2 • Fate of the Vaal'
    }),
    updateActiveSessionUI: () => {},
    refreshTrackerData: async () => {},
    showToast: () => {},
    getUserFacingErrorMessage: () => 'error'
  });

  await context.handleStartSession();

  assert.equal(modalRequest.defaultName, 'Dunes Map');
  assert.equal(modalRequest.trackerContext.farmTypeId, 'breach');
  assert.deepEqual(startSessionCalls.map((payload) => ({ ...payload })), [{
    mapName: 'Dunes Map',
    poeVersion: 'poe2',
    league: 'Fate of the Vaal',
    farmTypeId: 'expedition'
  }]);
  assert.deepEqual(activeFarmTypeCalls, ['expedition']);
});

test('starting a map session can use trusted overlay details without opening the desktop modal', async () => {
  const startSessionCalls = [];
  let modalRequested = false;
  const context = loadFunctions(['normalizeSessionMapName', 'getRuntimeSessionMapName', 'handleStartSession'], {
    state: {
      runtimeSession: {
        summary: {
          currentAreaName: 'Dunes Map'
        }
      }
    },
    window: {
      t: (key) => key,
      electronAPI: {
        startSession: async (payload) => {
          startSessionCalls.push(payload);
          return { id: 'session-1' };
        },
        setActiveFarmType: async () => {}
      }
    },
    requestMapSessionDetails: async () => {
      modalRequested = true;
      return null;
    },
    getSelectedTrackerContext: () => ({
      poeVersion: 'poe2',
      league: 'Fate of the Vaal',
      farmTypeId: 'breach',
      label: 'PoE 2 - Fate of the Vaal'
    }),
    updateActiveSessionUI: () => {},
    refreshTrackerData: async () => {},
    showToast: () => {},
    getUserFacingErrorMessage: () => 'error'
  });

  await context.handleStartSession({
    sessionDetails: {
      mapName: 'Channel',
      farmTypeId: 'expedition'
    },
    source: 'map-detected-overlay'
  });

  assert.equal(modalRequested, false);
  assert.deepEqual(startSessionCalls.map((payload) => ({ ...payload })), [{
    mapName: 'Channel',
    poeVersion: 'poe2',
    league: 'Fate of the Vaal',
    farmTypeId: 'expedition'
  }]);
});

test('start map modal farm selector uses the tracker context PoE version', () => {
  const calls = [];
  const elements = {
    mapSessionFarmTypeSelect: {
      innerHTML: '',
      value: ''
    }
  };
  const context = loadFunctions(['populateMapSessionFarmTypes'], {
    elements,
    escapeHTML: (value) => String(value),
    getResolvedLeagueVersion: () => 'poe1',
    getFarmTypeModel: () => ({
      listFarmTypes: (options) => {
        calls.push({ ...options });
        return [
          { id: 'abyss', label: 'Abyss' },
          { id: 'ritual', label: 'Ritual' }
        ];
      }
    })
  });

  assert.equal(context.populateMapSessionFarmTypes('ritual', { poeVersion: 'poe2' }), 'ritual');
  assert.deepEqual(calls, [{ poeVersion: 'poe2' }]);
  assert.match(elements.mapSessionFarmTypeSelect.innerHTML, /value="ritual"/);
});

test('starting a map session does not rely on unsupported renderer prompt', async () => {
  const startSessionCalls = [];
  const context = loadFunctions(['normalizeSessionMapName', 'getRuntimeSessionMapName', 'handleStartSession'], {
    prompt: () => {
      throw new Error('prompt() is not supported');
    },
    state: {
      runtimeSession: {
        currentInstance: {
          areaName: 'Crimson Temple'
        }
      }
    },
    window: {
      t: (key) => key,
      electronAPI: {
        startSession: async (payload) => {
          startSessionCalls.push(payload);
          return { id: 'session-1' };
        }
      }
    },
    requestMapSessionDetails: async (request) => ({
      mapName: request.defaultName,
      farmTypeId: request.trackerContext.farmTypeId
    }),
    getSelectedTrackerContext: () => ({
      poeVersion: 'poe1',
      league: 'Mirage',
      farmTypeId: 'abyss',
      label: 'PoE 1 • Mirage'
    }),
    updateActiveSessionUI: () => {},
    refreshTrackerData: async () => {},
    showToast: () => {},
    getUserFacingErrorMessage: () => 'error'
  });

  await context.handleStartSession();

  assert.deepEqual(startSessionCalls.map((payload) => ({ ...payload })), [{
    mapName: 'Crimson Temple',
    poeVersion: 'poe1',
    league: 'Mirage',
    farmTypeId: 'abyss'
  }]);
});

test('starting a poe1 map session schedules baseline snapshot without blocking session start', async () => {
  const calls = [];
  let baselineResolve;
  const baselinePromise = new Promise((resolve) => {
    baselineResolve = resolve;
  });
  const context = loadFunctions(['normalizeSessionMapName', 'getRuntimeSessionMapName', 'handleStartSession'], {
    state: {
      runtimeSession: null,
      currentSession: null
    },
    window: {
      t: (key) => key,
      electronAPI: {
        startSession: async (payload) => {
          calls.push(['startSession', payload.mapName]);
          return { id: 'session-1', mapName: payload.mapName, poeVersion: 'poe1' };
        }
      }
    },
    requestMapSessionDetails: async () => ({
      mapName: 'Dunes Map',
      farmTypeId: 'breach'
    }),
    getSelectedTrackerContext: () => ({
      poeVersion: 'poe1',
      league: 'Mirage',
      farmTypeId: 'breach',
      label: 'PoE 1 - Mirage'
    }),
    scheduleAutomaticBeforeSnapshotForSession: (session) => {
      calls.push(['scheduleBaseline', session.id]);
      return baselinePromise;
    },
    updateActiveSessionUI: () => calls.push('updateActiveSessionUI'),
    refreshTrackerData: async () => calls.push('refreshTrackerData'),
    showToast: () => calls.push('showToast'),
    getUserFacingErrorMessage: () => 'error'
  });

  await context.handleStartSession();
  baselineResolve(true);

  // The session-started event from main already toasts the start, so a second toast here would double it.
  assert.deepEqual(calls, [
    ['startSession', 'Dunes Map'],
    'updateActiveSessionUI',
    ['scheduleBaseline', 'session-1'],
    'refreshTrackerData'
  ]);
});

test('loot-added toasts use the singular copy for one item', () => {
  const listeners = {};
  const toasts = [];
  const context = loadFunctions(['setupIPCListeners'], {
    state: { currentSession: null },
    window: {
      t: (key, values = {}) => `${key}:${values.count ?? ''}`,
      electronAPI: {
        onMapEntered: (handler) => { listeners.mapEntered = handler; },
        onMapExited: (handler) => { listeners.mapExited = handler; },
        onSessionStarted: (handler) => { listeners.sessionStarted = handler; },
        onSessionEnded: (handler) => { listeners.sessionEnded = handler; },
        onLootAdded: (handler) => { listeners.lootAdded = handler; },
        onNavigate: (handler) => { listeners.navigate = handler; }
      }
    },
    showToast: (title, body) => toasts.push([title, body]),
    refreshTrackerData: async () => {},
    isPageActive: () => false
  });

  context.setupIPCListeners();
  listeners.lootAdded({ items: [{ name: 'Chaos Orb' }] });
  listeners.lootAdded({ items: [{ name: 'Chaos Orb' }, { name: 'Divine Orb' }, { name: 'Exalted Orb' }] });

  assert.deepEqual(toasts, [
    ['toast.lootAddedTitle:', 'toast.lootAddedBodyOne:1'],
    ['toast.lootAddedTitle:', 'toast.lootAddedBody:3']
  ]);
});

test('renderer keeps an active session visible when current-session refresh fails', async () => {
  const calls = [];
  const state = {
    currentSession: {
      id: 'session-1',
      mapName: 'Dunes Map',
      poeVersion: 'poe1'
    }
  };
  const context = loadFunctions(['loadCurrentSession'], {
    state,
    window: {
      electronAPI: {
        async getCurrentSession() {
          throw Object.assign(new Error('Authorization token is required'), {
            code: 'AUTH_TOKEN_REQUIRED'
          });
        }
      }
    },
    updateActiveSessionUI: () => calls.push('updateActiveSessionUI'),
    console: {
      warn() {}
    }
  });

  const result = await context.loadCurrentSession();

  assert.equal(result.id, 'session-1');
  assert.equal(state.currentSession.id, 'session-1');
  assert.deepEqual(calls, ['updateActiveSessionUI']);
});

test('poe1 end session falls back to not-calculated completion when baseline is missing', async () => {
  const calls = [];
  const state = {
    currentSession: {
      id: 'session-1',
      mapName: 'Dunes Map',
      poeVersion: 'poe1'
    }
  };
  const context = loadFunctions(['completePoe1SessionWithStashProfit'], {
    state,
    window: {
      t: (key) => key
    },
    isActiveSessionPoe1: () => true,
    isStashTrackingEnabled: () => true,
    waitForPendingBeforeSnapshotForSession: async () => false,
    hasActivePoe1StashBaseline: () => false,
    hydratePoe1StashSnapshotsForSession: async () => null,
    completePoe1SessionWithoutStashProfit: async (session, error) => {
      calls.push(['completeWithoutProfit', session.id, error.message]);
      return true;
    },
    showToast: (...args) => calls.push(['showToast', ...args])
  });

  const result = await context.completePoe1SessionWithStashProfit();

  assert.equal(result, true);
  assert.deepEqual(calls, [['completeWithoutProfit', 'session-1', 'Missing before-stash baseline']]);
});

test('poe1 end session completes without stash profit when stash tracking is unavailable', async () => {
  const calls = [];
  const state = {
    currentSession: {
      id: 'session-1',
      mapName: 'Dunes Map',
      poeVersion: 'poe1'
    }
  };
  const context = loadFunctions(['completePoe1SessionWithStashProfit'], {
    state,
    window: {
      t: (key) => key
    },
    isActiveSessionPoe1: () => true,
    isStashTrackingEnabled: () => false,
    showStashUnavailableToast: () => calls.push('showStashUnavailableToast'),
    completePoe1SessionWithoutStashProfit: async (session, error) => {
      calls.push(['completeWithoutProfit', session.id, error ?? null]);
      return true;
    }
  });

  const result = await context.completePoe1SessionWithStashProfit();

  assert.equal(result, true);
  assert.deepEqual(calls, [['completeWithoutProfit', 'session-1', null]]);
});

test('poe1 end session without stash profit lets the journal value the recorded loot', async () => {
  const endSessionCalls = [];
  const calls = [];
  const state = {
    currentSession: {
      id: 'session-1',
      mapName: 'Dunes Map',
      poeVersion: 'poe1',
      startedAt: '2026-05-06T12:00:00.000Z'
    }
  };
  const context = loadFunctions(['completePoe1SessionWithoutStashProfit'], {
    state,
    stashState: { lastMapResult: null },
    window: {
      t: (key) => key,
      electronAPI: {
        async endSession(payload) {
          endSessionCalls.push(JSON.parse(JSON.stringify(payload)));
          return { id: 'session-1', status: 'completed', totalLootChaos: 42, profitChaos: 42 };
        }
      }
    },
    isActiveSessionPoe1: () => true,
    getLiveDuration: () => 240,
    persistMapResultHistory: async () => calls.push('persistMapResultHistory'),
    updateActiveSessionUI: () => calls.push('updateActiveSessionUI'),
    refreshTrackerData: async () => calls.push('refreshTrackerData'),
    showToast: (...args) => calls.push(['showToast', ...args]),
    console: { warn() {} }
  });

  const result = await context.completePoe1SessionWithoutStashProfit(state.currentSession);

  assert.equal(result, true);
  assert.deepEqual(endSessionCalls, [{
    sessionId: 'session-1',
    mapName: 'Dunes Map',
    startedAt: '2026-05-06T12:00:00.000Z',
    durationSeconds: 240
  }]);
  assert.equal(state.currentSession, null);
  // The session-ended event records the result; no stash ran, so there is no stash warning.
  assert.deepEqual(calls, ['updateActiveSessionUI', 'refreshTrackerData']);
});

test('poe1 end session after a stash failure still warns that the stash diff was skipped', async () => {
  const calls = [];
  const context = loadFunctions(['completePoe1SessionWithoutStashProfit'], {
    state: { currentSession: { id: 'session-1', poeVersion: 'poe1' } },
    window: {
      t: (key) => key,
      electronAPI: {
        endSession: async () => ({ id: 'session-1', status: 'completed' })
      }
    },
    isActiveSessionPoe1: () => true,
    getLiveDuration: () => 240,
    updateActiveSessionUI: () => {},
    refreshTrackerData: async () => {},
    showToast: (title, message, type) => calls.push([title, type]),
    console: { warn() {} }
  });

  await context.completePoe1SessionWithoutStashProfit(undefined, new Error('Missing before-stash baseline'));

  assert.deepEqual(calls, [['stash.profitTracker', 'warning']]);
});

test('starting a poe1 session makes no stash request when the sign-in lacks account:stashes', async () => {
  const calls = [];
  const state = {
    poeStashAccess: false,
    settings: { poeVersion: 'poe1' },
    detectedGameVersion: 'poe1'
  };
  const context = loadFunctions([
    'getResolvedCapabilityGameVersion',
    'getStashCapabilityUnavailableKey',
    'getStashCapabilityUnavailableText',
    'applyDashboardCapabilities',
    'isStashTrackingEnabled',
    'normalizeCompletedSessionPoeVersion',
    'isActiveSessionPoe1',
    'takeAutomaticBeforeSnapshotForSession',
    'scheduleAutomaticBeforeSnapshotForSession'
  ], {
    state,
    stashState: {},
    elements: {},
    window: { t: (key) => key },
    getCapabilityModel: () => require('../src/modules/capabilityModel'),
    normalizePoeVersion: (value) => value,
    getSelectedTrackerContext: () => ({ poeVersion: 'poe1' }),
    updateStashTrackerStatus: () => {},
    takeStashSnapshotForCurrentRun: async () => calls.push('takeStashSnapshot'),
    showToast: (...args) => calls.push(['showToast', ...args])
  });

  const baseline = await context.scheduleAutomaticBeforeSnapshotForSession({ id: 'session-1', poeVersion: 'poe1' });

  assert.equal(baseline, false);
  assert.deepEqual(calls, []);
  assert.equal(state.capabilities.stashTracking.reason, 'stash_scope_missing');
});

test('poe device status refresh records stash access and re-applies the stash capability', async () => {
  const calls = [];
  const state = { account: { activePoeVersion: 'poe1' } };
  const context = loadFunctions(['syncPoeDeviceConnection'], {
    state,
    window: {
      electronAPI: {
        getPoeAuthStatus: async () => ({ authenticated: true, expired: false, stashAccess: false })
      }
    },
    applyDashboardCapabilities: () => calls.push(['applyDashboardCapabilities', state.poeStashAccess]),
    renderPoeLinkStatus: () => {},
    renderCharacterSummaryCard: () => {},
    refreshDeviceCharacters: async () => {}
  });

  await context.syncPoeDeviceConnection();

  assert.equal(state.poeStashAccess, false);
  assert.deepEqual(calls, [['applyDashboardCapabilities', false]]);
});

test('starting a map session uses the branded modal when runtime map name is missing', async () => {
  const startSessionCalls = [];
  const context = loadFunctions(['normalizeSessionMapName', 'getRuntimeSessionMapName', 'handleStartSession'], {
    state: {
      runtimeSession: null
    },
    window: {
      t: (key) => key,
      electronAPI: {
        startSession: async (payload) => {
          startSessionCalls.push(payload);
          return { id: 'session-1', mapName: payload.mapName };
        }
      }
    },
    requestMapSessionDetails: async () => ({
      mapName: 'Abyssal City Map',
      farmTypeId: 'abyss'
    }),
    getSelectedTrackerContext: () => ({
      poeVersion: 'poe1',
      league: 'Mirage',
      farmTypeId: 'abyss',
      label: 'PoE 1 - Mirage'
    }),
    updateActiveSessionUI: () => {},
    refreshTrackerData: async () => {},
    showToast: () => {},
    getUserFacingErrorMessage: () => 'error'
  });

  await context.handleStartSession();

  assert.deepEqual(startSessionCalls.map((payload) => ({ ...payload })), [{
    mapName: 'Abyssal City Map',
    poeVersion: 'poe1',
    league: 'Mirage',
    farmTypeId: 'abyss'
  }]);
});

test('starting a map session aborts cleanly when the branded modal is cancelled', async () => {
  const startSessionCalls = [];
  const context = loadFunctions(['normalizeSessionMapName', 'getRuntimeSessionMapName', 'handleStartSession'], {
    state: {
      runtimeSession: null
    },
    window: {
      t: (key) => key,
      electronAPI: {
        startSession: async (payload) => {
          startSessionCalls.push(payload);
          return { id: 'session-1', mapName: payload.mapName };
        }
      }
    },
    requestMapSessionDetails: async () => null,
    getSelectedTrackerContext: () => ({
      poeVersion: 'poe1',
      league: 'Mirage',
      farmTypeId: 'abyss',
      label: 'PoE 1 - Mirage'
    }),
    updateActiveSessionUI: () => {},
    refreshTrackerData: async () => {},
    showToast: () => {},
    getUserFacingErrorMessage: () => 'error'
  });

  await context.handleStartSession();

  assert.deepEqual(startSessionCalls, []);
});

test('map-entered events prompt for a session with the detected map instead of silently auto-starting', async () => {
  const startCalls = [];
  const runtimeSnapshots = [];
  const context = loadFunctions(['handleMapEnteredEvent'], {
    START_MAP_PROMPT_OVERLAY_MS: 7000,
    state: {
      currentSession: null,
      settings: {
        autoStartSession: true
      }
    },
    setRuntimeSessionState(runtimeSession) {
      runtimeSnapshots.push(runtimeSession);
    },
    showToast: () => {},
    window: {
      t: (key, values = {}) => values.mapName ? `${key}:${values.mapName}` : key
    },
    handleStartSession: async (options) => {
      startCalls.push({ ...options });
    }
  });

  await context.handleMapEnteredEvent({
    mapName: 'Tower',
    runtimeSession: {
      currentInstance: {
        areaName: 'Tower'
      }
    }
  });

  assert.deepEqual(runtimeSnapshots, [{
    currentInstance: {
      areaName: 'Tower'
    }
  }]);
  assert.deepEqual(startCalls, [{ defaultMapName: 'Tower', source: 'map-detected' }]);
});

test('map-entered events show an in-game start-map overlay prompt before opening the desktop modal', async () => {
  const overlayPrompts = [];
  const overlayOptions = [];
  const startCalls = [];
  const context = loadFunctions(['handleMapEnteredEvent'], {
    START_MAP_PROMPT_OVERLAY_MS: 7000,
    state: {
      currentSession: null,
      settings: {
        autoStartSession: true
      },
      farmType: {
        selectedFarmTypeId: 'breach'
      }
    },
    setRuntimeSessionState: () => {},
    showToast: () => {},
    getSelectedTrackerContext: () => ({
      poeVersion: 'poe2',
      league: 'Fate of the Vaal',
      farmTypeId: 'breach',
      label: 'PoE 2 - Fate of the Vaal'
    }),
    getFarmTypeModel: () => ({
      getFarmTypeById: (id) => (id === 'breach' ? { id: 'breach', label: 'Breach' } : null),
      listFarmTypes: () => [
        { id: 'breach', label: 'Breach' },
        { id: 'expedition', label: 'Expedition' }
      ]
    }),
    window: {
      t: (key, values = {}) => values.mapName ? `${key}:${values.mapName}` : key,
      electronAPI: {
        showStartMapPromptOverlay: async (payload, options) => {
          overlayPrompts.push(payload);
          overlayOptions.push(options);
        },
        hideStartMapPromptOverlay: async () => {
          overlayPrompts.push({ hidden: true, beforeDesktopModal: startCalls.length === 0 });
        }
      }
    },
    handleStartSession: async (options) => {
      startCalls.push({ ...options });
    }
  });

  await context.handleMapEnteredEvent({
    mapName: 'Channel'
  });

  assert.deepEqual(JSON.parse(JSON.stringify(overlayPrompts)), [
    {
      mapName: 'Channel',
      poeVersion: 'poe2',
      league: 'Fate of the Vaal',
      farmTypeId: 'breach',
      farmType: 'Breach',
      farmTypeOptions: [
        { id: 'breach', label: 'Breach' },
        { id: 'expedition', label: 'Expedition' }
      ],
      source: 'map-detected'
    },
    { hidden: true, beforeDesktopModal: true }
  ]);
  // Main gets the renderer's own close time, so the overlay counts down to the real close.
  assert.deepEqual(JSON.parse(JSON.stringify(overlayOptions)), [{ expiresInMs: 7000 }]);
  assert.match(fs.readFileSync(appJsPath, 'utf8'), /const START_MAP_PROMPT_OVERLAY_MS = 7000;/);
  assert.deepEqual(startCalls, [{ defaultMapName: 'Channel', source: 'map-detected' }]);
});

test('map-entered events can start a session from the in-game start-map overlay selection', async () => {
  const overlayPrompts = [];
  const startCalls = [];
  let overlayResultHandler = null;
  const context = loadFunctions(['handleMapEnteredEvent'], {
    START_MAP_PROMPT_OVERLAY_MS: 7000,
    state: {
      currentSession: null,
      settings: {
        autoStartSession: true
      },
      farmType: {
        selectedFarmTypeId: 'breach'
      }
    },
    setRuntimeSessionState: () => {},
    showToast: () => {},
    getSelectedTrackerContext: () => ({
      poeVersion: 'poe2',
      league: 'Fate of the Vaal',
      farmTypeId: 'breach',
      label: 'PoE 2 - Fate of the Vaal'
    }),
    getFarmTypeModel: () => ({
      getFarmTypeById: (id) => (id === 'breach' ? { id: 'breach', label: 'Breach' } : null),
      listFarmTypes: () => [
        { id: 'breach', label: 'Breach' },
        { id: 'expedition', label: 'Expedition' }
      ]
    }),
    window: {
      t: (key, values = {}) => values.mapName ? `${key}:${values.mapName}` : key,
      electronAPI: {
        showStartMapPromptOverlay: async (payload) => {
          overlayPrompts.push(payload);
          queueMicrotask(() => {
            overlayResultHandler?.({
              action: 'confirm',
              mapName: 'Channel',
              farmTypeId: 'expedition'
            });
          });
          return { visibility: 'visible', mode: 'start-map-prompt' };
        },
        hideStartMapPromptOverlay: async () => {
          overlayPrompts.push({ hidden: true });
        },
        onStartMapPromptOverlayResult: (callback) => {
          overlayResultHandler = callback;
          return () => {
            overlayResultHandler = null;
          };
        }
      }
    },
    handleStartSession: async (options) => {
      startCalls.push({ ...options });
    }
  });

  await context.handleMapEnteredEvent({
    mapName: 'Channel'
  });

  assert.equal(overlayPrompts.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(startCalls)), [{
    defaultMapName: 'Channel',
    source: 'map-detected-overlay',
    sessionDetails: {
      mapName: 'Channel',
      farmTypeId: 'expedition'
    }
  }]);
});

test('map-entered events fall back to the desktop modal when the in-game prompt is not answered quickly', async () => {
  const overlayPrompts = [];
  const startCalls = [];
  const timeoutDelays = [];
  let overlayResultHandler = null;
  const context = loadFunctions(['handleMapEnteredEvent'], {
    START_MAP_PROMPT_OVERLAY_MS: 7000,
    state: {
      currentSession: null,
      settings: {
        autoStartSession: true
      },
      farmType: {
        selectedFarmTypeId: 'breach'
      }
    },
    setRuntimeSessionState: () => {},
    showToast: () => {},
    setTimeout: (callback, delay) => {
      timeoutDelays.push({ delay, promptShown: overlayPrompts.length > 0 });
      callback();
      return 1;
    },
    clearTimeout: () => {},
    getSelectedTrackerContext: () => ({
      poeVersion: 'poe1',
      league: 'Mirage',
      farmTypeId: 'breach',
      label: 'PoE 1 - Mirage'
    }),
    getFarmTypeModel: () => ({
      getFarmTypeById: (id) => (id === 'breach' ? { id: 'breach', label: 'Breach' } : null),
      listFarmTypes: () => [
        { id: 'breach', label: 'Breach' },
        { id: 'expedition', label: 'Expedition' }
      ]
    }),
    window: {
      t: (key, values = {}) => values.mapName ? `${key}:${values.mapName}` : key,
      electronAPI: {
        showStartMapPromptOverlay: async (payload) => {
          overlayPrompts.push(payload);
          return { visibility: 'visible', mode: 'start-map-prompt' };
        },
        hideStartMapPromptOverlay: async () => {
          overlayPrompts.push({ hidden: true, beforeDesktopModal: startCalls.length === 0 });
        },
        onStartMapPromptOverlayResult: (callback) => {
          overlayResultHandler = callback;
          return () => {
            overlayResultHandler = null;
          };
        }
      }
    },
    handleStartSession: async (options) => {
      startCalls.push({ ...options });
    }
  });

  await context.handleMapEnteredEvent({
    mapName: 'Dunes Map'
  });

  assert.equal(overlayResultHandler, null);
  assert.deepEqual(JSON.parse(JSON.stringify(overlayPrompts)), [
    {
      mapName: 'Dunes Map',
      poeVersion: 'poe1',
      league: 'Mirage',
      farmTypeId: 'breach',
      farmType: 'Breach',
      farmTypeOptions: [
        { id: 'breach', label: 'Breach' },
        { id: 'expedition', label: 'Expedition' }
      ],
      source: 'map-detected'
    },
    { hidden: true, beforeDesktopModal: true }
  ]);
  assert.deepEqual(timeoutDelays, [{ delay: 7000, promptShown: true }]);
  assert.deepEqual(startCalls, [{ defaultMapName: 'Dunes Map', source: 'map-detected' }]);
});

test('dashboard summary requests stats for the active character league', async () => {
  const dashboardRequests = [];
  const context = loadFunctions(['loadDashboardStats'], {
    state: {
      currentUser: { id: 'user-1' },
      settings: { poeVersion: 'poe1' }
    },
    elements: {
      todaySessions: { textContent: '' },
      todayProfit: { textContent: '', innerHTML: '' },
      todayAvg: { textContent: '', innerHTML: '' }
    },
    getSelectedTrackerContext: () => ({
      poeVersion: 'poe1',
      league: 'Mirage'
    }),
    profitCurrencyHTML: (value) => `${value} chaos`,
    window: {
      electronAPI: {
        getDashboardStats: async (contextPayload) => {
          dashboardRequests.push(contextPayload);
          return {
            summary: {
              totalSessions: 1,
              totalProfit: 39.9,
              avgProfitPerMap: 39.9
            }
          };
        }
      }
    },
    resetDashboardSummary: () => {
      throw new Error('summary should not reset');
    }
  });

  await context.loadDashboardStats();

  assert.deepEqual(JSON.parse(JSON.stringify(dashboardRequests)), [{ poeVersion: 'poe1', league: 'Mirage' }]);
  assert.equal(context.elements.todaySessions.textContent, '1');
  assert.equal(context.elements.todayProfit.innerHTML, '39.9 chaos');
  assert.equal(context.elements.todayAvg.innerHTML, '39.9 chaos');
});

test('session-ended events persist completed map results for automatic log exits', async () => {
  const listeners = {};
  const persistedResults = [];
  const refreshCalls = [];
  const context = loadFunctions([
    'normalizeCompletedSessionPoeVersion',
    'shouldPersistCompletedSessionMapResult',
    'persistCompletedSessionMapResult',
    'setupIPCListeners'
  ], {
    state: {
      currentSession: {
        id: 'session-1'
      }
    },
    window: {
      t: (key, values = {}) => `${key}:${values.value || ''}`,
      electronAPI: {
        onMapEntered: (handler) => { listeners.mapEntered = handler; },
        onMapExited: (handler) => { listeners.mapExited = handler; },
        onSessionStarted: (handler) => { listeners.sessionStarted = handler; },
        onSessionEnded: (handler) => { listeners.sessionEnded = handler; },
        onLootAdded: (handler) => { listeners.lootAdded = handler; },
        onNavigate: (handler) => { listeners.navigate = handler; }
      }
    },
    updateActiveSessionUI: () => {},
    stopSessionClock: () => {},
    showToast: () => {},
    refreshTrackerData: async (options) => {
      refreshCalls.push({ ...options });
    },
    createCompletedSessionMapResult: (session) => ({
      id: `map-result-${session.id}`,
      sessionId: session.id,
      farmType: 'Abyss',
      durationSeconds: session.durationSec,
      netProfit: Number(session.profitChaos || 0),
      poeVersion: 'poe2'
    }),
    persistMapResultHistory: async (result) => {
      persistedResults.push({ ...result });
    }
  });

  context.setupIPCListeners();

  await listeners.sessionEnded({
    id: 'session-1',
    poeVersion: 'poe2',
    profitChaos: 0,
    durationSec: 145
  });

  assert.deepEqual(persistedResults, [{
    id: 'map-result-session-1',
    sessionId: 'session-1',
    farmType: 'Abyss',
    durationSeconds: 145,
    netProfit: 0,
    poeVersion: 'poe2'
  }]);
  assert.deepEqual(refreshCalls, [{ includeSessions: true }]);
});

function loadSessionEndedListener({ stashState = { lastMapResult: null } } = {}) {
  const listeners = {};
  const persisted = [];
  const overlayResults = [];
  const context = loadFunctions([
    'getSessionNumber',
    'getSessionTimestampMs',
    'getCompletedSessionDurationSeconds',
    'getCompletedSessionFarmTypeLabel',
    'getScannedTopOutputs',
    'createCompletedSessionMapResult',
    'normalizeCompletedSessionPoeVersion',
    'shouldPersistCompletedSessionMapResult',
    'persistCompletedSessionMapResult',
    'isPoe1ZeroLifecycleResult',
    'isDisplayableMapResult',
    'setupIPCListeners'
  ], {
    state: {
      currentSession: { id: 'session-1' },
      settings: { poeVersion: 'poe1' },
      account: {},
      farmType: {}
    },
    stashState,
    window: {
      t: (key) => key,
      electronAPI: {
        onMapEntered: (handler) => { listeners.mapEntered = handler; },
        onMapExited: (handler) => { listeners.mapExited = handler; },
        onSessionStarted: (handler) => { listeners.sessionStarted = handler; },
        onSessionEnded: (handler) => { listeners.sessionEnded = handler; },
        onLootAdded: (handler) => { listeners.lootAdded = handler; },
        onNavigate: (handler) => { listeners.navigate = handler; },
        async showMapResultOverlay(result) {
          overlayResults.push(JSON.parse(JSON.stringify(result)));
        }
      }
    },
    getFarmTypeModel: () => ({
      getFarmTypeById: (id) => (id === 'breach' ? { id: 'breach', label: 'Breach' } : null),
      listFarmTypes: () => [{ id: 'breach', label: 'Breach' }]
    }),
    getSelectedTrackerContext: () => ({ poeVersion: 'poe1', league: 'Mirage', farmTypeId: 'breach' }),
    normalizePoeVersion: (value) => value,
    persistMapResultHistory: async (result) => {
      persisted.push(JSON.parse(JSON.stringify(result)));
    },
    updateActiveSessionUI: () => {},
    stopSessionClock: () => {},
    showToast: () => {},
    refreshTrackerData: async () => {}
  });

  context.setupIPCListeners();
  return { context, listeners, persisted, overlayResults };
}

function createEndedPoe1Session(overrides = {}) {
  return {
    id: 'session-1',
    mapName: 'Dunes Map',
    farmTypeId: 'breach',
    poeVersion: 'poe1',
    league: 'Mirage',
    startedAt: '2026-05-06T12:00:00.000Z',
    endedAt: '2026-05-06T12:04:00.000Z',
    durationSeconds: 240,
    costChaos: 0,
    totalLootChaos: 0,
    profitChaos: 0,
    ...overrides
  };
}

test('session-ended events show the map result overlay with the loot recorded in the session', async () => {
  const { context, listeners, persisted, overlayResults } = loadSessionEndedListener();

  await listeners.sessionEnded(createEndedPoe1Session({ totalLootChaos: 42, profitChaos: 42 }));
  await listeners.sessionEnded(createEndedPoe1Session({
    id: 'session-2',
    startedAt: '2026-05-06T12:10:00.000Z',
    endedAt: '2026-05-06T12:13:00.000Z',
    durationSeconds: 180
  }));

  assert.deepEqual(
    overlayResults.map((result) => [result.sessionId, result.farmType, result.durationSeconds, result.netProfit]),
    [['session-1', 'Breach', 240, 42], ['session-2', 'Breach', 180, 0]]
  );
  assert.deepEqual(persisted.map((result) => result.id), overlayResults.map((result) => result.id));
  // A PoE1 map without loot is still a completed result, so the dashboard lists it.
  assert.equal(context.isDisplayableMapResult(persisted[1]), true);
});

test('session-ended events leave sessions completed by a stash diff to that result', async () => {
  const { listeners, persisted, overlayResults } = loadSessionEndedListener({
    stashState: { lastMapResult: { id: 'map-result-session-1-1778068800000', sessionId: 'session-1' } }
  });

  await listeners.sessionEnded(createEndedPoe1Session({ totalLootChaos: 40, profitChaos: 35 }));

  assert.deepEqual(persisted, []);
  assert.deepEqual(overlayResults, []);
});

test('prices-updated events give the dashboard views the Divine and Mirror rates main just loaded', async () => {
  const listeners = {};
  const rateRequests = [];
  const renders = [];
  const context = loadFunctions([
    'normalizeProfitPoeVersion',
    'getProfitCurrencyModel',
    'getProfitCurrencyLeague',
    'getProfitCurrencyRateKey',
    'getProfitCurrencyRates',
    'setProfitCurrencyRates',
    'refreshProfitCurrencyRates',
    'getProfitTierFor',
    'handlePricesUpdated',
    'setupIPCListeners'
  ], {
    state: {
      settings: { poeVersion: 'poe1' },
      profitCurrencyRates: {},
      currentUser: { id: 'user-1' }
    },
    window: {
      t: (key) => key,
      profitTierModel: require('../src/modules/profitTierModel'),
      electronAPI: {
        onMapEntered: (handler) => { listeners.mapEntered = handler; },
        onMapExited: (handler) => { listeners.mapExited = handler; },
        onSessionStarted: (handler) => { listeners.sessionStarted = handler; },
        onSessionEnded: (handler) => { listeners.sessionEnded = handler; },
        onLootAdded: (handler) => { listeners.lootAdded = handler; },
        onNavigate: (handler) => { listeners.navigate = handler; },
        onPricesUpdated: (handler) => { listeners.pricesUpdated = handler; },
        async getProfitCurrencyRates(options) {
          rateRequests.push({ ...options });
          return { divineChaos: 150, mirrorChaos: 90000, league: options.league };
        }
      }
    },
    getSelectedTrackerContext: () => ({ poeVersion: 'poe1', league: 'Standard' }),
    renderLatestMapResult: () => renders.push('latestMapResult'),
    renderMapResultHistory: () => renders.push('mapResultHistory'),
    renderSessionsList: () => renders.push('sessionsList'),
    updateActiveSessionUI: () => renders.push('activeSession'),
    renderRecentLoot: () => renders.push('recentLoot'),
    renderSessionDrawer: (options) => renders.push(`sessionDrawer:keepForm=${options?.keepForm}`),
    loadDashboardStats: async () => renders.push('dashboardStats')
  });
  context.state.selectedSession = { id: 'run-1' };

  context.setupIPCListeners();
  assert.equal(context.getProfitTierFor(200, 'poe1', { league: 'Mirage' }), 'normal');

  await listeners.pricesUpdated({ poeVersion: 'poe1', league: 'Mirage', itemCount: 900 });

  // The rates come from the cache main just filled, so this refresh never asks poe.ninja itself.
  assert.deepEqual(rateRequests, [{ poeVersion: 'poe1', league: 'Mirage', cacheOnly: true }]);
  assert.equal(context.getProfitTierFor(200, 'poe1', { league: 'Mirage' }), 'rare');
  assert.deepEqual(renders, [
    'latestMapResult', 'mapResultHistory', 'sessionsList', 'activeSession', 'recentLoot', 'sessionDrawer:keepForm=true', 'dashboardStats'
  ]);
});

test('poe2 result smoke persists zero-profit map result and projects it into Last Map Result', async () => {
  const listeners = {};
  const savedResults = [];
  const elements = {
    lastMapResultCard: {
      dataset: {
        resultState: 'empty'
      }
    },
    lastMapResultFarmType: {
      textContent: ''
    },
    lastMapResultDuration: {
      textContent: ''
    },
    lastMapResultProfit: {
      innerHTML: ''
    }
  };
  const state = {
    currentSession: {
      id: 'local-session-1'
    },
    settings: {
      poeVersion: 'poe2'
    },
    account: {
      accountName: 'Esquetta#4179',
      summary: {
        id: 'char-1',
        name: 'KocaAyVeMasha',
        league: 'Fate of the Vaal'
      }
    },
    farmType: {
      selectedFarmTypeId: 'abyss'
    },
    mapResults: []
  };
  const context = loadFunctions([
    'setRuntimeSessionState',
    'getSessionNumber',
    'getSessionTimestampMs',
    'getCompletedSessionDurationSeconds',
    'getCompletedSessionFarmTypeLabel',
    'getScannedTopOutputs',
    'createCompletedSessionMapResult',
    'normalizeCompletedSessionPoeVersion',
    'shouldPersistCompletedSessionMapResult',
    'persistCompletedSessionMapResult',
    'persistMapResultHistory',
    'formatMapResultProfitHTML',
    'renderLatestMapResult',
    'setupIPCListeners'
  ], {
    elements,
    state,
    window: {
      t: (key, values = {}) => `${key}:${values.value || values.mapName || ''}`,
      electronAPI: {
        onMapEntered: (handler) => { listeners.mapEntered = handler; },
        onMapExited: (handler) => { listeners.mapExited = handler; },
        onSessionStarted: (handler) => { listeners.sessionStarted = handler; },
        onSessionEnded: (handler) => { listeners.sessionEnded = handler; },
        onLootAdded: (handler) => { listeners.lootAdded = handler; },
        onNavigate: (handler) => { listeners.navigate = handler; },
        async saveMapResult(result) {
          savedResults.push(JSON.parse(JSON.stringify(result)));
          return [result];
        }
      }
    },
    getFarmTypeModel: () => ({
      getFarmTypeById: (id) => (id === 'abyss' ? { id: 'abyss', label: 'Abyss' } : null),
      listFarmTypes: () => [{ id: 'abyss', label: 'Abyss' }]
    }),
    getSelectedTrackerContext: () => ({
      poeVersion: 'poe2',
      league: 'Fate of the Vaal',
      farmTypeId: 'abyss'
    }),
    normalizePoeVersion: (value) => value,
    formatDuration: (seconds) => `duration:${seconds}`,
    profitCurrencyHTML: (value, iconSize, poeVersion) => `profit:${value}:${iconSize}:${poeVersion}`,
    renderRuntimeSessionState: () => {},
    updateActiveSessionUI: () => {},
    stopSessionClock: () => {},
    showToast: () => {},
    refreshTrackerData: async () => {}
  });

  context.setupIPCListeners();
  listeners.mapExited({
    mapName: 'Channel',
    runtimeSession: {
      instances: [{
        areaName: 'Channel',
        enteredAt: '2026-05-06T12:00:00.000Z',
        exitedAt: '2026-05-06T12:05:30.000Z',
        durationSeconds: 330,
        status: 'completed'
      }],
      summary: {
        status: 'idle',
        lastAreaName: 'Channel'
      }
    }
  });
  await listeners.sessionEnded({
    id: 'local-session-1',
    mapName: 'Channel',
    farmTypeId: 'abyss',
    poeVersion: 'poe2',
    league: 'Fate of the Vaal',
    startedAt: '2026-05-06T12:00:00.000Z',
    endedAt: '2026-05-06T12:05:30.000Z',
    durationSeconds: 330,
    totalLootChaos: 0,
    profitChaos: 0
  });

  assert.equal(state.runtimeSession.instances[0].durationSeconds, 330);
  assert.equal(savedResults.length, 1);
  assert.equal(savedResults[0].poeVersion, 'poe2');
  assert.equal(savedResults[0].league, 'Fate of the Vaal');
  assert.equal(savedResults[0].mapName, 'Channel');
  assert.equal(savedResults[0].farmType, 'Abyss');
  assert.equal(savedResults[0].durationSeconds, 330);
  assert.equal(savedResults[0].netProfit, 0);
  assert.equal(elements.lastMapResultCard.dataset.resultState, 'ready');
  assert.equal(elements.lastMapResultFarmType.textContent, 'Abyss');
  assert.equal(elements.lastMapResultDuration.textContent, 'duration:330');
  assert.equal(elements.lastMapResultProfit.innerHTML, 'profit:0:22:poe2');
});

test('dashboard html includes a last map result card with summary fields', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="last-map-result-card"/);
  assert.match(html, /id="last-map-result-farm-type"/);
  assert.match(html, /id="last-map-result-duration"/);
  assert.match(html, /id="last-map-result-profit"/);
});

test('dashboard html includes a map result history card with a farm type filter', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, />Map Result History</);
  assert.match(html, /id="map-result-filter"/);
  assert.match(html, /id="map-result-history"/);
});

test('dashboard html includes a branded farm publish modal', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="farm-publish-modal"/);
  assert.match(html, /id="farm-publish-visibility"/);
  assert.match(html, /id="farm-publish-description"/);
  assert.match(html, /id="farm-publish-investment-known"/);
});

test('end map button uses the shared visible icon wrapper', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="end-session-btn"[\s\S]*class="btn-glyph btn-glyph-stop"/);
  assert.match(html, /id="end-session-btn"[\s\S]*data-i18n="dashboard\.endMap"/);
});

test('renderer shows an empty last map result state when no completed result exists', () => {
  const elements = {
    lastMapResultCard: {
      dataset: {
        resultState: 'ready'
      }
    },
    lastMapResultFarmType: {
      textContent: 'Old value'
    },
    lastMapResultDuration: {
      textContent: '12m 34s'
    },
    lastMapResultProfit: {
      innerHTML: '123c'
    }
  };
  const context = loadFunctions(['formatMapResultProfitHTML', 'renderLatestMapResult'], {
    elements,
    state: {
      mapResults: []
    },
    formatDuration: () => {
      throw new Error('formatDuration should not be called for the empty state');
    },
    currencyHTML: () => {
      throw new Error('currencyHTML should not be called for the empty state');
    }
  });

  context.renderLatestMapResult();

  assert.equal(elements.lastMapResultCard.dataset.resultState, 'empty');
  assert.equal(elements.lastMapResultFarmType.textContent, 'No completed map yet');
  assert.equal(elements.lastMapResultDuration.textContent, '—');
  assert.equal(elements.lastMapResultProfit.innerHTML, '—');
});

test('renderer keeps the last map result card empty when the latest result has no completed duration', () => {
  const elements = {
    lastMapResultCard: {
      dataset: {
        resultState: 'ready'
      }
    },
    lastMapResultFarmType: {
      textContent: 'Old value'
    },
    lastMapResultDuration: {
      textContent: '12m 34s'
    },
    lastMapResultProfit: {
      innerHTML: '123c'
    }
  };
  const context = loadFunctions(['formatMapResultProfitHTML', 'renderLatestMapResult'], {
    elements,
    state: {
      mapResults: [
        {
          farmType: 'Ritual',
          durationSeconds: 0,
          netProfit: 127,
          poeVersion: 'poe2'
        }
      ]
    },
    formatDuration: () => {
      throw new Error('formatDuration should not be called for incomplete results');
    },
    currencyHTML: () => {
      throw new Error('currencyHTML should not be called for incomplete results');
    }
  });

  context.renderLatestMapResult();

  assert.equal(elements.lastMapResultCard.dataset.resultState, 'empty');
  assert.equal(elements.lastMapResultFarmType.textContent, 'No completed map yet');
  assert.equal(elements.lastMapResultDuration.textContent, '—');
  assert.equal(elements.lastMapResultProfit.innerHTML, '—');
});

test('renderer skips stale zero-value PoE1 lifecycle results in the latest map card', () => {
  const elements = {
    lastMapResultCard: {
      dataset: {
        resultState: 'empty'
      }
    },
    lastMapResultFarmType: {
      textContent: ''
    },
    lastMapResultDuration: {
      textContent: ''
    },
    lastMapResultProfit: {
      innerHTML: ''
    }
  };
  const context = loadFunctions([
    'getSessionNumber',
    'normalizeCompletedSessionPoeVersion',
    'isPoe1ZeroLifecycleResult',
    'isDisplayableMapResult',
    'formatMapResultProfitHTML',
    'renderLatestMapResult'
  ], {
    elements,
    state: {
      settings: {
        poeVersion: 'poe1'
      },
      mapResults: [
        {
          id: 'map-result-local-session-1',
          farmType: 'Breach',
          durationSeconds: 90,
          inputValue: 0,
          outputValue: 0,
          netProfit: 0,
          topInputs: [],
          topOutputs: [],
          poeVersion: 'poe1'
        },
        {
          id: 'map-result-local-session-1-1775901600000',
          farmType: 'Breach',
          durationSeconds: 90,
          inputValue: 0,
          outputValue: 0,
          netProfit: 0,
          topInputs: [],
          topOutputs: [],
          poeVersion: 'poe1'
        }
      ]
    },
    formatDuration: (seconds) => `duration:${seconds}`,
    currencyHTML: (value, type, iconSize, poeVersion) => `profit:${value}:${type}:${iconSize}:${poeVersion}`
  });

  context.renderLatestMapResult();

  assert.equal(elements.lastMapResultCard.dataset.resultState, 'ready');
  assert.equal(elements.lastMapResultFarmType.textContent, 'Breach');
  assert.equal(elements.lastMapResultDuration.textContent, 'duration:90');
  assert.equal(elements.lastMapResultProfit.innerHTML, 'profit:0:chaos:22:poe1');
});

test('renderer projects only the latest map result into the dashboard card', () => {
  const elements = {
    lastMapResultCard: {
      dataset: {
        resultState: 'empty'
      }
    },
    lastMapResultFarmType: {
      textContent: ''
    },
    lastMapResultDuration: {
      textContent: ''
    },
    lastMapResultProfit: {
      innerHTML: ''
    }
  };
  const context = loadFunctions(['formatMapResultProfitHTML', 'renderLatestMapResult'], {
    elements,
    state: {
      mapResults: [
        {
          farmType: 'Ritual',
          durationSeconds: 185,
          netProfit: 127,
          poeVersion: 'poe2'
        },
        {
          farmType: 'Breach',
          durationSeconds: 999,
          netProfit: 1,
          poeVersion: 'poe1'
        }
      ]
    },
    formatDuration: (seconds) => `duration:${seconds}`,
    currencyHTML: (value, type, iconSize, poeVersion) => `profit:${value}:${type}:${iconSize}:${poeVersion}`
  });

  context.renderLatestMapResult();

  assert.equal(elements.lastMapResultCard.dataset.resultState, 'ready');
  assert.equal(elements.lastMapResultFarmType.textContent, 'Ritual');
  assert.equal(elements.lastMapResultDuration.textContent, 'duration:185');
  assert.equal(elements.lastMapResultProfit.innerHTML, 'profit:127:chaos:22:poe2');
});

test('renderer shows unavailable profit results as not calculated', () => {
  const elements = {
    lastMapResultCard: {
      dataset: {
        resultState: 'empty'
      }
    },
    lastMapResultFarmType: {
      textContent: ''
    },
    lastMapResultDuration: {
      textContent: ''
    },
    lastMapResultProfit: {
      innerHTML: ''
    }
  };
  const context = loadFunctions(['formatMapResultProfitHTML', 'renderLatestMapResult'], {
    elements,
    state: {
      mapResults: [
        {
          farmType: 'Breach',
          durationSeconds: 240,
          netProfit: 0,
          poeVersion: 'poe1',
          profitUnavailable: true
        }
      ]
    },
    formatDuration: (seconds) => `duration:${seconds}`,
    currencyHTML: () => {
      throw new Error('currencyHTML should not be called for unavailable profit');
    }
  });

  context.renderLatestMapResult();

  assert.equal(elements.lastMapResultCard.dataset.resultState, 'ready');
  assert.equal(elements.lastMapResultFarmType.textContent, 'Breach');
  assert.equal(elements.lastMapResultProfit.innerHTML, '<span class="profit-unavailable">Not calculated</span>');
});

test('renderer tags the latest map result with its loot-filter profit tier', () => {
  const elements = {
    lastMapResultCard: { dataset: { resultState: 'empty' } },
    lastMapResultFarmType: { textContent: '' },
    lastMapResultDuration: { textContent: '' },
    lastMapResultProfit: { innerHTML: '', dataset: {} }
  };
  const state = {
    settings: { poeVersion: 'poe1' },
    mapResults: [{ farmType: 'Ritual', durationSeconds: 300, netProfit: 412, poeVersion: 'poe1' }]
  };
  const context = loadFunctions([
    'getProfitTierFor',
    'applyProfitTier',
    'formatMapResultProfitHTML',
    'getMapResultProfitTier',
    'renderLatestMapResult'
  ], {
    elements,
    state,
    window: { profitTierModel: require('../src/modules/profitTierModel') },
    normalizeProfitPoeVersion: (value) => value,
    getProfitCurrencyRates: () => ({ divineChaos: 150 }),
    profitCurrencyHTML: (value) => `profit:${value}`,
    formatDuration: (seconds) => `duration:${seconds}`
  });

  context.renderLatestMapResult();
  assert.equal(elements.lastMapResultProfit.dataset.profitTier, 'rare');

  state.mapResults = [];
  context.renderLatestMapResult();
  assert.equal(elements.lastMapResultProfit.dataset.profitTier, undefined);
});

test('renderer colours farm names by their league content', () => {
  const elements = {
    lastMapResultCard: { dataset: { resultState: 'empty' } },
    lastMapResultFarmType: { textContent: '', dataset: {} },
    lastMapResultDuration: { textContent: '' },
    lastMapResultProfit: { innerHTML: '', dataset: {} }
  };
  const state = {
    settings: { poeVersion: 'poe1' },
    mapResults: [{ farmType: 'Ritual', durationSeconds: 300, netProfit: 412, poeVersion: 'poe1' }]
  };
  const context = loadFunctions([
    'getFarmTypeIdFor',
    'farmTypeAttr',
    'applyFarmType',
    'formatMapResultProfitHTML',
    'renderLatestMapResult'
  ], {
    elements,
    state,
    window: { farmTypeModel: require('../src/modules/farmTypeModel') },
    normalizeProfitPoeVersion: (value) => value,
    getProfitCurrencyRates: () => ({ divineChaos: 150 }),
    profitCurrencyHTML: (value) => `profit:${value}`,
    formatDuration: (seconds) => `duration:${seconds}`
  });

  context.renderLatestMapResult();
  assert.equal(elements.lastMapResultFarmType.dataset.farmType, 'ritual');
  assert.equal(context.farmTypeAttr('Expedition'), ' data-farm-type="expedition"');
  assert.equal(context.farmTypeAttr('Unknown farm'), '');

  state.mapResults = [];
  context.renderLatestMapResult();
  assert.equal(elements.lastMapResultFarmType.dataset.farmType, undefined);
});

test('stylesheet gives every farm type its colour token', () => {
  const stylesCss = fs.readFileSync(path.join(desktopDir, 'src', 'styles.css'), 'utf8');
  const overlayHtml = fs.readFileSync(path.join(desktopDir, 'src', 'overlay.html'), 'utf8');
  const tokensCss = fs.readFileSync(path.join(desktopDir, 'src', 'tokens.css'), 'utf8');

  for (const { id } of require('../src/modules/farmTypeModel').FARM_TYPES) {
    assert.match(tokensCss, new RegExp(`--farm-${id}:\\s*#`), `tokens.css --farm-${id}`);
    const mapping = new RegExp(`\\[data-farm-type="${id}"\\]\\s*\\{\\s*--farm-color:\\s*var\\(--farm-${id}\\);`);
    assert.match(stylesCss, mapping, `styles.css ${id}`);
    assert.match(overlayHtml, mapping, `overlay.html ${id}`);
  }
});

test('dashboard loads the profit tier model before renderer app code', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /modules\/profitTierModel\.js[\s\S]*app\.js/);
});

test('renderer map result history keeps persisted ordering and populates farm-type filter options', () => {
  const filterCalls = [];
  const elements = {
    mapResultFilter: {
      value: '',
      innerHTML: ''
    },
    mapResultHistory: {
      innerHTML: ''
    }
  };
  const context = loadFunctions(['formatMapResultProfitHTML', 'renderMapResultHistory'], {
    elements,
    state: {
      settings: {
        poeVersion: 'poe1'
      },
      mapResults: [
        {
          id: 'result-3',
          farmType: 'Ritual',
          durationSeconds: 185,
          netProfit: 127,
          poeVersion: 'poe2',
          createdAt: '2026-04-12T09:30:00.000Z'
        },
        {
          id: 'result-2',
          farmType: 'Breach',
          durationSeconds: 240,
          netProfit: 88,
          poeVersion: 'poe1',
          createdAt: '2026-04-12T08:30:00.000Z'
        },
        {
          id: 'result-1',
          farmType: 'Ritual',
          durationSeconds: 360,
          netProfit: 42,
          poeVersion: 'poe1',
          createdAt: '2026-04-12T07:30:00.000Z'
        }
      ]
    },
    escapeHTML: (value) => String(value),
    formatDuration: (seconds) => `duration:${seconds}`,
    currencyHTML: (value, type, iconSize, poeVersion) => `profit:${value}:${type}:${iconSize}:${poeVersion}`,
    timeAgo: (value) => `ago:${value}`,
    getMapResultStoreModel: () => ({
      filterMapResults(results, filters) {
        filterCalls.push({
          resultIds: results.map((entry) => entry.id),
          filters: { ...filters }
        });
        return filters.farmType
          ? results.filter((entry) => entry.farmType === filters.farmType)
          : results;
      }
    })
  });

  context.renderMapResultHistory();

  assert.deepEqual(filterCalls, [{
    resultIds: ['result-3', 'result-2', 'result-1'],
    filters: { farmType: '' }
  }]);
  assert.match(elements.mapResultFilter.innerHTML, /All farms/);
  assert.match(elements.mapResultFilter.innerHTML, /value="Ritual"/);
  assert.match(elements.mapResultFilter.innerHTML, /value="Breach"/);
  assert.match(elements.mapResultHistory.innerHTML, /map-result-publish-btn/);
  assert.match(elements.mapResultHistory.innerHTML, />\s*Share\s*</);
  assert.ok(
    elements.mapResultHistory.innerHTML.indexOf('result-3') < elements.mapResultHistory.innerHTML.indexOf('result-2'),
    'expected newest persisted result to render before older entries'
  );
  assert.ok(
    elements.mapResultHistory.innerHTML.indexOf('result-2') < elements.mapResultHistory.innerHTML.indexOf('result-1'),
    'expected renderer to keep state.mapResults ordering'
  );
});

test('renderer map result history applies the selected farm-type filter through the store model', () => {
  const filterCalls = [];
  const elements = {
    mapResultFilter: {
      value: 'Ritual',
      innerHTML: ''
    },
    mapResultHistory: {
      innerHTML: ''
    }
  };
  const context = loadFunctions(['formatMapResultProfitHTML', 'renderMapResultHistory'], {
    elements,
    state: {
      settings: {
        poeVersion: 'poe1'
      },
      mapResults: [
        {
          id: 'result-3',
          farmType: 'Ritual',
          durationSeconds: 185,
          netProfit: 127,
          poeVersion: 'poe2',
          createdAt: '2026-04-12T09:30:00.000Z'
        },
        {
          id: 'result-2',
          farmType: 'Breach',
          durationSeconds: 240,
          netProfit: 88,
          poeVersion: 'poe1',
          createdAt: '2026-04-12T08:30:00.000Z'
        },
        {
          id: 'result-1',
          farmType: 'Ritual',
          durationSeconds: 360,
          netProfit: 42,
          poeVersion: 'poe1',
          createdAt: '2026-04-12T07:30:00.000Z'
        }
      ]
    },
    escapeHTML: (value) => String(value),
    formatDuration: (seconds) => `duration:${seconds}`,
    currencyHTML: (value, type, iconSize, poeVersion) => `profit:${value}:${type}:${iconSize}:${poeVersion}`,
    timeAgo: (value) => `ago:${value}`,
    getMapResultStoreModel: () => ({
      filterMapResults(results, filters) {
        filterCalls.push({
          resultIds: results.map((entry) => entry.id),
          filters: { ...filters }
        });
        return filters.farmType
          ? results.filter((entry) => entry.farmType === filters.farmType)
          : results;
      }
    })
  });

  context.renderMapResultHistory();

  assert.deepEqual(filterCalls, [{
    resultIds: ['result-3', 'result-2', 'result-1'],
    filters: { farmType: 'Ritual' }
  }]);
  assert.match(elements.mapResultHistory.innerHTML, /result-3/);
  assert.match(elements.mapResultHistory.innerHTML, /result-1/);
  assert.doesNotMatch(elements.mapResultHistory.innerHTML, /result-2/);
  assert.equal(elements.mapResultFilter.value, 'Ritual');
});

test('renderer map result history ignores incomplete results before applying farm filters', () => {
  const filterCalls = [];
  const elements = {
    mapResultFilter: {
      value: '',
      innerHTML: ''
    },
    mapResultHistory: {
      innerHTML: ''
    }
  };
  const context = loadFunctions(['formatMapResultProfitHTML', 'renderMapResultHistory'], {
    elements,
    state: {
      settings: {
        poeVersion: 'poe1'
      },
      mapResults: [
        {
          id: 'result-incomplete',
          farmType: 'Ritual',
          durationSeconds: 0,
          netProfit: 999,
          poeVersion: 'poe2',
          createdAt: '2026-04-12T10:30:00.000Z'
        },
        {
          id: 'result-complete',
          farmType: 'Breach',
          durationSeconds: 240,
          netProfit: 88,
          poeVersion: 'poe1',
          createdAt: '2026-04-12T08:30:00.000Z'
        }
      ]
    },
    escapeHTML: (value) => String(value),
    formatDuration: (seconds) => `duration:${seconds}`,
    currencyHTML: (value, type, iconSize, poeVersion) => `profit:${value}:${type}:${iconSize}:${poeVersion}`,
    timeAgo: (value) => `ago:${value}`,
    getMapResultStoreModel: () => ({
      filterMapResults(results, filters) {
        filterCalls.push({
          resultIds: results.map((entry) => entry.id),
          filters: { ...filters }
        });
        return results;
      }
    })
  });

  context.renderMapResultHistory();

  assert.deepEqual(filterCalls, [{
    resultIds: ['result-complete'],
    filters: { farmType: '' }
  }]);
  assert.match(elements.mapResultHistory.innerHTML, /result-complete/);
  assert.doesNotMatch(elements.mapResultHistory.innerHTML, /result-incomplete/);
});

test('renderer map result history marks published results as shared', () => {
  const elements = {
    mapResultFilter: {
      value: '',
      innerHTML: ''
    },
    mapResultHistory: {
      innerHTML: ''
    }
  };
  const context = loadFunctions([
    'getMapResultPublishLabel',
    'canPublishMapResult',
    'formatMapResultProfitHTML',
    'renderMapResultHistory'
  ], {
    elements,
    state: {
      settings: {
        poeVersion: 'poe1'
      },
      mapResults: [
        {
          id: 'published-result',
          farmType: 'Breach',
          durationSeconds: 240,
          netProfit: 88,
          poeVersion: 'poe1',
          publishState: 'published',
          createdAt: '2026-04-12T08:30:00.000Z'
        }
      ]
    },
    escapeHTML: (value) => String(value),
    formatDuration: (seconds) => `duration:${seconds}`,
    currencyHTML: (value, type, iconSize, poeVersion) => `profit:${value}:${type}:${iconSize}:${poeVersion}`,
    timeAgo: (value) => `ago:${value}`,
    isDisplayableMapResult: (result) => Number(result?.durationSeconds || 0) > 0,
    getMapResultStoreModel: () => ({
      filterMapResults(results) {
        return results;
      }
    })
  });

  context.renderMapResultHistory();

  assert.match(elements.mapResultHistory.innerHTML, />Published</);
  assert.match(elements.mapResultHistory.innerHTML, />\s*Shared\s*</);
  assert.match(elements.mapResultHistory.innerHTML, /disabled/);
});

test('renderer offers sharing only with online features on and a server sign-in', () => {
  const state = { onlineAccount: { enabled: false, signedIn: true } };
  const context = loadFunctions(['canPublishMapResult'], {
    state,
    isDisplayableMapResult: () => true
  });
  const result = { id: 'local-result', durationSeconds: 240 };

  assert.equal(context.canPublishMapResult(result), false);
  state.onlineAccount = { enabled: true, signedIn: false };
  assert.equal(context.canPublishMapResult(result), false);
  state.onlineAccount = { enabled: true, signedIn: true };
  assert.equal(context.canPublishMapResult(result), true);
});

test('renderer Farming Hub asks for nothing while online features are off', async () => {
  let hubRequests = 0;
  const farmingHubList = { innerHTML: '' };
  const context = loadFunctions(['loadFarmingHubRuns'], {
    state: { onlineAccount: { enabled: false, signedIn: false }, farmingHubRuns: [{ id: 'old-run' }] },
    elements: { farmingHubList },
    escapeHTML: (value) => String(value),
    window: {
      t: (key) => key,
      electronAPI: {
        async getFarmingHubRuns() {
          hubRequests += 1;
          return { runs: [] };
        }
      }
    }
  });

  await context.loadFarmingHubRuns();

  assert.equal(hubRequests, 0);
  assert.equal(context.state.farmingHubRuns.length, 0);
  assert.match(farmingHubList.innerHTML, /farmingHub\.onlineOff/);
});

test('renderer publish handler calls desktop bridge and refreshes local history', async () => {
  let publishPayload = null;
  let busyWhilePublishing = null;
  const toasts = [];
  const buttonAttributes = {};
  const farmPublishConfirmBtn = {
    disabled: false,
    dataset: {},
    querySelector: () => null,
    setAttribute: (name, value) => {
      buttonAttributes[name] = value;
    },
    removeAttribute: (name) => {
      delete buttonAttributes[name];
    }
  };
  const context = loadFunctions([
    'setButtonBusy',
    'canPublishMapResult',
    'findMapResultById',
    'handleMapResultPublish'
  ], {
    state: {
      currentUser: {
        username: 'Esquetta'
      },
      onlineAccount: { enabled: true, signedIn: true },
      mapResults: [
        {
          id: 'result-1',
          localRunId: 'local-1',
          farmType: 'Breach',
          mapName: 'Dunes Map',
          durationSeconds: 240,
          netProfit: 88,
          poeVersion: 'poe1'
        }
      ]
    },
    elements: {
      farmPublishConfirmBtn
    },
    isDisplayableMapResult: (result) => Number(result?.durationSeconds || 0) > 0,
    requestFarmPublishDetails: async () => ({
      visibility: 'public',
      setupDescription: 'Breach scarabs',
      investmentKnown: false,
      farmType: 'Breach',
      publisherDisplayName: 'Esquetta'
    }),
    window: {
      electronAPI: {
        async publishMapResults(payload) {
          publishPayload = payload;
          busyWhilePublishing = [farmPublishConfirmBtn.disabled, buttonAttributes['aria-busy']];
          return {
            run: { id: 'published-1' },
            history: [
              {
                id: 'result-1',
                publishState: 'published',
                publishedRunId: 'published-1'
              }
            ]
          };
        }
      }
    },
    renderLatestMapResult() {},
    renderMapResultHistory() {},
    showToast(title, message, type) {
      toasts.push({ title, message, type });
    },
    getUserFacingErrorMessage: () => 'publish failed'
  });

  await context.handleMapResultPublish('result-1');

  assert.deepEqual(JSON.parse(JSON.stringify(publishPayload)), {
    resultIds: ['result-1'],
    options: {
      visibility: 'public',
      setupDescription: 'Breach scarabs',
      investmentKnown: false,
      farmType: 'Breach',
      publisherDisplayName: 'Esquetta'
    }
  });
  assert.equal(context.state.mapResults[0].publishState, 'published');
  assert.deepEqual(toasts, [
    { title: 'Farming Hub', message: 'Farm result published.', type: 'success' }
  ]);
  assert.deepEqual(busyWhilePublishing, [true, 'true']);
  assert.equal(farmPublishConfirmBtn.disabled, false);
  assert.equal(buttonAttributes['aria-busy'], undefined);
});

test('sessions list counts loot from list rows and shows live duration for the active session', () => {
  const elements = { sessionsList: { innerHTML: '' } };
  const sessions = [
    {
      id: 'active-1',
      mapName: 'Crimson Temple',
      status: 'active',
      poeVersion: 'poe1',
      league: 'Mirage',
      startedAt: '2026-10-21T11:56:00.000Z',
      durationSec: null,
      profitChaos: 0,
      lootCount: 152
    },
    { id: 'done-1', mapName: 'Mesa', status: 'completed', poeVersion: 'poe1', durationSec: 330, lootCount: 1 },
    { id: 'detail-1', mapName: 'Dunes', status: 'completed', poeVersion: 'poe1', durationSec: 60, lootEntries: [{ quantity: 3 }, { quantity: 2 }] }
  ];
  const context = loadFunctions(['renderSessionsList'], {
    elements,
    state: { currentUser: { id: 'user-1' }, sessions },
    window: { t: (key) => key },
    closeSessionDrawer() {},
    getFilteredSessions: () => sessions,
    getSessionPoeVersion: (session) => session.poeVersion,
    getSessionFarmTypeId: () => 'breach',
    getSessionFarmTypeLabel: () => 'Breach',
    escapeHTML: (value) => String(value),
    timeAgo: () => 'just now',
    currencyHTML: (value) => `${value}c`,
    formatDuration: (seconds) => `duration:${seconds}`,
    getLiveDuration: () => 240
  });

  context.renderSessionsList();

  const rows = elements.sessionsList.innerHTML.split('class="session-item"').slice(1);
  const values = rows.map((row) => [...row.matchAll(/session-secondary-value">([^<]*)</g)].map((match) => match[1]));
  assert.deepEqual(values, [['duration:240', '152'], ['duration:330', '1'], ['duration:60', '5']]);
});

test('session drawer shows live duration while the session is active and the stored one after', () => {
  const elements = {
    sessionDrawerTitle: { textContent: '' },
    sessionDrawerLootCount: { textContent: '' },
    sessionDrawerSummary: { innerHTML: '' },
    sessionDrawerAnalytics: { innerHTML: '' },
    sessionDrawerLoot: { innerHTML: '' }
  };
  const state = {
    settings: { poeVersion: 'poe1' },
    selectedSession: {
      id: 'active-1',
      mapName: 'Crimson Temple',
      status: 'active',
      poeVersion: 'poe1',
      startedAt: '2026-10-21T11:56:00.000Z',
      endedAt: null,
      durationSec: null,
      lootEntries: []
    }
  };
  const context = loadFunctions(['renderSessionDrawer'], {
    elements,
    state,
    window: { t: (key) => key },
    buildSessionAnalytics: () => [],
    escapeHTML: (value) => String(value),
    currencyHTML: (value) => `${value}c`,
    formatDuration: (seconds) => `duration:${seconds}`,
    getLiveDuration: () => 240
  });
  const durationValue = () => elements.sessionDrawerSummary.innerHTML
    .match(/class="session-drawer-duration"[^>]*>([^<]*)</)[1];

  context.renderSessionDrawer();
  assert.equal(durationValue(), 'duration:240');

  state.selectedSession = { ...state.selectedSession, status: 'completed', endedAt: '2026-10-21T12:01:30.000Z', durationSec: 330 };
  context.renderSessionDrawer();
  assert.equal(durationValue(), 'duration:330');
});

const PROFIT_DISPLAY_FUNCTIONS = [
  'formatCurrencyAmount', 'currencyHTML', 'normalizeProfitPoeVersion', 'getProfitCurrencyModel', 'getProfitCurrencyRateKey',
  'getProfitCurrencyRates', 'profitCurrencyHTML', 'getProfitTierFor', 'applyProfitTier'
];

// Runs app.js's own `const NAME = {...};` tables in a test context, so lookups use the real data.
function loadConstants(context, names) {
  const source = fs.readFileSync(appJsPath, 'utf8');
  for (const name of names) {
    const start = source.indexOf(`const ${name} = {`);
    assert.notEqual(start, -1, `${name} should exist`);
    vm.runInContext(source.slice(start, source.indexOf('\n};', start) + 3), context);
  }
  return context;
}

function createProfitDisplayContext(functionNames, overrides = {}) {
  return loadFunctions([...PROFIT_DISPLAY_FUNCTIONS, ...functionNames], {
    window: {
      profitCurrencyModel: require('../src/modules/profitCurrencyModel.js'),
      profitTierModel: require('../src/modules/profitTierModel.js'),
      t: (key) => key
    },
    CURRENCY_NAMES: { chaos: 'Chaos Orb', divine: 'Divine Orb', mirror: 'Mirror of Kalandra' },
    getCurrencyAssetPath: (type) => `assets/currency/poe1/${type}.png`,
    ...overrides,
    state: {
      settings: { poeVersion: 'poe1' },
      // 1 divine = 100c and 1 mirror = 200,000c, so tiers are easy to read off.
      profitCurrencyRates: {
        'poe1:Standard': { divineChaos: 100, mirrorChaos: 200000 },
        poe1: { divineChaos: 100, mirrorChaos: 200000 }
      },
      ...overrides.state
    }
  });
}

const chipText = (html) => html.match(/<span class="value-chip">([^<]*) <img[^>]*alt="([^"]+)"/).slice(1, 3);

test('the latest map result is a signed hero number in its tier colour with the tier badge', () => {
  const elements = {
    lastMapResultCard: { dataset: {} },
    lastMapResultFarmType: { textContent: '' },
    lastMapResultDuration: { textContent: '' },
    lastMapResultProfit: { innerHTML: '', dataset: {} },
    lastMapResultMeme: { innerHTML: '' }
  };
  const context = createProfitDisplayContext(
    ['formatMapResultProfitHTML', 'getMapResultProfitTier', 'profitMemeHTML', 'renderLatestMapResult'],
    {
      elements,
      PROFIT_MEME_LABELS: { bricked: 'Bricked', pog: 'Pog', juiced: 'Juiced', mirror: 'Mirror tier' },
      formatDuration: (seconds) => `duration:${seconds}`,
      state: { mapResults: [{ farmType: 'Breach', durationSeconds: 240, netProfit: 750, poeVersion: 'poe1' }] }
    }
  );

  context.renderLatestMapResult();

  assert.equal(elements.lastMapResultCard.dataset.resultState, 'ready');
  assert.deepEqual(chipText(elements.lastMapResultProfit.innerHTML), ['+7.50', 'Divine Orb']);
  assert.equal(elements.lastMapResultProfit.dataset.profitTier, 'unique');
  assert.match(elements.lastMapResultMeme.innerHTML, /data-meme="juiced"/);

  context.state.mapResults = [];
  context.renderLatestMapResult();
  assert.equal(elements.lastMapResultProfit.innerHTML, '—');
  assert.equal(elements.lastMapResultMeme.innerHTML, '');
});

test("today's summary tiers the per-map average, flags only a losing day and shows per hour and time mapped", async () => {
  const stat = () => ({ textContent: '', innerHTML: '', dataset: {} });
  const elements = {
    todaySessions: stat(),
    todayProfit: stat(),
    todayAvg: stat(),
    todayPerHour: stat(),
    todayTime: stat()
  };
  let summary = { totalSessions: 4, totalProfit: -60, avgProfitPerMap: 150, avgProfitPerHour: 97800, totalDuration: 3900 };
  let tiersWhileLoading = null;
  const context = createProfitDisplayContext(['formatHoursMinutes', 'loadDashboardStats'], {
    elements,
    getSelectedTrackerContext: () => ({ poeVersion: 'poe1', league: 'Standard' }),
    window: {
      profitCurrencyModel: require('../src/modules/profitCurrencyModel.js'),
      profitTierModel: require('../src/modules/profitTierModel.js'),
      t: (key) => key,
      electronAPI: {
        getDashboardStats: async () => {
          tiersWhileLoading = [elements.todayProfit.dataset.profitTier, elements.todayAvg.dataset.profitTier];
          return { summary };
        }
      }
    },
    state: { currentUser: { id: 'profile-1' } }
  });

  await context.loadDashboardStats();

  assert.equal(elements.todaySessions.textContent, '4');
  assert.deepEqual(chipText(elements.todayProfit.innerHTML), ['-60.0', 'Chaos Orb']);
  assert.equal(elements.todayProfit.dataset.profitTier, 'loss');
  assert.deepEqual(chipText(elements.todayAvg.innerHTML), ['1.50', 'Divine Orb']);
  assert.equal(elements.todayAvg.dataset.profitTier, 'rare');
  assert.deepEqual(chipText(elements.todayPerHour.innerHTML), ['978', 'Divine Orb']);
  assert.equal(elements.todayTime.textContent, '1:05');

  // A winning day is signed and keeps the brass colour, however big it is; the '...' state drops the old tiers.
  summary = { totalSessions: 6, totalProfit: 54000, avgProfitPerMap: 9000, avgProfitPerHour: 0, totalDuration: 0 };
  await context.loadDashboardStats();
  assert.deepEqual(tiersWhileLoading, [undefined, undefined]);
  assert.deepEqual(chipText(elements.todayProfit.innerHTML), ['+540', 'Divine Orb']);
  assert.equal(elements.todayProfit.dataset.profitTier, undefined);
  assert.equal(elements.todayAvg.dataset.profitTier, 'unique');
  assert.equal(elements.todayTime.textContent, '0:00');

  // Before the first map there is no average to tier.
  summary = { totalSessions: 0, totalProfit: 0, avgProfitPerMap: 0, avgProfitPerHour: 0, totalDuration: 0 };
  await context.loadDashboardStats();
  assert.equal(elements.todayAvg.dataset.profitTier, undefined);
});

test('recent loot shows each drop in the adaptive currency of its own league', () => {
  const elements = { recentLootList: { innerHTML: '' } };
  const context = createProfitDisplayContext(['getLocalItemIconPath', 'itemSlotHTML', 'renderRecentLoot'], {
    elements,
    escapeHTML: (value) => String(value),
    timeAgo: () => '1m ago',
    state: {
      currentUser: { id: 'profile-1' },
      // Divines cost 100c in Standard and 200c in Mirage.
      profitCurrencyRates: {
        'poe1:Standard': { divineChaos: 100, mirrorChaos: 200000 },
        'poe1:Mirage': { divineChaos: 200, mirrorChaos: 200000 },
        poe1: { divineChaos: 100, mirrorChaos: 200000 }
      },
      recentLoot: [
        { itemName: 'Mirror of Kalandra', quantity: 2, chaosValue: 200000, session: { poeVersion: 'poe1', league: 'Standard', mapName: 'Crimson Temple Map' } },
        { itemName: 'Divine Orb', quantity: 2, chaosValue: 200, session: { poeVersion: 'poe1', league: 'Mirage', mapName: 'Mesa Map' } },
        { itemName: 'Chaos Orb', quantity: 40, chaosValue: 1, session: { poeVersion: 'poe1', league: 'Standard', mapName: 'Mesa Map' } }
      ]
    }
  });
  loadConstants(context, ['CURRENCY_IMAGE_VARIANTS', 'CURRENCY_IMAGES', 'LOCAL_ITEM_ICON_KEYS']);

  context.renderRecentLoot();

  const chips = [...elements.recentLootList.innerHTML.matchAll(/<span class="value-chip">([^<]*) <img[^>]*alt="([^"]+)"/g)]
    .map((match) => match.slice(1, 3));
  assert.deepEqual(chips, [['2.00', 'Mirror of Kalandra'], ['2.00', 'Divine Orb'], ['40.0', 'Chaos Orb']]);
});

test("today's summary labels its rows with our icons and keeps currency art inside the value chips", () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const card = html.slice(html.indexOf('<div class="card stats-card">'));
  const grid = card.slice(0, card.indexOf('<div class="card ', 1));

  assert.doesNotMatch(grid, /<img/);
  for (const id of ['map', 'sum', 'orb', 'arrow-up', 'hourglass']) {
    assert.match(grid, new RegExp(`assets/icons\\.svg#${id}"`));
  }
  for (const id of ['today-sessions', 'today-profit', 'today-avg', 'today-per-hour', 'today-time']) {
    assert.match(grid, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="last-map-result-meme"/);
});

test('loot icons come from bundled art for the same game and never fall back to the other game', () => {
  const context = loadConstants(
    loadFunctions(['getLocalItemIconPath'], {}),
    ['CURRENCY_IMAGE_VARIANTS', 'CURRENCY_IMAGES', 'LOCAL_ITEM_ICON_KEYS']
  );

  assert.equal(context.getLocalItemIconPath('Divine Orb', 'poe1'), 'assets/currency/poe1/divine.png');
  assert.equal(context.getLocalItemIconPath('Divine Orb', 'poe2'), 'assets/currency/poe2/divine.webp');
  assert.equal(context.getLocalItemIconPath('Vaal Orb', 'poe1'), 'assets/currency/poe1/vaal.png');
  assert.equal(context.getLocalItemIconPath('Vaal Orb', 'poe2'), '', 'no PoE 1 art on a PoE 2 drop');
  assert.equal(context.getLocalItemIconPath('Orb of Transmutation', 'poe2'), 'assets/currency/poe2/transmute.png');
  assert.equal(context.getLocalItemIconPath('Orb of Transmutation', 'poe1'), '', 'no PoE 2 art on a PoE 1 drop');
  assert.equal(context.getLocalItemIconPath('Ambush Scarab of Containment', 'poe1'), '');
  // OCR keeps the casing it read, and prices ignore case, so icons do too.
  assert.equal(context.getLocalItemIconPath('divine orb', 'poe1'), 'assets/currency/poe1/divine.png');
  assert.equal(context.getLocalItemIconPath('  Divine   ORB ', 'poe1'), 'assets/currency/poe1/divine.png');
  const names = Object.keys(vm.runInContext('LOCAL_ITEM_ICON_KEYS', context));
  for (const name of names.filter((itemName) => itemName !== 'Orb of Transmutation')) {
    assert.notEqual(context.getLocalItemIconPath(name, 'poe1'), '', `${name} has no PoE 1 art`);
  }
  for (const version of ['poe1', 'poe2']) {
    for (const name of Object.keys(vm.runInContext('LOCAL_ITEM_ICON_KEYS', context))) {
      const iconPath = context.getLocalItemIconPath(name, version);
      if (iconPath) {
        assert.ok(fs.existsSync(path.join(desktopDir, 'src', iconPath)), `${name} (${version}) points at a missing file`);
      }
    }
  }
});

test('recent loot rows show the item art with its stack count, a chest for unknown items, and tiered values', () => {
  const elements = { recentLootList: { innerHTML: '' } };
  const context = createProfitDisplayContext(['getLocalItemIconPath', 'itemSlotHTML', 'renderRecentLoot'], {
    elements,
    escapeHTML: (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    timeAgo: () => '5m ago',
    state: {
      currentUser: { id: 'profile-1' },
      recentLoot: [
        { itemName: 'Mirror of Kalandra', quantity: 2, chaosValue: 200000, session: { poeVersion: 'poe1', league: 'Standard', mapName: 'Crimson Temple Map' } },
        { itemName: 'Ambush Scarab of Containment', quantity: 1, chaosValue: 3, session: { poeVersion: 'poe1', league: 'Standard', mapName: 'Mesa Map' } },
        { itemName: 'Chaos Orb <img src=x>', quantity: 12500, chaosValue: 1, session: { poeVersion: 'poe1', league: 'Standard', mapName: '<b>Dunes</b>' } }
      ]
    }
  });
  loadConstants(context, ['CURRENCY_IMAGE_VARIANTS', 'CURRENCY_IMAGES', 'LOCAL_ITEM_ICON_KEYS']);

  context.renderRecentLoot();

  const [mirrorRow, scarabRow, oddRow] = elements.recentLootList.innerHTML.split('class="recent-loot-item"').slice(1);
  // Names reach the page as text, and a merged stack too long for the corner reads as thousands.
  assert.match(oddRow, /Chaos Orb &lt;img src=x&gt;/);
  assert.match(oddRow, /&lt;b&gt;Dunes&lt;\/b&gt; · 5m ago/);
  assert.match(oddRow, /<span class="stack">12k<\/span>/);
  assert.match(mirrorRow, /<span class="item-slot"><img src="assets\/currency\/poe1\/mirror\.png" alt="" draggable="false"><span class="stack">2<\/span><\/span>/);
  assert.match(mirrorRow, /class="recent-loot-value" data-profit-tier="mirror"/);
  assert.match(mirrorRow, /Crimson Temple Map · 5m ago/);
  assert.doesNotMatch(mirrorRow, /PoE 1 \/ Standard/);
  assert.match(scarabRow, /<span class="item-slot"><svg[^>]*><use href="assets\/icons\.svg#chest"\/><\/svg><\/span>/);
  assert.doesNotMatch(scarabRow, /class="stack"/, 'a single item has no stack count');
});

test('the run drawer leads with profit, counts loot by quantity and lists loot before the notes', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const order = ['sessions.lootBreakdown', 'sessions.categoryAnalytics', 'sessions.sessionNotes'].map((key) => html.indexOf(`data-i18n="${key}"`));
  assert.deepEqual([...order].sort((a, b) => a - b), order);

  const elements = {
    sessionDrawerTitle: { textContent: '' },
    sessionDrawerLootCount: { textContent: '' },
    sessionDrawerSummary: { innerHTML: '' },
    sessionDrawerAnalytics: { innerHTML: '' },
    sessionDrawerLoot: { innerHTML: '' }
  };
  elements.sessionDrawerNotes = { value: '' };
  const context = createProfitDisplayContext(['getLocalItemIconPath', 'itemSlotHTML', 'getMapResultProfitTier', 'profitMemeHTML', 'renderSessionDrawer'], {
    elements,
    PROFIT_MEME_LABELS: { bricked: 'Bricked', pog: 'Pog', juiced: 'Juiced', mirror: 'Mirror tier' },
    buildSessionAnalytics: () => [{ label: 'Currency', totalValue: 300, quantity: 3, entries: 1 }],
    escapeHTML: (value) => String(value),
    timeAgo: () => '1m ago',
    formatDuration: (seconds) => `duration:${seconds}`,
    getLiveDuration: () => 240,
    state: {
      // Divines cost 100c in Standard but 50c in Mirage, where this run was played.
      profitCurrencyRates: {
        'poe1:Standard': { divineChaos: 100, mirrorChaos: 200000 },
        'poe1:Mirage': { divineChaos: 50, mirrorChaos: 200000 },
        poe1: { divineChaos: 100, mirrorChaos: 200000 }
      },
      selectedSession: {
        id: 'run-1',
        mapName: 'Crimson Temple',
        status: 'completed',
        mapTier: 16,
        poeVersion: 'poe1',
        league: 'Mirage',
        durationSec: 330,
        notes: 'saved notes',
        profitChaos: 750,
        totalLootChaos: 760,
        costChaos: 10,
        lootEntries: [
          { itemName: 'Divine Orb', quantity: 3, chaosValue: 100, itemType: 'currency', createdAt: '2026-10-21T12:00:00.000Z' },
          { itemName: 'Ambush Scarab of Containment', quantity: 2, chaosValue: 5, itemType: 'scarab', createdAt: '2026-10-21T12:01:00.000Z' }
        ]
      }
    }
  });
  loadConstants(context, ['CURRENCY_IMAGE_VARIANTS', 'CURRENCY_IMAGES', 'LOCAL_ITEM_ICON_KEYS']);

  context.renderSessionDrawer();

  const summary = elements.sessionDrawerSummary.innerHTML;
  assert.match(summary, /<span class="session-drawer-label">dashboard\.profit<\/span>/, 'a finished run is not live');
  assert.match(summary, /class="session-drawer-profit" data-profit-tier="unique"><span class="value-chip">\+15\.0 /);
  assert.match(summary, /data-meme="juiced"/);
  assert.match(summary, /<span class="session-drawer-chip">T16<\/span>/);
  assert.match(summary, /class="session-drawer-duration"[^>]*>duration:330</);
  assert.equal(elements.sessionDrawerLootCount.textContent, '5');
  assert.equal(elements.sessionDrawerNotes.value, 'saved notes');

  // Everything in the drawer is priced with the run's own league, in one unit.
  const [scarabRow, divineRow] = elements.sessionDrawerLoot.innerHTML.split('class="session-drawer-loot-item"').slice(1);
  assert.match(divineRow, /<span class="item-slot item-slot--sm"><img src="assets\/currency\/poe1\/divine\.png"[^>]*><span class="stack">3<\/span><\/span>/);
  assert.match(divineRow, /data-profit-tier="unique"><span class="value-chip">6\.00 [^>]*alt="Divine Orb"/);
  assert.match(elements.sessionDrawerAnalytics.innerHTML, /<span class="value-chip">6\.00 [^>]*alt="Divine Orb"/);
  // Unknown items keep an empty slot so the rows stay aligned.
  assert.match(scarabRow, /<span class="item-slot item-slot--sm"><span class="stack">2<\/span><\/span>/);

  // A price update redraws the numbers but leaves notes that are being typed alone.
  elements.sessionDrawerNotes.value = 'typing...';
  context.state.selectedSession = { ...context.state.selectedSession, status: 'active' };
  context.renderSessionDrawer({ keepForm: true });
  assert.equal(elements.sessionDrawerNotes.value, 'typing...');
  assert.match(elements.sessionDrawerSummary.innerHTML, /<span class="session-drawer-label">dashboard\.liveProfit<\/span>/);
  assert.match(elements.sessionDrawerSummary.innerHTML, /class="session-drawer-duration"[^>]*>duration:240</);
});

test('game art in item slots is never recoloured', () => {
  const stylesCss = fs.readFileSync(path.join(desktopDir, 'src', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const lootRules = stylesCss.match(/[^{}]*(?:\.item-slot|\.recent-loot|\.session-drawer-loot)[^{}]*\{[^}]*\}/g) || [];
  assert.ok(lootRules.length > 0);
  for (const rule of lootRules) {
    assert.doesNotMatch(rule, /filter\s*:|mix-blend-mode\s*:/, rule.slice(0, rule.indexOf('{')).trim());
  }

  const appJs = fs.readFileSync(appJsPath, 'utf8');
  const slotStart = appJs.indexOf('function itemSlotHTML');
  const slotSource = appJs.slice(slotStart, slotStart + appJs.slice(slotStart).search(/\r?\n\}\r?\n/));
  assert.doesNotMatch(slotSource, /style=|filter/);
});

function createActiveSessionHarness(session, extraState = {}) {
  const hidden = {};
  const toggleFor = (name) => ({ toggle: (className, on) => { if (className === 'hidden') hidden[name] = on; } });
  let html = '';
  let writes = 0;
  const live = {};
  const activeSession = {
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      writes += 1;
      live.elapsed = { textContent: '' };
      live.profit = { classes: [], classList: { add: (className) => live.profit.classes.push(className) } };
    },
    querySelector: (selector) => (selector.includes('elapsed') ? live.elapsed : selector.includes('profit') ? live.profit : null)
  };
  const badgeClasses = new Set();
  const elements = {
    activeSession,
    sessionCard: { dataset: {} },
    startSessionBtn: { classList: toggleFor('start') },
    endSessionBtn: { classList: toggleFor('end') },
    scanScreenBtn: { classList: toggleFor('scan') },
    sessionBadge: { textContent: '', classList: { toggle: (className, on) => (on ? badgeClasses.add(className) : badgeClasses.delete(className)) } }
  };
  let liveSeconds = 252;
  const context = createProfitDisplayContext(
    ['formatElapsedClock', 'getSessionFarmTypeId', 'getMapResultProfitTier', 'profitMemeHTML', 'updateActiveSessionUI', 'updateActiveSessionClock'],
    {
      elements,
      renderedActiveSessionHTML: null,
      renderedActiveSessionItems: null,
      PROFIT_MEME_LABELS: { bricked: 'Bricked', pog: 'Pog', juiced: 'Juiced', mirror: 'Mirror tier' },
      escapeHTML: (value) => String(value),
      farmTypeAttr: (id) => ` data-farm-type="${id}"`,
      getSessionFarmTypeLabel: () => 'Ritual',
      getLiveDuration: () => liveSeconds,
      renderFarmTypeSelector: () => {},
      state: { currentSession: session, ...extraState }
    }
  );
  return {
    context,
    elements,
    hidden,
    badgeClasses,
    live,
    html: () => html,
    writes: () => writes,
    setLiveSeconds: (seconds) => { liveSeconds = seconds; }
  };
}

const RUNNING_SESSION = {
  id: 'session-1',
  mapName: 'Crimson Temple Map',
  mapTier: 16,
  farmTypeId: 'ritual',
  poeVersion: 'poe1',
  league: 'Standard',
  startedAt: '2026-10-25T13:32:00.000Z',
  profitChaos: 300,
  totalLootChaos: 300,
  costChaos: 0,
  lootEntries: [{ itemName: 'Divine Orb', quantity: 3, chaosValue: 100 }]
};

test('a running map shows a live hero, and the 1 s clock only rewrites the elapsed time', () => {
  const harness = createActiveSessionHarness(RUNNING_SESSION);

  harness.context.updateActiveSessionUI();
  assert.equal(harness.elements.sessionCard.dataset.sessionState, 'active');
  assert.deepEqual(harness.hidden, { start: true, end: false, scan: false });
  assert.equal(harness.elements.sessionBadge.textContent, 'dashboard.active');
  assert.ok(harness.badgeClasses.has('is-active'));
  assert.match(harness.html(), /<strong class="session-live-map">Crimson Temple Map<\/strong>/);
  assert.match(harness.html(), /<span class="session-live-chip">T16<\/span>/);
  assert.match(harness.html(), /<span class="session-live-farm" data-farm-type="ritual">Ritual<\/span>/);
  assert.match(harness.html(), /data-profit-tier="rare"><span class="value-chip">\+3\.00 /);
  assert.match(harness.html(), /data-meme="pog"/);
  assert.doesNotMatch(harness.html(), /dashboard\.liveLoot|sessions\.cost/, 'no loot/cost line without a cost');
  assert.equal(harness.live.elapsed.textContent, '4:12');

  // The clock tick and an unchanged redraw leave the markup alone.
  harness.setLiveSeconds(3725);
  harness.context.updateActiveSessionClock();
  harness.context.updateActiveSessionUI();
  assert.equal(harness.writes(), 1);
  assert.equal(harness.live.elapsed.textContent, '1:02:05');

  // New loot redraws once and bumps the profit tile.
  harness.context.state.currentSession = {
    ...RUNNING_SESSION,
    profitChaos: 400,
    lootEntries: [...RUNNING_SESSION.lootEntries, { itemName: 'Divine Orb', quantity: 1, chaosValue: 100 }]
  };
  harness.context.updateActiveSessionUI();
  assert.equal(harness.writes(), 2);
  assert.deepEqual(harness.live.profit.classes, ['is-bumped']);
});

test('a run with a cost lists loot and cost, and the idle card goes back to waiting', () => {
  const harness = createActiveSessionHarness({ ...RUNNING_SESSION, costChaos: 50, profitChaos: 250 });

  harness.context.updateActiveSessionUI();
  assert.match(harness.html(), /dashboard\.liveLoot <span class="value-chip">3\.00 [\s\S]*sessions\.cost <span class="value-chip">50\.0 /);

  harness.context.state.currentSession = null;
  harness.context.updateActiveSessionUI();
  assert.equal(harness.elements.sessionCard.dataset.sessionState, 'idle');
  assert.deepEqual(harness.hidden, { start: false, end: true, scan: true });
  assert.equal(harness.elements.sessionBadge.textContent, 'dashboard.waiting');
  assert.equal(harness.badgeClasses.has('is-active'), false);
  assert.match(harness.html(), /dashboard\.noActiveMap/);
});

test('the session clock interval updates only the elapsed time', () => {
  const appJs = fs.readFileSync(appJsPath, 'utf8');
  const clockStart = appJs.indexOf('function startSessionClock');
  const clockSource = appJs.slice(clockStart, clockStart + appJs.slice(clockStart).search(/\r?\n\}\r?\n/));
  assert.match(clockSource, /updateActiveSessionClock\(\)/);
  assert.doesNotMatch(clockSource, /updateActiveSessionUI\(\)/);
});
