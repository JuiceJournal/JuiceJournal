const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

test('main session start forwards the selected farm type to api and queued payloads', async () => {
  const apiCalls = [];
  const queuedCalls = [];
  const context = loadFunctions(['normalizeStoredFarmTypeId', 'startNewSession'], {
    currentSession: null,
    resolveLeagueContext: () => ({
      activeVersion: 'poe1',
      league: 'Mirage'
    }),
    getActiveFarmTypeId: () => 'ritual',
    apiClient: {
      async startSession(payload) {
        apiCalls.push(payload);
        throw new Error('offline');
      }
    },
    isRetryableApiError: () => true,
    createQueuedSession(input) {
      queuedCalls.push(['createQueuedSession', { ...input }]);
      return {
        id: 'local-session-1',
        startedAt: '2026-04-11T10:00:00.000Z'
      };
    },
    queuePendingSessionAction(action) {
      queuedCalls.push(['queuePendingSessionAction', JSON.parse(JSON.stringify(action))]);
    },
    setQueuedCurrentSession() {},
    appendAuditTrail() {},
    showNotification() {},
    t: (key) => key,
    mainWindow: null
  });

  await context.startNewSession({
    mapName: 'Dunes Map',
    startedAt: '2026-04-11T10:00:00.000Z'
  });

  assert.deepEqual(apiCalls.map((payload) => ({ ...payload })), [{
    mapName: 'Dunes Map',
    mapTier: null,
    mapType: 'ritual',
    farmTypeId: 'ritual',
    costChaos: 0,
    poeVersion: 'poe1',
    league: 'Mirage'
  }]);
  assert.deepEqual(queuedCalls, [
    ['createQueuedSession', {
      localSessionId: undefined,
      mapName: 'Dunes Map',
      mapTier: null,
      mapType: 'ritual',
      farmTypeId: 'ritual',
      strategyTag: null,
      notes: null,
      costChaos: 0,
      poeVersion: 'poe1',
      league: 'Mirage',
      startedAt: '2026-04-11T10:00:00.000Z'
    }],
    ['queuePendingSessionAction', {
      type: 'sessionStart',
      localSessionId: 'local-session-1',
      startedAt: '2026-04-11T10:00:00.000Z',
      payload: {
        mapName: 'Dunes Map',
        mapTier: null,
        mapType: 'ritual',
        farmTypeId: 'ritual',
        strategyTag: null,
        notes: null,
        costChaos: 0,
        poeVersion: 'poe1',
        league: 'Mirage'
      }
    }]
  ]);
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

test('main session start surfaces non-retryable api failures to the renderer', async () => {
  const notificationCalls = [];
  const context = loadFunctions(['normalizeStoredFarmTypeId', 'startNewSession'], {
    currentSession: null,
    resolveLeagueContext: () => ({
      activeVersion: 'poe1',
      league: 'Mirage'
    }),
    getActiveFarmTypeId: () => null,
    apiClient: {
      async startSession() {
        throw new Error('sequelize is not defined');
      }
    },
    isRetryableApiError: () => false,
    showNotification(title, body) {
      notificationCalls.push([title, body]);
    },
    t: (key) => key,
    mainWindow: null
  });

  await assert.rejects(
    () => context.startNewSession({ mapName: 'Dunes Map' }),
    /sequelize is not defined/
  );

  assert.deepEqual(notificationCalls, [['notificationError', 'sessionStartFailed']]);
});

test('main local session end adds completed metadata for PoE2 zero-profit results', async () => {
  const queuedActions = [];
  const messages = [];
  const context = loadFunctions(['endCurrentSession'], {
    currentSession: {
      id: 'local-session-1',
      mapName: 'Channel',
      farmTypeId: 'abyss',
      poeVersion: 'poe2',
      league: 'Fate of the Vaal',
      startedAt: '2026-05-06T12:00:00.000Z',
      endedAt: null,
      totalLootChaos: 0,
      profitChaos: 0,
      localOnly: true,
      queued: true
    },
    queuePendingSessionAction(action) {
      queuedActions.push(JSON.parse(JSON.stringify(action)));
    },
    setQueuedCurrentSession() {},
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

  assert.equal(result.id, 'local-session-1');
  assert.equal(result.queued, true);
  assert.equal(result.status, 'completed');
  assert.equal(result.endedAt, '2026-05-06T12:05:30.000Z');
  assert.equal(result.durationSeconds, 330);
  assert.deepEqual(queuedActions, [{
    type: 'sessionEnd',
    sessionId: 'local-session-1',
    endedAt: '2026-05-06T12:05:30.000Z',
    durationSeconds: 330
  }]);
  assert.deepEqual(messages, [{
    channel: 'session-ended',
    payload: {
      id: 'local-session-1',
      mapName: 'Channel',
      farmTypeId: 'abyss',
      poeVersion: 'poe2',
      league: 'Fate of the Vaal',
      startedAt: '2026-05-06T12:00:00.000Z',
      endedAt: '2026-05-06T12:05:30.000Z',
      totalLootChaos: 0,
      profitChaos: 0,
      localOnly: true,
      queued: true,
      status: 'completed',
      durationSeconds: 330
    }
  }]);
  assert.equal(context.currentSession, null);
});

test('main session end can target a backend session id after process state is lost', async () => {
  const apiCalls = [];
  const messages = [];
  const context = loadFunctions(['endCurrentSession'], {
    currentSession: null,
    getCurrentSessionFromBackend: async () => null,
    apiClient: {
      async endSession(sessionId, payload) {
        apiCalls.push([sessionId, { ...payload }]);
        return {
          id: sessionId,
          mapName: 'Dunes Map',
          status: 'completed',
          profitChaos: payload.profitChaos,
          totalLootChaos: payload.totalLootChaos
        };
      }
    },
    isRetryableApiError: () => false,
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
    sessionId: 'session-remote-1',
    mapName: 'Dunes Map',
    startedAt: '2026-05-06T12:00:00.000Z',
    endedAt: '2026-05-06T12:04:00.000Z',
    totalLootChaos: 12,
    profitChaos: 12
  });

  assert.equal(result.id, 'session-remote-1');
  assert.equal(result.status, 'completed');
  assert.deepEqual(apiCalls, [[
    'session-remote-1',
    {
      endedAt: '2026-05-06T12:04:00.000Z',
      durationSeconds: 240,
      totalLootChaos: 12,
      profitChaos: 12
    }
  ]]);
  assert.equal(messages[0].channel, 'session-ended');
  assert.equal(context.currentSession, null);
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
