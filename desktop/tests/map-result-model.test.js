const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const StashAnalyzer = require('../src/modules/stashAnalyzer');

const MAP_RESULT_MODEL_REQUEST = '../src/modules/mapResultModel';
const desktopDir = path.resolve(__dirname, '..');
const appJsPath = path.join(desktopDir, 'src', 'app.js');

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadMapResultModel() {
  try {
    return require(MAP_RESULT_MODEL_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, MAP_RESULT_MODEL_REQUEST)) {
      throw error;
    }

    return { __loadError: error };
  }
}

function getMapResultModelExport(exportName) {
  const mapResultModel = loadMapResultModel();

  if (mapResultModel.__loadError) {
    const { code, message } = mapResultModel.__loadError;
    assert.fail(
      `Expected desktop/src/modules/mapResultModel.js to exist and export ${exportName}. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof mapResultModel[exportName],
    'function',
    `Expected mapResultModel.${exportName} to be a function`
  );

  return mapResultModel[exportName];
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

function createSnapshot(items) {
  return {
    timestamp: Date.parse('2026-04-11T10:00:00.000Z'),
    items
  };
}

test('map result model returns null when required snapshots are incomplete', () => {
  const deriveMapResult = getMapResultModelExport('deriveMapResult');

  assert.equal(deriveMapResult(), null);
  assert.equal(deriveMapResult({ farmType: { id: 'ritual', label: 'Ritual' } }), null);
  assert.equal(
    deriveMapResult({
      farmType: { id: 'ritual', label: 'Ritual' },
      beforeSnapshot: { items: [] }
    }),
    null
  );
});

test('map result model derives normalized inputs outputs and net profit from snapshot deltas', () => {
  const deriveMapResult = getMapResultModelExport('deriveMapResult');

  const result = deriveMapResult({
    farmType: { id: 'ritual', label: 'Ritual' },
    runtimeSession: {
      sessionId: 'runtime-1',
      instances: [
        { areaName: 'Dunes Map', durationSeconds: 210, status: 'completed' },
        { areaName: 'Mesa Map', durationSeconds: 185, status: 'completed' }
      ]
    },
    beforeSnapshot: createSnapshot([
      {
        itemKey: 'chaos::currency',
        baseType: 'Chaos Orb',
        category: 'currency',
        quantity: 10,
        chaosValue: 1,
        totalChaosValue: 10
      },
      {
        itemKey: 'scarab::currency',
        baseType: 'Divination Scarab',
        category: 'currency',
        quantity: 4,
        chaosValue: 5,
        totalChaosValue: 20
      },
      {
        itemKey: 'divine::currency',
        baseType: 'Divine Orb',
        category: 'currency',
        quantity: 1,
        chaosValue: 120,
        totalChaosValue: 120
      }
    ]),
    afterSnapshot: createSnapshot([
      {
        itemKey: 'chaos::currency',
        baseType: 'Chaos Orb',
        category: 'currency',
        quantity: 6,
        chaosValue: 1,
        totalChaosValue: 6
      },
      {
        itemKey: 'scarab::currency',
        baseType: 'Divination Scarab',
        category: 'currency',
        quantity: 3,
        chaosValue: 5,
        totalChaosValue: 15
      },
      {
        itemKey: 'divine::currency',
        baseType: 'Divine Orb',
        category: 'currency',
        quantity: 2,
        chaosValue: 120,
        totalChaosValue: 240
      },
      {
        itemKey: 'stacked-deck::currency',
        baseType: 'Stacked Deck',
        category: 'currency',
        quantity: 8,
        chaosValue: 2,
        totalChaosValue: 16
      }
    ]),
    characterSummary: {
      id: 'char-1',
      name: 'MapRunner',
      league: 'Fate of the Vaal'
    },
    accountName: 'KocaGyVeMasha',
    poeVersion: 'poe2'
  });

  assert.equal(typeof result.id, 'string');
  assert.match(result.id, /^map-result-\d+$/);
  assert.equal(result.sessionId, 'runtime-1');
  assert.equal(result.characterId, 'char-1');
  assert.equal(result.characterName, 'MapRunner');
  assert.equal(result.accountName, 'KocaGyVeMasha');
  assert.equal(result.poeVersion, 'poe2');
  assert.equal(result.league, 'Fate of the Vaal');
  assert.equal(result.farmType, 'Ritual');
  assert.equal(result.durationSeconds, 185);
  assert.equal(result.inputValue, 9);
  assert.equal(result.outputValue, 136);
  assert.equal(result.netProfit, 127);
  assert.equal(result.profitState, 'positive');
  assert.equal(Number.isFinite(Date.parse(result.createdAt)), true);

  assert.deepEqual(result.topInputs, [
    {
      itemKey: 'scarab::currency',
      label: 'Divination Scarab',
      quantityDelta: 1,
      valueDelta: 5,
      currencyCode: 'chaos'
    },
    {
      itemKey: 'chaos::currency',
      label: 'Chaos Orb',
      quantityDelta: 4,
      valueDelta: 4,
      currencyCode: 'chaos'
    }
  ]);

  assert.deepEqual(result.topOutputs, [
    {
      itemKey: 'divine::currency',
      label: 'Divine Orb',
      quantityDelta: 1,
      valueDelta: 120,
      currencyCode: 'chaos'
    },
    {
      itemKey: 'stacked-deck::currency',
      label: 'Stacked Deck',
      quantityDelta: 8,
      valueDelta: 16,
      currencyCode: 'chaos'
    }
  ]);
});

test('map result model ignores value-only repricing when quantity does not change', () => {
  const deriveMapResult = getMapResultModelExport('deriveMapResult');

  const result = deriveMapResult({
    farmType: { id: 'breach', label: 'Breach' },
    beforeSnapshot: createSnapshot([
      {
        itemKey: 'priced-item::currency',
        baseType: 'Priced Item',
        category: 'currency',
        quantity: 2,
        chaosValue: 10,
        totalChaosValue: 20
      }
    ]),
    afterSnapshot: createSnapshot([
      {
        itemKey: 'priced-item::currency',
        baseType: 'Priced Item',
        category: 'currency',
        quantity: 2,
        chaosValue: 18,
        totalChaosValue: 36
      }
    ])
  });

  assert.equal(result.inputValue, 0);
  assert.equal(result.outputValue, 0);
  assert.equal(result.netProfit, 0);
  assert.deepEqual(result.topOutputs, []);
});

test('map result model stays aligned with stash analyzer quantity-diff semantics', () => {
  const deriveMapResult = getMapResultModelExport('deriveMapResult');
  const analyzer = new StashAnalyzer();
  const priceByName = new Map([
    ['Chaos Orb', 1],
    ['Divination Scarab', 5],
    ['Divine Orb', 120],
    ['Stacked Deck', 2]
  ]);
  const priceService = {
    getChaosValue(name) {
      return priceByName.get(name) || 0;
    }
  };
  const beforeItems = [
    { itemKey: 'chaos::currency', baseType: 'Chaos Orb', category: 'currency', quantity: 10, chaosValue: 1, totalChaosValue: 10 },
    { itemKey: 'scarab::currency', baseType: 'Divination Scarab', category: 'currency', quantity: 4, chaosValue: 5, totalChaosValue: 20 },
    { itemKey: 'divine::currency', baseType: 'Divine Orb', category: 'currency', quantity: 1, chaosValue: 120, totalChaosValue: 120 }
  ];
  const afterItems = [
    { itemKey: 'chaos::currency', baseType: 'Chaos Orb', category: 'currency', quantity: 6, chaosValue: 1, totalChaosValue: 6 },
    { itemKey: 'scarab::currency', baseType: 'Divination Scarab', category: 'currency', quantity: 3, chaosValue: 5, totalChaosValue: 15 },
    { itemKey: 'divine::currency', baseType: 'Divine Orb', category: 'currency', quantity: 2, chaosValue: 120, totalChaosValue: 240 },
    { itemKey: 'stacked-deck::currency', baseType: 'Stacked Deck', category: 'currency', quantity: 8, chaosValue: 2, totalChaosValue: 16 }
  ];

  const report = analyzer.diffItems(beforeItems, afterItems, priceService);
  const result = deriveMapResult({
    farmType: { id: 'ritual', label: 'Ritual' },
    beforeSnapshot: createSnapshot(beforeItems),
    afterSnapshot: createSnapshot(afterItems)
  });

  assert.equal(result.inputValue, report.summary.totalLostChaos);
  assert.equal(result.outputValue, report.summary.totalGainedChaos);
  assert.equal(result.netProfit, report.summary.netProfitChaos);
});

test('map result model matches stash analyzer when snapshot item casing differs', () => {
  const deriveMapResult = getMapResultModelExport('deriveMapResult');
  const analyzer = new StashAnalyzer();
  const priceService = {
    getChaosValue(name) {
      return String(name).toLowerCase() === 'chaos orb' ? 1 : 0;
    }
  };
  const beforeItems = [
    { baseType: 'Chaos Orb', category: 'currency', quantity: 10, chaosValue: 1, totalChaosValue: 10 }
  ];
  const afterItems = [
    { baseType: 'chaos orb', category: 'currency', quantity: 7, chaosValue: 1, totalChaosValue: 7 }
  ];

  const report = analyzer.diffItems(beforeItems, afterItems, priceService);
  const result = deriveMapResult({
    farmType: { id: 'ritual', label: 'Ritual' },
    beforeSnapshot: createSnapshot(beforeItems),
    afterSnapshot: createSnapshot(afterItems)
  });

  assert.equal(result.inputValue, report.summary.totalLostChaos);
  assert.equal(result.outputValue, report.summary.totalGainedChaos);
  assert.equal(result.netProfit, report.summary.netProfitChaos);
});

test('map result model sorts and caps top inputs and outputs', () => {
  const deriveMapResult = getMapResultModelExport('deriveMapResult');

  const result = deriveMapResult({
    farmType: { id: 'essence', label: 'Essence' },
    beforeSnapshot: createSnapshot([
      { itemKey: 'a', baseType: 'A', category: 'currency', quantity: 5, chaosValue: 10, totalChaosValue: 50 },
      { itemKey: 'b', baseType: 'B', category: 'currency', quantity: 5, chaosValue: 9, totalChaosValue: 45 },
      { itemKey: 'c', baseType: 'C', category: 'currency', quantity: 5, chaosValue: 8, totalChaosValue: 40 },
      { itemKey: 'd', baseType: 'D', category: 'currency', quantity: 5, chaosValue: 7, totalChaosValue: 35 },
      { itemKey: 'g', baseType: 'G', category: 'currency', quantity: 1, chaosValue: 1, totalChaosValue: 1 }
    ]),
    afterSnapshot: createSnapshot([
      { itemKey: 'a', baseType: 'A', category: 'currency', quantity: 1, chaosValue: 10, totalChaosValue: 10 },
      { itemKey: 'b', baseType: 'B', category: 'currency', quantity: 2, chaosValue: 9, totalChaosValue: 18 },
      { itemKey: 'c', baseType: 'C', category: 'currency', quantity: 3, chaosValue: 8, totalChaosValue: 24 },
      { itemKey: 'd', baseType: 'D', category: 'currency', quantity: 4, chaosValue: 7, totalChaosValue: 28 },
      { itemKey: 'e', baseType: 'E', category: 'currency', quantity: 3, chaosValue: 11, totalChaosValue: 33 },
      { itemKey: 'f', baseType: 'F', category: 'currency', quantity: 2, chaosValue: 12, totalChaosValue: 24 },
      { itemKey: 'g', baseType: 'G', category: 'currency', quantity: 5, chaosValue: 1, totalChaosValue: 5 },
      { itemKey: 'h', baseType: 'H', category: 'currency', quantity: 1, chaosValue: 15, totalChaosValue: 15 }
    ])
  });

  assert.deepEqual(
    result.topInputs.map((entry) => entry.itemKey),
    ['a', 'b', 'c']
  );
  assert.deepEqual(
    result.topOutputs.map((entry) => entry.itemKey),
    ['e', 'f', 'h']
  );
});

test('renderer helper derives the current map result from snapshot-captured context instead of live mutable state', () => {
  const calls = [];
  const stashState = {
    beforeSnapshot: { items: [{ itemKey: 'chaos::currency', quantity: 3, chaosValue: 1 }] },
    afterSnapshot: { items: [{ itemKey: 'chaos::currency', quantity: 5, chaosValue: 1 }] },
    mapResultContext: {
      farmTypeId: 'ritual',
      poeVersion: 'poe2',
      accountName: 'CapturedAccount',
      characterSummary: {
        id: 'captured-char',
        name: 'CapturedMapper',
        league: 'Captured League'
      }
    }
  };
  const state = {
    currentSession: {
      farmTypeId: 'essence',
      poeVersion: 'poe1',
      league: 'Wrong League'
    },
    runtimeSession: {
      instances: [{ durationSeconds: 77, status: 'completed' }]
    },
    account: {
      accountName: 'WrongAccount',
      summary: {
        id: 'wrong-char',
        name: 'WrongMapper',
        league: 'Wrong League'
      }
    },
    farmType: {
      selectedFarmTypeId: 'essence'
    }
  };
  const context = loadFunctions(['deriveCurrentMapResult'], {
    stashState,
    state,
    getSelectedTrackerContext: () => ({
      poeVersion: 'poe1'
    }),
    getFarmTypeModel: () => ({
      listFarmTypes: () => [
        { id: 'ritual', label: 'Ritual' },
        { id: 'essence', label: 'Essence' }
      ]
    }),
    getMapResultModel: () => ({
      deriveMapResult(input) {
        calls.push(input);
        return { id: 'map-result-1' };
      }
    })
  });

  const result = context.deriveCurrentMapResult();

  assert.deepEqual(result, { id: 'map-result-1' });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    farmType: { id: 'ritual', label: 'Ritual' },
    runtimeSession: state.runtimeSession,
    beforeSnapshot: stashState.beforeSnapshot,
    afterSnapshot: stashState.afterSnapshot,
    characterSummary: stashState.mapResultContext.characterSummary,
    accountName: 'CapturedAccount',
    poeVersion: 'poe2'
  }]);
});
