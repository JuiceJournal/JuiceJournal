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

  function normalizeOptionalString(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || null;
  }

  function normalizeTopLootItems(items = []) {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .map((item) => {
        const totalChaos = normalizeNumber(item.totalChaos ?? item.totalChaosValue ?? item.valueDelta);
        if (totalChaos === null || totalChaos <= 0) {
          return null;
        }

        return {
          name: normalizeOptionalString(item.name ?? item.label ?? item.baseType) || 'Unknown Item',
          quantity: normalizeNumber(item.quantity ?? item.quantityDelta) ?? 0,
          totalChaos
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.totalChaos - left.totalChaos)
      .slice(0, 10);
  }

  function normalizeLootCategoryBreakdown(breakdown = {}) {
    if (!breakdown || typeof breakdown !== 'object' || Array.isArray(breakdown)) {
      return {};
    }

    return Object.entries(breakdown).reduce((nextBreakdown, [category, value]) => {
      if (!category) {
        return nextBreakdown;
      }

      if (typeof value === 'number') {
        nextBreakdown[category] = {
          gainedChaos: Math.max(0, value),
          lostChaos: 0,
          netChaos: value
        };
        return nextBreakdown;
      }

      if (!value || typeof value !== 'object') {
        return nextBreakdown;
      }

      const gainedChaos = normalizeNumber(value.gainedChaos ?? value.gained) ?? 0;
      const lostChaos = normalizeNumber(value.lostChaos ?? value.lost) ?? 0;
      const netChaos = normalizeNumber(value.netChaos ?? value.net) ?? (gainedChaos - lostChaos);
      nextBreakdown[category] = { gainedChaos, lostChaos, netChaos };
      return nextBreakdown;
    }, {});
  }

  function normalizePriceContext(result = {}) {
    const rates = result.priceContext || result.profitCurrencyRateSnapshot || result.profitCurrencyRates || {};
    const chaosDivineRate = normalizeNumber(rates.chaosDivineRate ?? rates.divineChaos ?? rates.divinePrice);
    const mirrorChaosRate = normalizeNumber(rates.mirrorChaos ?? rates.mirrorPrice);
    const syncedAt = normalizeOptionalString(rates.syncedAt ?? rates.fetchedAt ?? rates.updatedAt);

    return {
      chaosDivineRate,
      mirrorChaosRate,
      syncedAt
    };
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
    const priceContext = normalizePriceContext(result);
    const lootCategoryBreakdown = normalizeLootCategoryBreakdown(
      result.lootCategoryBreakdown || result.categoryBreakdown
    );
    const topLootItems = normalizeTopLootItems(result.topLootItems || result.topOutputs);

    return {
      ...result,
      localRunId,
      calculationStatus,
      createdAt,
      profitChaos,
      profitCurrencyRateSnapshot: priceContext,
      lootCategoryBreakdown,
      topLootItems,
      characterClass: normalizeOptionalString(result.characterClass ?? result.className),
      ascendancy: normalizeOptionalString(result.ascendancy),
      publishState: result.publishState || 'local',
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
