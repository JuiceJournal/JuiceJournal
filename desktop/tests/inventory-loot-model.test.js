const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createInventoryLootState,
  getCharacterKey,
  diffInventory,
  hasNewUnreadItem,
  unreadCandidates,
  unreadLoot,
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

  assert.deepEqual(outcome, { type: 'gain', sessionId: 's1', items: [{ name: 'Exalted Orb', quantity: 2 }], mapCount: 1, unread: false, unreadCandidates: [], unreadOther: false });
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

  assert.deepEqual(outcome, { type: 'gain', sessionId: 's1', items: [{ name: 'Regal Orb', quantity: 1 }], mapCount: 1, unread: false, unreadCandidates: [], unreadOther: false });
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

  assert.deepEqual(outcome, { type: 'gain', sessionId: 's2', items: [{ name: 'Exalted Orb', quantity: 3 }], mapCount: 2, unread: false, unreadCandidates: [], unreadOther: false });
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

test('a new item left unread is reported with the map, but not a covered cell or one that held something before', () => {
  const key = 'poe2:c1';
  const before = {
    items: { 'Exalted Orb': 1 },
    cells: { '0,0': { name: 'Exalted Orb', quantity: 1, digits: true }, '0,1': { unknown: true } }
  };
  const essence = { ...before, cells: { ...before.cells, '3,0': { unknown: true } } };
  const tooltip = { ...before, cells: { ...before.cells, '3,0': { unknown: true, covered: true } } };

  assert.equal(hasNewUnreadItem(before, essence), true);
  assert.equal(hasNewUnreadItem(before, tooltip), false, 'nothing was seen under the tooltip');
  assert.equal(hasNewUnreadItem(before, before), false, 'the unread cell was there before the map');

  let state = applyInventoryRead(createInventoryLootState(), { characterKey: key, read: before }).state;
  state = markSessionEnded(state, { sessionId: 's1', characterKey: key });
  const { outcome } = applyInventoryRead(state, { characterKey: key, read: essence });
  // Unread with no look: the player is told, with nothing to click.
  assert.deepEqual(outcome, { type: 'gain', sessionId: 's1', items: [], mapCount: 1, unread: true, unreadCandidates: [], unreadOther: true });
});

const looks = (cells) => ({ items: {}, cells });
const plain = (result) => JSON.parse(JSON.stringify(result));

test('only a new unread stack in an empty cell, that nothing before the map could be, gets a one-click offer', () => {
  const ruin = ['Essence of Ruin', 'Greater Essence of Ruin'];
  const body = ['Essence of the Body', 'Essence of Flames'];
  const result = unreadLoot(
    { items: { 'Exalted Orb': 1 }, cells: { '0,0': { name: 'Exalted Orb', quantity: 1, digits: true } } },
    looks({ '1,0': { unknown: true, candidates: ruin, quantity: 2 }, '2,0': { unknown: true, candidates: body, quantity: 1 }, '3,0': { unknown: true, candidates: ruin, quantity: 1 } })
  );
  // Each look is offered with its own names; two stacks of one look add up.
  assert.deepEqual(plain(result), { candidates: [{ names: ruin, quantity: 3 }, { names: body, quantity: 1 }], other: false });
  assert.equal(hasNewUnreadItem(looks({}), looks({ '1,0': { unknown: true, candidates: ruin, quantity: 1 } })), true);
});

test('a stack that may have been there before is only told: grown or changed in place, moved, read by name before or after', () => {
  const pair = ['A', 'B'];
  const told = { candidates: [], other: true };
  // Grown in place, or its look changed pair with the digits.
  assert.deepEqual(plain(unreadLoot(looks({ '0,0': { unknown: true, candidates: pair, quantity: 3 } }), looks({ '0,0': { unknown: true, candidates: pair, quantity: 5 } }))), told);
  assert.deepEqual(plain(unreadLoot(looks({ '0,0': { unknown: true, candidates: pair, quantity: 5 } }), looks({ '0,0': { unknown: true, candidates: ['A', 'C'], quantity: 7 } }))), told);
  // First seen without digits (1), then with them (5): how many are new is not known.
  assert.deepEqual(plain(unreadLoot(looks({ '0,0': { unknown: true, candidates: pair, quantity: 1 } }), looks({ '0,0': { unknown: true, candidates: pair, quantity: 5 } }))), told);
  // Read by name before, unread after; something else before; covered before.
  assert.deepEqual(plain(unreadLoot({ items: { A: 5 }, cells: { '0,0': { name: 'A', quantity: 5, digits: true } } }, looks({ '0,0': { unknown: true, candidates: pair, quantity: 7 } }))), told);
  assert.deepEqual(plain(unreadLoot({ items: { C: 2 }, cells: { '0,0': { name: 'C', quantity: 2, digits: true } } }, looks({ '0,0': { unknown: true, candidates: pair, quantity: 2 } }))), told);
  assert.deepEqual(plain(unreadLoot(looks({ '0,0': { unknown: true, covered: true } }), looks({ '0,0': { unknown: true, candidates: pair, quantity: 4 } }))), told);
  // Unread before, read by name after and grown: the named path trusts none of it.
  assert.deepEqual(plain(unreadLoot(looks({ '0,0': { unknown: true, candidates: pair, quantity: 5 } }), { items: { A: 7 }, cells: { '0,0': { name: 'A', quantity: 7, digits: true } } })), told);
  // A new cell whose look the baseline holds elsewhere, and more of it than before: maybe moved, maybe loot.
  assert.deepEqual(plain(unreadLoot(looks({ '0,1': { unknown: true, candidates: pair, quantity: 2 } }), looks({ '0,1': { unknown: true, candidates: pair, quantity: 2 }, '2,4': { unknown: true, candidates: pair, quantity: 1 } }))), told);
});

test('a stack only moved, the same stacks again, or a stack that shrank leave nothing unread', () => {
  const pair = ['A', 'B'];
  const quiet = { candidates: [], other: false };
  assert.deepEqual(plain(unreadLoot(looks({ '0,1': { unknown: true, candidates: pair, quantity: 8 } }), looks({ '2,4': { unknown: true, candidates: pair, quantity: 8 } }))), quiet);
  assert.deepEqual(plain(unreadLoot(looks({ '0,0': { unknown: true, candidates: pair, quantity: 4 } }), looks({ '0,0': { unknown: true, candidates: pair, quantity: 4 } }))), quiet);
  assert.deepEqual(plain(unreadLoot(looks({ '0,0': { unknown: true, candidates: pair, quantity: 4 } }), looks({ '0,0': { unknown: true, candidates: pair, quantity: 2 } }))), quiet);
});

test('a named gain the reader does not trust never leaks into an offer, and offers past ten are told', () => {
  // P held something unread before and reads as A x5 now; Q is a new unread stack that could be A. Only Q is offered,
  // and P's untrusted growth is told.
  const result = unreadLoot(
    looks({ '0,0': { unknown: true } }),
    { items: { A: 5 }, cells: { '0,0': { name: 'A', quantity: 5, digits: true }, '0,1': { unknown: true, candidates: ['A', 'B'], quantity: 1 } } }
  );
  assert.deepEqual(plain(result), { candidates: [{ names: ['A', 'B'], quantity: 1 }], other: true });

  // A single orb first seen without digits, now a stack of 12: the named count trusts none of it, so the player is told.
  const digits = unreadLoot(
    { items: { 'Exalted Orb': 1 }, cells: { '0,0': { name: 'Exalted Orb', quantity: 1, digits: false } } },
    { items: { 'Exalted Orb': 12 }, cells: { '0,0': { name: 'Exalted Orb', quantity: 12, digits: true } } }
  );
  assert.deepEqual(plain(digits), { candidates: [], other: true });

  // A named stack whose cell no longer reads at all.
  const lost = unreadLoot({ items: { A: 5 }, cells: { '0,0': { name: 'A', quantity: 5, digits: true } } }, looks({ '0,0': { unknown: true } }));
  assert.deepEqual(plain(lost), { candidates: [], other: true });

  const many = looks({});
  for (let col = 0; col < 12; col += 1) many.cells[`3,${col}`] = { unknown: true, candidates: [`Look ${col}`, `Twin ${col}`], quantity: 1 };
  const found = unreadLoot(looks({}), many);
  assert.equal(found.candidates.length, 10);
  assert.equal(found.other, true);
  assert.deepEqual(plain(unreadCandidates(looks({}), many)[0]), { names: ['Look 0', 'Twin 0'], quantity: 1 });
});
