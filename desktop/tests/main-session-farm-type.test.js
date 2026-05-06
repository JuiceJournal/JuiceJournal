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
  const context = loadFunctions(['showStartMapPromptOverlay', 'hideStartMapPromptOverlay'], {
    overlayStartMapPromptState: null,
    updateOverlayWindow() {
      overlayUpdates.push(JSON.parse(JSON.stringify(context.overlayStartMapPromptState)));
      return { updated: true };
    }
  });

  context.showStartMapPromptOverlay({
    mapName: 'Channel',
    farmType: 'Breach',
    poeVersion: 'poe2',
    league: 'Fate of the Vaal'
  }, {
    now: Date.parse('2026-05-06T12:00:00.000Z')
  });

  assert.deepEqual(JSON.parse(JSON.stringify(context.overlayStartMapPromptState)), {
    mapName: 'Channel',
    farmType: 'Breach',
    poeVersion: 'poe2',
    league: 'Fate of the Vaal',
    source: 'map-detected',
    createdAt: Date.parse('2026-05-06T12:00:00.000Z')
  });

  context.hideStartMapPromptOverlay();

  assert.deepEqual(overlayUpdates, [
    {
      mapName: 'Channel',
      farmType: 'Breach',
      poeVersion: 'poe2',
      league: 'Fate of the Vaal',
      source: 'map-detected',
      createdAt: Date.parse('2026-05-06T12:00:00.000Z')
    },
    null
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
