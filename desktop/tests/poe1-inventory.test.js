const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const InventoryWatcher = require('../src/modules/inventoryWatcher');
const { readCharacterInventory } = require('../src/modules/characterInventoryRead');
const PoeApiClient = require('../src/modules/poeApiClient');

const mainJsPath = path.join(__dirname, '..', 'main.js');

// Top-level functions of main.js, plain or async, each up to its closing brace in column zero.
function loadFunctions(functionNames, context) {
  const source = fs.readFileSync(mainJsPath, 'utf8').replace(/\r\n/g, '\n');
  for (const functionName of functionNames) {
    const match = new RegExp(`\\n(async )?function ${functionName}\\(`).exec(source);
    assert.ok(match, `main.js should define ${functionName}()`);
    const end = source.indexOf('\n}\n', match.index);
    vm.runInContext(`${source.slice(match.index, end + 2)};\nthis.${functionName} = ${functionName};`, context);
  }
  return context;
}

const stack = (baseType, stackSize, x) => ({ baseType, typeLine: baseType, stackSize, maxStackSize: 20, x, y: 0, inventoryId: 'MainInventory' });
const read = (...stacks) => readCharacterInventory({ inventory: stacks });

function createWatcher(overrides = {}) {
  const log = { gains: [], reads: [], statuses: [] };
  const env = { enabled: true, profileId: 'p1', game: 'poe1', character: { name: 'Exile' }, api: true, ...overrides };
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
  assert.equal(watcher.applyApiRead('poe1', read(stack('Chaos Orb', 7, 0)), { settles: false }), true);
  assert.equal(watcher.hasBaseline('poe1'), true);
  assert.equal(watcher.sessionEnded({ id: 's1', poeVersion: 'poe1' }), true);
  assert.equal(watcher.applyApiRead('poe1', read(stack('Chaos Orb', 12, 0), stack('Divine Orb', 1, 1)), { settles: true }), true);

  assert.deepEqual(log.gains, [{
    sessionId: 's1',
    items: [{ name: 'Chaos Orb', quantity: 5 }, { name: 'Divine Orb', quantity: 1 }],
    mapCount: 1
  }]);
});

test('an entry read that arrives after the map ended does not count that map against an older inventory', () => {
  const { watcher, log } = createWatcher();
  watcher.applyApiRead('poe1', read(stack('Chaos Orb', 7, 0)), { settles: false });
  watcher.sessionEnded({ id: 's1', poeVersion: 'poe1' });

  // The late answer to the next map's entry read: 40 orbs were taken out of the stash meanwhile.
  assert.equal(watcher.applyApiRead('poe1', read(stack('Chaos Orb', 47, 0)), { settles: false }), false);
  assert.deepEqual(log.gains, []);

  watcher.applyApiRead('poe1', read(stack('Chaos Orb', 9, 0)), { settles: true });
  assert.deepEqual(log.gains.map((gain) => gain.items), [[{ name: 'Chaos Orb', quantity: 2 }]]);
});

test('a map whose read will not come is dropped, and no later read is taken for it', () => {
  const { watcher, log } = createWatcher();
  watcher.applyApiRead('poe1', read(stack('Chaos Orb', 7, 0)), { settles: false });
  watcher.sessionEnded({ id: 's1', poeVersion: 'poe1' });

  watcher.dropPending('another-session');
  assert.deepEqual(log.statuses, []);
  watcher.dropPending('s1');
  assert.deepEqual(log.statuses, ['noBaseline']);
  assert.deepEqual(log.reads.slice(-1), ['noBaseline']);

  watcher.applyApiRead('poe1', read(stack('Chaos Orb', 47, 0)), { settles: true });
  assert.deepEqual(log.gains, []);
});

test('the API read is not taken while reading is off, signed out, without a character or for another game', () => {
  for (const blocked of [{ enabled: false }, { profileId: null }, { character: null }, { api: false }]) {
    const { watcher } = createWatcher(blocked);
    assert.equal(watcher.applyApiRead('poe1', read(stack('Chaos Orb', 7, 0)), { settles: false }), false, JSON.stringify(blocked));
    // Whether reading is switched on is main's question when a map ends, as it is for screen reads.
    assert.equal(watcher.sessionEnded({ id: 's1', poeVersion: 'poe1' }), blocked.enabled === false, JSON.stringify(blocked));
  }
  const { watcher } = createWatcher();
  assert.equal(watcher.applyApiRead('poe2', read(stack('Chaos Orb', 7, 0)), { settles: false }), false);
  assert.equal(watcher.applyApiRead('poe1', null, { settles: false }), false);
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

test('the client gives null for a character the answer does not hold', async () => {
  const { client } = createClient(() => ({ data: {}, headers: {} }));
  assert.equal(await client.getCharacter('Gone'), null);
});

test('after "too many requests" no character request is sent until the wait is over', async () => {
  let limited = true;
  const { client, requests } = createClient(() => {
    if (!limited) return { data: { character: { name: 'Exile' } }, headers: {} };
    const error = new Error('HTTP 429');
    error.response = { status: 429, headers: { 'retry-after': '30' } };
    throw error;
  });
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    await assert.rejects(client.getCharacter('Exile'), { code: 'POE_RATE_LIMITED' });
    limited = false;
    now += 29_000;
    await assert.rejects(client.getCharacter('Exile'), { code: 'POE_RATE_LIMITED', retryAfter: 1 });
    assert.equal(requests.length, 1);
    now += 2_000;
    assert.deepEqual(await client.getCharacter('Exile'), { name: 'Exile' });
    assert.equal(requests.length, 2);
  } finally {
    Date.now = realNow;
  }
});

function createMain({ character = { name: 'Exile' }, game = 'poe1', authenticated = true, answers = [] } = {}) {
  const log = { asked: [], applied: [], dropped: [], warned: [] };
  const queue = answers.slice();
  const context = vm.createContext({
    console: { warn: (...args) => log.warned.push(args.join(' ')) },
    setTimeout: (resolve) => resolve(),
    Promise,
    Boolean,
    POE1_SETTLE_DELAY_MS: 1500,
    readCharacterInventory,
    overlayCharacterState: character,
    gameDetector: { getDetectedGame: () => game },
    poeApiClient: {
      isAuthenticated: () => authenticated,
      async getCharacter(name) {
        log.asked.push(name);
        const answer = queue.shift();
        if (answer instanceof Error) throw answer;
        return answer;
      }
    },
    inventoryWatcher: {
      readsFromApi: (value) => value === 'poe1' && authenticated,
      applyApiRead(value, inventoryRead, options) {
        log.applied.push({ game: value, items: inventoryRead.items, settles: options.settles });
        return true;
      },
      dropPending: (sessionId) => log.dropped.push(sessionId)
    }
  });
  vm.runInContext('let poe1EntryRead = null;', context);
  loadFunctions(['canReadPoe1Inventory', 'readPoe1Inventory', 'startPoe1EntryRead', 'settlePoe1Inventory'], context);
  return { context, log };
}

const carrying = (quantity) => ({ name: 'Exile', inventory: [stack('Chaos Orb', quantity, 0)] });

test('main asks GGG for the character at map entry and after the map, and hands both reads to the watcher', async () => {
  const { context, log } = createMain({ answers: [carrying(7), carrying(12)] });

  context.startPoe1EntryRead();
  await context.settlePoe1Inventory({ id: 's1', poeVersion: 'poe1' });

  assert.deepEqual(log.asked, ['Exile', 'Exile']);
  assert.deepEqual(log.applied, [
    { game: 'poe1', items: { 'Chaos Orb': 7 }, settles: false },
    { game: 'poe1', items: { 'Chaos Orb': 12 }, settles: true }
  ]);
  assert.deepEqual(log.dropped, []);
});

test('a map with no entry read is left uncounted and GGG is not asked again for it', async () => {
  const limited = Object.assign(new Error('limited'), { code: 'POE_RATE_LIMITED' });
  const { context, log } = createMain({ answers: [limited, carrying(12)] });

  context.startPoe1EntryRead();
  await context.settlePoe1Inventory({ id: 's1', poeVersion: 'poe1' });

  assert.deepEqual(log.asked, ['Exile']);
  assert.deepEqual(log.applied, []);
  assert.deepEqual(log.dropped, ['s1']);
  assert.match(log.warned[0], /POE_RATE_LIMITED/);
});

test('a map whose read after it fails, or comes without an inventory, is left uncounted', async () => {
  for (const second of [new Error('offline'), { name: 'Exile' }, null]) {
    const { context, log } = createMain({ answers: [carrying(7), second] });
    context.startPoe1EntryRead();
    await context.settlePoe1Inventory({ id: 's1', poeVersion: 'poe1' });
    assert.deepEqual(log.dropped, ['s1']);
    assert.equal(log.applied.length, 1);
  }
});

test('an entry read belongs to one map: the next map without one is not counted against it', async () => {
  const { context, log } = createMain({ answers: [carrying(7), carrying(12), carrying(40)] });

  context.startPoe1EntryRead();
  await context.settlePoe1Inventory({ id: 's1', poeVersion: 'poe1' });
  await context.settlePoe1Inventory({ id: 's2', poeVersion: 'poe1' });

  assert.deepEqual(log.dropped, ['s2']);
  assert.equal(log.asked.length, 2);
});

test('nothing is asked for Path of Exile 2, signed out, or without a character', async () => {
  for (const blocked of [{ game: 'poe2' }, { authenticated: false }, { character: null }]) {
    const { context, log } = createMain({ ...blocked, answers: [carrying(7), carrying(12)] });
    context.startPoe1EntryRead();
    await context.settlePoe1Inventory({ id: 's1', poeVersion: blocked.game || 'poe1' });
    assert.deepEqual(log.asked, [], JSON.stringify(blocked));
    assert.deepEqual(log.applied, [], JSON.stringify(blocked));
  }
});

test('main wires the reads to map entry and to the end of a map, and tells the watcher the API source', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8').replace(/\r\n/g, '\n');
  assert.ok(source.includes("hasApiInventory: (game) => typeof canReadPoe1Inventory === 'function' && canReadPoe1Inventory(game),"));
  assert.match(source, /async function handleMapEntered\(data\) \{\n  inventoryWatcher\?\.mapEntered\(\);\n  if \(typeof startPoe1EntryRead === 'function'\) \{\n    startPoe1EntryRead\(\);/);
  assert.ok(source.includes("    if (inventoryCanSettle && typeof settlePoe1Inventory === 'function') {\n      settlePoe1Inventory(session);\n    }"));
});
