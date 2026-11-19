const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const vision = require('../src/modules/inventoryVision');
const { createInventoryReadWorker } = require('../src/modules/inventoryReadWorker');
const InventoryWatcher = require('../src/modules/inventoryWatcher');

const GRID = vision.getGridRect('poe2', { x: 0, y: 0, width: 2560, height: 1440 });

// An inventory grid with art in two cells, as the vision tests draw it, so a real read has something to name.
function artPixels(size, seed) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      data[i] = Math.round(127 + 127 * Math.sin(seed * 3.1 + (x / size) * (5 + seed)));
      data[i + 1] = Math.round(127 + 127 * Math.sin(seed * 1.7 + (y / size) * (7 + seed)));
      data[i + 2] = Math.round(127 + 127 * Math.cos(seed * 2.3 + ((x + y) / size) * (3 + seed)));
      data[i + 3] = 255;
    }
  }
  return data;
}

function inventoryImage() {
  const data = new Uint8Array(GRID.width * GRID.height * 4);
  for (let y = 0; y < GRID.height; y += 1) {
    for (let x = 0; x < GRID.width; x += 1) {
      const i = (y * GRID.width + x) * 4;
      const border = x % Math.round(GRID.pitchX) === 0 || y % Math.round(GRID.pitchY) === 0;
      data.set(border ? [58, 58, 58, 255] : [40, 16, 8, 255], i);
    }
  }
  const paint = (col, row, seed) => {
    const size = Math.round(GRID.pitchX * 0.97);
    const pixels = artPixels(size, seed);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const to = ((Math.round(row * GRID.pitchY) + y + 1) * GRID.width + Math.round(col * GRID.pitchX) + x) * 4;
        data.set(pixels.subarray((y * size + x) * 4, (y * size + x) * 4 + 3), to);
      }
    }
  };
  paint(0, 0, 1);
  paint(3, 1, 2);
  for (let col = 1; col < GRID.cols; col += 1) {
    for (let y = 0; y < GRID.height; y += 1) data.set([58, 58, 58], (y * GRID.width + Math.round(col * GRID.pitchX)) * 4);
  }
  for (let row = 1; row < GRID.rows; row += 1) {
    for (let x = 0; x < GRID.width; x += 1) data.set([58, 58, 58], (Math.round(row * GRID.pitchY) * GRID.width + x) * 4);
  }
  return { data, width: GRID.width, height: GRID.height };
}

const ART = [
  { name: 'First Orb', value: 0.1, coarse: artPixels(vision.COARSE_SIZE, 1), fine: artPixels(vision.FINE_ART_SIZE, 1) },
  { name: 'Second Orb', value: 0.1, coarse: artPixels(vision.COARSE_SIZE, 2), fine: artPixels(vision.FINE_ART_SIZE, 2) }
];

test('the worker reads what the main thread reads and gives back what it added to the cache', async () => {
  const reader = createInventoryReadWorker();
  try {
    const image = inventoryImage();
    const direct = vision.readInventory(image, GRID, ART, new Map());
    assert.deepEqual(Object.keys(direct.items).sort(), ['First Orb', 'Second Orb']);

    const cache = new Map();
    const { read, added } = await reader.read(image, GRID, ART, cache, null);
    assert.deepEqual(read, direct);
    assert.equal(added.length, 2);
    assert.equal(cache.size, 0, 'the caller decides whether the entries join its cache');

    for (const [key, value] of added) cache.set(key, value);
    const again = await reader.read(image, GRID, ART, cache, null);
    assert.deepEqual(again.read, direct);
    assert.deepEqual(again.added, [], 'cached cells are not read again');
    assert.equal(reader.isOnMainThread(), false);
  } finally {
    reader.close();
  }
});

// A worker that answers when the test says so.
function fakeWorker() {
  const worker = new EventEmitter();
  worker.posted = [];
  worker.terminated = false;
  worker.postMessage = (message) => worker.posted.push(message);
  worker.terminate = () => { worker.terminated = true; };
  worker.answer = (index, reply) => worker.emit('message', { id: worker.posted[index].id, ...reply });
  return worker;
}

test('the art and the named pictures are sent only when they change, and prices with every read', async () => {
  const worker = fakeWorker();
  const reader = createInventoryReadWorker({ createWorker: () => worker });
  const image = { data: new Uint8Array(4), width: 1, height: 1 };
  const learned = [{ name: 'Named', width: 1, height: 1, data: new Uint8Array(3) }];

  // Reads still waiting when the reader closes fail; nobody waits for them here.
  const read = (...args) => reader.read(...args).catch(() => {});
  read(image, GRID, ART, new Map(), learned);
  read(image, GRID, ART, new Map(), learned);
  ART[0].value = 3;
  const moreArt = [...ART];
  read(image, GRID, moreArt, new Map(), null);
  ART[0].value = 0.1;

  assert.equal(worker.posted[0].art.length, 2);
  assert.equal(worker.posted[0].learnedChanged, true);
  assert.equal(worker.posted[1].art, undefined);
  assert.equal(worker.posted[1].learnedChanged, undefined);
  assert.deepEqual(worker.posted[2].values, [3, 0.1]);
  assert.equal(worker.posted[2].art.length, 2);
  assert.equal(worker.posted[2].learnedChanged, true);
  assert.equal(worker.posted[2].learned, null);
  reader.close();
});

test('the cache goes with each read, so emptying it on the main thread empties it for the worker', () => {
  const worker = fakeWorker();
  const reader = createInventoryReadWorker({ createWorker: () => worker });
  const cache = new Map([[7, { name: 'First Orb', quantity: 1, digits: false }]]);
  const image = { data: new Uint8Array(4), width: 1, height: 1 };

  reader.read(image, GRID, ART, cache, null).catch(() => {});
  cache.clear();
  reader.read(image, GRID, ART, cache, null).catch(() => {});

  assert.deepEqual(worker.posted[0].cache, [[7, { name: 'First Orb', quantity: 1, digits: false }]]);
  assert.deepEqual(worker.posted[1].cache, []);
  reader.close();
});

test('a worker that cannot start leaves reading on the main thread, into the caller\'s cache', async () => {
  const fallbacks = [];
  const reader = createInventoryReadWorker({
    createWorker: () => { throw new Error('no workers here'); },
    onFallback: (error) => fallbacks.push(error.message)
  });
  const cache = new Map();

  const { read, added } = await reader.read(inventoryImage(), GRID, ART, cache, null);

  assert.deepEqual(Object.keys(read.items).sort(), ['First Orb', 'Second Orb']);
  assert.deepEqual(added, []);
  assert.equal(cache.size, 2);
  assert.deepEqual(fallbacks, ['no workers here']);
  assert.equal(reader.isOnMainThread(), true);
});

test('a worker that fails, stops or does not answer hands the reads in progress a failure and reading to the main thread', async () => {
  for (const breakIt of [
    (worker) => worker.emit('error', new Error('boom')),
    (worker) => worker.emit('exit', 1),
    () => {}
  ]) {
    const worker = fakeWorker();
    const fallbacks = [];
    const reader = createInventoryReadWorker({ createWorker: () => worker, timeoutMs: 20, onFallback: (error) => fallbacks.push(error) });

    const pending = reader.read(inventoryImage(), GRID, ART, new Map(), null);
    breakIt(worker);
    await assert.rejects(pending);
    assert.equal(worker.terminated, true);
    assert.equal(fallbacks.length, 1);

    const { read } = await reader.read(inventoryImage(), GRID, ART, new Map(), null);
    assert.deepEqual(Object.keys(read.items).sort(), ['First Orb', 'Second Orb']);
    assert.equal(worker.posted.length, 1, 'nothing more is sent to a broken worker');
  }
});

test('a read the worker could not do is a failed read, and the worker goes on', async () => {
  const worker = fakeWorker();
  const reader = createInventoryReadWorker({ createWorker: () => worker });
  const image = { data: new Uint8Array(4), width: 1, height: 1 };

  const first = reader.read(image, GRID, ART, new Map(), null);
  worker.answer(0, { error: 'bad image' });
  await assert.rejects(first, /bad image/);

  const second = reader.read(image, GRID, ART, new Map(), null);
  worker.answer(1, { read: { open: false, items: {} }, added: [] });
  assert.deepEqual(await second, { read: { open: false, items: {} }, added: [] });
  assert.equal(reader.isOnMainThread(), false);
  reader.close();
});

// The watcher with a reader that answers when the test says so.
function setupWatcher() {
  const env = { profileId: 'p1', character: { id: 'c1' }, game: 'poe2', inMap: false };
  const log = { statuses: [], gains: [], reads: [], screenReads: 0 };
  const answers = [];
  const watcher = new InventoryWatcher({
    isEnabled: () => true,
    getProfileId: () => env.profileId,
    getGame: () => env.game,
    isGameInFront: () => true,
    isInMap: () => env.inMap,
    isInMapHub: () => true,
    getGameWindow: () => ({ x: 0, y: 0, width: 2560, height: 1440 }),
    readScreen: () => { log.screenReads += 1; return new Uint8Array(4); },
    getCharacter: () => env.character,
    listPricedItems: () => ({ complete: true, items: [{ name: 'Exalted Orb', icon: 'exalted-url' }] }),
    getIconPath: () => '/icons/exalted.png',
    loadArt: () => ({ coarse: new Uint8Array(0), fine: new Uint8Array(0) }),
    readInventory: (image, grid, art, cache) => new Promise((resolve, reject) => answers.push({ resolve, reject, cache })),
    onGain: (sessionId, items) => log.gains.push({ sessionId, items }),
    onStatus: (kind) => log.statuses.push(kind),
    onRead: (kind) => log.reads.push(kind),
    now: () => 0
  });
  const open = (items) => ({
    read: { open: true, items, cells: Object.fromEntries(Object.entries(items).map(([name, quantity]) => [name, { name, quantity, digits: true }])) },
    added: [[1, { name: 'Exalted Orb', quantity: 1, digits: true }]]
  });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return { watcher, env, log, answers, open, settle };
}

test('while a read runs off the main thread, the next ticks wait for it', async () => {
  const { watcher, log, answers, open, settle } = setupWatcher();

  watcher.tick();
  watcher.tick();
  watcher.tick();
  assert.equal(log.screenReads, 1);

  answers[0].resolve(open({ 'Exalted Orb': 5 }));
  await settle();
  assert.equal(watcher.hasBaseline('poe2'), true);
  assert.equal(watcher.cellCache.size, 1, 'what the read added joins the cache');

  watcher.tick();
  assert.equal(log.screenReads, 2);
});

test('an answer that comes after the profile, the game, the character or the cache changed is dropped', async () => {
  // Cells read against art that has changed since do not join the cache; another profile or character reads the same
  // art, so its cells may.
  for (const [change, cacheKept] of [
    [({ env }) => { env.profileId = 'p2'; }, 1],
    [({ env }) => { env.character = { id: 'c2' }; }, 1],
    [({ watcher }) => { watcher.clearCellCache(); }, 0],
    [({ watcher }) => { watcher.resetArt('poe1'); }, 0]
  ]) {
    const context = setupWatcher();
    const { watcher, answers, open, settle } = context;
    watcher.tick();
    change(context);
    answers[0].resolve(open({ 'Exalted Orb': 5 }));
    await settle();

    assert.equal(Object.keys(watcher.state.baselines).length, 0, change.toString());
    assert.equal(watcher.cellCache.size, cacheKept, change.toString());
    assert.equal(watcher.reading, null);
  }
});

test('an answer for a map that ended meanwhile settles it: the read was taken after the map', async () => {
  const { watcher, log, answers, open, settle } = setupWatcher();
  watcher.tick();
  answers[0].resolve(open({ 'Exalted Orb': 5 }));
  await settle();

  watcher.mapEntered();
  watcher.tick();
  assert.equal(watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' }), true);
  answers[1].resolve(open({ 'Exalted Orb': 7 }));
  await settle();

  assert.deepEqual(log.gains, [{ sessionId: 's1', items: [{ name: 'Exalted Orb', quantity: 2 }] }]);
});

test('a screen read before a map that ended before the answer came is that map\'s start, not its result', async () => {
  const { watcher, log, answers, open, settle } = setupWatcher();
  watcher.tick();
  answers[0].resolve(open({ 'Exalted Orb': 5 }));
  await settle();

  // 3 orbs leave the stash, the screen is read, then a map is entered and ended before the answer comes.
  watcher.tick();
  watcher.mapEntered();
  assert.equal(watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' }), true);
  answers[1].resolve(open({ 'Exalted Orb': 8 }));
  await settle();
  assert.deepEqual(log.gains, []);

  // The read after the map counts it from the inventory it started with.
  watcher.tick();
  answers[2].resolve(open({ 'Exalted Orb': 10 }));
  await settle();
  assert.deepEqual(log.gains, [{ sessionId: 's1', items: [{ name: 'Exalted Orb', quantity: 2 }] }]);
});

test('a map whose end is marked after the read after it is still settled by that read', async () => {
  const { watcher, log, answers, open, settle } = setupWatcher();
  watcher.tick();
  answers[0].resolve(open({ 'Exalted Orb': 5 }));
  await settle();

  // The map was entered and left before the screen was read; ending it took a moment longer than the read.
  watcher.mapEntered();
  watcher.tick();
  watcher.sessionEnded({ id: 's1', poeVersion: 'poe2' });
  answers[1].resolve(open({ 'Exalted Orb': 7 }));
  await settle();

  assert.deepEqual(log.gains, [{ sessionId: 's1', items: [{ name: 'Exalted Orb', quantity: 2 }] }]);
});

test('a failure in what a read is handed to says "failed" to a key press and leaves reading free', async () => {
  const { watcher, log, answers, open, settle } = setupWatcher();
  watcher.deps.onStatus = (kind) => {
    if (kind === 'saved') throw new Error('the window is gone');
    log.statuses.push(kind);
  };

  watcher.readNow();
  answers[0].resolve(open({ 'Exalted Orb': 5 }));
  await settle();

  assert.deepEqual(log.statuses, ['failed']);
  assert.equal(watcher.reading, null);
  watcher.tick();
  assert.equal(log.screenReads, 2);
});

test('a key press during a read is read after it, and a read that fails says so', async () => {
  const { watcher, log, answers, open, settle } = setupWatcher();

  watcher.tick();
  watcher.readNow();
  assert.equal(log.screenReads, 1);

  answers[0].resolve(open({ 'Exalted Orb': 5 }));
  await settle();
  assert.equal(log.screenReads, 2, 'the key press reads the screen once the first read is done');

  answers[1].reject(new Error('worker gone'));
  await settle();
  assert.deepEqual(log.statuses, ['failed']);
  assert.equal(watcher.reading, null);
});
