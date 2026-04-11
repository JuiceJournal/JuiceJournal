const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const STORE_MODEL_REQUEST = '../src/modules/mapResultStoreModel';
const desktopDir = path.resolve(__dirname, '..');
const appJsPath = path.join(desktopDir, 'src', 'app.js');
const mainJsPath = path.join(desktopDir, 'main.js');
const preloadJsPath = path.join(desktopDir, 'preload.js');

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadStoreModel() {
  try {
    return require(STORE_MODEL_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, STORE_MODEL_REQUEST)) {
      throw error;
    }

    return { __loadError: error };
  }
}

function getStoreModelExport(exportName) {
  const storeModel = loadStoreModel();

  if (storeModel.__loadError) {
    const { code, message } = storeModel.__loadError;
    assert.fail(
      `Expected desktop/src/modules/mapResultStoreModel.js to exist and export ${exportName}. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof storeModel[exportName],
    'function',
    `Expected mapResultStoreModel.${exportName} to be a function`
  );

  return storeModel[exportName];
}

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
      if (char === '\n') inLineComment = false;
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
      if (!escaped && char === '\'') inSingleQuote = false;
      escaped = !escaped && char === '\\';
      continue;
    }

    if (inDoubleQuote) {
      if (!escaped && char === '"') inDoubleQuote = false;
      escaped = !escaped && char === '\\';
      continue;
    }

    if (inTemplateString) {
      if (!escaped && char === '`') inTemplateString = false;
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
  const source = fs.readFileSync(appJsPath, 'utf8');
  const context = vm.createContext({
    console,
    ...contextOverrides
  });

  for (const functionName of functionNames) {
    const functionSource = extractFunctionSource(source, functionName, appJsPath);
    vm.runInContext(`${functionSource};\nthis.${functionName} = ${functionName};`, context);
  }

  return context;
}

test('map result store model prepends latest results and caps history length', () => {
  const appendMapResult = getStoreModelExport('appendMapResult');

  const results = appendMapResult(
    [{ id: 'old-1' }, { id: 'old-2' }],
    { id: 'new-1' },
    { maxResults: 2 }
  );

  assert.deepEqual(results.map((entry) => entry.id), ['new-1', 'old-1']);
});

test('map result store model filters results by farm type when requested', () => {
  const filterMapResults = getStoreModelExport('filterMapResults');
  const results = [
    { id: '1', farmType: 'Abyss' },
    { id: '2', farmType: 'Breach' }
  ];

  assert.deepEqual(
    filterMapResults(results, { farmType: 'Abyss' }).map((entry) => entry.id),
    ['1']
  );
});

test('renderer saves the latest map result and stores returned history in state', async () => {
  const state = {
    mapResults: []
  };
  const calls = [];
  const context = loadFunctions(['persistMapResultHistory'], {
    state,
    window: {
      electronAPI: {
        async saveMapResult(result) {
          calls.push(result);
          return [{ id: 'new-1' }, { id: 'old-1' }];
        }
      }
    }
  });

  await context.persistMapResultHistory({ id: 'new-1' });

  assert.deepEqual(calls, [{ id: 'new-1' }]);
  assert.deepEqual(state.mapResults, [{ id: 'new-1' }, { id: 'old-1' }]);
});

test('desktop preload exposes map-result persistence bridge methods', () => {
  const source = fs.readFileSync(preloadJsPath, 'utf8');

  assert.match(source, /saveMapResult:\s*\(result\)\s*=>\s*ipcRenderer\.invoke\('save-map-result',\s*result\)/);
  assert.match(source, /getMapResults:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('get-map-results'\)/);
});

test('desktop main process registers map-result save and list IPC handlers', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');

  assert.match(source, /ipcMain\.handle\('save-map-result'/);
  assert.match(source, /ipcMain\.handle\('get-map-results'/);
});
