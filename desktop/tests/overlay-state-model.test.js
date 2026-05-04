const test = require('node:test');
const assert = require('node:assert/strict');

const OVERLAY_MODEL_REQUEST = '../src/modules/overlayStateModel';

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadOverlayStateModel() {
  try {
    return require(OVERLAY_MODEL_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, OVERLAY_MODEL_REQUEST)) {
      throw error;
    }

    return { __loadError: error };
  }
}

function getOverlayStateModelExport(exportName) {
  const overlayStateModel = loadOverlayStateModel();

  if (overlayStateModel.__loadError) {
    const { code, message } = overlayStateModel.__loadError;
    assert.fail(
      `Expected desktop/src/modules/overlayStateModel.js to exist and export ${exportName}. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof overlayStateModel[exportName],
    'function',
    `Expected overlayStateModel.${exportName} to be a function`
  );

  return overlayStateModel[exportName];
}

test('overlay state model composes compact character and runtime summary', () => {
  const deriveOverlayState = getOverlayStateModelExport('deriveOverlayState');

  const state = deriveOverlayState({
    enabled: true,
    character: { name: 'KocaGyVeMasha', league: 'Fate of the Vaal', className: 'Shaman' },
    runtime: { currentArea: 'Overgrown', currentInstanceSeconds: 332, currentSessionSeconds: 1840 }
  });

  assert.equal(state.visibility, 'visible');
  assert.equal(state.primaryLine, 'KocaGyVeMasha \u00b7 Fate of the Vaal');
  assert.equal(state.secondaryLine, 'Overgrown');
  assert.equal(state.metaLine, '332s \u00b7 session 1840s');
});

test('overlay state model consumes normalized runtime session summary shape', () => {
  const deriveOverlayState = getOverlayStateModelExport('deriveOverlayState');

  const state = deriveOverlayState({
    enabled: true,
    character: {
      summary: {
        status: 'ready',
        name: 'MainOne',
        league: 'Fate of the Vaal'
      }
    },
    runtime: {
      summary: {
        status: 'active',
        currentAreaName: 'Crimson Shores',
        currentInstanceSeconds: 125,
        totalActiveSeconds: 725
      }
    }
  });

  assert.equal(state.visibility, 'visible');
  assert.equal(state.primaryLine, 'MainOne \u00b7 Fate of the Vaal');
  assert.equal(state.secondaryLine, 'Crimson Shores');
  assert.equal(state.metaLine, '125s \u00b7 session 725s');
});

test('overlay state model falls back to waiting state when runtime data is missing', () => {
  const deriveOverlayState = getOverlayStateModelExport('deriveOverlayState');

  const state = deriveOverlayState({ enabled: true, character: null, runtime: null });

  assert.equal(state.visibility, 'waiting');
  assert.equal(state.primaryLine, 'Waiting for game');
  assert.equal(state.secondaryLine, 'Waiting for runtime session');
});

test('overlay state model shows active map session details even without GEP runtime data', () => {
  const deriveOverlayState = getOverlayStateModelExport('deriveOverlayState');

  const state = deriveOverlayState({
    enabled: false,
    now: Date.parse('2026-05-04T12:03:10.000Z'),
    session: {
      status: 'active',
      mapName: 'Tower',
      farmType: 'Expedition',
      poeVersion: 'poe2',
      league: 'Standard',
      startedAt: '2026-05-04T12:02:00.000Z'
    }
  });

  assert.equal(state.visibility, 'visible');
  assert.equal(state.primaryLine, 'Tower');
  assert.equal(state.secondaryLine, 'Expedition \u00b7 PoE 2 \u00b7 Standard');
  assert.equal(state.metaLine, 'elapsed 1m 10s');
});

test('overlay state model returns hidden state when overlay is disabled or omitted', () => {
  const deriveOverlayState = getOverlayStateModelExport('deriveOverlayState');

  const explicitlyDisabledState = deriveOverlayState({
    enabled: false,
    character: { name: 'HiddenMain', league: 'Standard' },
    runtime: { currentArea: 'Dunes', currentInstanceSeconds: 1, currentSessionSeconds: 1 }
  });
  const defaultState = deriveOverlayState({
    character: { name: 'HiddenMain', league: 'Standard' },
    runtime: { currentArea: 'Dunes', currentInstanceSeconds: 1, currentSessionSeconds: 1 }
  });

  assert.equal(explicitlyDisabledState.visibility, 'hidden');
  assert.equal(defaultState.visibility, 'hidden');
});
