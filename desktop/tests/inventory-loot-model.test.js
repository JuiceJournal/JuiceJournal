const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createInventoryLootState,
  getCharacterKey,
  diffInventory,
  noteMapEntered,
  markSessionEnded,
  applyInventoryRead
} = require('../src/modules/inventoryLootModel');

const KEY = 'poe2:char-1';

// A read with each item in a cell of its own, so items stay in place between reads.
function read(items) {
  const cells = {};
  for (const [name, quantity] of Object.entries(items)) {
    cells[name] = { name, quantity, digits: true };
  }
  return { items, cells };
}

function withBaseline(items) {
  return applyInventoryRead(createInventoryLootState(), { characterKey: KEY, read: read(items) }).state;
}

test('diffInventory counts only what increased', () => {
  assert.deepEqual(
    diffInventory(read({ 'Exalted Orb': 5, 'Vaal Orb': 3 }), read({ 'Exalted Orb': 7, 'Vaal Orb': 1, 'Regal Orb': 2 })),
    [{ name: 'Exalted Orb', quantity: 2 }, { name: 'Regal Orb', quantity: 2 }]
  );
});

test('an item the last read could not name does not become loot when a later read names it', () => {
  const before = { items: {}, cells: { '0,0': { unknown: true } } };
  const after = { items: { 'Exalted Orb': 40 }, cells: { '0,0': { name: 'Exalted Orb', quantity: 40, digits: true } } };

  assert.deepEqual(diffInventory(before, after), []);
});

test('a cell read as another item does not count, so a misread tier cannot become loot', () => {
  const before = { items: { 'Regal Orb': 5 }, cells: { '0,0': { name: 'Regal Orb', quantity: 5, digits: true } } };
  const after = { items: { 'Perfect Regal Orb': 5 }, cells: { '0,0': { name: 'Perfect Regal Orb', quantity: 5, digits: true } } };

  assert.deepEqual(diffInventory(before, after), []);
});

test('a stack first read without digits does not count its size as loot when the digits show', () => {
  const before = { items: { 'Exalted Orb': 1 }, cells: { '0,0': { name: 'Exalted Orb', quantity: 1, digits: false } } };
  const after = { items: { 'Exalted Orb': 12 }, cells: { '0,0': { name: 'Exalted Orb', quantity: 12, digits: true } } };

  assert.deepEqual(diffInventory(before, after), []);
});

test('a stack moved to another cell is not loot, and what really came on top is', () => {
  const before = { items: { 'Exalted Orb': 5 }, cells: { '0,0': { name: 'Exalted Orb', quantity: 5, digits: true } } };
  const moved = { items: { 'Exalted Orb': 5 }, cells: { '3,3': { name: 'Exalted Orb', quantity: 5, digits: true } } };
  const movedAndMore = { items: { 'Exalted Orb': 7 }, cells: { '3,3': { name: 'Exalted Orb', quantity: 7, digits: true } } };

  assert.deepEqual(diffInventory(before, moved), []);
  assert.deepEqual(diffInventory(before, movedAndMore), [{ name: 'Exalted Orb', quantity: 2 }]);
});

test('loot in cells that were empty counts in full, and across stacks of the same item', () => {
  const before = { items: { 'Exalted Orb': 5 }, cells: { '0,0': { name: 'Exalted Orb', quantity: 5, digits: true } } };
  const after = {
    items: { 'Exalted Orb': 9, 'Regal Orb': 2 },
    cells: {
      '0,0': { name: 'Exalted Orb', quantity: 6, digits: true },
      '0,1': { name: 'Exalted Orb', quantity: 3, digits: true },
      '0,2': { name: 'Regal Orb', quantity: 2, digits: true }
    }
  };

  assert.deepEqual(diffInventory(before, after), [{ name: 'Exalted Orb', quantity: 4 }, { name: 'Regal Orb', quantity: 2 }]);
});

test('a read without a finished map only refreshes the baseline', () => {
  const { state, outcome } = applyInventoryRead(createInventoryLootState(), { characterKey: KEY, read: read({ 'Exalted Orb': 5 }) });

  assert.equal(outcome, null);
  assert.deepEqual(state.baselines[KEY].items, { 'Exalted Orb': 5 });
});

test('the first read after a map gives its gain against the last read before it', () => {
  let state = withBaseline({ 'Exalted Orb': 5 });
  state = applyInventoryRead(state, { characterKey: KEY, read: read({}) }).state;
  state = noteMapEntered(state, KEY);
  state = markSessionEnded(state, { sessionId: 's1', characterKey: KEY });

  const { state: next, outcome } = applyInventoryRead(state, { characterKey: KEY, read: read({ 'Exalted Orb': 2 }) });

  assert.deepEqual(outcome, { type: 'gain', sessionId: 's1', items: [{ name: 'Exalted Orb', quantity: 2 }], mapCount: 1 });
  assert.equal(next.pending, null);
  assert.equal(next.mapsSinceRead[KEY], 0);
});

test('reads after the settling one do not count again', () => {
  let state = markSessionEnded(withBaseline({}), { sessionId: 's1', characterKey: KEY });
  state = applyInventoryRead(state, { characterKey: KEY, read: read({ 'Regal Orb': 1 }) }).state;

  const { outcome } = applyInventoryRead(state, { characterKey: KEY, read: read({ 'Regal Orb': 4 }) });

  assert.equal(outcome, null);
});

test('a map with an empty start still has a baseline', () => {
  const state = markSessionEnded(withBaseline({}), { sessionId: 's1', characterKey: KEY });

  const { outcome } = applyInventoryRead(state, { characterKey: KEY, read: read({ 'Regal Orb': 1 }) });

  assert.deepEqual(outcome, { type: 'gain', sessionId: 's1', items: [{ name: 'Regal Orb', quantity: 1 }], mapCount: 1 });
});

test('a map with no earlier read reports that instead of counting the whole inventory', () => {
  const state = markSessionEnded(createInventoryLootState(), { sessionId: 's1', characterKey: KEY });

  const { state: next, outcome } = applyInventoryRead(state, { characterKey: KEY, read: read({ 'Exalted Orb': 9 }) });

  assert.deepEqual(outcome, { type: 'noBaseline', sessionId: 's1' });
  assert.deepEqual(next.baselines[KEY].items, { 'Exalted Orb': 9 });
});

test('another character neither settles the map nor drops it, and keeps its own baseline and map count', () => {
  const other = 'poe2:char-2';
  let state = noteMapEntered(withBaseline({}), KEY);
  state = markSessionEnded(state, { sessionId: 's1', characterKey: KEY });

  const { state: next, outcome } = applyInventoryRead(state, { characterKey: other, read: read({ 'Divine Orb': 3 }) });

  assert.equal(outcome, null);
  assert.equal(next.pending.sessionId, 's1');
  assert.deepEqual(next.baselines[other].items, { 'Divine Orb': 3 });
  assert.deepEqual(next.baselines[KEY].items, {});
  assert.equal(next.mapsSinceRead[KEY], 1);

  const settled = applyInventoryRead(next, { characterKey: KEY, read: read({ 'Regal Orb': 1 }) });
  assert.equal(settled.outcome.sessionId, 's1');
  assert.equal(settled.outcome.mapCount, 1);
});

test('a read after several maps goes to the newest one and says how many it covers', () => {
  let state = withBaseline({ 'Exalted Orb': 1 });
  state = noteMapEntered(state, KEY);
  state = markSessionEnded(state, { sessionId: 's1', characterKey: KEY });
  state = noteMapEntered(state, KEY);
  state = markSessionEnded(state, { sessionId: 's2', characterKey: KEY });

  const { outcome } = applyInventoryRead(state, { characterKey: KEY, read: read({ 'Exalted Orb': 4 }) });

  assert.deepEqual(outcome, { type: 'gain', sessionId: 's2', items: [{ name: 'Exalted Orb', quantity: 3 }], mapCount: 2 });
});

test('a map played without a session counts towards the covered maps', () => {
  let state = markSessionEnded(noteMapEntered(withBaseline({}), KEY), { sessionId: 's1', characterKey: KEY });
  state = noteMapEntered(state, KEY);

  const { outcome } = applyInventoryRead(state, { characterKey: KEY, read: read({ 'Regal Orb': 2 }) });

  assert.equal(outcome.sessionId, 's1');
  assert.equal(outcome.mapCount, 2);
});

test('maps played with no finished session are dropped by the next read', () => {
  const state = noteMapEntered(withBaseline({}), KEY);

  const { state: next, outcome } = applyInventoryRead(state, { characterKey: KEY, read: read({ 'Regal Orb': 2 }) });

  assert.equal(outcome, null);
  assert.deepEqual(next.baselines[KEY].items, { 'Regal Orb': 2 });
  assert.equal(next.mapsSinceRead[KEY], 0);
});

test('getCharacterKey separates games and characters, and has no key for an unknown character', () => {
  assert.equal(getCharacterKey('poe2', { id: 'a', name: 'Ann' }), 'poe2:a');
  assert.equal(getCharacterKey('poe2', { name: 'Ann' }), 'poe2:Ann');
  assert.equal(getCharacterKey('poe1', null), null);
  assert.equal(getCharacterKey('poe2', { league: 'Standard' }), null);
});
