/**
 * Price Service Module
 * Fetches currency and item prices from poe.ninja
 * Caches prices to avoid hammering the API (12 req / 5 min limit)
 *
 * PoE1: https://poe.ninja/poe1/api/economy/stash/current/{currency|item}/overview?league=X&type=Y
 * PoE2: https://poe.ninja/poe2/api/economy/exchange/{slug}/overview?league=X&type=Y
 */

const axios = require('axios');
const registry = require('./currencyRegistry');

const POE1_CURRENCY_URL = 'https://poe.ninja/poe1/api/economy/stash/current/currency/overview';
const POE1_ITEM_URL = 'https://poe.ninja/poe1/api/economy/stash/current/item/overview';
const POE2_BASE_URL = 'https://poe.ninja/poe2/api';
const POE2_INDEX_URL = 'https://poe.ninja/poe2/api/data/index-state';

// Cache duration: 10 minutes
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_SIZE = 5000;
const MAX_PRICE_MAP_SIZE = 10000;
const INDEX_CACHE_TTL_MS = 30 * 60 * 1000;

function toPriceNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function roundPriceValue(value, precision = 6) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function getPoe1CurrencyName(line = {}) {
  return line.currencyTypeName || line.name || line.id || null;
}

function getPoe1LineChaosValue(line = {}) {
  return toPriceNumber(line.chaosEquivalent ?? line.chaosValue);
}

function getPoe1DivineToChaos(data = {}) {
  const divineLine = data.lines?.find(line =>
    String(getPoe1CurrencyName(line) || '').toLowerCase() === 'divine orb'
  );
  const divineToChaos = getPoe1LineChaosValue(divineLine);
  return divineToChaos > 0 ? divineToChaos : null;
}

function getPoe1LineDivineValue(line = {}, divineToChaos = null) {
  const explicitDivine = toPriceNumber(line.divineEquivalent ?? line.divineValue);
  if (explicitDivine > 0) {
    return roundPriceValue(explicitDivine);
  }

  const chaosValue = getPoe1LineChaosValue(line);
  if (!chaosValue || !divineToChaos) {
    return null;
  }

  return roundPriceValue(chaosValue / divineToChaos);
}

function getSparklineData(line = {}) {
  if (Array.isArray(line.receiveSparkLine?.data)) {
    return line.receiveSparkLine.data;
  }

  if (Array.isArray(line.sparkline?.data)) {
    return line.sparkline.data;
  }

  return Array.isArray(line.sparkline) ? line.sparkline : [];
}

function normalizeLookupKey(value) {
  return String(value || '').toLowerCase().trim();
}

// ─── PoE2 league slug resolution ──────────────────────────────

let poe2IndexCache = null;
let poe2IndexCacheTime = 0;

async function getPoe2IndexState(client) {
  const now = Date.now();
  if (poe2IndexCache && (now - poe2IndexCacheTime) < INDEX_CACHE_TTL_MS) {
    return poe2IndexCache;
  }

  const response = await client.get(POE2_INDEX_URL);
  poe2IndexCache = response.data;
  poe2IndexCacheTime = now;
  return poe2IndexCache;
}

async function getPoe2LeagueSlug(client, leagueName) {
  const indexState = await getPoe2IndexState(client);
  if (!indexState) return null;

  const allLeagues = [
    ...(indexState.economyLeagues || []),
    ...(indexState.oldEconomyLeagues || [])
  ];

  const match = allLeagues.find(l =>
    l.name.toLowerCase() === leagueName.toLowerCase() ||
    (l.displayName && l.displayName.toLowerCase() === leagueName.toLowerCase())
  );

  return match?.url || null;
}

function getExchangeDivineToChaos(data) {
  const primary = data?.core?.primary;
  const rates = data?.core?.rates || {};

  if (primary === 'chaos' && Number(rates.divine) > 0) {
    return 1 / Number(rates.divine);
  }
  if (primary === 'divine' && Number(rates.chaos) > 0) {
    return Number(rates.chaos);
  }
  return null;
}

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
        'Accept': 'application/json',
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
   * Fetch currency overview from poe.ninja
   */
  async _fetchCurrencyOverview(league, type) {
    const cacheKey = `${league}:currency:${type}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.data;
    }

    let url, params;

    if (this.poeVersion === 'poe2') {
      const slug = await getPoe2LeagueSlug(this.client, league);
      if (!slug) {
        throw new Error(`Unknown PoE2 league: ${league}`);
      }
      url = `${POE2_BASE_URL}/economy/exchange/${slug}/overview`;
      params = { league, type };
    } else {
      url = POE1_CURRENCY_URL;
      params = { league, type };
    }

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

    const url = POE1_ITEM_URL;
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
      // PoE2 exchange API format:
      //   lines: [{ id, primaryValue, ... }]
      //   items: [{ id, name, image }]
      //   core: { primary: "divine", secondary: "chaos", rates: { chaos: 31.94 } }
      const divineToChaos = getExchangeDivineToChaos(data);
      const primary = data?.core?.primary || 'divine';

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

          const primaryValue = Number(line.primaryValue) || 0;
          let chaosValue = 0;
          let divineValue = null;

          if (primary === 'chaos') {
            chaosValue = primaryValue;
            divineValue = divineToChaos ? roundPriceValue(chaosValue / divineToChaos) : null;
          } else {
            divineValue = roundPriceValue(primaryValue);
            chaosValue = divineToChaos ? Math.round(primaryValue * divineToChaos * 100) / 100 : 0;
          }

          const entry = {
            chaosValue,
            divineValue,
            category: type.toLowerCase(),
            icon: itemInfo.image ? `https://web.poecdn.com${itemInfo.image}` : null,
            tradeId: itemInfo.id || null,
            sparkline: Array.isArray(line.sparkline?.data) ? line.sparkline.data : []
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
          if (d.name) {
            detailsMap.set(d.name.toLowerCase().trim(), d);
          }
        }
      }
      const divineToChaos = getPoe1DivineToChaos(data);
      if (data.lines) {
        for (const line of data.lines) {
          const name = getPoe1CurrencyName(line);
          if (!name) continue;
          const details = detailsMap.get(name.toLowerCase().trim());
          const chaosValue = getPoe1LineChaosValue(line);
          const entry = {
            chaosValue,
            divineValue: getPoe1LineDivineValue(line, divineToChaos),
            category: type.toLowerCase(),
            icon: line.icon || details?.icon || null,
            tradeId: details?.tradeId || null,
            sparkline: getSparklineData(line)
          };
          this._addPrice(name, entry);
          registryBatch.push({ name, ...entry });
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
    const key = normalizeLookupKey(name);
    if (!key) {
      return;
    }
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
    const key = normalizeLookupKey(itemName);
    if (!key) {
      return 0;
    }

    const entry = this.priceMap.get(key);
    return entry?.chaosValue || 0;
  }

  /**
   * Get full price info for an item
   * @param {string} itemName
   * @returns {Object|null}
   */
  getPriceInfo(itemName) {
    const key = normalizeLookupKey(itemName);
    return key ? this.priceMap.get(key) || null : null;
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
