/**
 * Stash Analyzer Module
 * Compares stash snapshots to calculate profit/loss between map runs.
 *
 * Flow:
 * 1. User takes "before" snapshot (start of map session)
 * 2. User runs maps, picks up loot, dumps in stash
 * 3. User takes "after" snapshot (end of session)
 * 4. Analyzer diffs the two → profit report
 */

class StashAnalyzer {
  constructor() {
    // Stored snapshots: { [snapshotId]: { items, timestamp, league, ... } }
    this.snapshots = new Map();
  }

  /**
   * Store a snapshot for later diffing
   * @param {string} id - Snapshot identifier (e.g. 'before', 'after', or session ID)
   * @param {Object} snapshot - From PoeApiClient.takeStashSnapshot()
   */
  saveSnapshot(id, snapshot) {
    this.snapshots.set(id, {
      ...snapshot,
      savedAt: Date.now()
    });
  }

  /**
   * Get a stored snapshot
   */
  getSnapshot(id) {
    return this.snapshots.get(id) || null;
  }

  /**
   * Delete a stored snapshot
   */
  deleteSnapshot(id) {
    this.snapshots.delete(id);
  }

  /**
   * List all stored snapshots
   */
  listSnapshots() {
    const list = [];
    for (const [id, snap] of this.snapshots) {
      list.push({
        id,
        timestamp: snap.timestamp,
        savedAt: snap.savedAt,
        league: snap.league,
        itemCount: snap.items?.length || 0
      });
    }
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Compare two snapshots and calculate the difference
   * @param {string} beforeId - ID of the "before" snapshot
   * @param {string} afterId - ID of the "after" snapshot
   * @param {PriceService} priceService - For pricing the diff
   * @returns {Object} Profit report
   */
  diffSnapshots(beforeId, afterId, priceService) {
    const before = this.snapshots.get(beforeId);
    const after = this.snapshots.get(afterId);

    if (!before) throw new Error(`Snapshot "${beforeId}" not found`);
    if (!after) throw new Error(`Snapshot "${afterId}" not found`);

    return this.diffItems(before.items, after.items, priceService);
  }

  /**
   * Compare two item arrays and calculate the difference
   * @param {Object[]} beforeItems - Items from before snapshot
   * @param {Object[]} afterItems - Items from after snapshot
   * @param {PriceService} priceService
   * @returns {Object} Profit report
   */
  diffItems(beforeItems, afterItems, priceService) {
    // Build quantity maps: itemKey → totalQuantity
    const beforeMap = this._buildQuantityMap(beforeItems);
    const afterMap = this._buildQuantityMap(afterItems);

    // Calculate diffs
    const gained = []; // items that increased or appeared
    const lost = [];   // items that decreased or disappeared
    const allKeys = new Set([...beforeMap.keys(), ...afterMap.keys()]);

    for (const key of allKeys) {
      const beforeEntry = beforeMap.get(key);
      const afterEntry = afterMap.get(key);
      const beforeQty = beforeEntry?.quantity || 0;
      const afterQty = afterEntry?.quantity || 0;
      const diff = afterQty - beforeQty;

      if (diff === 0) continue;

      const itemInfo = afterEntry || beforeEntry;
      const chaosValue = priceService ? priceService.getChaosValue(itemInfo.name) : 0;

      const entry = {
        name: itemInfo.name,
        category: itemInfo.category,
        icon: itemInfo.icon,
        beforeQuantity: beforeQty,
        afterQuantity: afterQty,
        quantityDiff: diff,
        chaosValue,
        totalChaosValue: Math.abs(diff) * chaosValue
      };

      if (diff > 0) {
        gained.push(entry);
      } else {
        lost.push(entry);
      }
    }

    // Sort by value
    gained.sort((a, b) => b.totalChaosValue - a.totalChaosValue);
    lost.sort((a, b) => b.totalChaosValue - a.totalChaosValue);

    const totalGained = gained.reduce((sum, i) => sum + i.totalChaosValue, 0);
    const totalLost = lost.reduce((sum, i) => sum + i.totalChaosValue, 0);
    const netProfit = totalGained - totalLost;

    const divinePrice = priceService ? (priceService.getChaosValue('Divine Orb') || 1) : 1;

    return {
      gained,
      lost,
      summary: {
        totalGainedChaos: totalGained,
        totalLostChaos: totalLost,
        netProfitChaos: netProfit,
        netProfitDivine: netProfit / divinePrice,
        divinePrice,
        gainedItemCount: gained.length,
        lostItemCount: lost.length,
        totalItemChanges: gained.length + lost.length
      },
      // Breakdown by category
      categoryBreakdown: this._buildCategoryBreakdown(gained, lost, divinePrice)
    };
  }

  /**
   * Build a quantity map from items, keyed by normalized name + category
   */
  _buildQuantityMap(items) {
    const map = new Map();
    for (const item of items) {
      const key = this._itemKey(item);
      const existing = map.get(key);
      if (existing) {
        existing.quantity += item.quantity || 1;
      } else {
        map.set(key, {
          name: item.baseType || item.typeLine || item.name,
          category: item.category || 'other',
          icon: item.icon,
          quantity: item.quantity || 1
        });
      }
    }
    return map;
  }

  /**
   * Create a unique key for an item (for diffing purposes)
   * Currency/stackable items: use baseType
   * Unique items: use full name
   */
  _itemKey(item) {
    const name = (item.baseType || item.typeLine || item.name || '').toLowerCase().trim();
    const category = item.category || 'other';
    // For unique items, include the unique name to distinguish
    if (category === 'unique' && item.name) {
      return `${item.name.toLowerCase().trim()}::${category}`;
    }
    return `${name}::${category}`;
  }

  /**
   * Break down gains/losses by category
   */
  _buildCategoryBreakdown(gained, lost, divinePrice) {
    const categories = {};

    const process = (items, type) => {
      for (const item of items) {
        const cat = item.category || 'other';
        if (!categories[cat]) {
          categories[cat] = { gained: 0, lost: 0, net: 0, items: [] };
        }
        if (type === 'gained') {
          categories[cat].gained += item.totalChaosValue;
        } else {
          categories[cat].lost += item.totalChaosValue;
        }
        categories[cat].items.push({ ...item, changeType: type });
      }
    };

    process(gained, 'gained');
    process(lost, 'lost');

    // Calculate net for each category
    for (const cat of Object.values(categories)) {
      cat.net = cat.gained - cat.lost;
      cat.netDivine = cat.net / divinePrice;
      cat.items.sort((a, b) => b.totalChaosValue - a.totalChaosValue);
    }

    return categories;
  }

  /**
   * Clear all stored snapshots
   */
  clearAll() {
    this.snapshots.clear();
  }
}

module.exports = StashAnalyzer;
