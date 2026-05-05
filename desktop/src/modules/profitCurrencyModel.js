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

  return {
    normalizeProfitCurrencyRates,
    selectProfitCurrency,
    formatProfitCurrencyText
  };
});
