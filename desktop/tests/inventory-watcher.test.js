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
          // A script can add cells of its own, such as an item left unread.
          return { ...read, cells: { ...cells, ...(read.extraCells || {}) } };
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
  const log = { statuses: [], reads: [], gains: [], unread: [], artLoads: 0, screenReads: 0 };
  let read = { open: true, items: {} };
  const Watcher = loadWatcher(() => read);
  const env = {
    now: 0,
    inMap: false,
    inMapHub: true,
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
    isInMapHub: () => env.inMapHub,
    getGameWindow: () => env.gameWindow,
    readScreen: () => {
      log.screenReads += 1;
      return new Uint8Array(4);
    },
    getCharacter: () => env.character,
    listPricedItems: () => ({
      complete: env.pricedComplete,
      items: env.pricedItems || [{ name: 'Exalted Orb', icon: 'exalted-url' }, { name: 'No Art', icon: null }]
    }),
    getIconPath: (url) => (env.iconFor ? env.iconFor(url) : env.icons['Exalted Orb']),
    loadArt: () => {
      log.artLoads += 1;
      return { coarse: new Uint8Array(0), fine: new Uint8Array(0) };
    },
    onGain: (sessionId, items, mapCount, unread, candidates) => log.gains.push({ sessionId, items, mapCount, ...(unread ? { unread, candidates } : {}) }),
    onUnreadLoot: (sessionId, candidates) => log.unread.push(candidates && candidates.length ? [sessionId, candidates] : sessionId),
    onStatus: (kind) => log.statuses.push(kind),
    onRead: (kind) => log.reads.push(kind),
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

test('time away from the game does not end loading with most of the art still to load', () => {
  const pricedItems = Array.from({ length: 100 }, (_, index) => ({ name: `Item ${index}`, icon: `url-${index}` }));
  const { watcher, log, env } = setup({ pricedItems, iconFor: (url) => `/icons/${url}.png` });

  watcher.tick();
  assert.equal(log.screenReads, 0);

  // The player looks away for over a minute, then comes back to the game.
  env.now = 90_000;
  watcher.tick();
  assert.equal(log.screenReads, 0, 'read with only part of the art loaded');

  watcher.tick();
  assert.equal(watcher.art.items.size, 100);
  assert.equal(log.screenReads, 1);
});

test('an icon that arrives after reading started still joins the library', () => {
  const pricedItems = [{ name: 'Early', icon: 'early' }, { name: 'Late', icon: 'late' }];
  const available = new Set(['early']);
  const { watcher, log, env } = setup({ pricedItems, iconFor: (url) => (available.has(url) ? `/icons/${url}.png` : null) });

  watcher.tick();
  env.now = 60_000;
  watcher.tick();
  assert.equal(log.screenReads, 1);
  assert.equal(watcher.art.items.size, 1);

  available.add('late');
  watcher.cellCache.set(1, null);
  watcher.tick();
  assert.equal(watcher.art.items.size, 2);
  assert.equal(watcher.art.list.length, 2);
  assert.equal(watcher.cellCache.size, 0, 'a cell read without the new art has to be read again');
});

test('an icon that never arrives stops holding reads back after the wait', () => {
  const { watcher, log, env } = setup({ icons: {} });

  watcher.tick();
  assert.equal(log.screenReads, 0);

  env.now = 14_999;
  watcher.tick();
  assert.equal(log.screenReads, 0);

  env.now = 15_000;
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

test('every read that applies something reports how it went, and an unchanged automatic read stays silent', () => {
  const context = setup();
  const { watcher, log, setRead } = context;

  // The first read only notes the inventory.
  readBaseline(context, { 'Exalted Orb': 5 });
  assert.deepEqual(log.reads, ['saved']);

  // Nothing changed since: an automatic read says nothing, the hotkey still does.
  watcher.tick();
  assert.deepEqual(log.reads, ['saved']);
  watcher.readNow();
  assert.deepEqual(log.reads, ['saved', 'saved']);

  // A map with nothing new in the inventory afterwards.
  watcher.mapEntered();
  watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' });
  watcher.tick();
  assert.deepEqual(log.reads.slice(2), ['noGain']);

  watcher.mapEntered();
  watcher.sessionEnded({ id: 's2', poeVersion: 'poe2' });
  setRead({ open: true, items: { 'Exalted Orb': 7 } });
  watcher.tick();
  assert.deepEqual(log.reads.slice(3), ['gain']);
  assert.deepEqual(log.statuses.slice(-1), ['reading']);
});

test('a map finished with no inventory read before it reports noBaseline', () => {
  const { watcher, log } = setup();

  watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' });
  watcher.tick();

  assert.deepEqual(log.reads, ['noBaseline']);
  assert.deepEqual(log.statuses, ['noBaseline']);
});

test('the timer reports a window not measured when it starts and when it ends, only while it could read', () => {
  const poe1 = setup({ game: 'poe1' });
  poe1.watcher.tick();
  assert.deepEqual(poe1.log.reads, [], 'PoE 1 has nothing to read or report');

  const small = setup({ gameWindow: { x: 0, y: 0, width: 1920, height: 1080 } });
  small.watcher.tick();
  small.watcher.tick();
  assert.deepEqual(small.log.reads, ['resolution'], 'once, not every tick');
  assert.equal(small.log.screenReads, 0);

  // A baseline at 1440p, a window that turns small, then 1440p again with the same inventory: no read applies
  // anything new, and the line still clears.
  const resized = setup();
  resized.watcher.tick();
  assert.deepEqual(resized.log.reads, ['saved']);
  resized.env.gameWindow = { x: 0, y: 0, width: 1920, height: 1080 };
  resized.watcher.tick();
  resized.env.gameWindow = { x: 0, y: 0, width: 2560, height: 1440 };
  resized.watcher.tick();
  resized.watcher.tick();
  assert.deepEqual(resized.log.reads, ['saved', 'resolution', 'measured']);

  // A lookup that misses and a minimized window are not a resolution problem.
  for (const gameWindow of [null, { x: 0, y: 0, width: 2560, height: 1440, minimized: true }]) {
    const missing = setup({ gameWindow });
    missing.watcher.tick();
    assert.deepEqual(missing.log.reads, []);
  }

  for (const blocked of [{ inMap: true }, { inFront: false }, { enabled: false }, { profileId: null }]) {
    for (const overrides of [{ game: 'poe1' }, { gameWindow: { x: 0, y: 0, width: 1920, height: 1080 } }]) {
      const quiet = setup({ ...blocked, ...overrides });
      quiet.watcher.tick();
      assert.deepEqual(quiet.log.reads, [], JSON.stringify({ blocked, overrides }));
    }
  }
});

test('a watcher built without onRead still works', () => {
  const Watcher = loadWatcher(() => ({ open: true, items: {} }));
  const watcher = new Watcher({ isEnabled: () => false, getProfileId: () => 'p1', onStatus: () => {} });

  assert.doesNotThrow(() => watcher.deps.onRead('saved'));
});

test('a closed inventory with no baseline reports needsBaseline on every tick, and only then', () => {
  const context = setup();
  const { watcher, log, setRead } = context;

  setRead({ open: false, items: {} });
  watcher.tick();
  watcher.tick();
  assert.deepEqual(log.reads, ['needsBaseline', 'needsBaseline']);
  assert.equal(watcher.hasBaseline('poe2'), false);

  // The inventory open: that read is the baseline, not a request for one.
  readBaseline(context, { 'Exalted Orb': 1 });
  assert.equal(log.reads.at(-1), 'saved');
  assert.equal(watcher.hasBaseline('poe2'), true);

  // With a baseline a closed inventory says nothing.
  log.reads.length = 0;
  setRead({ open: false, items: {} });
  watcher.tick();
  assert.deepEqual(log.reads, []);
});

test('library art carries the item value in Divine Orbs, and an item without one stays unknown', () => {
  const context = setup({
    pricedItems: [{ name: 'Exalted Orb', icon: 'exalted-url', divineValue: 0.002 }, { name: 'Omen of Light', icon: 'light-url' }],
    iconFor: () => '/icons/any.png'
  });

  readBaseline(context, {});

  assert.deepEqual(
    context.watcher.art.list.map(({ name, value }) => ({ name, value })),
    [{ name: 'Exalted Orb', value: 0.002 }, { name: 'Omen of Light', value: null }]
  );
});

test('each read holds items to their current price, and a price of 0 counts as not known', () => {
  const prices = { 'Exalted Orb': 0.002, 'Omen of Light': 0 };
  const context = setup({
    pricedItems: [{ name: 'Exalted Orb', icon: 'exalted-url', divineValue: 0.002 }, { name: 'Omen of Light', icon: 'light-url', divineValue: 0 }],
    iconFor: () => '/icons/any.png'
  });
  let current = true;
  context.watcher.deps.getItemValues = (game) => (current && game === 'poe2' ? new Map(Object.entries(prices)) : null);
  const values = () => context.watcher.art.list.map(({ name, value }) => [name, value]);

  readBaseline(context, {});
  assert.deepEqual(values(), [['Exalted Orb', 0.002], ['Omen of Light', null]]);

  context.watcher.cellCache.set('cell', { name: 'Exalted Orb', quantity: 1 });
  readBaseline(context, {});
  assert.equal(context.watcher.cellCache.size, 1, 'unchanged prices keep the cached cells');

  prices['Omen of Light'] = 10.8;
  readBaseline(context, {});
  assert.deepEqual(values(), [['Exalted Orb', 0.002], ['Omen of Light', 10.8]]);
  assert.equal(context.watcher.cellCache.size, 0, 'a cell decided under the old prices is decided again');

  // Another league loaded for the Currency page leaves the values as they were.
  current = false;
  prices['Omen of Light'] = 0.3;
  readBaseline(context, {});
  assert.deepEqual(values(), [['Exalted Orb', 0.002], ['Omen of Light', 10.8]]);

  // An item missing from the current list counts as not known.
  current = true;
  delete prices['Exalted Orb'];
  readBaseline(context, {});
  assert.deepEqual(values(), [['Exalted Orb', null], ['Omen of Light', 0.3]]);
});

test('every read outcome tells which character it was for', () => {
  const context = setup();
  const { watcher, setRead } = context;
  const calls = [];
  watcher.deps.onRead = (kind, details) => calls.push([kind, details]);

  readBaseline(context, {});
  watcher.mapEntered();
  watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' });
  setRead({ open: true, items: { 'Exalted Orb': 1 } });
  watcher.tick();

  assert.deepEqual(calls, [['saved', { characterKey: 'poe2:c1' }], ['gain', { characterKey: 'poe2:c1' }]]);
});

test('needsBaseline carries the character, is per character, and hasBaseline follows the character', () => {
  const context = setup();
  const { watcher, env, setRead } = context;
  const calls = [];
  watcher.deps.onRead = (kind, details) => calls.push([kind, details]);

  setRead({ open: false, items: {} });
  watcher.tick();
  assert.deepEqual(calls, [['needsBaseline', { characterKey: 'poe2:c1' }]]);

  readBaseline(context, {});
  assert.equal(watcher.hasBaseline('poe2'), true);
  env.character = { id: 'c2' };
  assert.equal(watcher.hasBaseline('poe2'), false);
  assert.equal(watcher.hasBaseline('poe1'), false);
  env.character = null;
  assert.equal(watcher.hasBaseline('poe2'), false);
});

test('needsBaseline is not reported with the inventory covered, in a map, with the screen unreadable or at an unchecked size', () => {
  for (const [overrides, read] of [
    [{}, { open: true, covered: true, items: {} }],
    [{ inMap: true }, { open: false, items: {} }],
    // A town, a trial or a campaign zone is outside a map too, but the hint is for the hideout.
    [{ inMapHub: false }, { open: false, items: {} }],
    [{ gameWindow: { x: 0, y: 0, width: 1920, height: 1080 } }, { open: false, items: {} }],
    [{ game: 'poe1' }, { open: false, items: {} }]
  ]) {
    const context = setup(overrides);
    context.setRead(read);
    context.watcher.tick();
    assert.ok(!context.log.reads.includes('needsBaseline'), JSON.stringify(overrides));
  }
});

test('a map whose only new items were left unread is marked so, and a gain says when some were', () => {
  const context = setup();
  const { watcher, log, setRead } = context;

  readBaseline(context, { 'Exalted Orb': 1 });
  watcher.mapEntered();
  watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' });
  setRead({ open: true, items: { 'Exalted Orb': 1 }, extraCells: { '3,0': { unknown: true, candidates: ['Essence of Ruin', 'Greater Essence of Ruin'], quantity: 1 } } });
  watcher.tick();
  assert.deepEqual(log.unread, [['s1', [{ names: ['Essence of Ruin', 'Greater Essence of Ruin'], quantity: 1 }]]]);
  assert.deepEqual(log.gains, []);

  // The unread cell from the last map is not new any more; another one is.
  watcher.mapEntered();
  watcher.sessionEnded({ id: 's2', poeVersion: 'poe2' });
  setRead({ open: true, items: { 'Exalted Orb': 3 }, extraCells: { '3,0': { unknown: true }, '4,0': { unknown: true } } });
  watcher.tick();
  assert.deepEqual(log.gains, [{ sessionId: 's2', items: [{ name: 'Exalted Orb', quantity: 2 }], mapCount: 1, unread: true, candidates: [] }]);
  assert.equal(log.unread.length, 1);
});
