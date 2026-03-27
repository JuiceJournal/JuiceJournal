/**
 * PoeNinja Service
 * poe.ninja API entegrasyonu ve fiyat senkronizasyonu
 * PoE 1 ve PoE 2 destegi
 *
 * API Endpoints:
 * - PoE 1: https://poe.ninja/api/data/currencyoverview?league=X&type=Currency
 * - PoE 1: https://poe.ninja/api/data/itemoverview?league=X&type=Map
 * - PoE 2: https://poe.ninja/poe2/api/economy/exchange/{urlSlug}/overview?league=X&type=Currency
 * - PoE 2 leagues: https://poe.ninja/poe2/api/data/index-state
 */

const axios = require('axios');
const { Price } = require('../models');

const POE1_BASE_URL = 'https://poe.ninja/api/data';
const POE1_EXCHANGE_URL = 'https://poe.ninja/poe1/api';
const POE2_BASE_URL = 'https://poe.ninja/poe2/api';

const REQUEST_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'JuiceJournal/1.0'
};

// PoE 1 item tipi mapping (poe.ninja API type → internal category)
const POE1_ITEM_TYPE_MAPPING = {
  // Currency API types
  'Currency': 'currency',
  'Fragment': 'fragment',
  // Item API types
  'Scarab': 'scarab',
  'Map': 'map',
  'DivinationCard': 'divination_card',
  'SkillGem': 'gem',
  'UniqueMap': 'map',
  'Oil': 'oil',
  'Incubator': 'incubator',
  'DeliriumOrb': 'delirium_orb',
  'Catalyst': 'catalyst',
  'Essence': 'essence',
  'Fossil': 'fossil',
  'Resonator': 'fossil',
  'Beast': 'beast',
  'Vial': 'other',
  'Tattoo': 'tattoo',
  'Omen': 'omen',
  'Artifact': 'other',
  'DjinnCoin': 'other',
  'Wombgift': 'other',
  'Runegraft': 'other',
  'AllflameEmber': 'other',
  'ClusterJewel': 'unique',
  'ForbiddenJewel': 'unique',
  'ShrineBelt': 'unique',
  'UniqueTincture': 'unique',
  'UniqueRelic': 'unique',
  'UniqueJewel': 'unique',
  'UniqueFlask': 'unique',
  'UniqueWeapon': 'unique',
  'UniqueArmour': 'unique',
  'UniqueAccessory': 'unique',
  'BlightedMap': 'map',
  'BlightRavagedMap': 'map',
  'Invitation': 'map',
  'ValdoMap': 'map',
  'BaseType': 'base_type'
};

// PoE 2 item tipi mapping (all types use exchange API — note: poe.ninja uses PLURAL names for PoE2)
const POE2_ITEM_TYPE_MAPPING = {
  'Currency': 'currency',
  'Fragments': 'fragment',
  'UncutGems': 'gem',
  'SoulCores': 'soul_core',
  'Idol': 'idol',
  'Runes': 'rune',
  'Essences': 'essence',
  'Expedition': 'expedition',
  'Ultimatum': 'ultimatum'
};

// PoE 1 sync tipleri (currency API + item API types)
const POE1_SYNC_TYPES = [
  // Currency API
  'Currency', 'Fragment',
  // Item API — high priority
  'Scarab', 'Map', 'DivinationCard', 'Essence', 'Oil',
  'SkillGem', 'UniqueMap', 'Fossil', 'Resonator',
  'Incubator', 'DeliriumOrb', 'Catalyst',
  // Item API — uniques
  'UniqueJewel', 'UniqueFlask', 'UniqueWeapon', 'UniqueArmour', 'UniqueAccessory',
  'ForbiddenJewel', 'ShrineBelt', 'UniqueTincture', 'UniqueRelic', 'ClusterJewel',
  // Item API — league-specific
  'Beast', 'Tattoo', 'Omen',
  'BlightedMap', 'BlightRavagedMap', 'Invitation', 'ValdoMap',
  // Item API — minor (mapped to 'other')
  'Vial', 'Artifact', 'DjinnCoin', 'Wombgift', 'Runegraft', 'AllflameEmber',
  // Item API — base types (crafting bases)
  'BaseType'
];

// PoE 2 sync tipleri (all use exchange API — plural names required)
const POE2_SYNC_TYPES = [
  'Currency', 'Fragments', 'UncutGems', 'SoulCores',
  'Idol', 'Runes', 'Essences', 'Expedition', 'Ultimatum'
];

// Cache for league index states (refreshed every 30 min)
let poe1IndexCache = null;
let poe1IndexCacheTime = 0;
let poe2IndexCache = null;
let poe2IndexCacheTime = 0;
const INDEX_CACHE_TTL = 30 * 60 * 1000;

function getTypeMapping(poeVersion) {
  return poeVersion === 'poe2' ? POE2_ITEM_TYPE_MAPPING : POE1_ITEM_TYPE_MAPPING;
}

function getDefaultSyncTypes(poeVersion) {
  return poeVersion === 'poe2' ? POE2_SYNC_TYPES : POE1_SYNC_TYPES;
}

/**
 * PoE 1 index state'ini getir (exchange API league slugs icin)
 */
const getPoe1IndexState = async () => {
  const now = Date.now();
  if (poe1IndexCache && (now - poe1IndexCacheTime) < INDEX_CACHE_TTL) {
    return poe1IndexCache;
  }

  try {
    const response = await axios.get(`${POE1_EXCHANGE_URL}/data/index-state`, {
      timeout: 15000,
      headers: REQUEST_HEADERS
    });
    poe1IndexCache = response.data;
    poe1IndexCacheTime = now;
    return poe1IndexCache;
  } catch (error) {
    console.error('PoE1 index state fetch error:', error.message);
    return poe1IndexCache;
  }
};

/**
 * PoE 1 aktif league'in URL slug'ini bul (exchange API icin)
 */
const getPoe1LeagueSlug = async (leagueName) => {
  const indexState = await getPoe1IndexState();
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
};

/**
 * PoE 2 index state'ini getir (league listesi icin)
 */
const getPoe2IndexState = async () => {
  const now = Date.now();
  if (poe2IndexCache && (now - poe2IndexCacheTime) < INDEX_CACHE_TTL) {
    return poe2IndexCache;
  }

  try {
    const response = await axios.get(`${POE2_BASE_URL}/data/index-state`, {
      timeout: 15000,
      headers: REQUEST_HEADERS
    });
    poe2IndexCache = response.data;
    poe2IndexCacheTime = now;
    return poe2IndexCache;
  } catch (error) {
    console.error('PoE2 index state fetch error:', error.message);
    return poe2IndexCache; // return stale cache if available
  }
};

/**
 * PoE 2 aktif league'in URL slug'ini bul
 */
const getPoe2LeagueSlug = async (leagueName) => {
  const indexState = await getPoe2IndexState();
  if (!indexState) return null;

  const allLeagues = [
    ...(indexState.economyLeagues || []),
    ...(indexState.oldEconomyLeagues || [])
  ];

  const match = allLeagues.find(l =>
    l.name.toLowerCase() === leagueName.toLowerCase() ||
    l.displayName.toLowerCase() === leagueName.toLowerCase()
  );

  return match?.url || null;
};

/**
 * Aktif ligleri getir (poe.ninja'dan)
 */
const getActiveLeagues = async (poeVersion = 'poe1') => {
  if (poeVersion === 'poe2') {
    const indexState = await getPoe2IndexState();
    if (!indexState) return [];

    const leagues = [];
    for (const l of (indexState.economyLeagues || [])) {
      leagues.push({ name: l.name, displayName: l.displayName, active: true, hardcore: l.hardcore });
    }
    for (const l of (indexState.oldEconomyLeagues || [])) {
      leagues.push({ name: l.name, displayName: l.displayName, active: false, hardcore: l.hardcore });
    }
    return leagues;
  }

  // PoE 1 also has an index-state endpoint
  const indexState = await getPoe1IndexState();
  if (!indexState) return null;

  const leagues = [];
  for (const l of (indexState.economyLeagues || [])) {
    leagues.push({ name: l.name, displayName: l.displayName || l.name, active: true, hardcore: l.hardcore });
  }
  for (const l of (indexState.oldEconomyLeagues || [])) {
    leagues.push({ name: l.name, displayName: l.displayName || l.name, active: false, hardcore: l.hardcore });
  }
  return leagues.length > 0 ? leagues : null;
};

/**
 * Currency verilerini poe.ninja'dan cek
 */
const getCurrencyOverview = async (league = 'Standard', type = 'Currency', poeVersion = 'poe1') => {
  try {
    let url, params;

    if (poeVersion === 'poe2') {
      const slug = await getPoe2LeagueSlug(league);
      if (!slug) {
        throw new Error(`Unknown PoE2 league: ${league}`);
      }
      url = `${POE2_BASE_URL}/economy/exchange/${slug}/overview`;
      params = { league, type };
    } else {
      url = `${POE1_BASE_URL}/currencyoverview`;
      params = { league, type };
    }

    const response = await axios.get(url, {
      params,
      timeout: 30000,
      headers: REQUEST_HEADERS
    });

    return response.data;
  } catch (error) {
    console.error(`Poe.ninja currency cekme hatasi (${type}, ${poeVersion}):`, error.message);
    throw new Error(`Currency verisi alinamadi: ${error.message}`);
  }
};

/**
 * Item verilerini poe.ninja'dan cek (PoE 1 only — PoE 2 uses exchange API)
 */
const getItemOverview = async (league = 'Standard', type = 'Map', poeVersion = 'poe1') => {
  try {
    if (poeVersion === 'poe2') {
      // PoE 2 doesn't have item overview on poe.ninja yet
      return { lines: [] };
    }

    const url = `${POE1_BASE_URL}/itemoverview`;
    const params = { league, type };

    const response = await axios.get(url, {
      params,
      timeout: 30000,
      headers: REQUEST_HEADERS
    });

    return response.data;
  } catch (error) {
    console.error(`Poe.ninja item cekme hatasi (${type}, ${poeVersion}):`, error.message);
    throw new Error(`Item verisi alinamadi: ${error.message}`);
  }
};

/**
 * Currency verilerini normalize et
 */
const normalizeCurrencyData = (data, type, poeVersion = 'poe1') => {
  const items = [];
  const typeMapping = getTypeMapping(poeVersion);

  if (!data || !data.lines) {
    return items;
  }

  if (poeVersion === 'poe2') {
    // PoE 2 exchange API format:
    // - core.primary = "divine" (base currency), core.secondary = "chaos"
    // - core.rates = { chaos: 31.94 } (1 divine = 31.94 chaos)
    // - lines[].primaryValue = value in divine orbs (e.g., chaos: 0.03131 = 1 chaos costs 0.03131 divine)
    // - items[] = display names and icons matched by id

    // Build name + icon lookup from items array
    const itemInfoMap = {};
    if (data.items && data.items.length > 0) {
      data.items.forEach(item => {
        if (item.id) {
          itemInfoMap[item.id] = {
            name: item.name || item.id,
            image: item.image ? `https://web.poecdn.com${item.image}` : null
          };
        }
      });
    }

    // Divine-to-chaos conversion rate
    const chaosRate = data.core?.rates?.chaos || data.core?.rates?.exalted || 1;

    data.lines.forEach(line => {
      const divineValue = line.primaryValue || 0; // value in divine orbs
      const chaosValue = divineValue * chaosRate;  // convert to chaos
      const info = itemInfoMap[line.id] || {};

      items.push({
        name: info.name || line.id || 'Unknown',
        type: typeMapping[type] || 'currency',
        chaosValue: Math.round(chaosValue * 100) / 100,
        divineValue: Math.round(divineValue * 10000) / 10000,
        iconUrl: info.image || null,
        sparklineData: line.sparkline || null
      });
    });
  } else {
    // PoE 1 format
    data.lines.forEach(line => {
      const itemType = typeMapping[type] || 'currency';

      items.push({
        name: line.currencyTypeName || line.name,
        type: itemType,
        chaosValue: line.chaosEquivalent || line.chaosValue || 0,
        divineValue: line.divineEquivalent || (line.chaosEquivalent / 180) || null,
        iconUrl: line.icon || null,
        sparklineData: line.sparkline || line.receiveSparkLine || null
      });
    });

    // PoE 1 currency details may include icon URLs separately
    if (data.currencyDetails && data.currencyDetails.length > 0) {
      const iconMap = {};
      data.currencyDetails.forEach(detail => {
        if (detail.name && detail.icon) {
          iconMap[detail.name] = detail.icon;
        }
      });
      items.forEach(item => {
        if (!item.iconUrl && iconMap[item.name]) {
          item.iconUrl = iconMap[item.name];
        }
      });
    }
  }

  return items;
};

/**
 * Item verilerini normalize et
 */
const normalizeItemData = (data, type, poeVersion = 'poe1') => {
  const items = [];
  const typeMapping = getTypeMapping(poeVersion);

  if (!data || !data.lines) {
    return items;
  }

  data.lines.forEach(line => {
    const itemType = typeMapping[type] || 'other';

    let chaosValue = line.chaosValue || 0;
    let divineValue = line.divineValue || null;

    if (!chaosValue && line.exaltedValue) {
      chaosValue = line.exaltedValue * 15;
    }

    items.push({
      name: line.name,
      type: itemType,
      chaosValue: chaosValue,
      divineValue: divineValue,
      iconUrl: line.icon || line.artFilename || null,
      sparklineData: line.sparkline || null
    });
  });

  return items;
};

/**
 * Belirli bir tip icin fiyatlari senkronize et
 */
const syncPricesByType = async (league, type, poeVersion = 'poe1') => {
  try {
    let items = [];

    // PoE 2: all types use exchange API; PoE 1: Currency/Fragment use currencyoverview, rest use itemoverview
    if (poeVersion === 'poe2' || type === 'Currency' || type === 'Fragment') {
      const data = await getCurrencyOverview(league, type, poeVersion);
      items = normalizeCurrencyData(data, type, poeVersion);
    } else {
      const data = await getItemOverview(league, type, poeVersion);
      items = normalizeItemData(data, type, poeVersion);
    }

    // PoE 1: also fetch from exchange API to get additional items (e.g. Crusader's Exalted Orb)
    if (poeVersion === 'poe1') {
      try {
        const slug = await getPoe1LeagueSlug(league);
        if (slug) {
          const exRes = await axios.get(`${POE1_EXCHANGE_URL}/economy/exchange/${slug}/overview`, {
            params: { league, type },
            timeout: 30000,
            headers: REQUEST_HEADERS
          });
          const exItems = normalizeCurrencyData(exRes.data, type, 'poe2'); // same format as PoE2
          // Override type mapping to use PoE1 categories
          const typeMapping = getTypeMapping('poe1');
          const existingNames = new Set(items.map(i => i.name.toLowerCase()));
          let added = 0;
          for (const item of exItems) {
            item.type = typeMapping[type] || 'currency';
            if (!existingNames.has(item.name.toLowerCase())) {
              items.push(item);
              existingNames.add(item.name.toLowerCase());
              added++;
            }
          }
          if (added > 0) {
            console.log(`  +${added} extra items from PoE1 exchange API for ${type}`);
          }
        }
      } catch (exError) {
        // Exchange API is supplementary — don't fail the whole sync
      }
    }

    if (items.length === 0) {
      return {
        type,
        synced: 0,
        message: 'Veri bulunamadi'
      };
    }

    const results = await Price.bulkUpsert(items, league, poeVersion);

    return {
      type,
      synced: results.length,
      message: 'Basariyla senkronize edildi'
    };
  } catch (error) {
    console.error(`${type} senkronizasyon hatasi (${poeVersion}):`, error.message);
    return {
      type,
      synced: 0,
      error: error.message
    };
  }
};

/**
 * Tum fiyatlari senkronize et
 */
const syncAllPrices = async (league = 'Standard', types = null, poeVersion = 'poe1') => {
  const targetTypes = types || getDefaultSyncTypes(poeVersion);

  const results = {
    league,
    poeVersion,
    startedAt: new Date(),
    types: []
  };

  for (const type of targetTypes) {
    console.log(`${type} senkronizasyonu basliyor (${poeVersion})...`);

    const result = await syncPricesByType(league, type, poeVersion);
    results.types.push(result);

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const deactivatedCount = await Price.deactivateOldPrices(league, 120, poeVersion);
  results.deactivatedOldPrices = deactivatedCount;

  results.completedAt = new Date();

  console.log(`Fiyat senkronizasyonu tamamlandi (${poeVersion}): ${results.types.reduce((sum, t) => sum + t.synced, 0)} item`);

  return results;
};

/**
 * Chaos Orb degerini bul (Divine/Chaos orani icin)
 */
const getChaosOrbValue = async (league = 'Standard', poeVersion = 'poe1') => {
  try {
    const data = await getCurrencyOverview(league, 'Currency', poeVersion);

    if (poeVersion === 'poe2') {
      // PoE 2 exchange API provides rates in core
      const divineRate = data.core?.rates?.divine;
      if (divineRate) {
        return { divineToChaos: 1 / divineRate, chaosToDivine: divineRate };
      }
    } else {
      const divineOrb = data.lines.find(line =>
        (line.currencyTypeName || line.name) === 'Divine Orb'
      );

      if (divineOrb) {
        return {
          divineToChaos: divineOrb.chaosEquivalent || divineOrb.chaosValue || 180,
          chaosToDivine: 1 / (divineOrb.chaosEquivalent || divineOrb.chaosValue || 180)
        };
      }
    }

    return { divineToChaos: 180, chaosToDivine: 1/180 };
  } catch (error) {
    console.error('Chaos orb degeri alma hatasi:', error.message);
    return { divineToChaos: 180, chaosToDivine: 1/180 };
  }
};

/**
 * Belirli bir item'in fiyatini bul
 */
const getItemPrice = async (itemName, itemType = null, league = 'Standard', poeVersion = 'poe1') => {
  try {
    const cachedPrice = await Price.findByName(itemName, league, poeVersion);

    if (cachedPrice) {
      return {
        name: cachedPrice.itemName,
        chaosValue: parseFloat(cachedPrice.chaosValue),
        divineValue: cachedPrice.divineValue ? parseFloat(cachedPrice.divineValue) : null,
        source: 'cache',
        updatedAt: cachedPrice.updatedAt
      };
    }

    let searchType = 'Item';
    if (itemType === 'currency' || itemType === 'fragment') {
      searchType = 'Currency';
    } else if (itemType === 'map') {
      searchType = 'Map';
    }

    const data = searchType === 'Currency'
      ? await getCurrencyOverview(league, searchType, poeVersion)
      : await getItemOverview(league, searchType, poeVersion);

    const item = data.lines.find(line =>
      (line.currencyTypeName || line.name || line.id || '').toLowerCase() === itemName.toLowerCase()
    );

    if (item) {
      return {
        name: item.currencyTypeName || item.name || item.id,
        chaosValue: item.chaosEquivalent || item.chaosValue || 0,
        divineValue: item.divineValue || (item.chaosEquivalent / 180) || null,
        source: 'poe.ninja',
        updatedAt: new Date()
      };
    }

    return null;
  } catch (error) {
    console.error(`Fiyat arama hatasi (${itemName}):`, error.message);
    return null;
  }
};

module.exports = {
  getCurrencyOverview,
  getItemOverview,
  syncPricesByType,
  syncAllPrices,
  getChaosOrbValue,
  getItemPrice,
  normalizeCurrencyData,
  normalizeItemData,
  getDefaultSyncTypes,
  getActiveLeagues,
  getPoe2IndexState
};
