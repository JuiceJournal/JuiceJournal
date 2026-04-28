const test = require('node:test');
const assert = require('node:assert/strict');

const MODEL_REQUEST = '../src/modules/nativeGameInfoProducerModel';

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadNativeGameInfoProducerModel() {
  try {
    return require(MODEL_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, MODEL_REQUEST)) {
      throw error;
    }

    return { __loadError: error };
  }
}

function getNativeGameInfoProducerModelExport(exportName) {
  const nativeGameInfoProducerModel = loadNativeGameInfoProducerModel();

  if (nativeGameInfoProducerModel.__loadError) {
    const { code, message } = nativeGameInfoProducerModel.__loadError;
    assert.fail(
      `Expected desktop/src/modules/nativeGameInfoProducerModel.js to exist and export ${exportName}. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof nativeGameInfoProducerModel[exportName],
    'function',
    `Expected nativeGameInfoProducerModel.${exportName} to be a function`
  );

  return nativeGameInfoProducerModel[exportName];
}

test('getRequiredFeaturesForVersion returns PoE2 feature set', () => {
  const getRequiredFeaturesForVersion = getNativeGameInfoProducerModelExport('getRequiredFeaturesForVersion');

  assert.deepEqual(
    getRequiredFeaturesForVersion('poe2'),
    ['gep_internal', 'me', 'match_info', 'game_info', 'death', 'kill']
  );
});

test('getRequiredFeaturesForVersion returns PoE1 and PoE2 runtime feature sets', () => {
  const getRequiredFeaturesForVersion = getNativeGameInfoProducerModelExport('getRequiredFeaturesForVersion');
  const expectedFeatures = ['gep_internal', 'me', 'match_info', 'game_info', 'death', 'kill'];

  assert.deepEqual(getRequiredFeaturesForVersion('poe1'), expectedFeatures);
  assert.deepEqual(getRequiredFeaturesForVersion('poe2'), expectedFeatures);
});

test('normalizeNativeInfoPayload returns a high-confidence hint', () => {
  const normalizeNativeInfoPayload = getNativeGameInfoProducerModelExport('normalizeNativeInfoPayload');

  const hint = normalizeNativeInfoPayload({
    poeVersion: 'poe2',
    info: {
      me: {
        character_name: 'KELLEE',
        character_level: 92,
        character_exp: 123456789
      }
    }
  });

  assert.deepEqual(hint, {
    source: 'native-info',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    className: null,
    level: 92,
    experience: 123456789,
    currentZone: null,
    openedPage: null,
    inTown: null,
    scene: null,
    eventName: null,
    eventData: null,
    confidence: 'high'
  });
});

test('normalizeNativeInfoPayload maps PoE1 character and runtime fields', () => {
  const normalizeNativeInfoPayload = getNativeGameInfoProducerModelExport('normalizeNativeInfoPayload');

  const hint = normalizeNativeInfoPayload({
    poeVersion: 'poe1',
    info: {
      me: {
        character_name: 'MapRunner',
        character_level: '95',
        character_class: 'Deadeye',
        character_experience: '987654321'
      },
      match_info: {
        current_zone: 'Cemetery',
        opened_page: 'stash'
      },
      language: {
        language: 'en',
        chat_language: 'en'
      }
    }
  });

  assert.deepEqual(hint, {
    source: 'native-info',
    poeVersion: 'poe1',
    characterName: 'MapRunner',
    className: 'Deadeye',
    level: 95,
    experience: 987654321,
    currentZone: 'Cemetery',
    openedPage: 'stash',
    inTown: null,
    scene: null,
    eventName: null,
    eventData: null,
    confidence: 'high'
  });
});

test('normalizeNativeInfoPayload maps PoE2 optional runtime fields', () => {
  const normalizeNativeInfoPayload = getNativeGameInfoProducerModelExport('normalizeNativeInfoPayload');

  const hint = normalizeNativeInfoPayload({
    poeVersion: 'poe2',
    info: {
      me: {
        character_name: 'StormCaller',
        character_level: '44',
        character_class: 'Sorceress',
        character_exp: '12345'
      },
      match_info: {
        current_zone: 'Clearfell',
        opened_page: 'inventory',
        in_town: 'true'
      },
      game_info: {
        scene: 'in_game'
      }
    }
  });

  assert.deepEqual(hint, {
    source: 'native-info',
    poeVersion: 'poe2',
    characterName: 'StormCaller',
    className: 'Sorceress',
    level: 44,
    experience: 12345,
    currentZone: 'Clearfell',
    openedPage: 'inventory',
    inTown: true,
    scene: 'in_game',
    eventName: null,
    eventData: null,
    confidence: 'high'
  });
});

test('normalizeNativeInfoPayload unwraps JSON-quoted GEP string fields', () => {
  const normalizeNativeInfoPayload = getNativeGameInfoProducerModelExport('normalizeNativeInfoPayload');

  const hint = normalizeNativeInfoPayload({
    poeVersion: 'poe2',
    info: {
      me: {
        character_name: '"AbuserSpear"',
        character_level: '"92"',
        character_class: '"Huntress"',
        character_exp: 2312556745
      },
      match_info: {
        current_zone: '"Canal Hideout"',
        opened_page: '"character_sheet"',
        in_town: true
      },
      game_info: {
        scene: '"in_game"'
      }
    }
  });

  assert.equal(hint.characterName, 'AbuserSpear');
  assert.equal(hint.className, 'Huntress');
  assert.equal(hint.level, 92);
  assert.equal(hint.currentZone, 'Canal Hideout');
  assert.equal(hint.openedPage, 'character_sheet');
  assert.equal(hint.scene, 'in_game');
});

test('normalizeNativeInfoPayload returns null without character_name', () => {
  const normalizeNativeInfoPayload = getNativeGameInfoProducerModelExport('normalizeNativeInfoPayload');

  assert.equal(
    normalizeNativeInfoPayload({
      poeVersion: 'poe2',
      info: { me: { character_level: 92 } }
    }),
    null
  );
});

test('normalizeNativeInfoPayload treats empty-ish numeric fields as null', () => {
  const normalizeNativeInfoPayload = getNativeGameInfoProducerModelExport('normalizeNativeInfoPayload');

  const cases = [
    {
      message: 'blank strings',
      me: {
        character_name: 'KELLEE',
        character_level: '',
        character_exp: '   '
      }
    },
    {
      message: 'null and undefined',
      me: {
        character_name: 'KELLEE',
        character_level: null,
        character_exp: undefined
      }
    },
    {
      message: 'booleans',
      me: {
        character_name: 'KELLEE',
        character_level: false,
        character_exp: true
      }
    }
  ];

  for (const { message, me } of cases) {
    const hint = normalizeNativeInfoPayload({
      poeVersion: 'poe2',
      info: { me }
    });

    assert.deepEqual(
      hint,
      {
        source: 'native-info',
        poeVersion: 'poe2',
        characterName: 'KELLEE',
        className: null,
        level: null,
        experience: null,
        currentZone: null,
        openedPage: null,
        inTown: null,
        scene: null,
        eventName: null,
        eventData: null,
        confidence: 'high'
      },
      `Expected null numeric hint values for ${message}`
    );
  }
});

test('poeVersion normalization trims and lowercases across exported behaviors', () => {
  const getRequiredFeaturesForVersion = getNativeGameInfoProducerModelExport('getRequiredFeaturesForVersion');
  const normalizeNativeInfoPayload = getNativeGameInfoProducerModelExport('normalizeNativeInfoPayload');

  assert.deepEqual(
    getRequiredFeaturesForVersion('  PoE2  '),
    ['gep_internal', 'me', 'match_info', 'game_info', 'death', 'kill']
  );
  assert.deepEqual(getRequiredFeaturesForVersion(' PoE 1 '), []);

  const hint = normalizeNativeInfoPayload({
    poeVersion: '  PoE2  ',
    info: {
      me: {
        character_name: 'KELLEE',
        character_level: 92,
        character_exp: 123456789
      }
    }
  });

  assert.deepEqual(hint, {
    source: 'native-info',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    className: null,
    level: 92,
    experience: 123456789,
    currentZone: null,
    openedPage: null,
    inTown: null,
    scene: null,
    eventName: null,
    eventData: null,
    confidence: 'high'
  });

  assert.equal(
    normalizeNativeInfoPayload({
      poeVersion: ' PathOfExile2 ',
      info: { me: { character_name: 'KELLEE' } }
    }),
    null
  );
});

test('normalizeNativeEventPayload maps non-chat Overwolf events without character identity', () => {
  const normalizeNativeEventPayload = getNativeGameInfoProducerModelExport('normalizeNativeEventPayload');

  assert.deepEqual(normalizeNativeEventPayload({
    poeVersion: 'poe2',
    event: { name: 'boss_kill', data: 'Fire Fury' }
  }), {
    source: 'native-info',
    poeVersion: 'poe2',
    characterName: null,
    className: null,
    level: null,
    experience: null,
    currentZone: null,
    openedPage: null,
    inTown: null,
    scene: null,
    eventName: 'boss_kill',
    eventData: 'Fire Fury',
    confidence: 'medium'
  });

  assert.deepEqual(normalizeNativeEventPayload({
    poeVersion: 'poe1',
    event: { name: 'death', data: null }
  }), {
    source: 'native-info',
    poeVersion: 'poe1',
    characterName: null,
    className: null,
    level: null,
    experience: null,
    currentZone: null,
    openedPage: null,
    inTown: null,
    scene: null,
    eventName: 'death',
    eventData: null,
    confidence: 'medium'
  });
});

test('normalizeNativeEventPayload drops raw chat content and malformed events', () => {
  const normalizeNativeEventPayload = getNativeGameInfoProducerModelExport('normalizeNativeEventPayload');

  assert.equal(normalizeNativeEventPayload({
    poeVersion: 'poe2',
    event: { name: 'chat', data: '#global raw chat line' }
  }), null);
  assert.equal(normalizeNativeEventPayload({
    poeVersion: 'poe2',
    event: { data: 'missing event name' }
  }), null);
  assert.equal(normalizeNativeEventPayload({
    poeVersion: 'unknown',
    event: { name: 'death', data: null }
  }), null);
});
