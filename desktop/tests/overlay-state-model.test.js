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
  assert.equal(state.metaLine, 'Map 5:32 \u00b7 Total 30:40');
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
  assert.equal(state.metaLine, 'Map 2:05 \u00b7 Total 12:05');
});

test('overlay state model counts a running map from its entry time and includes it in the session total', () => {
  const deriveOverlayState = getOverlayStateModelExport('deriveOverlayState');
  const formatOverlayClock = getOverlayStateModelExport('formatOverlayClock');
  const { createRuntimeSessionState, applyRuntimeEvent, cloneRuntimeSessionState } = require('../src/modules/runtimeSessionModel');
  const runtimeState = createRuntimeSessionState();
  applyRuntimeEvent(runtimeState, { type: 'area_entered', areaName: 'Tower', at: '2026-05-04T12:00:00.000Z' });
  applyRuntimeEvent(runtimeState, { type: 'area_exited', areaName: 'Hideout', at: '2026-05-04T12:10:00.000Z' });
  applyRuntimeEvent(runtimeState, { type: 'area_entered', areaName: 'Overgrown', at: '2026-05-04T12:11:00.000Z' });
  // main.js snapshots the runtime at the area event, so the current map is 0s old in the pushed state.
  const runtime = cloneRuntimeSessionState(runtimeState, { now: '2026-05-04T12:11:00.000Z' });
  const now = Date.parse('2026-05-04T12:15:12.000Z');

  const state = deriveOverlayState({ enabled: true, character: { name: 'MainOne' }, runtime, now });

  assert.equal(state.secondaryLine, 'Overgrown');
  assert.equal(state.metaLine, 'Map 4:12 \u00b7 Total 14:12');
  assert.deepEqual(state.clock, { kind: 'runtime', mapBase: 252, totalBase: 852, at: now });
  assert.equal(formatOverlayClock(state.clock, now + 3000), 'Map 4:15 \u00b7 Total 14:15');
  assert.equal(formatOverlayClock(state.clock, now + 3000 * 1000), 'Map 54:12 \u00b7 Total 1:04:12');
});

test('overlay state model only sends a clock while a map or session is running', () => {
  const deriveOverlayState = getOverlayStateModelExport('deriveOverlayState');
  const formatOverlayClock = getOverlayStateModelExport('formatOverlayClock');
  const now = Date.parse('2026-05-04T12:03:10.000Z');

  // Without a running map the total stays put, so there is nothing to count up.
  const stopped = deriveOverlayState({
    enabled: true,
    character: { name: 'MainOne' },
    runtime: { currentArea: 'Overgrown', currentInstanceSeconds: 332, currentSessionSeconds: 1840 },
    now
  });
  assert.equal(stopped.visibility, 'visible');
  assert.equal(stopped.metaLine, 'Map 5:32 \u00b7 Total 30:40');
  assert.equal(stopped.clock, undefined);

  const idle = deriveOverlayState({
    enabled: true,
    character: { name: 'MainOne' },
    runtime: {
      currentInstance: null,
      totalActiveSeconds: 600,
      summary: { status: 'idle', currentAreaName: null, currentInstanceSeconds: 0, totalActiveSeconds: 600, lastAreaName: 'Tower' }
    },
    now
  });
  assert.equal(idle.visibility, 'hidden');
  assert.equal(idle.clock, undefined);

  const session = deriveOverlayState({
    now,
    session: { status: 'active', mapName: 'Tower', startedAt: '2026-05-04T12:02:00.000Z' }
  });
  assert.equal(session.metaLine, 'elapsed 1m 10s');
  assert.deepEqual(session.clock, { kind: 'session', base: 70, at: now });
  assert.equal(formatOverlayClock(session.clock, now + 5000), 'elapsed 1m 15s');

  assert.equal(deriveOverlayState({ enabled: true, now, startMapPrompt: { mapName: 'Channel' } }).clock, undefined);
  assert.equal(deriveOverlayState({ enabled: false, now, runtime: { currentArea: 'Dunes' } }).clock, undefined);
  assert.equal(formatOverlayClock(null, now), '');
});

test('overlay state model stays hidden when runtime data is missing', () => {
  const deriveOverlayState = getOverlayStateModelExport('deriveOverlayState');

  const state = deriveOverlayState({ enabled: true, character: null, runtime: null });

  assert.equal(state.visibility, 'hidden');
  assert.equal(state.primaryLine, '');
  assert.equal(state.secondaryLine, '');
});

test('overlay state model shows active map session details even without character data', () => {
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

test('overlay state model shows a start-map prompt for detected map entries', () => {
  const deriveOverlayState = getOverlayStateModelExport('deriveOverlayState');

  const state = deriveOverlayState({
    enabled: true,
    startMapPrompt: {
      mapName: 'Channel',
      farmTypeId: 'breach',
      farmType: 'Breach',
      poeVersion: 'poe2',
      league: 'Fate of the Vaal',
      farmTypeOptions: [
        { id: 'breach', label: 'Breach' },
        { id: 'expedition', label: 'Expedition' }
      ]
    }
  });

  assert.equal(state.visibility, 'visible');
  assert.equal(state.mode, 'start-map-prompt');
  assert.equal(state.primaryLine, 'Channel');
  assert.equal(state.secondaryLine, 'Breach \u00b7 PoE 2 \u00b7 Fate of the Vaal');
  assert.equal(state.metaLine, 'confirm map start');
  assert.deepEqual(JSON.parse(JSON.stringify(state.startMapPrompt)), {
    mapName: 'Channel',
    farmTypeId: 'breach',
    farmType: 'Breach',
    poeVersion: 'poe2',
    league: 'Fate of the Vaal',
    farmTypeOptions: [
      { id: 'breach', label: 'Breach' },
      { id: 'expedition', label: 'Expedition' }
    ],
    expiresAt: null
  });
});

test('overlay state model keeps explicit start-map prompts visible when passive overlay is disabled', () => {
  const deriveOverlayState = getOverlayStateModelExport('deriveOverlayState');

  const state = deriveOverlayState({
    enabled: false,
    startMapPrompt: {
      mapName: 'Cliffside',
      farmTypeId: 'abyss',
      farmType: 'Abyss',
      poeVersion: 'poe2',
      league: 'Fate of the Vaal',
      farmTypeOptions: [
        { id: 'abyss', label: 'Abyss' },
        { id: 'breach', label: 'Breach' }
      ]
    }
  });

  assert.equal(state.visibility, 'visible');
  assert.equal(state.mode, 'start-map-prompt');
  assert.equal(state.primaryLine, 'Cliffside');
  assert.equal(state.secondaryLine, 'Abyss \u00b7 PoE 2 \u00b7 Fate of the Vaal');
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

test('overlay state model asks which character is played when the realm has more than one', () => {
  const deriveOverlayState = getOverlayStateModelExport('deriveOverlayState');
  const characterPrompt = {
    poeVersion: 'poe2',
    selectedId: 'poe2-alt',
    characters: [
      { id: 'poe2-high', name: 'HighLevelDeadeye', className: 'Deadeye', level: 94 },
      { id: 'poe2-alt', name: 'AltShaman', className: 'Shaman', level: 88 }
    ]
  };

  const state = deriveOverlayState({ enabled: true, characterPrompt, runtime: { currentArea: 'Canal Hideout' } });

  assert.equal(state.mode, 'character-prompt');
  assert.equal(state.primaryLine, 'AltShaman');
  assert.equal(state.secondaryLine, 'Level 88 Shaman');
  assert.equal(state.metaLine, 'PoE 2');
  assert.equal(state.characterPrompt.characters.length, 2);
});

test('overlay state model skips the character prompt when there is no choice, the overlay is off, or a map prompt is up', () => {
  const deriveOverlayState = getOverlayStateModelExport('deriveOverlayState');
  const characterPrompt = {
    poeVersion: 'poe2',
    selectedId: 'poe2-alt',
    characters: [
      { id: 'poe2-high', name: 'HighLevelDeadeye', level: 94 },
      { id: 'poe2-alt', name: 'AltShaman', level: 88 }
    ]
  };

  assert.notEqual(deriveOverlayState({
    enabled: true,
    characterPrompt: { ...characterPrompt, characters: characterPrompt.characters.slice(1) }
  }).mode, 'character-prompt');
  assert.equal(deriveOverlayState({ enabled: false, characterPrompt }).visibility, 'hidden');
  assert.equal(deriveOverlayState({
    enabled: true,
    characterPrompt,
    startMapPrompt: { mapName: 'Headland' }
  }).mode, 'start-map-prompt');
});

test('prompts that close on their own count down to it', () => {
  const deriveOverlayState = getOverlayStateModelExport('deriveOverlayState');
  const formatOverlayClock = getOverlayStateModelExport('formatOverlayClock');
  const now = Date.parse('2026-05-04T12:15:12.000Z');

  const start = deriveOverlayState({ enabled: true, now, startMapPrompt: { mapName: 'Channel', expiresAt: now + 7000 } });
  assert.deepEqual(start.clock, { kind: 'countdown', expiresAt: now + 7000 });
  assert.equal(start.metaLine, 'closes in 7s');
  assert.equal(formatOverlayClock(start.clock, now + 1500), 'closes in 6s');
  assert.equal(formatOverlayClock(start.clock, now + 9000), 'closes in 0s');

  const character = deriveOverlayState({
    enabled: true,
    now,
    characterPrompt: {
      poeVersion: 'poe2',
      selectedId: 'a',
      expiresAt: now + 8000,
      characters: [{ id: 'a', name: 'MainOne', level: 95 }, { id: 'b', name: 'AltTwo', level: 80 }]
    }
  });
  assert.equal(character.metaLine, 'PoE 2 · 8s');
  assert.equal(formatOverlayClock(character.clock, now + 3000), 'PoE 2 · 5s');
});
