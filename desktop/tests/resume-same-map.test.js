const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const LogParser = require('../src/modules/logParser');
const localJournal = require('../src/modules/localJournalModel');
const overlayStateModel = require('../src/modules/overlayStateModel');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function loadFunctions(functionNames, context) {
  for (const functionName of functionNames) {
    const match = new RegExp(`\\n(async )?function ${functionName}\\(`).exec(mainSource);
    assert.ok(match, `main.js should define ${functionName}()`);
    const end = mainSource.indexOf('\n}\n', match.index);
    vm.runInContext(`${mainSource.slice(match.index, end + 2)};\nthis.${functionName} = ${functionName};`, context);
  }
  return context;
}

const line = (time, text) => `2026/11/20 ${time} 1 abc [DEBUG Client 1] ${text}`;

test('the log parser names the map entered by its area and seed', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const entered = [];
  parser.on('mapEntered', (data) => entered.push(data.mapIdentity));

  parser.parseLine(line('10:44:58', 'Generating level 79 area "MapAugury" with seed 1366560895'));
  parser.parseLine(line('10:53:02', 'Generating level 65 area "HideoutCanal" with seed 1'));
  parser.parseLine(line('10:53:40', 'Generating level 79 area "MapAugury" with seed 1366560895'));

  assert.deepEqual(entered, [
    { areaId: 'mapaugury', seed: '1366560895' },
    { areaId: 'mapaugury', seed: '1366560895' }
  ]);
});

function startedJournal(now) {
  return localJournal.startSession({ sessions: [] }, { mapName: 'Augury', poeVersion: 'poe2', costChaos: 10 }, { id: 's1', now });
}

test('a resumed run keeps its start, cost and loot, and its length leaves out the time away', () => {
  const t0 = new Date('2026-11-20T10:00:00.000Z');
  let { journal } = startedJournal(t0);
  ({ journal } = localJournal.addLoot(journal, 's1', [{ itemName: 'Exalted Orb', quantity: 2, chaosValue: 5 }], {
    createId: () => 'loot-1', now: t0
  }));
  // Five minutes in the map, two in the hideout, three more in the map.
  ({ journal } = localJournal.endSession(journal, 's1', { endedAt: '2026-11-20T10:05:00.000Z' }, { now: new Date('2026-11-20T10:05:00.000Z') }));
  const resumed = localJournal.resumeSession(journal, 's1', { now: new Date('2026-11-20T10:07:00.000Z') });

  assert.equal(resumed.session.status, 'active');
  assert.equal(resumed.session.endedAt, null);
  assert.equal(resumed.session.durationSec, null);
  assert.equal(resumed.session.pausedSec, 120);
  assert.equal(resumed.session.startedAt, '2026-11-20T10:00:00.000Z');
  assert.equal(resumed.session.costChaos, 10);
  assert.equal(resumed.session.lootEntries.length, 1);
  assert.equal(localJournal.getActiveSession(resumed.journal).id, 's1');

  const ended = localJournal.endSession(resumed.journal, 's1', { endedAt: '2026-11-20T10:10:00.000Z' }, { now: new Date('2026-11-20T10:10:00.000Z') });
  assert.equal(ended.session.durationSec, 480);
  assert.equal(ended.session.profitChaos, 0);

  // A second trip away adds to the time left out.
  const again = localJournal.resumeSession(ended.journal, 's1', { now: new Date('2026-11-20T10:11:00.000Z') });
  assert.equal(again.session.pausedSec, 180);
});

test('only a finished run is resumed, and never beside a running one', () => {
  const t0 = new Date('2026-11-20T10:00:00.000Z');
  const { journal } = startedJournal(t0);
  assert.throws(() => localJournal.resumeSession(journal, 's1', { now: t0 }), { code: 'SESSION_ALREADY_ACTIVE' });

  const ended = localJournal.endSession(journal, 's1', {}, { now: t0 }).journal;
  assert.throws(() => localJournal.resumeSession(ended, 'gone', { now: t0 }), { code: 'COMPLETED_SESSION_NOT_FOUND' });
  const other = localJournal.startSession(ended, { mapName: 'Port', poeVersion: 'poe2' }, { id: 's2', now: t0 }).journal;
  assert.throws(() => localJournal.resumeSession(other, 's1', { now: t0 }), { code: 'SESSION_ALREADY_ACTIVE' });
});

test('the clocks of a resumed run leave out the time away', () => {
  const session = { mapName: 'Augury', startedAt: '2026-11-20T10:00:00.000Z', pausedSec: 120 };
  const card = overlayStateModel.deriveOverlayState({ enabled: true, session, now: Date.parse('2026-11-20T10:10:00.000Z') });
  assert.deepEqual(card.clock, { kind: 'session', base: 480, at: Date.parse('2026-11-20T10:10:00.000Z') });
  assert.ok(appSource.includes('return Math.max(0, Math.floor((endTime - startTime) / 1000) - (Number(session.pausedSec) || 0));'));
});

// main.js's map entry and exit around a journal held in memory.
function createMain({ profileId = 'p1' } = {}) {
  const t0 = new Date('2026-11-20T10:00:00.000Z');
  const env = { journal: startedJournal(t0).journal, profileId, now: new Date('2026-11-20T10:07:00.000Z'), results: [], failRead: false };
  const log = { sent: [], watcher: [], poe1: [], warned: [], published: [] };
  const context = vm.createContext({
    console: { warn: (...args) => log.warned.push(args.join(' ')) },
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [env.now.getTime()])); } },
    Boolean,
    localJournal,
    readJournal: () => { if (env.failRead) throw new Error('JOURNAL_UNREADABLE'); return env.journal; },
    writeJournal: (journal) => { env.journal = journal; },
    getActiveProfile: () => (env.profileId ? { id: env.profileId } : null),
    getMapResultsStoreKey: () => 'mapResults:p1',
    getStoredMapResults: () => env.results,
    store: { set: (key, value) => { env.results = value; } },
    clearOverlayMapResultDismissTimer: () => log.sent.push('timer-cleared'),
    overlayMapResultState: { visible: true },
    mainWindow: { webContents: { send: (channel, payload) => log.sent.push([channel, payload.id, payload.status]) } },
    currentSession: null,
    inventoryWatcher: {
      mapEntered: () => log.watcher.push('entered'),
      mapResumed: (id) => log.watcher.push(`resumed ${id}`)
    },
    startPoe1EntryRead: () => log.poe1.push('entry'),
    resumePoe1Entry: () => log.poe1.push('resume'),
    inventoryReadAnnounced: new Set(),
    overlayInventoryStatus: null,
    publishRuntimeSessionEvent: (type) => log.published.push(type)
  });
  vm.runInContext('let lastEndedRun = null; let enteredMapIdentity = null;', context);
  loadFunctions(['isSameMapInstance', 'resumeEndedRun', 'rememberEndedRun', 'handleMapEntered'], context);
  const map = (seed, areaId = 'mapaugury') => ({ mapName: 'Augury', mapIdentity: { areaId, seed } });
  // The map exit as main sees it: the run is ended and handed to what the exit remembered.
  const exit = () => {
    const remember = context.rememberEndedRun();
    const ended = localJournal.endSession(env.journal, 's1', { endedAt: '2026-11-20T10:05:00.000Z' }, { now: new Date('2026-11-20T10:05:00.000Z') });
    env.journal = ended.journal;
    context.currentSession = null;
    return remember(ended.session);
  };
  return { context, env, log, map, exit };
}

test('entering the same map again carries its run on: no new run, no second cost, no start card', async () => {
  const main = createMain();
  main.env.results = [{ id: 'r1', sessionId: 's1' }, { id: 'r0', sessionId: 's0' }];
  await main.context.handleMapEntered(main.map('1366560895'));
  main.context.currentSession = localJournal.getActiveSession(main.env.journal);
  main.exit();
  main.log.watcher.length = 0;
  main.log.poe1.length = 0;

  await main.context.handleMapEntered(main.map('1366560895'));

  const active = localJournal.getActiveSession(main.env.journal);
  assert.equal(active.id, 's1');
  assert.equal(active.pausedSec, 120);
  assert.equal(main.env.journal.sessions.length, 1);
  assert.equal(main.context.currentSession.id, 's1');
  // The window hears the run is active before it hears of the map, so it does not ask to start one.
  assert.deepEqual(main.log.sent.filter((entry) => Array.isArray(entry)), [['session-started', 's1', 'active']]);
  assert.deepEqual(main.log.watcher, ['resumed s1']);
  assert.deepEqual(main.log.poe1, ['resume']);
  // The result kept for the first end goes; the run's real end writes its own.
  assert.deepEqual(main.env.results, [{ id: 'r0', sessionId: 's0' }]);
  assert.equal(main.log.published.at(-1), 'area_entered');
});

test('another map, a map without a seed, another profile or a run that is gone starts a new map as before', async () => {
  const cases = [
    { name: 'another seed', enter: (main) => main.map('630325767') },
    { name: 'another area', enter: (main) => main.map('1366560895', 'mapport') },
    { name: 'no seed', first: null, enter: (main) => main.map(null) },
    { name: 'another profile', before: (main) => { main.env.profileId = 'p2'; }, enter: (main) => main.map('1366560895') },
    { name: 'the run was deleted', before: (main) => { main.env.journal = { sessions: [] }; }, enter: (main) => main.map('1366560895') },
    { name: 'the journal cannot be read', before: (main) => { main.env.failRead = true; }, enter: (main) => main.map('1366560895') }
  ];
  for (const scenario of cases) {
    const main = createMain();
    await main.context.handleMapEntered(scenario.first === null ? main.map(null) : main.map('1366560895'));
    main.exit();
    main.log.watcher.length = 0;
    main.log.poe1.length = 0;
    scenario.before?.(main);

    await main.context.handleMapEntered(scenario.enter(main));

    assert.equal(main.context.currentSession, null, scenario.name);
    assert.deepEqual(main.log.watcher, ['entered'], scenario.name);
    assert.deepEqual(main.log.poe1, ['entry'], scenario.name);
    assert.deepEqual(main.log.sent.filter((entry) => Array.isArray(entry)), [], scenario.name);
  }
});

test('a run is offered for resuming once: the entry after a different map does not bring it back', async () => {
  const main = createMain();
  await main.context.handleMapEntered(main.map('1366560895'));
  main.exit();
  await main.context.handleMapEntered(main.map('630325767'));
  main.log.watcher.length = 0;

  await main.context.handleMapEntered(main.map('1366560895'));

  assert.equal(main.context.currentSession, null);
  assert.deepEqual(main.log.watcher, ['entered']);
});

test('a run already running is left alone, and the exit keeps the map it was in', async () => {
  const main = createMain();
  await main.context.handleMapEntered(main.map('1366560895'));
  // The exit notes the map before the run has ended; a map entered meanwhile does not change which map that was.
  const remember = main.context.rememberEndedRun();
  await main.context.handleMapEntered(main.map('630325767'));
  const ended = localJournal.endSession(main.env.journal, 's1', {}, { now: new Date('2026-11-20T10:05:00.000Z') });
  main.env.journal = ended.journal;
  remember(ended.session);

  main.context.currentSession = { id: 'other', status: 'active' };
  await main.context.handleMapEntered(main.map('1366560895'));
  assert.equal(main.context.currentSession.id, 'other');
  assert.equal(localJournal.getSession(main.env.journal, 's1').status, 'completed');
});

test('main ends a resumed run with its whole length, and wires the exit to remember the run', () => {
  assert.ok(mainSource.includes("const durationSeconds = Number.isFinite(explicitDurationSeconds) && explicitDurationSeconds > 0 && !pausedSeconds"));
  assert.ok(mainSource.includes('? Math.max(1, Math.round((endedAtMs - startedAtMs) / 1000) - pausedSeconds)'));
  assert.ok(mainSource.includes("      ending.then(remember, () => {});\n      ending.catch((error) => {"));
});
