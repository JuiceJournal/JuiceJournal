/**
 * PoeNinja Service
 * poe.ninja API entegrasyonu ve fiyat senkronizasyonu
 * PoE 1 ve PoE 2 destegi
 *
 * API Endpoints:
 * - PoE 1 currency: https://poe.ninja/poe1/api/economy/stash/current/currency/overview?league=X&type=Currency
 * - PoE 1 items: https://poe.ninja/poe1/api/economy/stash/current/item/overview?league=X&type=Map
 * - PoE 1 exchange: https://poe.ninja/poe1/api/economy/exchange/{slug}/overview?league=X&type=Currency
 * - PoE 2: https://poe.ninja/poe2/api/economy/exchange/{urlSlug}/overview?league=X&type=Currency
 * - PoE 2 leagues: https://poe.ninja/poe2/api/data/index-state
 */

const axios = require('axios');
const { Price } = require('../models');

const POE1_CURRENCY_URL = 'https://poe.ninja/poe1/api/economy/stash/current/currency/overview';
const POE1_ITEM_URL = 'https://poe.ninja/poe1/api/economy/stash/current/item/overview';
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
  'Catalyst': 'catalyst',
  'Incubator': 'incubator',
  'DeliriumOrb': 'delirium_orb',
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
  'Runegraft': 'rune',
  'Memory': 'map',
  'Coffin': 'other',
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
  'Catalyst', 'Incubator', 'DeliriumOrb',
  // Item API — uniques
  'UniqueJewel', 'UniqueFlask', 'UniqueWeapon', 'UniqueArmour', 'UniqueAccessory',
  'ForbiddenJewel', 'ShrineBelt', 'UniqueTincture', 'UniqueRelic', 'ClusterJewel',
  // Item API — league-specific
  'Beast', 'Tattoo', 'Omen', 'Memory', 'Coffin',
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
const poe1DivineRateCache = new Map();
const DIVINE_RATE_CACHE_TTL = 5 * 60 * 1000;

function getTypeMapping(poeVersion) {
  return poeVersion === 'poe2' ? POE2_ITEM_TYPE_MAPPING : POE1_ITEM_TYPE_MAPPING;
}

function getDefaultSyncTypes(poeVersion) {
  return poeVersion === 'poe2' ? POE2_SYNC_TYPES : POE1_SYNC_TYPES;
}

function getLineChaosValue(line = {}) {
  return Number(line.chaosEquivalent ?? line.chaosValue ?? 0) || 0;
}

function getPoe1DivineToChaos(data) {
  const divineLine = data?.lines?.find(line =>
    (line.currencyTypeName || line.name || '').toLowerCase() === 'divine orb'
  );
  const divineToChaos = getLineChaosValue(divineLine);
  return divineToChaos > 0 ? divineToChaos : 180;
}

function getPoe1DivineValue(line, divineToChaos) {
  const explicitDivineValue = Number(line?.divineEquivalent ?? line?.divineValue);
  if (Number.isFinite(explicitDivineValue) && explicitDivineValue > 0) {
    return explicitDivineValue;
  }

  const chaosValue = getLineChaosValue(line);
  if (!chaosValue || !divineToChaos) {
    return null;
  }

  return Math.round((chaosValue / divineToChaos) * 1000000) / 1000000;
}

function roundPriceValue(value, precision = 6) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function getExchangeDivineToChaos(data, fallback = null) {
  const primary = data?.core?.primary;
  const secondary = data?.core?.secondary;
  const rates = data?.core?.rates || {};

  if (primary === 'chaos' && secondary === 'divine' && Number(rates.divine) > 0) {
    return 1 / Number(rates.divine);
  }

  if (primary === 'divine' && Number(rates.chaos) > 0) {
    return Number(rates.chaos);
  }

  return fallback;
}

function getExchangeLineValues(line, data, options = {}) {
  const primaryValue = Number(line?.primaryValue) || 0;
  const primary = data?.core?.primary;
  const rates = data?.core?.rates || {};
  const divineToChaos = options.divineToChaos || getExchangeDivineToChaos(data);
  let chaosValue = 0;
  let divineValue = null;

  if (primary === 'chaos') {
    chaosValue = primaryValue;
    if (line?.id === data?.core?.secondary) {
      divineValue = 1;
    } else if (line?.maxVolumeCurrency === 'divine' && Number(line.maxVolumeRate) > 0) {
      divineValue = 1 / Number(line.maxVolumeRate);
    } else if (Number(rates.divine) > 0) {
      divineValue = chaosValue * Number(rates.divine);
    } else if (divineToChaos) {
      divineValue = chaosValue / divineToChaos;
    }
  } else if (primary === 'divine') {
    divineValue = primaryValue;
    if (Number(rates.chaos) > 0) {
      chaosValue = divineValue * Number(rates.chaos);
    } else if (divineToChaos) {
      chaosValue = divineValue * divineToChaos;
    }
  } else {
    chaosValue = primaryValue;
    if (divineToChaos) {
      divineValue = chaosValue / divineToChaos;
    }
  }

  return {
    chaosValue: roundPriceValue(chaosValue, 2) || 0,
    divineValue: roundPriceValue(divineValue)
  };
}

function buildExchangeItemInfoMap(data) {
  const itemInfoMap = {};
  const registerItem = (item) => {
    if (!item?.id) return;
    itemInfoMap[item.id] = {
      name: item.name || item.id,
      image: item.image ? `https://web.poecdn.com${item.image}` : null
    };
  };

  (data?.core?.items || []).forEach(registerItem);
  (data?.items || []).forEach(registerItem);

  return itemInfoMap;
}

function normalizeExchangeData(data, type, poeVersion = 'poe1', options = {}) {
  const items = [];
  const typeMapping = getTypeMapping(poeVersion);
  const itemInfoMap = buildExchangeItemInfoMap(data);

  if (!data?.lines) {
    return items;
  }

  data.lines.forEach(line => {
    const info = itemInfoMap[line.id] || {};
    const values = getExchangeLineValues(line, data, options);

    items.push({
      name: info.name || line.id || 'Unknown',
      type: typeMapping[type] || 'currency',
      chaosValue: values.chaosValue,
      divineValue: values.divineValue,
      iconUrl: info.image || null,
      sparklineData: line.sparkline || null
    });
  });

  const divineToChaos = getExchangeDivineToChaos(data, options.divineToChaos);
  const secondary = data?.core?.secondary;
  if (data?.core?.primary === 'chaos' && secondary && divineToChaos) {
    const info = itemInfoMap[secondary];
    if (info?.name && !items.some(item => item.name.toLowerCase() === info.name.toLowerCase())) {
      items.push({
        name: info.name,
        type: typeMapping[type] || 'currency',
        chaosValue: roundPriceValue(divineToChaos, 2) || 0,
        divineValue: 1,
        iconUrl: info.image || null,
        sparklineData: null
      });
    }
  }

  return items;
}

async function getPoe1DivineToChaosForLeague(league = 'Standard') {
  const cacheKey = String(league || 'Standard').toLowerCase();
  const cached = poe1DivineRateCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < DIVINE_RATE_CACHE_TTL) {
    return cached.divineToChaos;
  }

  const data = await getCurrencyOverview(league, 'Currency', 'poe1');
  const divineToChaos = getPoe1DivineToChaos(data);
  poe1DivineRateCache.set(cacheKey, {
    divineToChaos,
    timestamp: Date.now()
  });
  return divineToChaos;
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
      url = POE1_CURRENCY_URL;
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

    const url = POE1_ITEM_URL;
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
const normalizeCurrencyData = (data, type, poeVersion = 'poe1', options = {}) => {
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
    const divineToChaos = options.divineToChaos || getPoe1DivineToChaos(data);
    data.lines.forEach(line => {
      const itemType = typeMapping[type] || 'currency';
      const chaosValue = getLineChaosValue(line);

      items.push({
        name: line.currencyTypeName || line.name,
        type: itemType,
        chaosValue,
        divineValue: getPoe1DivineValue(line, divineToChaos),
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
const normalizeItemData = (data, type, poeVersion = 'poe1', options = {}) => {
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

    if (!divineValue && poeVersion === 'poe1' && options.divineToChaos) {
      divineValue = getPoe1DivineValue({ chaosValue }, options.divineToChaos);
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
const syncPricesByType = async (league, type, poeVersion = 'poe1', options = {}) => {
  try {
    let items = [];
    const divineToChaos = poeVersion === 'poe1' && type !== 'Currency'
      ? options.divineToChaos || await getPoe1DivineToChaosForLeague(league)
      : options.divineToChaos;
    const normalizationOptions = divineToChaos ? { divineToChaos } : {};

    // PoE 2: all types use exchange API; PoE 1: Currency/Fragment use currencyoverview, rest use itemoverview
    if (poeVersion === 'poe2' || type === 'Currency' || type === 'Fragment') {
      const data = await getCurrencyOverview(league, type, poeVersion);
      items = normalizeCurrencyData(data, type, poeVersion, normalizationOptions);
    } else {
      const data = await getItemOverview(league, type, poeVersion);
      items = normalizeItemData(data, type, poeVersion, normalizationOptions);
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
          const exItems = normalizeExchangeData(exRes.data, type, 'poe1', { divineToChaos });
          const existingNames = new Map(items.map((item, index) => [item.name.toLowerCase(), index]));
          let added = 0;
          let updated = 0;
          for (const item of exItems) {
            const key = item.name.toLowerCase();
            const existingIndex = existingNames.get(key);
            if (existingIndex !== undefined) {
              items[existingIndex] = {
                ...items[existingIndex],
                ...item
              };
              updated++;
            } else {
              items.push(item);
              existingNames.set(key, items.length - 1);
              added++;
            }
          }
          if (added > 0 || updated > 0) {
            console.log(`  +${added} extra, ~${updated} updated items from PoE1 exchange API for ${type}`);
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
  const divineToChaos = poeVersion === 'poe1'
    ? await getPoe1DivineToChaosForLeague(league).catch(() => null)
    : null;

  const results = {
    league,
    poeVersion,
    startedAt: new Date(),
    types: []
  };

  for (const type of targetTypes) {
    console.log(`${type} senkronizasyonu basliyor (${poeVersion})...`);

    const result = await syncPricesByType(league, type, poeVersion, { divineToChaos });
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
      const divineToChaos = getExchangeDivineToChaos(data);
      if (divineToChaos) {
        return { divineToChaos, chaosToDivine: 1 / divineToChaos };
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
      const divineToChaos = poeVersion === 'poe1'
        ? getPoe1DivineToChaos(data)
        : null;
      const chaosValue = item.chaosEquivalent || item.chaosValue || 0;
      return {
        name: item.currencyTypeName || item.name || item.id,
        chaosValue,
        divineValue: poeVersion === 'poe1'
          ? getPoe1DivineValue(item, divineToChaos)
          : item.divineValue || null,
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
  normalizeExchangeData,
  getExchangeDivineToChaos,
  getPoe1DivineToChaos,
  getPoe1DivineToChaosForLeague,
  getDefaultSyncTypes,
  getActiveLeagues,
  getPoe2IndexState
};
