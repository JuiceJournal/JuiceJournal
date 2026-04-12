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
  const context = loadFunctions(['handleStartSession'], {
    prompt: () => 'Dunes Map',
    state: {},
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

test('dashboard html includes a last map result card with summary fields', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="last-map-result-card"/);
  assert.match(html, /id="last-map-result-farm-type"/);
  assert.match(html, /id="last-map-result-duration"/);
  assert.match(html, /id="last-map-result-profit"/);
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
