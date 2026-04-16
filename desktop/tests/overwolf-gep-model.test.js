const test = require('node:test');
const assert = require('node:assert/strict');

const MODEL_REQUEST = '../src/modules/overwolfGepModel';

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadOverwolfGepModel() {
  try {
    return require(MODEL_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, MODEL_REQUEST)) {
      throw error;
    }

    return { __loadError: error };
  }
}

function getModelExport(exportName) {
  const moduleExports = loadOverwolfGepModel();

  if (moduleExports.__loadError) {
    const { code, message } = moduleExports.__loadError;
    assert.fail(
      `Expected desktop/src/modules/overwolfGepModel.js to exist and export ${exportName}. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof moduleExports[exportName],
    'function',
    `Expected overwolfGepModel.${exportName} to be a function`
  );

  return moduleExports[exportName];
}

test('getOverwolfGepCapability returns available when required methods exist', () => {
  const getOverwolfGepCapability = getModelExport('getOverwolfGepCapability');

  assert.deepEqual(
    getOverwolfGepCapability({
      setRequiredFeatures() {},
      getInfo() {},
      on() {},
      removeListener() {}
    }),
    {
      status: 'available',
      missing: []
    }
  );
});

test('getOverwolfGepCapability lists missing required methods when the package is incomplete', () => {
  const getOverwolfGepCapability = getModelExport('getOverwolfGepCapability');

  assert.deepEqual(
    getOverwolfGepCapability({
      getInfo() {},
      on() {}
    }),
    {
      status: 'unavailable',
      missing: ['setRequiredFeatures', 'removeListener']
    }
  );
});

test('getRequiredFeaturesForVersion only returns the poe2 feature set', () => {
  const getRequiredFeaturesForVersion = getModelExport('getRequiredFeaturesForVersion');

  assert.deepEqual(
    getRequiredFeaturesForVersion('  PoE2  '),
    ['gep_internal', 'me', 'match_info']
  );
  assert.deepEqual(getRequiredFeaturesForVersion('poe1'), []);
});

test('normalizeOverwolfInfoHint returns a high-confidence poe2 hint from me.character_name', () => {
  const normalizeOverwolfInfoHint = getModelExport('normalizeOverwolfInfoHint');

  assert.deepEqual(
    normalizeOverwolfInfoHint({
      poeVersion: '  PoE2  ',
      info: {
        me: {
          character_name: ' KELLEE ',
          character_level: 92,
          character_exp: 123456789,
          character_class: ' Invoker '
        }
      }
    }),
    {
      source: 'overwolf-gep',
      poeVersion: 'poe2',
      characterName: 'KELLEE',
      className: 'Invoker',
      level: 92,
      experience: 123456789,
      confidence: 'high'
    }
  );
});

test('normalizeOverwolfInfoHint returns null without a usable poe2 character name', () => {
  const normalizeOverwolfInfoHint = getModelExport('normalizeOverwolfInfoHint');

  assert.equal(
    normalizeOverwolfInfoHint({
      poeVersion: 'poe1',
      info: {
        me: {
          character_name: 'KELLEE'
        }
      }
    }),
    null
  );

  assert.equal(
    normalizeOverwolfInfoHint({
      poeVersion: 'poe2',
      info: {
        me: {
          character_level: 92
        }
      }
    }),
    null
  );
});
