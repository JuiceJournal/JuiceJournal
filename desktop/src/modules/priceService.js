/**
 * Price Service Module
 * Fetches currency and item prices from poe.ninja
 * Caches prices to avoid hammering the API (12 req / 5 min limit)
 *
 * PoE1: https://poe.ninja/api/data/{currencyoverview|itemoverview}?league=X&type=Y
 * PoE2: https://poe.ninja/poe2/api/economy/currencyexchange/overview?leagueName=X&overviewName=Y
 */

const axios = require('axios');
const registry = require('./currencyRegistry');

const POE1_BASE = 'https://poe.ninja/api/data';
const POE2_BASE = 'https://poe.ninja/poe2/api/economy';

// Cache duration: 10 minutes
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_SIZE = 5000;
const MAX_PRICE_MAP_SIZE = 10000;

class PriceService {
  constructor() {
    // price cache: key = `${league}:${type}` → { data, fetchedAt }
    this.cache = new Map();
    // Unified lookup: itemName → { chaosValue, divineValue, icon, ... }
    this.priceMap = new Map();
    this.lastFullSync = null;
    this.poeVersion = 'poe1';

    this.client = axios.create({
      timeout: 15000,
      headers: {
        'User-Agent': 'JuiceJournal/1.0'
      }
    });
  }

  setPoeVersion(version) {
    this.poeVersion = version === 'poe2' ? 'poe2' : 'poe1';
    registry.setPoeVersion(this.poeVersion);
  }

  // ─── Fetching ───────────────────────────────────────────────

  /**
   * Fetch currency overview from poe.ninja (PoE1)
   */
  async _fetchCurrencyOverview(league, type) {
    const cacheKey = `${league}:currency:${type}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.data;
    }

    const url = this.poeVersion === 'poe2'
      ? `${POE2_BASE}/currencyexchange/overview`
      : `${POE1_BASE}/currencyoverview`;

    const params = this.poeVersion === 'poe2'
      ? { leagueName: league, overviewName: type }
      : { league, type };

    const response = await this.client.get(url, { params });
    const data = response.data;

    this._enforceCacheLimit();
    this.cache.set(cacheKey, { data, fetchedAt: Date.now() });
    return data;
  }

  /**
   * Fetch item overview from poe.ninja (PoE1 only)
   */
  async _fetchItemOverview(league, type) {
    const cacheKey = `${league}:item:${type}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.data;
    }

    const url = `${POE1_BASE}/itemoverview`;
    const response = await this.client.get(url, { params: { league, type } });
    const data = response.data;

    this._enforceCacheLimit();
    this.cache.set(cacheKey, { data, fetchedAt: Date.now() });
    return data;
  }

  // ─── Price Sync ─────────────────────────────────────────────

  /**
   * Sync prices from poe.ninja into the local desktop cache.
   * Full sync is the default to avoid missing categories.
   *
   * @param {string} league
   * @param {Object} options
   * @param {boolean} [options.full] - Sync ALL types (slow, many API calls)
   */
  async syncPrices(league, options = {}) {
    this.priceMap.clear();

    // Get types from registry (version-aware, dynamic)
    const currencyTypes = registry.getCurrencyTypes();
    const itemTypes = options.full !== false
      ? registry.getItemTypes()
      : registry.getQuickSyncTypes().filter(t => !currencyTypes.includes(t));

    // Fetch currency overviews
    for (const type of currencyTypes) {
      try {
        const data = await this._fetchCurrencyOverview(league, type);
        this._indexCurrencyData(data, type);
      } catch (err) {
        console.error(`Price sync failed for currency/${type}:`, err.message);
      }
    }

    // Fetch item overviews (PoE1 only for now)
    if (this.poeVersion === 'poe1') {
      for (const type of itemTypes) {
        try {
          const data = await this._fetchItemOverview(league, type);
          this._indexItemData(data, type);
        } catch (err) {
          console.error(`Price sync failed for item/${type}:`, err.message);
        }
        // Small delay to respect rate limits
        await new Promise(r => setTimeout(r, 300));
      }
    }

    this.lastFullSync = Date.now();
    return {
      itemCount: this.priceMap.size,
      syncedAt: this.lastFullSync
    };
  }

  /**
   * Index currency data into priceMap
   */
  _indexCurrencyData(data, type) {
    const registryBatch = [];

    if (this.poeVersion === 'poe2') {
      // PoE2 format: { lines: [{ id, primaryValue }], items: [{ id, name, icon }] }
      const itemMap = new Map();
      if (data.items) {
        for (const item of data.items) {
          itemMap.set(item.id, item);
        }
      }
      if (data.lines) {
        for (const line of data.lines) {
          const itemInfo = itemMap.get(line.id);
          if (!itemInfo) continue;
          const chaosValue = line.primaryValue >= 1
            ? line.primaryValue
            : (1 / line.primaryValue);
          const entry = {
            chaosValue,
            category: type.toLowerCase(),
            icon: itemInfo.icon || null,
            tradeId: itemInfo.tradeId || null
          };
          this._addPrice(itemInfo.name, entry);
          registryBatch.push({ name: itemInfo.name, ...entry });
        }
      }
    } else {
      // PoE1 format: { lines: [{ currencyTypeName, chaosEquivalent, ... }], currencyDetails: [...] }
      const detailsMap = new Map();
      if (data.currencyDetails) {
        for (const d of data.currencyDetails) {
          detailsMap.set(d.name, d);
        }
      }
      if (data.lines) {
        for (const line of data.lines) {
          const details = detailsMap.get(line.currencyTypeName);
          const entry = {
            chaosValue: line.chaosEquivalent || 0,
            category: type.toLowerCase(),
            icon: details?.icon || null,
            tradeId: details?.tradeId || null,
            sparkline: line.receiveSparkLine?.data || []
          };
          this._addPrice(line.currencyTypeName, entry);
          registryBatch.push({ name: line.currencyTypeName, ...entry });
        }
      }
    }

    // Feed discovered items into the currency registry
    registry.registerFromNinja(type, registryBatch);
  }

  /**
   * Index item data into priceMap
   */
  _indexItemData(data, type) {
    if (!data.lines) return;
    const registryBatch = [];
    for (const line of data.lines) {
      const entry = {
        chaosValue: line.chaosValue || 0,
        divineValue: line.divineValue || 0,
        category: type.toLowerCase(),
        icon: line.icon || null,
        sparkline: line.sparkline?.data || [],
        listingCount: line.listingCount || 0
      };
      this._addPrice(line.name, entry);
      registryBatch.push({ name: line.name, ...entry });
    }
    // Feed discovered items into the currency registry
    registry.registerFromNinja(type, registryBatch);
  }

  _addPrice(name, data) {
    const key = name.toLowerCase().trim();
    this._enforcePriceMapLimit();
    this.priceMap.set(key, { name, ...data });
  }

  _evictOldest(map, count) {
    const keys = [...map.keys()];
    for (let i = 0; i < Math.min(count, keys.length); i++) {
      map.delete(keys[i]);
    }
  }

  _enforcePriceMapLimit() {
    if (this.priceMap.size >= MAX_PRICE_MAP_SIZE) {
      this._evictOldest(this.priceMap, Math.ceil(MAX_PRICE_MAP_SIZE * 0.1));
    }
  }

  _enforceCacheLimit() {
    if (this.cache.size >= MAX_CACHE_SIZE) {
      this._evictOldest(this.cache, Math.ceil(MAX_CACHE_SIZE * 0.1));
    }
  }

  // ─── Lookup ─────────────────────────────────────────────────

  /**
   * Get the chaos value of an item by name
   * @param {string} itemName
   * @returns {number} chaos value, or 0 if unknown
   */
  getChaosValue(itemName) {
    const entry = this.priceMap.get(itemName.toLowerCase().trim());
    return entry?.chaosValue || 0;
  }

  /**
   * Get full price info for an item
   * @param {string} itemName
   * @returns {Object|null}
   */
  getPriceInfo(itemName) {
    return this.priceMap.get(itemName.toLowerCase().trim()) || null;
  }

  /**
   * Price a list of items (from stash snapshot)
   * @param {Object[]} items - Normalized items from PoeApiClient
   * @returns {{ items: Object[], totalChaos: number, totalDivine: number }}
   */
  priceItems(items) {
    const divinePrice = this.getChaosValue('Divine Orb') || 1;
    let totalChaos = 0;

    const pricedItems = items.map(item => {
      const name = item.baseType || item.typeLine || item.name;
      const chaosValue = this.getChaosValue(name);
      const totalValue = chaosValue * (item.quantity || 1);
      totalChaos += totalValue;

      return {
        ...item,
        chaosValue,
        totalChaosValue: totalValue,
        divineValue: chaosValue / divinePrice,
        totalDivineValue: totalValue / divinePrice,
        priceSource: chaosValue > 0 ? 'poe.ninja' : 'unknown'
      };
    });

    // Sort by total value descending
    pricedItems.sort((a, b) => b.totalChaosValue - a.totalChaosValue);

    return {
      items: pricedItems,
      totalChaos,
      totalDivine: totalChaos / divinePrice,
      divinePrice,
      pricedCount: pricedItems.filter(i => i.chaosValue > 0).length,
      unpricedCount: pricedItems.filter(i => i.chaosValue === 0).length
    };
  }

  /**
   * Get cache status
   */
  getStatus() {
    return {
      itemCount: this.priceMap.size,
      lastSync: this.lastFullSync,
      cacheEntries: this.cache.size,
      poeVersion: this.poeVersion
    };
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.cache.clear();
    this.priceMap.clear();
    this.lastFullSync = null;
  }
}

module.exports = PriceService;
