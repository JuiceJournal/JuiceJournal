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
