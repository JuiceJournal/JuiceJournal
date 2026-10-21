const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const localJournal = require('../src/modules/localJournalModel');

const mainJsPath = path.join(__dirname, '..', 'main.js');

function extractFunctionSource(source, functionName, filePath) {
  const signature = `function ${functionName}`;
  const asyncSignature = `async ${signature}`;
  const asyncStartIndex = source.indexOf(asyncSignature);
  const plainStartIndex = source.indexOf(signature);
  const startIndex = asyncStartIndex !== -1 ? asyncStartIndex : plainStartIndex;

  if (startIndex === -1) {
    assert.fail(`Expected ${path.basename(filePath)} to define ${functionName}()`);
  }

  let bodyStartIndex = -1;
  let parenDepth = 0;
  let seenParamList = false;
  const searchStartIndex = startIndex + (asyncStartIndex !== -1 ? asyncSignature.length : signature.length);

  for (let index = searchStartIndex; index < source.length; index += 1) {
    const char = source[index];

    if (char === '(') {
      parenDepth += 1;
      continue;
    }

    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        seenParamList = true;
      }
      continue;
    }

    if (seenParamList && char === '{') {
      bodyStartIndex = index;
      break;
    }
  }

  if (bodyStartIndex === -1) {
    assert.fail(`Unable to locate ${functionName}() body in ${path.basename(filePath)}`);
  }

  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = bodyStartIndex; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      if (!escaped && char === '\'') {
        inSingleQuote = false;
      }
      escaped = !escaped && char === '\\';
      continue;
    }

    if (inDoubleQuote) {
      if (!escaped && char === '"') {
        inDoubleQuote = false;
      }
      escaped = !escaped && char === '\\';
      continue;
    }

    if (inTemplateString) {
      if (!escaped && char === '`') {
        inTemplateString = false;
      }
      escaped = !escaped && char === '\\';
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === '\'') {
      inSingleQuote = true;
      escaped = false;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      escaped = false;
      continue;
    }

    if (char === '`') {
      inTemplateString = true;
      escaped = false;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  assert.fail(`Unable to parse ${functionName}() from ${path.basename(filePath)}`);
}

function loadFunctions(functionNames, contextOverrides = {}) {
  const source = fs.readFileSync(mainJsPath, 'utf8');
  const context = vm.createContext({
    console: {
      log() {}
    },
    ...contextOverrides
  });

  for (const functionName of functionNames) {
    const functionSource = extractFunctionSource(source, functionName, mainJsPath);
    vm.runInContext(`${functionSource};\nthis.${functionName} = ${functionName};`, context);
  }

  return context;
}

// The real journal model over an in-memory journal, in place of the profile's journal file.
function createJournalBackend() {
  const backend = {
    journal: { sessions: [] },
    start(input = {}, id = 'session-1') {
      const started = localJournal.startSession(backend.journal, {
        mapName: 'Dunes Map',
        poeVersion: 'poe1',
        league: 'Mirage',
        ...input
      }, { id, now: new Date(input.startedAt || Date.now()) });
      backend.journal = started.journal;
      return started.session;
    }
  };
  backend.context = {
    localJournal,
    readJournal: () => backend.journal,
    writeJournal(journal) {
      backend.journal = journal;
    }
  };
  return backend;
}

test('main session start writes the selected farm type to the local journal', async () => {
  const backend = createJournalBackend();
  const context = loadFunctions(['normalizeStoredFarmTypeId', 'startNewSession'], {
    ...backend.context,
    currentSession: null,
    resolveLeagueContext: () => ({
      activeVersion: 'poe1',
      league: 'Mirage'
    }),
    getActiveFarmTypeId: () => 'ritual',
    crypto: { randomUUID: () => 'session-uuid-1' },
    appendAuditTrail() {},
    showNotification() {},
    t: (key) => key,
    mainWindow: null
  });

  const session = await context.startNewSession({
    mapName: 'Dunes Map',
    startedAt: '2026-04-11T10:00:00.000Z'
  });

  assert.equal(session.id, 'session-uuid-1');
  assert.equal(context.currentSession.id, 'session-uuid-1');
  assert.deepEqual(backend.journal.sessions.map((stored) => ({
    id: stored.id,
    mapName: stored.mapName,
    mapType: stored.mapType,
    farmTypeId: stored.farmTypeId,
    poeVersion: stored.poeVersion,
    league: stored.league,
    status: stored.status,
    startedAt: stored.startedAt
  })), [{
    id: 'session-uuid-1',
    mapName: 'Dunes Map',
    mapType: 'ritual',
    farmTypeId: 'ritual',
    poeVersion: 'poe1',
    league: 'Mirage',
    status: 'active',
    startedAt: '2026-04-11T10:00:00.000Z'
  }]);
});

test('main start-map overlay prompt state can be shown and cleared independently of map results', () => {
  const overlayUpdates = [];
  const context = loadFunctions([
    'normalizeStartMapPromptText',
    'normalizeStartMapPromptFarmTypeOptions',
    'showStartMapPromptOverlay',
    'hideStartMapPromptOverlay'
  ], {
    overlayStartMapPromptState: null,
    updateOverlayWindow() {
      overlayUpdates.push(JSON.parse(JSON.stringify(context.overlayStartMapPromptState)));
      return { updated: true };
    }
  });

  context.showStartMapPromptOverlay({
    mapName: 'Channel',
    farmTypeId: 'breach',
    farmType: 'Breach',
    poeVersion: 'poe2',
    league: 'Fate of the Vaal',
    farmTypeOptions: [
      { id: 'breach', label: 'Breach' },
      { id: 'expedition', label: 'Expedition' }
    ]
  }, {
    now: Date.parse('2026-05-06T12:00:00.000Z')
  });

  assert.deepEqual(JSON.parse(JSON.stringify(context.overlayStartMapPromptState)), {
    mapName: 'Channel',
    farmTypeId: 'breach',
    farmType: 'Breach',
    poeVersion: 'poe2',
    league: 'Fate of the Vaal',
    farmTypeOptions: [
      { id: 'breach', label: 'Breach' },
      { id: 'expedition', label: 'Expedition' }
    ],
    source: 'map-detected',
    createdAt: Date.parse('2026-05-06T12:00:00.000Z')
  });

  context.hideStartMapPromptOverlay();

  assert.deepEqual(overlayUpdates, [
    {
      mapName: 'Channel',
      farmTypeId: 'breach',
      farmType: 'Breach',
      poeVersion: 'poe2',
      league: 'Fate of the Vaal',
      farmTypeOptions: [
        { id: 'breach', label: 'Breach' },
        { id: 'expedition', label: 'Expedition' }
      ],
      source: 'map-detected',
      createdAt: Date.parse('2026-05-06T12:00:00.000Z')
    },
    null
  ]);
});

test('main start-map overlay confirmation forwards the selected map details to the renderer', () => {
  const sentEvents = [];
  const overlayUpdates = [];
  const context = loadFunctions([
    'normalizeStartMapPromptText',
    'normalizeStartMapPromptFarmTypeOptions',
    'normalizeStartMapPromptResult',
    'emitStartMapPromptOverlayResult',
    'confirmStartMapPromptOverlay'
  ], {
    overlayStartMapPromptState: {
      mapName: 'Channel',
      farmTypeId: 'breach',
      farmTypeOptions: [
        { id: 'breach', label: 'Breach' },
        { id: 'expedition', label: 'Expedition' }
      ],
      source: 'map-detected'
    },
    mainWindow: {
      isDestroyed: () => false,
      webContents: {
        send(channel, payload) {
          sentEvents.push([channel, JSON.parse(JSON.stringify(payload))]);
        }
      }
    },
    updateOverlayWindow() {
      overlayUpdates.push(JSON.parse(JSON.stringify(context.overlayStartMapPromptState)));
      return { updated: true };
    }
  });

  const result = context.confirmStartMapPromptOverlay({
    mapName: 'Channel',
    farmTypeId: 'expedition'
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    action: 'confirm',
    mapName: 'Channel',
    farmTypeId: 'expedition',
    source: 'map-detected'
  });
  assert.equal(context.overlayStartMapPromptState, null);
  assert.deepEqual(overlayUpdates, [null]);
  assert.deepEqual(sentEvents, [
    ['start-map-prompt-overlay-result', {
      action: 'confirm',
      mapName: 'Channel',
      farmTypeId: 'expedition',
      source: 'map-detected'
    }]
  ]);
});

test('main session start surfaces journal failures to the renderer', async () => {
  const notificationCalls = [];
  const context = loadFunctions(['normalizeStoredFarmTypeId', 'startNewSession'], {
    localJournal,
    readJournal() {
      throw new Error('Local desktop sign-in is required');
    },
    currentSession: null,
    resolveLeagueContext: () => ({
      activeVersion: 'poe1',
      league: 'Mirage'
    }),
    getActiveFarmTypeId: () => null,
    showNotification(title, body) {
      notificationCalls.push([title, body]);
    },
    t: (key) => key,
    mainWindow: null
  });

  await assert.rejects(
    () => context.startNewSession({ mapName: 'Dunes Map' }),
    /Local desktop sign-in is required/
  );

  assert.deepEqual(notificationCalls, [['notificationError', 'sessionStartFailed']]);
});

test('main session end completes a PoE2 zero-profit session in the journal', async () => {
  const backend = createJournalBackend();
  const active = backend.start({
    mapName: 'Channel',
    farmTypeId: 'abyss',
    poeVersion: 'poe2',
    league: 'Fate of the Vaal',
    startedAt: '2026-05-06T12:00:00.000Z'
  }, 'session-1');
  const messages = [];
  const context = loadFunctions(['endCurrentSession'], {
    ...backend.context,
    currentSession: active,
    appendAuditTrail() {},
    showNotification() {},
    t: (key) => key,
    updateOverlayWindow() {},
    mainWindow: {
      webContents: {
        send(channel, payload) {
          messages.push({ channel, payload: JSON.parse(JSON.stringify(payload)) });
        }
      }
    }
  });

  const result = await context.endCurrentSession({
    endedAt: '2026-05-06T12:05:30.000Z'
  });

  assert.equal(result.id, 'session-1');
  assert.equal(result.status, 'completed');
  assert.equal(result.endedAt, '2026-05-06T12:05:30.000Z');
  assert.equal(result.durationSeconds, 330);
  assert.equal(result.profitChaos, 0);
  assert.equal(backend.journal.sessions[0].status, 'completed');
  assert.equal(backend.journal.sessions[0].durationSec, 330);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].channel, 'session-ended');
  assert.equal(messages[0].payload.status, 'completed');
  assert.equal(messages[0].payload.poeVersion, 'poe2');
  assert.equal(context.currentSession, null);
});

test('main session end can target a journal session id after process state is lost', async () => {
  const backend = createJournalBackend();
  backend.start({ startedAt: '2026-05-06T12:00:00.000Z' }, 'session-1');
  const messages = [];
  const context = loadFunctions(['endCurrentSession'], {
    ...backend.context,
    currentSession: null,
    appendAuditTrail() {},
    showNotification() {},
    t: (key) => key,
    updateOverlayWindow() {},
    mainWindow: {
      webContents: {
        send(channel, payload) {
          messages.push({ channel, payload: JSON.parse(JSON.stringify(payload)) });
        }
      }
    }
  });

  const result = await context.endCurrentSession({
    sessionId: 'session-1',
    endedAt: '2026-05-06T12:04:00.000Z',
    totalLootChaos: 12,
    profitChaos: 12
  });

  assert.equal(result.id, 'session-1');
  assert.equal(result.status, 'completed');
  assert.equal(result.durationSeconds, 240);
  assert.equal(backend.journal.sessions[0].totalLootChaos, 12);
  assert.equal(backend.journal.sessions[0].profitChaos, 12);
  assert.equal(messages[0].channel, 'session-ended');
  assert.equal(context.currentSession, null);
});

test('main shutdown finalizer closes an active session without profit data when calculation is unavailable', async () => {
  const calls = [];
  const backend = createJournalBackend();
  const context = loadFunctions([
    'normalizePoeVersion',
    'normalizeStoredFarmTypeId',
    'resolveFarmTypeLabel',
    'getSessionValueNumber',
    'getSessionNumberValue',
    'isUuid',
    'buildSessionShutdownMapResult',
    'withTimeout',
    'resolveShutdownSessionCompletion',
    'endCurrentSession',
    'finalizeActiveSessionOnShutdown'
  ], {
    currentSession: backend.start({ mapType: 'breach', startedAt: '2026-05-06T12:00:00.000Z' }, 'session-shutdown-1'),
    calculateSessionProfitFromPersistedSnapshots: async () => {
      throw new Error('snapshot timeout');
    },
    listFarmTypes: () => [{ id: 'breach', label: 'Breach' }],
    getActiveFarmTypeId: () => 'breach',
    saveMapResultHistory(result) {
      calls.push(['saveMapResultHistory', JSON.parse(JSON.stringify(result))]);
      return [result];
    },
    ...backend.context,
    appendAuditTrail() {},
    showNotification() {},
    t: (key) => key,
    updateOverlayWindow() {},
    mainWindow: null,
    Date: class extends Date {
      constructor(...args) {
        return args.length ? super(...args) : new global.Date('2026-05-06T12:04:00.000Z');
      }

      static now() {
        return new global.Date('2026-05-06T12:04:00.000Z').getTime();
      }

      static parse(value) {
        return global.Date.parse(value);
      }
    },
    console: {
      log() {},
      warn() {}
    },
    setTimeout: (callback) => {
      callback();
      return 1;
    },
    clearTimeout() {}
  });

  const result = await context.finalizeActiveSessionOnShutdown();

  assert.equal(result.status, 'completed');
  assert.equal(result.profitChaos, 0);
  assert.equal(calls[0][0], 'saveMapResultHistory');
  assert.equal(calls[0][1].sessionId, 'session-shutdown-1');
  assert.equal(calls[0][1].farmType, 'Breach');
  assert.equal(calls[0][1].profitUnavailable, true);
  assert.equal(calls[0][1].durationSeconds, 240);
  const stored = backend.journal.sessions[0];
  assert.deepEqual([stored.id, stored.status, stored.endedAt, stored.durationSec, stored.totalLootChaos, stored.profitChaos], [
    'session-shutdown-1', 'completed', '2026-05-06T12:04:00.000Z', 240, 0, 0
  ]);
});

test('main shutdown finalizer stores calculated persisted profit before closing', async () => {
  const calls = [];
  const backend = createJournalBackend();
  const context = loadFunctions([
    'normalizePoeVersion',
    'normalizeStoredFarmTypeId',
    'resolveFarmTypeLabel',
    'getSessionValueNumber',
    'getSessionNumberValue',
    'isUuid',
    'buildSessionShutdownMapResult',
    'withTimeout',
    'resolveShutdownSessionCompletion',
    'endCurrentSession',
    'finalizeActiveSessionOnShutdown'
  ], {
    currentSession: backend.start({ mapType: 'breach', startedAt: '2026-05-06T12:00:00.000Z' }, 'session-shutdown-2'),
    calculateSessionProfitFromPersistedSnapshots: async () => ({
      report: {
        summary: {
          totalGainedChaos: 40,
          totalLostChaos: 5,
          netProfitChaos: 35
        }
      }
    }),
    listFarmTypes: () => [{ id: 'breach', label: 'Breach' }],
    getActiveFarmTypeId: () => 'breach',
    saveMapResultHistory(result) {
      calls.push(['saveMapResultHistory', JSON.parse(JSON.stringify(result))]);
      return [result];
    },
    ...backend.context,
    appendAuditTrail() {},
    showNotification() {},
    t: (key) => key,
    updateOverlayWindow() {},
    mainWindow: null,
    Date: class extends Date {
      constructor(...args) {
        return args.length ? super(...args) : new global.Date('2026-05-06T12:04:00.000Z');
      }

      static now() {
        return new global.Date('2026-05-06T12:04:00.000Z').getTime();
      }

      static parse(value) {
        return global.Date.parse(value);
      }
    },
    setTimeout,
    clearTimeout
  });

  const result = await context.finalizeActiveSessionOnShutdown();

  assert.equal(result.status, 'completed');
  assert.equal(result.profitChaos, 35);
  assert.equal(calls[0][1].profitUnavailable, false);
  assert.equal(calls[0][1].inputValue, 5);
  assert.equal(calls[0][1].outputValue, 40);
  assert.equal(calls[0][1].netProfit, 35);
  const stored = backend.journal.sessions[0];
  assert.deepEqual([stored.id, stored.status, stored.endedAt, stored.durationSec, stored.totalLootChaos, stored.profitChaos], [
    'session-shutdown-2', 'completed', '2026-05-06T12:04:00.000Z', 240, 40, 35
  ]);
});

test('main keeps zero-loot PoE1 sessions open on map exit for stash diff completion', () => {
  const context = loadFunctions(['normalizePoeVersion', 'getSessionValueNumber', 'shouldAutoEndSessionOnMapExit']);

  assert.equal(
    context.shouldAutoEndSessionOnMapExit({
      poeVersion: 'poe1',
      totalLootChaos: 0,
      profitChaos: 0
    }),
    false
  );
  assert.equal(
    context.shouldAutoEndSessionOnMapExit({
      poeVersion: 'poe1',
      totalLootChaos: 12,
      profitChaos: 12
    }),
    true
  );
  assert.equal(
    context.shouldAutoEndSessionOnMapExit({
      poeVersion: 'poe2',
      totalLootChaos: 0,
      profitChaos: 0
    }),
    true
  );
});

test('map-enter handler publishes runtime state and leaves session start to the renderer prompt', async () => {
  const startCalls = [];
  const runtimeCalls = [];
  const context = loadFunctions(['handleMapEntered'], {
    currentSession: null,
    startNewSession(input) {
      startCalls.push({ ...input });
      throw new Error('main process should not auto-start sessions on map enter');
    },
    publishRuntimeSessionEvent(type, payload) {
      runtimeCalls.push([type, payload]);
    }
  });

  await context.handleMapEntered({
    mapName: 'Crimson Temple',
    mapTier: 16
  });

  assert.deepEqual(startCalls, []);
  assert.deepEqual(runtimeCalls, [['area_entered', { mapName: 'Crimson Temple', mapTier: 16 }]]);
});

test('legacy queue drain leaves the journal-backed current session alone', async () => {
  const backend = createJournalBackend();
  const active = backend.start({}, 'journal-session-1');
  let queuedCurrentSession = { id: 'local-legacy-1' };
  const context = loadFunctions(['isLocalSessionId', 'flushPendingSessionActions'], {
    currentSession: active,
    pendingSessionFlushInProgress: false,
    apiClient: {
      token: 'legacy-token',
      async startSession() {
        return { id: 'server-session-1' };
      },
      async endSession() {
        return { id: 'server-session-1', status: 'completed' };
      }
    },
    getCurrentUserId: () => 'user-1',
    getPendingSessionActions: () => [
      { type: 'sessionStart', localSessionId: 'local-legacy-1', payload: { mapName: 'Old Map' } },
      { type: 'sessionEnd', sessionId: 'local-legacy-1', endedAt: '2026-05-06T12:04:00.000Z' }
    ],
    setPendingSessionActions() {},
    getQueuedCurrentSession: () => queuedCurrentSession,
    setQueuedCurrentSession(session) {
      queuedCurrentSession = session;
    }
  });

  const result = await context.flushPendingSessionActions();

  assert.equal(result.processed, 2);
  assert.equal(queuedCurrentSession, null);
  assert.equal(context.currentSession, active);
});

test('journal store is per signed-in user and rejects unsafe ids', () => {
  const created = [];
  let userId = 'user-1';
  const context = loadFunctions(['getJournalStore'], {
    journalStore: null,
    getCurrentUserId: () => userId,
    path,
    app: { getPath: () => 'D:/UserData' },
    Store: class {
      constructor(options) {
        this.options = options;
        created.push(options);
      }
    }
  });

  const first = context.getJournalStore();
  assert.equal(context.getJournalStore(), first);
  userId = 'user-2';
  const second = context.getJournalStore();

  assert.notEqual(second, first);
  assert.deepEqual(JSON.parse(JSON.stringify(created)), [
    { name: 'journal', cwd: path.join('D:/UserData', 'profiles', 'user-1') },
    { name: 'journal', cwd: path.join('D:/UserData', 'profiles', 'user-2') }
  ]);
  for (const unsafeId of ['../user-1', 'user/1', '', null]) {
    userId = unsafeId;
    assert.throws(() => context.getJournalStore(), /Local desktop sign-in is required/);
  }
});
