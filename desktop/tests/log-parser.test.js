const test = require('node:test');
const assert = require('node:assert/strict');

const LogParser = require('../src/modules/logParser');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('log parser treats PoE2 endgame area names without Map as map entries', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const entries = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.parseLine('2026/05/04 15:49:10 123456 abc [INFO Client 123] : You have entered Tower.');

  assert.equal(entries.length, 1);
  assert.equal(entries[0].mapName, 'Tower');
  assert.equal(entries[0].mapTier, null);
});

test('log parser tracks PoE2 generated map areas and safe generated area exits', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const entries = [];
  const exits = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.on('mapExited', (payload) => exits.push(payload));

  parser.parseLine('2026/05/04 21:00:38 7155484 2caa22d2 [DEBUG Client 98516] Generating level 80 area "MapHeadland" with seed 10066852');
  parser.parseLine('2026/05/04 21:02:34 7271093 2caa22d2 [DEBUG Client 98516] Generating level 65 area "HideoutCanal" with seed 1');
  parser.parseLine('2026/05/04 21:10:38 7155484 2caa22d2 [DEBUG Client 98516] Generating level 80 area "MapMesa" with seed 3135500465');

  assert.deepEqual(
    entries.map((entry) => entry.mapName),
    ['Headland', 'Mesa']
  );
  assert.equal(entries[0].mapTier, 80);
  assert.equal(exits.length, 1);
  assert.equal(exits[0].mapName, 'Headland');
  assert.equal(exits[0].location, 'Canal Hideout');
});

test('log parser keeps PoE2 Abyssal Depths transitions inside the active map', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const entries = [];
  const exits = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.on('mapExited', (payload) => exits.push(payload));

  parser.parseLine('2026/05/04 21:00:38 7155484 2caa22d2 [DEBUG Client 98516] Generating level 80 area "MapChannel" with seed 10066852');
  parser.parseLine('2026/05/04 21:02:34 7271093 2caa22d2 [INFO Client 98516] : You have entered Abyssal Depths.');
  parser.parseLine('2026/05/04 21:07:21 7271093 2caa22d2 [INFO Client 98516] : You have entered Channel.');
  parser.parseLine('2026/05/04 21:10:38 7155484 2caa22d2 [DEBUG Client 98516] Generating level 65 area "HideoutCanal" with seed 1');

  assert.deepEqual(
    entries.map((entry) => entry.mapName),
    ['Channel']
  );
  assert.equal(exits.length, 1);
  assert.equal(exits[0].mapName, 'Channel');
  assert.equal(exits[0].location, 'Canal Hideout');
});

test('log parser ignores PoE2 trial side areas when no map is active', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const entries = [];

  parser.on('mapEntered', (payload) => entries.push(payload));

  parser.parseLine('2026/05/05 19:14:10 123456 abc [INFO Client 123] : You have entered Trial of the Sekhemas.');
  parser.parseLine('2026/05/05 19:18:42 123456 abc [INFO Client 123] : You have entered Trial of Chaos.');
  parser.parseLine('2026/05/05 19:21:08 123456 abc [INFO Client 123] : You have entered The Trial of Chaos.');

  assert.deepEqual(entries, []);
});

test('log parser does not treat PoE2 safe social areas as map entries', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const entries = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.parseLine('2026/05/04 15:49:10 123456 abc [INFO Client 123] : You have entered Canal Hideout.');

  assert.equal(entries.length, 0);
});

test('log parser exits PoE2 maps when the player returns to a named hideout', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const entries = [];
  const exits = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.on('mapExited', (payload) => exits.push(payload));

  parser.parseLine('2026/05/06 12:00:00 123456 abc [INFO Client 123] : Generating level 80 area "MapChannel" with seed 1');
  parser.parseLine('2026/05/06 12:02:00 123456 abc [INFO Client 123] : You have entered Abyssal Depths.');
  parser.parseLine('2026/05/06 12:05:30 123456 abc [INFO Client 123] : You have entered Canal Hideout.');

  assert.deepEqual(entries.map((entry) => entry.mapName), ['Channel']);
  assert.equal(exits.length, 1);
  assert.equal(exits[0].mapName, 'Channel');
  assert.equal(exits[0].location, 'Canal Hideout');
});

test('log parser keeps generic non-map area entries disabled for PoE1', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe1' });
  const entries = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.parseLine('2026/05/04 15:49:10 123456 abc [INFO Client 123] : You have entered The Coast.');

  assert.equal(entries.length, 0);
});

test('log parser keeps PoE1 league side instances inside the active map', async () => {
  const parser = new LogParser('Client.txt', {
    poeVersion: 'poe1',
    instanceExitDelayMs: 20
  });
  const entries = [];
  const exits = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.on('mapExited', (payload) => exits.push(payload));

  parser.parseLine('2026/05/06 18:00:00 123456 abc [INFO Client 123] : Generating level 83 area "MapDunes" with seed 1');
  parser.parseLine('2026/05/06 18:02:00 123456 abc [INFO Client 123] : Connecting to instance server...');
  parser.parseLine('2026/05/06 18:02:02 123456 abc [INFO Client 123] : You have entered The Sacred Grove.');
  await wait(30);

  assert.deepEqual(entries.map((entry) => entry.mapName), ['Dunes Map']);
  assert.equal(exits.length, 0);
  assert.equal(parser.getCurrentMap().mapName, 'Dunes Map');

  parser.parseLine('2026/05/06 18:08:00 123456 abc [INFO Client 123] : You have entered Canal Hideout.');

  assert.equal(exits.length, 1);
  assert.equal(exits[0].mapName, 'Dunes Map');
  assert.equal(exits[0].location, 'Canal Hideout');
});

test('log parser keeps PoE1 same-seed map re-entry inside the active map', async () => {
  const parser = new LogParser('Client.txt', {
    poeVersion: 'poe1',
    instanceExitDelayMs: 20
  });
  const entries = [];
  const exits = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.on('mapExited', (payload) => exits.push(payload));

  parser.parseLine('2026/05/07 09:31:30 123456 abc [INFO Client 123] : Generating level 83 area "MapWorldsDunes" with seed 3809657038');
  parser.parseLine('2026/05/07 09:31:30 123456 abc [INFO Client 123] : You have entered Dunes.');
  parser.parseLine('2026/05/07 09:35:17 123456 abc [INFO Client 123] : Connecting to instance server...');
  parser.parseLine('2026/05/07 09:35:17 123456 abc [INFO Client 123] : Generating level 83 area "MapWorldsDunes" with seed 3809657038');
  parser.parseLine('2026/05/07 09:35:18 123456 abc [INFO Client 123] : You have entered Dunes.');
  await wait(30);

  assert.deepEqual(entries.map((entry) => entry.mapName), ['Dunes Map']);
  assert.equal(exits.length, 0);
  assert.equal(parser.getCurrentMap().mapName, 'Dunes Map');

  parser.parseLine('2026/05/07 09:36:37 123456 abc [INFO Client 123] : Generating level 60 area "HideoutForest" with seed 1');
  parser.parseLine('2026/05/07 09:36:38 123456 abc [INFO Client 123] : You have entered Lush Hideout.');

  assert.equal(exits.length, 1);
  assert.equal(exits[0].mapName, 'Dunes Map');
});

test('log parser bootstraps one PoE1 map-entered event when startup tail is inside a map', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe1' });
  const entries = [];

  parser.on('mapEntered', (payload) => entries.push(payload));

  const didBootstrap = parser.bootstrapFromRecentLines([
    '2026/05/07 09:31:30 123456 abc [INFO Client 123] : Generating level 83 area "MapWorldsDunes" with seed 3809657038',
    '2026/05/07 09:31:30 123456 abc [INFO Client 123] : You have entered Dunes.'
  ], {
    now: new Date('2026-05-07T06:32:00.000Z'),
    maxAgeMs: 5 * 60 * 1000
  });

  assert.equal(didBootstrap, true);
  assert.deepEqual(entries.map((entry) => entry.mapName), ['Dunes Map']);
  assert.equal(entries[0].source, 'log_bootstrap');
  assert.equal(parser.getCurrentMap().mapName, 'Dunes Map');
});

test('log parser does not bootstrap PoE1 map prompt when startup tail ends in hideout', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe1' });
  const entries = [];

  parser.on('mapEntered', (payload) => entries.push(payload));

  const didBootstrap = parser.bootstrapFromRecentLines([
    '2026/05/07 09:31:30 123456 abc [INFO Client 123] : Generating level 83 area "MapWorldsDunes" with seed 3809657038',
    '2026/05/07 09:36:37 123456 abc [INFO Client 123] : Generating level 60 area "HideoutForest" with seed 1',
    '2026/05/07 09:36:38 123456 abc [INFO Client 123] : You have entered Lush Hideout.'
  ], {
    now: new Date('2026-05-07T06:37:00.000Z'),
    maxAgeMs: 5 * 60 * 1000
  });

  assert.equal(didBootstrap, false);
  assert.deepEqual(entries, []);
  assert.equal(parser.getCurrentMap().mapName, null);
});

test('log parser still exits PoE1 maps on unresolved instance changes after debounce', async () => {
  const parser = new LogParser('Client.txt', {
    poeVersion: 'poe1',
    instanceExitDelayMs: 20
  });
  const exits = [];

  parser.on('mapExited', (payload) => exits.push(payload));

  parser.parseLine('2026/05/06 18:00:00 123456 abc [INFO Client 123] : Generating level 83 area "MapDunes" with seed 1');
  parser.parseLine('2026/05/06 18:02:00 123456 abc [INFO Client 123] : Connecting to instance server...');
  await wait(30);

  assert.equal(exits.length, 1);
  assert.equal(exits[0].mapName, 'Dunes Map');
  assert.equal(exits[0].location, 'instance_change');
  assert.equal(parser.getCurrentMap().mapName, null);
});
