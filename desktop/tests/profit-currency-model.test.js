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

test('currency amounts group thousands and drop decimals the size of the number does not need', () => {
  const { formatCurrencyAmount } = loadModel();

  assert.equal(formatCurrencyAmount(97800, 'chaos'), '97,800');
  assert.equal(formatCurrencyAmount(540, 'chaos', { signed: true }), '+540');
  assert.equal(formatCurrencyAmount(-540, 'chaos', { signed: true }), '-540');
  assert.equal(formatCurrencyAmount(12.34, 'chaos'), '12.3');
  assert.equal(formatCurrencyAmount(0.456, 'chaos'), '0.46');
  assert.equal(formatCurrencyAmount(2, 'divine'), '2.00');
  assert.equal(formatCurrencyAmount(45.67, 'divine'), '45.7');
  assert.equal(formatCurrencyAmount(489.4, 'divine'), '489');
  assert.equal(formatCurrencyAmount(1.5, 'mirror'), '1.50');
  assert.equal(formatCurrencyAmount(0, 'chaos', { signed: true }), '0');
  assert.equal(formatCurrencyAmount('not a number', 'chaos'), '0');

  // Values that round into the next band take that band's precision, and nothing rounds to a signed zero.
  assert.equal(formatCurrencyAmount(99.96, 'chaos'), '100');
  assert.equal(formatCurrencyAmount(0.996, 'chaos'), '1.0');
  assert.equal(formatCurrencyAmount(9.996, 'divine'), '10.0');
  assert.equal(formatCurrencyAmount(99.96, 'divine'), '100');
  assert.equal(formatCurrencyAmount(-0.001, 'chaos'), '0');
  assert.equal(formatCurrencyAmount(0.001, 'chaos', { signed: true }), '0');
});
