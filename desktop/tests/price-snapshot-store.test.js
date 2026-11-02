const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PriceSnapshotStore = require('../src/modules/priceSnapshotStore');

function makeStore(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jj-price-snapshots-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'price-snapshots');
  return { store: new PriceSnapshotStore({ dir }), dir, root };
}

const listOf = (league, poeVersion = 'poe1', chaosValue = 150, syncedAt = 1000) => ({
  poeVersion,
  league,
  syncedAt,
  syncedTypes: ['currency'],
  entries: [{ name: 'Divine Orb', chaosValue, divineValue: 1, category: 'currency', icon: null, sparkline: [1, 2], change: null }]
});

test('a kept list reads back for its own game and league only', async (t) => {
  const { store } = makeStore(t);
  assert.equal(await store.load('poe1', 'Mirage'), null);

  await store.save(listOf('Mirage'));
  const kept = await store.load('poe1', 'Mirage');
  assert.equal(kept.league, 'Mirage');
  assert.equal(kept.syncedAt, 1000);
  assert.deepEqual(kept.entries, listOf('Mirage').entries);

  assert.equal(await store.load('poe1', 'Standard'), null);
  assert.equal(await store.load('poe2', 'Mirage'), null);
});

test('a newer sync replaces the kept list of its league, in the order the syncs ended', async (t) => {
  const { store, dir } = makeStore(t);
  store.save(listOf('Mirage', 'poe1', 100, 1000));
  store.save(listOf('Mirage', 'poe1', 200, 2000));
  await store.save(listOf('Mirage', 'poe1', 300, 3000));

  const kept = await store.load('poe1', 'Mirage');
  assert.equal(kept.entries[0].chaosValue, 300);
  assert.equal(kept.syncedAt, 3000);
  // No temp file stays, and one file per league.
  assert.equal(fs.readdirSync(dir).length, 1);
});

test('a league name never names a path', async (t) => {
  const { store, dir, root } = makeStore(t);
  const league = '..\\..\\../../outside';
  await store.save(listOf(league));
  assert.equal((await store.load('poe1', league)).league, league);
  assert.deepEqual(fs.readdirSync(root), ['price-snapshots']);
  assert.match(fs.readdirSync(dir)[0], /^[0-9a-f]{64}\.json$/);
});

test('a broken or foreign file counts as no list', async (t) => {
  const { store, dir } = makeStore(t);
  await store.save(listOf('Mirage'));
  const file = path.join(dir, fs.readdirSync(dir)[0]);
  const good = JSON.parse(fs.readFileSync(file, 'utf8'));

  for (const text of [
    '{"version":1,"poeVersion":',
    'null',
    JSON.stringify({ ...good, version: 99 }),
    JSON.stringify({ ...good, league: 'Standard' }),
    JSON.stringify({ ...good, syncedAt: 'yesterday' }),
    JSON.stringify({ ...good, syncedTypes: null }),
    JSON.stringify({ ...good, entries: {} }),
    JSON.stringify({ ...good, entries: [{ name: 7, chaosValue: 1 }] }),
    JSON.stringify({ ...good, entries: [{ name: 'Divine Orb', chaosValue: null }] })
  ]) {
    fs.writeFileSync(file, text);
    assert.equal(await store.load('poe1', 'Mirage'), null, text);
  }
});

test('only the newest few lists stay', async (t) => {
  const { store, dir } = makeStore(t);
  for (let index = 0; index < 6; index += 1) {
    await store.save(listOf(`League ${index}`));
  }
  assert.equal(fs.readdirSync(dir).length, 6);
  // The oldest by time on disk goes when a seventh arrives.
  fs.utimesSync(store._filePath('poe1', 'League 2'), new Date(1000), new Date(1000));
  await store.save(listOf('League 6'));

  assert.equal(fs.readdirSync(dir).length, 6);
  assert.equal(await store.load('poe1', 'League 2'), null);
  assert.ok(await store.load('poe1', 'League 0'));
  assert.ok(await store.load('poe1', 'League 6'));
});

test('a quick sync leaves a recent full list in place, and replaces any other list', async (t) => {
  const { store } = makeStore(t);
  const day = 24 * 60 * 60 * 1000;
  const save = (chaosValue, syncedAt, full) => store.save({ ...listOf('Mirage', 'poe1', chaosValue, syncedAt), full });
  const keptValue = async () => (await store.load('poe1', 'Mirage')).entries[0].chaosValue;

  await save(100, 1000, false);
  await save(200, 2000, false);
  assert.equal(await keptValue(), 200);

  await save(300, 3000, true);
  assert.equal(await keptValue(), 300);
  await save(400, 4000, false);
  assert.equal(await keptValue(), 300);
  // A full sync always replaces it, and a day on the quick sync's fresher prices count for more than the skipped tabs.
  await save(500, 5000, true);
  assert.equal(await keptValue(), 500);
  await save(600, 5000 + day, false);
  assert.equal(await keptValue(), 600);
});

test('the newest kept list names the league of its own game, past broken files', async (t) => {
  const { store } = makeStore(t);
  assert.equal(await store.newestLeague('poe1'), null);

  await store.save(listOf('Old League'));
  await store.save(listOf('New League'));
  await store.save(listOf('Their League', 'poe2'));
  const stamp = (league, poeVersion, seconds) => fs.utimesSync(store._filePath(poeVersion, league), new Date(seconds * 1000), new Date(seconds * 1000));
  stamp('Old League', 'poe1', 1000);
  stamp('New League', 'poe1', 2000);
  stamp('Their League', 'poe2', 3000);
  assert.equal(await store.newestLeague('poe1'), 'New League');
  assert.equal(await store.newestLeague('poe2'), 'Their League');

  fs.writeFileSync(store._filePath('poe1', 'New League'), '{"version":1,');
  assert.equal(await store.newestLeague('poe1'), 'Old League');
});

test('stop waits for a write already under way, so nothing lands after the folder goes', async (t) => {
  const { store } = makeStore(t);
  let finishWrite;
  store._write = () => new Promise((resolve) => {
    finishWrite = resolve;
  });
  store.save(listOf('Mirage'));
  await new Promise(setImmediate);
  assert.equal(typeof finishWrite, 'function');

  let settled = false;
  const stopping = Promise.resolve(store.stop()).then(() => {
    settled = true;
  });
  await new Promise(setImmediate);
  assert.equal(settled, false);
  finishWrite();
  await stopping;
  assert.equal(settled, true);
});

test('a write that fails is only a warning, and stop keeps later ones from writing', async (t) => {
  const { store, dir, root } = makeStore(t);
  const warnings = t.mock.method(console, 'warn', () => {});
  // A file where the folder should be.
  fs.writeFileSync(dir, 'in the way');
  await store.save(listOf('Mirage'));
  assert.equal(warnings.mock.callCount(), 1);
  assert.doesNotMatch(String(warnings.mock.calls[0].arguments[0]), new RegExp(root.replace(/\\/g, '\\\\')));
  fs.rmSync(dir);

  store.stop();
  await store.save(listOf('Mirage'));
  assert.equal(fs.existsSync(dir), false);

  store.resume();
  await store.save(listOf('Mirage'));
  assert.ok(await store.load('poe1', 'Mirage'));
});
