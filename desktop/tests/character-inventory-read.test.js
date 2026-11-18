const test = require('node:test');
const assert = require('node:assert/strict');

const { readCharacterInventory } = require('../src/modules/characterInventoryRead');
const { applyInventoryRead, createInventoryLootState, markSessionEnded } = require('../src/modules/inventoryLootModel');

const stack = (baseType, stackSize, x, y, more = {}) => ({
  baseType, typeLine: baseType, stackSize, maxStackSize: 20, x, y, w: 1, h: 1, inventoryId: 'MainInventory', ...more
});

test('stacks are read by base type, with their exact size and the cell they sit in', () => {
  const read = readCharacterInventory({
    inventory: [stack('Chaos Orb', 7, 0, 0), stack('Chaos Orb', 20, 1, 0), stack('Divine Orb', 1, 3, 2)]
  });

  assert.deepEqual(read, {
    open: true,
    items: { 'Chaos Orb': 27, 'Divine Orb': 1 },
    cells: {
      '0,0': { name: 'Chaos Orb', quantity: 7, digits: true },
      '0,1': { name: 'Chaos Orb', quantity: 20, digits: true },
      '2,3': { name: 'Divine Orb', quantity: 1, digits: true }
    }
  });
});

test('gear, maps and unique items are left out: their worth depends on what is on them', () => {
  const read = readCharacterInventory({
    inventory: [
      stack('Orb of Alchemy', 3, 0, 0),
      { name: 'Headhunter', typeLine: 'Leather Belt', baseType: 'Leather Belt', rarity: 'Unique', x: 1, y: 0, w: 2, h: 1, inventoryId: 'MainInventory' },
      { name: '', typeLine: 'Crimson Temple Map', baseType: 'Crimson Temple Map', x: 3, y: 0, w: 1, h: 1, inventoryId: 'MainInventory' },
      { name: 'Doom Shell', typeLine: 'Vaal Regalia', baseType: 'Vaal Regalia', rarity: 'Rare', x: 4, y: 0, w: 2, h: 3, inventoryId: 'MainInventory' },
      // A thing that never stacks reports a stack size of one at most.
      { typeLine: 'Portal Gem', baseType: 'Portal Gem', stackSize: 1, maxStackSize: 1, x: 6, y: 0, inventoryId: 'MainInventory' }
    ]
  });

  assert.deepEqual(read.items, { 'Orb of Alchemy': 3 });
  assert.deepEqual(Object.keys(read.cells), ['0,0']);
});

test('items outside the main inventory are not what the character carries', () => {
  const read = readCharacterInventory({
    inventory: [stack('Chaos Orb', 5, 0, 0), stack('Chaos Orb', 9, 0, 0, { inventoryId: 'Cursor' })]
  });

  assert.deepEqual(read.items, { 'Chaos Orb': 5 });
});

test('a stack with a broken size or place is left out rather than guessed', () => {
  const read = readCharacterInventory({
    inventory: [
      stack('Chaos Orb', 5, 0, 0),
      stack('Exalted Orb', undefined, 1, 0),
      stack('Regal Orb', 4, undefined, 0),
      stack('', 4, 2, 0, { typeLine: '' })
    ]
  });

  // A stack that names no size is one item: that is what the game shows.
  assert.deepEqual(read.items, { 'Chaos Orb': 5, 'Exalted Orb': 1 });
});

test('an answer without an inventory list is no read, and an empty list is an empty inventory', () => {
  assert.equal(readCharacterInventory(null), null);
  assert.equal(readCharacterInventory({ name: 'Exile' }), null);
  assert.deepEqual(readCharacterInventory({ inventory: [] }), { open: true, items: {}, cells: {} });
});

test('two reads made this way give a map its loot through the loot model', () => {
  const key = 'poe1:Exile';
  const before = readCharacterInventory({ inventory: [stack('Chaos Orb', 7, 0, 0), stack('Scroll of Wisdom', 30, 1, 0)] });
  const after = readCharacterInventory({
    inventory: [stack('Chaos Orb', 12, 0, 0), stack('Scroll of Wisdom', 28, 1, 0), stack('Divine Orb', 1, 2, 0)]
  });

  let state = applyInventoryRead(createInventoryLootState(), { characterKey: key, read: before }).state;
  state = markSessionEnded(state, { sessionId: 's1', characterKey: key });
  const { outcome } = applyInventoryRead(state, { characterKey: key, read: after });

  assert.equal(outcome.type, 'gain');
  assert.deepEqual(outcome.items.sort((a, b) => a.name.localeCompare(b.name)), [
    { name: 'Chaos Orb', quantity: 5 },
    { name: 'Divine Orb', quantity: 1 }
  ]);
  assert.equal(outcome.unread, false);
});
