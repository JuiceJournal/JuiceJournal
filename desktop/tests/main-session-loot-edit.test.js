const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const localJournal = require('../src/modules/localJournalModel');
const { getTopLootOutputs, normalizeMapResultForLedger } = require('../src/modules/mapResultStoreModel');

const mainJsPath = path.join(__dirname, '..', 'main.js');
const preloadJsPath = path.join(__dirname, '..', 'preload.js');
const NOW = new Date('2026-11-05T10:00:00.000Z');
const ENDED_AT = '2026-11-05T10:30:00.000Z';

// A top-level function of main.js, up to its closing brace in column zero.
function loadFunctions(functionNames, contextOverrides = {}) {
  const source = fs.readFileSync(mainJsPath, 'utf8').replace(/\r\n/g, '\n');
  const context = vm.createContext({ console: { log() {} }, ...contextOverrides });
  for (const functionName of functionNames) {
    const start = source.indexOf(`\nfunction ${functionName}(`);
    assert.notEqual(start, -1, `main.js should define ${functionName}()`);
    const end = source.indexOf('\n}\n', start);
    vm.runInContext(`${source.slice(start, end + 2)};\nthis.${functionName} = ${functionName};`, context);
  }
  return context;
}

function createBackend({ results = [], status = 'completed' } = {}) {
  const backend = { journal: { sessions: [] }, stored: { key: results } };
  const started = localJournal.startSession(backend.journal, {
    mapName: 'Dunes Map', poeVersion: 'poe1', league: 'Mirage', costChaos: 10, startedAt: '2026-11-05T10:00:00.000Z'
  }, { id: 'session-1', now: NOW });
  let ids = 0;
  const added = localJournal.addLoot(started.journal, 'session-1', [
    { itemName: 'Divine Orb', chaosValue: 100, quantity: 2 },
    { itemName: 'Chaos Orb', chaosValue: 1, quantity: 5, icon: 'chaos.png' }
  ], { createId: () => `loot-${(ids += 1)}`, now: NOW });
  backend.journal = status === 'completed'
    ? localJournal.endSession(added.journal, 'session-1', { endedAt: ENDED_AT }, { now: NOW }).journal
    : added.journal;
  backend.context = {
    localJournal,
    getTopLootOutputs,
    normalizeMapResultForLedger,
    readJournal: () => backend.journal,
    writeJournal(journal) {
      backend.journal = journal;
    },
    getMapResultsStoreKey: () => 'key',
    getStoredMapResults: () => backend.stored.key,
    store: { set(key, value) { backend.stored[key] = value; } }
  };
  return backend;
}

function storedResult(overrides = {}) {
  return normalizeMapResultForLedger({
    id: `map-result-session-1-${Date.parse(ENDED_AT)}`,
    sessionId: 'session-1',
    farmType: 'Breach',
    outputValue: 205,
    netProfit: 195,
    profitState: 'positive',
    topOutputs: [{ label: 'Divine Orb', quantityDelta: 2, valueDelta: 200, currencyCode: 'chaos' }],
    lootItemCount: 7,
    publishState: 'published',
    publishedRunId: 'run-9',
    publishedAt: '2026-11-05T11:00:00.000Z',
    publishedVisibility: 'public',
    createdAt: ENDED_AT,
    ...overrides
  });
}

test('editSessionLoot updates the loot, and the running copy only when it is the same session', () => {
  const backend = createBackend({ status: 'active' });
  const lootId = backend.journal.sessions[0].lootEntries.find((loot) => loot.itemName === 'Divine Orb').id;
  const other = { id: 'other-session' };
  const context = loadFunctions(['editSessionLoot', 'updateSessionMapResult'], { ...backend.context, currentSession: other });

  const updated = context.editSessionLoot('session-1', lootId, { quantity: 3 });
  assert.equal(updated.totalLootChaos, 305);
  assert.equal(backend.journal.sessions[0].totalLootChaos, 305);
  assert.equal(context.currentSession, other);
  assert.deepEqual(backend.stored.key, []);

  context.currentSession = { id: 'session-1', stale: true };
  const removed = context.editSessionLoot('session-1', lootId, { remove: true });
  assert.equal(context.currentSession, removed);
  assert.equal(removed.lootEntries.length, 1);
  assert.equal(removed.status, 'active');

  assert.throws(() => context.editSessionLoot('session-1', 'nope', { quantity: 2 }), { code: 'LOOT_NOT_FOUND' });
  assert.throws(() => context.editSessionLoot('session-1', removed.lootEntries[0].id, { quantity: 0 }), { code: 'LOOT_QUANTITY_INVALID' });
});

test('editSessionLoot recomputes the saved result of a finished map in place', () => {
  const before = storedResult({ id: 'map-result-other-1' });
  const target = storedResult();
  const after = storedResult({ id: 'map-result-other-2' });
  const backend = createBackend({ results: [before, target, after] });
  const lootId = backend.journal.sessions[0].lootEntries[0].id;
  const context = loadFunctions(['editSessionLoot', 'updateSessionMapResult'], { ...backend.context, currentSession: null });

  context.editSessionLoot('session-1', lootId, { quantity: 4 });

  const next = backend.stored.key;
  assert.equal(next.length, 3);
  assert.deepEqual(next[0], before);
  assert.deepEqual(next[2], after);
  assert.equal(next[1].id, target.id);
  assert.equal(next[1].publishState, 'published');
  assert.equal(next[1].publishedRunId, 'run-9');
  assert.equal(next[1].publishedAt, '2026-11-05T11:00:00.000Z');
  assert.equal(next[1].publishedVisibility, 'public');
  assert.equal(next[1].farmType, 'Breach');
  assert.equal(next[1].outputValue, 405);
  assert.equal(next[1].netProfit, 395);
  assert.equal(next[1].profitChaos, 395);
  assert.equal(next[1].profitState, 'positive');
  assert.equal(next[1].calculationStatus, 'calculated');
  assert.equal(next[1].lootItemCount, 9);
  assert.deepEqual(JSON.parse(JSON.stringify(next[1].topOutputs)), [
    { label: 'Divine Orb', quantityDelta: 4, valueDelta: 400, currencyCode: 'chaos' },
    { label: 'Chaos Orb', quantityDelta: 5, valueDelta: 5, currencyCode: 'chaos', icon: 'chaos.png' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(next[1].topLootItems)), [
    { name: 'Divine Orb', quantity: 4, totalChaos: 400 },
    { name: 'Chaos Orb', quantity: 5, totalChaos: 5 }
  ]);

  // Removing every entry makes the run a loss of its cost.
  for (const { id } of [...backend.journal.sessions[0].lootEntries]) {
    context.editSessionLoot('session-1', id, { remove: true });
  }
  assert.equal(backend.stored.key[1].outputValue, 0);
  assert.equal(backend.stored.key[1].netProfit, -10);
  assert.equal(backend.stored.key[1].profitState, 'negative');
  assert.deepEqual(JSON.parse(JSON.stringify(backend.stored.key[1].topOutputs)), []);
  assert.equal(backend.stored.key[1].lootItemCount, 0);
});

test('editSessionLoot leaves a saved result alone when the run kept stash totals', () => {
  // A shutdown saves a stash-diff result under the run's own id, so the id alone does not tell it apart.
  const stashResult = storedResult({ outputValue: 900, netProfit: 850, topOutputs: [], lootItemCount: undefined });
  const backend = createBackend({ results: [stashResult] });
  const [session] = backend.journal.sessions;
  backend.journal = { sessions: [{ ...session, totalLootChaos: 900, profitChaos: 850 }] };
  const sets = [];
  const context = loadFunctions(['editSessionLoot', 'updateSessionMapResult'], {
    ...backend.context,
    currentSession: null,
    store: { set: (...args) => sets.push(args) }
  });

  const updated = context.editSessionLoot('session-1', session.lootEntries[0].id, { quantity: 9 });

  assert.equal(updated.totalLootChaos, 900);
  assert.equal(updated.lootEntries[0].quantity, 9);
  assert.deepEqual(sets, []);
  assert.equal(backend.stored.key[0], stashResult);
});

test('updateSessionMapResult does nothing when no result has the run id', () => {
  const unrelated = [storedResult({ id: 'map-result-session-1-1' }), storedResult({ id: 'stash-result-1' })];
  const backend = createBackend({ results: unrelated });
  const sets = [];
  const context = loadFunctions(['updateSessionMapResult'], {
    ...backend.context,
    store: { set: (...args) => sets.push(args) }
  });

  context.updateSessionMapResult(backend.journal.sessions[0]);

  assert.deepEqual(sets, []);
  assert.equal(backend.stored.key, unrelated);
});

test('the loot edit channels are main-window only and wired through preload', () => {
  const mainJs = fs.readFileSync(mainJsPath, 'utf8').replace(/\r\n/g, '\n');
  const preloadJs = fs.readFileSync(preloadJsPath, 'utf8').replace(/\r\n/g, '\n');
  const scopesStart = mainJs.indexOf('const IPC_RENDERER_SCOPES');

  assert.match(mainJs, /ipcMain\.handle\('update-loot', async \(event, sessionId, lootId, changes = \{\}\) => \{\n\s+try \{\n\s+return editSessionLoot\(sessionId, lootId, \{ quantity: changes\?\.quantity \}\);\n\s+\} catch \(error\) \{\n\s+throw toRendererError\(error, 'Failed to update loot'\);/);
  assert.match(mainJs, /ipcMain\.handle\('delete-loot', async \(event, sessionId, lootId\) => \{\n\s+try \{\n\s+return editSessionLoot\(sessionId, lootId, \{ remove: true \}\);\n\s+\} catch \(error\) \{\n\s+throw toRendererError\(error, 'Failed to remove loot'\);/);
  assert.notEqual(scopesStart, -1);
  assert.doesNotMatch(mainJs.slice(scopesStart, mainJs.indexOf('});', scopesStart)), /update-loot|delete-loot/);
  assert.ok(preloadJs.includes("  updateLoot: (sessionId, lootId, changes) => ipcRenderer.invoke('update-loot', sessionId, lootId, changes),"));
  assert.ok(preloadJs.includes("  deleteLoot: (sessionId, lootId) => ipcRenderer.invoke('delete-loot', sessionId, lootId),"));
});

function loadAddByHand(backend, { league = 'Mirage', currentSession = null, overlayEnabled = true } = {}) {
  const calls = [];
  const context = loadFunctions(['addSessionLootByHand', 'dismissUnreadCandidate', 'markSessionLootUnread', 'updateSessionMapResult'], {
    ...backend.context,
    currentSession,
    crypto: { randomUUID: () => 'hand-1' },
    priceService: {
      poeVersion: 'poe1',
      league,
      getPriceInfo: (name) => (name === 'Essence of Ruin' ? { divineValue: 0.2, icon: 'ruin.png' } : null),
      getItemType: () => 'essence'
    },
    readLocalChaosPrice: (name) => (name === 'Essence of Ruin' ? 30 : null),
    updateOverlayWindow: () => calls.push(['overlay']),
    isOverlayEnabled: () => overlayEnabled,
    showNotification: (title, body) => calls.push(['notify', title, body]),
    t: (key) => key,
    mainWindow: { webContents: { send: (channel, payload) => calls.push([channel, JSON.parse(JSON.stringify(payload))]) } }
  });
  return { context, calls };
}

test('an item added by hand takes the run league\'s price, moves a finished run\'s saved result, and is checked', () => {
  const backend = createBackend({ results: [storedResult({ noLoot: true })] });
  const { context } = loadAddByHand(backend);

  const updated = context.addSessionLootByHand('session-1', { itemName: ' Essence of Ruin ', quantity: 2 });

  assert.equal(updated.lootEntries[0].itemName, 'Essence of Ruin');
  assert.equal(updated.lootEntries[0].source, 'manual');
  assert.equal(updated.lootEntries[0].chaosValue, 30);
  assert.equal(updated.lootEntries[0].icon, 'ruin.png');
  assert.equal(updated.totalLootChaos, 265);
  assert.equal(updated.profitChaos, 255);
  assert.equal(backend.stored.key[0].outputValue, 265);
  assert.equal(backend.stored.key[0].noLoot, false, 'a run with loot now is no longer a no-loot result');

  for (const bad of [{ itemName: '', quantity: 1 }, { itemName: 'Essence of Ruin', quantity: 0 }, { itemName: 'Essence of Ruin', quantity: 1.5 }, { itemName: 'Essence of Ruin', quantity: '0x10' }]) {
    assert.throws(() => context.addSessionLootByHand('session-1', bad), { code: 'LOOT_INVALID' });
  }
  assert.throws(() => context.addSessionLootByHand('nope', { itemName: 'Essence of Ruin', quantity: 1 }), { code: 'SESSION_NOT_FOUND' });
});

test('an item added by hand to a run of another league than the loaded prices counts as 0', () => {
  const backend = createBackend({ status: 'active' });
  const running = backend.journal.sessions[0];
  const { context, calls } = loadAddByHand(backend, { league: 'Standard', currentSession: running });

  const updated = context.addSessionLootByHand('session-1', { itemName: 'Essence of Ruin', quantity: 1 });

  assert.equal(updated.lootEntries[0].chaosValue, 0);
  assert.equal(context.currentSession, updated, 'the running map follows');
  assert.deepEqual(calls, [['overlay']]);
});

test('a map whose only new items were unread is marked so, and the window keeps it a no-loot map', () => {
  const backend = createBackend();
  // A map that ended with nothing counted.
  backend.journal = { sessions: [{ ...backend.journal.sessions[0], lootEntries: [] }] };
  const { context, calls } = loadAddByHand(backend);

  context.markSessionLootUnread('session-1');

  assert.equal(backend.journal.sessions[0].lootUnread, true);
  assert.equal(calls[0][0], 'session-loot-updated');
  assert.equal(calls[0][1].lootUnread, true);
  assert.equal(calls[0][1].noLoot, true, 'its saved result stays not calculated, not a loss of its cost');
  assert.equal(calls.length, 1, 'the overlay shows it');

  // With the overlay off, the OS notice says so, as it does for a counted gain.
  const quiet = loadAddByHand(backend, { overlayEnabled: false });
  quiet.context.markSessionLootUnread('session-1');
  assert.deepEqual(quiet.calls[1], ['notify', 'Dunes Map', 'mapLootUnreadBody']);
});

test('an item added by hand for an unread look settles that look too, and a look can be dismissed', () => {
  const backend = createBackend();
  backend.journal = localJournal.markLootUnread(backend.journal, 'session-1', {
    now: NOW,
    unreadCandidates: [{ names: ['Essence of Ruin', 'Greater Essence of Ruin'], quantity: 2 }, { names: ['Omen of Light'], quantity: 1 }]
  }).journal;
  const { context } = loadAddByHand(backend);

  // Added with Edit, not its button: the look that names it goes all the same.
  const updated = context.addSessionLootByHand('session-1', { itemName: 'Greater Essence of Ruin', quantity: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(updated.lootUnreadCandidates)), [{ names: ['Omen of Light'], quantity: 1 }]);

  const dismissed = context.dismissUnreadCandidate('session-1', { index: 0, name: 'Omen of Light' });
  assert.deepEqual(JSON.parse(JSON.stringify(dismissed.lootUnreadCandidates)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(backend.journal.sessions[0].lootUnreadCandidates)), []);
  assert.throws(() => context.dismissUnreadCandidate('session-1', { index: 0 }), { code: 'LOOT_INVALID' });
});

test('naming an unread cell by its candidate adds the item and drops that cell\'s candidates', () => {
  const backend = createBackend();
  backend.journal = localJournal.markLootUnread(backend.journal, 'session-1', {
    now: NOW,
    unreadCandidates: [{ names: ['Essence of Ruin', 'Greater Essence of Ruin'], quantity: 2 }, { names: ['Omen of Light'], quantity: 1 }]
  }).journal;
  const { context } = loadAddByHand(backend);

  const updated = context.addSessionLootByHand('session-1', { itemName: 'Essence of Ruin', quantity: 2, candidate: 0 });

  assert.equal(updated.lootEntries[0].itemName, 'Essence of Ruin');
  assert.deepEqual(JSON.parse(JSON.stringify(updated.lootUnreadCandidates)), [{ names: ['Omen of Light'], quantity: 1 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(backend.journal.sessions[0].lootUnreadCandidates)), [{ names: ['Omen of Light'], quantity: 1 }]);
});

test('the reader gets every essence\'s art for PoE 2, also of essences the league\'s prices leave out', () => {
  const { POE2_ESSENCE_ART } = require('../src/modules/essenceArt');
  const listed = POE2_ESSENCE_ART[0];
  const context = loadFunctions(['listPricedInventoryItems'], {
    POE2_ESSENCE_ART,
    resolveLeagueContext: () => ({ league: 'Rites' }),
    loadSessionPrices: async () => {},
    priceService: {
      poeVersion: 'poe2',
      league: 'Rites',
      fullySynced: true,
      getStatus: () => ({ itemCount: 2 }),
      listItems: () => [{ name: listed.name, icon: 'priced.png', divineValue: 2 }, { name: 'Exalted Orb', icon: 'ex.png', divineValue: 0.01 }]
    }
  });

  const { complete, items } = context.listPricedInventoryItems('poe2');

  assert.equal(complete, true);
  assert.equal(items.length, 2 + POE2_ESSENCE_ART.length - 1);
  assert.equal(items.find((item) => item.name === listed.name).icon, 'priced.png', 'a priced essence keeps its price');
  const unpriced = items.find((item) => item.name === 'Essence of the Body');
  assert.equal(unpriced.divineValue, null);
  assert.match(unpriced.icon, /^https:\/\/web\.poecdn\.com\/gen\/image\//);
  assert.ok(POE2_ESSENCE_ART.every((entry) => entry.icon.startsWith('https://web.poecdn.com/gen/image/')), 'icons come only from the game\'s CDN');
  assert.equal(new Set(POE2_ESSENCE_ART.map((entry) => entry.name)).size, POE2_ESSENCE_ART.length);

  // PoE 1 and prices still loading get nothing extra.
  assert.equal(context.listPricedInventoryItems('poe1').items.length, 0);
});

// The item values main hands the inventory watcher, over a price service and a league setting the test moves.
function loadWatcherItemValues(priceService) {
  const settings = { league: 'Rites', reads: 0 };
  const context = loadFunctions(['createInventoryWatcher'], {
    InventoryWatcher: class { constructor(deps) { this.deps = deps; } },
    resolveLeagueContext: () => {
      settings.reads += 1;
      return { league: settings.league };
    },
    priceService,
    isGameWindowInFront: () => true,
    getGameWindowRect: () => null,
    listPricedInventoryItems: () => ({ complete: false, items: [] }),
    getInventoryIconPath: () => null,
    loadInventoryArt: () => null,
    showInventoryStatus() {}
  });
  const { getItemValues } = context.createInventoryWatcher().deps;
  // As a plain object, since the map comes from the other context.
  return { settings, getItemValues, readValues: (game) => { const values = getItemValues(game); return values && Object.fromEntries(values); } };
}

test('the watcher gets the same item values back until the price list changes, with no settings read and no copy in between', () => {
  const prices = { exalted: 0.01 };
  let copies = 0;
  const priceService = {
    poeVersion: 'poe2',
    league: 'Rites',
    fullySynced: true,
    revision: 4,
    listItems: () => {
      copies += 1;
      return [{ name: 'Exalted Orb', icon: 'ex.png', divineValue: prices.exalted }];
    }
  };
  const { settings, getItemValues, readValues } = loadWatcherItemValues(priceService);

  const first = getItemValues('poe2');
  assert.deepEqual(Object.fromEntries(first), { 'Exalted Orb': 0.01 });
  for (let tick = 0; tick < 5; tick += 1) assert.equal(getItemValues('poe2'), first);
  assert.deepEqual([settings.reads, copies], [1, 1], 'a tick between price changes reads no settings and copies no list');

  // A league setting that moves away from the loaded league is not looked at until the list changes. The watcher keeps
  // the values it has when it is handed none, and these are the ones it has; art that joins meanwhile is held to them.
  settings.league = 'Standard';
  assert.equal(getItemValues('poe2'), first);
  settings.league = 'Rites';

  // A sync lands.
  prices.exalted = 0.7;
  priceService.revision += 1;
  assert.deepEqual(readValues('poe2'), { 'Exalted Orb': 0.7 });
  assert.deepEqual(readValues('poe2'), { 'Exalted Orb': 0.7 });
  assert.deepEqual([settings.reads, copies], [2, 2]);

  // The Currency page loads another league. Prices that are not this league's are not remembered, so a league setting
  // that moves to them is seen on the next read.
  priceService.league = 'Standard';
  priceService.revision += 1;
  assert.equal(getItemValues('poe2'), null);
  assert.equal(getItemValues('poe2'), null);
  settings.league = 'Standard';
  assert.deepEqual(readValues('poe2'), { 'Exalted Orb': 0.7 });

  // The other game has no prices loaded, and asking for it does not hand out this game's.
  assert.equal(getItemValues('poe1'), null);
  assert.deepEqual(readValues('poe2'), { 'Exalted Orb': 0.7 });
});

test('the remembered item values leave the art the reader holds with what working them out on every read would, through syncs and league and game switches', async (t) => {
  const PriceService = require('../src/modules/priceService');
  const service = new PriceService();
  // A PoE 1 sync sleeps after each item overview; that pacing is not waited for here.
  const realSetTimeout = global.setTimeout;
  t.mock.method(global, 'setTimeout', (callback, delay, ...args) => realSetTimeout(callback, delay === 300 ? 0 : delay, ...args));
  const divineInChaos = { Rites: 100, Standard: 300, Mirage: 150 };
  let pause = null;
  service._fetchCurrencyOverview = async (league, type) => {
    if (type !== 'Currency') return { lines: [] };
    if (pause) {
      pause.reach();
      await pause.released;
    }
    return { lines: [{ currencyTypeName: 'Divine Orb', chaosEquivalent: divineInChaos[league] }, { currencyTypeName: 'Exalted Orb', chaosEquivalent: 1 }] };
  };
  service._fetchItemOverview = async () => ({ lines: [] });
  const { settings, readValues } = loadWatcherItemValues(service);

  // The watcher keeps the values it has when it is handed none. `fresh` is that with the values worked out on every
  // read, as before they were remembered.
  let fresh = null;
  let remembered = null;
  const steps = [];
  const read = (step) => {
    const current = service.poeVersion === 'poe2' && service.league === settings.league && service.fullySynced;
    if (current) fresh = Object.fromEntries(service.listItems().map((item) => [item.name, item.divineValue]));
    for (let tick = 0; tick < 2; tick += 1) {
      remembered = readValues('poe2') || remembered;
      assert.deepEqual(remembered, fresh, step);
    }
    steps.push([step, current, fresh && fresh['Exalted Orb']]);
  };
  // Runs a sync and reads while its Currency overview is still on the way, then once it has landed.
  const syncAndRead = async (step, start) => {
    let reach;
    let release;
    const reached = new Promise((resolve) => { reach = resolve; });
    pause = { reach, released: new Promise((resolve) => { release = resolve; }) };
    const sync = start();
    await reached;
    read(`${step}, still fetching`);
    pause = null;
    release();
    await sync;
    read(step);
  };

  read('nothing loaded');
  await syncAndRead('the first load', () => service.ensureSynced('Rites', 'poe2', { full: true }));
  divineInChaos.Rites = 125;
  await syncAndRead('a forced sync of the same league', () => service.ensureSynced('Rites', 'poe2', { full: true, force: true }));
  divineInChaos.Rites = 80;
  await syncAndRead('a quick sync of the same league', () => service.ensureSynced('Rites', 'poe2', { full: false, force: true }));
  await syncAndRead('a full sync after it', () => service.ensureSynced('Rites', 'poe2', { full: true }));
  await syncAndRead('another league for the Currency page', () => service.ensureSynced('Standard', 'poe2', { full: true }));
  settings.league = 'Standard';
  read('the league setting moves to the loaded league');
  settings.league = 'Rites';
  read('and back, with the other league still loaded');
  divineInChaos.Rites = 90;
  await syncAndRead('the session loads its league again', () => service.ensureSynced('Rites', 'poe2', { full: true }));
  settings.league = 'Standard';
  read('the league setting moves away from the loaded league');
  settings.league = 'Rites';
  read('and back');
  service.setPoeVersion('poe1');
  service.clearCache();
  read('the other game starts');
  await syncAndRead('the other game loads its prices', () => service.ensureSynced('Mirage', 'poe1', { full: true }));
  service.setPoeVersion('poe2');
  service.clearCache();
  read('this game starts again');
  divineInChaos.Rites = 200;
  await syncAndRead('and loads its prices', () => service.ensureSynced('Rites', 'poe2', { full: true }));

  // The walk did go through both states and four different price lists of the session's league.
  assert.ok(steps.some(([, current]) => current) && steps.some(([, current]) => !current));
  assert.ok(new Set(steps.filter(([, current]) => current).map(([, , exalted]) => exalted)).size >= 4);
});
