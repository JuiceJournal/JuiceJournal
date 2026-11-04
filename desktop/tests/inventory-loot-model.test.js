const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createInventoryLootState,
  getCharacterKey,
  diffInventory,
  markSessionEnded,
  applyInventoryRead
} = require('../src/modules/inventoryLootModel');

const KEY = 'poe2:char-1';

test('diffInventory counts only what increased', () => {
  assert.deepEqual(
    diffInventory({ 'Exalted Orb': 5, 'Vaal Orb': 3 }, { 'Exalted Orb': 7, 'Vaal Orb': 1, 'Regal Orb': 2 }),
    [{ name: 'Exalted Orb', quantity: 2 }, { name: 'Regal Orb', quantity: 2 }]
  );
});

test('a read without a finished map only refreshes the baseline', () => {
  const { state, outcome } = applyInventoryRead(createInventoryLootState(), { characterKey: KEY, items: { 'Exalted Orb': 5 } });

  assert.equal(outcome, null);
  assert.deepEqual(state.baselines[KEY], { 'Exalted Orb': 5 });
});

test('the first read after a map gives its gain against the last read before it', () => {
  let state = createInventoryLootState({ [KEY]: { 'Exalted Orb': 5 } });
  state = applyInventoryRead(state, { characterKey: KEY, items: {} }).state;
  state = markSessionEnded(state, { sessionId: 's1', characterKey: KEY });

  const { state: next, outcome } = applyInventoryRead(state, { characterKey: KEY, items: { 'Exalted Orb': 2 } });

  assert.deepEqual(outcome, { type: 'gain', sessionId: 's1', items: [{ name: 'Exalted Orb', quantity: 2 }] });
  assert.equal(next.pending, null);
});

test('reads after the settling one do not count again', () => {
  let state = markSessionEnded(createInventoryLootState({ [KEY]: {} }), { sessionId: 's1', characterKey: KEY });
  state = applyInventoryRead(state, { characterKey: KEY, items: { 'Regal Orb': 1 } }).state;

  const { outcome } = applyInventoryRead(state, { characterKey: KEY, items: { 'Regal Orb': 4 } });

  assert.equal(outcome, null);
});

test('a map with an empty start still has a baseline', () => {
  const state = markSessionEnded(createInventoryLootState({ [KEY]: {} }), { sessionId: 's1', characterKey: KEY });

  const { outcome } = applyInventoryRead(state, { characterKey: KEY, items: { 'Regal Orb': 1 } });

  assert.deepEqual(outcome, { type: 'gain', sessionId: 's1', items: [{ name: 'Regal Orb', quantity: 1 }] });
});

test('a map with no earlier read reports that instead of counting the whole inventory', () => {
  const state = markSessionEnded(createInventoryLootState(), { sessionId: 's1', characterKey: KEY });

  const { state: next, outcome } = applyInventoryRead(state, { characterKey: KEY, items: { 'Exalted Orb': 9 } });

  assert.deepEqual(outcome, { type: 'noBaseline', sessionId: 's1' });
  assert.deepEqual(next.baselines[KEY], { 'Exalted Orb': 9 });
});

test('another character never settles the map or uses its baseline', () => {
  const state = markSessionEnded(createInventoryLootState({ [KEY]: {} }), { sessionId: 's1', characterKey: KEY });

  const { state: next, outcome } = applyInventoryRead(state, { characterKey: 'poe2:char-2', items: { 'Divine Orb': 3 } });

  assert.equal(outcome, null);
  assert.equal(next.pending, null);
  assert.deepEqual(next.baselines['poe2:char-2'], { 'Divine Orb': 3 });
  assert.deepEqual(next.baselines[KEY], {});
});

test('a newer finished map takes over the wait', () => {
  let state = markSessionEnded(createInventoryLootState({ [KEY]: {} }), { sessionId: 's1', characterKey: KEY });
  state = markSessionEnded(state, { sessionId: 's2', characterKey: KEY });

  const { outcome } = applyInventoryRead(state, { characterKey: KEY, items: { 'Regal Orb': 1 } });

  assert.equal(outcome.sessionId, 's2');
});

test('getCharacterKey separates games and characters', () => {
  assert.equal(getCharacterKey('poe2', { id: 'a', name: 'Ann' }), 'poe2:a');
  assert.equal(getCharacterKey('poe2', { name: 'Ann' }), 'poe2:Ann');
  assert.equal(getCharacterKey('poe1', null), 'poe1:unknown');
});
