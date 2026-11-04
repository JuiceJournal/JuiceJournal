const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const WATCHER_PATH = require.resolve('../src/modules/inventoryWatcher');
const VISION_PATH = require.resolve('../src/modules/inventoryVision');

// The vision module has its own tests; here reads are scripted so the flow can be followed.
function loadWatcher(script) {
  delete require.cache[WATCHER_PATH];
  const realVision = require(VISION_PATH);
  const original = Module.prototype.require;
  Module.prototype.require = function patched(request) {
    if (request === './inventoryVision') {
      return {
        ...realVision,
        readInventory: (image, grid, art) => {
          const read = script(art);
          // Each scripted item sits in a cell of its own.
          const cells = {};
          for (const [name, quantity] of Object.entries(read.items)) {
            cells[name] = { name, quantity, digits: true };
          }
          return { ...read, cells };
        }
      };
    }
    return original.apply(this, arguments);
  };
  try {
    return require(WATCHER_PATH);
  } finally {
    Module.prototype.require = original;
  }
}

function setup(overrides = {}) {
  const log = { statuses: [], gains: [], artLoads: 0, screenReads: 0 };
  let read = { open: true, items: {} };
  const Watcher = loadWatcher(() => read);
  const env = {
    now: 0,
    inMap: false,
    inFront: true,
    game: 'poe2',
    enabled: true,
    profileId: 'p1',
    character: { id: 'c1' },
    pricedComplete: true,
    icons: { 'Exalted Orb': '/icons/exalted.png' },
    gameWindow: { x: 0, y: 0, width: 2560, height: 1440 },
    ...overrides
  };
  const watcher = new Watcher({
    isEnabled: () => env.enabled,
    getProfileId: () => env.profileId,
    getGame: () => env.game,
    isGameInFront: () => env.inFront,
    isInMap: () => env.inMap,
    getGameWindow: () => env.gameWindow,
    readScreen: () => {
      log.screenReads += 1;
      return new Uint8Array(4);
    },
    getCharacter: () => env.character,
    listPricedItems: () => ({
      complete: env.pricedComplete,
      items: [{ name: 'Exalted Orb', icon: 'exalted-url' }, { name: 'No Art', icon: null }]
    }),
    getIconPath: () => env.icons['Exalted Orb'],
    loadArt: () => {
      log.artLoads += 1;
      return { coarse: new Uint8Array(0), fine: new Uint8Array(0) };
    },
    onGain: (sessionId, items, mapCount) => log.gains.push({ sessionId, items, mapCount }),
    onStatus: (kind) => log.statuses.push(kind),
    now: () => env.now
  });
  return { watcher, log, env, setRead: (next) => { read = next; } };
}

function readBaseline(context, items) {
  context.setRead({ open: true, items });
  context.watcher.tick();
}

test('a map is settled by the first automatic read after it, against the last read before it', () => {
  const context = setup();
  const { watcher, log, setRead } = context;

  readBaseline(context, { 'Exalted Orb': 5 });
  readBaseline(context, {});
  watcher.mapEntered();
  assert.equal(watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' }), true);
  setRead({ open: true, items: { 'Exalted Orb': 2 } });
  watcher.tick();

  assert.deepEqual(log.gains, [{ sessionId: 's1', items: [{ name: 'Exalted Orb', quantity: 2 }], mapCount: 1 }]);
  assert.deepEqual(log.statuses, ['reading']);
});

test('a closed inventory neither settles a map nor changes the baseline', () => {
  const context = setup();
  const { watcher, log, setRead } = context;

  readBaseline(context, { 'Exalted Orb': 1 });
  watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' });
  setRead({ open: false, items: {} });
  watcher.tick();
  assert.deepEqual(log.gains, []);

  setRead({ open: true, items: { 'Exalted Orb': 3 } });
  watcher.tick();
  assert.deepEqual(log.gains[0].items, [{ name: 'Exalted Orb', quantity: 2 }]);
});

test('nothing reads the screen in a map, with the game behind, when off, signed out or with no character', () => {
  for (const blocked of [{ inMap: true }, { inFront: false }, { enabled: false }, { profileId: null }, { character: null }]) {
    const { watcher, log } = setup(blocked);
    watcher.tick();
    assert.equal(log.screenReads, 0, JSON.stringify(blocked));
  }
});

test('a game without a measured layout is left alone', () => {
  const { watcher, log } = setup({ game: 'poe1' });

  watcher.tick();
  watcher.readNow();

  assert.equal(log.screenReads, 0);
  assert.deepEqual(log.statuses, ['unsupported']);
  assert.equal(watcher.sessionEnded({ id: 's1', poeVersion: 'poe1' }), false);
});

test('a window height not checked on real screenshots is left alone and the hotkey says why', () => {
  const { watcher, log } = setup({ gameWindow: { x: 0, y: 0, width: 1920, height: 1080 } });

  watcher.tick();
  watcher.readNow();

  assert.equal(log.screenReads, 0);
  assert.deepEqual(log.statuses, ['resolution']);
  assert.equal(watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' }), false);
});

test('a map can still be settled when the window lookup misses at its end or the game is minimized', () => {
  for (const gameWindow of [null, { x: 0, y: 0, width: 2560, height: 1440, minimized: true }]) {
    const context = setup();
    const { watcher, log, env, setRead } = context;

    readBaseline(context, {});
    env.gameWindow = gameWindow;
    assert.equal(watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' }), true);

    env.gameWindow = { x: 0, y: 0, width: 2560, height: 1440 };
    setRead({ open: true, items: { 'Exalted Orb': 2 } });
    watcher.tick();
    assert.deepEqual(log.gains, [{ sessionId: 's1', items: [{ name: 'Exalted Orb', quantity: 2 }], mapCount: 1 }]);
  }
});

test('reads wait until the priced art is complete, then stop looking for more', () => {
  const { watcher, log, env, setRead } = setup({ pricedComplete: false });
  setRead({ open: true, items: { 'Exalted Orb': 5 } });

  watcher.tick();
  assert.equal(log.screenReads, 0);

  env.pricedComplete = true;
  env.icons = {};
  watcher.tick();
  assert.equal(log.screenReads, 0);

  env.icons = { 'Exalted Orb': '/icons/exalted.png' };
  watcher.tick();
  assert.equal(log.screenReads, 1);
  assert.equal(log.artLoads, 1);

  watcher.tick();
  assert.equal(log.artLoads, 1);
});

test('an icon that never arrives stops holding reads back after the wait', () => {
  const { watcher, log, env } = setup({ icons: {} });

  watcher.tick();
  assert.equal(log.screenReads, 0);

  env.now = 60_000;
  watcher.tick();
  assert.equal(log.screenReads, 1);
});

test('a map after a sign-out and back has no baseline from before', () => {
  const context = setup();
  const { watcher, log, env, setRead } = context;

  readBaseline(context, { 'Exalted Orb': 5 });
  env.profileId = 'p2';
  watcher.sessionEnded({ id: 's2', poeVersion: 'poe2' });
  setRead({ open: true, items: { 'Exalted Orb': 9 } });
  watcher.tick();

  assert.deepEqual(log.gains, []);
  assert.deepEqual(log.statuses, ['noBaseline']);
});

test('a read after several maps reports how many it covers', () => {
  const context = setup();
  const { watcher, log, setRead } = context;

  readBaseline(context, {});
  watcher.mapEntered();
  watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' });
  watcher.mapEntered();
  watcher.sessionEnded({ id: 's2', poeVersion: 'poe2' });
  setRead({ open: true, items: { 'Exalted Orb': 2 } });
  watcher.tick();

  assert.deepEqual(log.gains, [{ sessionId: 's2', items: [{ name: 'Exalted Orb', quantity: 2 }], mapCount: 2 }]);
});

test('an unchanged read after a map without a session still clears the count of maps', () => {
  const context = setup();
  const { watcher, log, setRead } = context;

  readBaseline(context, { 'Exalted Orb': 1 });
  watcher.mapEntered();
  readBaseline(context, { 'Exalted Orb': 1 });
  watcher.mapEntered();
  watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' });
  setRead({ open: true, items: { 'Exalted Orb': 2 } });
  watcher.tick();

  assert.equal(log.gains[0].mapCount, 1);
});

test('a map with no change reports that no loot was found', () => {
  const context = setup();
  const { watcher, log, setRead } = context;

  readBaseline(context, { 'Exalted Orb': 5 });
  watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' });
  setRead({ open: true, items: { 'Exalted Orb': 5 } });
  watcher.tick();

  assert.deepEqual(log.gains, []);
  assert.deepEqual(log.statuses, ['noGain']);
});

test('a map ended with no known character cannot be settled', () => {
  const { watcher } = setup({ character: null });

  assert.equal(watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' }), false);
});

test('the hotkey explains itself in every state', () => {
  const inMap = setup({ inMap: true });
  inMap.watcher.readNow();
  assert.deepEqual(inMap.log.statuses, ['inMap']);

  const loading = setup({ pricedComplete: false });
  loading.watcher.readNow();
  assert.deepEqual(loading.log.statuses, ['notReady']);

  const noCharacter = setup({ character: null });
  noCharacter.watcher.readNow();
  assert.deepEqual(noCharacter.log.statuses, ['notReady']);

  const closed = setup();
  closed.setRead({ open: false, items: {} });
  closed.watcher.readNow();
  assert.deepEqual(closed.log.statuses, ['notOpen']);

  const open = setup();
  open.setRead({ open: true, items: { 'Exalted Orb': 1 } });
  open.watcher.readNow();
  assert.deepEqual(open.log.statuses, ['saved']);
});

test('the hotkey settles a finished map like an automatic read does', () => {
  const context = setup({ enabled: false });
  const { watcher, log, setRead } = context;

  setRead({ open: true, items: {} });
  watcher.readNow();
  watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' });
  setRead({ open: true, items: { 'Exalted Orb': 2 } });
  watcher.tick();
  assert.deepEqual(log.gains, []);

  watcher.readNow();
  assert.deepEqual(log.gains, [{ sessionId: 's1', items: [{ name: 'Exalted Orb', quantity: 2 }], mapCount: 1 }]);
});

test('a read with part of the grid covered neither settles a map nor changes the baseline', () => {
  const context = setup();
  const { watcher, log, setRead } = context;

  readBaseline(context, { 'Exalted Orb': 5 });
  watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' });
  setRead({ open: true, covered: true, items: {} });
  watcher.tick();
  assert.deepEqual(log.gains, []);

  watcher.readNow();
  assert.deepEqual(log.statuses, ['covered']);

  setRead({ open: true, items: { 'Exalted Orb': 7 } });
  watcher.tick();
  assert.deepEqual(log.gains, [{ sessionId: 's1', items: [{ name: 'Exalted Orb', quantity: 2 }], mapCount: 1 }]);
});

test('a screen that cannot be read says so', () => {
  const { watcher, log } = setup();
  watcher.deps.readScreen = () => null;

  watcher.readNow();

  assert.deepEqual(log.statuses, ['failed']);
});
