const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const bugReportModel = require('../src/modules/bugReportModel');

const mainJsPath = path.join(__dirname, '..', 'main.js');
const mainSource = fs.readFileSync(mainJsPath, 'utf8');

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
  const context = vm.createContext({
    console: {
      log() { }
    },
    ...contextOverrides
  });

  for (const functionName of functionNames) {
    const functionSource = extractFunctionSource(mainSource, functionName, mainJsPath);
    vm.runInContext(`${functionSource};\nthis.${functionName} = ${functionName};`, context);
  }

  return context;
}

// Objects made inside the vm context have that realm's prototypes.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jj-data-management-'));
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

// Windows creates a directory junction without admin rights; elsewhere 'junction' makes a directory symlink.
function linkDirectory(t, target, link) {
  try {
    fs.symlinkSync(target, link, 'junction');
    return true;
  } catch (error) {
    t.skip(`this system cannot create a directory link (${error.code})`);
    return false;
  }
}

// The real dictionary; `t` itself is not extracted, because 'async function t' would match another function.
const translationsStart = mainSource.indexOf('const MAIN_PROCESS_TRANSLATIONS = {');
const MAIN_PROCESS_TRANSLATIONS = vm.runInNewContext(`(${mainSource.slice(
  translationsStart + 'const MAIN_PROCESS_TRANSLATIONS = '.length,
  mainSource.indexOf('\n};', translationsStart) + 2
)})`);

const DATA_FUNCTIONS = [
  'setAuditTrail',
  'getErrorLogPath',
  'recordError',
  'clearErrorLog',
  'getPathSize',
  'getLocalDataSummary',
  'openDataFolder',
  'clearLogs',
  'copyBugReportToClipboard'
];

const AUDIT_ENTRIES = [
  { id: 'a1', key: 'auditLogin', values: {}, level: 'info', createdAt: '2026-10-27T08:00:00.000Z' },
  { id: 'a2', key: 'auditDiagnosticsExported', values: { mode: 'safe' }, level: 'info', createdAt: '2026-10-27T08:10:00.000Z' },
  { id: 'a3', key: 'auditLogout', values: {}, level: 'info', createdAt: '2026-10-27T08:20:00.000Z' }
];

function loadDataManagement(t, { userData = makeTempDir(t), language = 'en' } = {}) {
  const calls = { dialog: [], send: [], openPath: [], clipboard: [], console: [] };
  const state = {
    answer: async () => ({ response: 1, checkboxChecked: false }),
    openPathResult: async () => ''
  };
  const settings = { language, auditTrail: AUDIT_ENTRIES.map((entry) => ({ ...entry })) };
  const store = {
    settings,
    get(key) {
      return settings[key];
    },
    set(key, value) {
      settings[key] = value;
    }
  };
  const mainWindow = {
    webContents: {
      send: (...args) => calls.send.push(args)
    }
  };
  const errorLogState = {
    writing: false,
    disabled: false,
    recent: new Map(),
    poePaths: new Set(['C:/x']),
    redactionTargets: []
  };
  const redactionTargets = errorLogState.redactionTargets;
  const spy = (method) => (...args) => calls.console.push([method, ...args]);

  const context = loadFunctions(DATA_FUNCTIONS, {
    fs,
    path,
    app: { getPath: () => userData },
    shell: {
      openPath: (target) => {
        calls.openPath.push(target);
        return state.openPathResult();
      }
    },
    dialog: {
      showMessageBox: (parent, options) => {
        calls.dialog.push([parent, options]);
        return state.answer();
      }
    },
    mainWindow,
    store,
    MAX_AUDIT_TRAIL_ENTRIES: 200,
    errorLogState,
    bugReport: { id: 4, text: 'old report', issueUrl: 'https://example.invalid/' },
    dataActionRunning: false,
    localDataSummaryLoad: null,
    clipboard: {
      writeText: (text) => calls.clipboard.push(text)
    },
    bugReportModel,
    ERROR_LOG_MAX_BYTES: 128 * 1024,
    ERROR_LOG_KEEP_LINES: 50,
    ERROR_DEDUPE_WINDOW_MS: 10 * 60_000,
    ERROR_DEDUPE_MAX_KEYS: 200,
    t(key) {
      const dictionary = MAIN_PROCESS_TRANSLATIONS[settings.language === 'tr' ? 'tr' : 'en'];
      if (!Object.prototype.hasOwnProperty.call(dictionary, key)) {
        throw new Error(`Missing main process translation: ${key}`);
      }
      return dictionary[key];
    },
    console: {
      log: spy('log'),
      warn: spy('warn'),
      error: spy('error')
    }
  });

  const logPath = path.join(userData, 'logs', 'errors.jsonl');
  return {
    context,
    calls,
    state,
    store,
    mainWindow,
    errorLogState,
    redactionTargets,
    userData,
    logPath,
    readLog: () => (fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : null)
  };
}

const TWO_ERROR_LINES = [
  JSON.stringify({ at: '2026-10-27T09:00:00.000Z', source: 'main', level: 'error', message: 'first failure' }),
  JSON.stringify({ at: '2026-10-27T09:05:00.000Z', source: 'renderer', level: 'warn', message: 'second failure' })
].join('\n') + '\n';

test('getPathSize adds up the files below a folder, reads a file and gives 0 for a missing path', async (t) => {
  const { context, userData } = loadDataManagement(t);
  writeFiles(userData, {
    'a.bin': Buffer.alloc(100),
    'one/two/b.bin': Buffer.alloc(50),
    'empty/.keep': ''
  });

  assert.equal(await context.getPathSize(userData), 150);
  assert.equal(await context.getPathSize(path.join(userData, 'one', 'two', 'b.bin')), 50);
  assert.equal(await context.getPathSize(path.join(userData, 'missing')), 0);
});

test('getPathSize does not follow a directory junction out of the folder', async (t) => {
  const { context, userData } = loadDataManagement(t);
  const outside = makeTempDir(t);
  writeFiles(outside, { 'big.bin': Buffer.alloc(10000) });
  writeFiles(userData, { 'own.bin': Buffer.alloc(30) });
  if (!linkDirectory(t, outside, path.join(userData, 'link'))) {
    return;
  }
  const lstatTargets = [];
  context.fs = {
    promises: {
      ...fs.promises,
      lstat: async (target) => {
        lstatTargets.push(target);
        return fs.promises.lstat(target);
      }
    }
  };

  assert.equal(await context.getPathSize(userData), 30);
  // The folder listing already marks the link, so it is skipped without a look at the link itself.
  assert.ok(!lstatTargets.includes(path.join(userData, 'link')));
  assert.equal(await context.getPathSize(path.join(userData, 'link')), 0);
  assert.ok(fs.existsSync(path.join(outside, 'big.bin')));
});

test('getPathSize walks one entry at a time with async calls only and skips what it cannot read', async (t) => {
  const { context, calls, userData } = loadDataManagement(t);
  writeFiles(userData, {
    'a.bin': Buffer.alloc(100),
    'locked.bin': Buffer.alloc(200),
    'sub/b.bin': Buffer.alloc(50),
    'sub/deeper/c.bin': Buffer.alloc(25),
    'denied/d.bin': Buffer.alloc(70)
  });
  const lockedPath = path.join(userData, 'locked.bin');
  const deniedPath = path.join(userData, 'denied');
  let running = 0;
  let mostRunning = 0;
  const track = (call) => async (...args) => {
    running += 1;
    mostRunning = Math.max(mostRunning, running);
    try {
      await new Promise((resolve) => setImmediate(resolve));
      return await call(...args);
    } finally {
      running -= 1;
    }
  };
  // No sync methods: a walk that used one would throw, count 0 and miss the expected total.
  context.fs = {
    promises: {
      lstat: track(async (target) => {
        if (target === lockedPath) {
          throw Object.assign(new Error(`EBUSY: resource busy or locked, lstat '${target}'`), { code: 'EBUSY' });
        }
        return fs.promises.lstat(target);
      }),
      readdir: track(async (target, options) => {
        if (target === deniedPath) {
          throw Object.assign(new Error(`EPERM: operation not permitted, scandir '${target}'`), { code: 'EPERM' });
        }
        return fs.promises.readdir(target, options);
      })
    }
  };

  assert.equal(await context.getPathSize(userData), 175);
  assert.equal(mostRunning, 1);
  // The error texts name the path; a log line would carry it into the error log and the bug report.
  assert.deepEqual(calls.console, []);
});

test('getLocalDataSummary gives the data folder and its size', async (t) => {
  const { context, userData } = loadDataManagement(t);
  writeFiles(userData, {
    'config.json': Buffer.alloc(120),
    'logs/errors.jsonl': Buffer.alloc(80),
    'Cache/Cache_Data/f_000001': Buffer.alloc(1000)
  });

  assert.deepEqual(plain(await context.getLocalDataSummary()), { folderPath: userData, totalBytes: 1200 });
});

test('getLocalDataSummary measures a data folder moved behind a junction but no link inside it', async (t) => {
  const tmp = makeTempDir(t);
  const realData = path.join(tmp, 'D-drive', 'Juice Journal');
  const outside = path.join(tmp, 'outside');
  const userData = path.join(tmp, 'Roaming', 'Juice Journal');
  writeFiles(realData, { 'config.json': Buffer.alloc(300) });
  writeFiles(outside, { 'big.bin': Buffer.alloc(10000) });
  fs.mkdirSync(path.dirname(userData), { recursive: true });
  if (!linkDirectory(t, realData, userData) || !linkDirectory(t, outside, path.join(realData, 'inner-link'))) {
    return;
  }
  const { context } = loadDataManagement(t, { userData });

  assert.deepEqual(plain(await context.getLocalDataSummary()), { folderPath: userData, totalBytes: 300 });
});

test('getLocalDataSummary measures the data folder itself when its real path cannot be read', async (t) => {
  const { context, calls, userData } = loadDataManagement(t);
  writeFiles(userData, { 'config.json': Buffer.alloc(42) });
  // Node's realpath fails on some RAM disks, virtual and network drives.
  context.fs = {
    promises: {
      ...fs.promises,
      realpath: async () => {
        throw Object.assign(new Error(`EISDIR: illegal operation on a directory, realpath '${userData}'`), { code: 'EISDIR' });
      }
    }
  };

  assert.deepEqual(plain(await context.getLocalDataSummary()), { folderPath: userData, totalBytes: 42 });
  assert.equal(context.localDataSummaryLoad, null);
  assert.deepEqual(calls.console, []);
});

test('getLocalDataSummary calls made during a walk share it, and the next call walks again', async (t) => {
  const { context, userData } = loadDataManagement(t);
  writeFiles(userData, { 'config.json': Buffer.alloc(64), 'logs/errors.jsonl': Buffer.alloc(36) });
  const root = await fs.promises.realpath(userData);
  const rootReads = [];
  context.fs = {
    promises: {
      ...fs.promises,
      realpath: async (target) => {
        rootReads.push(['realpath', target]);
        return fs.promises.realpath(target);
      },
      readdir: async (target, options) => {
        if (target === root) {
          rootReads.push(['readdir', target]);
        }
        return fs.promises.readdir(target, options);
      }
    }
  };

  const [first, second] = await Promise.all([context.getLocalDataSummary(), context.getLocalDataSummary()]);
  assert.deepEqual(plain(first), { folderPath: userData, totalBytes: 100 });
  assert.deepEqual(plain(second), plain(first));
  assert.deepEqual(rootReads.map(([kind]) => kind), ['realpath', 'readdir']);
  assert.equal(context.localDataSummaryLoad, null);

  writeFiles(userData, { 'more.bin': Buffer.alloc(11) });
  assert.deepEqual(plain(await context.getLocalDataSummary()), { folderPath: userData, totalBytes: 111 });
  assert.deepEqual(rootReads.map(([kind]) => kind), ['realpath', 'readdir', 'realpath', 'readdir']);
});

test('openDataFolder opens only the data folder and answers with a flag, never the OS error text', async (t) => {
  const { context, calls, state, userData } = loadDataManagement(t);

  assert.deepEqual(plain(await context.openDataFolder()), { opened: true });
  assert.deepEqual(calls.openPath, [userData]);

  state.openPathResult = async () => 'Failed to open path C:\\Users\\Alice\\AppData\\Roaming\\Juice Journal';
  const failed = plain(await context.openDataFolder());
  assert.deepEqual(failed, { opened: false });
  assert.ok(!JSON.stringify(failed).includes('Alice'));

  state.openPathResult = async () => {
    throw new Error('openPath failed for C:\\Users\\Alice');
  };
  assert.deepEqual(plain(await context.openDataFolder()), { opened: false });
  assert.equal(calls.openPath.length, 3);
});

test('Clear logs asks first, and Cancel keeps both logs and the report', async (t) => {
  const { context, calls, store, mainWindow, userData, readLog } = loadDataManagement(t);
  writeFiles(userData, { 'logs/errors.jsonl': TWO_ERROR_LINES });

  assert.deepEqual(plain(await context.clearLogs()), { canceled: true });

  assert.equal(store.settings.auditTrail.length, 3);
  assert.deepEqual(calls.send, []);
  assert.equal(readLog(), TWO_ERROR_LINES);
  assert.deepEqual(plain(context.copyBugReportToClipboard(4)), { copied: true });
  assert.deepEqual(calls.clipboard, ['old report']);
  assert.equal(context.dataActionRunning, false);

  assert.equal(calls.dialog.length, 1);
  const [parent, options] = calls.dialog[0];
  assert.equal(parent, mainWindow);
  assert.deepEqual(plain(options), {
    type: 'warning',
    buttons: ['Clear', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: MAIN_PROCESS_TRANSLATIONS.en.dataClearLogsTitle,
    message: MAIN_PROCESS_TRANSLATIONS.en.dataClearLogsMessage,
    detail: MAIN_PROCESS_TRANSLATIONS.en.dataClearLogsDetail
  });
  for (const text of [...options.buttons, options.title, options.message, options.detail]) {
    assert.ok(!text.includes(userData), `${text} must not name the data folder`);
  }
});

test('the Clear logs confirm follows the app language', async (t) => {
  const { context, calls } = loadDataManagement(t, { language: 'tr' });

  assert.deepEqual(plain(await context.clearLogs()), { canceled: true });

  const options = plain(calls.dialog[0][1]);
  assert.deepEqual(options.buttons, ['Temizle', 'Iptal']);
  assert.equal(options.title, MAIN_PROCESS_TRANSLATIONS.tr.dataClearLogsTitle);
  assert.equal(options.message, MAIN_PROCESS_TRANSLATIONS.tr.dataClearLogsMessage);
  assert.equal(options.detail, MAIN_PROCESS_TRANSLATIONS.tr.dataClearLogsDetail);
});

test('Clear clears the activity log and deletes the error log, and nothing else', async (t) => {
  const { context, calls, state, store, errorLogState, redactionTargets, userData, logPath } = loadDataManagement(t);
  writeFiles(userData, {
    'logs/errors.jsonl': TWO_ERROR_LINES,
    'config.json': '{"language":"en"}',
    'profiles/p1/journal.json': '{"sessions":[]}'
  });
  errorLogState.recent.set('main|error|first failure', { at: Date.now(), repeats: 2 });
  state.answer = async () => ({ response: 0, checkboxChecked: false });

  assert.deepEqual(plain(await context.clearLogs()), { cleared: true });

  // The clearing itself writes no activity entry.
  assert.deepEqual(plain(store.settings.auditTrail), []);
  assert.deepEqual(plain(calls.send), [['audit-trail-updated', { entries: [] }]]);
  assert.equal(fs.existsSync(logPath), false);
  assert.ok(fs.statSync(path.join(userData, 'logs')).isDirectory());
  assert.equal(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'), '{"language":"en"}');
  assert.equal(fs.readFileSync(path.join(userData, 'profiles', 'p1', 'journal.json'), 'utf8'), '{"sessions":[]}');
  assert.equal(errorLogState.recent.size, 0);
  assert.deepEqual([...errorLogState.poePaths], ['C:/x']);
  assert.equal(errorLogState.redactionTargets, redactionTargets);
  assert.equal(errorLogState.disabled, false);
  assert.equal(context.bugReport, null);
  assert.deepEqual(plain(context.copyBugReportToClipboard(4)), { stale: true });
  assert.deepEqual(calls.clipboard, []);
  assert.equal(context.dataActionRunning, false);
  assert.deepEqual(calls.console, []);
});

test('Clear works before any error was logged', async (t) => {
  const { context, state, logPath } = loadDataManagement(t);
  state.answer = async () => ({ response: 0, checkboxChecked: false });

  assert.deepEqual(plain(await context.clearLogs()), { cleared: true });
  assert.equal(fs.existsSync(logPath), false);
});

test('a second Clear logs while the first is open is told it is busy', async (t) => {
  const { context, calls, state } = loadDataManagement(t);
  let answer;
  state.answer = () => new Promise((resolve) => {
    answer = resolve;
  });

  const first = context.clearLogs();
  assert.equal(context.dataActionRunning, true);
  assert.deepEqual(plain(await context.clearLogs()), { busy: true });
  assert.equal(calls.dialog.length, 1);

  answer({ response: 1, checkboxChecked: false });
  assert.deepEqual(plain(await first), { canceled: true });
  assert.equal(context.dataActionRunning, false);

  state.answer = async () => ({ response: 1, checkboxChecked: false });
  assert.deepEqual(plain(await context.clearLogs()), { canceled: true });
  assert.equal(calls.dialog.length, 2);
});

test('a confirm that fails clears nothing and logs nothing', async (t) => {
  const { context, calls, state, store, userData, readLog } = loadDataManagement(t);
  writeFiles(userData, { 'logs/errors.jsonl': TWO_ERROR_LINES });

  for (const answer of [
    async () => {
      throw new Error('showMessageBox failed for C:\\Users\\Alice');
    },
    () => {
      throw new TypeError('Invalid options');
    }
  ]) {
    state.answer = answer;
    assert.deepEqual(plain(await context.clearLogs()), { cleared: false, failed: ['confirm'] });
    assert.equal(context.dataActionRunning, false);
  }

  assert.equal(store.settings.auditTrail.length, 3);
  assert.equal(readLog(), TWO_ERROR_LINES);
  assert.equal(context.bugReport.id, 4);
  assert.deepEqual(calls.send, []);
  assert.deepEqual(calls.console, []);
});

test('Clear reports a step that failed by name only, and still clears the other log', async (t) => {
  const locked = loadDataManagement(t);
  writeFiles(locked.userData, { 'logs/errors.jsonl': TWO_ERROR_LINES });
  locked.state.answer = async () => ({ response: 0, checkboxChecked: false });
  locked.context.fs = {
    ...fs,
    promises: {
      ...fs.promises,
      rm: async () => {
        throw Object.assign(
          new Error("EPERM, Permission denied: 'C:\\Users\\Alice\\AppData\\Roaming\\Juice Journal\\logs\\errors.jsonl'"),
          { code: 'EPERM' }
        );
      }
    }
  };

  const result = plain(await locked.context.clearLogs());
  assert.deepEqual(result, { cleared: false, failed: ['errorLog'] });
  assert.ok(!JSON.stringify(result).includes('Alice'));
  assert.ok(!JSON.stringify(result).includes('errors.jsonl'));
  assert.deepEqual(plain(locked.store.settings.auditTrail), []);
  assert.equal(locked.readLog(), TWO_ERROR_LINES);
  assert.equal(locked.errorLogState.disabled, false);
  assert.equal(locked.context.bugReport, null);
  assert.equal(locked.context.dataActionRunning, false);

  const readOnlyStore = loadDataManagement(t);
  writeFiles(readOnlyStore.userData, { 'logs/errors.jsonl': TWO_ERROR_LINES });
  readOnlyStore.state.answer = async () => ({ response: 0, checkboxChecked: false });
  readOnlyStore.store.set = () => {
    throw new Error("EPERM: operation not permitted, open 'C:\\Users\\Alice\\AppData\\Roaming\\Juice Journal\\config.json'");
  };

  assert.deepEqual(plain(await readOnlyStore.context.clearLogs()), { cleared: false, failed: ['activityLog'] });
  assert.equal(fs.existsSync(readOnlyStore.logPath), false);
  assert.equal(readOnlyStore.context.bugReport, null);
  assert.deepEqual(readOnlyStore.calls.console, []);
});

test('the console tee cannot write the error log back during the clear, and logs again right after', async (t) => {
  const { context, calls, state, errorLogState, logPath, readLog } = loadDataManagement(t);
  state.answer = async () => ({ response: 0, checkboxChecked: false });
  context.recordError('main', 'error', 'repeat me');
  assert.equal(readLog().split('\n').filter(Boolean).length, 1);

  context.fs = {
    ...fs,
    promises: {
      ...fs.promises,
      rm: async (...args) => {
        assert.equal(errorLogState.disabled, true);
        // The single-action guard holds until the clear is done, not only while the confirm is open.
        assert.equal(context.dataActionRunning, true);
        assert.deepEqual(plain(await context.clearLogs()), { busy: true });
        context.recordError('main', 'error', 'before the delete');
        await fs.promises.rm(...args);
        // Without the guard this line would create the file again.
        context.recordError('main', 'error', 'after the delete');
      }
    }
  };

  assert.deepEqual(plain(await context.clearLogs()), { cleared: true });
  assert.equal(fs.existsSync(logPath), false);
  assert.equal(calls.dialog.length, 1);

  // A message seen just before the clear is written again at once, not only counted.
  context.recordError('main', 'error', 'repeat me');
  const lines = readLog().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].message, 'repeat me');
  assert.equal(lines[0].repeats, undefined);

  // Dropped during the clear, so not remembered as seen either.
  context.recordError('main', 'error', 'after the delete');
  assert.deepEqual(readLog().split('\n').filter(Boolean).map((line) => JSON.parse(line).message), ['repeat me', 'after the delete']);
});

test('clearErrorLog leaves logging off when its caller had turned it off', async (t) => {
  const { context, errorLogState, userData, logPath } = loadDataManagement(t);
  writeFiles(userData, { 'logs/errors.jsonl': TWO_ERROR_LINES });

  errorLogState.disabled = true;
  assert.equal(await context.clearErrorLog(), true);
  assert.equal(errorLogState.disabled, true);
  assert.equal(fs.existsSync(logPath), false);

  errorLogState.disabled = false;
  context.fs = {
    ...fs,
    promises: {
      ...fs.promises,
      rm: async () => {
        throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      }
    }
  };
  assert.equal(await context.clearErrorLog(), false);
  assert.equal(errorLogState.disabled, false);
});
