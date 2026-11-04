// Bench only. poe.ninja responses and journals at realistic sizes, deterministic so runs compare.
const POE1_EXCHANGE = {
  Currency: 94, Fragment: 45, Scarab: 40, DivinationCard: 60, Essence: 25, Oil: 15, Fossil: 12, Resonator: 4, Catalyst: 10,
  DeliriumOrb: 8, Tattoo: 12, Omen: 10, Artifact: 4, DjinnCoin: 3, Runegraft: 6, AllflameEmber: 4
};
const POE1_ITEMS = {
  SkillGem: 14, UniqueMap: 8, Map: 6, UniqueJewel: 3, UniqueFlask: 3, UniqueWeapon: 8, UniqueArmour: 8, UniqueAccessory: 6,
  Beast: 6, ClusterJewel: 2, ForbiddenJewel: 2, ShrineBelt: 1, UniqueTincture: 2, Invitation: 3, ValdoMap: 2, Memory: 2, Coffin: 2,
  Incubator: 4, Vial: 2, BlightedMap: 3, BlightRavagedMap: 2, UniqueRelic: 2, Wombgift: 2, BaseType: 5
};
const POE2 = {
  Currency: 80, Fragments: 25, UncutGems: 30, SoulCores: 30, Idols: 20, Runes: 35, Essences: 25, Expedition: 10, Ultimatum: 10, Vaal: 5,
  Ritual: 20, Abyss: 10, Breach: 15, Delirium: 15, Verisium: 15, LineageSupportGems: 35
};
// Lines per overview as live poe.ninja sent them on 2026-11-01 (42 requests, 11.3 MB of JSON, 4696 distinct names in
// PoE1; 421 in PoE2). Gems and base types list every variant of a name, so a name repeats.
const LIVE_POE1_EXCHANGE = {
  Currency: 100, Fragment: 71, Scarab: 115, DivinationCard: 177, Essence: 63, Oil: 15, Fossil: 23, Resonator: 4, Catalyst: 0,
  DeliriumOrb: 12, Tattoo: 44, Omen: 8, Artifact: 4, DjinnCoin: 0, Runegraft: 25, AllflameEmber: 7
};
const LIVE_POE1_ITEMS = {
  SkillGem: 5504, UniqueMap: 26, Map: 36, UniqueJewel: 162, UniqueFlask: 40, UniqueWeapon: 524, UniqueArmour: 864,
  UniqueAccessory: 356, Beast: 198, ClusterJewel: 757, ForbiddenJewel: 321, ShrineBelt: 0, UniqueTincture: 5, Invitation: 4,
  ValdoMap: 508, Memory: 0, Coffin: 0, Incubator: 0, Vial: 6, BlightedMap: 16, BlightRavagedMap: 1, UniqueRelic: 12, Wombgift: 15,
  BaseType: 8998
};
const LIVE_POE2 = {
  Currency: 50, Fragments: 26, UncutGems: 42, SoulCores: 52, Idols: 35, Runes: 131, Essences: 67, Expedition: 18, Ultimatum: 0, Vaal: 0,
  // Read since 2026-11-04, at that day's sizes.
  Ritual: 39, Abyss: 15, Breach: 28, Delirium: 26, Verisium: 24, LineageSupportGems: 75
};
const LIVE_DISTINCT_NAMES = { SkillGem: 810, BaseType: 829, ClusterJewel: 400, ForbiddenJewel: 170, UniqueArmour: 450, UniqueWeapon: 270, UniqueAccessory: 185, UniqueJewel: 85 };

const LEAGUES = {
  poe1: [
    { name: 'Mirage', displayName: 'Mirage', url: 'mirage' },
    { name: 'Hardcore Mirage', displayName: 'Hardcore Mirage', url: 'hardcoremirage', hardcore: true },
    { name: 'Standard', displayName: 'Standard', url: 'standard' },
    { name: 'Hardcore', displayName: 'Hardcore', url: 'hardcore', hardcore: true }
  ],
  poe2: [
    { name: 'Fate of the Vaal', displayName: 'Fate of the Vaal', url: 'vaal' },
    { name: 'HC Fate of the Vaal', displayName: 'HC Fate of the Vaal', url: 'vaalhc', hardcore: true },
    { name: 'Standard', displayName: 'Standard', url: 'standard' },
    { name: 'Hardcore', displayName: 'Hardcore', url: 'hardcore', hardcore: true }
  ]
};

function sum(counts) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

// 0..1, the same for the same seed.
function noise(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function chaosValueFor(seed) {
  return Math.round((0.05 + noise(seed) ** 6 * 40000) * 100) / 100;
}

function sparkline(seed) {
  const data = Array.from({ length: 7 }, (_, index) => Math.round((noise(seed + index) - 0.5) * 2000) / 100);
  return { totalChange: data[data.length - 1], data };
}

function iconUrlPath(game, type, index, epoch) {
  return `/gen/image/bench/${game}/${type}/${index}.png${epoch ? `?v=${epoch}` : ''}`;
}

function itemName(type, index) {
  if (type === 'Currency' && index === 0) return 'Divine Orb';
  if (type === 'Currency' && index === 1) return 'Chaos Orb';
  if (type === 'Currency' && index === 2) return 'Mirror of Kalandra';
  return `Bench ${type} ${String(index).padStart(3, '0')}`;
}

// The exchange API: items and lines apart, one divine rate in `core`. A tenth of the rows have no art.
function exchangeResponse(game, type, count, epoch) {
  const items = [];
  const lines = [];
  for (let index = 0; index < count; index += 1) {
    const seed = index * 31 + type.length * 7;
    const id = `${type}-${index}`;
    const name = itemName(type, index);
    let primaryValue = chaosValueFor(seed) / 150;
    if (name === 'Divine Orb') primaryValue = 1;
    if (name === 'Chaos Orb') primaryValue = 1 / 150;
    if (name === 'Mirror of Kalandra') primaryValue = 900;
    items.push({
      id,
      name,
      image: index % 10 === 9 ? undefined : iconUrlPath(game, type, index, epoch),
      category: type,
      detailsId: id.toLowerCase()
    });
    lines.push({
      id,
      primaryValue,
      volumePrimaryValue: Math.round(noise(seed + 3) * 100000),
      maxVolumeCurrency: 'chaos',
      maxVolumeRate: primaryValue * 150,
      sparkline: sparkline(seed)
    });
  }
  return { core: { items: [], rates: { exalted: 400, chaos: 150 }, primary: 'divine', secondary: 'chaos' }, items, lines };
}

// PoE1's stash overview: one heavy line per item.
function itemResponse(game, type, count, epoch, distinctNames = count) {
  const lines = [];
  for (let index = 0; index < count; index += 1) {
    const seed = index * 17 + type.length * 11;
    const chaosValue = chaosValueFor(seed);
    lines.push({
      id: index,
      name: itemName(type, index % distinctNames),
      icon: `https://web.poecdn.com${iconUrlPath(game, type, index, epoch)}`,
      baseType: `Bench Base ${index % 20}`,
      itemClass: 5,
      levelRequired: 60 + (index % 40),
      links: 0,
      chaosValue,
      divineValue: chaosValue / 150,
      exaltedValue: chaosValue / 2,
      count: 20,
      detailsId: `${type}-${index}`.toLowerCase(),
      listingCount: Math.round(noise(seed + 5) * 500),
      sparkline: sparkline(seed),
      lowConfidenceSparkline: sparkline(seed + 1),
      implicitModifiers: [],
      explicitModifiers: [
        { text: '+(20-40) to maximum Life', optional: false },
        { text: '(30-50)% increased Damage', optional: false }
      ],
      flavourText: 'A line of flavour text as long as a real one, more or less.',
      tradeInfo: []
    });
  }
  return { lines };
}

const responseCache = new Map();

// The JSON poe.ninja would send for this request, so each call parses it as a real response is parsed.
// `liveSize` answers with the line counts live poe.ninja sent instead of the 450 and 270 item lists.
function ninjaResponseText(url, params = {}, epoch = 0, liveSize = false) {
  const game = url.includes('/poe2/') ? 'poe2' : 'poe1';
  const type = params.type || '';
  const key = `${game}|${url.split('/').pop()}|${type}|${epoch}|${liveSize}`;
  if (responseCache.has(key)) {
    return responseCache.get(key);
  }

  let payload;
  if (url.endsWith('/data/index-state')) {
    payload = { economyLeagues: LEAGUES[game], oldEconomyLeagues: [] };
  } else if (url.includes('/economy/exchange/')) {
    const counts = game === 'poe2' ? (liveSize ? LIVE_POE2 : POE2) : (liveSize ? LIVE_POE1_EXCHANGE : POE1_EXCHANGE);
    payload = exchangeResponse(game, type, counts[type] || 0, epoch);
  } else if (liveSize) {
    payload = itemResponse(game, type, LIVE_POE1_ITEMS[type] || 0, epoch, LIVE_DISTINCT_NAMES[type]);
  } else {
    payload = itemResponse(game, type, POE1_ITEMS[type] || 0, epoch);
  }
  const text = JSON.stringify(payload);
  responseCache.set(key, text);
  return text;
}

const MAP_NAMES = ['Overgrown Shrine Map', 'Cemetery Map', 'Tower Map', 'Crimson Temple Map', 'City Square Map', 'Dunes Map'];
const FARM_TYPES = [null, 'ritual', 'breach', 'expedition', 'delirium'];
const LOOT_TYPES = ['currency', 'fragment', 'scarab', 'divination_card', 'essence', 'other'];

// Runs 6 minutes apart, newest first, so a day holds up to 240 and the rest is history. 0 to 10 loot lines each.
function createJournal(runs, { now = Date.now(), league = 'Mirage' } = {}) {
  const sessions = [];
  for (let index = 0; index < runs; index += 1) {
    const startedAtMs = now - (index + 1) * 6 * 60 * 1000;
    const durationSec = 120 + (index % 240);
    const startedAt = new Date(startedAtMs).toISOString();
    const endedAt = new Date(startedAtMs + durationSec * 1000).toISOString();
    const id = `bench-session-${index}`;
    const lootEntries = Array.from({ length: index % 11 }, (_, lootIndex) => ({
      id: `${id}-loot-${lootIndex}`,
      sessionId: id,
      itemName: `Bench Currency ${String(lootIndex).padStart(3, '0')}`,
      itemType: LOOT_TYPES[lootIndex % LOOT_TYPES.length],
      quantity: 1 + (lootIndex % 4),
      chaosValue: Math.round(noise(index + lootIndex) * 2000) / 100,
      divineValue: null,
      source: 'ocr',
      createdAt: endedAt,
      updatedAt: endedAt
    }));
    const totalLootChaos = lootEntries.reduce((total, loot) => total + loot.chaosValue * loot.quantity, 0);
    const farmTypeId = FARM_TYPES[index % FARM_TYPES.length];
    sessions.push({
      id,
      mapName: MAP_NAMES[index % MAP_NAMES.length],
      mapTier: 14 + (index % 3),
      mapType: farmTypeId,
      farmTypeId,
      strategyTag: null,
      notes: null,
      league,
      poeVersion: 'poe1',
      costChaos: 10,
      durationSec,
      startedAt,
      endedAt,
      status: 'completed',
      totalLootChaos,
      profitChaos: totalLootChaos - 10,
      createdAt: startedAt,
      updatedAt: endedAt,
      lootEntries
    });
  }
  return { sessions };
}

// The newest 100 map results, the most the store keeps.
function createMapResults(runs, { now = Date.now() } = {}) {
  return Array.from({ length: Math.min(runs, 100) }, (_, index) => {
    const createdAt = new Date(now - (index + 1) * 6 * 60 * 1000).toISOString();
    return {
      id: `bench-result-${index}`,
      localRunId: `bench-session-${index}`,
      mapName: MAP_NAMES[index % MAP_NAMES.length],
      farmType: 'Ritual',
      durationSeconds: 120 + (index % 240),
      netProfit: Math.round(noise(index) * 3000) / 10,
      poeVersion: 'poe1',
      league: 'Mirage',
      createdAt,
      topOutputs: [{ label: 'Divine Orb', quantityDelta: 1, valueDelta: 150 }],
      lootItemCount: index % 11
    };
  });
}

// 500 rows as main hands them to the Currency page, for the 500-row render.
function createPriceRows(count) {
  return Array.from({ length: count }, (_, index) => {
    const seed = index * 13;
    const chaosValue = chaosValueFor(seed);
    return {
      itemName: `Bench Row ${String(index).padStart(3, '0')}`,
      itemType: LOOT_TYPES[index % LOOT_TYPES.length],
      chaosValue,
      divineValue: Math.round((chaosValue / 150) * 1e6) / 1e6,
      iconUrl: index % 10 === 9 ? null : `https://web.poecdn.com${iconUrlPath('poe1', 'Rows', index, 0)}`,
      sparklineData: { data: sparkline(seed).data },
      change: sparkline(seed).totalChange
    };
  });
}

module.exports = {
  POE1_COUNT: sum(POE1_EXCHANGE) + sum(POE1_ITEMS),
  POE2_COUNT: sum(POE2),
  createJournal,
  createMapResults,
  createPriceRows,
  ninjaResponseText
};
