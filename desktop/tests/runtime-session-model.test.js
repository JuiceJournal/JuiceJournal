const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RUNTIME_MODEL_REQUEST = '../src/modules/runtimeSessionModel';
const desktopDir = path.resolve(__dirname, '..');
const appJsPath = path.join(desktopDir, 'src', 'app.js');

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadRuntimeSessionModel() {
  try {
    return require(RUNTIME_MODEL_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, RUNTIME_MODEL_REQUEST)) {
      throw error;
    }

    return { __loadError: error };
  }
}

function getRuntimeSessionModelExport(exportName) {
  const runtimeSessionModel = loadRuntimeSessionModel();

  if (runtimeSessionModel.__loadError) {
    const { code, message } = runtimeSessionModel.__loadError;
    assert.fail(
      `Expected desktop/src/modules/runtimeSessionModel.js to exist and export ${exportName}. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof runtimeSessionModel[exportName],
    'function',
    `Expected runtimeSessionModel.${exportName} to be a function`
  );

  return runtimeSessionModel[exportName];
}

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}`;
  const asyncSignature = `async ${signature}`;
  const asyncStartIndex = source.indexOf(asyncSignature);
  const plainStartIndex = source.indexOf(signature);
  const startIndex = asyncStartIndex !== -1 ? asyncStartIndex : plainStartIndex;

  if (startIndex === -1) {
    assert.fail(`Expected ${path.basename(appJsPath)} to define ${functionName}()`);
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
    assert.fail(`Unable to locate ${functionName}() body in ${path.basename(appJsPath)}`);
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

  assert.fail(`Unable to parse ${functionName}() from ${path.basename(appJsPath)}`);
}

function loadFunctions(functionNames, contextOverrides = {}) {
  const source = fs.readFileSync(appJsPath, 'utf8');
  const context = vm.createContext({
    console,
    ...contextOverrides
  });

  for (const functionName of functionNames) {
    const functionSource = extractFunctionSource(source, functionName);
    vm.runInContext(`${functionSource};\nthis.${functionName} = ${functionName};`, context);
  }

  return context;
}

test('runtime session model creates a new instance summary from enter/exit events', () => {
  const createRuntimeSessionState = getRuntimeSessionModelExport('createRuntimeSessionState');
  const applyRuntimeEvent = getRuntimeSessionModelExport('applyRuntimeEvent');

  const state = createRuntimeSessionState();
  applyRuntimeEvent(state, { type: 'area_entered', areaName: 'Crimson Shores', at: '2026-04-09T12:00:00.000Z' });
  applyRuntimeEvent(state, { type: 'area_exited', areaName: 'Crimson Shores', at: '2026-04-09T12:05:30.000Z' });

  assert.equal(state.instances.length, 1);
  assert.equal(state.instances[0].durationSeconds, 330);
  assert.equal(state.totalActiveSeconds, 330);
  assert.equal(state.currentInstance, null);
});

test('runtime session model keeps current instance active until exit arrives', () => {
  const createRuntimeSessionState = getRuntimeSessionModelExport('createRuntimeSessionState');
  const applyRuntimeEvent = getRuntimeSessionModelExport('applyRuntimeEvent');

  const state = createRuntimeSessionState();
  applyRuntimeEvent(state, { type: 'area_entered', areaName: 'Overgrown', at: '2026-04-09T12:00:00.000Z' });

  assert.equal(state.currentInstance.areaName, 'Overgrown');
  assert.equal(state.currentInstance.status, 'active');
  assert.equal(state.summary.status, 'active');
  assert.equal(state.summary.currentAreaName, 'Overgrown');
});

test('runtime session model derives live elapsed time for an active instance at a supplied timestamp', () => {
  const createRuntimeSessionState = getRuntimeSessionModelExport('createRuntimeSessionState');
  const applyRuntimeEvent = getRuntimeSessionModelExport('applyRuntimeEvent');
  const deriveRuntimeSessionSummary = getRuntimeSessionModelExport('deriveRuntimeSessionSummary');
  const cloneRuntimeSessionState = getRuntimeSessionModelExport('cloneRuntimeSessionState');

  const state = createRuntimeSessionState();
  applyRuntimeEvent(state, { type: 'area_entered', areaName: 'Overgrown', at: '2026-04-09T12:00:00.000Z' });

  const summary = deriveRuntimeSessionSummary(state, { now: '2026-04-09T12:02:05.000Z' });
  const snapshot = cloneRuntimeSessionState(state, { now: '2026-04-09T12:02:05.000Z' });

  assert.equal(summary.currentInstanceSeconds, 125);
  assert.equal(summary.totalActiveSeconds, 125);
  assert.equal(snapshot.currentInstance.durationSeconds, 125);
  assert.equal(snapshot.summary.currentInstanceSeconds, 125);
  assert.equal(state.currentInstance.durationSeconds, 0);
});

test('runtime session model closes an active instance when another area starts', () => {
  const createRuntimeSessionState = getRuntimeSessionModelExport('createRuntimeSessionState');
  const applyRuntimeEvent = getRuntimeSessionModelExport('applyRuntimeEvent');

  const state = createRuntimeSessionState();
  applyRuntimeEvent(state, { type: 'area_entered', areaName: 'Overgrown', at: '2026-04-09T12:00:00.000Z' });
  applyRuntimeEvent(state, { type: 'area_entered', areaName: 'Crimson Shores', at: '2026-04-09T12:03:00.000Z' });

  assert.equal(state.instances.length, 1);
  assert.equal(state.instances[0].areaName, 'Overgrown');
  assert.equal(state.instances[0].status, 'completed');
  assert.equal(state.instances[0].durationSeconds, 180);
  assert.equal(state.currentInstance.areaName, 'Crimson Shores');
});

test('runtime session model clears active lifecycle state without preserving a stale instance', () => {
  const createRuntimeSessionState = getRuntimeSessionModelExport('createRuntimeSessionState');
  const applyRuntimeEvent = getRuntimeSessionModelExport('applyRuntimeEvent');
  const clearRuntimeSessionState = getRuntimeSessionModelExport('clearRuntimeSessionState');

  const state = createRuntimeSessionState();
  applyRuntimeEvent(state, { type: 'area_entered', areaName: 'Overgrown', at: '2026-04-09T12:00:00.000Z' });

  clearRuntimeSessionState(state, {
    reason: 'game_closed',
    at: '2026-04-09T12:03:30.000Z'
  });

  assert.equal(state.currentInstance, null);
  assert.equal(state.instances.length, 0);
  assert.equal(state.summary.status, 'idle');
  assert.equal(state.summary.clearReason, 'game_closed');
  assert.equal(state.summary.clearedAt, '2026-04-09T12:03:30.000Z');
});

test('renderer stores runtime session payloads from map events for future dashboard use', () => {
  const calls = [];
  const state = {};
  const context = loadFunctions(['setRuntimeSessionState'], {
    state,
    renderRuntimeSessionState: () => calls.push(['renderRuntimeSessionState'])
  });
  const runtimeSession = {
    currentInstance: {
      areaName: 'Crimson Shores',
      status: 'active'
    },
    instances: [],
    totalActiveSeconds: 0,
    summary: {
      status: 'active',
      currentAreaName: 'Crimson Shores'
    }
  };

  context.setRuntimeSessionState(runtimeSession);

  assert.equal(state.runtimeSession.currentInstance.areaName, 'Crimson Shores');
  assert.deepEqual(calls, [['renderRuntimeSessionState']]);
});
