/**
 * Stash Snapshot Service
 * Builds, persists, and diffs stash snapshots used to compute farming profit.
 *
 * The flow:
 *   1. Pick a set of stash tabs (auto-pick currency/fragment/dump tabs by default).
 *   2. Fetch their contents from the GGG API via poeApiService.
 *   3. Normalize each item into a compact JSON shape.
 *   4. Look up chaos prices via the existing Price model.
 *   5. Persist the snapshot (with totals + per-item chaos) on the user.
 *
 * Diffing two snapshots produces a per-item delta (added/removed/quantity-changed)
 * and a chaos value delta — that is the "profit" of whatever happened in between.
 */

const { Price, StashSnapshot } = require('../models');
const poeApiService = require('./poeApiService');

// Tab types worth snapshotting by default. Excludes the giant Map / Essence /
// Divination tabs by default to keep snapshots small and price lookups cheap;
// users can opt in via explicit tabIds.
const DEFAULT_TAB_TYPES = new Set([
  'CurrencyStash',
  'FragmentStash',
  'NormalStash',
  'PremiumStash',
  'QuadStash',
  'DelveStash',
  'BlightStash',
  'DeliriumStash',
  'MetamorphStash',
  'UltimatumStash',
  'ExpeditionStash',
]);

const DEFAULT_TAB_NAME_REGEX = /dump|loot|farm|juice|profit/i;

function shouldAutoPickTab(tab) {
  if (!tab) return false;
  if (tab.type && DEFAULT_TAB_TYPES.has(tab.type)) return true;
  if (tab.name && DEFAULT_TAB_NAME_REGEX.test(tab.name)) return true;
  return false;
}

/**
 * Normalize a raw GGG stash item into the compact form we persist.
 * Keeps just enough metadata for pricing + UI display.
 *
 * `name` is the primary pricing key and must match the shape poe.ninja uses:
 *   - uniques:     just the unique name       ("Headhunter")
 *   - currency:    the currency type line     ("Divine Orb")
 *   - rares/etc.:  fall back to the type line
 * The base type is preserved separately in `typeLine` / `baseType` so the UI
 * can still render "Headhunter — Leather Belt" if it wants to.
 */
function normalizeItem(raw, stash = {}) {
  const stackSize = Number(raw.stackSize) || 1;
  const typeLine = raw.typeLine || raw.baseType || '';
  const name = raw.name ? raw.name : typeLine;

  return {
    id: raw.id,
    name,
    typeLine,
    baseType: raw.baseType || typeLine,
    quantity: stackSize,
    maxStackSize: Number(raw.maxStackSize) || 1,
    frameType: raw.frameType,
    icon: raw.icon || null,
    identified: raw.identified !== false,
    ilvl: Number(raw.ilvl) || 0,
    corrupted: Boolean(raw.corrupted),
    stashId: stash.stashId || null,
    stashName: stash.stashName || null,
    // Pricing fields filled in by enrichWithPrices
    chaosValue: 0,
    totalChaosValue: 0,
    priced: false,
  };
}

/**
 * Look up chaos prices for the items in-place.
 * Tries the full name first ("Mirror of Kalandra"), then the bare type line
 * ("Divine Orb"). Returns aggregate stats.
 */
async function enrichWithPrices(items, league, poeVersion = 'poe1') {
  if (!items.length) {
    return { totalChaosValue: 0, pricedCount: 0, unpricedCount: 0 };
  }

  // Build distinct lookup keys.
  const keys = new Set();
  for (const item of items) {
    if (item.name) keys.add(item.name);
    if (item.typeLine && item.typeLine !== item.name) keys.add(item.typeLine);
  }

  // Single bulk query — much faster than per-item lookups.
  const priceRows = await Price.findAll({
    where: {
      itemName: Array.from(keys),
      league,
      poeVersion,
      active: true,
    },
    raw: true,
  });

  const priceByName = new Map();
  for (const row of priceRows) {
    priceByName.set(row.item_name || row.itemName, parseFloat(row.chaos_value || row.chaosValue || 0));
  }

  let totalChaosValue = 0;
  let pricedCount = 0;
  let unpricedCount = 0;

  for (const item of items) {
    const chaos = priceByName.get(item.name) ?? priceByName.get(item.typeLine) ?? 0;
    item.chaosValue = chaos;
    item.totalChaosValue = chaos * (item.quantity || 1);
    item.priced = chaos > 0;
    totalChaosValue += item.totalChaosValue;
    if (item.priced) pricedCount += 1;
    else unpricedCount += 1;
  }

  return { totalChaosValue, pricedCount, unpricedCount };
}

/**
 * Take a fresh snapshot for `user` in `league`. Persists a new StashSnapshot row.
 *
 * @param {Object} user        Sequelize User instance
 * @param {Object} options
 * @param {string} options.league       League name (required)
 * @param {string} [options.poeVersion] poe1 / poe2, defaults poe1
 * @param {string[]} [options.tabIds]   Specific tab IDs (otherwise auto-pick)
 * @param {boolean} [options.allTabs]   Snapshot every tab in the league
 * @param {string} [options.label]      Friendly label
 * @param {string} [options.kind]       'before' / 'after' / 'manual'
 * @param {string} [options.sessionId]  Optional Session id this snapshot belongs to
 */
async function takeSnapshot(user, options = {}) {
  const {
    league,
    poeVersion = 'poe1',
    tabIds,
    allTabs = false,
    label = null,
    kind = 'manual',
    sessionId = null,
  } = options;

  if (!league) {
    const err = new Error('league is required');
    err.code = 'LEAGUE_REQUIRED';
    throw err;
  }

  // 1) List all tabs.
  const tabListResponse = await poeApiService.listStashTabs(user, league);
  const allLeagueTabs = tabListResponse?.stashes || [];

  // 2) Pick which tabs to actually fetch.
  let targetTabs;
  if (Array.isArray(tabIds) && tabIds.length > 0) {
    const wanted = new Set(tabIds);
    targetTabs = allLeagueTabs.filter((t) => wanted.has(t.id));
  } else if (allTabs) {
    targetTabs = allLeagueTabs;
  } else {
    targetTabs = allLeagueTabs.filter(shouldAutoPickTab);
  }

  if (!targetTabs.length) {
    const err = new Error('No matching stash tabs found for snapshot');
    err.code = 'NO_TABS_SELECTED';
    throw err;
  }

  // 3) Fetch items from each chosen tab (sequential + retry-on-429).
  const tabBatches = await poeApiService.getStashTabsBatch(
    user,
    league,
    targetTabs.map((t) => t.id)
  );

  // 4) Flatten + normalize.
  const items = [];
  for (const batch of tabBatches) {
    if (batch.error) continue;
    for (const raw of batch.items) {
      items.push(normalizeItem(raw, batch));
    }
  }

  // 5) Enrich with chaos values from the Price table.
  const { totalChaosValue, pricedCount, unpricedCount } = await enrichWithPrices(items, league, poeVersion);

  // 6) Persist.
  const snapshot = await StashSnapshot.create({
    userId: user.id,
    sessionId,
    league,
    poeVersion,
    label,
    kind,
    takenAt: new Date(),
    tabs: targetTabs.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      index: t.index,
    })),
    items,
    totalChaosValue,
    pricedItemCount: pricedCount,
    unpricedItemCount: unpricedCount,
  });

  return snapshot;
}

/**
 * Diff two snapshots (before → after). Returns per-item deltas + chaos delta.
 *
 * Items are matched by `name` (unique name for uniques, type line otherwise).
 * Stack-size changes show up as quantity deltas; brand-new items appear as
 * `added`; vanished items as `removed`.
 */
function diffSnapshots(beforeSnapshot, afterSnapshot) {
  if (!beforeSnapshot || !afterSnapshot) {
    throw new Error('Both before and after snapshots are required');
  }
  if (beforeSnapshot.userId !== afterSnapshot.userId) {
    throw new Error('Cannot diff snapshots from different users');
  }
  if (beforeSnapshot.league !== afterSnapshot.league) {
    throw new Error('Cannot diff snapshots from different leagues');
  }

  const beforeMap = new Map();
  for (const item of beforeSnapshot.items || []) {
    const key = item.name || item.typeLine;
    if (!key) continue;
    const existing = beforeMap.get(key);
    if (existing) {
      existing.quantity += item.quantity || 0;
      existing.totalChaosValue += item.totalChaosValue || 0;
    } else {
      beforeMap.set(key, { ...item, quantity: item.quantity || 0, totalChaosValue: item.totalChaosValue || 0 });
    }
  }

  const afterMap = new Map();
  for (const item of afterSnapshot.items || []) {
    const key = item.name || item.typeLine;
    if (!key) continue;
    const existing = afterMap.get(key);
    if (existing) {
      existing.quantity += item.quantity || 0;
      existing.totalChaosValue += item.totalChaosValue || 0;
    } else {
      afterMap.set(key, { ...item, quantity: item.quantity || 0, totalChaosValue: item.totalChaosValue || 0 });
    }
  }

  const added = [];
  const removed = [];
  const changed = [];

  // Items that exist after — added or quantity-changed.
  for (const [key, afterItem] of afterMap) {
    const beforeItem = beforeMap.get(key);
    if (!beforeItem) {
      added.push({
        name: afterItem.name,
        typeLine: afterItem.typeLine,
        quantity: afterItem.quantity,
        chaosValue: afterItem.chaosValue,
        totalChaosValue: afterItem.totalChaosValue,
        icon: afterItem.icon,
      });
      continue;
    }

    const quantityDelta = afterItem.quantity - beforeItem.quantity;
    if (quantityDelta !== 0) {
      changed.push({
        name: afterItem.name,
        typeLine: afterItem.typeLine,
        quantityBefore: beforeItem.quantity,
        quantityAfter: afterItem.quantity,
        quantityDelta,
        chaosValue: afterItem.chaosValue,
        chaosValueDelta: quantityDelta * (afterItem.chaosValue || 0),
        icon: afterItem.icon,
      });
    }
  }

  // Items that vanished entirely.
  for (const [key, beforeItem] of beforeMap) {
    if (!afterMap.has(key)) {
      removed.push({
        name: beforeItem.name,
        typeLine: beforeItem.typeLine,
        quantity: beforeItem.quantity,
        chaosValue: beforeItem.chaosValue,
        totalChaosValue: beforeItem.totalChaosValue,
        icon: beforeItem.icon,
      });
    }
  }

  const beforeTotal = parseFloat(beforeSnapshot.totalChaosValue) || 0;
  const afterTotal = parseFloat(afterSnapshot.totalChaosValue) || 0;
  const chaosValueDelta = afterTotal - beforeTotal;

  return {
    beforeSnapshotId: beforeSnapshot.id,
    afterSnapshotId: afterSnapshot.id,
    league: afterSnapshot.league,
    beforeTakenAt: beforeSnapshot.takenAt,
    afterTakenAt: afterSnapshot.takenAt,
    chaosValueDelta,
    beforeTotal,
    afterTotal,
    addedCount: added.length,
    removedCount: removed.length,
    changedCount: changed.length,
    added,
    removed,
    changed,
  };
}

module.exports = {
  takeSnapshot,
  diffSnapshots,
  // Exposed for tests / future reuse
  normalizeItem,
  enrichWithPrices,
  shouldAutoPickTab,
};
