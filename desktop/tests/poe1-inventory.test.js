const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const InventoryWatcher = require('../src/modules/inventoryWatcher');
const { readCharacterInventory } = require('../src/modules/characterInventoryRead');
const PoeApiClient = require('../src/modules/poeApiClient');

const mainJsPath = path.join(__dirname, '..', 'main.js');
const mainSource = fs.readFileSync(mainJsPath, 'utf8').replace(/\r\n/g, '\n');

// Top-level functions of main.js, plain or async, each up to its closing brace in column zero.
function loadFunctions(functionNames, context) {
  for (const functionName of functionNames) {
    const match = new RegExp(`\\n(async )?function ${functionName}\\(`).exec(mainSource);
    assert.ok(match, `main.js should define ${functionName}()`);
    const end = mainSource.indexOf('\n}\n', match.index);
    vm.runInContext(`${mainSource.slice(match.index, end + 2)};\nthis.${functionName} = ${functionName};`, context);
  }
  return context;
}

const stack = (baseType, stackSize, x) => ({ baseType, typeLine: baseType, stackSize, maxStackSize: 20, x, y: 0, inventoryId: 'MainInventory' });
const read = (...stacks) => readCharacterInventory({ inventory: stacks });
const EXILE = { name: 'Exile' };

function createWatcher(overrides = {}) {
  const log = { gains: [], reads: [], statuses: [] };
  const env = { enabled: true, profileId: 'p1', game: 'poe1', character: EXILE, api: true, ...overrides };
  const watcher = new InventoryWatcher({
    isEnabled: () => env.enabled,
    getProfileId: () => env.profileId,
    getGame: () => env.game,
    isGameInFront: () => true,
    isInMap: () => false,
    getGameWindow: () => null,
    readScreen: () => { throw new Error('the screen is not read for Path of Exile 1'); },
    getCharacter: () => env.character,
    hasApiInventory: (game) => env.api && game === 'poe1',
    listPricedItems: () => ({ complete: true, items: [] }),
    getIconPath: () => null,
    loadArt: () => null,
    getItemValues: () => null,
    onGain: (sessionId, items, mapCount) => log.gains.push({ sessionId, items, mapCount }),
    onUnreadLoot: () => {},
    onStatus: (kind) => log.statuses.push(kind),
    onRead: (kind) => log.reads.push(kind)
  });
  return { watcher, log, env };
}

test('a Path of Exile 1 map is counted from the read at its entry and the read after it', () => {
  const { watcher, log } = createWatcher();

  watcher.mapEntered();
  assert.equal(watcher.applyApiRead('poe1', read(stack('Chaos Orb', 7, 0)), { character: EXILE }), true);
  assert.equal(watcher.hasBaseline('poe1'), true);
  assert.equal(watcher.sessionEnded({ id: 's1', poeVersion: 'poe1' }), true);
  assert.equal(watcher.applyApiRead('poe1', read(stack('Chaos Orb', 12, 0), stack('Divine Orb', 1, 1)), { character: EXILE, sessionId: 's1' }), true);

  assert.deepEqual(log.gains, [{
    sessionId: 's1',
    items: [{ name: 'Chaos Orb', quantity: 5 }, { name: 'Divine Orb', quantity: 1 }],
    mapCount: 1
  }]);
});

test('an entry read that arrives while a map is waiting is not taken', () => {
  const { watcher, log } = createWatcher();
  watcher.applyApiRead('poe1', read(stack('Chaos Orb', 7, 0)), { character: EXILE });
  watcher.sessionEnded({ id: 's1', poeVersion: 'poe1' });

  // The next map's entry read: 40 orbs were taken out of the stash meanwhile.
  assert.equal(watcher.applyApiRead('poe1', read(stack('Chaos Orb', 47, 0)), { character: EXILE }), false);
  assert.deepEqual(log.gains, []);

  watcher.applyApiRead('poe1', read(stack('Chaos Orb', 9, 0)), { character: EXILE, sessionId: 's1' });
  assert.deepEqual(log.gains.map((gain) => gain.items), [[{ name: 'Chaos Orb', quantity: 2 }]]);
});

test('a late read of one map never settles the map that ended after it', () => {
  const { watcher, log } = createWatcher();
  watcher.applyApiRead('poe1', read(stack('Chaos Orb', 7, 0)), { character: EXILE });
  watcher.sessionEnded({ id: 's1', poeVersion: 'poe1' });
  // The second map was entered and left while GGG had not answered for the first: its entry read was refused.
  assert.equal(watcher.applyApiRead('poe1', read(stack('Chaos Orb', 47, 0)), { character: EXILE }), false);
  watcher.sessionEnded({ id: 's2', poeVersion: 'poe1' });

  assert.equal(watcher.applyApiRead('poe1', read(stack('Chaos Orb', 60, 0)), { character: EXILE, sessionId: 's1' }), false);
  assert.deepEqual(log.gains, []);
  // Nor does a read with no session, or one that names a session nobody waits for.
  assert.equal(watcher.applyApiRead('poe1', read(stack('Chaos Orb', 60, 0)), { character: EXILE, sessionId: 's3' }), false);
  assert.deepEqual(log.gains, []);
});

test('a read asked for one character is not taken once the player is on another', () => {
  const { watcher, log, env } = createWatcher();
  watcher.applyApiRead('poe1', read(stack('Chaos Orb', 7, 0)), { character: EXILE });
  watcher.sessionEnded({ id: 's1', poeVersion: 'poe1' });

  env.character = { name: 'Other' };
  assert.equal(watcher.applyApiRead('poe1', read(stack('Chaos Orb', 99, 0)), { character: EXILE, sessionId: 's1' }), false);
  assert.equal(watcher.applyApiRead('poe1', read(stack('Chaos Orb', 99, 0)), { character: { name: 'Other' }, sessionId: 's1' }), false);
  assert.deepEqual(log.gains, []);
});

test('a map whose read will not come is dropped, and no later read is taken for it', () => {
  const { watcher, log } = createWatcher();
  watcher.applyApiRead('poe1', read(stack('Chaos Orb', 7, 0)), { character: EXILE });
  watcher.sessionEnded({ id: 's1', poeVersion: 'poe1' });

  watcher.dropPending('another-session');
  assert.deepEqual(log.statuses, []);
  watcher.dropPending('s1');
  assert.deepEqual(log.statuses, ['noBaseline']);
  assert.deepEqual(log.reads.slice(-1), ['noBaseline']);

  assert.equal(watcher.applyApiRead('poe1', read(stack('Chaos Orb', 47, 0)), { character: EXILE, sessionId: 's1' }), false);
  assert.deepEqual(log.gains, []);
});

test('the API read is not taken while reading is off, signed out, without a character or for another game', () => {
  for (const blocked of [{ enabled: false }, { profileId: null }, { character: null }, { api: false }]) {
    const { watcher } = createWatcher(blocked);
    assert.equal(watcher.applyApiRead('poe1', read(stack('Chaos Orb', 7, 0)), { character: EXILE }), false, JSON.stringify(blocked));
  }
  for (const blocked of [{ profileId: null }, { character: null }, { api: false }]) {
    const { watcher } = createWatcher(blocked);
    assert.equal(watcher.sessionEnded({ id: 's1', poeVersion: 'poe1' }), false, JSON.stringify(blocked));
  }
  const { watcher } = createWatcher();
  assert.equal(watcher.applyApiRead('poe2', read(stack('Chaos Orb', 7, 0)), { character: EXILE }), false);
  assert.equal(watcher.applyApiRead('poe1', null, { character: EXILE }), false);
});

function createClient(respond) {
  const client = new PoeApiClient();
  const requests = [];
  client.setTokens({ accessToken: 'access', expiresIn: 36000, scope: 'account:characters' });
  client.client = {
    defaults: client.client.defaults,
    async request(config) {
      requests.push(config);
      return respond(config);
    }
  };
  client._throttle = async () => {};
  return { client, requests };
}

test('the client asks for one character by name and gives back the character', async () => {
  const { client, requests } = createClient(() => ({ data: { character: { name: 'Exile Ö', inventory: [] } }, headers: {} }));

  assert.deepEqual(await client.getCharacter('Exile Ö'), { name: 'Exile Ö', inventory: [] });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[0].url, `/character/${encodeURIComponent('Exile Ö')}`);
});

test('the client gives null for an answer that holds no character', async () => {
  const { client } = createClient(() => ({ data: {}, headers: {} }));
  assert.equal(await client.getCharacter('Gone'), null);
});

async function withClock(run) {
  const realNow = Date.now;
  const clock = { now: realNow() };
  Date.now = () => clock.now;
  try {
    await run(clock);
  } finally {
    Date.now = realNow;
  }
}

function limitedClient(retryAfter) {
  const state = { limited: true };
  const made = createClient(() => {
    if (!state.limited) return { data: { character: { name: 'Exile' } }, headers: {} };
    const error = new Error('HTTP 429');
    error.response = { status: 429, headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter } };
    throw error;
  });
  return { ...made, state };
}

test('after "too many requests" no character request is sent until the wait is over', async () => {
  await withClock(async (clock) => {
    const { client, requests, state } = limitedClient('30');
    await assert.rejects(client.getCharacter('Exile'), { code: 'POE_RATE_LIMITED' });
    state.limited = false;
    clock.now += 29_000;
    await assert.rejects(client.getCharacter('Exile'), { code: 'POE_RATE_LIMITED', retryAfter: 1 });
    assert.equal(requests.length, 1);
    clock.now += 2_000;
    assert.deepEqual(await client.getCharacter('Exile'), { name: 'Exile' });
    assert.equal(requests.length, 2);
  });
});

test('a wait GGG did not put in numbers is still kept', async () => {
  await withClock(async (clock) => {
    const { client, requests, state } = limitedClient('soon');
    await assert.rejects(client.getCharacter('Exile'), { code: 'POE_RATE_LIMITED' });
    state.limited = false;
    clock.now += 30_000;
    await assert.rejects(client.getCharacter('Exile'), { code: 'POE_RATE_LIMITED' });
    assert.equal(requests.length, 1);
  });
});

// main.js's PoE 1 functions around a real watcher, with GGG's answers held until the test lets them go.
function createMain(overrides = {}) {
  const env = { character: EXILE, game: 'poe1', authenticated: true, readingEnabled: true, stashScope: false, ...overrides };
  const log = { asked: [], warned: [] };
  const waiting = [];
  const made = createWatcher();
  const dropped = [];
  const realDrop = made.watcher.dropPending.bind(made.watcher);
  made.watcher.dropPending = (sessionId) => { dropped.push(sessionId); realDrop(sessionId); };
  made.env.character = env.character;
  const context = vm.createContext({
    console: { warn: (...args) => log.warned.push(args.join(' ')) },
    setTimeout: (resolve) => resolve(),
    Date: { now: () => env.now ?? 0 },
    Promise,
    Boolean,
    POE1_SETTLE_DELAY_MS: 1500,
    POE1_SETTLE_DEADLINE_MS: 8000,
    readCharacterInventory,
    readParsedSetting: (key) => (key === 'inventoryReadEnabled' ? env.readingEnabled : undefined),
    get overlayCharacterState() { return env.character; },
    gameDetector: { getDetectedGame: () => env.game },
    poeApiClient: {
      isAuthenticated: () => env.authenticated,
      hasScope: (scope) => scope === 'account:stashes' && env.stashScope,
      getCharacter(name) {
        log.asked.push(name);
        return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
      }
    },
    inventoryWatcher: made.watcher
  });
  vm.runInContext('let poe1MapEntry = null;', context);
  loadFunctions(['canReadPoe1Inventory', 'fetchPoe1Inventory', 'startPoe1EntryRead', 'notePoe1MapExited', 'settlePoe1Inventory'], context);
  // The watcher asks main whether the game reads from the API, as it does in the app.
  made.watcher.deps.hasApiInventory = (game) => context.canReadPoe1Inventory(game);
  const carrying = (quantity) => ({ name: 'Exile', inventory: [stack('Chaos Orb', quantity, 0)] });
  const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
  const answer = async (value) => {
    await settle();
    const next = waiting.shift();
    assert.ok(next, 'GGG was not asked');
    if (value instanceof Error) next.reject(value); else next.resolve(typeof value === 'number' ? carrying(value) : value);
    await settle();
  };
  // A map as the app sees it end: left, its session marked as waiting, then settled.
  const endMap = (sessionId, { exited = true } = {}) => {
    if (exited) context.notePoe1MapExited();
    const session = { id: sessionId, poeVersion: env.game };
    return made.watcher.sessionEnded(session) ? context.settlePoe1Inventory(session) : Promise.resolve();
  };
  return { context, env, log, watcher: made.watcher, gains: made.log.gains, statuses: made.log.statuses, dropped, answer, endMap, waiting };
}

test('main counts a map from GGG at its entry and after it', async () => {
  const main = createMain();

  main.context.startPoe1EntryRead();
  await main.answer(7);
  const settled = main.endMap('s1');
  await main.answer(12);
  await settled;

  assert.deepEqual(main.log.asked, ['Exile', 'Exile']);
  assert.deepEqual(main.gains, [{ sessionId: 's1', items: [{ name: 'Chaos Orb', quantity: 5 }], mapCount: 1 }]);
  assert.deepEqual(main.dropped, []);
});

test('a map with no entry read is left uncounted and GGG is not asked again for it', async () => {
  const main = createMain();

  main.context.startPoe1EntryRead();
  await main.answer(Object.assign(new Error('limited'), { code: 'POE_RATE_LIMITED' }));
  await main.endMap('s1');

  assert.deepEqual(main.log.asked, ['Exile']);
  assert.deepEqual(main.gains, []);
  assert.deepEqual(main.dropped, ['s1']);
  assert.deepEqual(main.statuses, ['noBaseline']);
  assert.match(main.log.warned[0], /POE_RATE_LIMITED/);
});

test('a map whose read after it fails, or comes without an inventory, is left uncounted', async () => {
  for (const second of [new Error('offline'), { name: 'Exile' }, null]) {
    const main = createMain();
    main.context.startPoe1EntryRead();
    await main.answer(7);
    const settled = main.endMap('s1');
    await main.answer(second);
    await settled;
    assert.deepEqual(main.dropped, ['s1']);
    assert.deepEqual(main.gains, []);
  }
});

test('a slow answer for one map does not count the next map with what was taken from the stash', async () => {
  const main = createMain();

  main.context.startPoe1EntryRead();
  await main.answer(7);
  const first = main.endMap('s1');
  // Before GGG answers for the first map, 40 orbs leave the stash, the second map is entered and left.
  main.context.startPoe1EntryRead();
  const second = main.endMap('s2');
  await main.answer(12);
  await main.answer(47);
  await Promise.all([first, second]);

  assert.deepEqual(main.gains, []);
  assert.deepEqual(main.dropped.sort(), ['s1', 's2']);
});

test('an answer later than the deadline is not the inventory the map left behind', async () => {
  const main = createMain();

  main.context.startPoe1EntryRead();
  await main.answer(7);
  const settled = main.endMap('s1');
  main.env.now = 8001;
  await main.answer(47);
  await settled;

  assert.deepEqual(main.gains, []);
  assert.deepEqual(main.dropped, ['s1']);
});

test('one entry read counts one map: a second map ended on it stays uncounted', async () => {
  const main = createMain();

  main.context.startPoe1EntryRead();
  await main.answer(7);
  const first = main.endMap('s1');
  await main.answer(12);
  await first;
  await main.endMap('s2');

  assert.equal(main.gains.length, 1);
  assert.deepEqual(main.dropped, ['s2']);
  assert.equal(main.log.asked.length, 2);
});

test('a map ended before it was left is not counted: the player is still in it', async () => {
  const main = createMain();

  main.context.startPoe1EntryRead();
  await main.answer(7);
  await main.endMap('s1', { exited: false });

  assert.deepEqual(main.gains, []);
  assert.deepEqual(main.dropped, ['s1']);
  assert.equal(main.log.asked.length, 1);
});

test('nothing is asked with reading off, signed out, with stash access, without a character or in Path of Exile 2', async () => {
  for (const blocked of [{ readingEnabled: false }, { authenticated: false }, { stashScope: true }, { character: null }, { game: 'poe2' }]) {
    const main = createMain(blocked);
    main.context.startPoe1EntryRead();
    await main.endMap('s1');
    assert.deepEqual(main.log.asked, [], JSON.stringify(blocked));
    assert.deepEqual(main.gains, [], JSON.stringify(blocked));
    // With no API source the map never waits, so nothing tells the player it was not counted.
    assert.deepEqual(main.statuses, [], JSON.stringify(blocked));
  }
});

test('main wires the reads to map entry, to map exit and to the end of a map', () => {
  assert.ok(mainSource.includes("hasApiInventory: (game) => typeof canReadPoe1Inventory === 'function' && canReadPoe1Inventory(game),"));
  assert.ok(mainSource.includes("async function handleMapEntered(data) {\n  inventoryWatcher?.mapEntered();\n  if (typeof startPoe1EntryRead === 'function') {\n    startPoe1EntryRead();"));
  assert.ok(mainSource.includes("  logParser.on('mapExited', (data) => {\n    if (typeof notePoe1MapExited === 'function') {\n      notePoe1MapExited();\n    }"));
  assert.ok(mainSource.includes("    if (settlesFromApi && typeof settlePoe1Inventory === 'function') {\n      settlePoe1Inventory(session);\n    }"));
  // A map that reads from the API does not show as waiting for the player to open the inventory.
  assert.ok(mainSource.includes("const waitingOnRead = Boolean(session.noLoot) && inventoryCanSettle && !settlesFromApi && store.get('inventoryReadEnabled') !== false;"));
});
