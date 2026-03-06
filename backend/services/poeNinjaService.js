/**
 * PoeNinja Service
 * poe.ninja API entegrasyonu ve fiyat senkronizasyonu
 * PoE 1 ve PoE 2 destegi
 */

const axios = require('axios');
const { Price } = require('../models');

const POE1_BASE_URL = 'https://poe.ninja/api/data';
const POE2_BASE_URL = 'https://poe.ninja/poe2/api/economy';

// PoE 1 item tipi mapping
const POE1_ITEM_TYPE_MAPPING = {
  'Currency': 'currency',
  'Fragment': 'fragment',
  'Scarab': 'scarab',
  'Map': 'map',
  'DivinationCard': 'divination_card',
  'SkillGem': 'gem',
  'UniqueMap': 'map',
  'Oil': 'oil',
  'Incubator': 'incubator',
  'DeliriumOrb': 'delirium_orb',
  'Catalyst': 'catalyst',
  'UniqueJewel': 'unique',
  'UniqueFlask': 'unique',
  'UniqueWeapon': 'unique',
  'UniqueArmour': 'unique',
  'UniqueAccessory': 'unique',
  'Resonator': 'other',
  'Fossil': 'other',
  'Essence': 'other'
};

// PoE 2 item tipi mapping
const POE2_ITEM_TYPE_MAPPING = {
  'Currency': 'currency',
  'Fragment': 'fragment',
  'Scarab': 'scarab',
  'Map': 'map',
  'DivinationCard': 'divination_card',
  'SkillGem': 'gem',
  'UniqueWeapon': 'unique',
  'UniqueArmour': 'unique',
  'UniqueAccessory': 'unique',
  'UniqueJewel': 'unique',
  'UniqueFlask': 'unique',
  'UniqueMap': 'map',
  'Catalyst': 'catalyst',
  'Essence': 'other',
  'Rune': 'other'
};

// PoE 1 sync tipleri
const POE1_SYNC_TYPES = [
  'Currency', 'Fragment', 'Scarab', 'Map', 'DivinationCard',
  'SkillGem', 'UniqueMap', 'Oil', 'Incubator', 'DeliriumOrb', 'Catalyst'
];

// PoE 2 sync tipleri
const POE2_SYNC_TYPES = [
  'Currency', 'Fragment', 'Scarab', 'Map', 'DivinationCard',
  'SkillGem', 'UniqueWeapon', 'UniqueArmour', 'UniqueAccessory'
];

function getTypeMapping(poeVersion) {
  return poeVersion === 'poe2' ? POE2_ITEM_TYPE_MAPPING : POE1_ITEM_TYPE_MAPPING;
}

function getDefaultSyncTypes(poeVersion) {
  return poeVersion === 'poe2' ? POE2_SYNC_TYPES : POE1_SYNC_TYPES;
}

/**
 * Currency verilerini poe.ninja'dan cek
 */
const getCurrencyOverview = async (league = 'Standard', type = 'Currency', poeVersion = 'poe1') => {
  try {
    let url, params;

    if (poeVersion === 'poe2') {
      url = `${POE2_BASE_URL}/currencyexchange/overview`;
      params = { leagueName: league, overviewName: type };
    } else {
      url = `${POE1_BASE_URL}/currencyoverview`;
      params = { league, type };
    }

    const response = await axios.get(url, {
      params,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PoE-Farm-Tracker/1.0'
      }
    });

    return response.data;
  } catch (error) {
    console.error(`Poe.ninja currency cekme hatasi (${type}, ${poeVersion}):`, error.message);
    throw new Error(`Currency verisi alinamadi: ${error.message}`);
  }
};

/**
 * Item verilerini poe.ninja'dan cek
 */
const getItemOverview = async (league = 'Standard', type = 'Map', poeVersion = 'poe1') => {
  try {
    let url, params;

    if (poeVersion === 'poe2') {
      url = `${POE2_BASE_URL}/item/overview`;
      params = { leagueName: league, overviewName: type };
    } else {
      url = `${POE1_BASE_URL}/itemoverview`;
      params = { league, type };
    }

    const response = await axios.get(url, {
      params,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PoE-Farm-Tracker/1.0'
      }
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

  // PoE 2 currency details may include icon URLs separately
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

    if (type === 'Currency' || type === 'Fragment') {
      const data = await getCurrencyOverview(league, type, poeVersion);
      items = normalizeCurrencyData(data, type, poeVersion);
    } else {
      const data = await getItemOverview(league, type, poeVersion);
      items = normalizeItemData(data, type, poeVersion);
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

    const divineOrb = data.lines.find(line =>
      (line.currencyTypeName || line.name) === 'Divine Orb'
    );

    if (divineOrb) {
      return {
        divineToChaos: divineOrb.chaosEquivalent || divineOrb.chaosValue || 180,
        chaosToDivine: 1 / (divineOrb.chaosEquivalent || divineOrb.chaosValue || 180)
      };
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
      (line.currencyTypeName || line.name).toLowerCase() === itemName.toLowerCase()
    );

    if (item) {
      return {
        name: item.currencyTypeName || item.name,
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
  getDefaultSyncTypes
};
