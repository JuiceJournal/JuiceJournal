const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const registry = require('../src/modules/currencyRegistry');
const PriceService = require('../src/modules/priceService');

const published = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'price-types.json'), 'utf8'));

function builtIn(game) {
  registry.remoteTypes = {};
  registry.setPoeVersion(game);
  return { exchange: [...registry.getCurrencyTypes()], stash: [...registry.getItemTypes()] };
}

test.afterEach(() => {
  registry.remoteTypes = {};
  registry.setPoeVersion('poe1');
});

test('the published type list is the list the app carries, so a fresh install and a running app read the same', () => {
  assert.equal(published.version, 1);
  assert.match(published.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(published.poe1, builtIn('poe1'));
  assert.deepEqual(published.poe2, builtIn('poe2'));
  assert.ok(registry.setRemoteTypes(published));
});

test('Path of Exile 1 reads the types of the Covens league and no longer asks for coffins', () => {
  const { exchange, stash } = builtIn('poe1');
  for (const type of ['Thread', 'Astrolabe', 'Ducat', 'EnshroudingCrystal']) assert.ok(exchange.includes(type), type);
  for (const type of ['Corpse', 'Viscera', 'ImbuedGem', 'IncursionTemple', 'ScryingOrb', 'Flask']) assert.ok(stash.includes(type), type);
  assert.ok(!stash.includes('Coffin'));
});

test('a published list adds types to the ones the app carries and takes none away', () => {
  const own = { poe1: builtIn('poe1'), poe2: builtIn('poe2') };
  // The list lost Fragment, repeats a type, and names a stash type of the app (Map) as an exchange type.
  const taken = registry.setRemoteTypes({
    poe1: { exchange: ['Currency', 'NewLeagueThing', 'NewLeagueThing', 'Map'], stash: ['NewStashThing', 'Thread'] },
    poe2: { exchange: ['NewMechanic'], stash: ['PrecursorTablets'] }
  });
  assert.equal(taken, true);

  registry.setPoeVersion('poe1');
  assert.deepEqual(registry.getCurrencyTypes(), [...own.poe1.exchange, 'NewLeagueThing']);
  // Each type keeps the overview the app reads it from.
  assert.deepEqual(registry.getItemTypes(), [...own.poe1.stash, 'NewStashThing']);
  registry.setPoeVersion('poe2');
  assert.deepEqual(registry.getCurrencyTypes(), [...own.poe2.exchange, 'NewMechanic']);
  // Path of Exile 2 item overviews stay unread.
  assert.deepEqual(registry.getItemTypes(), []);
});

test('a list that is not plain type names is not taken, game by game', () => {
  const before = builtIn('poe1');
  const junk = [
    null, 'text', [], {}, { poe1: {} },
    { poe1: { exchange: [], stash: [] } },
    { poe1: { exchange: ['Currency'], stash: 'UniqueMap' } },
    { poe1: { exchange: ['Currency', 'a&league=x'], stash: [] } },
    { poe1: { exchange: ['Currency', 7], stash: [] } },
    { poe1: { exchange: ['../etc'], stash: [] } },
    { poe1: { exchange: Array.from({ length: 121 }, (_, i) => `Type${i}`), stash: [] } }
  ];
  for (const list of junk) {
    assert.equal(registry.setRemoteTypes(list), false, JSON.stringify(list)?.slice(0, 60));
  }
  registry.setPoeVersion('poe1');
  assert.deepEqual([...registry.getCurrencyTypes()], before.exchange);

  // One game's list can be wrong without the other's being lost.
  assert.equal(registry.setRemoteTypes({ poe1: { exchange: ['bad type'], stash: [] }, poe2: { exchange: ['NewMechanic'], stash: [] } }), true);
  assert.deepEqual([...registry.getCurrencyTypes()], before.exchange);
  registry.setPoeVersion('poe2');
  assert.ok(registry.getCurrencyTypes().includes('NewMechanic'));
});

test('the list is asked for only once the app turns it on, and then at most once in six hours', async (t) => {
  const service = new PriceService();
  service.setPoeVersion('poe1');
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(console, 'warn', () => {});
  const asked = [];
  service.client.get = async (url, options) => {
    asked.push([url, options.maxRedirects]);
    return { data: { poe1: { exchange: ['NextLeagueThing'], stash: ['Map'] } } };
  };

  await service.refreshTypeList();
  assert.deepEqual(asked, []);

  service.readsTypeList = true;
  await service.refreshTypeList();
  await service.refreshTypeList();
  assert.deepEqual(asked, [['https://juicejournal.github.io/JuiceJournal/price-types.json', 0]]);
  assert.ok(registry.getCurrencyTypes().includes('NextLeagueThing'));

  // Six hours on it asks again; an answer that fails or is not a list leaves the types as they are.
  now += 6 * 60 * 60 * 1000;
  service.client.get = async () => { throw new Error('offline'); };
  await service.refreshTypeList();
  now += 6 * 60 * 60 * 1000;
  service.client.get = async () => ({ data: '<html>not found</html>' });
  await service.refreshTypeList();
  assert.ok(registry.getCurrencyTypes().includes('NextLeagueThing'));
  assert.ok(registry.getCurrencyTypes().includes('Currency'));
});

test('a game switch while the list is being read still marks the sync as stale', async () => {
  const service = new PriceService();
  service.setPoeVersion('poe1');
  service.readsTypeList = true;
  let release;
  const asked = [];
  service.client.get = async (url) => {
    asked.push(url);
    if (url.endsWith('price-types.json')) {
      await new Promise((resolve) => { release = resolve; });
      return { data: {} };
    }
    return { data: { economyLeagues: [], oldEconomyLeagues: [], lines: [] } };
  };
  const kept = [];
  service.onSynced = (snapshot) => kept.push(snapshot);

  const sync = service.syncPrices('Covens', { full: false });
  await new Promise((resolve) => setImmediate(resolve));
  service.clearCache();
  release();
  await sync;

  assert.deepEqual(kept, []);
  assert.equal(service.priceMap.size, 0);
});
