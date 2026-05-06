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
      { dataset: { version: 'poe1' }, classList: { toggle: () => {} } },
      { dataset: { version: 'poe2' }, classList: { toggle: () => {} } }
    ]
  };
  const context = loadFunctions(['syncRendererGameContext'], {
    state,
    elements,
    normalizePoeVersion: (version) => version === 'poe1' || version === 'poe2' ? version : null,
    syncDesktopCurrencyIcons: () => {},
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
  const startCalls = [];
  const context = loadFunctions(['handleMapEnteredEvent'], {
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
        },
        hideStartMapPromptOverlay: async () => {
          overlayPrompts.push({ hidden: true });
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
    { hidden: true }
  ]);
  assert.deepEqual(startCalls, [{ defaultMapName: 'Channel', source: 'map-detected' }]);
});

test('map-entered events can start a session from the in-game start-map overlay selection', async () => {
  const overlayPrompts = [];
  const startCalls = [];
  let overlayResultHandler = null;
  const context = loadFunctions(['handleMapEnteredEvent'], {
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

test('session-ended events persist completed map results for automatic log exits', async () => {
  const listeners = {};
  const persistedResults = [];
  const refreshCalls = [];
  const context = loadFunctions(['persistCompletedSessionMapResult', 'setupIPCListeners'], {
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
    'createCompletedSessionMapResult',
    'persistCompletedSessionMapResult',
    'persistMapResultHistory',
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
  assert.equal(elements.lastMapResultProfit.innerHTML, 'profit:0:16:poe2');
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
  const context = loadFunctions(['renderLatestMapResult'], {
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
  const context = loadFunctions(['renderLatestMapResult'], {
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
  const context = loadFunctions(['renderLatestMapResult'], {
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
  assert.equal(elements.lastMapResultProfit.innerHTML, 'profit:127:chaos:16:poe2');
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
  const context = loadFunctions(['renderMapResultHistory'], {
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
  const context = loadFunctions(['renderMapResultHistory'], {
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
  const context = loadFunctions(['renderMapResultHistory'], {
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
