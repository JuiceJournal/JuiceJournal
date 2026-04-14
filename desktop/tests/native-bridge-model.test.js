const test = require('node:test');
const assert = require('node:assert/strict');

const MODEL_REQUEST = '../src/modules/nativeBridgeModel';

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadNativeBridgeModel() {
  try {
    return require(MODEL_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, MODEL_REQUEST)) {
      throw error;
    }

    return { __loadError: error };
  }
}

function getParseNativeBridgeLine() {
  const nativeBridgeModel = loadNativeBridgeModel();

  if (nativeBridgeModel.__loadError) {
    const { code, message } = nativeBridgeModel.__loadError;
    assert.fail(
      `Expected desktop/src/modules/nativeBridgeModel.js to exist and export parseNativeBridgeLine. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof nativeBridgeModel.parseNativeBridgeLine,
    'function',
    'Expected nativeBridgeModel.parseNativeBridgeLine to be a function'
  );

  return nativeBridgeModel.parseNativeBridgeLine;
}

test('parseNativeBridgeLine returns null for malformed json', () => {
  const parseNativeBridgeLine = getParseNativeBridgeLine();

  assert.equal(parseNativeBridgeLine('not-json'), null);
});

test('parseNativeBridgeLine returns a diagnostic payload', () => {
  const parseNativeBridgeLine = getParseNativeBridgeLine();

  const payload = parseNativeBridgeLine('{"type":"bridge-diagnostic","level":"info","message":"ready"}');

  assert.deepEqual(payload, {
    type: 'bridge-diagnostic',
    level: 'info',
    message: 'ready'
  });
});
