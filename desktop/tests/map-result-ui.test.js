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

test('dashboard provides a branded new map session modal instead of native prompts', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="map-session-modal"/);
  assert.match(html, /id="map-session-name-input"/);
  assert.match(html, /id="map-session-confirm-btn"/);
  assert.match(html, /id="map-session-cancel-btn"/);
  assert.match(html, /data-modal-purpose="new-map-session"/);
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
      selectFarmType(state, farmTypeId) {
        state.selectedFarmTypeId = farmTypeId || null;
        return state.selectedFarmTypeId;
      },
      clearFarmType(state) {
        state.selectedFarmTypeId = null;
      }
    }),
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
    ['setActiveFarmType', 'essence'],
    ['renderFarmTypeSelector'],
    ['setActiveFarmType', null],
    ['renderFarmTypeSelector']
  ]);
});

test('starting a map session forwards the selected farm type without changing existing context fields', async () => {
  const startSessionCalls = [];
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
        }
      }
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

  assert.deepEqual(startSessionCalls.map((payload) => ({ ...payload })), [{
    mapName: 'Dunes Map',
    poeVersion: 'poe2',
    league: 'Fate of the Vaal',
    farmTypeId: 'breach'
  }]);
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
    requestMapSessionName: async () => 'Abyssal City Map',
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
    requestMapSessionName: async () => null,
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
