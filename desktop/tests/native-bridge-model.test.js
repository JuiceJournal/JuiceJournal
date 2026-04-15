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

  const payload = parseNativeBridgeLine('{"type":"bridge-diagnostic","level":"info","message":"ready","detectedAt":"2026-04-14T12:00:00.000Z"}');

  assert.deepEqual(payload, {
    type: 'bridge-diagnostic',
    level: 'info',
    message: 'ready',
    detectedAt: '2026-04-14T12:00:00.000Z'
  });
});

test('parseNativeBridgeLine returns a supported active-character-hint payload', () => {
  const parseNativeBridgeLine = getParseNativeBridgeLine();

  const payload = parseNativeBridgeLine(
    '{"type":" active-character-hint ","poeVersion":" poe2 ","characterName":" KELLEE ","confidence":"high","source":" local-native-bridge ","detectedAt":" 2026-04-15T12:00:00.000Z "}'
  );

  assert.deepEqual(payload, {
    type: 'active-character-hint',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    confidence: 'high',
    source: 'local-native-bridge',
    detectedAt: '2026-04-15T12:00:00.000Z'
  });
});

test('parseNativeBridgeLine rejects arrays and contract-invalid objects', () => {
  const parseNativeBridgeLine = getParseNativeBridgeLine();

  assert.equal(parseNativeBridgeLine('[]'), null);
  assert.equal(parseNativeBridgeLine('{}'), null);
  assert.equal(parseNativeBridgeLine('{"type":"bridge-diagnostic"}'), null);
  assert.equal(parseNativeBridgeLine('{"detectedAt":"2026-04-14T12:00:00.000Z"}'), null);
});

test('parseNativeBridgeLine trims required bridge contract fields', () => {
  const parseNativeBridgeLine = getParseNativeBridgeLine();

  const payload = parseNativeBridgeLine('{"type":" bridge-diagnostic ","level":"info","message":"ready","detectedAt":" 2026-04-14T12:00:00.000Z "}');

  assert.deepEqual(payload, {
    type: 'bridge-diagnostic',
    level: 'info',
    message: 'ready',
    detectedAt: '2026-04-14T12:00:00.000Z'
  });
});
