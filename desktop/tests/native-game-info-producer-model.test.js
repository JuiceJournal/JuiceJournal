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
    ['gep_internal', 'me', 'match_info']
  );
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
    level: 92,
    experience: 123456789,
    confidence: 'high'
  });
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
        level: null,
        experience: null,
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
    ['gep_internal', 'me', 'match_info']
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
    level: 92,
    experience: 123456789,
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
