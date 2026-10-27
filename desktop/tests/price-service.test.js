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
        icon: 'https://example.test/mirror.png',
        tradeId: 'mirror'
      }
    ]
  }, 'Currency');

  const mirror = service.getPriceInfo('Mirror of Kalandra');
  const divine = service.getPriceInfo('Divine Orb');
  const broken = service.getPriceInfo('Broken Rate');

  assert.equal(mirror.chaosValue, 357456);
  assert.equal(mirror.divineValue, 1127.265847);
  assert.equal(mirror.icon, 'https://example.test/mirror.png');
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

test('listPrices returns the Currency page shape filtered by item type and name', () => {
  const service = new PriceService();
  service._addPrice('Divine Orb', { chaosValue: 150, divineValue: 1, category: 'currency', icon: 'divine.png', sparkline: [1, 2] });
  service._addPrice('Chaos Orb', { chaosValue: 1, divineValue: 0.006, category: 'currency', icon: null, sparkline: [] });
  service._addPrice('Mageblood', { chaosValue: 30000, divineValue: 200, category: 'uniqueaccessory', icon: 'mb.png' });
  service._addPrice('Strange Thing', { chaosValue: 3, category: 'wombgift' });

  assert.deepEqual(service.listPrices({ type: 'currency' }).map((price) => price.itemName), ['Divine Orb', 'Chaos Orb']);
  assert.deepEqual(service.listPrices({ search: 'MAGE' }), [{
    itemName: 'Mageblood',
    itemType: 'unique',
    chaosValue: 30000,
    divineValue: 200,
    iconUrl: 'mb.png',
    sparklineData: { data: [] }
  }]);
  assert.equal(service.listPrices({ type: 'other' })[0].itemName, 'Strange Thing');
  assert.deepEqual(service.listPrices({ limit: '2' }).map((price) => price.itemName), ['Mageblood', 'Divine Orb']);
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
