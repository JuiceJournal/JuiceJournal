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
        readInventory: (image, grid, art) => script(art)
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
  const log = { statuses: [], gains: [], saved: [], artLoads: 0, screenReads: 0 };
  let read = { open: true, items: {} };
  const Watcher = loadWatcher(() => read);
  const env = {
    now: 0,
    inMap: false,
    inFront: true,
    game: 'poe2',
    enabled: true,
    profileId: 'p1',
    baselines: {},
    character: { id: 'c1' },
    pricedComplete: true,
    icons: { 'Exalted Orb': '/icons/exalted.png' },
    ...overrides
  };
  const watcher = new Watcher({
    isEnabled: () => env.enabled,
    getProfileId: () => env.profileId,
    getGame: () => env.game,
    isGameInFront: () => env.inFront,
    isInMap: () => env.inMap,
    getGameWindow: () => ({ x: 0, y: 0, width: 2560, height: 1440 }),
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
    loadBaselines: () => env.baselines,
    saveBaselines: (profileId, baselines) => log.saved.push({ profileId, baselines }),
    onGain: (sessionId, items) => log.gains.push({ sessionId, items }),
    onStatus: (kind) => log.statuses.push(kind),
    now: () => env.now
  });
  return { watcher, log, env, setRead: (next) => { read = next; } };
}

test('a map is settled by the first automatic read after it, against the last read before it', () => {
  const { watcher, log, setRead } = setup();

  setRead({ open: true, items: { 'Exalted Orb': 5 } });
  watcher.tick();
  setRead({ open: true, items: {} });
  watcher.tick();
  assert.equal(watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' }), true);
  setRead({ open: true, items: { 'Exalted Orb': 2 } });
  watcher.tick();

  assert.deepEqual(log.gains, [{ sessionId: 's1', items: [{ name: 'Exalted Orb', quantity: 2 }] }]);
  assert.deepEqual(log.statuses, ['reading']);
});

test('a closed inventory neither settles a map nor changes the baseline', () => {
  const { watcher, log, setRead } = setup({ baselines: { 'poe2:c1': { 'Exalted Orb': 1 } } });

  watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' });
  setRead({ open: false, items: {} });
  watcher.tick();
  assert.deepEqual(log.gains, []);
  assert.deepEqual(log.saved, []);

  setRead({ open: true, items: { 'Exalted Orb': 3 } });
  watcher.tick();
  assert.deepEqual(log.gains[0].items, [{ name: 'Exalted Orb', quantity: 2 }]);
});

test('nothing reads the screen in a map, with the game behind, when off or when signed out', () => {
  for (const blocked of [{ inMap: true }, { inFront: false }, { enabled: false }, { profileId: null }]) {
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

test('the baseline is saved only when it changes', () => {
  const { watcher, log, setRead } = setup();

  setRead({ open: true, items: { 'Exalted Orb': 5 } });
  watcher.tick();
  watcher.tick();

  assert.equal(log.saved.length, 1);
  assert.deepEqual(log.saved[0], { profileId: 'p1', baselines: { 'poe2:c1': { 'Exalted Orb': 5 } } });
});

test('an empty first read is still saved as a baseline', () => {
  const { watcher, log } = setup();

  watcher.tick();

  assert.deepEqual(log.saved[0].baselines, { 'poe2:c1': {} });
});

test('a saved baseline survives a restart and belongs to its profile', () => {
  const { watcher, log, env, setRead } = setup({ baselines: { 'poe2:c1': { 'Exalted Orb': 5 } } });

  watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' });
  setRead({ open: true, items: { 'Exalted Orb': 6 } });
  watcher.tick();
  assert.deepEqual(log.gains[0].items, [{ name: 'Exalted Orb', quantity: 1 }]);

  env.profileId = 'p2';
  env.baselines = {};
  watcher.sessionEnded({ id: 's2', poeVersion: 'poe2' });
  setRead({ open: true, items: { 'Exalted Orb': 9 } });
  watcher.tick();
  assert.equal(log.gains.length, 1);
  assert.deepEqual(log.statuses.at(-1), 'noBaseline');
});

test('a map with no change reports that no loot was found', () => {
  const { watcher, log, setRead } = setup({ baselines: { 'poe2:c1': { 'Exalted Orb': 5 } } });

  watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' });
  setRead({ open: true, items: { 'Exalted Orb': 5 } });
  watcher.tick();

  assert.deepEqual(log.gains, []);
  assert.deepEqual(log.statuses, ['noGain']);
});

test('the hotkey explains itself in every state', () => {
  const inMap = setup({ inMap: true });
  inMap.watcher.readNow();
  assert.deepEqual(inMap.log.statuses, ['inMap']);

  const loading = setup({ pricedComplete: false });
  loading.watcher.readNow();
  assert.deepEqual(loading.log.statuses, ['notReady']);

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
  const { watcher, log, setRead } = setup({ enabled: false, baselines: { 'poe2:c1': {} } });

  watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' });
  setRead({ open: true, items: { 'Exalted Orb': 2 } });
  watcher.tick();
  assert.deepEqual(log.gains, []);

  watcher.readNow();
  assert.deepEqual(log.gains, [{ sessionId: 's1', items: [{ name: 'Exalted Orb', quantity: 2 }] }]);
});

test('a read with part of the grid covered neither settles a map nor changes the baseline', () => {
  const { watcher, log, setRead } = setup({ baselines: { 'poe2:c1': { 'Exalted Orb': 5 } } });

  watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' });
  setRead({ open: true, covered: true, items: {} });
  watcher.tick();
  assert.deepEqual(log.gains, []);
  assert.deepEqual(log.saved, []);

  watcher.readNow();
  assert.deepEqual(log.statuses, ['covered']);

  setRead({ open: true, items: { 'Exalted Orb': 7 } });
  watcher.tick();
  assert.deepEqual(log.gains, [{ sessionId: 's1', items: [{ name: 'Exalted Orb', quantity: 2 }] }]);
});

test('a screen that cannot be read says so', () => {
  const { watcher, log } = setup();
  watcher.deps.readScreen = () => null;

  watcher.readNow();

  assert.deepEqual(log.statuses, ['failed']);
});
