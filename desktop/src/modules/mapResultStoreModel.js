(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.mapResultStoreModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMapResultStoreModel() {
  const VALID_CALCULATION_STATUSES = new Set([
    'calculated',
    'zeroCalculated',
    'notCalculated',
    'failed'
  ]);

  function normalizeNumber(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function resolveCalculationStatus(result = {}) {
    if (VALID_CALCULATION_STATUSES.has(result.calculationStatus)) {
      return result.calculationStatus;
    }

    if (result.profitUnavailable) {
      return 'notCalculated';
    }

    const profitChaos = normalizeNumber(result.profitChaos ?? result.netProfit);
    if (profitChaos === null) {
      return 'notCalculated';
    }

    return profitChaos === 0 ? 'zeroCalculated' : 'calculated';
  }

  function normalizeMapResultForLedger(result = {}, { now = () => new Date().toISOString() } = {}) {
    if (!result || typeof result !== 'object') {
      return null;
    }

    const calculationStatus = resolveCalculationStatus(result);
    const rawProfit = normalizeNumber(result.profitChaos ?? result.netProfit);
    const profitChaos = calculationStatus === 'notCalculated' ? null : (rawProfit ?? 0);
    const createdAt = result.createdAt || now();
    const localRunId = result.localRunId || result.id || `local-run-${createdAt}`;

    return {
      ...result,
      localRunId,
      calculationStatus,
      createdAt,
      profitChaos,
      source: result.source || 'desktop'
    };
  }

  function appendMapResult(existingResults = [], nextResult, { maxResults = 100 } = {}) {
    return [nextResult, ...existingResults]
      .filter(Boolean)
      .filter((entry, index, list) => {
        if (!entry?.id) {
          return true;
        }

        return index === list.findIndex((candidate) => candidate?.id === entry.id);
      })
      .slice(0, maxResults);
  }

  function filterMapResults(results = [], { farmType = '' } = {}) {
    if (!farmType) {
      return results;
    }

    return results.filter((result) => result?.farmType === farmType);
  }

  return {
    appendMapResult,
    filterMapResults,
    normalizeMapResultForLedger
  };
});
