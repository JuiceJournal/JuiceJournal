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
