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
