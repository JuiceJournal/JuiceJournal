/**
 * Price Service Module
 * Fetches currency and item prices from poe.ninja
 * Caches prices to avoid hammering the API (12 req / 5 min limit)
 *
 * PoE1 currency types: https://poe.ninja/poe1/api/economy/exchange/{slug}/overview?league=X&type=Y
 * PoE1 item types:     https://poe.ninja/poe1/api/economy/stash/current/item/overview?league=X&type=Y
 * PoE2:                https://poe.ninja/poe2/api/economy/exchange/{slug}/overview?league=X&type=Y
 */

const axios = require('axios');
const registry = require('./currencyRegistry');

const POE1_CURRENCY_URL = 'https://poe.ninja/poe1/api/economy/stash/current/currency/overview';
const POE1_ITEM_URL = 'https://poe.ninja/poe1/api/economy/stash/current/item/overview';
const NINJA_API_URLS = {
  poe1: 'https://poe.ninja/poe1/api',
  poe2: 'https://poe.ninja/poe2/api'
};

// poe.ninja overview types (lowercased) → the item types the Currency page filters by.
const NINJA_ITEM_TYPES = {
  currency: 'currency',
  fragment: 'fragment',
  fragments: 'fragment',
  scarab: 'scarab',
  map: 'map',
  uniquemap: 'map',
  blightedmap: 'map',
  blightravagedmap: 'map',
  invitation: 'map',
  valdomap: 'map',
  memory: 'map',
  divinationcard: 'divination_card',
  skillgem: 'gem',
  uncutgems: 'gem',
  oil: 'oil',
  catalyst: 'catalyst',
  incubator: 'incubator',
  deliriumorb: 'delirium_orb',
  essence: 'essence',
  essences: 'essence',
  fossil: 'fossil',
  resonator: 'fossil',
  beast: 'beast',
  tattoo: 'tattoo',
  omen: 'omen',
  runegraft: 'rune',
  runes: 'rune',
  clusterjewel: 'unique',
  forbiddenjewel: 'unique',
  shrinebelt: 'unique',
  uniquetincture: 'unique',
  uniquerelic: 'unique',
  uniquejewel: 'unique',
  uniqueflask: 'unique',
  uniqueweapon: 'unique',
  uniquearmour: 'unique',
  uniqueaccessory: 'unique',
  basetype: 'base_type',
  soulcores: 'soul_core',
  idol: 'idol',
  expedition: 'expedition',
  ultimatum: 'ultimatum',
  vaal: 'vaal'
};

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
    // The league priceMap holds, and whether every type was synced for it.
    this.league = null;
    this.fullySynced = false;
    this.syncQueue = Promise.resolve();
    // poe.ninja's league list per game: poeVersion → { data, fetchedAt }
    this.indexStates = new Map();

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

  async _getIndexState(poeVersion) {
    const cached = this.indexStates.get(poeVersion);
    if (cached && (Date.now() - cached.fetchedAt) < INDEX_CACHE_TTL_MS) {
      return cached.data;
    }

    const response = await this.client.get(`${NINJA_API_URLS[poeVersion]}/data/index-state`);
    this.indexStates.set(poeVersion, { data: response.data, fetchedAt: Date.now() });
    return response.data;
  }

  // poe.ninja's exchange URLs name a league by its slug.
  async _getLeagueSlug(leagueName) {
    const indexState = await this._getIndexState(this.poeVersion);
    const wanted = String(leagueName || '').toLowerCase();
    const match = [...(indexState?.economyLeagues || []), ...(indexState?.oldEconomyLeagues || [])].find((league) => (
      league.name?.toLowerCase() === wanted || league.displayName?.toLowerCase() === wanted
    ));
    return match?.url || null;
  }

  /**
   * Fetch currency overview from poe.ninja
   */
  async _fetchCurrencyOverview(league, type) {
    const cacheKey = `${this.poeVersion}:${league}:currency:${type}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.data;
    }

    // Both games' currency-like types come from the exchange API. PoE1's older stash endpoint now returns only a
    // few lines per type, so it is used only for leagues the exchange does not list.
    const slug = await this._getLeagueSlug(league);
    let url;
    if (slug) {
      url = `${NINJA_API_URLS[this.poeVersion]}/economy/exchange/${slug}/overview`;
    } else if (this.poeVersion === 'poe2') {
      throw new Error(`Unknown PoE2 league: ${league}`);
    } else {
      url = POE1_CURRENCY_URL;
    }

    const response = await this.client.get(url, { params: { league, type } });
    const data = response.data;

    this._enforceCacheLimit();
    this.cache.set(cacheKey, { data, fetchedAt: Date.now() });
    return data;
  }

  /**
   * Fetch item overview from poe.ninja (PoE1 only)
   */
  async _fetchItemOverview(league, type) {
    const cacheKey = `${this.poeVersion}:${league}:item:${type}`;
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
    // Filled apart and swapped in at the end, so readers such as OCR pricing never see a half-filled list.
    const prices = new Map();

    // Get types from registry (version-aware, dynamic)
    const currencyTypes = registry.getCurrencyTypes();
    const itemTypes = options.full !== false
      ? registry.getItemTypes()
      : registry.getQuickSyncTypes().filter(t => !currencyTypes.includes(t));

    // Fetch currency overviews
    for (const type of currencyTypes) {
      try {
        const data = await this._fetchCurrencyOverview(league, type);
        this._indexCurrencyData(data, type, prices);
      } catch (err) {
        console.error(`Price sync failed for currency/${type}:`, err.message);
      }
    }

    // Fetch item overviews (PoE1 only for now)
    if (this.poeVersion === 'poe1') {
      for (const type of itemTypes) {
        try {
          const data = await this._fetchItemOverview(league, type);
          this._indexItemData(data, type, prices);
        } catch (err) {
          console.error(`Price sync failed for item/${type}:`, err.message);
        }
        // Small delay to respect rate limits
        await new Promise(r => setTimeout(r, 300));
      }
    }

    this.priceMap = prices;
    this.lastFullSync = Date.now();
    this.league = league;
    this.fullySynced = options.full !== false;
    return {
      itemCount: this.priceMap.size,
      syncedAt: this.lastFullSync
    };
  }

  /**
   * Syncs a league's prices unless they are already loaded (`force` syncs anyway). Syncs run one at a time, so a
   * queued call finds the league loaded when an earlier call already synced it.
   */
  ensureSynced(league, poeVersion, { full = false, force = false } = {}) {
    const version = poeVersion === 'poe2' ? 'poe2' : 'poe1';
    this.syncQueue = this.syncQueue.catch(() => {}).then(async () => {
      const loaded = this.priceMap.size > 0
        && this.poeVersion === version
        && this.league === league
        && (this.fullySynced || !full);
      if (force || !loaded) {
        if (this.poeVersion !== version) {
          // The other game's prices must not read as this game's while its sync runs.
          this.priceMap = new Map();
          this.league = null;
          this.fullySynced = false;
        }
        this.setPoeVersion(version);
        await this.syncPrices(league, { full });
      }
      return { ...this.getStatus(), league: this.league };
    });
    return this.syncQueue;
  }

  /**
   * poe.ninja's leagues for a game: current economy leagues first, then old ones marked inactive.
   */
  async getLeagues(poeVersion) {
    const indexState = await this._getIndexState(poeVersion === 'poe2' ? 'poe2' : 'poe1');
    const toLeague = (league, active) => ({
      name: league.name,
      displayName: league.displayName || league.name,
      active,
      hardcore: Boolean(league.hardcore)
    });

    return [
      ...(indexState?.economyLeagues || []).map((league) => toLeague(league, true)),
      ...(indexState?.oldEconomyLeagues || []).map((league) => toLeague(league, false))
    ];
  }

  /**
   * The synced league's prices in the shape the Currency page reads, most valuable first.
   */
  listPrices({ type = '', search = '', limit } = {}) {
    const query = normalizeLookupKey(search);
    return [...this.priceMap.values()]
      .map((entry) => ({
        itemName: entry.name,
        itemType: NINJA_ITEM_TYPES[entry.category] || 'other',
        chaosValue: entry.chaosValue,
        divineValue: entry.divineValue,
        iconUrl: entry.icon,
        sparklineData: { data: entry.sparkline || [] }
      }))
      .filter((price) => (!type || price.itemType === type) && (!query || price.itemName.toLowerCase().includes(query)))
      .sort((left, right) => right.chaosValue - left.chaosValue)
      .slice(0, Number.parseInt(limit, 10) || 500);
  }

  /**
   * Index currency data into priceMap (or the map a sync is filling)
   */
  _indexCurrencyData(data, type, prices = this.priceMap) {
    const registryBatch = [];

    if (Array.isArray(data?.items)) {
      // Exchange API format:
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
          this._addPrice(itemInfo.name, entry, prices);
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
          this._addPrice(name, entry, prices);
          registryBatch.push({ name, ...entry });
        }
      }
    }

    // Feed discovered items into the currency registry
    registry.registerFromNinja(type, registryBatch);
  }

  /**
   * Index item data into priceMap (or the map a sync is filling)
   */
  _indexItemData(data, type, prices = this.priceMap) {
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
      this._addPrice(line.name, entry, prices);
      registryBatch.push({ name: line.name, ...entry });
    }
    // Feed discovered items into the currency registry
    registry.registerFromNinja(type, registryBatch);
  }

  _addPrice(name, data, prices = this.priceMap) {
    const key = normalizeLookupKey(name);
    if (!key) {
      return;
    }
    this._enforcePriceMapLimit(prices);
    prices.set(key, { name, ...data });
  }

  _evictOldest(map, count) {
    const keys = [...map.keys()];
    for (let i = 0; i < Math.min(count, keys.length); i++) {
      map.delete(keys[i]);
    }
  }

  _enforcePriceMapLimit(prices) {
    if (prices.size >= MAX_PRICE_MAP_SIZE) {
      this._evictOldest(prices, Math.ceil(MAX_PRICE_MAP_SIZE * 0.1));
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
    this.league = null;
    this.fullySynced = false;
  }
}

module.exports = PriceService;
