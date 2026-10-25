(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.profitCurrencyModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createProfitCurrencyModel() {
  function normalizePositiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function normalizeProfitCurrencyRates(rates = {}) {
    return {
      divineChaos: normalizePositiveNumber(rates.divineChaos),
      mirrorChaos: normalizePositiveNumber(rates.mirrorChaos)
    };
  }

  function selectProfitCurrency(chaosValue, rates = {}) {
    const normalizedChaos = Number(chaosValue) || 0;
    const absoluteChaos = Math.abs(normalizedChaos);
    const normalizedRates = normalizeProfitCurrencyRates(rates);

    if (normalizedRates.mirrorChaos && absoluteChaos >= normalizedRates.mirrorChaos) {
      return {
        type: 'mirror',
        value: normalizedChaos / normalizedRates.mirrorChaos,
        chaosValue: normalizedChaos,
        rateChaos: normalizedRates.mirrorChaos
      };
    }

    if (normalizedRates.divineChaos && absoluteChaos >= normalizedRates.divineChaos) {
      return {
        type: 'divine',
        value: normalizedChaos / normalizedRates.divineChaos,
        chaosValue: normalizedChaos,
        rateChaos: normalizedRates.divineChaos
      };
    }

    return {
      type: 'chaos',
      value: normalizedChaos,
      chaosValue: normalizedChaos,
      rateChaos: 1
    };
  }

  function formatSelectedCurrency(selected, { signed = false } = {}) {
    const normalizedValue = Number(selected?.value) || 0;
    const absoluteValue = Math.abs(normalizedValue);
    const sign = signed && normalizedValue > 0 ? '+'
      : normalizedValue < 0 ? '-'
        : '';

    if (selected?.type === 'mirror') {
      return `${sign}${absoluteValue.toFixed(2)} mirror`;
    }

    if (selected?.type === 'divine') {
      return `${sign}${absoluteValue.toFixed(2)} div`;
    }

    return `${sign}${absoluteValue.toFixed(1)}c`;
  }

  function formatProfitCurrencyText(chaosValue, rates = {}, options = {}) {
    return formatSelectedCurrency(selectProfitCurrency(chaosValue, rates), options);
  }

  // The number next to a currency icon: chaos drops decimals once it is large, divine and mirror keep two below 10,
  // thousands are grouped. It rounds first, so a value that rounds into the next band takes that band's precision.
  function formatCurrencyAmount(value, type = 'chaos', { signed = false } = {}) {
    const num = parseFloat(value);
    if (!Number.isFinite(num) || num === 0) {
      return '0';
    }

    const digitsFor = (abs) => (type === 'divine' || type === 'mirror'
      ? (abs < 10 ? 2 : abs < 100 ? 1 : 0)
      : (abs >= 100 ? 0 : abs >= 1 ? 1 : 2));
    const digits = digitsFor(Math.abs(Number(num.toFixed(digitsFor(Math.abs(num))))));
    const rounded = Number(num.toFixed(digits));
    if (rounded === 0) {
      return '0';
    }

    const formatted = rounded.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return signed && rounded > 0 ? `+${formatted}` : formatted;
  }

  return {
    normalizeProfitCurrencyRates,
    selectProfitCurrency,
    formatProfitCurrencyText,
    formatCurrencyAmount
  };
});
