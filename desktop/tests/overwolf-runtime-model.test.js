const test = require('node:test');
const assert = require('node:assert/strict');

const MODEL_REQUEST = '../src/modules/overwolfRuntimeModel';

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadOverwolfRuntimeModel() {
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
  const moduleExports = loadOverwolfRuntimeModel();

  if (moduleExports.__loadError) {
    const { code, message } = moduleExports.__loadError;
    assert.fail(
      `Expected desktop/src/modules/overwolfRuntimeModel.js to exist and export ${exportName}. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof moduleExports[exportName],
    'function',
    `Expected overwolfRuntimeModel.${exportName} to be a function`
  );

  return moduleExports[exportName];
}

test('parseOverwolfPackagesUrl extracts inline and separate QA feed arguments', () => {
  const parseOverwolfPackagesUrl = getModelExport('parseOverwolfPackagesUrl');

  assert.equal(
    parseOverwolfPackagesUrl(['ow-electron', '.', '--owepm-packages-url=https://electronapi-qa.overwolf.com/packages']),
    'https://electronapi-qa.overwolf.com/packages'
  );
  assert.equal(
    parseOverwolfPackagesUrl(['ow-electron', '.', '--owepm-packages-url', 'https://electronapi-qa.overwolf.com/packages']),
    'https://electronapi-qa.overwolf.com/packages'
  );
  assert.equal(parseOverwolfPackagesUrl(['ow-electron', '.']), null);
});

test('getOverwolfRuntimeState reports a plain electron runtime when overwolf is absent', () => {
  const getOverwolfRuntimeState = getModelExport('getOverwolfRuntimeState');

  assert.deepEqual(
    getOverwolfRuntimeState({
      app: {},
      argv: ['electron', '.'],
      configuredPackages: ['gep'],
      isOverwolfRuntime: false,
      getOverwolfInfo() {
        return null;
      }
    }),
    {
      runtime: 'electron',
      appUid: null,
      packageFeedUrl: null,
      usingQaFeed: false,
      packagesConfigured: ['gep'],
      gepConfigured: true,
      gepAvailable: false,
      missingGepMethods: ['setRequiredFeatures', 'getInfo', 'on', 'removeListener']
    }
  );
});

test('getOverwolfRuntimeState reports an overwolf runtime with available gep methods', () => {
  const getOverwolfRuntimeState = getModelExport('getOverwolfRuntimeState');

  assert.deepEqual(
    getOverwolfRuntimeState({
      app: {
        overwolf: {
          packages: {
            gep: {
              setRequiredFeatures() {},
              getInfo() {},
              on() {},
              removeListener() {}
            }
          }
        }
      },
      argv: ['ow-electron', '.', '--owepm-packages-url=https://electronapi-qa.overwolf.com/packages'],
      configuredPackages: [' gep ', '', 'overlay'],
      isOverwolfRuntime: true,
      getOverwolfInfo() {
        return {
          appId: 'ow-juice-journal'
        };
      }
    }),
    {
      runtime: 'ow-electron',
      appUid: 'ow-juice-journal',
      packageFeedUrl: 'https://electronapi-qa.overwolf.com/packages',
      usingQaFeed: true,
      packagesConfigured: ['gep', 'overlay'],
      gepConfigured: true,
      gepAvailable: true,
      missingGepMethods: []
    }
  );
});
