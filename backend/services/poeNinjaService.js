/**
 * PoeNinja Service
 * poe.ninja API entegrasyonu ve fiyat senkronizasyonu
 */

const axios = require('axios');
const { Price } = require('../models');

const POE_NINJA_BASE_URL = 'https://poe.ninja/api/data';

// Item tipi mapping'i
const ITEM_TYPE_MAPPING = {
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

/**
 * Currency verilerini poe.ninja'dan cek
 */
const getCurrencyOverview = async (league = 'Ancestor', type = 'Currency') => {
  try {
    const response = await axios.get(
      `${POE_NINJA_BASE_URL}/currencyoverview`,
      {
        params: {
          league,
          type
        },
        timeout: 30000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'PoE-Farm-Tracker/1.0'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error(`Poe.ninja currency cekme hatasi (${type}):`, error.message);
    throw new Error(`Currency verisi alinamadi: ${error.message}`);
  }
};

/**
 * Item verilerini poe.ninja'dan cek
 */
const getItemOverview = async (league = 'Ancestor', type = 'Map') => {
  try {
    const response = await axios.get(
      `${POE_NINJA_BASE_URL}/itemoverview`,
      {
        params: {
          league,
          type
        },
        timeout: 30000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'PoE-Farm-Tracker/1.0'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error(`Poe.ninja item cekme hatasi (${type}):`, error.message);
    throw new Error(`Item verisi alinamadi: ${error.message}`);
  }
};

/**
 * Currency verilerini normalize et
 */
const normalizeCurrencyData = (data, type) => {
  const items = [];
  
  if (!data || !data.lines) {
    return items;
  }

  data.lines.forEach(line => {
    const itemType = ITEM_TYPE_MAPPING[type] || 'currency';
    
    items.push({
      name: line.currencyTypeName || line.name,
      type: itemType,
      chaosValue: line.chaosEquivalent || line.chaosValue || 0,
      divineValue: line.divineEquivalent || (line.chaosEquivalent / 180) || null,
      iconUrl: line.icon || null,
      sparklineData: line.sparkline || line.receiveSparkLine || null
    });
  });

  return items;
};

/**
 * Item verilerini normalize et
 */
const normalizeItemData = (data, type) => {
  const items = [];
  
  if (!data || !data.lines) {
    return items;
  }

  data.lines.forEach(line => {
    const itemType = ITEM_TYPE_MAPPING[type] || 'other';
    
    // Chaos degerini al - farkli formatlar olabilir
    let chaosValue = line.chaosValue || 0;
    let divineValue = line.divineValue || null;
    
    // Eger chaos degeri yoksa exalted'dan hesapla (eski ligler icin)
    if (!chaosValue && line.exaltedValue) {
      chaosValue = line.exaltedValue * 15; // Yaklasik eski oran
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
const syncPricesByType = async (league, type) => {
  try {
    let items = [];
    
    // Currency ve Fragment icin currencyoverview kullan
    if (type === 'Currency' || type === 'Fragment') {
      const data = await getCurrencyOverview(league, type);
      items = normalizeCurrencyData(data, type);
    } else {
      // Diger tipler icin itemoverview kullan
      const data = await getItemOverview(league, type);
      items = normalizeItemData(data, type);
    }

    if (items.length === 0) {
      return {
        type,
        synced: 0,
        message: 'Veri bulunamadi'
      };
    }

    // Bulk upsert yap
    const results = await Price.bulkUpsert(items, league);
    
    return {
      type,
      synced: results.length,
      message: 'Basariyla senkronize edildi'
    };
  } catch (error) {
    console.error(`${type} senkronizasyon hatasi:`, error.message);
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
const syncAllPrices = async (league = 'Ancestor', types = null) => {
  const targetTypes = types || [
    'Currency',
    'Fragment',
    'Scarab',
    'Map',
    'DivinationCard',
    'SkillGem',
    'UniqueMap',
    'Oil',
    'Incubator',
    'DeliriumOrb',
    'Catalyst'
  ];

  const results = {
    league,
    startedAt: new Date(),
    types: []
  };

  // Sirayla her tipi senkronize et (rate limiting icin)
  for (const type of targetTypes) {
    console.log(`${type} senkronizasyonu basliyor...`);
    
    const result = await syncPricesByType(league, type);
    results.types.push(result);
    
    // Rate limiting icin bekle
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Eski fiyatlari pasif yap (2 saatten eski)
  const deactivatedCount = await Price.deactivateOldPrices(league, 120);
  results.deactivatedOldPrices = deactivatedCount;
  
  results.completedAt = new Date();
  
  console.log(`Fiyat senkronizasyonu tamamlandi: ${results.types.reduce((sum, t) => sum + t.synced, 0)} item`);
  
  return results;
};

/**
 * Chaos Orb degerini bul (Divine/Chaos orani icin)
 */
const getChaosOrbValue = async (league = 'Ancestor') => {
  try {
    const data = await getCurrencyOverview(league, 'Currency');
    
    // Chaos Orb'u bul (her zaman chaosEquivalent = 1)
    // Divine Orb'u bul
    const divineOrb = data.lines.find(line => 
      line.currencyTypeName === 'Divine Orb' || 
      line.name === 'Divine Orb'
    );

    if (divineOrb) {
      return {
        divineToChaos: divineOrb.chaosEquivalent || divineOrb.chaosValue || 180,
        chaosToDivine: 1 / (divineOrb.chaosEquivalent || divineOrb.chaosValue || 180)
      };
    }

    // Varsayilan degerler
    return {
      divineToChaos: 180,
      chaosToDivine: 1/180
    };
  } catch (error) {
    console.error('Chaos orb degeri alma hatasi:', error.message);
    return {
      divineToChaos: 180,
      chaosToDivine: 1/180
    };
  }
};

/**
 * Belirli bir item'in fiyatini bul
 */
const getItemPrice = async (itemName, itemType = null, league = 'Ancestor') => {
  try {
    // Once veritabaninda ara
    const cachedPrice = await Price.findByName(itemName, league);
    
    if (cachedPrice) {
      return {
        name: cachedPrice.itemName,
        chaosValue: parseFloat(cachedPrice.chaosValue),
        divineValue: cachedPrice.divineValue ? parseFloat(cachedPrice.divineValue) : null,
        source: 'cache',
        updatedAt: cachedPrice.updatedAt
      };
    }

    // Cache'de yoksa poe.ninja'dan cek
    // Item tipine gore uygun endpoint'i sec
    let searchType = 'Item';
    if (itemType === 'currency' || itemType === 'fragment') {
      searchType = 'Currency';
    } else if (itemType === 'map') {
      searchType = 'Map';
    }

    const data = searchType === 'Currency' 
      ? await getCurrencyOverview(league, searchType)
      : await getItemOverview(league, searchType);

    // Item'i bul
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
  normalizeItemData
};
