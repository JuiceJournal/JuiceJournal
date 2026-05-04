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
