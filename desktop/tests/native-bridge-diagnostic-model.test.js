const test = require('node:test');
const assert = require('node:assert/strict');

const MODEL_REQUEST = '../src/modules/nativeBridgeDiagnosticModel';

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadNativeBridgeDiagnosticModel() {
  try {
    return require(MODEL_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, MODEL_REQUEST)) {
      throw error;
    }

    return { __loadError: error };
  }
}

function getNormalizeNativeBridgeDiagnostic() {
  const nativeBridgeDiagnosticModel = loadNativeBridgeDiagnosticModel();

  if (nativeBridgeDiagnosticModel.__loadError) {
    const { code, message } = nativeBridgeDiagnosticModel.__loadError;
    assert.fail(
      `Expected desktop/src/modules/nativeBridgeDiagnosticModel.js to exist and export normalizeNativeBridgeDiagnostic. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof nativeBridgeDiagnosticModel.normalizeNativeBridgeDiagnostic,
    'function',
    'Expected nativeBridgeDiagnosticModel.normalizeNativeBridgeDiagnostic to be a function'
  );

  return nativeBridgeDiagnosticModel.normalizeNativeBridgeDiagnostic;
}

test('normalizeNativeBridgeDiagnostic accepts supported bridge diagnostics', () => {
  const normalizeNativeBridgeDiagnostic = getNormalizeNativeBridgeDiagnostic();

  const payload = normalizeNativeBridgeDiagnostic({
    type: 'bridge-diagnostic',
    message: 'window-probe',
    detectedAt: '2026-04-14T12:00:00.000Z',
    data: { processId: 1234 }
  });

  assert.deepEqual(payload, {
    type: 'bridge-diagnostic',
    message: 'window-probe',
    detectedAt: '2026-04-14T12:00:00.000Z',
    data: { processId: 1234 }
  });
});

test('normalizeNativeBridgeDiagnostic rejects non-diagnostic payloads', () => {
  const normalizeNativeBridgeDiagnostic = getNormalizeNativeBridgeDiagnostic();

  assert.equal(
    normalizeNativeBridgeDiagnostic({
      type: 'active-character-hint',
      detectedAt: '2026-04-14T12:00:00.000Z'
    }),
    null
  );
});
