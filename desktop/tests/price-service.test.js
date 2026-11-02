const test = require('node:test');
const assert = require('node:assert/strict');

const PriceService = require('../src/modules/priceService');
const registry = require('../src/modules/currencyRegistry');

test('poe1 price service reads currency types from the exchange API and items from the stash API', async () => {
  const service = new PriceService();
  service.setPoeVersion('poe1');
  const calls = [];
  service.client.get = async (url, options = {}) => {
    calls.push({ url, params: options.params });
    if (url.endsWith('/data/index-state')) {
      return { data: { economyLeagues: [{ name: 'Mirage', url: 'mirage' }], oldEconomyLeagues: [] } };
    }
    return { data: { lines: [] } };
  };

  await service._fetchCurrencyOverview('Mirage', 'Currency');
  await service._fetchItemOverview('Mirage', 'Map');
  await service._fetchCurrencyOverview('Private League (PL1)', 'Currency');

  assert.deepEqual(calls, [
    { url: 'https://poe.ninja/poe1/api/data/index-state', params: undefined },
    {
      url: 'https://poe.ninja/poe1/api/economy/exchange/mirage/overview',
      params: { league: 'Mirage', type: 'Currency' }
    },
    {
      url: 'https://poe.ninja/poe1/api/economy/stash/current/item/overview',
      params: { league: 'Mirage', type: 'Map' }
    },
    {
      url: 'https://poe.ninja/poe1/api/economy/stash/current/currency/overview',
      params: { league: 'Private League (PL1)', type: 'Currency' }
    }
  ]);
});

test('poe2 price service fails for a league poe.ninja does not list without naming it', async () => {
  const service = new PriceService();
  service.setPoeVersion('poe2');
  service.client.get = async () => ({ data: { economyLeagues: [{ name: 'Rise of the Abyssal', url: 'abyss' }] } });

  // The error log keeps this message, and a private league is named by its owner.
  await assert.rejects(service._fetchCurrencyOverview('Fb52 Juice Party (PL12345)', 'Currency'), {
    message: 'Unknown PoE2 league'
  });
});

test('poe1 exchange data is indexed with chaos and divine values', () => {
  const service = new PriceService();
  service.setPoeVersion('poe1');

  service._indexCurrencyData({
    core: { primary: 'chaos', rates: { divine: 1 / 300 } },
    items: [
      { id: 'divine', name: 'Divine Orb', image: '/divine.png' },
      { id: 'mirror', name: 'Mirror of Kalandra', image: '/mirror.png' }
    ],
    lines: [
      { id: 'divine', primaryValue: 300, sparkline: { data: [1, 2] } },
      { id: 'mirror', primaryValue: 360000 }
    ]
  }, 'Currency');

  assert.equal(service.getPriceInfo('Divine Orb').chaosValue, 300);
  assert.equal(service.getPriceInfo('Mirror of Kalandra').divineValue, 1200);
  assert.equal(service.getPriceInfo('Mirror of Kalandra').icon, 'https://web.poecdn.com/mirror.png');
});

test('poe1 currency indexing derives stable divine values from the current Divine Orb rate', () => {
  const service = new PriceService();
  service.setPoeVersion('poe1');

  service._indexCurrencyData({
    lines: [
      {
        currencyTypeName: 'Mirror of Kalandra',
        chaosEquivalent: 357456,
        receiveSparkLine: { data: [1, 2, 3] }
      },
      {
        currencyTypeName: 'Divine Orb',
        chaosEquivalent: 317.1
      },
      {
        currencyTypeName: 'Broken Rate',
        chaosEquivalent: 'not-a-number'
      }
    ],
    currencyDetails: [
      {
        name: 'Mirror of Kalandra',
        icon: 'https://web.poecdn.com/mirror.png',
        tradeId: 'mirror'
      }
    ]
  }, 'Currency');

  const mirror = service.getPriceInfo('Mirror of Kalandra');
  const divine = service.getPriceInfo('Divine Orb');
  const broken = service.getPriceInfo('Broken Rate');

  assert.equal(mirror.chaosValue, 357456);
  assert.equal(mirror.divineValue, 1127.265847);
  assert.equal(mirror.icon, 'https://web.poecdn.com/mirror.png');
  assert.deepEqual(mirror.sparkline, [1, 2, 3]);
  assert.equal(divine.chaosValue, 317.1);
  assert.equal(divine.divineValue, 1);
  assert.equal(broken.chaosValue, 0);
  assert.equal(broken.divineValue, null);
});

test('priceItems tolerates malformed snapshot items without producing invalid totals', () => {
  const service = new PriceService();
  service.setPoeVersion('poe1');

  service._indexCurrencyData({
    lines: [
      {
        currencyTypeName: 'Divine Orb',
        chaosEquivalent: 120
      }
    ]
  }, 'Currency');

  const result = service.priceItems([
    { quantity: 2 },
    { baseType: 'Unknown Drop', quantity: 1 }
  ]);

  assert.equal(service.getChaosValue(null), 0);
  assert.equal(result.totalChaos, 0);
  assert.equal(result.totalDivine, 0);
  assert.equal(result.divinePrice, 120);
  assert.equal(result.pricedCount, 0);
  assert.equal(result.unpricedCount, 2);
  assert.ok(result.items.every(item => Number.isFinite(item.chaosValue)));
  assert.ok(result.items.every(item => Number.isFinite(item.totalChaosValue)));
  assert.ok(result.items.every(item => Number.isFinite(item.divineValue)));
  assert.ok(result.items.every(item => Number.isFinite(item.totalDivineValue)));
});

test('poe1 price registry fetches exchange-like farm loot through currency overview types', () => {
  registry.setPoeVersion('poe1');

  assert.equal(registry.getCurrencyTypes().includes('Scarab'), true);
  assert.equal(registry.getCurrencyTypes().includes('Essence'), true);
  assert.equal(registry.getCurrencyTypes().includes('DeliriumOrb'), true);
  assert.equal(registry.getCurrencyTypes().includes('AllflameEmber'), true);
  assert.equal(registry.getItemTypes().includes('Scarab'), false);
  assert.equal(registry.getItemTypes().includes('Essence'), false);
  assert.equal(registry.getItemTypes().includes('DeliriumOrb'), false);
  assert.equal(registry.getItemTypes().includes('AllflameEmber'), false);
});

test('ensureSynced syncs a league once, again only when forced, and one sync at a time', async () => {
  const service = new PriceService();
  const syncs = [];
  let running = 0;
  service.syncPrices = async (league, { full }) => {
    running += 1;
    assert.equal(running, 1);
    syncs.push([service.poeVersion, league, full]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    service.priceMap.set('divine orb', { name: 'Divine Orb', chaosValue: 150 });
    service.league = league;
    service.fullySynced = full;
    running -= 1;
    return { itemCount: service.priceMap.size };
  };

  await Promise.all([
    service.ensureSynced('Mirage', 'poe1'),
    service.ensureSynced('Mirage', 'poe1'),
    service.ensureSynced('Rise of the Abyssal', 'poe2')
  ]);
  await service.ensureSynced('Rise of the Abyssal', 'poe2');
  await service.ensureSynced('Rise of the Abyssal', 'poe2', { full: true });
  const status = await service.ensureSynced('Rise of the Abyssal', 'poe2', { full: true, force: true });

  assert.deepEqual(syncs, [
    ['poe1', 'Mirage', false],
    ['poe2', 'Rise of the Abyssal', false],
    ['poe2', 'Rise of the Abyssal', true],
    ['poe2', 'Rise of the Abyssal', true]
  ]);
  assert.equal(status.league, 'Rise of the Abyssal');
  assert.equal(status.poeVersion, 'poe2');
});

// A PoE2 price service whose second overview fetch waits until the test releases it.
function createPausedSync() {
  const service = new PriceService();
  service.setPoeVersion('poe2');
  let reachPause;
  let release;
  const reached = new Promise((resolve) => { reachPause = resolve; });
  const paused = new Promise((resolve) => { release = resolve; });
  let fetches = 0;
  service._fetchCurrencyOverview = async (league, type) => {
    fetches += 1;
    if (fetches === 2) {
      reachPause();
      await paused;
    }
    if (type === 'Currency') {
      return { lines: [{ currencyTypeName: 'Divine Orb', chaosEquivalent: 120 }] };
    }
    if (type === 'Fragments') {
      return { lines: [{ currencyTypeName: 'Breach Splinter', chaosEquivalent: 0.5 }] };
    }
    return { lines: [] };
  };
  return { service, reached, release };
}

test('a forced re-sync keeps the last complete price list readable until the new one is complete', async () => {
  const { service, reached, release } = createPausedSync();
  service._addPrice('Divine Orb', { chaosValue: 100, category: 'currency' });
  service._addPrice('Breach Splinter', { chaosValue: 0.4, category: 'fragments' });
  service.league = 'Rise of the Abyssal';

  const sync = service.ensureSynced('Rise of the Abyssal', 'poe2', { full: true, force: true });
  await reached;

  // The Currency overview is already fetched, but readers still see the previous complete list.
  assert.equal(service.getChaosValue('Divine Orb'), 100);
  assert.equal(service.getChaosValue('Breach Splinter'), 0.4);
  assert.equal(service.getStatus().itemCount, 2);

  release();
  const status = await sync;

  assert.equal(service.getChaosValue('Divine Orb'), 120);
  assert.equal(service.getChaosValue('Breach Splinter'), 0.5);
  assert.equal(status.itemCount, 2);
  assert.equal(status.league, 'Rise of the Abyssal');
});

test('a sync for the other game does not leave the old game prices readable as the new game prices', async () => {
  const { service, reached, release } = createPausedSync();
  service.setPoeVersion('poe1');
  service._addPrice('Divine Orb', { chaosValue: 300, category: 'currency' });
  service.league = 'Standard';

  const sync = service.ensureSynced('Standard', 'poe2');
  await reached;

  assert.equal(service.poeVersion, 'poe2');
  assert.equal(service.getChaosValue('Divine Orb'), 0);
  assert.equal(service.getStatus().itemCount, 0);

  release();
  await sync;

  assert.equal(service.getChaosValue('Divine Orb'), 120);
});

test('a sync for another league of the same game does not leave the old league prices readable', async () => {
  const { service, reached, release } = createPausedSync();
  service._addPrice('Divine Orb', { chaosValue: 300, category: 'currency' });
  service.league = 'Standard';

  const sync = service.ensureSynced('Rise of the Abyssal', 'poe2');
  await reached;

  assert.equal(service.getChaosValue('Divine Orb'), 0);
  assert.equal(service.getStatus().itemCount, 0);

  release();
  const status = await sync;

  assert.equal(service.getChaosValue('Divine Orb'), 120);
  assert.equal(status.league, 'Rise of the Abyssal');
});

test('a sync running when the detected game changes does not swap in the old game prices', async () => {
  const { service, reached, release } = createPausedSync();

  const sync = service.ensureSynced('Rise of the Abyssal', 'poe2');
  await reached;
  // What main's applyGameVersion does when GameDetector reports the other game.
  service.setPoeVersion('poe1');
  service.clearCache();
  release();
  const status = await sync;

  assert.equal(status.itemCount, 0);
  assert.equal(status.league, null);
  assert.equal(service.getStatus().itemCount, 0);
  assert.equal(service.getChaosValue('Divine Orb'), 0);
});

test('queryPrices returns the Currency page shape filtered by item type and name', () => {
  const service = new PriceService();
  service._addPrice('Divine Orb', { chaosValue: 150, divineValue: 1, category: 'currency', icon: 'divine.png', sparkline: [1, 2] });
  service._addPrice('Chaos Orb', { chaosValue: 1, divineValue: 0.006, category: 'currency', icon: null, sparkline: [] });
  service._addPrice('Mageblood', { chaosValue: 30000, divineValue: 200, category: 'uniqueaccessory', icon: 'mb.png' });
  service._addPrice('Strange Thing', { chaosValue: 3, category: 'wombgift' });

  assert.deepEqual(service.queryPrices({ type: 'currency' }).prices.map((price) => price.itemName), ['Divine Orb', 'Chaos Orb']);
  assert.deepEqual(service.queryPrices({ search: 'MAGE' }).prices, [{
    itemName: 'Mageblood',
    itemType: 'unique',
    chaosValue: 30000,
    divineValue: 200,
    iconUrl: 'mb.png',
    sparklineData: { data: [] },
    change: null
  }]);
  assert.equal(service.queryPrices({ type: 'other' }).prices[0].itemName, 'Strange Thing');
  assert.deepEqual(service.queryPrices({ limit: '2' }).prices.map((price) => price.itemName), ['Mageblood', 'Divine Orb']);
});

test('queryPrices counts matches before the limit and prices per item type over the whole list', () => {
  const service = new PriceService();
  service._addPrice('Divine Orb', { chaosValue: 150, category: 'currency' });
  service._addPrice('Chaos Orb', { chaosValue: 1, category: 'currency' });
  service._addPrice('The Doctor', { chaosValue: 900, category: 'divinationcard' });
  service._addPrice('Mageblood', { chaosValue: 30000, category: 'uniqueaccessory' });
  service.syncedTypes = new Set(['currency', 'divination_card', 'unique']);

  const result = service.queryPrices({ type: 'currency', search: 'orb', limit: '1' });
  assert.deepEqual(result.prices.map((price) => price.itemName), ['Divine Orb']);
  assert.equal(result.total, 2);
  // The rail counts every listed price, whatever the type filter and search.
  assert.deepEqual({ ...result.typeCounts }, { currency: 2, divination_card: 1, unique: 1 });
  assert.deepEqual([...result.syncedTypes], ['currency', 'divination_card', 'unique']);
});

test('the 7-day change and series come from both poe.ninja spellings and keep missing days', () => {
  const service = new PriceService();
  service.setPoeVersion('poe1');

  // PoE1 stash item overviews name the series sparkLine; missing days stay null instead of reading as 0%.
  service._indexItemData({
    lines: [{ name: 'Headhunter', chaosValue: 9000, sparkLine: { totalChange: -25.47, data: [null, 0, null, -9.18, -25.47] } }]
  }, 'UniqueAccessory');
  service._indexCurrencyData({
    core: { primary: 'chaos', rates: {} },
    items: [{ id: 'mirror', name: 'Mirror of Kalandra' }],
    lines: [{ id: 'mirror', primaryValue: 90000, sparkline: { totalChange: 12.4, data: [0, 5, 12.4] } }]
  }, 'Currency');

  assert.deepEqual(service.getPriceInfo('Headhunter').sparkline, [null, 0, null, -9.18, -25.47]);
  assert.equal(service.getPriceInfo('Headhunter').change, -25.47);
  assert.equal(service.getPriceInfo('Mirror of Kalandra').change, 12.4);
  assert.equal(service.queryPrices({ search: 'mirror' }).prices[0].change, 12.4);
});

test('PoE1 catalysts from the Currency overview list as catalysts', () => {
  const service = new PriceService();
  service.setPoeVersion('poe1');

  service._indexCurrencyData({
    core: { primary: 'chaos', rates: {} },
    items: [
      { id: 'prismatic', name: 'Prismatic Catalyst', category: 'Catalysts' },
      { id: 'chaos', name: 'Chaos Orb', category: 'Currency' }
    ],
    lines: [{ id: 'prismatic', primaryValue: 2 }, { id: 'chaos', primaryValue: 1 }]
  }, 'Currency');

  assert.deepEqual(service.queryPrices({ type: 'catalyst' }).prices.map((price) => price.itemName), ['Prismatic Catalyst']);
  assert.deepEqual(service.queryPrices({ type: 'currency' }).prices.map((price) => price.itemName), ['Chaos Orb']);
  // Stash items read their category from the registry, so a synced catalyst groups as the name-based guess does.
  assert.equal(registry.getCategory('Prismatic Catalyst'), 'catalyst');
  assert.equal(registry.getCategory('Unregistered Test Catalyst'), 'catalyst');
  assert.equal(registry.getCategory('Chaos Orb'), 'currency');
});

test('PoE2 Vaal items from the Currency overview list as Vaal, and soul cores stay soul cores', () => {
  const service = new PriceService();
  service.setPoeVersion('poe2');
  const overview = (id, name, category) => ({
    core: { primary: 'chaos', rates: {} },
    items: [{ id, name, category }],
    lines: [{ id, primaryValue: 2 }]
  });

  service._indexCurrencyData(overview('infuser', 'Ancient Infuser', 'Vaal'), 'Currency');
  service._indexCurrencyData(overview('exalted', 'Exalted Orb', 'Currency'), 'Currency');
  service._indexCurrencyData(overview('core', 'Soul Core of Tacati', 'Vaal'), 'SoulCores');

  assert.deepEqual(service.queryPrices({ type: 'vaal' }).prices.map((price) => price.itemName), ['Ancient Infuser']);
  assert.deepEqual(service.queryPrices({ type: 'currency' }).prices.map((price) => price.itemName), ['Exalted Orb']);
  assert.deepEqual(service.queryPrices({ type: 'soul_core' }).prices.map((price) => price.itemName), ['Soul Core of Tacati']);
  // Stash items read their category from the registry, which has these as Vaal before a sync too.
  assert.equal(registry.getCategory('Ancient Infuser'), 'vaal');
});

test('a PoE1 item tagged Vaal in the Currency overview stays currency', () => {
  const service = new PriceService();
  service.setPoeVersion('poe1');
  service._indexCurrencyData({
    core: { primary: 'chaos', rates: {} },
    items: [{ id: 'vaal-orb', name: 'Vaal Orb', category: 'Vaal' }],
    lines: [{ id: 'vaal-orb', primaryValue: 2 }]
  }, 'Currency');

  assert.deepEqual(service.queryPrices({ type: 'currency' }).prices.map((price) => price.itemName), ['Vaal Orb']);
  assert.equal(service.queryPrices({ type: 'vaal' }).prices.length, 0);
});

test('a sync records the item types it read, and PoE2 idols come from the Idols overview', async () => {
  const service = new PriceService();
  service.setPoeVersion('poe2');
  const types = [];
  service._fetchCurrencyOverview = async (league, type) => {
    types.push(type);
    if (type === 'Ultimatum') throw new Error('poe.ninja is down');
    return type === 'Idols'
      ? { core: { primary: 'chaos', rates: {} }, items: [{ id: 'cat', name: 'Cat Idol' }], lines: [{ id: 'cat', primaryValue: 3 }] }
      : { lines: [], items: [] };
  };

  await service.syncPrices('Standard', { full: false });

  assert.ok(types.includes('Idols'));
  assert.ok(!types.includes('Idol'));
  assert.deepEqual(service.queryPrices({ type: 'idol' }).prices.map((price) => price.itemName), ['Cat Idol']);
  const synced = service.queryPrices().syncedTypes;
  assert.ok(synced.includes('idol'));
  assert.ok(synced.includes('expedition'));
  // A type whose overview failed was not read, so its empty tab can still be synced.
  assert.ok(!synced.includes('ultimatum'));
});

test('getLeagues reads poe.ninja index state for each game', async () => {
  const service = new PriceService();
  const urls = [];
  service.client.get = async (url) => {
    urls.push(url);
    return {
      data: {
        economyLeagues: [{ name: 'Mirage', displayName: 'Mirage', hardcore: false }],
        oldEconomyLeagues: [{ name: 'Settlers', hardcore: true }]
      }
    };
  };

  const leagues = await service.getLeagues('poe1');
  await service.getLeagues('poe1');

  assert.deepEqual(leagues, [
    { name: 'Mirage', displayName: 'Mirage', active: true, hardcore: false },
    { name: 'Settlers', displayName: 'Settlers', active: false, hardcore: true }
  ]);
  assert.deepEqual(urls, ['https://poe.ninja/poe1/api/data/index-state']);
});

// A quick PoE1 sync over a poe.ninja stub, with the pacing sleep counted instead of waited for.
function loadPacedSync(t, { failType = null } = {}) {
  const service = new PriceService();
  service.setPoeVersion('poe1');
  const requests = [];
  const sleeps = [];
  service.client.get = async (url, options = {}) => {
    if (url.endsWith('/data/index-state')) {
      return { data: { economyLeagues: [{ name: 'Mirage', url: 'mirage' }], oldEconomyLeagues: [] } };
    }
    requests.push(options.params.type);
    if (options.params.type === failType) throw new Error('poe.ninja is down');
    return { data: { core: { primary: 'chaos', rates: {} }, items: [{ id: options.params.type, name: `${options.params.type} Item` }], lines: [{ id: options.params.type, primaryValue: 2, name: `${options.params.type} Item`, chaosValue: 2 }] } };
  };
  const realSetTimeout = global.setTimeout;
  t.mock.method(global, 'setTimeout', (callback, delay, ...args) => {
    if (delay === 300) {
      sleeps.push(delay);
      return realSetTimeout(callback, 0);
    }
    return realSetTimeout(callback, delay, ...args);
  });
  return { service, requests, sleeps };
}

test('a sync sleeps after each item overview it requested and not after one from the cache', async (t) => {
  const { service, requests, sleeps } = loadPacedSync(t);

  await service.syncPrices('Mirage', { full: false });
  const itemTypes = registry.getQuickSyncTypes().filter((type) => !registry.getCurrencyTypes().includes(type));
  assert.ok(itemTypes.length > 0);
  assert.equal(sleeps.length, itemTypes.length);
  const requestCount = requests.length;

  await service.syncPrices('Mirage', { full: false });
  assert.equal(requests.length, requestCount);
  assert.equal(sleeps.length, itemTypes.length);
  // The list is the same, read again from the overviews.
  assert.ok(service.priceMap.size > 0);

  // Past the cache's time the requests and their pacing come back.
  for (const entry of service.cache.values()) entry.fetchedAt -= 11 * 60 * 1000;
  await service.syncPrices('Mirage', { full: false });
  assert.equal(sleeps.length, itemTypes.length * 2);
  assert.ok(requests.length > requestCount);
});

test('a failed item overview keeps its pacing, because it did send a request', async (t) => {
  const failType = registry.getQuickSyncTypes().filter((type) => !registry.getCurrencyTypes().includes(type))[0];
  const { service, sleeps } = loadPacedSync(t, { failType });
  await service.syncPrices('Mirage', { full: false });
  assert.ok(sleeps.length >= 1);
});

test('only a sync that read every type offers its list to keep', async (t) => {
  const complete = loadPacedSync(t);
  const kept = [];
  complete.service.onSynced = (snapshot) => kept.push(snapshot);
  await complete.service.syncPrices('Mirage', { full: false });

  assert.equal(kept.length, 1);
  assert.equal(kept[0].poeVersion, 'poe1');
  assert.equal(kept[0].league, 'Mirage');
  assert.equal(kept[0].syncedAt, complete.service.lastFullSync);
  assert.equal(kept[0].full, false);
  assert.equal(kept[0].entries.length, complete.service.priceMap.size);
  assert.deepEqual(kept[0].syncedTypes, complete.service.queryPrices().syncedTypes);
  // Only what the page reads.
  assert.deepEqual(Object.keys(kept[0].entries[0]).sort(), ['category', 'change', 'chaosValue', 'divineValue', 'icon', 'name', 'sparkline']);
  // It lists the same as the live list.
  const live = complete.service.queryPrices({ limit: '500' });
  const fromKept = PriceService.querySnapshot(kept[0], { limit: '500' });
  assert.deepEqual(fromKept.prices, live.prices);
  assert.deepEqual(fromKept.typeCounts, live.typeCounts);
  assert.equal(fromKept.total, live.total);

  const failType = registry.getQuickSyncTypes().filter((type) => !registry.getCurrencyTypes().includes(type))[0];
  const partial = loadPacedSync(t, { failType });
  const partialKept = [];
  partial.service.onSynced = (snapshot) => partialKept.push(snapshot);
  await partial.service.syncPrices('Mirage', { full: false });
  assert.deepEqual(partialKept, []);

  // A game switch clearing the list during the sync: its prices belong to the old game.
  const cleared = loadPacedSync(t);
  const clearedKept = [];
  cleared.service.onSynced = (snapshot) => clearedKept.push(snapshot);
  const sync = cleared.service.syncPrices('Mirage', { full: false });
  cleared.service.clearCache();
  await sync;
  assert.deepEqual(clearedKept, []);

  const full = loadPacedSync(t);
  const fullKept = [];
  full.service.onSynced = (snapshot) => fullKept.push(snapshot);
  await full.service.syncPrices('Mirage', { full: true });
  assert.equal(fullKept[0].full, true);

  // A reply without its lines counts as not read, for a currency type and for an item type alike.
  const itemType = registry.getQuickSyncTypes().filter((type) => !registry.getCurrencyTypes().includes(type))[0];
  for (const emptyType of [registry.getCurrencyTypes()[0], itemType]) {
    const degraded = loadPacedSync(t);
    const degradedKept = [];
    degraded.service.onSynced = (snapshot) => degradedKept.push(snapshot);
    const get = degraded.service.client.get;
    degraded.service.client.get = async (url, options = {}) => (options.params?.type === emptyType ? { data: {} } : get(url, options));
    await degraded.service.syncPrices('Mirage', { full: false });
    assert.deepEqual(degradedKept, [], emptyType);
    assert.ok(degraded.service.priceMap.size > 0);
  }
});

test('a kept list reads its Divine and Mirror prices from itself', () => {
  const snapshot = {
    syncedTypes: ['currency'],
    entries: [
      { name: 'Divine Orb', chaosValue: 150, divineValue: 1, category: 'currency', icon: null, sparkline: [], change: null },
      { name: 'Chaos Orb', chaosValue: 1, divineValue: 0.006, category: 'currency', icon: null, sparkline: [], change: 2 }
    ]
  };
  const listed = PriceService.querySnapshot(snapshot, { search: 'chaos' });
  assert.deepEqual(listed.prices.map((price) => price.itemName), ['Chaos Orb']);
  assert.equal(listed.total, 1);
  assert.deepEqual(listed.typeCounts, { currency: 2 });
  assert.deepEqual(listed.rates, { divineChaos: 150, mirrorChaos: null });
});

test('price service keeps art on the game CDN and drops the rest', () => {
  const service = new PriceService();
  service.setPoeVersion('poe2');
  const exchange = (image) => {
    const prices = new Map();
    service._indexCurrencyData({
      core: { primary: 'chaos', rates: {} },
      items: [{ id: 'a', name: 'Icon Orb', image }],
      lines: [{ id: 'a', primaryValue: 1 }]
    }, 'Currency', prices);
    return prices.get('icon orb')?.icon;
  };

  assert.equal(exchange('/gen/image/a.png'), 'https://web.poecdn.com/gen/image/a.png');
  assert.equal(exchange(undefined), null);
  assert.equal(exchange('.evil.example/x.png'), 'https://web.poecdn.com/.evil.example/x.png');
  assert.equal(exchange('//evil.example/x.png'), null);
  assert.equal(exchange('https://tracker.example/x.png'), null);

  service.setPoeVersion('poe1');
  const items = new Map();
  service._indexItemData({
    lines: [
      { name: 'Cdn Item', chaosValue: 1, icon: 'https://web.poecdn.com/gen/image/b.png' },
      { name: 'Tracker Item', chaosValue: 1, icon: 'https://tracker.example/x.png' }
    ]
  }, 'UniqueWeapon', items);
  assert.equal(items.get('cdn item').icon, 'https://web.poecdn.com/gen/image/b.png');
  assert.equal(items.get('tracker item').icon, null);

  const currency = new Map();
  service._indexCurrencyData({
    lines: [{ currencyTypeName: 'Tracker Orb', chaosEquivalent: 1, icon: 'https://tracker.example/x.png' }]
  }, 'Currency', currency);
  assert.equal(currency.get('tracker orb').icon, null);
});

test('a price sync past its deadline stops reading, and the list does not count as complete', async (t) => {
  const service = new PriceService();
  service.setPoeVersion('poe1');
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const realSetTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback) => realSetTimeout(callback, 0));
  t.mock.method(console, 'error', () => {});

  let requests = 0;
  service.client.get = async (url) => {
    if (url.endsWith('/data/index-state')) {
      return { data: { economyLeagues: [{ name: 'Mirage', url: 'mirage' }], oldEconomyLeagues: [] } };
    }
    requests += 1;
    now += 6 * 60 * 1000;
    return { data: { lines: [] } };
  };

  await service.ensureSynced('Mirage', 'poe1', { full: true });
  assert.equal(requests, 1);
  assert.equal(service.league, 'Mirage');
  assert.equal(service.fullySynced, false);

  const stuckAfter = requests;
  service.client.get = async () => {
    requests += 1;
    return { data: { lines: [] } };
  };
  await service.ensureSynced('Mirage', 'poe1', { full: true });
  assert.ok(requests > stuckAfter);
  assert.equal(service.fullySynced, true);
});

test('a price sync past its deadline does not offer its partial list to keep', async (t) => {
  const service = new PriceService();
  service.setPoeVersion('poe1');
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const realSetTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback) => realSetTimeout(callback, 0));
  const kept = [];
  service.onSynced = (snapshot) => kept.push(snapshot);
  service.client.get = async () => {
    now += 6 * 60 * 1000;
    return { data: { lines: [{ currencyTypeName: 'Chaos Orb', chaosEquivalent: 1 }] } };
  };

  await service.syncPrices('Mirage', { full: false });
  assert.ok(service.priceMap.size > 0);
  assert.deepEqual(kept, []);
});
