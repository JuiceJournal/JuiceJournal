const test = require('node:test');
const assert = require('node:assert/strict');

const PRODUCER_REQUEST = '../src/modules/overwolfGepProducer';

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadOverwolfGepProducer() {
  try {
    return require(PRODUCER_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, PRODUCER_REQUEST)) {
      throw error;
    }

    return { __loadError: error };
  }
}

function getCreateOverwolfGepProducer() {
  const moduleExports = loadOverwolfGepProducer();

  if (moduleExports.__loadError) {
    const { code, message } = moduleExports.__loadError;
    assert.fail(
      `Expected desktop/src/modules/overwolfGepProducer.js to exist and export createOverwolfGepProducer. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof moduleExports.createOverwolfGepProducer,
    'function',
    'Expected overwolfGepProducer.createOverwolfGepProducer to be a function'
  );

  return moduleExports.createOverwolfGepProducer;
}

test('producer reports unavailable when the gep package is missing required methods', async () => {
  const createOverwolfGepProducer = getCreateOverwolfGepProducer();
  const diagnostics = [];
  const producer = createOverwolfGepProducer({
    gep: { getInfo() {} },
    emitDiagnostic: payload => diagnostics.push(payload)
  });

  const started = await producer.start({
    poeVersion: 'poe2',
    gameId: 24886
  });

  assert.equal(started, false);
  assert.deepEqual(
    diagnostics.map(({ type, code, missing, poeVersion }) => ({ type, code, missing, poeVersion })),
    [{
      type: 'overwolf-gep-diagnostic',
      code: 'overwolf-gep-unavailable',
      missing: ['setRequiredFeatures', 'on', 'removeListener'],
      poeVersion: 'poe2'
    }]
  );
});

test('producer emits a normalized hint after the initial getInfo fetch', async () => {
  const createOverwolfGepProducer = getCreateOverwolfGepProducer();
  const listeners = new Map();
  const emittedHints = [];
  const producer = createOverwolfGepProducer({
    gep: {
      async setRequiredFeatures() {},
      async getInfo() {
        return {
          me: {
            character_name: 'KELLEE',
            character_level: 92,
            character_exp: 123456789,
            character_class: 'Invoker'
          }
        };
      },
      on(eventName, handler) {
        listeners.set(eventName, handler);
      },
      removeListener(eventName, handler) {
        if (listeners.get(eventName) === handler) {
          listeners.delete(eventName);
        }
      }
    },
    emitHint: payload => emittedHints.push(payload)
  });

  const started = await producer.start({
    poeVersion: 'poe2',
    gameId: 24886
  });

  assert.equal(started, true);
  assert.equal(typeof listeners.get('new-info-update'), 'function');
  assert.equal(typeof listeners.get('game-exit'), 'function');
  assert.deepEqual(emittedHints, [{
    source: 'overwolf-gep',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    className: 'Invoker',
    level: 92,
    experience: 123456789,
    confidence: 'high'
  }]);
});
