const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeNativeBridgeDiagnostic
} = require('../src/modules/nativeBridgeDiagnosticModel');

test('normalizeNativeBridgeDiagnostic accepts supported bridge diagnostics', () => {
  const payload = normalizeNativeBridgeDiagnostic({
    type: 'bridge-diagnostic',
    level: 'info',
    message: 'window-probe',
    detectedAt: '2026-04-14T12:00:00.000Z',
    data: { processId: 1234 }
  });

  assert.deepEqual(payload, {
    type: 'bridge-diagnostic',
    level: 'info',
    message: 'window-probe',
    detectedAt: '2026-04-14T12:00:00.000Z',
    data: { processId: 1234 }
  });
});

test('normalizeNativeBridgeDiagnostic rejects non-diagnostic payloads', () => {
  assert.equal(
    normalizeNativeBridgeDiagnostic({
      type: 'active-character-hint',
      detectedAt: '2026-04-14T12:00:00.000Z'
    }),
    null
  );

  assert.equal(
    normalizeNativeBridgeDiagnostic({
      type: 'bridge-diagnostic',
      detectedAt: '   '
    }),
    null
  );
});
