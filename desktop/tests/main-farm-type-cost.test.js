const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const localJournal = require('../src/modules/localJournalModel');
const farmTypeModel = require('../src/modules/farmTypeModel');
const { getTopLootOutputs, normalizeMapResultForLedger } = require('../src/modules/mapResultStoreModel');

const mainJsPath = path.join(__dirname, '..', 'main.js');
const preloadJsPath = path.join(__dirname, '..', 'preload.js');
const mainSource = fs.readFileSync(mainJsPath, 'utf8').replace(/\r\n/g, '\n');
const NOW = new Date('2026-11-09T10:00:00.000Z');
const ENDED_AT = '2026-11-09T10:30:00.000Z';
const CUSTOM_ID = 'custom-11111111-aaaa';

// A top-level function of main.js, plain or async, up to its closing brace in column zero.
function loadFunctions(functionNames, contextOverrides = {}) {
  const context = vm.createContext({ console: { log() {} }, ...contextOverrides });
  for (const functionName of functionNames) {
    let start = mainSource.indexOf(`\nasync function ${functionName}(`);
    if (start === -1) {
      start = mainSource.indexOf(`\nfunction ${functionName}(`);
    }
    assert.notEqual(start, -1, `main.js should define ${functionName}()`);
    const end = mainSource.indexOf('\n}\n', start);
    vm.runInContext(`${mainSource.slice(start, end + 2)};\nthis.${functionName} = ${functionName};`, context);
  }
  return context;
}

function plainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

// main's store over a plain object: two local profiles, the first one signed in.
function createStoreHarness(initial = {}) {
  const data = {
    localProfiles: { 'profile-1': { id: 'profile-1' }, 'profile-2': { id: 'profile-2' } },
    activeProfileId: 'profile-1',
    [`customFarmTypes:profile-1`]: [{
      id: CUSTOM_ID, label: 'Boss Tablets', color: 'amber', icon: 'farm-tablet', poeVersions: ['poe1'], deletedAt: '2026-11-01T00:00:00.000Z'
    }],
    ...initial
  };
  return {
    data,
    store: {
      get: (key) => data[key],
      set(key, value) {
        data[key] = value;
      }
    }
  };
}

const COST_STORE_FUNCTIONS = [
  'getActiveProfile',
  'getCustomFarmTypesStoreKey',
  'getStoredCustomFarmTypes',
  'getFarmTypeCostsStoreKey',
  'normalizeFarmTypeCostEntry',
  'getStoredFarmTypeCosts',
  'isKnownFarmTypeCostId',
  'setStoredFarmTypeCost'
];

function loadCostStore(initial) {
  const harness = createStoreHarness(initial);
  const context = loadFunctions(COST_STORE_FUNCTIONS, {
    store: harness.store,
    FARM_TYPE_COST_UNITS: ['chaos', 'divine'],
    MAX_FARM_TYPE_COST_AMOUNT: 10_000,
    isCustomFarmTypeId: farmTypeModel.isCustomFarmTypeId,
    normalizeCustomFarmTypes: farmTypeModel.normalizeCustomFarmTypes,
    getFarmTypeById: farmTypeModel.getFarmTypeById
  });
  return { ...harness, context };
}

test('a farm type cost is kept as typed per profile and farm type, and amount 0 removes it', () => {
  const { data, context } = loadCostStore();

  assert.deepEqual(plainJson(context.setStoredFarmTypeCost('breach', { amount: 1.5, unit: 'divine' })), {
    ok: true, costs: { breach: { amount: 1.5, unit: 'divine' } }
  });
  assert.deepEqual(plainJson(context.setStoredFarmTypeCost('ritual', { amount: 12.25, unit: 'chaos' }).costs), {
    breach: { amount: 1.5, unit: 'divine' }, ritual: { amount: 12.25, unit: 'chaos' }
  });
  assert.deepEqual(plainJson(data['farmTypeCosts:profile-1']), {
    breach: { amount: 1.5, unit: 'divine' }, ritual: { amount: 12.25, unit: 'chaos' }
  });

  // Another profile on this PC has its own costs.
  data.activeProfileId = 'profile-2';
  assert.deepEqual(plainJson(context.getStoredFarmTypeCosts()), {});
  data.activeProfileId = 'profile-1';

  assert.deepEqual(plainJson(context.setStoredFarmTypeCost('breach', { amount: 0, unit: 'divine' }).costs), {
    ritual: { amount: 12.25, unit: 'chaos' }
  });
  assert.deepEqual(plainJson(context.getStoredFarmTypeCosts()), { ritual: { amount: 12.25, unit: 'chaos' } });
});

test('a farm type cost is only saved for a known id, a valid unit and an amount within the cap', () => {
  const { data, context } = loadCostStore({ 'customFarmTypes:profile-2': [{ ...farmTypeModel.normalizeCustomFarmTypes([{
    id: 'custom-22222222-bbbb', label: 'Other', color: 'amber', icon: 'farm-tablet', poeVersions: ['poe1']
  }])[0] }] });

  // A deleted custom type of the profile still takes a cost; another profile's custom type and unknown ids do not.
  assert.equal(context.setStoredFarmTypeCost(CUSTOM_ID, { amount: 5, unit: 'chaos' }).ok, true);
  assert.deepEqual(plainJson(context.setStoredFarmTypeCost('custom-22222222-bbbb', { amount: 5, unit: 'chaos' })), { ok: false, error: 'FARM_TYPE_NOT_FOUND' });
  assert.deepEqual(plainJson(context.setStoredFarmTypeCost('nope', { amount: 5, unit: 'chaos' })), { ok: false, error: 'FARM_TYPE_NOT_FOUND' });
  assert.deepEqual(plainJson(context.setStoredFarmTypeCost(undefined, { amount: 5, unit: 'chaos' })), { ok: false, error: 'FARM_TYPE_NOT_FOUND' });

  for (const unit of ['exalted', undefined, 'Divine']) {
    assert.deepEqual(plainJson(context.setStoredFarmTypeCost('breach', { amount: 5, unit })), { ok: false, error: 'COST_UNIT_INVALID' });
  }
  for (const amount of [-1, Number.NaN, Infinity, 10001, '5', null, undefined]) {
    assert.deepEqual(plainJson(context.setStoredFarmTypeCost('breach', { amount, unit: 'chaos' })), { ok: false, error: 'COST_INVALID' }, String(amount));
  }
  assert.deepEqual(plainJson(context.setStoredFarmTypeCost('breach', null)), { ok: false, error: 'COST_UNIT_INVALID' });
  assert.equal(context.setStoredFarmTypeCost('breach', { amount: 10000, unit: 'divine' }).ok, true);

  assert.deepEqual(Object.keys(data['farmTypeCosts:profile-1']).sort(), ['breach', CUSTOM_ID]);

  // Signed out, nothing is saved.
  data.activeProfileId = null;
  assert.deepEqual(plainJson(context.setStoredFarmTypeCost('breach', { amount: 5, unit: 'chaos' })), { ok: false, error: 'FARM_TYPE_NOT_FOUND' });
  assert.deepEqual(plainJson(context.getStoredFarmTypeCosts()), {});
});

test('stored farm type costs that are not valid entries are ignored when read', () => {
  const { context } = loadCostStore({
    'farmTypeCosts:profile-1': {
      breach: { amount: 2, unit: 'divine' },
      ritual: { amount: -3, unit: 'chaos' },
      delirium: { amount: 4, unit: 'exalted' },
      harvest: 'lots',
      essence: null
    }
  });

  assert.deepEqual(plainJson(context.getStoredFarmTypeCosts()), { breach: { amount: 2, unit: 'divine' } });
});

test('renderer settings never carry any profile\'s farm type costs', () => {
  const { data } = createStoreHarness();
  const store = {
    store: { ...data, 'farmTypeCosts:profile-1': { breach: { amount: 1, unit: 'chaos' } }, 'farmTypeCosts:profile-2': {} },
    get(key) {
      return this.store[key];
    }
  };
  const context = loadFunctions(['getActiveProfile', 'getAccountStateStoreKey', 'getRendererSettings'], {
    store,
    DEFAULT_SCAN_HOTKEY: 'F9',
    DEFAULT_STASH_SCAN_HOTKEY: 'CommandOrControl+Shift+L'
  });

  assert.deepEqual(Object.keys(context.getRendererSettings()).filter((key) => key.startsWith('farmTypeCosts')), []);
});

function loadStartCost({ stored = {}, divineChaos = 200 } = {}) {
  const rateCalls = [];
  const context = loadFunctions(['getDivineChaosRate', 'convertFarmTypeCostToChaos', 'resolveStartCost'], {
    localJournal,
    getStoredFarmTypeCosts: () => stored,
    normalizePositiveRate: (value) => (Number(value) > 0 ? Number(value) : null),
    async getProfitCurrencyRates(options) {
      rateCalls.push(plainJson(options));
      return { divineChaos };
    }
  });
  return { context, rateCalls };
}

test('a map starts with an explicit cost first, even 0, as a manual one', async () => {
  const { context, rateCalls } = loadStartCost({ stored: { breach: { amount: 2, unit: 'divine' } } });

  assert.deepEqual(plainJson(await context.resolveStartCost({ costChaos: 7 }, 'breach', 'poe1', 'Mirage')), { costChaos: 7, costSource: 'manual', costPending: null });
  assert.deepEqual(plainJson(await context.resolveStartCost({ costChaos: 0 }, 'breach', 'poe1', 'Mirage')), { costChaos: 0, costSource: 'manual', costPending: null });
  assert.deepEqual(plainJson(await context.resolveStartCost({ costChaos: '3.5' }, 'breach', 'poe1', 'Mirage')), { costChaos: 3.5, costSource: 'manual', costPending: null });
  assert.deepEqual(rateCalls, []);
});

test('a map starts with its farm type cost converted with the divine rate of its game and league', async () => {
  const { context, rateCalls } = loadStartCost({
    stored: { breach: { amount: 1.5, unit: 'divine' }, ritual: { amount: 12.345, unit: 'chaos' } },
    divineChaos: 233.3
  });

  assert.deepEqual(plainJson(await context.resolveStartCost({}, 'breach', 'poe2', 'Fate')), { costChaos: 349.95, costSource: 'farmType', costPending: null });
  assert.deepEqual(rateCalls, [{ poeVersion: 'poe2', league: 'Fate', cacheOnly: true }]);
  // A cost in chaos needs no rate.
  assert.deepEqual(plainJson(await context.resolveStartCost({ costChaos: null }, 'ritual', 'poe1', 'Mirage')), { costChaos: 12.35, costSource: 'farmType', costPending: null });
  assert.equal(rateCalls.length, 1);
});

test('a map keeps a divine cost pending while the divine rate is unknown, and has no cost without one', async () => {
  const { context } = loadStartCost({ stored: { breach: { amount: 2, unit: 'divine' } }, divineChaos: null });

  assert.deepEqual(plainJson(await context.resolveStartCost({}, 'breach', 'poe1', 'Mirage')), {
    costChaos: 0, costSource: 'farmType', costPending: { amount: 2, unit: 'divine' }
  });
  assert.deepEqual(plainJson(await context.resolveStartCost({}, 'ritual', 'poe1', 'Mirage')), { costChaos: 0, costSource: null, costPending: null });
  assert.deepEqual(plainJson(await context.resolveStartCost({}, null, 'poe1', 'Mirage')), { costChaos: 0, costSource: null, costPending: null });
});

test('a converted cost never passes the journal cap', async () => {
  const { context } = loadStartCost({ stored: { breach: { amount: 10000, unit: 'divine' } }, divineChaos: 5000 });

  assert.equal((await context.resolveStartCost({}, 'breach', 'poe1', 'Mirage')).costChaos, localJournal.MAX_COST_CHAOS);
});

test('startNewSession starts the map at minus its farm type cost', async () => {
  let journal = { sessions: [] };
  const context = loadFunctions(['normalizeStoredFarmTypeId', 'startNewSession'], {
    localJournal,
    readJournal: () => journal,
    writeJournal(next) {
      journal = next;
    },
    currentSession: null,
    resolveLeagueContext: () => ({ activeVersion: 'poe1', league: 'Mirage' }),
    getActiveFarmTypeId: () => 'breach',
    resolveStartCost: async (input, farmTypeId, poeVersion, league) => {
      assert.deepEqual([input.mapName, farmTypeId, poeVersion, league], ['Dunes Map', 'breach', 'poe1', 'Mirage']);
      return { costChaos: 40, costSource: 'farmType', costPending: null };
    },
    crypto: { randomUUID: () => 'session-1' },
    appendAuditTrail() {},
    showNotification() {},
    t: (key) => key,
    mainWindow: null
  });

  const session = await context.startNewSession({ mapName: 'Dunes Map' });

  assert.equal(session.costChaos, 40);
  assert.equal(session.costSource, 'farmType');
  assert.equal(session.profitChaos, -40);
  assert.equal(session.totalLootChaos, 0);
  assert.equal(journal.sessions[0].profitChaos, -40);
  assert.equal(context.currentSession, session);
});

function startPendingSession(input = {}) {
  const backend = { journal: { sessions: [] } };
  backend.journal = localJournal.startSession(backend.journal, {
    mapName: 'Dunes Map', poeVersion: 'poe1', league: 'Mirage', farmTypeId: 'breach', startedAt: '2026-11-09T10:00:00.000Z',
    costChaos: 0, costSource: 'farmType', costPending: { amount: 2, unit: 'divine' }, ...input
  }, { id: 'session-1', now: NOW }).journal;
  return backend;
}

function loadSettle(backend, divineChaos) {
  return loadFunctions(['getDivineChaosRate', 'convertFarmTypeCostToChaos', 'settleCostPending'], {
    localJournal,
    normalizePositiveRate: (value) => (Number(value) > 0 ? Number(value) : null),
    getProfitCurrencyRates: async () => ({ divineChaos })
  });
}

test('a pending cost is settled with the divine rate known when the map ends', async () => {
  const backend = startPendingSession();
  const context = loadSettle(backend, 250);

  const settled = await context.settleCostPending(backend.journal, backend.journal.sessions[0]);

  assert.equal(settled.session.costChaos, 500);
  assert.equal(settled.session.costSource, 'farmType');
  assert.equal(settled.session.costPending, null);
  assert.equal(settled.session.profitChaos, -500);
  assert.equal(settled.journal.sessions[0], settled.session);
});

test('a pending cost stays pending while the rate is still unknown', async () => {
  const backend = startPendingSession();
  const context = loadSettle(backend, null);

  const settled = await context.settleCostPending(backend.journal, backend.journal.sessions[0]);

  assert.equal(settled.journal, backend.journal);
  assert.equal(settled.session, backend.journal.sessions[0]);
  assert.deepEqual(plainJson(settled.session.costPending), { amount: 2, unit: 'divine' });
});

// endCurrentSession over the real journal model, with a rate lookup that answers `divineChaos`.
function loadEndMap(backend, { divineChaos = 250, currentSession = null, notifications = [] } = {}) {
  const messages = [];
  const context = loadFunctions(['getDivineChaosRate', 'convertFarmTypeCostToChaos', 'settleCostPending', 'endCurrentSession'], {
    localJournal,
    readJournal: () => backend.journal,
    writeJournal(journal) {
      backend.journal = journal;
    },
    currentSession,
    inventoryWatcher: null,
    normalizePositiveRate: (value) => (Number(value) > 0 ? Number(value) : null),
    getProfitCurrencyRates: async () => ({ divineChaos }),
    appendAuditTrail() {},
    showNotification: (title, body) => notifications.push([title, body]),
    t: (key, values = {}) => [key, ...Object.values(values)].join('|'),
    updateOverlayWindow() {},
    mainWindow: { webContents: { send: (channel, payload) => messages.push({ channel, payload: plainJson(payload) }) } }
  });
  return { context, messages };
}

test('ending a map settles its pending cost first, so the loot profit counts it', async () => {
  const backend = startPendingSession();
  const added = localJournal.addLoot(backend.journal, 'session-1', [{ itemName: 'Divine Orb', chaosValue: 600 }], { createId: () => 'loot-1', now: NOW });
  backend.journal = added.journal;
  const { context, messages } = loadEndMap(backend, { currentSession: added.session });

  const ended = await context.endCurrentSession({ endedAt: ENDED_AT });

  assert.equal(ended.costChaos, 500);
  assert.equal(ended.profitChaos, 100);
  assert.equal(backend.journal.sessions[0].costPending, null);
  assert.equal(backend.journal.sessions[0].profitChaos, 100);
  assert.equal(messages[0].payload.costChaos, 500);
});

test('ending a map with a stash diff keeps the stash profit and does not fold the cost into it', async () => {
  const backend = startPendingSession();
  const { context } = loadEndMap(backend, { currentSession: backend.journal.sessions[0] });

  const ended = await context.endCurrentSession({ endedAt: ENDED_AT, totalLootChaos: 900, profitChaos: 850 });

  assert.equal(ended.costChaos, 500);
  assert.equal(ended.totalLootChaos, 900);
  assert.equal(ended.profitChaos, 850);
});

test('ending a map without loot reports no loot even though its cost makes the profit negative', async () => {
  const backend = startPendingSession({ costChaos: 25, costSource: 'farmType', costPending: null });
  const notifications = [];
  const { context, messages } = loadEndMap(backend, { currentSession: backend.journal.sessions[0], notifications });

  const ended = await context.endCurrentSession({ endedAt: ENDED_AT });

  assert.equal(ended.profitChaos, -25);
  assert.equal(ended.noLoot, true);
  assert.deepEqual(notifications.map(([, body]) => body.split(' ')[0]), ['mapNoLootBody']);
  assert.equal(messages[0].payload.noLoot, true);
});

test('ending a map with less loot than its cost reports a loss', async () => {
  const backend = startPendingSession({ costChaos: 25, costSource: 'farmType', costPending: null });
  const added = localJournal.addLoot(backend.journal, 'session-1', [{ itemName: 'Chaos Orb', chaosValue: 5 }], { createId: () => 'loot-1', now: NOW });
  backend.journal = added.journal;
  const notifications = [];
  const { context } = loadEndMap(backend, { currentSession: added.session, notifications });

  const ended = await context.endCurrentSession({ endedAt: ENDED_AT });

  assert.equal(ended.profitChaos, -20);
  assert.equal(ended.noLoot, undefined);
  assert.equal(notifications[0][1].split(' ')[0], 'mapLossBody|20');
});

test('a map with an entry cost is not ended on map exit before its stash diff unless loot was recorded', () => {
  const context = loadFunctions(['normalizePoeVersion', 'getSessionValueNumber', 'shouldAutoEndSessionOnMapExit'], {
    poeApiClient: { hasScope: (scope) => scope === 'account:stashes' }
  });
  const base = { poeVersion: 'poe1', totalLootChaos: 0, profitChaos: -40, costChaos: 40, lootEntries: [] };

  assert.equal(context.shouldAutoEndSessionOnMapExit(base), false);
  assert.equal(context.shouldAutoEndSessionOnMapExit({ ...base, lootEntries: [{ itemName: 'Scroll', quantity: 1 }] }), true);
  assert.equal(context.shouldAutoEndSessionOnMapExit({ ...base, totalLootChaos: 12, profitChaos: -28 }), true);
});

test('the map result saved at shutdown shows the cost as its input and loot minus cost as its profit', () => {
  const context = loadFunctions(['getSessionValueNumber', 'buildSessionShutdownMapResult'], {
    normalizePoeVersion: (value) => value,
    normalizeStoredFarmTypeId: (value) => value,
    resolveFarmTypeLabel: () => 'Breach',
    getActiveFarmTypeId: () => null
  });
  const session = { id: 'session-1', farmTypeId: 'breach', poeVersion: 'poe1', league: 'Mirage', startedAt: '2026-11-09T10:00:00.000Z', costChaos: 30 };

  const result = context.buildSessionShutdownMapResult(session, { endedAt: ENDED_AT, totalLootChaos: 205, profitChaos: 175 });

  assert.equal(result.inputValue, 30);
  assert.equal(result.outputValue, 205);
  assert.equal(result.netProfit, 175);
  assert.equal(result.profitState, 'positive');
});

function createEditBackend({ results = [], status = 'completed', stashTotals = null, costChaos = 10 } = {}) {
  const backend = { journal: { sessions: [] }, stored: { key: results }, updates: [] };
  const started = localJournal.startSession(backend.journal, {
    mapName: 'Dunes Map', poeVersion: 'poe1', league: 'Mirage', costChaos, costSource: 'farmType', startedAt: '2026-11-09T10:00:00.000Z'
  }, { id: 'session-1', now: NOW });
  const added = localJournal.addLoot(started.journal, 'session-1', [
    { itemName: 'Divine Orb', chaosValue: 100, quantity: 2 },
    { itemName: 'Chaos Orb', chaosValue: 1, quantity: 5, icon: 'chaos.png' }
  ], { createId: (() => { let ids = 0; return () => `loot-${(ids += 1)}`; })(), now: NOW });
  backend.journal = status === 'completed'
    ? localJournal.endSession(added.journal, 'session-1', { endedAt: ENDED_AT, ...(stashTotals || {}) }, { now: NOW }).journal
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
    store: { set(key, value) { backend.stored[key] = value; } },
    updateOverlayWindow: () => backend.updates.push(true)
  };
  return backend;
}

function storedResult(overrides = {}) {
  return normalizeMapResultForLedger({
    id: `map-result-session-1-${Date.parse(ENDED_AT)}`,
    sessionId: 'session-1',
    farmType: 'Breach',
    inputValue: 10,
    outputValue: 205,
    netProfit: 195,
    profitState: 'positive',
    topOutputs: [{ label: 'Divine Orb', quantityDelta: 2, valueDelta: 200, currencyCode: 'chaos' }],
    lootItemCount: 7,
    publishState: 'published',
    publishedRunId: 'run-9',
    createdAt: ENDED_AT,
    ...overrides
  });
}

const EDIT_COST_FUNCTIONS = ['editSessionCost', 'findSessionMapResultIndex', 'updateSessionMapResultCost'];

test('editSessionCost sets a manual cost on the running map and on main\'s copy of it only for that map', () => {
  const backend = createEditBackend({ status: 'active' });
  const other = { id: 'other-session' };
  const context = loadFunctions(EDIT_COST_FUNCTIONS, { ...backend.context, currentSession: other });

  const updated = context.editSessionCost('session-1', 50);
  assert.equal(updated.costChaos, 50);
  assert.equal(updated.costSource, 'manual');
  assert.equal(updated.profitChaos, 155);
  assert.equal(context.currentSession, other);
  assert.deepEqual(backend.updates, []);
  assert.deepEqual(backend.stored.key, []);

  context.currentSession = { id: 'session-1', stale: true };
  const again = context.editSessionCost('session-1', 0);
  assert.equal(context.currentSession, again);
  assert.equal(again.profitChaos, 205);
  assert.equal(backend.updates.length, 1);
  assert.equal(backend.journal.sessions[0].costChaos, 0);

  assert.throws(() => context.editSessionCost('session-1', -5), { code: 'COST_INVALID' });
  assert.throws(() => context.editSessionCost('nope', 5), { code: 'SESSION_NOT_FOUND' });
});

test('editSessionCost rewrites the saved result of a finished map in place', () => {
  const before = storedResult({ id: 'map-result-other-1' });
  const target = storedResult();
  const backend = createEditBackend({ results: [before, target] });
  const context = loadFunctions(EDIT_COST_FUNCTIONS, { ...backend.context, currentSession: null });

  const updated = context.editSessionCost('session-1', 35);

  assert.equal(updated.profitChaos, 170);
  const next = backend.stored.key;
  assert.deepEqual(next[0], before);
  assert.equal(next[1].id, target.id);
  assert.equal(next[1].inputValue, 35);
  assert.equal(next[1].outputValue, 205);
  assert.equal(next[1].netProfit, 170);
  assert.equal(next[1].profitChaos, 170);
  assert.equal(next[1].profitState, 'positive');
  assert.equal(next[1].publishState, 'published');
  assert.equal(next[1].publishedRunId, 'run-9');
  assert.equal(next[1].lootItemCount, 7);

  // A cost above the loot makes the map a loss.
  context.editSessionCost('session-1', 400);
  assert.equal(backend.stored.key[1].inputValue, 400);
  assert.equal(backend.stored.key[1].netProfit, -195);
  assert.equal(backend.stored.key[1].profitState, 'negative');
});

test('editSessionCost moves a stash-derived result by the cost change and keeps its stash input', () => {
  // A shutdown saves a stash-diff result under the run's id: its input is the stash losses, not the cost.
  const stashResult = storedResult({ inputValue: 80, outputValue: 900, netProfit: 820, topOutputs: [], lootItemCount: undefined });
  const backend = createEditBackend({ results: [stashResult], stashTotals: { totalLootChaos: 900, profitChaos: 820 } });
  const context = loadFunctions(EDIT_COST_FUNCTIONS, { ...backend.context, currentSession: null });

  const updated = context.editSessionCost('session-1', 25);

  assert.equal(updated.totalLootChaos, 900);
  assert.equal(updated.profitChaos, 805);
  assert.equal(backend.stored.key[0].inputValue, 95);
  assert.equal(backend.stored.key[0].outputValue, 900);
  assert.equal(backend.stored.key[0].netProfit, 805);
});

test('editSessionCost finds a stash diff result saved under its snapshot time, not the run end time', () => {
  // PoE 1 stash diffs take the id from the stash snapshot that closed the run, so it differs from the end time.
  const older = storedResult({ id: 'map-result-session-1-1000', createdAt: '2026-11-09T09:00:00.000Z', netProfit: 5 });
  const stashResult = storedResult({ id: 'map-result-session-1-1762682461234', inputValue: 80, outputValue: 900, netProfit: 820, topOutputs: [] });
  const other = storedResult({ id: 'map-result-other-1', sessionId: 'other' });
  const backend = createEditBackend({ results: [other, stashResult, older], stashTotals: { totalLootChaos: 900, profitChaos: 820 } });
  const context = loadFunctions(EDIT_COST_FUNCTIONS, { ...backend.context, currentSession: null });

  context.editSessionCost('session-1', 25);

  assert.deepEqual(backend.stored.key[0], other);
  assert.equal(backend.stored.key[1].id, 'map-result-session-1-1762682461234');
  assert.equal(backend.stored.key[1].inputValue, 95);
  assert.equal(backend.stored.key[1].netProfit, 805);
  assert.deepEqual(backend.stored.key[2], older);
});

test('editSessionCost leaves saved results alone when the cost did not change or no result has the run id', () => {
  const unrelated = [storedResult({ id: 'map-result-other-1', sessionId: 'other' })];
  const backend = createEditBackend({ results: unrelated });
  const sets = [];
  const context = loadFunctions(EDIT_COST_FUNCTIONS, {
    ...backend.context,
    currentSession: null,
    store: { set: (...args) => sets.push(args) }
  });

  context.editSessionCost('session-1', 10);
  context.editSessionCost('session-1', 20);

  assert.deepEqual(sets, []);
  assert.equal(backend.stored.key, unrelated);
  assert.equal(backend.journal.sessions[0].costChaos, 20);
});

function loadRunningCost({ divineChaos = 250, running, journalSession }) {
  const backend = { journal: { sessions: [journalSession] } };
  const sent = [];
  const overlay = [];
  const context = loadFunctions(['getDivineChaosRate', 'convertFarmTypeCostToChaos', 'applyFarmTypeCostToRunningSession'], {
    localJournal,
    readJournal: () => backend.journal,
    writeJournal(journal) {
      backend.journal = journal;
    },
    currentSession: running,
    normalizePositiveRate: (value) => (Number(value) > 0 ? Number(value) : null),
    getProfitCurrencyRates: async () => ({ divineChaos }),
    updateOverlayWindow: () => overlay.push(true),
    mainWindow: { webContents: { send: (channel, payload) => sent.push({ channel, payload: plainJson(payload) }) } }
  });
  return { context, backend, sent, overlay };
}

function runningSession(input = {}) {
  return localJournal.startSession({ sessions: [] }, {
    mapName: 'Dunes Map', poeVersion: 'poe1', league: 'Mirage', farmTypeId: 'breach', costChaos: 10, costSource: 'farmType',
    startedAt: '2026-11-09T10:00:00.000Z', ...input
  }, { id: 'session-1', now: NOW }).session;
}

test('a changed farm type cost also updates the running map of that type, and tells the window', async () => {
  const session = runningSession();
  const { context, backend, sent, overlay } = loadRunningCost({ running: session, journalSession: session });

  await context.applyFarmTypeCostToRunningSession('breach', { amount: 2, unit: 'divine' });

  assert.equal(context.currentSession.costChaos, 500);
  assert.equal(context.currentSession.costSource, 'farmType');
  assert.equal(context.currentSession.profitChaos, -500);
  assert.equal(backend.journal.sessions[0].costChaos, 500);
  assert.deepEqual(sent.map(({ channel, payload }) => [channel, payload.costChaos]), [['session-cost-updated', 500]]);
  assert.equal(overlay.length, 1);

  // Removing the farm type's cost takes it off the running map as well.
  await context.applyFarmTypeCostToRunningSession('breach', null);
  assert.equal(context.currentSession.costChaos, 0);
  assert.equal(context.currentSession.profitChaos, 0);
});

test('a map started without a cost source takes the farm type cost typed later', async () => {
  const session = runningSession({ costChaos: 0, costSource: null });
  const { context } = loadRunningCost({ running: session, journalSession: session });

  await context.applyFarmTypeCostToRunningSession('breach', { amount: 15, unit: 'chaos' });

  assert.equal(context.currentSession.costChaos, 15);
  assert.equal(context.currentSession.costSource, 'farmType');
});

test('a changed farm type cost does not touch a map of another type or one whose cost was set by hand', async () => {
  for (const session of [runningSession({ farmTypeId: 'ritual' }), runningSession({ costSource: 'manual' })]) {
    const { context, backend, sent } = loadRunningCost({ running: session, journalSession: session });
    const journalBefore = backend.journal;

    await context.applyFarmTypeCostToRunningSession('breach', { amount: 9, unit: 'chaos' });

    assert.equal(backend.journal, journalBefore);
    assert.equal(context.currentSession, session);
    assert.deepEqual(sent, []);
  }
  const idle = loadRunningCost({ running: null, journalSession: runningSession() });
  await idle.context.applyFarmTypeCostToRunningSession('breach', { amount: 9, unit: 'chaos' });
  assert.deepEqual(idle.sent, []);
});

test('a changed divine cost waits as pending on the running map while the rate is unknown', async () => {
  const session = runningSession({ costChaos: 10 });
  const { context } = loadRunningCost({ running: session, journalSession: session, divineChaos: null });

  await context.applyFarmTypeCostToRunningSession('breach', { amount: 2, unit: 'divine' });

  assert.equal(context.currentSession.costChaos, 0);
  assert.deepEqual(plainJson(context.currentSession.costPending), { amount: 2, unit: 'divine' });
  assert.equal(context.currentSession.profitChaos, 0);
});

test('the cost channels are checked, main-window only and wired through preload', () => {
  const preloadJs = fs.readFileSync(preloadJsPath, 'utf8').replace(/\r\n/g, '\n');
  const scopesStart = mainSource.indexOf('const IPC_RENDERER_SCOPES');

  assert.match(mainSource, /ipcMain\.handle\('get-farm-type-costs', \(\) => getStoredFarmTypeCosts\(\)\);/);
  assert.match(mainSource, /ipcMain\.handle\('set-farm-type-cost', async \(event, farmTypeId, input\) => \{\n\s+try \{\n\s+assertDesktopUserAuthenticated\(\);\n\s+const result = setStoredFarmTypeCost\(farmTypeId, input\);\n\s+if \(result\.ok\) \{\n\s+await applyFarmTypeCostToRunningSession\(farmTypeId, result\.costs\[farmTypeId\] \|\| null\);/);
  assert.match(mainSource, /ipcMain\.handle\('update-session-cost', async \(event, sessionId, costChaos\) => \{\n\s+try \{\n\s+assertDesktopUserAuthenticated\(\);\n\s+return editSessionCost\(sessionId, costChaos\);\n\s+\} catch \(error\) \{\n\s+throw toRendererError\(error, 'Failed to update the cost'\);/);
  assert.doesNotMatch(mainSource.slice(scopesStart, mainSource.indexOf('});', scopesStart)), /farm-type-cost|session-cost/);
  assert.ok(preloadJs.includes("  getFarmTypeCosts: () => ipcRenderer.invoke('get-farm-type-costs'),"));
  assert.ok(preloadJs.includes("  setFarmTypeCost: (farmTypeId, cost) => ipcRenderer.invoke('set-farm-type-cost', farmTypeId, cost),"));
  assert.ok(preloadJs.includes("  updateSessionCost: (sessionId, costChaos) => ipcRenderer.invoke('update-session-cost', sessionId, costChaos),"));
  assert.ok(preloadJs.includes("ipcRenderer.on('session-cost-updated', (event, data) => callback(data));"));
  assert.match(preloadJs, /ALLOWED_CHANNELS = \[[^\]]*'session-cost-updated'/);
});
