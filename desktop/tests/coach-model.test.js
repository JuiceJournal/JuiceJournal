const test = require('node:test');
const assert = require('node:assert/strict');

const { COACH_STEPS, deriveCoach } = require('../src/modules/coachModel');

// A new Path of Exile 2 player with everything ready, standing in a hideout with the inventory not read yet.
const ready = {
  done: false,
  hidden: false,
  game: 'poe2',
  readingEnabled: true,
  hasCharacter: true,
  windowUnmeasured: false,
  artReady: true,
  inMap: false,
  inHub: true,
  hasBaseline: false,
  mapWaiting: false
};
const step = (facts) => {
  const coach = deriveCoach({ ...ready, ...facts });
  return coach && [coach.step, coach.message, coach.status];
};

test('the steps run in order from starting the game to counting a map', () => {
  assert.deepEqual(COACH_STEPS, ['game', 'ready', 'inventory', 'map', 'count']);

  assert.deepEqual(step({ game: null }), ['game', 'game', 'do']);
  assert.deepEqual(step({}), ['inventory', 'openInventory', 'do']);
  assert.deepEqual(step({ hasBaseline: true }), ['map', 'runMap', 'do']);
  assert.deepEqual(step({ hasBaseline: true, inMap: true, inHub: false }), ['map', 'inMap', 'wait']);
  assert.deepEqual(step({ hasBaseline: true, mapWaiting: true }), ['count', 'count', 'do']);
  assert.deepEqual(step({ done: true }), ['done', 'done', 'done']);

  const coach = deriveCoach(ready);
  assert.equal(coach.index, 3);
  assert.equal(coach.total, 5);
});

test('each thing that keeps reading from working is said, in the order it has to be solved', () => {
  const blocked = { readingEnabled: false, hasCharacter: false, windowUnmeasured: true, artReady: false };

  assert.deepEqual(step(blocked), ['ready', 'readingOff', 'do']);
  assert.deepEqual(step({ ...blocked, readingEnabled: true }), ['ready', 'character', 'wait']);
  assert.deepEqual(step({ ...blocked, readingEnabled: true, hasCharacter: true }), ['ready', 'resolution', 'do']);
  assert.deepEqual(step({ artReady: false }), ['ready', 'loading', 'wait']);
  // Being ready comes before where the player stands: a map entered while prices load still says they are loading.
  assert.deepEqual(step({ artReady: false, inMap: true, inHub: false }), ['ready', 'loading', 'wait']);
});

test('the player is sent to the hideout when the inventory cannot be read where they stand', () => {
  assert.deepEqual(step({ inHub: false }), ['inventory', 'goHideout', 'do']);
  assert.deepEqual(step({ hasBaseline: true, mapWaiting: true, inHub: false }), ['count', 'countInHideout', 'do']);
});

test('a map entered before any read is called uncounted, and the read after it is still asked for', () => {
  assert.deepEqual(step({ inMap: true, inHub: false }), ['map', 'mapUncounted', 'wait']);
  // The map ended: its read gives the first baseline, so the step asks for it like a counted map's.
  assert.deepEqual(step({ mapWaiting: true }), ['count', 'count', 'do']);
});

test('Path of Exile 1 gets one note instead of steps it cannot take', () => {
  const coach = deriveCoach({ ...ready, game: 'poe1' });
  assert.deepEqual([coach.step, coach.message, coach.status, coach.total], ['poe1', 'poe1', 'info', 0]);
});

test('hidden steps show nothing, whatever the state', () => {
  assert.equal(deriveCoach({ ...ready, hidden: true }), null);
  assert.equal(deriveCoach({ ...ready, hidden: true, done: true }), null);
  assert.equal(deriveCoach({ hidden: true }), null);
});

test('with no facts at all the first step is starting the game', () => {
  assert.deepEqual([deriveCoach().step, deriveCoach().index], ['game', 1]);
});
