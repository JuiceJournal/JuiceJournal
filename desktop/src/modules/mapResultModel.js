(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.mapResultModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMapResultModel() {
  const MAX_TOP_ITEMS = 3;

  function normalizeString(value, fallback = null) {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
  }

  function normalizeNumber(value, fallback = 0) {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : fallback;
  }

  function normalizePoeVersion(value) {
    const normalized = normalizeString(value)?.toLowerCase();
    return normalized === 'poe1' || normalized === 'poe2' ? normalized : null;
  }

  function resolveFarmTypeLabel(farmType) {
    if (farmType && typeof farmType === 'object') {
      return normalizeString(farmType.label);
    }

    return normalizeString(farmType);
  }

  function getItemKey(item = {}) {
    const explicitKey = normalizeString(item.itemKey);
    if (explicitKey) {
      return explicitKey.toLowerCase();
    }

    const name = normalizeString(item.baseType ?? item.typeLine ?? item.name, 'Unknown Item').toLowerCase();
    const category = normalizeString(item.category, 'other').toLowerCase();

    if (category === 'unique' && normalizeString(item.name)) {
      return `${normalizeString(item.name).toLowerCase()}::${category}`;
    }

    return `${name}::${category}`;
  }

  function getItemName(item = {}) {
    return normalizeString(item.baseType ?? item.typeLine ?? item.name, 'Unknown Item');
  }

  function getItemQuantity(item = {}) {
    return Math.max(0, normalizeNumber(item.quantity, 1));
  }

  function getItemChaosValue(item = {}) {
    const directValue = normalizeNumber(item.chaosValue, NaN);
    if (Number.isFinite(directValue)) {
      return Math.max(0, directValue);
    }

    const quantity = getItemQuantity(item);
    if (!quantity) {
      return 0;
    }

    return Math.max(0, normalizeNumber(item.totalChaosValue, 0) / quantity);
  }

  function getItemTotalValue(item = {}) {
    const directValue = normalizeNumber(item.totalChaosValue, NaN);
    if (Number.isFinite(directValue)) {
      return Math.max(0, directValue);
    }

    return getItemQuantity(item) * getItemChaosValue(item);
  }

  function indexSnapshotItems(snapshot = {}) {
    const index = new Map();
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];

    items.forEach((item) => {
      const itemKey = getItemKey(item);
      const current = index.get(itemKey);
      const nextQuantity = getItemQuantity(item);
      const nextValue = getItemTotalValue(item);

      if (current) {
        current.quantity += nextQuantity;
        current.totalValue += nextValue;
        current.chaosValue = current.quantity > 0
          ? current.totalValue / current.quantity
          : current.chaosValue;
        if (!current.icon && item.icon) {
          current.icon = item.icon;
        }
        return;
      }

      index.set(itemKey, {
        itemKey,
        name: getItemName(item),
        category: normalizeString(item.category, 'other'),
        quantity: nextQuantity,
        totalValue: nextValue,
        chaosValue: getItemChaosValue(item),
        icon: normalizeString(item.icon)
      });
    });

    return index;
  }

  function getCurrencyCode(item = {}) {
    return normalizeString(item.currencyCode, 'chaos');
  }

  function normalizeReportEntry(entry = {}) {
    return {
      itemKey: getItemKey(entry),
      label: normalizeString(entry.name, 'Unknown Item'),
      quantityDelta: Math.abs(normalizeNumber(entry.quantityDiff, 0)),
      valueDelta: Math.abs(normalizeNumber(entry.totalChaosValue, 0)),
      currencyCode: 'chaos'
    };
  }

  function deriveProfitValuesFromReport(profitReport = {}) {
    const summary = profitReport?.summary || {};
    const gained = Array.isArray(profitReport?.gained) ? profitReport.gained : [];
    const lost = Array.isArray(profitReport?.lost) ? profitReport.lost : [];

    return {
      inputValue: Math.abs(normalizeNumber(summary.totalLostChaos, 0)),
      outputValue: Math.abs(normalizeNumber(summary.totalGainedChaos, 0)),
      netProfit: normalizeNumber(summary.netProfitChaos, 0),
      topInputs: lost
        .map((entry) => normalizeReportEntry(entry))
        .sort((a, b) => b.valueDelta - a.valueDelta)
        .slice(0, MAX_TOP_ITEMS),
      topOutputs: gained
        .map((entry) => normalizeReportEntry(entry))
        .sort((a, b) => b.valueDelta - a.valueDelta)
        .slice(0, MAX_TOP_ITEMS)
    };
  }

  function createDeltaEntry(itemKey, sourceItem, quantityDelta, valueDelta) {
    return {
      itemKey,
      label: sourceItem?.name || 'Unknown Item',
      quantityDelta,
      valueDelta,
      currencyCode: getCurrencyCode(sourceItem)
    };
  }

  function getLastCompletedInstance(runtimeSession = {}) {
    if (runtimeSession?.lastCompletedInstance) {
      return runtimeSession.lastCompletedInstance;
    }

    const instances = Array.isArray(runtimeSession?.instances)
      ? runtimeSession.instances
      : [];

    for (let index = instances.length - 1; index >= 0; index -= 1) {
      if (instances[index]?.status === 'completed') {
        return instances[index];
      }
    }

    return null;
  }

  function parseTimestampMs(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getIntervalOverlapSeconds(startMs, endMs, windowStartMs, windowEndMs) {
    if (
      !Number.isFinite(startMs)
      || !Number.isFinite(endMs)
      || endMs <= startMs
      || !Number.isFinite(windowStartMs)
      || !Number.isFinite(windowEndMs)
      || windowEndMs <= windowStartMs
    ) {
      return 0;
    }

    const overlapStart = Math.max(startMs, windowStartMs);
    const overlapEnd = Math.min(endMs, windowEndMs);
    return Math.max(0, Math.round((overlapEnd - overlapStart) / 1000));
  }

  function getCompletedInstances(runtimeSession = {}) {
    const instances = Array.isArray(runtimeSession?.instances)
      ? runtimeSession.instances
      : [];

    if (instances.length) {
      return instances.filter((instance) => instance?.status === 'completed');
    }

    const lastCompletedInstance = getLastCompletedInstance(runtimeSession);
    return lastCompletedInstance ? [lastCompletedInstance] : [];
  }

  function getInstanceDurationSeconds(instance = {}) {
    const targetInstance = instance || {};
    const directDuration = normalizeNumber(targetInstance.durationSeconds, NaN);
    if (Number.isFinite(directDuration)) {
      return Math.max(0, directDuration);
    }

    const enteredAt = parseTimestampMs(targetInstance.enteredAt);
    const exitedAt = parseTimestampMs(targetInstance.exitedAt);
    if (Number.isFinite(enteredAt) && Number.isFinite(exitedAt)) {
      return Math.max(0, Math.round((exitedAt - enteredAt) / 1000));
    }

    return 0;
  }

  function getRuntimeTotalActiveSeconds(runtimeSession = {}) {
    const totalActiveSeconds = normalizeNumber(runtimeSession.totalActiveSeconds, NaN);
    if (Number.isFinite(totalActiveSeconds) && totalActiveSeconds > 0) {
      return totalActiveSeconds;
    }

    const summaryTotalActiveSeconds = normalizeNumber(runtimeSession.summary?.totalActiveSeconds, NaN);
    if (Number.isFinite(summaryTotalActiveSeconds) && summaryTotalActiveSeconds > 0) {
      return summaryTotalActiveSeconds;
    }

    return 0;
  }

  function deriveRuntimeDurationSeconds(runtimeSession = {}, beforeSnapshot, afterSnapshot) {
    const instances = getCompletedInstances(runtimeSession);
    const windowStartMs = getSnapshotTimestamp(beforeSnapshot);
    const windowEndMs = getSnapshotTimestamp(afterSnapshot);

    if (instances.length && Number.isFinite(windowStartMs) && Number.isFinite(windowEndMs) && windowEndMs > windowStartMs) {
      const windowedDuration = instances.reduce((total, instance) => {
        const enteredAt = parseTimestampMs(instance.enteredAt);
        const exitedAt = parseTimestampMs(instance.exitedAt);
        return total + getIntervalOverlapSeconds(enteredAt, exitedAt, windowStartMs, windowEndMs);
      }, 0);

      if (windowedDuration > 0) {
        return windowedDuration;
      }
    }

    if (instances.length) {
      const summedDuration = instances.reduce((total, instance) => total + getInstanceDurationSeconds(instance), 0);
      if (summedDuration > 0) {
        return summedDuration;
      }
    }

    const totalActiveSeconds = getRuntimeTotalActiveSeconds(runtimeSession);
    if (totalActiveSeconds > 0) {
      return totalActiveSeconds;
    }

    return getInstanceDurationSeconds(getLastCompletedInstance(runtimeSession));
  }

  function getSnapshotTimestamp(snapshot = {}) {
    const timestamp = normalizeNumber(snapshot?.timestamp, NaN);
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }

    const parsedTimestamp = Date.parse(snapshot?.timestamp);
    return Number.isFinite(parsedTimestamp) ? parsedTimestamp : null;
  }

  function getCreatedAt(beforeSnapshot, afterSnapshot) {
    const timestamp = getSnapshotTimestamp(afterSnapshot) ?? getSnapshotTimestamp(beforeSnapshot);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  }

  function createResultId(runtimeSession, beforeSnapshot, afterSnapshot) {
    const sessionId = normalizeString(runtimeSession?.sessionId, 'sessionless');
    const timestamp = getSnapshotTimestamp(afterSnapshot) ?? getSnapshotTimestamp(beforeSnapshot) ?? 0;
    return `map-result-${sessionId}-${timestamp}`;
  }

  function deriveMapResult({
    farmType,
    runtimeSession,
    beforeSnapshot,
    afterSnapshot,
    profitReport,
    characterSummary,
    accountName,
    poeVersion
  } = {}) {
    const farmTypeLabel = resolveFarmTypeLabel(farmType);
    if (!farmTypeLabel || !Array.isArray(beforeSnapshot?.items) || !Array.isArray(afterSnapshot?.items)) {
      return null;
    }

    let inputValue = 0;
    let outputValue = 0;
    let netProfit = 0;
    let topInputs = [];
    let topOutputs = [];

    if (profitReport && typeof profitReport === 'object') {
      ({ inputValue, outputValue, netProfit, topInputs, topOutputs } = deriveProfitValuesFromReport(profitReport));
    } else {
      const beforeIndex = indexSnapshotItems(beforeSnapshot);
      const afterIndex = indexSnapshotItems(afterSnapshot);
      const allKeys = new Set([...beforeIndex.keys(), ...afterIndex.keys()]);

      allKeys.forEach((itemKey) => {
        const beforeItem = beforeIndex.get(itemKey);
        const afterItem = afterIndex.get(itemKey);
        const beforeQuantity = normalizeNumber(beforeItem?.quantity, 0);
        const afterQuantity = normalizeNumber(afterItem?.quantity, 0);
        const quantityDelta = afterQuantity - beforeQuantity;
        const sourceItem = quantityDelta < 0
          ? (beforeItem || afterItem)
          : (afterItem || beforeItem);
        const chaosValue = normalizeNumber(sourceItem?.chaosValue, 0);
        const valueDelta = Math.abs(quantityDelta * chaosValue);

        if (valueDelta <= 0) {
          return;
        }

        if (quantityDelta < 0) {
          inputValue += valueDelta;
          topInputs.push(createDeltaEntry(itemKey, sourceItem, Math.abs(quantityDelta), valueDelta));
          return;
        }

        outputValue += valueDelta;
        topOutputs.push(createDeltaEntry(itemKey, sourceItem, Math.abs(quantityDelta), valueDelta));
      });

      netProfit = outputValue - inputValue;
      topInputs = topInputs.sort((a, b) => b.valueDelta - a.valueDelta).slice(0, MAX_TOP_ITEMS);
      topOutputs = topOutputs.sort((a, b) => b.valueDelta - a.valueDelta).slice(0, MAX_TOP_ITEMS);
    }

    const createdAt = getCreatedAt(beforeSnapshot, afterSnapshot);

    return {
      id: createResultId(runtimeSession, beforeSnapshot, afterSnapshot),
      sessionId: normalizeString(runtimeSession?.sessionId),
      characterId: normalizeString(characterSummary?.id),
      characterName: normalizeString(characterSummary?.name),
      accountName: normalizeString(accountName),
      poeVersion: normalizePoeVersion(poeVersion),
      league: normalizeString(characterSummary?.league ?? afterSnapshot?.league ?? beforeSnapshot?.league),
      farmType: farmTypeLabel,
      durationSeconds: deriveRuntimeDurationSeconds(runtimeSession, beforeSnapshot, afterSnapshot),
      inputValue,
      outputValue,
      netProfit,
      profitState: netProfit > 0 ? 'positive' : netProfit < 0 ? 'negative' : 'neutral',
      topInputs,
      topOutputs,
      createdAt
    };
  }

  return {
    deriveMapResult
  };
});
