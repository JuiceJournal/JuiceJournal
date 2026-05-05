const test = require('node:test');
const assert = require('node:assert/strict');

const MODEL_REQUEST = '../src/modules/profitCurrencyModel';

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadModel() {
  try {
    return require(MODEL_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, MODEL_REQUEST)) {
      throw error;
    }

    assert.fail(
      `Expected desktop/src/modules/profitCurrencyModel.js to exist. Current red state: ${error.code}: ${error.message}`
    );
  }
}

test('profit currency model keeps small values in chaos', () => {
  const { selectProfitCurrency, formatProfitCurrencyText } = loadModel();

  assert.deepEqual(
    selectProfitCurrency(99.5, { divineChaos: 100, mirrorChaos: 300000 }),
    { type: 'chaos', value: 99.5, chaosValue: 99.5, rateChaos: 1 }
  );
  assert.equal(formatProfitCurrencyText(99.5, { divineChaos: 100, mirrorChaos: 300000 }), '99.5c');
});

test('profit currency model switches to divine once profit reaches the live divine rate', () => {
  const { selectProfitCurrency, formatProfitCurrencyText } = loadModel();

  assert.deepEqual(
    selectProfitCurrency(5000, { divineChaos: 100, mirrorChaos: 300000 }),
    { type: 'divine', value: 50, chaosValue: 5000, rateChaos: 100 }
  );
  assert.equal(formatProfitCurrencyText(5000, { divineChaos: 100, mirrorChaos: 300000 }), '50.00 div');
});

test('profit currency model switches to mirror for very large values when the mirror rate is known', () => {
  const { selectProfitCurrency, formatProfitCurrencyText } = loadModel();

  assert.deepEqual(
    selectProfitCurrency(600000, { divineChaos: 100, mirrorChaos: 300000 }),
    { type: 'mirror', value: 2, chaosValue: 600000, rateChaos: 300000 }
  );
  assert.equal(formatProfitCurrencyText(600000, { divineChaos: 100, mirrorChaos: 300000 }), '2.00 mirror');
});

test('profit currency model keeps signs while formatting adaptive output', () => {
  const { formatProfitCurrencyText } = loadModel();

  assert.equal(formatProfitCurrencyText(5000, { divineChaos: 100 }, { signed: true }), '+50.00 div');
  assert.equal(formatProfitCurrencyText(-5000, { divineChaos: 100 }, { signed: true }), '-50.00 div');
  assert.equal(formatProfitCurrencyText(0, { divineChaos: 100 }, { signed: true }), '0.0c');
});

test('profit currency model ignores invalid rates and falls back to chaos', () => {
  const { normalizeProfitCurrencyRates, selectProfitCurrency } = loadModel();

  assert.deepEqual(normalizeProfitCurrencyRates({ divineChaos: 0, mirrorChaos: -1 }), {
    divineChaos: null,
    mirrorChaos: null
  });
  assert.deepEqual(
    selectProfitCurrency(5000, { divineChaos: 0, mirrorChaos: -1 }),
    { type: 'chaos', value: 5000, chaosValue: 5000, rateChaos: 1 }
  );
});
