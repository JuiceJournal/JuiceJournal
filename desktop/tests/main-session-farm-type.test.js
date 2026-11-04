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
    // Ending a map asks the inventory watcher whether it can count the map's loot; most tests have none.
    ...(functionNames.includes('endCurrentSession') ? { inventoryWatcher: null } : {}),
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

  assert.deepEqual(notificationCalls, [['sessionStartFailed', 'notificationTryAgain']]);
});

// What readJournal throws for a journal.json it cannot read.
function journalUnreadableError() {
  return Object.assign(new Error('JOURNAL_UNREADABLE'), { code: 'JOURNAL_UNREADABLE' });
}

function loadJournalUnreadableSession(functionNames, overrides = {}) {
  const notifications = [];
  const context = loadFunctions(functionNames, {
    localJournal,
    readJournal() {
      throw journalUnreadableError();
    },
    currentSession: null,
    resolveLeagueContext: () => ({ activeVersion: 'poe1', league: 'Mirage' }),
    getActiveFarmTypeId: () => null,
    showNotification: (title, body) => notifications.push([title, body]),
    t: (key) => key,
    mainWindow: null,
    ...overrides
  });
  return { context, notifications };
}

test('main map start and end name an unreadable journal in the notification and the error', async () => {
  const started = loadJournalUnreadableSession(['normalizeStoredFarmTypeId', 'startNewSession']);
  await assert.rejects(() => started.context.startNewSession({ mapName: 'Dunes Map' }), {
    message: 'JOURNAL_UNREADABLE',
    code: 'JOURNAL_UNREADABLE'
  });
  assert.deepEqual(started.notifications, [['sessionStartFailed', 'journalUnreadableBody']]);

  const ended = loadJournalUnreadableSession(['normalizeErrorMessage', 'toRendererError', 'endCurrentSession'], {
    currentSession: { id: 'session-1', status: 'active' }
  });
  await assert.rejects(() => ended.context.endCurrentSession(), { message: 'JOURNAL_UNREADABLE' });
  assert.deepEqual(ended.notifications, [['sessionEndFailed', 'journalUnreadableBody']]);

  // IPC replies keep only the message, which the renderer maps to its own copy.
  assert.equal(
    ended.context.toRendererError(journalUnreadableError(), 'Failed to load session details').message,
    'JOURNAL_UNREADABLE'
  );
});

test('main map start names an unreadable journal when ending the running map fails first', async () => {
  const { context, notifications } = loadJournalUnreadableSession([
    'normalizeErrorMessage',
    'toRendererError',
    'endCurrentSession',
    'normalizeStoredFarmTypeId',
    'startNewSession'
  ], {
    currentSession: { id: 'session-1', status: 'active' }
  });

  // endCurrentSession's toRendererError drops the code, so the message is what names the cause.
  await assert.rejects(() => context.startNewSession({ mapName: 'Dunes Map' }), (error) => {
    assert.equal(error.message, 'JOURNAL_UNREADABLE');
    assert.equal(error.code, undefined);
    return true;
  });
  assert.deepEqual(notifications, [
    ['sessionEndFailed', 'journalUnreadableBody'],
    ['sessionStartFailed', 'journalUnreadableBody']
  ]);
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

test('main map end notification names the map and reads the profit or loss with the duration', async () => {
  const endMap = async (options) => {
    const backend = createJournalBackend();
    const active = backend.start({ mapName: 'Channel', startedAt: '2026-05-06T12:00:00.000Z' }, 'session-1');
    const notifications = [];
    const context = loadFunctions(['endCurrentSession'], {
      ...backend.context,
      currentSession: active,
      appendAuditTrail() {},
      showNotification: (title, body) => notifications.push([title, body]),
      t: (key, values = {}) => [key, ...Object.values(values)].join('|'),
      updateOverlayWindow() {},
      mainWindow: null
    });
    await context.endCurrentSession(options);
    return notifications;
  };

  // No loot and no stash result: there is no profit to report, rather than a profit of 0.
  assert.deepEqual(await endMap({ endedAt: '2026-05-06T12:05:30.000Z' }), [['Channel', 'mapNoLootBody · mapDuration|5|30']]);
  // A stash result of exactly 0 is a real result.
  assert.deepEqual(
    await endMap({ endedAt: '2026-05-06T12:05:30.000Z', totalLootChaos: 0, profitChaos: 0 }),
    [['Channel', 'mapProfitBody|0 · mapDuration|5|30']]
  );
  // Under a minute reads in seconds alone.
  assert.deepEqual(await endMap({ endedAt: '2026-05-06T12:00:01.000Z' }), [['Channel', 'mapNoLootBody · mapDurationSeconds|1']]);
  assert.deepEqual(await endMap({ endedAt: '2026-05-06T12:01:00.000Z' }), [['Channel', 'mapNoLootBody · mapDuration|1|0']]);
  assert.deepEqual(
    await endMap({ endedAt: '2026-05-06T12:04:12.000Z', totalLootChaos: 412.4, profitChaos: 411.6 }),
    [['Channel', 'mapProfitBody|+412 · mapDuration|4|12']]
  );
  // The loss label carries the sign, so the number is not signed twice.
  assert.deepEqual(
    await endMap({ endedAt: '2026-05-06T12:05:30.000Z', totalLootChaos: 0, profitChaos: -85 }),
    [['Channel', 'mapLossBody|85 · mapDuration|5|30']]
  );
  // An end time before the start leaves no duration, so the notice leaves it out.
  assert.deepEqual(await endMap({ endedAt: '2026-05-06T11:59:00.000Z' }), [['Channel', 'mapNoLootBody']]);
});

test('main tells the window only when a map ended with nothing counted or read from the stash', async () => {
  const endMap = async (options, lootEntries = []) => {
    const backend = createJournalBackend();
    const active = backend.start({ mapName: 'Channel', startedAt: '2026-05-06T12:00:00.000Z' }, 'session-1');
    backend.journal.sessions[0].lootEntries = lootEntries;
    const sent = [];
    const context = loadFunctions(['endCurrentSession'], {
      ...backend.context,
      currentSession: active,
      appendAuditTrail() {},
      showNotification() {},
      t: (key) => key,
      updateOverlayWindow() {},
      mainWindow: { webContents: { send: (channel, session) => sent.push(session) } }
    });
    await context.endCurrentSession({ endedAt: '2026-05-06T12:05:30.000Z', ...options });
    return sent[0].noLoot;
  };

  assert.equal(await endMap(), true);
  assert.equal(await endMap({ totalLootChaos: 0, profitChaos: 0 }), undefined);
  assert.equal(await endMap({}, [{ itemName: 'Unpriced Item', quantity: 1, chaosValue: 0 }]), undefined);
});

// endCurrentSession over a watcher stub; answers the session it sent to the window and the sessions the watcher saw.
async function endMapWithWatcher({ canSettle, lootEntries = [], options = {}, watcher, automaticReading = true } = {}) {
  const backend = createJournalBackend();
  const active = backend.start({ mapName: 'Channel', startedAt: '2026-05-06T12:00:00.000Z' }, 'session-1');
  backend.journal.sessions[0].lootEntries = lootEntries;
  const sent = [];
  const seen = [];
  const context = loadFunctions(['endCurrentSession'], {
    ...backend.context,
    currentSession: active,
    inventoryWatcher: watcher === undefined ? {
      sessionEnded(session) {
        seen.push(session.id);
        return canSettle;
      }
    } : watcher,
    store: { get: (key) => (key === 'inventoryReadEnabled' ? automaticReading : undefined) },
    appendAuditTrail() {},
    showNotification() {},
    t: (key) => key,
    updateOverlayWindow() {},
    mainWindow: { webContents: { send: (channel, session) => sent.push(session) } }
  });
  await context.endCurrentSession({ endedAt: '2026-05-06T12:05:30.000Z', ...options });
  return { session: sent[0], seen };
}

test('main marks a no-loot map as waiting for its loot only when the inventory watcher can settle it', async () => {
  const settled = await endMapWithWatcher({ canSettle: true });
  assert.equal(settled.session.noLoot, true);
  assert.equal(settled.session.lootPending, true);
  assert.deepEqual(settled.seen, ['session-1']);

  // The watcher cannot read this game or has no baseline: the map stays a plain no-loot result.
  assert.equal((await endMapWithWatcher({ canSettle: false })).session.lootPending, false);
  // No watcher at all.
  assert.equal((await endMapWithWatcher({ watcher: null })).session.lootPending, false);
  // A map that already has loot or a stash result is not waiting for anything.
  const withLoot = await endMapWithWatcher({ canSettle: true, lootEntries: [{ itemName: 'Divine Orb', quantity: 1, chaosValue: 150 }] });
  assert.equal(withLoot.session.lootPending, false);
  const withStash = await endMapWithWatcher({ canSettle: true, options: { totalLootChaos: 0, profitChaos: 0 } });
  assert.equal(withStash.session.lootPending, false);
  // With automatic reading off, opening the inventory counts nothing, so the card must not say it does.
  assert.equal((await endMapWithWatcher({ canSettle: true, automaticReading: false })).session.lootPending, false);
});

test('main does not wait for inventory loot while the app is shutting down', async () => {
  const shutdown = await endMapWithWatcher({ canSettle: true, options: { shuttingDown: true } });

  assert.equal(shutdown.session.noLoot, true);
  assert.equal(shutdown.session.lootPending, false);
  assert.deepEqual(shutdown.seen, []);
});

test('main map end notification keeps a profit of 0 when the map has counted loot without a price', async () => {
  const backend = createJournalBackend();
  const active = backend.start({ mapName: 'Channel', startedAt: '2026-05-06T12:00:00.000Z' }, 'session-1');
  backend.journal.sessions[0].lootEntries = [{ itemName: 'Unpriced Item', quantity: 1, chaosValue: 0 }];
  const notifications = [];
  const context = loadFunctions(['endCurrentSession'], {
    ...backend.context,
    currentSession: active,
    appendAuditTrail() {},
    showNotification: (title, body) => notifications.push(body),
    t: (key) => key,
    updateOverlayWindow() {},
    mainWindow: null
  });

  await context.endCurrentSession({ endedAt: '2026-05-06T12:05:30.000Z' });

  assert.deepEqual(notifications, ['mapProfitBody · mapDuration']);
});

test('a map started without a name is named plainly, and the prompt does not ask for text it cannot take', async () => {
  const shown = [];
  const context = loadFunctions(['promptMapName'], {
    mainWindow: {},
    dialog: {
      showMessageBox: async (window, options) => {
        shown.push(options);
        return { response: shown.length === 1 ? 0 : 1 };
      }
    },
    t: (key) => key
  });

  assert.equal(await context.promptMapName(), 'unknownMap');
  assert.equal(shown[0].message, 'promptMessage');
  assert.equal(shown[0].detail, 'promptDetail');
  assert.equal(await context.promptMapName(), null);

  const source = fs.readFileSync(mainJsPath, 'utf8');
  assert.match(source, /promptMessage: 'Start this map without a name\?'/);
  assert.match(source, /promptMessage: 'Map adsiz baslatilsin mi\?'/);
});

function loadTrayStart(response) {
  const backend = createJournalBackend();
  const running = backend.start({ mapName: 'Channel', startedAt: '2026-05-06T12:00:00.000Z' }, 'running');
  const shown = [];
  const sent = [];
  const notifications = [];
  const context = loadFunctions(['normalizeStoredFarmTypeId', 'endCurrentSession', 'promptMapName', 'startNewSession'], {
    ...backend.context,
    currentSession: running,
    resolveLeagueContext: () => ({ activeVersion: 'poe1', league: 'Mirage' }),
    getActiveFarmTypeId: () => null,
    crypto: { randomUUID: () => 'new-map' },
    appendAuditTrail() {},
    showNotification: (title, body) => notifications.push([title, body]),
    t: (key, values = {}) => [key, ...Object.values(values)].join('|'),
    dialog: {
      showMessageBox: async (window, options) => {
        shown.push(options);
        return { response };
      }
    },
    mainWindow: { webContents: { send: (channel, data) => sent.push([channel, data]) } }
  });
  return { backend, context, running, shown, sent, notifications };
}

test('the tray Start New Map asks before ending the running map, and Cancel leaves it running', async () => {
  const { backend, context, running, shown, sent, notifications } = loadTrayStart(1);

  assert.equal(await context.startNewSession(), undefined);

  assert.equal(context.currentSession, running);
  assert.deepEqual(backend.journal.sessions.map((stored) => [stored.id, stored.status]), [['running', 'active']]);
  assert.deepEqual(sent, []);
  assert.deepEqual(notifications, []);
  // Enter keeps the map, and Esc or closing the dialog answers Cancel in every language.
  assert.equal(shown[0].message, 'promptEndMessage|Channel');
  assert.equal(shown[0].detail, 'promptEndDetail');
  assert.deepEqual([...shown[0].buttons], ['promptEndConfirm', 'promptCancel']);
  assert.equal(shown[0].defaultId, 1);
  assert.equal(shown[0].cancelId, 1);
});

test('the tray Start New Map ends the running map once the player confirms', async () => {
  const { backend, context, sent } = loadTrayStart(0);

  const session = await context.startNewSession();

  assert.equal(session.id, 'new-map');
  assert.equal(session.mapName, 'unknownMap');
  assert.equal(context.currentSession.id, 'new-map');
  assert.deepEqual(backend.journal.sessions.map((stored) => [stored.id, stored.status]).sort(), [
    ['new-map', 'active'],
    ['running', 'completed']
  ]);
  assert.deepEqual(sent.map(([channel]) => channel), ['session-ended', 'session-started']);
});

test('a map started with a name ends the running map without asking', async () => {
  const { backend, context, shown } = loadTrayStart(1);

  const session = await context.startNewSession({ mapName: 'Dunes Map' });

  assert.equal(session.mapName, 'Dunes Map');
  assert.deepEqual(shown, []);
  assert.equal(backend.journal.sessions.find((stored) => stored.id === 'running').status, 'completed');
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
    isCustomFarmTypeId: () => false,
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

// A price service whose queued sync loads `prices` (or nothing, or never finishes) for the inventory loot tests.
function createFakePriceService({ prices = { 'Exalted Orb': 12 }, hang = false, fullySynced = true } = {}) {
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
      this.fullySynced = fullySynced;
      this.prices = new Map(Object.entries(prices).map(([name, price]) => [name, typeof price === 'object' ? price : { chaosValue: price }]));
      return { itemCount: this.prices.size };
    },
    getStatus() {
      return { itemCount: this.prices.size, poeVersion: this.poeVersion };
    },
    getPriceInfo(itemName) {
      return this.prices.get(itemName) || null;
    },
    getItemType() {
      return 'currency';
    }
  };
}

const EXALTED_GAIN = [{ name: 'Exalted Orb', quantity: 2 }];

function loadInventoryLoot(backend, session, priceService, overrides = {}) {
  let lootId = 0;
  return loadFunctions([
    'normalizePositiveRate',
    'readLocalChaosPrice',
    'withTimeout',
    'notifyPricesUpdated',
    'loadSessionPrices',
    'addInventoryLoot'
  ], {
    ...backend.context,
    sessionPrices: null,
    priceService,
    SESSION_PRICES_WAIT_MS: 20,
    SESSION_PRICES_RETRY_MS: 60_000,
    crypto: { randomUUID: () => `loot-${++lootId}` },
    mainWindow: null,
    console: { log() {}, warn() {} },
    setTimeout,
    clearTimeout,
    ...overrides
  });
}

test('main prices inventory loot from poe.ninja for the session game and league', async () => {
  const backend = createJournalBackend();
  const session = backend.start({
    poeVersion: 'poe2',
    league: 'Fate of the Vaal',
    startedAt: '2026-05-06T12:00:00.000Z'
  }, 'session-poe2');
  const priceService = createFakePriceService();
  const syncCalls = priceService.syncCalls;
  const context = loadInventoryLoot(backend, session, priceService);

  await context.addInventoryLoot(session.id, EXALTED_GAIN);
  await context.addInventoryLoot(session.id, EXALTED_GAIN);

  // One full price load for the session's game and league, reused by the second read.
  assert.deepEqual(syncCalls, [['poe2', 'Fate of the Vaal', true]]);
  const stored = backend.journal.sessions[0];
  assert.deepEqual(stored.lootEntries.map((loot) => [loot.itemName, loot.chaosValue, loot.source]), [
    ['Exalted Orb', 12, 'inventory'],
    ['Exalted Orb', 12, 'inventory']
  ]);
  assert.equal(stored.totalLootChaos, 48);
});

test('main inventory loot is recorded unpriced rather than at another league\'s prices', async () => {
  const backend = createJournalBackend();
  const session = backend.start({ startedAt: '2026-05-06T12:00:00.000Z', league: 'Standard' }, 'session-other-league');
  const priceService = createFakePriceService({ hang: true });
  priceService.league = 'Some Other League';
  const context = loadInventoryLoot(backend, session, priceService);

  await context.addInventoryLoot(session.id, EXALTED_GAIN);

  assert.deepEqual(backend.journal.sessions[0].lootEntries.map((loot) => [loot.itemName, loot.chaosValue]), [
    ['Exalted Orb', 0]
  ]);
});

test('main inventory loot is recorded unpriced when poe.ninja does not answer in time', async () => {
  const backend = createJournalBackend();
  const session = backend.start({ startedAt: '2026-05-06T12:00:00.000Z' }, 'session-slow');
  const context = loadInventoryLoot(backend, session, createFakePriceService({ hang: true }));

  await context.addInventoryLoot(session.id, EXALTED_GAIN);

  assert.deepEqual(backend.journal.sessions[0].lootEntries.map((loot) => [loot.itemName, loot.chaosValue]), [
    ['Exalted Orb', 0]
  ]);
});

test('main inventory loot waits before asking poe.ninja again after a load found no prices', async () => {
  const backend = createJournalBackend();
  const session = backend.start({ startedAt: '2026-05-06T12:00:00.000Z' }, 'session-offline');
  const priceService = createFakePriceService({ prices: {} });
  const context = loadInventoryLoot(backend, session, priceService);

  await context.addInventoryLoot(session.id, EXALTED_GAIN);
  await context.addInventoryLoot(session.id, EXALTED_GAIN);

  assert.equal(priceService.syncCalls.length, 1);
  assert.equal(backend.journal.sessions[0].lootEntries.length, 2);
});

test('main inventory loot asks again, after the wait, when a load left only part of the prices', async () => {
  const backend = createJournalBackend();
  const session = backend.start({ startedAt: '2026-05-06T12:00:00.000Z' }, 'session-partial');
  const priceService = createFakePriceService({ fullySynced: false });
  const context = loadInventoryLoot(backend, session, priceService);

  await context.addInventoryLoot(session.id, EXALTED_GAIN);
  await context.addInventoryLoot(session.id, EXALTED_GAIN);
  assert.equal(priceService.syncCalls.length, 1);

  context.sessionPrices.retryAt = 0;
  await context.addInventoryLoot(session.id, EXALTED_GAIN);
  assert.equal(priceService.syncCalls.length, 2);
});

test('main inventory loot reloads prices that a game switch cleared', async () => {
  const backend = createJournalBackend();
  const session = backend.start({ startedAt: '2026-05-06T12:00:00.000Z' }, 'session-switch');
  const priceService = createFakePriceService();
  const context = loadInventoryLoot(backend, session, priceService);

  await context.addInventoryLoot(session.id, EXALTED_GAIN);
  priceService.prices = new Map();
  await context.addInventoryLoot(session.id, EXALTED_GAIN);

  assert.equal(priceService.syncCalls.length, 2);
  assert.deepEqual(backend.journal.sessions[0].lootEntries.map((loot) => loot.chaosValue), [12, 12]);
});

test('main inventory loot reloads the session league after the Currency page synced another one', async () => {
  const backend = createJournalBackend();
  const session = backend.start({ league: 'Mirage', startedAt: '2026-05-06T12:00:00.000Z' }, 'session-league');
  const priceService = createFakePriceService();
  const context = loadInventoryLoot(backend, session, priceService);

  await context.addInventoryLoot(session.id, EXALTED_GAIN);
  priceService.league = 'Standard';
  await context.addInventoryLoot(session.id, EXALTED_GAIN);

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
    getPriceInfo(name) {
      return { 'Divine Orb': { chaosValue: 150 } }[name] || null;
    },
    queryPrices(params) {
      return {
        prices: [{ itemName: 'Divine Orb', league: this.league, type: params.type }],
        total: 3,
        typeCounts: { currency: 2, fragment: 1 },
        syncedTypes: ['currency', 'fragment']
      };
    }
  };
  const context = loadFunctions(['getCurrencyPrices', 'readLocalChaosPrice', 'normalizePositiveRate'], {
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
    total: 3,
    typeCounts: { currency: 2, fragment: 1 },
    syncedTypes: ['currency', 'fragment'],
    league: 'Mirage',
    poeVersion: 'poe1',
    updatedAt: '2026-10-24T10:00:00.000Z',
    // Read from the same list; it holds no Mirror of Kalandra.
    rates: { divineChaos: 150, mirrorChaos: null }
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

// getLastKnownCurrencyPrices over a kept list of Mirage, next to a price service that holds what the test says.
function loadLastKnownPrices({ league = null, itemCount = 0 } = {}) {
  const PriceService = require('../src/modules/priceService');
  const loads = [];
  const syncCalls = [];
  const priceService = {
    poeVersion: 'poe1',
    league,
    itemCount,
    getStatus() {
      return { itemCount: this.itemCount, lastSync: Date.parse('2026-10-24T10:00:00.000Z') };
    },
    ensureSynced(wanted, poeVersion) {
      syncCalls.push([poeVersion, wanted]);
      return Promise.resolve(this.getStatus());
    },
    getPriceInfo: () => null,
    queryPrices: () => ({ prices: [], total: 0, typeCounts: {}, syncedTypes: [] })
  };
  const context = loadFunctions(['getLastKnownCurrencyPrices', 'getCurrencyPrices', 'readLocalChaosPrice', 'normalizePositiveRate'], {
    PriceService,
    priceService,
    priceSnapshots: {
      load: async (poeVersion, wanted) => {
        loads.push([poeVersion, wanted]);
        return wanted === 'Mirage' ? {
          syncedAt: Date.parse('2026-10-20T10:00:00.000Z'),
          syncedTypes: ['currency'],
          entries: [{ name: 'Divine Orb', chaosValue: 140, divineValue: 1, category: 'currency', icon: null, sparkline: [], change: null }]
        } : null;
      }
    },
    resolveLeagueContext: (options) => ({ activeVersion: options.poeVersion, league: options.league })
  });
  return { context, loads, syncCalls };
}

test('main answers the kept list with its own age and rates, and none for a loaded league or without one', async () => {
  const cold = loadLastKnownPrices();
  const kept = JSON.parse(JSON.stringify(await cold.context.getLastKnownCurrencyPrices({ poeVersion: 'poe1', league: 'Mirage' })));
  assert.equal(kept.updatedAt, '2026-10-20T10:00:00.000Z');
  assert.deepEqual(kept.rates, { divineChaos: 140, mirrorChaos: null });
  assert.deepEqual(kept.prices.map((price) => price.itemName), ['Divine Orb']);
  assert.equal(kept.total, 1);
  assert.equal(kept.league, 'Mirage');
  assert.deepEqual(cold.syncCalls, []);

  assert.equal(await cold.context.getLastKnownCurrencyPrices({ poeVersion: 'poe1', league: 'Standard' }), null);

  const loaded = loadLastKnownPrices({ league: 'Mirage', itemCount: 3 });
  assert.equal(await loaded.context.getLastKnownCurrencyPrices({ poeVersion: 'poe1', league: 'Mirage' }), null);
  // The loaded list needs no file read.
  assert.deepEqual(loaded.loads, []);
});

test('main keeps the kept list when poe.ninja gives nothing, and prices from it never reach loot or profit', async () => {
  const { context, syncCalls } = loadLastKnownPrices();
  const listed = JSON.parse(JSON.stringify(await context.getCurrencyPrices({ poeVersion: 'poe1', league: 'Mirage' })));
  assert.deepEqual(syncCalls, [['poe1', 'Mirage']]);
  assert.deepEqual(listed.prices.map((price) => price.itemName), ['Divine Orb']);
  assert.equal(listed.updatedAt, '2026-10-20T10:00:00.000Z');
  // It says so, because the same list while a sync runs reads differently on the page.
  assert.equal(listed.lastKnown, true);
  assert.equal(JSON.parse(JSON.stringify(await context.getLastKnownCurrencyPrices({ poeVersion: 'poe1', league: 'Mirage' }))).lastKnown, undefined);
  // What prices loot and works out profit reads the price service's own list, which is empty.
  assert.equal(context.readLocalChaosPrice('Divine Orb', 'poe1'), null);

  // No kept list, and it stays the empty answer it always was.
  const empty = JSON.parse(JSON.stringify(await context.getCurrencyPrices({ poeVersion: 'poe1', league: 'Standard' })));
  assert.deepEqual(empty.prices, []);
  assert.equal(empty.total, 0);
  assert.equal(empty.lastKnown, undefined);
});

test('main cache-only Currency reload never starts a sync and answers no prices for a league the list does not hold', async () => {
  const { context, priceService } = loadCurrencyPricesWithRunningSync();

  // A sync would start before the first await, so a missing guard fails here instead of waiting for that sync.
  const request = context.getCurrencyPrices({ poeVersion: 'poe1', league: 'Standard', cacheOnly: true });
  assert.deepEqual(priceService.syncCalls, []);
  const result = await Promise.race([
    request,
    new Promise((resolve) => setTimeout(() => resolve('waited for the sync'), 50))
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    prices: null,
    count: 0,
    total: 0,
    typeCounts: {},
    syncedTypes: [],
    league: 'Standard',
    poeVersion: 'poe1',
    updatedAt: null,
    rates: {}
  });
});

test('main cache-only Currency reload lists the loaded league at once', async () => {
  const { context, priceService } = loadCurrencyPricesWithRunningSync();

  const result = await Promise.race([
    context.getCurrencyPrices({ poeVersion: 'poe1', league: 'Mirage', type: 'currency', cacheOnly: true }),
    new Promise((resolve) => setTimeout(() => resolve('waited for the sync'), 50))
  ]);

  assert.deepEqual(priceService.syncCalls, []);
  assert.deepEqual(JSON.parse(JSON.stringify(result.prices)), [{ itemName: 'Divine Orb', league: 'Mirage', type: 'currency' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.rates)), { divineChaos: 150, mirrorChaos: null });
});

// Ends the session in the in-memory journal, the way a map's end does before its loot is counted.
function endSessionInBackend(backend, sessionId, endedAt = '2026-05-06T12:05:00.000Z') {
  const ended = localJournal.endSession(backend.journal, sessionId, { endedAt }, { now: new Date(endedAt) });
  backend.journal = ended.journal;
  return ended.session;
}

test('main adds inventory loot to a finished session, priced, as source inventory, and tells the window', async () => {
  const backend = createJournalBackend();
  const started = backend.start({ startedAt: '2026-05-06T12:00:00.000Z' }, 'session-finished');
  const finished = endSessionInBackend(backend, started.id);
  assert.equal(finished.status, 'completed');
  assert.equal(finished.totalLootChaos, 0);
  const sent = [];
  const priceService = createFakePriceService({ prices: { 'Exalted Orb': 12, 'Divine Orb': { chaosValue: 150, divineValue: 1 } } });
  const context = loadInventoryLoot(backend, finished, priceService, {
    mainWindow: { webContents: { send: (channel, data) => sent.push([channel, JSON.parse(JSON.stringify(data))]) } }
  });

  await context.addInventoryLoot('session-finished', [
    { name: 'Exalted Orb', quantity: 2 },
    { name: 'Divine Orb', quantity: 1 }
  ]);

  const stored = backend.journal.sessions[0];
  assert.deepEqual(
    stored.lootEntries.map((loot) => [loot.itemName, loot.itemType, loot.quantity, loot.chaosValue, loot.source]).sort(),
    [['Divine Orb', 'currency', 1, 150, 'inventory'], ['Exalted Orb', 'currency', 2, 12, 'inventory']]
  );
  assert.equal(stored.status, 'completed');
  assert.equal(stored.totalLootChaos, 174);
  assert.equal(stored.profitChaos, 174);
  assert.deepEqual(sent.map(([channel]) => channel), ['prices-updated', 'session-loot-updated']);
  const updatedSession = sent[1][1];
  assert.equal(updatedSession.id, 'session-finished');
  assert.equal(updatedSession.totalLootChaos, 174);
  assert.equal(updatedSession.lootEntries.length, 2);
});

test('main adds inventory loot without a price as 0 and as other when the item is unknown', async () => {
  const backend = createJournalBackend();
  const started = backend.start({ startedAt: '2026-05-06T12:00:00.000Z' }, 'session-unpriced');
  const finished = endSessionInBackend(backend, started.id);
  const priceService = createFakePriceService({ prices: {} });
  priceService.getItemType = () => 'other';
  const context = loadInventoryLoot(backend, finished, priceService);

  await context.addInventoryLoot('session-unpriced', [{ name: 'Mystery Stack', quantity: 3 }]);

  const [loot] = backend.journal.sessions[0].lootEntries;
  assert.deepEqual([loot.itemName, loot.itemType, loot.quantity, loot.chaosValue, loot.source], [
    'Mystery Stack', 'other', 3, 0, 'inventory'
  ]);
});

test('main inventory loot is not added when the journal cannot be read', async () => {
  const backend = createJournalBackend();
  const started = backend.start({ startedAt: '2026-05-06T12:00:00.000Z' }, 'session-unreadable');
  const finished = endSessionInBackend(backend, started.id);
  let written = 0;
  const context = loadInventoryLoot(backend, finished, createFakePriceService(), {
    readJournal() {
      throw journalUnreadableError();
    },
    writeJournal() {
      written += 1;
    }
  });

  await assert.rejects(context.addInventoryLoot('session-unreadable', EXALTED_GAIN), /JOURNAL_UNREADABLE|journal/i);
  assert.equal(written, 0);
});

// showInventoryStatus over the overlay and notification stubs; the overlay timer is a recorded fake.
function loadInventoryStatus({ overlayOn }) {
  const calls = { notifications: [], overlayUpdates: 0, timers: [] };
  const context = loadFunctions(['showInventoryStatus'], {
    INVENTORY_READING_CARD_MS: 1_200,
    INVENTORY_STATUS_CARD_MS: 4_000,
    overlayInventoryStatus: null,
    overlayInventoryStatusTimer: null,
    isOverlayEnabled: () => overlayOn,
    t: (key) => key,
    showNotification: (title, body) => calls.notifications.push([title, body]),
    updateOverlayWindow() {
      calls.overlayUpdates += 1;
    },
    setTimeout(callback, delay) {
      calls.timers.push({ callback, delay });
      return calls.timers.length;
    },
    clearTimeout() {}
  });
  return { context, calls };
}

test('main tells an inventory status by OS notification when the overlay is off, except for reading', () => {
  const { context, calls } = loadInventoryStatus({ overlayOn: false });

  context.showInventoryStatus('reading');
  context.showInventoryStatus('notOpen');
  context.showInventoryStatus('saved');

  assert.deepEqual(calls.notifications, [
    ['inventoryStatusTitle', 'inventoryStatus_notOpen'],
    ['inventoryStatusTitle', 'inventoryStatus_saved']
  ]);
  assert.equal(calls.overlayUpdates, 0);
  assert.deepEqual(calls.timers, []);
  assert.equal(context.overlayInventoryStatus, null);
});

test('main shows an inventory status as a timed overlay card when the overlay is on, and no notification', () => {
  const { context, calls } = loadInventoryStatus({ overlayOn: true });

  context.showInventoryStatus('reading');
  assert.deepEqual(JSON.parse(JSON.stringify(context.overlayInventoryStatus)), { kind: 'reading', primaryLine: 'inventoryStatus_reading', secondaryLine: '' });
  context.showInventoryStatus('noGain');
  assert.deepEqual(JSON.parse(JSON.stringify(context.overlayInventoryStatus)), { kind: 'noGain', primaryLine: 'inventoryStatus_noGain', secondaryLine: '' });

  assert.deepEqual(calls.notifications, []);
  assert.deepEqual(calls.timers.map(({ delay }) => delay), [1_200, 4_000]);
  assert.equal(calls.overlayUpdates, 2);

  // The card goes when its time is up, and the overlay shows what it covered again.
  calls.timers[1].callback();
  assert.equal(context.overlayInventoryStatus, null);
  assert.equal(calls.overlayUpdates, 3);
});

test('main sends OS notifications only while the main window is not in front', () => {
  const notify = (mainWindow, notificationsEnabled = true) => {
    const shown = [];
    const context = loadFunctions(['showNotification'], {
      store: { get: (key) => (key === 'notifications' ? notificationsEnabled : undefined) },
      APP_ICON_PATH: 'icon',
      require: () => ({
        Notification: class {
          constructor(options) {
            shown.push(options.title);
          }

          show() {}
        }
      }),
      mainWindow
    });
    context.showNotification('Channel', 'Profit +412c');
    return shown;
  };
  const windowState = ({ destroyed = false, visible = true, focused = true } = {}) => ({
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    isFocused: () => focused
  });

  assert.deepEqual(notify(windowState()), []);
  assert.deepEqual(notify(windowState({ focused: false })), ['Channel']);
  assert.deepEqual(notify(windowState({ visible: false })), ['Channel']);
  assert.deepEqual(notify(windowState({ destroyed: true })), ['Channel']);
  assert.deepEqual(notify(null), ['Channel']);
  assert.deepEqual(notify(windowState({ focused: false }), false), []);
});

test('the tray has no Add Loot item, and Start New Map reports in the window it brings to the front', async () => {
  let template = [];
  let startFails = false;
  const sent = [];
  const shownPages = [];
  const context = loadFunctions(['refreshTrayMenu'], {
    tray: { setToolTip() {}, setContextMenu() {} },
    mainWindow: { isVisible: () => false, webContents: { send: (channel, data) => sent.push([channel, data]) } },
    Menu: {
      buildFromTemplate(items) {
        template = items;
        return items;
      }
    },
    t: (key) => key,
    APP_NAME: 'Juice Journal',
    getValidatedHotkeySettings: () => ({ scanHotkey: 'F9' }),
    showMainWindow: (page) => shownPages.push(page),
    hideMainWindowToTray() {},
    async startNewSession() {
      if (startFails) {
        throw new Error('journal write failed');
      }
    },
    app: {}
  });

  context.refreshTrayMenu();
  const item = (label) => template.find((entry) => entry.label?.startsWith(label));
  assert.equal(item('trayAddLoot'), undefined);
  item('trayNewSession').click();
  startFails = true;
  item('trayNewSession').click();
  await new Promise((resolve) => setImmediate(resolve));

  // The window is in front, where OS notifications are held back, so the renderer shows the outcome.
  assert.deepEqual(shownPages, ['dashboard', 'dashboard']);
  assert.deepEqual(sent, [['tray-action', 'startMapFailed']]);
});

test('the tray Start New Map tells the window when the journal cannot be read', async () => {
  let template = [];
  let failure = null;
  const sent = [];
  const context = loadFunctions(['refreshTrayMenu'], {
    tray: { setToolTip() {}, setContextMenu() {} },
    mainWindow: { isVisible: () => false, webContents: { send: (channel, data) => sent.push([channel, data]) } },
    Menu: {
      buildFromTemplate(items) {
        template = items;
        return items;
      }
    },
    t: (key) => key,
    APP_NAME: 'Juice Journal',
    getValidatedHotkeySettings: () => ({ scanHotkey: 'F9' }),
    showMainWindow() {},
    hideMainWindowToTray() {},
    async startNewSession() {
      throw failure;
    },
    app: {}
  });

  context.refreshTrayMenu();
  const startMap = template.find((entry) => entry.label === 'trayNewSession');
  // From readJournal, and from a running map whose end failed first (toRendererError keeps only the message).
  for (const error of [journalUnreadableError(), new Error('JOURNAL_UNREADABLE'), new Error('journal write failed')]) {
    failure = error;
    startMap.click();
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.deepEqual(sent, [
    ['tray-action', 'startMapJournalUnreadable'],
    ['tray-action', 'startMapJournalUnreadable'],
    ['tray-action', 'startMapFailed']
  ]);
});

test('main tells the main window when the session prices have loaded', async () => {
  const backend = createJournalBackend();
  const session = backend.start({
    poeVersion: 'poe2',
    league: 'Fate of the Vaal',
    startedAt: '2026-05-06T12:00:00.000Z'
  }, 'session-prices-updated');
  const sent = [];
  const context = loadInventoryLoot(backend, session, createFakePriceService(), {
    mainWindow: { webContents: { send: (channel, data) => sent.push([channel, data]) } }
  });

  await context.addInventoryLoot(session.id, EXALTED_GAIN);
  await context.addInventoryLoot(session.id, EXALTED_GAIN);

  // Once for the load, before the loot it priced; the second read reuses the loaded prices.
  assert.deepEqual(sent.map(([channel]) => channel), ['prices-updated', 'session-loot-updated', 'session-loot-updated']);
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
  const context = loadInventoryLoot(backend, session, createFakePriceService({ prices: {} }), {
    mainWindow: { webContents: { send: (channel) => sent.push(channel) } }
  });

  await context.addInventoryLoot(session.id, EXALTED_GAIN);

  assert.deepEqual(sent, ['session-loot-updated']);
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
    isCustomFarmTypeId: () => false,
    getActiveFarmTypeId: () => 'breach',
    saveMapResultHistory(result) {
      calls.push(['saveMapResultHistory', JSON.parse(JSON.stringify(result))]);
      return [result];
    },
    ...backend.context,
    appendAuditTrail() {},
    showNotification: (title) => calls.push(['showNotification', title]),
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

  // The first toast of a process would hold its exit until Electron's shortcut check ends.
  assert.deepEqual(calls.map(([name]) => name), ['saveMapResultHistory']);
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
    isCustomFarmTypeId: () => false,
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

test('a map exit that cannot end the map in an unreadable journal leaves no unhandled rejection', async () => {
  const handlers = {};
  const endings = [];
  let failure = null;
  const context = loadFunctions(['setupLogParser'], {
    store: { get: (key) => (key === 'poePath' ? 'C:/PoE/logs/Client.txt' : undefined), set() {} },
    DEFAULT_POE_LOG_PATH: 'C:/PoE/logs/Client.txt',
    require: () => ({ existsSync: () => true }),
    refreshRedactionTargets() {},
    normalizePoeVersion: () => 'poe1',
    LogParser: class {
      on(eventName, handler) {
        handlers[eventName] = handler;
      }

      start() {}

      bootstrapFromTail() {}
    },
    publishRuntimeSessionEvent: () => null,
    currentSession: { id: 'session-1', status: 'active' },
    shouldAutoEndSessionOnMapExit: () => true,
    // Keeps the promise the handler's catch returns, so the test sees what it lets through.
    endCurrentSession() {
      const ending = Promise.reject(failure);
      const handleWith = ending.catch.bind(ending);
      ending.catch = (handler) => {
        const handled = handleWith(handler);
        endings.push(handled);
        return handled;
      };
      return ending;
    },
    mainWindow: null
  });

  context.setupLogParser();
  failure = new Error('JOURNAL_UNREADABLE');
  handlers.mapExited({ timestamp: '2026-05-06T12:05:30.000Z' });
  failure = new Error('journal write failed');
  handlers.mapExited({ timestamp: '2026-05-06T12:06:30.000Z' });

  assert.equal(endings.length, 2);
  assert.equal(await endings[0], undefined);
  await assert.rejects(endings[1], /journal write failed/);
});

test('map-enter handler publishes runtime state and leaves session start to the renderer prompt', async () => {
  const startCalls = [];
  const runtimeCalls = [];
  let mapsEntered = 0;
  const context = loadFunctions(['handleMapEntered'], {
    currentSession: null,
    inventoryWatcher: { mapEntered: () => { mapsEntered += 1; } },
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
  assert.equal(mapsEntered, 1);
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
  await assert.rejects(() => context.reconnectPoeDevice(), (error) => {
    assert.match(error.message, /poeDifferentAccount/);
    // The renderer reads the code, so the reason reaches the player without main's text.
    assert.equal(error.code, 'POE_DIFFERENT_ACCOUNT');
    return true;
  });

  assert.equal(context.getActiveProfile().id, profile.id);
  assert.deepEqual(calls, ['clearTokens', ['persistPoeClientTokens', null]]);

  const source = fs.readFileSync(mainJsPath, 'utf8');
  assert.match(
    source,
    /await reconnectPoeDevice\(\);[\s\S]{0,300}return \{\s*success: false,\s*errorCode: error\?\.code \|\| null,/
  );
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

const farmTypeModel = require('../src/modules/farmTypeModel');

const CUSTOM_FARM_FUNCTIONS = [
  'getActiveProfile',
  'normalizeStoredFarmTypeId',
  'getCustomFarmTypesStoreKey',
  'getStoredCustomFarmTypes',
  'getActiveFarmTypeId',
  'setActiveFarmTypeId',
  'resolveFarmTypeLabel',
  'getMapResultsStoreKey',
  'getStoredMapResults',
  'renameFarmTypeInMapResults',
  'saveCustomFarmType',
  'removeCustomFarmType'
];

// A store that survives a restart: each load of main's functions reads what the last one wrote, as JSON.
function createCustomFarmHarness(initial = {}) {
  const disk = {
    text: JSON.stringify({
      localProfiles: { 'profile-1': { id: 'profile-1' }, 'profile-2': { id: 'profile-2' } },
      activeProfileId: 'profile-1',
      ...initial
    })
  };
  const store = {
    get: (key) => JSON.parse(disk.text)[key],
    set(key, value) {
      disk.text = JSON.stringify({ ...JSON.parse(disk.text), [key]: value });
    }
  };
  const overlayUpdates = [];
  const start = () => loadFunctions(CUSTOM_FARM_FUNCTIONS, {
    store,
    crypto: { randomUUID: () => `0000-${Math.random().toString(16).slice(2, 10)}` },
    listFarmTypes: farmTypeModel.listFarmTypes,
    isCustomFarmTypeId: farmTypeModel.isCustomFarmTypeId,
    normalizeCustomFarmTypes: farmTypeModel.normalizeCustomFarmTypes,
    createCustomFarmType: farmTypeModel.createCustomFarmType,
    updateCustomFarmType: farmTypeModel.updateCustomFarmType,
    deleteCustomFarmType: farmTypeModel.deleteCustomFarmType,
    updateOverlayWindow() {
      overlayUpdates.push(true);
    }
  });
  return { store, start, overlayUpdates };
}

const NEW_FARM = { label: 'Boss Tablets', color: 'amber', icon: 'farm-tablet', poeVersions: ['poe2'] };

test('a custom farm type is saved for the signed-in profile only and survives a restart', () => {
  const { store, start, overlayUpdates } = createCustomFarmHarness();
  const context = start();

  const saved = context.saveCustomFarmType(NEW_FARM);
  assert.equal(saved.ok, true);
  assert.match(saved.farmType.id, /^custom-/);
  assert.equal(overlayUpdates.length, 1);

  // The other profile on this PC does not see it, and it comes back for the first one.
  store.set('activeProfileId', 'profile-2');
  assert.deepEqual(plainJson(context.getStoredCustomFarmTypes()), []);
  assert.equal(context.saveCustomFarmType({ ...NEW_FARM, label: 'Boss Tablets' }).ok, true);
  assert.equal(context.getStoredCustomFarmTypes().length, 1);
  store.set('activeProfileId', 'profile-1');

  const restarted = start();
  assert.deepEqual(plainJson(restarted.getStoredCustomFarmTypes()), [plainJson(saved.farmType)]);
  assert.equal(restarted.resolveFarmTypeLabel(saved.farmType.id), 'Boss Tablets');

  store.set('activeProfileId', null);
  assert.deepEqual(plainJson(restarted.getStoredCustomFarmTypes()), []);
});

test('a refused custom farm type writes nothing and reports its code', () => {
  const { store, start, overlayUpdates } = createCustomFarmHarness();
  const context = start();

  assert.deepEqual(plainJson(context.saveCustomFarmType({ ...NEW_FARM, label: 'Ritual' })), { ok: false, error: 'LABEL_TAKEN' });
  assert.deepEqual(plainJson(context.saveCustomFarmType(null)), { ok: false, error: 'LABEL_REQUIRED' });
  assert.deepEqual(plainJson(context.saveCustomFarmType({ ...NEW_FARM, id: 'custom-unknown' })), { ok: false, error: 'NOT_FOUND' });
  assert.deepEqual(plainJson(context.removeCustomFarmType('custom-unknown')), { ok: false, error: 'NOT_FOUND' });
  assert.equal(store.get('customFarmTypes:profile-1'), undefined);
  assert.equal(overlayUpdates.length, 0);
});

test('renaming a custom farm type renames it on stored map results, and leaves others alone', () => {
  const { store, start } = createCustomFarmHarness();
  const context = start();
  const { farmType } = context.saveCustomFarmType(NEW_FARM);
  store.set('mapResults:profile-1', [
    { id: 'a', farmTypeId: farmType.id, farmType: 'Boss Tablets' },
    { id: 'b', farmTypeId: 'ritual', farmType: 'Ritual' },
    { id: 'c', farmType: 'Abyss' }
  ]);
  store.set('mapResults:profile-2', [{ id: 'd', farmTypeId: farmType.id, farmType: 'Boss Tablets' }]);

  const edited = context.saveCustomFarmType({ ...NEW_FARM, id: farmType.id, label: 'Overseer Juice', color: 'red' });

  assert.equal(edited.ok, true);
  assert.equal(edited.farmType.id, farmType.id);
  assert.deepEqual(store.get('mapResults:profile-1').map((result) => result.farmType), ['Overseer Juice', 'Ritual', 'Abyss']);
  assert.equal(store.get('mapResults:profile-2')[0].farmType, 'Boss Tablets');
  assert.equal(context.resolveFarmTypeLabel(farmType.id), 'Overseer Juice');
});

test('deleting a custom farm type clears it as the active one and keeps its name for past sessions', () => {
  const { store, start } = createCustomFarmHarness();
  const context = start();
  const { farmType } = context.saveCustomFarmType(NEW_FARM);
  context.setActiveFarmTypeId(farmType.id);
  assert.equal(context.getActiveFarmTypeId(), farmType.id);

  const removed = context.removeCustomFarmType(farmType.id);

  assert.equal(removed.ok, true);
  assert.equal(store.get('activeFarmTypeId'), null);
  assert.equal(context.getActiveFarmTypeId(), null);
  assert.equal(context.resolveFarmTypeLabel(farmType.id), 'Boss Tablets');
  assert.equal(start().resolveFarmTypeLabel(farmType.id), 'Boss Tablets');
});

test('another profile does not inherit the active custom farm type, and built-in ones stay shared', () => {
  const { store, start } = createCustomFarmHarness();
  const context = start();
  const { farmType } = context.saveCustomFarmType(NEW_FARM);
  context.setActiveFarmTypeId(farmType.id);

  store.set('activeProfileId', 'profile-2');
  assert.equal(context.getActiveFarmTypeId(), null);
  // A session of this profile cannot name a type it does not have; the caller falls back from a null label.
  assert.equal(context.resolveFarmTypeLabel(farmType.id), null);

  store.set('activeProfileId', 'profile-1');
  assert.equal(context.getActiveFarmTypeId(), farmType.id);

  context.setActiveFarmTypeId('ritual');
  store.set('activeProfileId', 'profile-2');
  assert.equal(context.getActiveFarmTypeId(), 'ritual');
  assert.equal(context.resolveFarmTypeLabel('ritual'), 'Ritual');
});

test('renderer settings never carry any profile\'s custom farm types', () => {
  const store = createMemoryStore({
    language: 'en',
    localProfiles: { 'profile-1': { id: 'profile-1' } },
    activeProfileId: 'profile-1',
    'customFarmTypes:profile-1': [{ id: 'custom-a' }],
    'customFarmTypes:profile-2': [{ id: 'custom-b' }]
  });
  store.store = store.data;
  const context = loadFunctions(['getActiveProfile', 'getAccountStateStoreKey', 'getRendererSettings'], {
    store,
    DEFAULT_SCAN_HOTKEY: 'F9',
    DEFAULT_STASH_SCAN_HOTKEY: 'CommandOrControl+Shift+L'
  });

  assert.deepEqual(Object.keys(context.getRendererSettings()).filter((key) => key.startsWith('customFarmTypes')), []);
});

test('the map result recorded when a session ends without the renderer keeps the custom farm type id', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');

  assert.match(source, /farmTypeId: normalizeStoredFarmTypeId\(farmTypeId\),\s+farmType: resolveFarmTypeLabel\(farmTypeId\)/);
});

test('custom farm types reach the renderer through checked IPC and the overlay through its state', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

  assert.match(source, /ipcMain\.handle\('get-custom-farm-types', \(\) => getStoredCustomFarmTypes\(\)\)/);
  assert.match(source, /ipcMain\.handle\('save-custom-farm-type', \(event, input\) => \{\s+assertDesktopUserAuthenticated\(\);/);
  assert.match(source, /ipcMain\.handle\('delete-custom-farm-type', \(event, farmTypeId\) => \{\s+assertDesktopUserAuthenticated\(\);/);
  assert.match(source, /customFarmTypes: getStoredCustomFarmTypes\(\)/);
  assert.match(preload, /getCustomFarmTypes: \(\) => ipcRenderer\.invoke\('get-custom-farm-types'\)/);
  assert.match(preload, /saveCustomFarmType: \(input\) => ipcRenderer\.invoke\('save-custom-farm-type', input\)/);
  assert.match(preload, /deleteCustomFarmType: \(farmTypeId\) => ipcRenderer\.invoke\('delete-custom-farm-type', farmTypeId\)/);
});

function plainJson(value) {
  return JSON.parse(JSON.stringify(value));
}
