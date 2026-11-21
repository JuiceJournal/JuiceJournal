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

test('a published list replaces the types of its game, and Path of Exile 2 item overviews stay unread', () => {
  const taken = registry.setRemoteTypes({
    poe1: { exchange: ['Currency', 'NewLeagueThing', 'Currency'], stash: ['UniqueMap'] },
    poe2: { exchange: ['Currency', 'NewMechanic'], stash: ['PrecursorTablets'] }
  });
  assert.equal(taken, true);

  registry.setPoeVersion('poe1');
  assert.deepEqual(registry.getCurrencyTypes(), ['Currency', 'NewLeagueThing']);
  assert.deepEqual(registry.getItemTypes(), ['UniqueMap']);
  registry.setPoeVersion('poe2');
  assert.deepEqual(registry.getCurrencyTypes(), ['Currency', 'NewMechanic']);
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
  assert.equal(registry.setRemoteTypes({ poe1: { exchange: ['bad type'], stash: [] }, poe2: { exchange: ['Currency'], stash: [] } }), true);
  assert.deepEqual([...registry.getCurrencyTypes()], before.exchange);
  registry.setPoeVersion('poe2');
  assert.deepEqual(registry.getCurrencyTypes(), ['Currency']);
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
    return { data: { poe1: { exchange: ['Currency', 'Thread'], stash: ['Map'] } } };
  };

  await service.refreshTypeList();
  assert.deepEqual(asked, []);

  service.readsTypeList = true;
  await service.refreshTypeList();
  await service.refreshTypeList();
  assert.deepEqual(asked, [['https://juicejournal.github.io/JuiceJournal/price-types.json', 0]]);
  assert.deepEqual(registry.getCurrencyTypes(), ['Currency', 'Thread']);

  // Six hours on it asks again; an answer that fails or is not a list leaves the types as they are.
  now += 6 * 60 * 60 * 1000;
  service.client.get = async () => { throw new Error('offline'); };
  await service.refreshTypeList();
  now += 6 * 60 * 60 * 1000;
  service.client.get = async () => ({ data: '<html>not found</html>' });
  await service.refreshTypeList();
  assert.deepEqual(registry.getCurrencyTypes(), ['Currency', 'Thread']);
});
