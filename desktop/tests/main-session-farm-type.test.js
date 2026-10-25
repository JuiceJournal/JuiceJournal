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
  const timers = [];
  const context = loadFunctions([
    'normalizeStartMapPromptText',
    'normalizeStartMapPromptFarmTypeOptions',
    'showStartMapPromptOverlay',
    'hideStartMapPromptOverlay'
  ], {
    overlayStartMapPromptState: null,
    START_MAP_PROMPT_OVERLAY_GRACE_MS: 3000,
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
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
    now: Date.parse('2026-05-06T12:00:00.000Z'),
    expiresInMs: 7000
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
    createdAt: Date.parse('2026-05-06T12:00:00.000Z'),
    // The overlay counts down to the moment the renderer closes the prompt.
    expiresAt: Date.parse('2026-05-06T12:00:07.000Z')
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
      createdAt: Date.parse('2026-05-06T12:00:00.000Z'),
      expiresAt: Date.parse('2026-05-06T12:00:07.000Z')
    },
    null
  ]);

  // Main's safety close fires 3 s after the prompt should have closed, and only for the prompt it was set for.
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 10000);
  timers[0].callback();
  assert.equal(overlayUpdates.length, 2, 'the prompt was already hidden, so nothing changes');

  context.showStartMapPromptOverlay({ mapName: 'Dunes' }, { now: Date.parse('2026-05-06T12:01:00.000Z'), expiresInMs: 7000 });
  timers[1].callback();
  assert.equal(context.overlayStartMapPromptState, null, 'a prompt the renderer never closed is hidden by main');
  assert.equal(overlayUpdates.at(-1), null);
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

// Date fixed at `iso` for code that asks for the current time.
function createFixedDate(iso) {
  return class extends Date {
    constructor(...args) {
      return args.length ? super(...args) : new global.Date(iso);
    }

    static now() {
      return new global.Date(iso).getTime();
    }

    static parse(value) {
      return global.Date.parse(value);
    }
  };
}

test('main shutdown finalizer keeps the loot recorded in a PoE1 session without stash profit', async () => {
  const calls = [];
  const backend = createJournalBackend();
  const session = backend.start({ mapType: 'breach', startedAt: '2026-05-06T12:00:00.000Z' }, 'session-shutdown-3');
  backend.journal = localJournal.addLoot(backend.journal, session.id, [
    { itemName: 'Divine Orb', quantity: 1, chaosValue: 42, source: 'ocr' }
  ], { createId: () => 'loot-1', now: new Date('2026-05-06T12:02:00.000Z') }).journal;
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
    currentSession: session,
    calculateSessionProfitFromPersistedSnapshots: async () => null,
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
    Date: createFixedDate('2026-05-06T12:04:00.000Z'),
    setTimeout,
    clearTimeout
  });

  const result = await context.finalizeActiveSessionOnShutdown();

  assert.equal(result.profitChaos, 42);
  const stored = backend.journal.sessions[0];
  assert.deepEqual([stored.status, stored.totalLootChaos, stored.profitChaos], ['completed', 42, 42]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].outputValue, 42);
  assert.equal(calls[0][1].netProfit, 42);
  assert.equal(calls[0][1].profitUnavailable, false);
  // Same id the renderer gives the session's result, so the two records of this session collapse into one.
  assert.equal(calls[0][1].id, `map-result-session-shutdown-3-${Date.parse('2026-05-06T12:04:00.000Z')}`);
});

// A price service whose queued sync loads `prices` (or nothing, or never finishes) for the OCR scan tests.
function createFakePriceService({ prices = { 'Exalted Orb': 12 }, hang = false } = {}) {
  return {
    poeVersion: 'poe1',
    league: null,
    prices: new Map(),
    syncCalls: [],
    async ensureSynced(league, poeVersion, options) {
      this.syncCalls.push([poeVersion, league, options?.full]);
      if (hang) {
        await new Promise(() => {});
      }
      this.poeVersion = poeVersion;
      this.league = league;
      this.prices = new Map(Object.entries(prices).map(([name, chaosValue]) => [name, { chaosValue }]));
      return { itemCount: this.prices.size };
    },
    getStatus() {
      return { itemCount: this.prices.size, poeVersion: this.poeVersion };
    },
    getPriceInfo(itemName) {
      return this.prices.get(itemName) || null;
    }
  };
}

function loadOcrScan(backend, session, priceService, overrides = {}) {
  let lootId = 0;
  return loadFunctions([
    'normalizePositiveRate',
    'readLocalChaosPrice',
    'withTimeout',
    'notifyPricesUpdated',
    'loadSessionPrices',
    'addLootToCurrentSession',
    'captureAndScan'
  ], {
    ...backend.context,
    currentSession: session,
    sessionPrices: null,
    priceService,
    SESSION_PRICES_WAIT_MS: 20,
    SESSION_PRICES_RETRY_MS: 60_000,
    crypto: { randomUUID: () => `loot-${++lootId}` },
    screen: { getPrimaryDisplay: () => ({ size: { width: 1920, height: 1080 } }) },
    require: () => ({
      desktopCapturer: { getSources: async () => [{ thumbnail: { toPNG: () => 'png' } }] }
    }),
    prepareOCRImage: (image) => image,
    ocrScanner: { scanImage: async () => [{ itemName: 'Exalted Orb', quantity: 2, itemType: 'currency' }] },
    showNotification() {},
    t: (key) => key,
    mainWindow: null,
    console: { log() {}, warn() {} },
    setTimeout,
    clearTimeout,
    ...overrides
  });
}

test('main prices OCR loot from poe.ninja for the session game and league', async () => {
  const backend = createJournalBackend();
  const session = backend.start({
    poeVersion: 'poe2',
    league: 'Fate of the Vaal',
    startedAt: '2026-05-06T12:00:00.000Z'
  }, 'session-poe2');
  const priceService = createFakePriceService();
  const syncCalls = priceService.syncCalls;
  const context = loadOcrScan(backend, session, priceService);

  await context.captureAndScan();
  await context.captureAndScan();

  // One full price load for the session's game and league, reused by the second scan.
  assert.deepEqual(syncCalls, [['poe2', 'Fate of the Vaal', true]]);
  const stored = backend.journal.sessions[0];
  assert.deepEqual(stored.lootEntries.map((loot) => [loot.itemName, loot.chaosValue, loot.source]), [
    ['Exalted Orb', 12, 'ocr'],
    ['Exalted Orb', 12, 'ocr']
  ]);
  assert.equal(stored.totalLootChaos, 48);
});

test('main OCR scan records loot unpriced when poe.ninja does not answer in time', async () => {
  const backend = createJournalBackend();
  const session = backend.start({ startedAt: '2026-05-06T12:00:00.000Z' }, 'session-slow');
  const context = loadOcrScan(backend, session, createFakePriceService({ hang: true }));

  await context.captureAndScan();

  assert.deepEqual(backend.journal.sessions[0].lootEntries.map((loot) => [loot.itemName, loot.chaosValue]), [
    ['Exalted Orb', 0]
  ]);
});

test('main OCR scan waits before asking poe.ninja again after a load found no prices', async () => {
  const backend = createJournalBackend();
  const session = backend.start({ startedAt: '2026-05-06T12:00:00.000Z' }, 'session-offline');
  const priceService = createFakePriceService({ prices: {} });
  const context = loadOcrScan(backend, session, priceService);

  await context.captureAndScan();
  await context.captureAndScan();

  assert.equal(priceService.syncCalls.length, 1);
  assert.equal(backend.journal.sessions[0].lootEntries.length, 2);
});

test('main OCR scan reloads prices that a game switch cleared', async () => {
  const backend = createJournalBackend();
  const session = backend.start({ startedAt: '2026-05-06T12:00:00.000Z' }, 'session-switch');
  const priceService = createFakePriceService();
  const context = loadOcrScan(backend, session, priceService);

  await context.captureAndScan();
  priceService.prices = new Map();
  await context.captureAndScan();

  assert.equal(priceService.syncCalls.length, 2);
  assert.deepEqual(backend.journal.sessions[0].lootEntries.map((loot) => loot.chaosValue), [12, 12]);
});

test('main OCR scan reloads the session league after the Currency page synced another one', async () => {
  const backend = createJournalBackend();
  const session = backend.start({ league: 'Mirage', startedAt: '2026-05-06T12:00:00.000Z' }, 'session-league');
  const priceService = createFakePriceService();
  const context = loadOcrScan(backend, session, priceService);

  await context.captureAndScan();
  priceService.league = 'Standard';
  await context.captureAndScan();

  assert.deepEqual(priceService.syncCalls.map(([, league]) => league), ['Mirage', 'Mirage']);
});

// A price service holding Mirage prices while a sync it queued earlier (a session's full sync) is still running.
function loadCurrencyPricesWithRunningSync() {
  const pending = [];
  const priceService = {
    poeVersion: 'poe1',
    league: 'Mirage',
    syncCalls: [],
    ensureSynced(league, poeVersion) {
      this.syncCalls.push([poeVersion, league]);
      return new Promise((resolve) => pending.push(() => {
        this.league = league;
        resolve(this.getStatus());
      }));
    },
    getStatus() {
      return { itemCount: 1, lastSync: Date.parse('2026-10-24T10:00:00.000Z') };
    },
    listPrices(params) {
      return [{ itemName: 'Divine Orb', league: this.league, type: params.type }];
    }
  };
  const context = loadFunctions(['getCurrencyPrices'], {
    priceService,
    resolveLeagueContext: (options) => ({ activeVersion: options.poeVersion, league: options.league })
  });
  return { context, priceService, finishSync: () => pending.forEach((finish) => finish()) };
}

test('main lists the loaded league prices for the Currency page without waiting for a running sync', async () => {
  const { context, priceService } = loadCurrencyPricesWithRunningSync();

  const result = await Promise.race([
    context.getCurrencyPrices({ poeVersion: 'poe1', league: 'Mirage', type: 'currency' }),
    new Promise((resolve) => setTimeout(() => resolve('waited for the sync'), 50))
  ]);

  assert.deepEqual(priceService.syncCalls, []);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    prices: [{ itemName: 'Divine Orb', league: 'Mirage', type: 'currency' }],
    count: 1,
    league: 'Mirage',
    poeVersion: 'poe1',
    updatedAt: '2026-10-24T10:00:00.000Z'
  });
});

test('main Currency page waits for the price sync when another league is asked for', async () => {
  const { context, priceService, finishSync } = loadCurrencyPricesWithRunningSync();

  const request = context.getCurrencyPrices({ poeVersion: 'poe1', league: 'Standard' });
  assert.deepEqual(priceService.syncCalls, [['poe1', 'Standard']]);
  finishSync();
  const result = await request;

  assert.equal(result.league, 'Standard');
  assert.equal(result.prices[0].league, 'Standard');
});

test('main OCR scan does not add loot to a session that ended while it read the screen', async () => {
  const backend = createJournalBackend();
  const session = backend.start({ startedAt: '2026-05-06T12:00:00.000Z' }, 'session-ended-mid-scan');
  const notifications = [];
  const context = loadOcrScan(backend, session, createFakePriceService(), {
    ocrScanner: {
      async scanImage() {
        context.currentSession = null;
        return [{ itemName: 'Exalted Orb', quantity: 2, itemType: 'currency' }];
      }
    },
    showNotification: (title, body) => notifications.push([title, body])
  });

  await context.captureAndScan();

  assert.deepEqual(backend.journal.sessions[0].lootEntries, []);
  assert.deepEqual(notifications, [['notificationError', 'noActiveSession']]);
});

test('main tells the main window when the session prices have loaded', async () => {
  const backend = createJournalBackend();
  const session = backend.start({
    poeVersion: 'poe2',
    league: 'Fate of the Vaal',
    startedAt: '2026-05-06T12:00:00.000Z'
  }, 'session-prices-updated');
  const sent = [];
  const context = loadOcrScan(backend, session, createFakePriceService(), {
    mainWindow: { webContents: { send: (channel, data) => sent.push([channel, data]) } }
  });

  await context.captureAndScan();
  await context.captureAndScan();

  // Once for the load, before the loot it priced; the second scan reuses the loaded prices.
  assert.deepEqual(sent.map(([channel]) => channel), ['prices-updated', 'loot-added', 'loot-added']);
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0][1])), {
    poeVersion: 'poe2',
    league: 'Fate of the Vaal',
    itemCount: 1
  });
});

test('main does not announce a session price load that found no prices', async () => {
  const backend = createJournalBackend();
  const session = backend.start({ startedAt: '2026-05-06T12:00:00.000Z' }, 'session-no-prices');
  const sent = [];
  const context = loadOcrScan(backend, session, createFakePriceService({ prices: {} }), {
    mainWindow: { webContents: { send: (channel) => sent.push(channel) } }
  });

  await context.captureAndScan();

  assert.deepEqual(sent, ['loot-added']);
});

test('main shutdown finalizer closes a session without loot at zero when stash profit is unavailable', async () => {
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
  assert.equal(calls[0][1].profitUnavailable, false);
  assert.equal(calls[0][1].netProfit, 0);
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

test('main ends zero-loot PoE1 sessions on map exit when the sign-in cannot read stashes', () => {
  const context = loadFunctions(['normalizePoeVersion', 'getSessionValueNumber', 'shouldAutoEndSessionOnMapExit'], {
    poeApiClient: { hasScope: () => false }
  });

  assert.equal(
    context.shouldAutoEndSessionOnMapExit({
      poeVersion: 'poe1',
      totalLootChaos: 0,
      profitChaos: 0
    }),
    true
  );
});

test('main keeps zero-loot PoE1 sessions open on map exit for stash diff completion', () => {
  const context = loadFunctions(['normalizePoeVersion', 'getSessionValueNumber', 'shouldAutoEndSessionOnMapExit'], {
    poeApiClient: { hasScope: (scope) => scope === 'account:stashes' }
  });

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

test('the sync queue an older version left on disk is removed at startup', () => {
  const store = createMemoryStore({
    pendingSessionActions: [{ type: 'sessionStart', localSessionId: 'local-legacy-1', payload: { mapName: 'Old Map' } }],
    pendingLootActions: [{ type: 'bulkLoot', sessionId: 'local-legacy-1', items: [{ itemName: 'Divine Orb' }] }],
    // The old default, which a truthiness check would leave behind.
    queuedCurrentSession: null,
    language: 'en'
  });
  const deletes = [];
  const deleteKey = store.delete;
  store.delete = (key) => {
    deletes.push(key);
    deleteKey(key);
  };
  const context = loadFunctions(['removeLegacySyncQueue'], { store });

  context.removeLegacySyncQueue();
  context.removeLegacySyncQueue();

  assert.deepEqual(store.data, { language: 'en' });
  // Once the queue is gone, later launches do not write the config again.
  assert.deepEqual(deletes, ['pendingSessionActions', 'pendingLootActions', 'queuedCurrentSession']);
  const source = fs.readFileSync(mainJsPath, 'utf8');
  assert.match(source, /^removeLegacySyncQueue\(\);$/m);
  assert.doesNotMatch(source, /pendingSessionActions: \[\]|pendingLootActions: \[\]|queuedCurrentSession: null/);
  assert.doesNotMatch(source, /flushPendingActions|retry-pending-loot-actions|get-sync-status|pending-sync-updated/);
});

test('journal store is per local profile and rejects unsafe ids', () => {
  const created = [];
  let profileId = 'profile-1';
  const context = loadFunctions(['getJournalStore'], {
    journalStore: null,
    getActiveProfile: () => (profileId === null ? null : { id: profileId }),
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
  profileId = 'profile-2';
  const second = context.getJournalStore();

  assert.notEqual(second, first);
  assert.deepEqual(JSON.parse(JSON.stringify(created)), [
    { name: 'journal', cwd: path.join('D:/UserData', 'profiles', 'profile-1') },
    { name: 'journal', cwd: path.join('D:/UserData', 'profiles', 'profile-2') }
  ]);
  for (const unsafeId of ['../profile-1', 'profile/1', '', null]) {
    profileId = unsafeId;
    assert.throws(() => context.getJournalStore(), /Local desktop sign-in is required/);
  }
});

function createMemoryStore(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get: (key) => data[key],
    set(key, value) {
      data[key] = value;
    },
    delete(key) {
      delete data[key];
    }
  };
}

function loadSignIn({ store, accounts, fsOverrides = {}, legacy = false, readJournal = () => ({ sessions: [] }) }) {
  const calls = [];
  const warnings = [];
  let nextId = 0;
  const context = loadFunctions([
    'getCurrentUserId',
    'getActiveProfile',
    'findOrCreateLocalProfile',
    'migrateLegacyUserData',
    'assertDesktopUserAuthenticated',
    'dropPoeDeviceConnection',
    'loadActiveSession',
    'signInWithPoe',
    'reconnectPoeDevice'
  ], {
    console: {
      log() {},
      warn: (...args) => warnings.push(args)
    },
    store,
    path,
    crypto: { randomUUID: () => `profile-${++nextId}` },
    app: { getPath: () => 'D:/UserData' },
    fs: {
      existsSync: () => false,
      renameSync() {},
      ...fsOverrides
    },
    connectPoeDevice: async () => accounts.shift(),
    poeApiClient: {
      clearTokens: () => calls.push('clearTokens')
    },
    persistPoeClientTokens: (tokens) => calls.push(['persistPoeClientTokens', tokens]),
    localJournal,
    readJournal,
    currentSession: null,
    appendAuditTrail: (key) => calls.push(key),
    t: (key) => key
  });
  if (legacy) {
    store.set('currentUserId', 'backend-user-1');
  }
  return { context, calls, warnings };
}

test('signing in again with the same GGG account opens the same local profile', async () => {
  const store = createMemoryStore({ localProfiles: {}, activeProfileId: null });
  const { context, calls } = loadSignIn({
    store,
    accounts: [
      { sub: 'ggg-account-1', username: 'Exile#1234' },
      { sub: 'ggg-account-1', username: 'Exile#5678' },
      { sub: 'ggg-account-2', username: 'Alt#0001' }
    ]
  });

  assert.throws(() => context.assertDesktopUserAuthenticated(), /Local desktop sign-in is required/);

  const first = await context.signInWithPoe();
  store.set('activeProfileId', null);
  const again = await context.signInWithPoe();
  const other = await context.signInWithPoe();

  assert.equal(first.id, 'profile-1');
  assert.equal(again.id, 'profile-1');
  assert.equal(again.accountName, 'Exile#5678');
  assert.equal(again.createdAt, first.createdAt);
  assert.equal(other.id, 'profile-2');
  assert.equal(context.getActiveProfile().id, 'profile-2');
  assert.deepEqual(Object.keys(store.data.localProfiles), ['profile-1', 'profile-2']);
  assert.deepEqual(calls.filter((call) => call === 'auditLogin').length, 3);
  context.assertDesktopUserAuthenticated();
});

test('a sign-in without a GGG account id drops the device token and opens no profile', async () => {
  const store = createMemoryStore({ localProfiles: {}, activeProfileId: null });
  const { context, calls } = loadSignIn({ store, accounts: [{ sub: null, username: 'Exile#1234' }] });

  await assert.rejects(() => context.signInWithPoe(), /poeNoAccountId/);

  assert.equal(context.getActiveProfile(), null);
  assert.deepEqual(store.data.localProfiles, {});
  assert.deepEqual(calls, ['clearTokens', ['persistPoeClientTokens', null]]);
});

test('a sign-in with an unreadable journal still opens the profile, without a session', async () => {
  const store = createMemoryStore({ localProfiles: {}, activeProfileId: null });
  const { context, calls, warnings } = loadSignIn({
    store,
    accounts: [{ sub: 'ggg-account-1', username: 'Exile#1234' }],
    // conf throws on every read of a journal.json that holds invalid JSON.
    readJournal() {
      throw new SyntaxError('Unexpected end of JSON input');
    }
  });

  const profile = await context.signInWithPoe();

  assert.equal(profile.id, 'profile-1');
  assert.equal(context.getActiveProfile().id, 'profile-1');
  assert.equal(context.currentSession, null);
  assert.deepEqual(calls, ['auditLogin']);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].some((value) => value instanceof SyntaxError));
});

test('reconnecting with another GGG account drops the token and keeps the profile', async () => {
  const store = createMemoryStore({ localProfiles: {}, activeProfileId: null });
  const { context, calls } = loadSignIn({
    store,
    accounts: [
      { sub: 'ggg-account-1', username: 'Exile#1234' },
      { sub: 'ggg-account-1', username: 'Exile#1234' },
      { sub: 'ggg-account-2', username: 'Alt#0001' }
    ]
  });
  const profile = await context.signInWithPoe();
  calls.length = 0;

  await context.reconnectPoeDevice();
  await assert.rejects(() => context.reconnectPoeDevice(), /poeDifferentAccount/);

  assert.equal(context.getActiveProfile().id, profile.id);
  assert.deepEqual(calls, ['clearTokens', ['persistPoeClientTokens', null]]);
});

test('a failed legacy move keeps the profile inactive and is retried at the next sign-in', async () => {
  const store = createMemoryStore({ localProfiles: {}, activeProfileId: null, 'mapResults:backend-user-1': [{ id: 'map-1' }] });
  const legacyDir = path.join('D:/UserData', 'profiles', 'backend-user-1');
  const existing = new Set([legacyDir]);
  let renameAttempts = 0;
  const { context } = loadSignIn({
    store,
    legacy: true,
    accounts: [
      { sub: 'ggg-account-1', username: 'Exile#1234' },
      { sub: 'ggg-account-1', username: 'Exile#1234' }
    ],
    fsOverrides: {
      existsSync: (target) => existing.has(target),
      renameSync(from, to) {
        renameAttempts += 1;
        if (renameAttempts === 1) {
          throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
        }
        existing.delete(from);
        existing.add(to);
      }
    }
  });

  await assert.rejects(() => context.signInWithPoe(), /EBUSY/);
  assert.equal(context.getActiveProfile(), null);
  assert.equal(store.data.legacyUserMigratedTo, undefined);
  assert.deepEqual(store.data['mapResults:backend-user-1'], [{ id: 'map-1' }]);

  const profile = await context.signInWithPoe();

  assert.equal(profile.id, 'profile-1');
  assert.equal(context.getActiveProfile().id, 'profile-1');
  assert.equal(existing.has(path.join('D:/UserData', 'profiles', 'profile-1')), true);
  assert.deepEqual(store.data['mapResults:profile-1'], [{ id: 'map-1' }]);
  assert.equal(store.data.legacyUserMigratedTo, 'profile-1');
});

test('the first local profile takes over the legacy user data once', () => {
  const store = createMemoryStore({
    currentUserId: 'backend-user-1',
    'mapResults:backend-user-1': [{ id: 'map-1' }]
  });
  const renames = [];
  const existing = new Set([path.join('D:/UserData', 'profiles', 'backend-user-1')]);
  const context = loadFunctions(['getCurrentUserId', 'migrateLegacyUserData'], {
    store,
    path,
    app: { getPath: () => 'D:/UserData' },
    fs: {
      existsSync: (target) => existing.has(target),
      renameSync(from, to) {
        renames.push([from, to]);
        existing.delete(from);
        existing.add(to);
      }
    }
  });

  context.migrateLegacyUserData({ id: 'profile-1' });
  context.migrateLegacyUserData({ id: 'profile-2' });

  assert.deepEqual(store.data['mapResults:profile-1'], [{ id: 'map-1' }]);
  assert.equal('mapResults:backend-user-1' in store.data, false);
  assert.equal('mapResults:profile-2' in store.data, false);
  assert.deepEqual(renames, [[
    path.join('D:/UserData', 'profiles', 'backend-user-1'),
    path.join('D:/UserData', 'profiles', 'profile-1')
  ]]);
  assert.equal(store.data.legacyUserMigratedTo, 'profile-1');
});

test('the character cache is saved for the signed-in profile only', () => {
  const store = createMemoryStore({
    localProfiles: { 'profile-1': { id: 'profile-1' }, 'profile-2': { id: 'profile-2' } },
    activeProfileId: 'profile-1'
  });
  const context = loadFunctions(['getActiveProfile', 'getAccountStateStoreKey', 'applyDesktopSettings'], {
    store,
    SETTINGS_ALLOWLIST: new Set(['language', 'lastKnownAccountState'])
  });

  context.applyDesktopSettings({ lastKnownAccountState: { accountName: 'Exile#1234' }, language: 'tr' });
  store.set('activeProfileId', 'profile-2');
  context.applyDesktopSettings({ lastKnownAccountState: { accountName: 'Alt#0001' } });
  store.set('activeProfileId', null);
  context.applyDesktopSettings({ lastKnownAccountState: { accountName: 'Nobody#0000' } });

  assert.deepEqual(store.data['lastKnownAccountState:profile-1'], { accountName: 'Exile#1234' });
  assert.deepEqual(store.data['lastKnownAccountState:profile-2'], { accountName: 'Alt#0001' });
  assert.equal('lastKnownAccountState' in store.data, false);
  assert.equal(store.data.language, 'tr');
});

test('the renderer settings carry only the signed-in profile character cache', () => {
  const store = createMemoryStore({
    localProfiles: { 'profile-1': { id: 'profile-1' }, 'profile-2': { id: 'profile-2' } },
    activeProfileId: 'profile-2',
    language: 'en',
    'lastKnownAccountState:profile-1': { accountName: 'Exile#1234' },
    'lastKnownAccountState:profile-2': { accountName: 'Alt#0001' }
  });
  store.store = store.data;
  const context = loadFunctions(['getActiveProfile', 'getAccountStateStoreKey', 'getRendererSettings'], {
    store,
    DEFAULT_SCAN_HOTKEY: 'F9',
    DEFAULT_STASH_SCAN_HOTKEY: 'CommandOrControl+Shift+L'
  });

  const signedIn = context.getRendererSettings();
  store.set('activeProfileId', null);
  const signedOut = context.getRendererSettings();

  assert.deepEqual(signedIn.lastKnownAccountState, { accountName: 'Alt#0001' });
  assert.equal(signedOut.lastKnownAccountState, null);
  for (const settings of [signedIn, signedOut]) {
    assert.deepEqual(Object.keys(settings).filter((key) => key.startsWith('lastKnownAccountState:')), []);
    assert.equal('localProfiles' in settings, false);
    assert.equal(settings.language, 'en');
  }
});

test('the renderer settings carry no local profile map results', () => {
  const store = createMemoryStore({
    localProfiles: { 'profile-1': { id: 'profile-1' }, 'profile-2': { id: 'profile-2' } },
    activeProfileId: 'profile-2',
    language: 'en',
    'mapResults:profile-1': [{ id: 'map-1' }],
    'mapResults:profile-2': [{ id: 'map-2' }],
    'mapResults:backend-user-1': [{ id: 'map-legacy' }]
  });
  store.store = store.data;
  const context = loadFunctions(['getActiveProfile', 'getAccountStateStoreKey', 'getRendererSettings'], {
    store,
    DEFAULT_SCAN_HOTKEY: 'F9',
    DEFAULT_STASH_SCAN_HOTKEY: 'CommandOrControl+Shift+L'
  });

  const settings = context.getRendererSettings();

  assert.deepEqual(Object.keys(settings).filter((key) => key.startsWith('mapResults:')), []);
  assert.equal(settings.language, 'en');
  assert.deepEqual(store.data['mapResults:profile-1'], [{ id: 'map-1' }]);
});

test('the shared character cache moves once to the profile of its account', () => {
  const profiles = {
    'profile-1': { id: 'profile-1', accountName: 'Exile#1234' },
    'profile-2': { id: 'profile-2', accountName: 'Alt#0001' }
  };
  const load = (store) => loadFunctions(['getActiveProfile', 'getAccountStateStoreKey', 'migrateSharedAccountStateCache'], { store });

  const owned = createMemoryStore({ localProfiles: profiles, activeProfileId: 'profile-2', lastKnownAccountState: { accountName: 'Exile#1234' } });
  load(owned).migrateSharedAccountStateCache();
  assert.deepEqual(owned.data['lastKnownAccountState:profile-1'], { accountName: 'Exile#1234' });
  assert.equal('lastKnownAccountState:profile-2' in owned.data, false);
  assert.equal('lastKnownAccountState' in owned.data, false);

  const kept = createMemoryStore({
    localProfiles: profiles,
    lastKnownAccountState: { accountName: 'Exile#1234', cachedAt: 'old' },
    'lastKnownAccountState:profile-1': { accountName: 'Exile#1234', cachedAt: 'new' }
  });
  load(kept).migrateSharedAccountStateCache();
  assert.equal(kept.data['lastKnownAccountState:profile-1'].cachedAt, 'new');
  assert.equal('lastKnownAccountState' in kept.data, false);

  const orphan = createMemoryStore({ localProfiles: profiles, activeProfileId: 'profile-1', lastKnownAccountState: { accountName: 'Gone#9999' } });
  load(orphan).migrateSharedAccountStateCache();
  assert.deepEqual(Object.keys(orphan.data).filter((key) => key.startsWith('lastKnownAccountState')), []);
});
