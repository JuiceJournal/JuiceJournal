const test = require('node:test');
const assert = require('node:assert/strict');

const MAP_RESULT_OVERLAY_MODEL_REQUEST = '../src/modules/mapResultOverlayModel';

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadMapResultOverlayModel() {
  try {
    return require(MAP_RESULT_OVERLAY_MODEL_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, MAP_RESULT_OVERLAY_MODEL_REQUEST)) {
      throw error;
    }

    return { __loadError: error };
  }
}

function getMapResultOverlayModelExport(exportName) {
  const mapResultOverlayModel = loadMapResultOverlayModel();

  if (mapResultOverlayModel.__loadError) {
    const { code, message } = mapResultOverlayModel.__loadError;
    assert.fail(
      `Expected desktop/src/modules/mapResultOverlayModel.js to exist and export ${exportName}. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof mapResultOverlayModel[exportName],
    'function',
    `Expected mapResultOverlayModel.${exportName} to be a function`
  );

  return mapResultOverlayModel[exportName];
}

function createCompletedResult(overrides = {}) {
  return {
    id: 'map-result-1',
    farmType: 'Ritual',
    durationSeconds: 185,
    netProfit: 127,
    profitState: 'positive',
    topOutputs: [{ label: 'Divine Orb', valueDelta: 120 }],
    ...overrides
  };
}

test('map result overlay model opens a new completed result with a fresh dismiss deadline', () => {
  const deriveMapResultOverlayState = getMapResultOverlayModelExport('deriveMapResultOverlayState');
  const completedResult = createCompletedResult();

  const state = deriveMapResultOverlayState({
    overlayEnabled: true,
    completedResult,
    currentOverlayState: {
      visible: true,
      pinned: true,
      result: createCompletedResult({ id: 'previous-result', farmType: 'Essence' }),
      tone: 'negative',
      dismissAt: 5_000
    },
    now: 12_345,
    durationMs: 10_000
  });

  assert.deepEqual(state, {
    visible: true,
    pinned: false,
    result: completedResult,
    tone: 'positive',
    dismissAt: 22_345
  });
});

test('map result overlay model keeps a pinned result visible without a new completion event', () => {
  const deriveMapResultOverlayState = getMapResultOverlayModelExport('deriveMapResultOverlayState');
  const currentOverlayState = {
    visible: true,
    pinned: true,
    result: createCompletedResult({ id: 'pinned-result', farmType: 'Expedition' }),
    tone: 'neutral',
    dismissAt: 25_000
  };

  const state = deriveMapResultOverlayState({
    overlayEnabled: true,
    currentOverlayState,
    now: 200_000
  });

  assert.deepEqual(state, {
    visible: true,
    pinned: true,
    result: currentOverlayState.result,
    tone: 'neutral',
    dismissAt: 25_000
  });
});

test('map result overlay model hides once the dismiss deadline has elapsed', () => {
  const deriveMapResultOverlayState = getMapResultOverlayModelExport('deriveMapResultOverlayState');

  const state = deriveMapResultOverlayState({
    overlayEnabled: true,
    currentOverlayState: {
      visible: true,
      pinned: false,
      result: createCompletedResult({ id: 'expired-result' }),
      tone: 'negative',
      dismissAt: 10_000
    },
    now: 10_000
  });

  assert.deepEqual(state, {
    visible: false,
    pinned: false,
    result: null,
    tone: 'neutral'
  });
});

test('map result overlay model hides all map results when the overlay setting is disabled', () => {
  const deriveMapResultOverlayState = getMapResultOverlayModelExport('deriveMapResultOverlayState');

  const state = deriveMapResultOverlayState({
    overlayEnabled: false,
    completedResult: createCompletedResult(),
    currentOverlayState: {
      visible: true,
      pinned: true,
      result: createCompletedResult({ id: 'still-visible' }),
      tone: 'positive',
      dismissAt: 20_000
    },
    now: 5_000
  });

  assert.deepEqual(state, {
    visible: false,
    pinned: false,
    result: null,
    tone: 'neutral'
  });
});

test('map result overlay model lists up to three named drops that are worth something, in order', () => {
  const getMapResultDrops = getMapResultOverlayModelExport('getMapResultDrops');

  assert.deepEqual(getMapResultDrops(createCompletedResult({
    topOutputs: [
      { label: 'Chaos Orb', quantityDelta: 40, valueDelta: 40, icon: 'https://cdn.example/chaos.png' },
      { label: '  ', valueDelta: 90 },
      { label: 'Worthless', quantityDelta: 5, valueDelta: 0 },
      { label: 'Divine Orb', valueDelta: 300 },
      { label: 'Exalted Orb', quantityDelta: 0, valueDelta: 20, icon: 7 },
      { label: 'Fourth', valueDelta: 10 }
    ]
  })), [
    { label: 'Chaos Orb', quantity: 40, valueDelta: 40, icon: 'https://cdn.example/chaos.png' },
    { label: 'Divine Orb', quantity: 1, valueDelta: 300, icon: '' },
    { label: 'Exalted Orb', quantity: 1, valueDelta: 20, icon: '' }
  ]);
  assert.deepEqual(getMapResultDrops(createCompletedResult({ topOutputs: undefined })), []);
  assert.deepEqual(getMapResultDrops(null), []);
});

test('main sizes the overlay window to the map result card and keeps the other modes as they were', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('\nfunction getOverlayWindowBounds(');
  const body = source.slice(start, source.indexOf('\n}\n', start) + 2);
  const context = vm.createContext({
    getOverlayDisplay: () => ({ workArea: { x: 0, y: 0, width: 2560, height: 1400 } }),
    getMapResultCardHeight: getMapResultOverlayModelExport('getMapResultCardHeight')
  });
  vm.runInContext(`${body}\nthis.getOverlayWindowBounds = getOverlayWindowBounds;`, context);
  const drop = (label) => ({ label, valueDelta: 10 });
  const bounds = (state) => JSON.parse(JSON.stringify(context.getOverlayWindowBounds(state)));

  assert.deepEqual(bounds({ mode: 'map-result', mapResult: { result: { topOutputs: [drop('a'), drop('b'), drop('c')] } } }), { width: 360, height: 188, x: 2176, y: 24 });
  assert.equal(bounds({ mode: 'map-result', mapResult: { result: { topOutputs: [] } } }).height, 112);
  assert.equal(bounds({ mode: 'map-result' }).height, 112);
  assert.equal(bounds({ mode: 'runtime' }).height, 112);
  assert.equal(bounds({ mode: 'inventory-status' }).height, 112);
  // The start prompt has room for the entry cost box under its farm types.
  assert.deepEqual(bounds({ mode: 'start-map-prompt' }), { width: 440, height: 350, x: 2096, y: 24 });
  assert.deepEqual(bounds({ mode: 'character-prompt' }), { width: 440, height: 286, x: 2096, y: 24 });
});

test('map result overlay card height is 112 plus the measured height of the listed drops', () => {
  const getMapResultCardHeight = getMapResultOverlayModelExport('getMapResultCardHeight');
  const drop = (label) => ({ label, valueDelta: 10 });

  assert.equal(getMapResultCardHeight(createCompletedResult({ topOutputs: [] })), 112);
  assert.equal(getMapResultCardHeight(createCompletedResult({ topOutputs: [drop('a'), { label: 'b', valueDelta: 0 }] })), 138);
  assert.equal(getMapResultCardHeight(createCompletedResult({ topOutputs: [drop('a'), drop('b')] })), 163);
  assert.equal(getMapResultCardHeight(createCompletedResult({ topOutputs: [drop('a'), drop('b'), drop('c'), drop('d')] })), 188);
  assert.equal(getMapResultCardHeight(undefined), 112);
});
