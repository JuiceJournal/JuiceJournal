const test = require('node:test');
const assert = require('node:assert/strict');

const LogParser = require('../src/modules/logParser');

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

test('log parser does not treat PoE2 safe social areas as map entries', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const entries = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.parseLine('2026/05/04 15:49:10 123456 abc [INFO Client 123] : You have entered Canal Hideout.');

  assert.equal(entries.length, 0);
});

test('log parser keeps generic non-map area entries disabled for PoE1', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe1' });
  const entries = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.parseLine('2026/05/04 15:49:10 123456 abc [INFO Client 123] : You have entered The Coast.');

  assert.equal(entries.length, 0);
});
