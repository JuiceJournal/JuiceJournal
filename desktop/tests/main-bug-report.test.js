const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const bugReportModel = require('../src/modules/bugReportModel');

const mainJsPath = path.join(__dirname, '..', 'main.js');
const preloadJsPath = path.join(__dirname, '..', 'preload.js');

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
      log() { }
    },
    ...contextOverrides
  });

  for (const functionName of functionNames) {
    const functionSource = extractFunctionSource(source, functionName, mainJsPath);
    vm.runInContext(`${functionSource};\nthis.${functionName} = ${functionName};`, context);
  }

  return context;
}

const USER_DATA = 'C:\\Users\\Alice\\AppData\\Roaming\\Juice Journal';
const LOG_PATH = `${USER_DATA}\\logs\\errors.jsonl`;
const ERROR_LOG_MAX_BYTES = 128 * 1024;

function enoent(file) {
  return Object.assign(new Error(`ENOENT: no such file or directory, open '${file}'`), { code: 'ENOENT' });
}

// In-memory fs: only the calls the error log may use. openSync or createWriteStream would fail the test.
function createFakeFs(state) {
  return {
    mkdirSync(dir, options) {
      state.mkdirCalls.push([dir, { ...options }]);
    },
    appendFileSync(file, data) {
      state.appendCalls += 1;
      state.files.set(file, (state.files.get(file) || '') + data);
    },
    statSync(file) {
      if (!state.files.has(file)) {
        throw enoent(file);
      }
      return { size: Buffer.byteLength(state.files.get(file)) };
    },
    readFileSync(file) {
      if (!state.files.has(file)) {
        throw enoent(file);
      }
      return state.files.get(file);
    },
    writeFileSync(file, data) {
      state.files.set(file, data);
    }
  };
}

function loadErrorLog({ settings = {}, files = {}, userInfo = () => ({ username: 'Alice' }) } = {}) {
  const state = {
    files: new Map(Object.entries(files)),
    mkdirCalls: [],
    appendCalls: 0,
    storeReads: 0,
    storeError: null,
    settings,
    consoleCalls: [],
    order: [],
    now: Date.parse('2026-10-27T10:00:00.000Z')
  };
  const errorLogState = { writing: false, recent: new Map(), poePaths: new Set(), redactionTargets: [] };
  const app = Object.assign(new EventEmitter(), {
    getPath: () => USER_DATA,
    getAppPath: () => 'D:\\Dev\\desktop'
  });
  const spy = (method) => (...args) => {
    state.order.push(`original ${method}`);
    state.consoleCalls.push([method, ...args]);
  };
  const context = loadFunctions([
    'getErrorLogPath',
    'refreshRedactionTargets',
    'recordError',
    'readRecentErrors',
    'installErrorCapture',
    'attachRendererErrorCapture'
  ], {
    fs: createFakeFs(state),
    path: path.win32,
    os: {
      homedir: () => 'C:\\Users\\Alice',
      userInfo
    },
    app,
    store: {
      get store() {
        state.storeReads += 1;
        if (state.storeError) {
          throw state.storeError;
        }
        return state.settings;
      }
    },
    process: new EventEmitter(),
    console: {
      log() { },
      warn: spy('warn'),
      error: spy('error')
    },
    bugReportModel,
    errorLogState,
    ERROR_LOG_MAX_BYTES,
    ERROR_LOG_KEEP_LINES: 50,
    ERROR_DEDUPE_WINDOW_MS: 10 * 60_000,
    ERROR_DEDUPE_MAX_KEYS: 200,
    DEFAULT_API_URL: 'http://localhost:3001',
    Date: class extends Date {
      constructor(...args) {
        super(...(args.length > 0 ? args : [state.now]));
      }

      static now() {
        return state.now;
      }
    }
  });

  return {
    context,
    state,
    errorLogState,
    app,
    readLines: () => (state.files.get(LOG_PATH) || '').split('\n').filter(Boolean).map((line) => JSON.parse(line))
  };
}

test('getErrorLogPath points at logs/errors.jsonl in the user data folder', () => {
  const { context } = loadErrorLog();

  assert.equal(context.getErrorLogPath(), LOG_PATH);
});

test('recordError appends one JSON line and creates the logs folder', () => {
  const { context, state, readLines } = loadErrorLog();

  context.recordError('main', 'error', new Error('boom'));

  const lines = readLines();
  assert.equal(lines.length, 1);
  assert.equal(lines[0].at, '2026-10-27T10:00:00.000Z');
  assert.equal(lines[0].source, 'main');
  assert.equal(lines[0].level, 'error');
  assert.equal(lines[0].message, 'boom');
  assert.ok(state.files.get(LOG_PATH).endsWith('}\n'));
  assert.deepEqual(state.mkdirCalls, [[`${USER_DATA}\\logs`, { recursive: true }]]);
});

test('recordError writes no account, character, league, server or path it knows about', () => {
  const { context, state, readLines } = loadErrorLog({
    settings: {
      apiUrl: 'https://jj.example.org',
      poePath: 'D:\\Games\\Path of Exile 2\\logs\\Client.txt',
      defaultLeaguePoe2: 'Guild Fun (PL12345)',
      // Older versions kept one league for both games; league lookups still fall back to it.
      defaultLeague: 'Old Crew (PL4242)',
      localProfiles: { p1: { id: 'p1', accountName: 'SecretAccount', poeSub: 'sub-9f8e7d6c' } },
      'lastKnownAccountState:p1': {
        accountName: 'SecretAccount',
        characters: [{ name: 'HiddenCharName', league: 'Other Fun (PL777)' }]
      }
    }
  });

  context.refreshRedactionTargets();
  const readsAfterRefresh = state.storeReads;
  context.recordError('main', 'warn', [
    'Failed for SecretAccount (sub-9f8e7d6c) as HiddenCharName in Guild Fun (PL12345), Other Fun (PL777)',
    'and Old Crew (PL4242) via https://jj.example.org/api reading D:\\Games\\Path of Exile 2\\logs\\Client.txt',
    `and ${USER_DATA}\\config.json for Alice`
  ]);

  const [line] = readLines();
  assert.equal(
    line.message,
    'Failed for <account> (<account>) as <character> in <private league>, <private league> and <private league> '
    + 'via <server>/api reading <poe>\\logs\\Client.txt and <userData>\\config.json for <user>'
  );
  for (const secret of ['SecretAccount', 'sub-9f8e7d6c', 'HiddenCharName', 'Guild Fun', 'PL12345', 'Other Fun', 'PL777',
    'Old Crew', 'PL4242', 'jj.example.org', 'D:\\Games', 'Juice Journal', 'Alice']) {
    assert.ok(!state.files.get(LOG_PATH).includes(secret), `${secret} must not be written`);
  }
  // Redaction uses the cached targets; recording never parses config.json.
  assert.equal(state.storeReads, readsAfterRefresh);
});

test('refreshRedactionTargets keeps every Client.txt folder seen in this run', () => {
  const { context, state } = loadErrorLog({ settings: { poePath: 'E:\\PoE1\\logs\\Client.txt' } });

  context.refreshRedactionTargets();
  state.settings = { poePath: 'F:\\PoE2\\logs\\Client.txt' };
  const targets = context.refreshRedactionTargets();

  assert.deepEqual(
    targets.filter((target) => target.label === '<poe>').map((target) => target.value).sort(),
    ['E:\\PoE1', 'F:\\PoE2']
  );
  assert.equal(bugReportModel.redactText('E:\\PoE1\\logs\\Client.txt missing', targets), '<poe>\\logs\\Client.txt missing');
});

test('refreshRedactionTargets survives missing user info, skips the default server and keeps old targets on error', () => {
  const { context, state, errorLogState } = loadErrorLog({
    settings: { apiUrl: 'http://localhost:3001' },
    userInfo: () => {
      throw new Error('no user info');
    }
  });

  const targets = context.refreshRedactionTargets();
  assert.deepEqual(targets.map((target) => target.label).sort(), ['<app>', '<userData>', '~']);

  state.storeError = new Error('config.json is locked');
  assert.equal(context.refreshRedactionTargets(), targets);
  assert.equal(errorLogState.redactionTargets, targets);
});

test('recordError writes a repeated message once per window and counts the repeats', () => {
  const single = loadErrorLog();
  single.context.recordError('main', 'error', 'A');
  single.context.recordError('main', 'error', 'A');
  assert.equal(single.readLines().length, 1);

  const { context, state, readLines } = loadErrorLog();
  context.recordError('main', 'error', 'A');
  context.recordError('main', 'error', 'B');
  context.recordError('main', 'error', 'A');
  context.recordError('main', 'error', 'B');
  assert.deepEqual(readLines().map((line) => line.message), ['A', 'B']);

  state.now += 10 * 60_000 + 1;
  context.recordError('main', 'error', 'A');
  const lines = readLines();
  assert.equal(lines.length, 3);
  assert.equal(lines[2].message, 'A');
  assert.equal(lines[2].repeats, 1);
  assert.equal(lines[0].repeats, undefined);
});

test('recordError remembers the newest 200 messages for the repeat check', () => {
  const { context, errorLogState, readLines } = loadErrorLog();

  for (let index = 0; index < 250; index += 1) {
    context.recordError('main', 'warn', `message ${index}`);
  }

  assert.equal(errorLogState.recent.size, 200);
  assert.equal(errorLogState.recent.has('main|warn|message 49'), false);
  assert.equal(errorLogState.recent.has('main|warn|message 50'), true);
  assert.equal(readLines().length, 250);

  // Still remembered, so it only counts as a repeat.
  context.recordError('main', 'warn', 'message 249');
  assert.equal(readLines().length, 250);
});

test('recordError trims the file to the newest lines once it passes 128 KB', () => {
  const filler = `${JSON.stringify({ at: 'old', source: 'main', level: 'warn', message: 'x'.repeat(540) })}\n`;
  const { context, state, readLines } = loadErrorLog({ files: { [LOG_PATH]: filler.repeat(300) } });

  context.recordError('renderer', 'error', 'newest');

  const lines = readLines();
  assert.ok(lines.length <= 50);
  assert.ok(Buffer.byteLength(state.files.get(LOG_PATH)) <= ERROR_LOG_MAX_BYTES / 2);
  assert.equal(lines.at(-1).message, 'newest');
});

test('recordError never throws when the file cannot be written', () => {
  const { context, state, errorLogState, readLines } = loadErrorLog();
  const fsContext = context.fs;
  const append = fsContext.appendFileSync;

  fsContext.appendFileSync = () => {
    throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
  };
  assert.doesNotThrow(() => context.recordError('main', 'error', 'locked'));
  assert.equal(errorLogState.writing, false);

  fsContext.appendFileSync = append;
  context.recordError('main', 'error', 'next');
  assert.deepEqual(readLines().map((line) => line.message), ['next']);
  assert.equal(state.appendCalls, 1);
});

test('a console call made while recording reaches the console but is not recorded again', () => {
  const { context, state } = loadErrorLog();
  context.installErrorCapture();
  const append = context.fs.appendFileSync;
  context.fs.appendFileSync = (...args) => {
    append(...args);
    context.console.error('nested');
  };

  context.console.error('outer');

  assert.equal(state.appendCalls, 1);
  assert.deepEqual(state.consoleCalls, [['error', 'outer'], ['error', 'nested']]);
});

test('the console tee prints first, then records warnings and errors by kind', () => {
  const { context, state, readLines } = loadErrorLog();
  context.installErrorCapture();
  const append = context.fs.appendFileSync;
  context.fs.appendFileSync = (...args) => {
    state.order.push('append');
    append(...args);
  };

  context.console.warn('careful');
  assert.deepEqual(state.order, ['original warn', 'append']);

  context.console.error("Error occurred in handler for 'get-recent-loot':", new Error('Local desktop sign-in is required'));
  context.console.error('(node:42) UnhandledPromiseRejectionWarning: Error: boom\n    at f (a.js:1:1)');
  context.console.error('(node:42) UnhandledPromiseRejectionWarning: Unhandled promise rejection. This error originated ...');

  assert.deepEqual(readLines().map(({ source, level, message }) => [source, level, message]), [
    ['main', 'warn', 'careful'],
    ['main', 'warn', "Error occurred in handler for 'get-recent-loot': Local desktop sign-in is required"],
    ['main', 'error', 'UnhandledPromiseRejectionWarning: Error: boom']
  ]);
  assert.equal(state.consoleCalls.length, 4);
});

test('installErrorCapture loads the names to redact before it records anything', () => {
  const { context, readLines } = loadErrorLog({
    settings: {
      poePath: 'E:\\Games\\Path of Exile\\logs\\Client.txt',
      'lastKnownAccountState:p1': { characters: [{ name: 'HiddenCharName' }] }
    }
  });

  // No refreshRedactionTargets() here: an error during the startup migrations comes before any other refresh.
  context.installErrorCapture();
  context.console.error('Startup failed for HiddenCharName in E:\\Games\\Path of Exile\\logs\\Client.txt');

  assert.equal(readLines()[0].message, 'Startup failed for <character> in <poe>\\logs\\Client.txt');
});

test('installErrorCapture only watches uncaught exceptions and leaves rejections to the console', () => {
  const { context, readLines } = loadErrorLog();
  context.installErrorCapture();

  assert.equal(context.process.listenerCount('uncaughtExceptionMonitor'), 1);
  assert.equal(context.process.listenerCount('uncaughtException'), 0);
  assert.equal(context.process.listenerCount('unhandledRejection'), 0);

  context.process.emit('uncaughtExceptionMonitor', new Error('crash'), 'uncaughtException');
  assert.deepEqual(readLines().map(({ source, level, message }) => [source, level, message]), [
    ['process', 'fatal', 'crash']
  ]);
});

test('installErrorCapture records crashed processes but not clean or killed exits', () => {
  const { context, app, readLines } = loadErrorLog();
  context.installErrorCapture();

  app.emit('render-process-gone', {}, {}, { reason: 'clean-exit', exitCode: 0 });
  app.emit('render-process-gone', {}, {}, { reason: 'killed', exitCode: 1 });
  app.emit('render-process-gone', {}, {}, { reason: 'crashed', exitCode: 3 });
  app.emit('child-process-gone', {}, { type: 'Utility', reason: 'clean-exit', exitCode: 0 });
  app.emit('child-process-gone', {}, { type: 'GPU', reason: 'killed', exitCode: 1 });
  app.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed', exitCode: 5 });

  assert.deepEqual(readLines().map(({ source, level, message }) => [source, level, message]), [
    ['process', 'error', 'Renderer process gone: crashed (exit 3)'],
    ['process', 'error', 'GPU process gone: crashed (exit 5)']
  ]);
});

test('attachRendererErrorCapture records renderer errors with the file name only', () => {
  const { context, readLines } = loadErrorLog();
  const windowRef = { webContents: new EventEmitter() };

  context.attachRendererErrorCapture(windowRef, 'renderer');
  const [listener] = windowRef.webContents.listeners('console-message');
  assert.equal(listener.length, 1);

  windowRef.webContents.emit('console-message', { level: 'warning', message: 'just a warning' });
  windowRef.webContents.emit('console-message', {
    level: 'error',
    message: 'Uncaught TypeError: a is not a function',
    sourceId: 'file:///D:/Dev/desktop/src/app.js',
    lineNumber: 10
  });
  windowRef.webContents.emit('console-message', {
    level: 'error',
    message: "Uncaught (in promise) Error: Error invoking remote method 'get-sessions': Error: y",
    sourceId: 'file:///D:/Dev/desktop/src/app.js',
    lineNumber: 0
  });

  const lines = readLines();
  assert.equal(lines.length, 1);
  assert.equal(lines[0].source, 'renderer');
  assert.equal(lines[0].message, 'Uncaught TypeError: a is not a function (app.js:10)');
});

test('readRecentErrors reads the newest entries first and tolerates a missing or damaged file', () => {
  assert.deepEqual(Array.from(loadErrorLog().context.readRecentErrors()), []);

  const { context } = loadErrorLog({
    files: {
      [LOG_PATH]: [
        JSON.stringify({ at: 'a', source: 'main', level: 'warn', message: 'old' }),
        '{"at":"b","mess',
        JSON.stringify({ at: 'c', source: 'renderer', level: 'error', message: 'new' })
      ].join('\n')
    }
  });

  assert.deepEqual(Array.from(context.readRecentErrors(), (entry) => entry.message), ['new', 'old']);
  assert.deepEqual(Array.from(context.readRecentErrors(1), (entry) => entry.message), ['new']);
});

test('main.js sets up the error log right after the store, before any startup migration', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');
  const installCall = source.indexOf('installErrorCapture();');

  assert.doesNotMatch(extractFunctionSource(source, 'recordError', mainJsPath), /console\./);
  assert.ok(source.indexOf('const store = new Store(') < installCall);
  assert.ok(installCall < source.indexOf('migrateLanguageSetting();'));
  // installErrorCapture runs at load time, so everything it touches must be declared above the call.
  for (const declaration of [
    "const bugReportModel = require('./src/modules/bugReportModel')",
    'const DEFAULT_API_URL',
    'const ERROR_LOG_MAX_BYTES',
    'const ERROR_LOG_KEEP_LINES',
    'const ERROR_DEDUPE_WINDOW_MS',
    'const ERROR_DEDUPE_MAX_KEYS',
    'const errorLogState'
  ]) {
    const index = source.indexOf(declaration);
    assert.notEqual(index, -1, `${declaration} should exist`);
    assert.ok(index < installCall, `${declaration} should come before installErrorCapture();`);
  }
});

test('main.js refreshes the redaction targets wherever new names or paths arrive', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');
  const setupLogParser = extractFunctionSource(source, 'setupLogParser', mainJsPath);

  assert.ok(setupLogParser.indexOf('refreshRedactionTargets();') !== -1);
  assert.ok(setupLogParser.indexOf('refreshRedactionTargets();') < setupLogParser.indexOf('new LogParser('));
  assert.match(
    source,
    /ipcMain\.handle\('set-settings', \(event, settings\) => \{\s*try \{\s*return applyDesktopSettings\(settings\);\s*\} finally \{[^}]*refreshRedactionTargets\(\);\s*\}/
  );
  assert.match(source, /const profile = await signInWithPoe\(\);\s*refreshRedactionTargets\(\);/);
  assert.match(source, /refreshRedactionTargets\(\);\s*console\.warn\('Path of Exile sign-in failed', error\);/);
  assert.match(source, /await reconnectPoeDevice\(\);[\s\S]{0,120}catch \(error\) \{\s*console\.warn\('Path of Exile reconnect failed', error\);/);
});

const SHA = '5edaf46b798668ca33b97b792fb7c17ae87627d4';

// Objects made inside the vm context have that realm's prototypes.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jj-bug-report-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeFiles(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
}

function loadReadSourceCommit(repoRoot, { isPackaged = false, fsCalls = [] } = {}) {
  const countingFs = new Proxy(fs, {
    get(target, name) {
      const value = target[name];
      return typeof value === 'function'
        ? (...args) => {
          fsCalls.push(name);
          return value.apply(target, args);
        }
        : value;
    }
  });

  return loadFunctions(['readSourceCommit'], {
    app: { isPackaged },
    fs: countingFs,
    path,
    __dirname: path.join(repoRoot, 'desktop')
  }).readSourceCommit;
}

test('readSourceCommit reads a source build commit from HEAD and a loose ref, in a git worktree too', (t) => {
  const tmp = makeTempDir(t);
  const fsCalls = [];

  writeFiles(tmp, {
    'branch/.git/HEAD': 'ref: refs/heads/master\n',
    'branch/.git/refs/heads/master': `${SHA}\n`,
    'detached/.git/HEAD': `${SHA}\n`,
    'main/.git/refs/heads/feature/bug-report': `${SHA}\n`,
    'main/.git/worktrees/wt/HEAD': 'ref: refs/heads/feature/bug-report\n',
    'main/.git/worktrees/wt/commondir': '../..\n',
    'wt/.git': `gitdir: ${path.join(tmp, 'main', '.git', 'worktrees', 'wt')}\n`
  });

  assert.equal(loadReadSourceCommit(path.join(tmp, 'branch'), { isPackaged: true, fsCalls })(), null);
  assert.deepEqual(fsCalls, []);
  assert.equal(loadReadSourceCommit(path.join(tmp, 'branch'))(), '5edaf46');
  assert.equal(loadReadSourceCommit(path.join(tmp, 'detached'))(), '5edaf46');
  assert.equal(loadReadSourceCommit(path.join(tmp, 'wt'))(), '5edaf46');
});

test('readSourceCommit gives null for packed refs, a missing or damaged .git and a ref outside the git folder', (t) => {
  const tmp = makeTempDir(t);

  writeFiles(tmp, {
    'packed/.git/HEAD': 'ref: refs/heads/master\n',
    'packed/.git/packed-refs': `${SHA} refs/heads/master\n`,
    'garbage/.git/HEAD': 'not a commit\n',
    'badfile/.git': 'something else\n',
    // Without the '..' check this would read the sha from escape/outside.
    'escape/.git/HEAD': 'ref: refs/../../outside\n',
    'escape/outside': `${SHA}\n`
  });

  for (const repo of ['packed', 'missing', 'garbage', 'badfile', 'escape']) {
    assert.equal(loadReadSourceCommit(path.join(tmp, repo))(), null, repo);
  }
});

const REPORT_FUNCTIONS = [
  'getActiveProfile',
  'getAuditTrail',
  'getMapResultsStoreKey',
  'getStoredMapResults',
  'normalizePoeVersion',
  'buildSafeSettingsSnapshot',
  'getErrorLogPath',
  'readRecentErrors',
  'refreshRedactionTargets',
  'collectBugReportInput',
  'getBugReport',
  'copyBugReportToClipboard',
  'isAllowedExternalAuthUrl',
  'openUrlWithWindowsFallback',
  'openBugReportIssue',
  'copyAndOpenBugReportIssue'
];

// A signed-in player with a custom server, a private league, characters, map results and activity values.
function secretSettings({ poePath }) {
  return {
    language: 'en',
    poeVersion: 'poe2',
    lastDetectedPoeVersion: 'poe2',
    onlineEnabled: false,
    apiUrl: 'https://jj.example.org',
    poePath,
    defaultLeaguePoe1: 'Guild Fun (PL12345)',
    localProfiles: { p1: { id: 'p1', accountName: 'SecretAccount', poeSub: 'sub-9f8e7d6c' } },
    activeProfileId: 'p1',
    'lastKnownAccountState:p1': {
      accountName: 'SecretAccount',
      characters: [{ name: 'HiddenCharName', league: 'Guild Fun (PL12345)' }]
    },
    'mapResults:p1': [1, 2, 3].map((index) => ({ id: `r${index}`, mapName: 'Secret Map' })),
    auditTrail: [
      { id: 'a1', key: 'auditLogin', values: { accountName: 'SecretAccount' }, level: 'info', createdAt: '2026-10-27T08:00:00.000Z' },
      { id: 'a2', key: 'auditMapResultSaved', values: { mapName: 'Secret Map' }, level: 'info', createdAt: '2026-10-27T08:30:00.000Z' }
    ]
  };
}

function loadReport(t, { settings = secretSettings, fsOverride = null } = {}) {
  const tmp = makeTempDir(t);
  const userData = path.join(tmp, 'userData');
  const poePath = path.join(tmp, 'Client.txt');
  writeFiles(tmp, { 'Client.txt': 'log' });

  const calls = [];
  const store = {
    settings: settings({ tmp, userData, poePath }),
    get(key) {
      return this.settings[key];
    },
    get store() {
      return this.settings;
    }
  };
  const forbidden = (name) => () => assert.fail(`${name} must not run for a bug report`);
  const context = loadFunctions(REPORT_FUNCTIONS, {
    fs: fsOverride || fs,
    path,
    URL,
    os: {
      homedir: () => 'C:\\Users\\Alice',
      userInfo: () => ({ username: 'Alice' }),
      release: () => '10.0.26300'
    },
    app: {
      getPath: () => userData,
      getAppPath: () => 'D:\\Dev\\desktop',
      getVersion: () => '1.0.0',
      isPackaged: false
    },
    process: {
      platform: 'win32',
      arch: 'x64',
      versions: { electron: '41.3.0', chrome: '146.0.0.0', node: '24.15.0' },
      env: {}
    },
    store,
    bugReportModel,
    errorLogState: { writing: false, recent: new Map(), poePaths: new Set(), redactionTargets: [] },
    DEFAULT_API_URL: 'http://localhost:3001',
    currentSession: null,
    bugReport: null,
    readSourceCommit: () => '5edaf46',
    clipboard: {
      writeText: (text) => calls.push(['clipboard', text])
    },
    shell: {
      openExternal: async (url) => {
        calls.push(['openExternal', url]);
      }
    },
    execFile: forbidden('execFile'),
    buildDiagnosticsPayload: forbidden('buildDiagnosticsPayload'),
    buildSensitiveSettingsSnapshot: forbidden('buildSensitiveSettingsSnapshot'),
    getJournalStore: forbidden('getJournalStore'),
    readJournal: forbidden('readJournal'),
    apiClient: { healthCheck: forbidden('apiClient.healthCheck') },
    assertDesktopUserAuthenticated: () => {
      throw new Error('Local desktop sign-in is required');
    }
  });

  return { context, calls, store, tmp, userData, poePath };
}

test('the bug report prints settings and counts but no names, leagues, server, paths or map names', (t) => {
  const { context, tmp, userData, poePath } = loadReport(t);
  // Logged before these names were known, so only the report-time redaction can remove them.
  writeFiles(userData, {
    'logs/errors.jsonl': `${JSON.stringify({
      at: '2026-10-27T09:00:00.000Z',
      source: 'main',
      level: 'error',
      message: `Failed for SecretAccount as HiddenCharName in Guild Fun (PL12345) reading ${userData}\\config.json`,
      frames: [`at load (${poePath.replace(/\\/g, '/')}:1:1)`]
    })}\n`
  });

  const report = plain(context.getBugReport());
  const lines = report.text.split('\n');

  assert.equal(report.reportId, 1);
  for (const line of [
    'Game: PoE2 (last detected: PoE2)',
    'Default leagues: PoE1 private league, PoE2 not set',
    'Online features: off, custom server: yes',
    'Client.txt found: yes',
    'Signed in (local profile): yes',
    'Local data: journal.json n/a, map results 3, activity entries 2',
    'Recent errors (newest first): 1',
    '[2026-10-27T09:00:00.000Z] main error: Failed for <account> as <character> in <private league> reading <userData>\\config.json',
    '    at load (<poe>/Client.txt:1:1)',
    'Recent activity (newest first): 2',
    '2026-10-27T08:30:00.000Z auditMapResultSaved',
    '2026-10-27T08:00:00.000Z auditLogin'
  ]) {
    assert.ok(lines.includes(line), `missing line: ${line}`);
  }
  for (const secret of ['SecretAccount', 'sub-9f8e7d6c', 'HiddenCharName', 'Secret Map', 'Guild Fun', 'PL12345',
    'jj.example.org', tmp, tmp.replace(/\\/g, '/')]) {
    assert.ok(!report.text.includes(secret), `${secret} must not be in the report`);
  }
});

test('the bug report works signed out and with the default server and no Client.txt', (t) => {
  const { context } = loadReport(t, {
    settings: ({ tmp }) => ({
      apiUrl: 'http://localhost:3001',
      poePath: path.join(tmp, 'missing', 'Client.txt'),
      activeProfileId: null
    })
  });

  const { text } = context.getBugReport();
  for (const line of [
    'Online features: off, custom server: no',
    'Client.txt found: no',
    'Signed in (local profile): no',
    'Local data: journal.json n/a, map results n/a, activity entries 0',
    'Recent errors (newest first): none'
  ]) {
    assert.ok(text.split('\n').includes(line), `missing line: ${line}`);
  }

  const noPath = loadReport(t, { settings: () => ({}) });
  assert.match(noPath.context.getBugReport().text, /^Client\.txt found: no$/m);
});

test('the bug report reads the journal size from the file system without opening the journal', (t) => {
  const journalReads = [];
  const fsOverride = Object.assign(Object.create(fs), {
    readFileSync(file, ...rest) {
      if (String(file).endsWith('journal.json')) {
        journalReads.push(file);
        throw new Error('the journal must not be read');
      }
      return fs.readFileSync(file, ...rest);
    }
  });
  const { context, userData } = loadReport(t, { fsOverride });
  writeFiles(userData, { 'profiles/p1/journal.json': 'x'.repeat(4096) });

  assert.match(context.getBugReport().text, /^Local data: journal\.json 4096 bytes, map results 3, activity entries 2$/m);
  assert.deepEqual(journalReads, []);
});

test('Copy and the issue button use the report last shown, and only with its id', async (t) => {
  const { context, calls, store } = loadReport(t);
  let builds = 0;
  const collect = context.collectBugReportInput;
  context.collectBugReportInput = () => {
    builds += 1;
    return collect();
  };

  // Nothing shown yet: no id can match.
  assert.deepEqual(plain(context.copyBugReportToClipboard(1)), { stale: true });
  assert.deepEqual(plain(await context.copyAndOpenBugReportIssue(1)), { stale: true });
  assert.equal(builds, 0);

  const first = context.getBugReport();
  store.settings = { ...store.settings, activeProfileId: null };
  assert.deepEqual(plain(context.copyBugReportToClipboard(first.reportId)), { copied: true });
  assert.deepEqual(calls, [['clipboard', first.text]]);
  assert.equal(builds, 1);

  for (const staleId of [first.reportId + 1, String(first.reportId), first.reportId + 0.5, undefined, null, Number.NaN, {}]) {
    assert.deepEqual(plain(context.copyBugReportToClipboard(staleId)), { stale: true });
    assert.deepEqual(plain(await context.copyAndOpenBugReportIssue(staleId)), { stale: true });
  }
  assert.equal(calls.length, 1);

  const second = context.getBugReport();
  assert.equal(second.reportId, first.reportId + 1);
  assert.match(second.text, /^Signed in \(local profile\): no$/m);
  assert.deepEqual(plain(context.copyBugReportToClipboard(first.reportId)), { stale: true });
  assert.deepEqual(plain(context.copyBugReportToClipboard(second.reportId)), { copied: true });
  assert.deepEqual(calls.at(-1), ['clipboard', second.text]);
  assert.equal(builds, 2);
});

test('the issue button copies the report before it opens the issue form with version and environment only', async (t) => {
  const { context, calls } = loadReport(t);
  const { text, reportId } = context.getBugReport();

  assert.deepEqual(plain(await context.copyAndOpenBugReportIssue(reportId)), { copied: true, opened: true });
  assert.deepEqual(calls.map(([kind]) => kind), ['clipboard', 'openExternal']);
  assert.equal(calls[0][1], text);

  const url = calls[1][1];
  const params = new URL(url).searchParams;
  assert.ok(url.startsWith(`${bugReportModel.REPORT_ISSUE_URL}?template=bug_report.yml`));
  assert.deepEqual([...params.keys()], ['template', 'version', 'environment']);
  assert.equal(params.get('version'), '1.0.0 (source build, 5edaf46)');
  assert.equal(params.get('environment'), 'Windows 10.0.26300 x64, Electron 41.3.0, PoE2, language en, online off');
});

function loadIssueOpener({ platform = 'win32', openExternalError = null, execFileError = null } = {}) {
  const calls = [];
  const context = loadFunctions(['isAllowedExternalAuthUrl', 'openUrlWithWindowsFallback', 'openBugReportIssue'], {
    bugReportModel,
    URL,
    process: { platform, env: {} },
    shell: {
      openExternal: async (url) => {
        calls.push(['openExternal', url]);
        if (openExternalError) {
          throw openExternalError;
        }
      }
    },
    execFile(command, args, options, callback) {
      calls.push(['execFile', command, options.env.JJ_OPEN_URL]);
      callback(execFileError);
    }
  });
  return { context, calls };
}

test('openBugReportIssue opens the issue form and falls back to PowerShell on Windows only', async () => {
  const url = bugReportModel.buildIssueUrl({ version: '1.0.0 (installed)', environment: 'Windows' });
  const failed = new Error('openExternal failed');

  const opened = loadIssueOpener();
  assert.deepEqual(plain(await opened.context.openBugReportIssue(url)), { opened: true });
  assert.deepEqual(opened.calls, [['openExternal', url]]);

  const fallback = loadIssueOpener({ openExternalError: failed });
  assert.deepEqual(plain(await fallback.context.openBugReportIssue(url)), { opened: true });
  assert.deepEqual(fallback.calls, [['openExternal', url], ['execFile', 'powershell', url]]);

  const bothFail = loadIssueOpener({ openExternalError: failed, execFileError: new Error('powershell failed') });
  assert.deepEqual(plain(await bothFail.context.openBugReportIssue(url)), {
    opened: false,
    url: bugReportModel.REPORT_ISSUE_URL
  });
  assert.equal(bothFail.calls.length, 2);

  const linux = loadIssueOpener({ platform: 'linux', openExternalError: failed });
  assert.deepEqual(plain(await linux.context.openBugReportIssue(url)), {
    opened: false,
    url: bugReportModel.REPORT_ISSUE_URL
  });
  assert.deepEqual(linux.calls, [['openExternal', url]]);
  assert.equal(linux.context.isAllowedExternalAuthUrl(url), false);
});

test('openBugReportIssue refuses any other address before it touches the shell', async () => {
  const { context, calls } = loadIssueOpener();
  const prefix = `${bugReportModel.REPORT_ISSUE_URL}?`;
  const atLimit = `${prefix}${'a'.repeat(2081 - prefix.length)}`;

  for (const url of [
    'https://github.com/evil/x/issues/new?a=1',
    `${bugReportModel.REPORT_ISSUE_URL}x?a`,
    bugReportModel.REPORT_ISSUE_URL,
    `${atLimit}a`,
    undefined
  ]) {
    await assert.rejects(context.openBugReportIssue(url), /Invalid bug report URL/);
  }
  assert.deepEqual(calls, []);

  assert.deepEqual(plain(await context.openBugReportIssue(atLimit)), { opened: true });
  assert.deepEqual(calls, [['openExternal', atLimit]]);
});

test('the bug report IPC takes no renderer input but the report id, and preload exposes exactly that', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');
  const preload = fs.readFileSync(preloadJsPath, 'utf8');
  const scopesStart = source.indexOf('const IPC_RENDERER_SCOPES');

  assert.match(source, /ipcMain\.handle\('get-bug-report', \(\) => getBugReport\(\)\);/);
  assert.match(source, /ipcMain\.handle\('copy-bug-report', \(event, reportId\) => copyBugReportToClipboard\(reportId\)\);/);
  assert.match(source, /ipcMain\.handle\('open-bug-report-issue', \(event, reportId\) => copyAndOpenBugReportIssue\(reportId\)\);/);
  assert.notEqual(scopesStart, -1);
  assert.doesNotMatch(source.slice(scopesStart, source.indexOf('});', scopesStart)), /bug-report/);
  assert.match(preload, /getBugReport: \(\) => ipcRenderer\.invoke\('get-bug-report'\),/);
  assert.match(preload, /copyBugReport: \(reportId\) => ipcRenderer\.invoke\('copy-bug-report', reportId\),/);
  assert.match(preload, /openBugReportIssue: \(reportId\) => ipcRenderer\.invoke\('open-bug-report-issue', reportId\),/);
});
