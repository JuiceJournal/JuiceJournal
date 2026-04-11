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
    characterSummary,
    accountName,
    poeVersion
  } = {}) {
    const farmTypeLabel = resolveFarmTypeLabel(farmType);
    if (!farmTypeLabel || !Array.isArray(beforeSnapshot?.items) || !Array.isArray(afterSnapshot?.items)) {
      return null;
    }

    const beforeIndex = indexSnapshotItems(beforeSnapshot);
    const afterIndex = indexSnapshotItems(afterSnapshot);
    const allKeys = new Set([...beforeIndex.keys(), ...afterIndex.keys()]);
    const topInputs = [];
    const topOutputs = [];
    let inputValue = 0;
    let outputValue = 0;

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

    const netProfit = outputValue - inputValue;
    const lastCompletedInstance = getLastCompletedInstance(runtimeSession);
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
      durationSeconds: normalizeNumber(lastCompletedInstance?.durationSeconds, 0),
      inputValue,
      outputValue,
      netProfit,
      profitState: netProfit > 0 ? 'positive' : netProfit < 0 ? 'negative' : 'neutral',
      topInputs: topInputs.sort((a, b) => b.valueDelta - a.valueDelta).slice(0, MAX_TOP_ITEMS),
      topOutputs: topOutputs.sort((a, b) => b.valueDelta - a.valueDelta).slice(0, MAX_TOP_ITEMS),
      createdAt
    };
  }

  return {
    deriveMapResult
  };
});
