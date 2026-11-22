const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const localJournal = require('../src/modules/localJournalModel');
const accountStateModel = require('../src/modules/accountStateModel');
const { getTopLootOutputs, normalizeMapResultForLedger } = require('../src/modules/mapResultStoreModel');

const desktopDir = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(desktopDir, 'main.js'), 'utf8').replace(/\r\n/g, '\n');
const appSource = fs.readFileSync(path.join(desktopDir, 'src', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const preloadSource = fs.readFileSync(path.join(desktopDir, 'preload.js'), 'utf8').replace(/\r\n/g, '\n');

const NOW = new Date('2026-11-22T10:00:00.000Z');
const ENDED_AT = '2026-11-22T10:20:00.000Z';

// A top-level function of the file, async or not, up to its closing brace in column zero.
function loadFunctions(source, functionNames, contextOverrides = {}) {
  const context = vm.createContext({ console: { log() {}, warn() {} }, ...contextOverrides });
  for (const functionName of functionNames) {
    const match = new RegExp(`\\n(async )?function ${functionName}\\(`).exec(source);
    assert.ok(match, `should define ${functionName}()`);
    const end = source.indexOf('\n}\n', match.index);
    vm.runInContext(`${source.slice(match.index, end + 2)};\nthis.${functionName} = ${functionName};`, context);
  }
  return context;
}

const plain = (value) => JSON.parse(JSON.stringify(value));

// A run of 10 chaos entry cost in Forbidden Rites with three items, ended unless `active`.
function journalWithRun({ active = false, id = 'run-1', league = 'Forbidden Rites' } = {}) {
  let ids = 0;
  let journal = localJournal.startSession({ sessions: [] }, {
    mapName: 'Savannah', poeVersion: 'poe2', league, costChaos: 10, startedAt: '2026-11-22T10:00:00.000Z'
  }, { id, now: NOW }).journal;
  journal = localJournal.addLoot(journal, id, [
    { itemName: 'Divine Orb', chaosValue: 400, divineValue: 1, quantity: 2, icon: 'https://web.poecdn.com/divine.png', source: 'inventory' },
    { itemName: 'Exalted Orb', chaosValue: 20, divineValue: 0.05, quantity: 5, source: 'inventory' },
    { itemName: 'Omen of Light', chaosValue: 300, divineValue: 0.75, quantity: 1, icon: 'https://web.poecdn.com/omen.png', source: 'manual' }
  ], { createId: () => `loot-${(ids += 1)}`, now: NOW }).journal;
  return active ? journal : localJournal.endSession(journal, id, { endedAt: ENDED_AT }, { now: NOW }).journal;
}

// Runes of Aldur prices: cheaper, and no price for the omen.
const ALDUR_PRICES = {
  'divine orb': { chaosValue: 150, divineValue: 1, icon: 'https://web.poecdn.com/divine-2.png' },
  'exalted orb': { chaosValue: 3, divineValue: 0.02 },
  'mirror of kalandra': { chaosValue: 90000, divineValue: 600 }
};
const aldurPriceOf = (name) => ALDUR_PRICES[String(name).toLowerCase()] || null;

// --- The journal ---------------------------------------------------------------------------------------------------

test('a run moved to another league takes it, and its loot is priced again by name with that league', () => {
  const journal = journalWithRun();
  const { journal: moved, session } = localJournal.changeSessionLeague(journal, 'run-1', ' Runes of Aldur ', {
    priceOf: aldurPriceOf,
    now: new Date('2026-11-22T11:00:00.000Z')
  });

  assert.equal(session.league, 'Runes of Aldur');
  const byName = Object.fromEntries(session.lootEntries.map((loot) => [loot.itemName, loot]));
  assert.equal(byName['Divine Orb'].chaosValue, 150);
  assert.equal(byName['Divine Orb'].divineValue, 1);
  assert.equal(byName['Divine Orb'].icon, 'https://web.poecdn.com/divine-2.png');
  assert.equal(byName['Divine Orb'].quantity, 2);
  assert.equal(byName['Exalted Orb'].chaosValue, 3);
  assert.equal(byName['Exalted Orb'].divineValue, 0.02);
  // No price in the new league: it counts 0, as unpriced loot does when it is read, and keeps its art.
  assert.equal(byName['Omen of Light'].chaosValue, 0);
  assert.equal(byName['Omen of Light'].divineValue, null);
  assert.equal(byName['Omen of Light'].icon, 'https://web.poecdn.com/omen.png');
  assert.equal(byName['Omen of Light'].source, 'manual');

  // Totals follow the loot; the entry cost stays.
  assert.equal(session.costChaos, 10);
  assert.equal(session.totalLootChaos, 2 * 150 + 5 * 3);
  assert.equal(session.profitChaos, 2 * 150 + 5 * 3 - 10);
  assert.equal(session.status, 'completed');
  assert.equal(session.endedAt, ENDED_AT);
  assert.equal(session.updatedAt, '2026-11-22T11:00:00.000Z');
  assert.deepEqual(plain(localJournal.getSession(moved, 'run-1')), plain(session));
  // The journal it was given is not changed.
  assert.equal(localJournal.getSession(journal, 'run-1').league, 'Forbidden Rites');
});

test('a running run moves the same way and stays running', () => {
  const { session } = localJournal.changeSessionLeague(journalWithRun({ active: true }), 'run-1', 'Runes of Aldur', {
    priceOf: aldurPriceOf,
    now: NOW
  });

  assert.equal(session.status, 'active');
  assert.equal(session.league, 'Runes of Aldur');
  assert.equal(session.totalLootChaos, 315);
  assert.equal(session.profitChaos, 305);
});

test('only the named run moves', () => {
  const journal = {
    sessions: [
      ...journalWithRun({ id: 'run-1' }).sessions,
      ...journalWithRun({ id: 'run-2' }).sessions
    ]
  };
  const { journal: moved } = localJournal.changeSessionLeague(journal, 'run-2', 'Runes of Aldur', { priceOf: aldurPriceOf, now: NOW });

  assert.deepEqual(plain(localJournal.getSession(moved, 'run-1')), plain(localJournal.getSession(journal, 'run-1')));
  assert.equal(localJournal.getSession(moved, 'run-2').league, 'Runes of Aldur');
});

test('a run whose totals came from a stash diff is refused and left as it is', () => {
  let journal = localJournal.startSession({ sessions: [] }, {
    mapName: 'Strand', poeVersion: 'poe1', league: 'Mirage', costChaos: 5
  }, { id: 'stash-run', now: NOW }).journal;
  journal = localJournal.addLoot(journal, 'stash-run', [{ itemName: 'Divine Orb', chaosValue: 200, quantity: 1 }], {
    createId: () => 'loot-1',
    now: NOW
  }).journal;
  // The stash diff passed its own totals, which counted stash losses.
  journal = localJournal.endSession(journal, 'stash-run', { endedAt: ENDED_AT, totalLootChaos: 180, profitChaos: 140 }, { now: NOW }).journal;

  assert.throws(
    () => localJournal.changeSessionLeague(journal, 'stash-run', 'Standard', { priceOf: aldurPriceOf, now: NOW }),
    (error) => error.code === 'SESSION_TOTALS_FIXED'
  );
  assert.equal(localJournal.getSession(journal, 'stash-run').league, 'Mirage');
});

test('an unknown run, a run neither running nor ended, and a missing league are refused', () => {
  const journal = journalWithRun();
  const move = (sessionId, league, edit = (value) => value) => () => localJournal.changeSessionLeague(edit(journal), sessionId, league, {
    priceOf: aldurPriceOf,
    now: NOW
  });

  assert.throws(move('nope', 'Runes of Aldur'), (error) => error.code === 'SESSION_NOT_FOUND');
  assert.throws(move('run-1', '   '), (error) => error.code === 'LEAGUE_INVALID');
  assert.throws(move('run-1', null), (error) => error.code === 'LEAGUE_INVALID');
  assert.throws(
    move('run-1', 'Runes of Aldur', (value) => ({ sessions: value.sessions.map((session) => ({ ...session, status: 'abandoned' })) })),
    (error) => error.code === 'SESSION_NOT_MOVABLE'
  );
});

// --- Main's handler ------------------------------------------------------------------------------------------------

function snapshotOf(league, prices) {
  return {
    version: 1,
    poeVersion: 'poe2',
    league,
    syncedAt: Date.parse('2026-11-21T10:00:00.000Z'),
    syncedTypes: ['currency'],
    entries: Object.entries(prices).map(([name, price]) => ({ name: name.replace(/\b\w/g, (letter) => letter.toUpperCase()), ...price }))
  };
}

// A price service holding one league's list, like main's.
function fakePriceService({ poeVersion = 'poe2', league = null, prices = {} } = {}) {
  return {
    poeVersion,
    league,
    prices,
    getStatus() { return { itemCount: Object.keys(this.prices).length }; },
    getPriceInfo(name) { return this.prices[String(name).toLowerCase()] || null; }
  };
}

function loadMain({ journal = journalWithRun(), priceService = fakePriceService(), snapshots = {}, currentSession = null,
  results = [], overlayResult = null, syncTo = null } = {}) {
  const backend = { journal, stored: { results }, calls: [] };
  const context = loadFunctions(mainSource, [
    'normalizePositiveRate', 'readLocalChaosPrice', 'updateSessionMapResult', 'getLeaguePriceLookup', 'moveSessionLeague'
  ], {
    localJournal,
    getTopLootOutputs,
    normalizeMapResultForLedger,
    priceService,
    priceSnapshots: {
      load: async (poeVersion, league) => {
        backend.calls.push(['snapshot', poeVersion, league]);
        return snapshots[`${poeVersion}:${league}`] || null;
      }
    },
    // A sync loads the league into the price service, when poe.ninja has it.
    loadSessionPrices: async (session) => {
      backend.calls.push(['loadSessionPrices', session.poeVersion, session.league]);
      if (syncTo && session.league === syncTo.league) {
        priceService.league = syncTo.league;
        priceService.prices = syncTo.prices;
      }
    },
    currentSession,
    overlayMapResultState: overlayResult ? { visible: true, result: overlayResult } : null,
    clearOverlayMapResultDismissTimer: () => backend.calls.push('clearOverlayMapResultDismissTimer'),
    updateOverlayWindow: () => backend.calls.push('updateOverlayWindow'),
    readJournal: () => backend.journal,
    writeJournal: (next) => { backend.journal = next; backend.calls.push('writeJournal'); },
    getMapResultsStoreKey: () => 'results',
    getStoredMapResults: () => backend.stored.results,
    store: { set: (key, value) => { backend.stored[key] = value; } }
  });
  return { context, backend };
}

function storedResult(overrides = {}) {
  return normalizeMapResultForLedger({
    id: `map-result-run-1-${Date.parse(ENDED_AT)}`,
    sessionId: 'run-1',
    poeVersion: 'poe2',
    league: 'Forbidden Rites',
    farmType: 'Breach',
    inputValue: 10,
    outputValue: 1200,
    netProfit: 1190,
    profitState: 'positive',
    lootItemCount: 8,
    profitCurrencyRates: { divineChaos: 400, mirrorChaos: 250000 },
    publishState: 'published',
    publishedRunId: 'hub-7',
    createdAt: ENDED_AT,
    ...overrides
  });
}

test('main prices a moved run with the loaded list when it holds that league, without reading a kept list', async () => {
  const { context, backend } = loadMain({
    priceService: fakePriceService({ league: 'Runes of Aldur', prices: ALDUR_PRICES })
  });

  const result = await context.moveSessionLeague('run-1', 'Runes of Aldur');

  assert.equal(result.success, true);
  assert.equal(result.session.league, 'Runes of Aldur');
  assert.equal(result.session.totalLootChaos, 315);
  assert.equal(localJournal.getSession(backend.journal, 'run-1').league, 'Runes of Aldur');
  assert.equal(backend.calls.some((call) => call[0] === 'snapshot' || call[0] === 'loadSessionPrices'), false);
});

test('main uses the kept list of a league the price service does not hold, and syncs nothing while another run runs', async () => {
  const { context, backend } = loadMain({
    priceService: fakePriceService({ league: 'Forbidden Rites', prices: { 'divine orb': { chaosValue: 400 } } }),
    snapshots: { 'poe2:Runes of Aldur': snapshotOf('Runes of Aldur', ALDUR_PRICES) },
    currentSession: { id: 'other-run', poeVersion: 'poe2', league: 'Forbidden Rites' }
  });

  const result = await context.moveSessionLeague('run-1', 'Runes of Aldur');

  assert.equal(result.success, true);
  const divine = result.session.lootEntries.find((loot) => loot.itemName === 'Divine Orb');
  assert.equal(divine.chaosValue, 150);
  assert.equal(divine.icon, 'https://web.poecdn.com/divine-2.png');
  assert.equal(result.session.totalLootChaos, 315);
  assert.deepEqual(backend.calls.filter((call) => Array.isArray(call)), [['snapshot', 'poe2', 'Runes of Aldur']]);
  // The running run is another one: main's copy of it is not touched.
  assert.equal(context.currentSession.id, 'other-run');
});

test('main syncs the league first when no list is kept and no other run runs', async () => {
  const priceService = fakePriceService({ league: 'Forbidden Rites', prices: { 'divine orb': { chaosValue: 400 } } });
  const { context, backend } = loadMain({ priceService, syncTo: { league: 'Runes of Aldur', prices: ALDUR_PRICES } });

  const result = await context.moveSessionLeague('run-1', 'Runes of Aldur');

  assert.equal(result.success, true);
  assert.equal(result.session.totalLootChaos, 315);
  assert.deepEqual(backend.calls.filter((call) => Array.isArray(call)), [
    ['snapshot', 'poe2', 'Runes of Aldur'],
    ['loadSessionPrices', 'poe2', 'Runes of Aldur']
  ]);
});

test('main refuses without a price list for the league and leaves the run as it was', async () => {
  // poe.ninja has no list for it either.
  const noList = loadMain({ priceService: fakePriceService({ league: 'Forbidden Rites', prices: { 'divine orb': { chaosValue: 400 } } }) });
  const before = plain(noList.backend.journal);
  assert.deepEqual(plain(await noList.context.moveSessionLeague('run-1', 'Runes of Aldur')), { success: false, code: 'LEAGUE_NO_PRICES' });
  assert.deepEqual(plain(noList.backend.journal), before);
  assert.equal(noList.backend.calls.includes('writeJournal'), false);

  // Another run runs: its prices are not swapped out for a sync, so nothing can price the move.
  const busy = loadMain({
    syncTo: { league: 'Runes of Aldur', prices: ALDUR_PRICES },
    currentSession: { id: 'other-run', poeVersion: 'poe2', league: 'Forbidden Rites' }
  });
  assert.deepEqual(plain(await busy.context.moveSessionLeague('run-1', 'Runes of Aldur')), { success: false, code: 'LEAGUE_NO_PRICES' });
  assert.equal(busy.backend.calls.some((call) => call[0] === 'loadSessionPrices'), false);
  assert.equal(localJournal.getSession(busy.backend.journal, 'run-1').league, 'Forbidden Rites');

  // No such run, or no league named.
  await assert.rejects(noList.context.moveSessionLeague('nope', 'Runes of Aldur'), (error) => error.code === 'SESSION_NOT_FOUND');
  await assert.rejects(noList.context.moveSessionLeague('run-1', ' '), (error) => error.code === 'LEAGUE_INVALID');
});

test('main moves the running run itself, syncing for it, and its later loot reads the new league', async () => {
  const journal = journalWithRun({ active: true });
  const { context, backend } = loadMain({
    journal,
    currentSession: localJournal.getSession(journal, 'run-1'),
    syncTo: { league: 'Runes of Aldur', prices: ALDUR_PRICES }
  });

  const result = await context.moveSessionLeague('run-1', 'Runes of Aldur');

  assert.equal(result.success, true);
  assert.equal(context.currentSession.league, 'Runes of Aldur');
  assert.equal(context.currentSession.totalLootChaos, 315);
  assert.ok(backend.calls.includes('updateOverlayWindow'));
  // Once to price the move, once more for the run's own later reads.
  assert.equal(backend.calls.filter((call) => call[0] === 'loadSessionPrices').length, 2);
  // A running run has no saved result yet.
  assert.deepEqual(backend.stored.results, []);
});

test('main replaces the saved result of a moved run in place, with the new league, numbers and rates', async () => {
  const other = { id: 'map-result-other', sessionId: 'other-run', league: 'Forbidden Rites', netProfit: 5 };
  const { context, backend } = loadMain({
    priceService: fakePriceService({ league: 'Runes of Aldur', prices: ALDUR_PRICES }),
    results: [storedResult(), other],
    overlayResult: { sessionId: 'run-1', netProfit: 1190 }
  });

  const { session } = await context.moveSessionLeague('run-1', 'Runes of Aldur');

  const [result, kept] = backend.stored.results;
  assert.equal(backend.stored.results.length, 2);
  assert.deepEqual(kept, other);
  assert.equal(result.id, `map-result-run-1-${Date.parse(ENDED_AT)}`);
  assert.equal(result.league, 'Runes of Aldur');
  assert.equal(result.outputValue, 315);
  assert.equal(result.netProfit, 305);
  assert.equal(result.profitChaos, 305);
  assert.equal(result.inputValue, 10);
  assert.deepEqual(plain(result.topOutputs), plain(getTopLootOutputs(session.lootEntries)));
  // Its rates are the new league's, so it is tiered by them; its place and publish state stay.
  assert.equal(result.profitCurrencyRateSnapshot.chaosDivineRate, 150);
  assert.equal(result.profitCurrencyRateSnapshot.mirrorChaosRate, 90000);
  assert.equal(result.publishState, 'published');
  assert.equal(result.publishedRunId, 'hub-7');
  // The overlay no longer shows the old league's card.
  assert.equal(context.overlayMapResultState, null);
  assert.ok(backend.calls.includes('clearOverlayMapResultDismissTimer'));
});

test('main says a stash diff run cannot move, and keeps it and its result', async () => {
  let journal = localJournal.startSession({ sessions: [] }, { mapName: 'Strand', poeVersion: 'poe2', league: 'Forbidden Rites' }, { id: 'run-1', now: NOW }).journal;
  journal = localJournal.endSession(journal, 'run-1', { endedAt: ENDED_AT, totalLootChaos: 180, profitChaos: 140 }, { now: NOW }).journal;
  const { context, backend } = loadMain({
    journal,
    priceService: fakePriceService({ league: 'Runes of Aldur', prices: ALDUR_PRICES }),
    results: [storedResult()]
  });

  assert.deepEqual(plain(await context.moveSessionLeague('run-1', 'Runes of Aldur')), { success: false, code: 'SESSION_TOTALS_FIXED' });
  assert.equal(backend.calls.includes('writeJournal'), false);
  assert.equal(backend.stored.results[0].league, 'Forbidden Rites');
});

test('main answers move-session-league for a signed-in user, and the window can ask for it', () => {
  assert.match(
    mainSource,
    /ipcMain\.handle\('move-session-league', async \(event, sessionId, league\) => \{\n\s+try \{\n\s+assertDesktopUserAuthenticated\(\);\n\s+return await moveSessionLeague\(sessionId, league\);/
  );
  assert.match(preloadSource, /moveSessionLeague: \(sessionId, league\) => ipcRenderer\.invoke\('move-session-league', sessionId, league\)/);
});

// --- The window: runs started before the character was confirmed ---------------------------------------------------

const CHARACTERS = [
  { id: 'rites-char', name: 'RitesMonk', level: 90, className: 'Monk', league: 'Forbidden Rites', poeVersion: 'poe2' },
  { id: 'aldur-char', name: 'AldurWitch', level: 60, className: 'Witch', league: 'Runes of Aldur', poeVersion: 'poe2' }
];

function loadRenderer({ moveResult = (sessionId, league) => ({ success: true, session: { id: sessionId, league } }) } = {}) {
  const calls = [];
  const state = {
    settings: { lastKnownAccountState: { confirmedCharacterByGame: { poe2: 'rites-char' } } },
    account: { charactersByGame: { poe2: CHARACTERS } },
    deviceCharactersByGame: {},
    characterSession: null,
    selectedSession: null
  };
  const context = loadFunctions(appSource, ['confirmActiveCharacter', 'trackUnconfirmedRun', 'moveUnconfirmedRuns'], {
    state,
    getAccountStateModel: () => accountStateModel,
    refreshAccountStateFromCurrentUser: () => calls.push('refreshAccountState'),
    renderCharacterSummaryCard: () => {},
    refreshRendererOverlayState: () => {},
    redrawSessionLoot: () => calls.push('redrawSessionLoot'),
    refreshTrackerData: async (options) => calls.push(['refreshTrackerData', plain(options)]),
    window: {
      electronAPI: {
        moveSessionLeague: async (sessionId, league) => {
          calls.push(['move', sessionId, league]);
          return moveResult(sessionId, league);
        }
      }
    }
  });
  return { context, state, calls };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('runs started before the character is confirmed move to its league once it is, the running one too', async () => {
  const { context, state, calls } = loadRenderer();
  state.characterSession = { poeVersion: 'poe2', confirmed: false };

  context.trackUnconfirmedRun({ id: 'run-1', poeVersion: 'poe2', league: 'Forbidden Rites', status: 'completed' });
  context.trackUnconfirmedRun({ id: 'run-2', poeVersion: 'poe2', league: 'Forbidden Rites', status: 'active' });
  // The same run again (a resume), and a run of the other game, add nothing.
  context.trackUnconfirmedRun({ id: 'run-2', poeVersion: 'poe2', league: 'Forbidden Rites', status: 'active' });
  context.trackUnconfirmedRun({ id: 'poe1-run', poeVersion: 'poe1', league: 'Mirage' });
  assert.deepEqual(plain(state.characterSession.runs), [
    { id: 'run-1', league: 'Forbidden Rites' },
    { id: 'run-2', league: 'Forbidden Rites' }
  ]);

  context.confirmActiveCharacter('poe2', 'aldur-char');
  await settle();

  assert.deepEqual(calls.filter((call) => Array.isArray(call)), [
    ['move', 'run-1', 'Runes of Aldur'],
    ['move', 'run-2', 'Runes of Aldur'],
    ['refreshTrackerData', { includeSessions: true, immediate: true }]
  ]);
  assert.deepEqual(plain(state.characterSession), { poeVersion: 'poe2', confirmed: true });
  // The card remembers the character as the last played of its league.
  assert.deepEqual(plain(state.settings.lastKnownAccountState.lastPlayedByLeague), { poe2: { 'runes of aldur': 'aldur-char' } });
  assert.equal(state.settings.lastKnownAccountState.confirmedCharacterByGame.poe2, 'aldur-char');

  // Confirmed now: later runs are in the right league already, and a second confirmation moves nothing.
  context.trackUnconfirmedRun({ id: 'run-3', poeVersion: 'poe2', league: 'Runes of Aldur' });
  context.confirmActiveCharacter('poe2', 'rites-char');
  await settle();
  assert.equal(calls.filter((call) => call[0] === 'move').length, 2);
});

test('nothing moves when the confirmed character plays the league the runs started in', async () => {
  const { context, state, calls } = loadRenderer();
  state.characterSession = { poeVersion: 'poe2', confirmed: false };
  context.trackUnconfirmedRun({ id: 'run-1', poeVersion: 'poe2', league: 'forbidden rites ' });

  context.confirmActiveCharacter('poe2', 'rites-char');
  await settle();

  assert.deepEqual(calls.filter((call) => Array.isArray(call)), []);
  assert.deepEqual(plain(state.settings.lastKnownAccountState.lastPlayedByLeague), { poe2: { 'forbidden rites': 'rites-char' } });
});

test('a run main cannot move stays, the open run drawer shows a moved run, and only a move refreshes', async () => {
  const { context, state, calls } = loadRenderer({
    moveResult: (sessionId, league) => (sessionId === 'run-1'
      ? { success: false, code: 'LEAGUE_NO_PRICES' }
      : { success: true, session: { id: sessionId, league, totalLootChaos: 3 } })
  });
  state.characterSession = { poeVersion: 'poe2', confirmed: false };
  state.selectedSession = { id: 'run-2', league: 'Forbidden Rites' };
  context.trackUnconfirmedRun({ id: 'run-1', poeVersion: 'poe2', league: 'Forbidden Rites' });
  context.trackUnconfirmedRun({ id: 'run-2', poeVersion: 'poe2', league: 'Forbidden Rites' });

  context.confirmActiveCharacter('poe2', 'aldur-char');
  await settle();

  assert.deepEqual(plain(state.selectedSession), { id: 'run-2', league: 'Runes of Aldur', totalLootChaos: 3 });
  assert.ok(calls.includes('redrawSessionLoot'));
  assert.equal(calls.filter((call) => call[0] === 'refreshTrackerData').length, 1);

  // Every move failing refreshes nothing.
  const failing = loadRenderer({ moveResult: () => ({ success: false, code: 'LEAGUE_NO_PRICES' }) });
  failing.state.characterSession = { poeVersion: 'poe2', confirmed: false };
  failing.context.trackUnconfirmedRun({ id: 'run-1', poeVersion: 'poe2', league: 'Forbidden Rites' });
  failing.context.confirmActiveCharacter('poe2', 'aldur-char');
  await settle();
  assert.deepEqual(failing.calls.filter((call) => call[0] === 'refreshTrackerData'), []);
});

test('the window tracks each started run while the character is unconfirmed', () => {
  const start = appSource.indexOf('window.electronAPI.onSessionStarted((session) => {');
  const body = appSource.slice(start, appSource.indexOf('\n  });', start));
  assert.match(body, /if \(state\.characterSession\?\.confirmed === false\) \{\n\s+trackUnconfirmedRun\(session\);/);
});

// --- The run drawer's League field ---------------------------------------------------------------------------------

function loadLeagueField({ moveResult = async (sessionId, league) => ({ success: true, session: { id: sessionId, poeVersion: 'poe2', league } }) } = {}) {
  const calls = [];
  const state = {
    selectedSession: { id: 'run-1', poeVersion: 'poe2', league: 'Forbidden Rites' },
    sessionLootEditing: true,
    sessionLeagueOptions: {},
    sessionLeagueBusy: false,
    sessionLeagueNote: null,
    sessionLootBusyId: null,
    sessionCostBusy: false
  };
  let answerLeagues = null;
  const context = loadFunctions(appSource, ['getKnownLeagues', 'ensureSessionLeagueOptions', 'sessionLeagueEditHTML', 'handleSessionLeagueChange'], {
    state,
    FALLBACK_POE1_LEAGUES: ['Standard'],
    FALLBACK_POE2_LEAGUES: ['Standard', 'Hardcore'],
    escapeHTML: (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    redrawSessionLoot: (focus) => calls.push(['redraw', plain(focus ?? null)]),
    announceStatus: (text) => calls.push(['announce', text]),
    refreshTrackerData: async (options) => calls.push(['refreshTrackerData', plain(options)]),
    getUserFacingErrorMessage: () => 'try again',
    window: {
      t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
      electronAPI: {
        getCurrencyLeagues: (poeVersion) => {
          calls.push(['getCurrencyLeagues', poeVersion]);
          return new Promise((resolve) => { answerLeagues = resolve; });
        },
        moveSessionLeague: async (sessionId, league) => {
          calls.push(['move', sessionId, league]);
          return moveResult(sessionId, league);
        }
      }
    }
  });
  return { context, state, calls, answerLeagues: (data) => answerLeagues(data) };
}

function changeEvent(value) {
  const select = { value, disabled: false };
  return { select, event: { target: { closest: (selector) => (selector === '.session-drawer-league' ? select : null) } } };
}

const optionValues = (html) => [...html.matchAll(/<option value="([^"]*)"/g)].map((match) => match[1]);

test('the League field lists the run league first, then the Market list of its game once read', async () => {
  const field = loadLeagueField();

  const first = field.context.sessionLeagueEditHTML(field.state.selectedSession);
  assert.match(first, /^<select class="session-drawer-league" aria-label="sessions\.league">/);
  assert.deepEqual(optionValues(first), ['Forbidden Rites']);
  assert.match(first, /<option value="Forbidden Rites" selected>/);

  field.answerLeagues({ activeLeagues: [{ name: 'Runes of Aldur' }, { name: 'Forbidden Rites' }], leagues: [] });
  await settle();
  // The list arrived: the drawer is drawn again, and the list is read once per game.
  assert.ok(field.calls.some((call) => call[0] === 'redraw'));
  const html = field.context.sessionLeagueEditHTML(field.state.selectedSession);
  assert.deepEqual(optionValues(html), ['Forbidden Rites', 'Runes of Aldur', 'Standard', 'Hardcore']);
  assert.equal(field.calls.filter((call) => call[0] === 'getCurrencyLeagues').length, 1);
});

test('picking another league moves the run through main and says its loot was priced again', async () => {
  const field = loadLeagueField();
  const { select, event } = changeEvent('Runes of Aldur');

  await field.context.handleSessionLeagueChange(event);

  assert.deepEqual(field.calls.filter((call) => call[0] !== 'getCurrencyLeagues'), [
    ['move', 'run-1', 'Runes of Aldur'],
    ['redraw', { kind: 'league' }],
    ['announce', 'sessions.leagueRepriced:{"league":"Runes of Aldur"}'],
    ['refreshTrackerData', { includeSessions: true, immediate: true }]
  ]);
  assert.equal(select.disabled, true);
  assert.equal(field.state.selectedSession.league, 'Runes of Aldur');
  assert.equal(field.state.sessionLeagueBusy, false);
  assert.match(field.context.sessionLeagueEditHTML(field.state.selectedSession),
    /<\/select><span class="session-drawer-cost-note">sessions\.leagueRepriced:\{&quot;league&quot;:&quot;Runes of Aldur&quot;\}<\/span>$/);
});

test('a league main has no prices for keeps the old league and says why', async () => {
  const field = loadLeagueField({ moveResult: async () => ({ success: false, code: 'LEAGUE_NO_PRICES' }) });

  await field.context.handleSessionLeagueChange(changeEvent('Runes of Aldur').event);

  assert.equal(field.state.selectedSession.league, 'Forbidden Rites');
  assert.deepEqual(plain(field.state.sessionLeagueNote), { sessionId: 'run-1', text: 'sessions.leagueNoPrices:{"league":"Runes of Aldur"}' });
  assert.equal(field.calls.some((call) => call[0] === 'refreshTrackerData'), false);
  const html = field.context.sessionLeagueEditHTML(field.state.selectedSession);
  assert.match(html, /<option value="Forbidden Rites" selected>/);
  assert.match(html, /sessions\.leagueNoPrices/);

  const stash = loadLeagueField({ moveResult: async () => ({ success: false, code: 'SESSION_TOTALS_FIXED' }) });
  await stash.context.handleSessionLeagueChange(changeEvent('Runes of Aldur').event);
  assert.equal(stash.state.sessionLeagueNote.text, 'sessions.leagueStashTotals:{"league":"Runes of Aldur"}');
});

test('the same league, or a pick while another change saves, sends nothing and shows the run league again', async () => {
  const field = loadLeagueField();
  await field.context.handleSessionLeagueChange(changeEvent('Forbidden Rites').event);

  field.state.sessionCostBusy = true;
  const { select, event } = changeEvent('Runes of Aldur');
  await field.context.handleSessionLeagueChange(event);

  assert.equal(select.value, 'Forbidden Rites');
  assert.deepEqual(field.calls.filter((call) => call[0] === 'move'), []);
});

test('the drawer shows the League field in Edit only, and its changes reach the handler', () => {
  const render = appSource.slice(appSource.indexOf('\nfunction renderSessionDrawer('), appSource.indexOf('\nfunction renderSessionDrawer(') + 8000);
  assert.match(render, /\$\{fact\('sessions\.game', contextLabel\)\}\n\s+\$\{lootEditing && typeof sessionLeagueEditHTML === 'function' \? fact\('sessions\.league', sessionLeagueEditHTML\(session\)\) : ''\}/);
  assert.match(appSource, /elements\.sessionDrawerSummary\.addEventListener\('change', handleSessionLeagueChange\);/);
  // It looks like the Cost field's unit picker.
  const css = fs.readFileSync(path.join(desktopDir, 'src', 'styles.css'), 'utf8');
  assert.match(css, /\.session-drawer-cost-input,\s*\.session-drawer-cost-unit,\s*\.session-drawer-league \{/);
});
