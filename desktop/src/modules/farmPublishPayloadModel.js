(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.farmPublishPayloadModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFarmPublishPayloadModel() {
  const ALLOWED_VISIBILITIES = new Set(['private', 'unlisted', 'public']);
  const CALCULATED_STATUSES = new Set(['calculated', 'zeroCalculated']);
  const MAX_SETUP_DESCRIPTION_LENGTH = 1200;
  const MAX_TOP_LOOT_ITEMS = 10;

  function normalizeNumber(value, fallback = 0) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
  }

  function normalizeOptionalString(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || null;
  }

  function sanitizePlainText(value, { maxLength = MAX_SETUP_DESCRIPTION_LENGTH } = {}) {
    const normalized = normalizeOptionalString(value);
    if (!normalized) {
      return null;
    }

    return normalized
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  function normalizeVisibility(value) {
    return ALLOWED_VISIBILITIES.has(value) ? value : 'private';
  }

  function normalizeCalculationStatus(value) {
    if (value === 'failed') return 'failed';
    if (value === 'notCalculated') return 'notCalculated';
    if (value === 'zeroCalculated') return 'zeroCalculated';
    return 'calculated';
  }

  function getRunProfitChaos(run = {}) {
    if (!CALCULATED_STATUSES.has(run.calculationStatus)) {
      return null;
    }

    return normalizeNumber(run.profitChaos ?? run.netProfit, 0);
  }

  function resolveAggregateCalculationStatus(runs = []) {
    if (runs.length === 0) {
      return 'notCalculated';
    }

    const statuses = new Set(runs.map((run) => normalizeCalculationStatus(run.calculationStatus)));
    if (statuses.size === 1 && statuses.has('zeroCalculated')) {
      return 'zeroCalculated';
    }
    if ([...statuses].every((status) => CALCULATED_STATUSES.has(status))) {
      return 'calculated';
    }
    if (statuses.has('calculated') || statuses.has('zeroCalculated')) {
      return 'partial';
    }
    if (statuses.has('failed')) {
      return 'failed';
    }
    return 'notCalculated';
  }

  function getComparableTimestamp(value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function minTimestamp(runs = [], field) {
    const timestamps = runs
      .map((run) => getComparableTimestamp(run[field]))
      .filter(Number.isFinite);
    if (!timestamps.length) {
      return null;
    }
    return new Date(Math.min(...timestamps)).toISOString();
  }

  function maxTimestamp(runs = [], field) {
    const timestamps = runs
      .map((run) => getComparableTimestamp(run[field]))
      .filter(Number.isFinite);
    if (!timestamps.length) {
      return null;
    }
    return new Date(Math.max(...timestamps)).toISOString();
  }

  function mergeBreakdown(runs = []) {
    return runs.reduce((breakdown, run) => {
      const source = run.lootCategoryBreakdown || {};
      if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return breakdown;
      }

      Object.entries(source).forEach(([category, value]) => {
        if (!category || !value || typeof value !== 'object') {
          return;
        }

        if (!breakdown[category]) {
          breakdown[category] = { gainedChaos: 0, lostChaos: 0, netChaos: 0 };
        }

        breakdown[category].gainedChaos += normalizeNumber(value.gainedChaos ?? value.gained, 0);
        breakdown[category].lostChaos += normalizeNumber(value.lostChaos ?? value.lost, 0);
        breakdown[category].netChaos += normalizeNumber(value.netChaos ?? value.net, 0);
      });

      return breakdown;
    }, {});
  }

  function aggregateTopLoot(runs = []) {
    const byName = new Map();

    runs.forEach((run) => {
      const items = Array.isArray(run.topLootItems) ? run.topLootItems : [];
      items.forEach((item) => {
        const name = normalizeOptionalString(item.name);
        const totalChaos = normalizeNumber(item.totalChaos, 0);
        if (!name || totalChaos <= 0) {
          return;
        }

        const existing = byName.get(name) || { name, quantity: 0, totalChaos: 0 };
        existing.quantity += normalizeNumber(item.quantity, 0);
        existing.totalChaos += totalChaos;
        byName.set(name, existing);
      });
    });

    return [...byName.values()]
      .sort((left, right) => right.totalChaos - left.totalChaos)
      .slice(0, MAX_TOP_LOOT_ITEMS);
  }

  function resolvePriceContext(runs = []) {
    const source = runs.find((run) => run?.profitCurrencyRateSnapshot)?.profitCurrencyRateSnapshot || {};
    return {
      chaosDivineRate: normalizeNumber(source.chaosDivineRate, null),
      mirrorChaosRate: normalizeNumber(source.mirrorChaosRate, null),
      syncedAt: normalizeOptionalString(source.syncedAt)
    };
  }

  function resolveCharacter(runs = []) {
    const source = runs.find((run) => run?.characterClass || run?.ascendancy) || {};
    return {
      className: normalizeOptionalString(source.characterClass),
      ascendancy: normalizeOptionalString(source.ascendancy)
    };
  }

  function createMapSummary(run = {}) {
    return {
      localRunId: normalizeOptionalString(run.localRunId),
      mapName: normalizeOptionalString(run.mapName) || 'Unknown Map',
      durationSeconds: Math.max(0, normalizeNumber(run.durationSeconds, 0)),
      profitChaos: getRunProfitChaos(run),
      calculationStatus: normalizeCalculationStatus(run.calculationStatus)
    };
  }

  function buildFarmPublishPayload(inputRuns, options = {}) {
    const runs = (Array.isArray(inputRuns) ? inputRuns : [inputRuns])
      .filter((run) => run && typeof run === 'object');

    if (!runs.length) {
      return null;
    }

    const maps = runs.map(createMapSummary);
    const calculatedMaps = maps.filter((map) => CALCULATED_STATUSES.has(map.calculationStatus));
    const profitChaos = calculatedMaps.reduce((sum, map) => sum + normalizeNumber(map.profitChaos, 0), 0);
    const durationSeconds = maps.reduce((sum, map) => sum + normalizeNumber(map.durationSeconds, 0), 0);
    const firstRun = runs[0] || {};

    return {
      poeVersion: normalizeOptionalString(firstRun.poeVersion) || 'poe1',
      league: normalizeOptionalString(firstRun.league),
      visibility: normalizeVisibility(options.visibility),
      farmType: normalizeOptionalString(options.farmType || firstRun.farmType),
      runCount: runs.length,
      startedAt: minTimestamp(runs, 'startedAt'),
      endedAt: maxTimestamp(runs, 'endedAt') || maxTimestamp(runs, 'createdAt'),
      durationSeconds,
      setupDescription: sanitizePlainText(options.setupDescription),
      investmentKnown: options.investmentKnown === true,
      calculationStatus: resolveAggregateCalculationStatus(runs),
      profitChaos: calculatedMaps.length ? profitChaos : null,
      priceContext: resolvePriceContext(runs),
      maps,
      breakdown: mergeBreakdown(runs),
      topLoot: aggregateTopLoot(runs),
      character: resolveCharacter(runs),
      publisherDisplayName: sanitizePlainText(options.publisherDisplayName, { maxLength: 80 })
    };
  }

  return {
    buildFarmPublishPayload,
    sanitizePlainText
  };
});
