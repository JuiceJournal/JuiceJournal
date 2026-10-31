const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Conf = require('conf');

const bugReportModel = require('../src/modules/bugReportModel');
const localJournal = require('../src/modules/localJournalModel');

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

function loadDataManagement(t, {
  userData = makeTempDir(t),
  language = 'en',
  functions = DATA_FUNCTIONS,
  overrides = {}
} = {}) {
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

  const context = loadFunctions(functions, {
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
    },
    ...overrides
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

// conf without Electron: electron-store hands it the same options under these names.
class JournalStore extends Conf {
  constructor({ name, cwd }) {
    super({ configName: name, cwd });
  }
}

// The local time startNewJournal stamps on the broken file: 2026-10-28 19:05:09.
class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [2026, 9, 28, 19, 5, 9]));
  }
}

const JOURNAL_FUNCTIONS = ['getJournalStore', 'readJournal', 'writeJournal', 'getJournalStatus', 'startNewJournal'];
const BROKEN_JOURNAL = '{"sessions": [ {"id": "a", "mapName": "Secret Map", ';
const BROKEN_NAME = 'journal.broken-20261028-190509.json';
const UNREADABLE = { message: 'JOURNAL_UNREADABLE', code: 'JOURNAL_UNREADABLE' };
const UNREADABLE_WARNING = 'The journal of the signed-in profile cannot be read (invalid JSON); the file is left as it is';
const CONFIRM = async () => ({ response: 0, checkboxChecked: false });

// The journal functions over real files with conf, next to clearLogs for the shared one-action-at-a-time flag.
function loadJournalRecovery(t) {
  const profile = { current: { id: 'p1' } };
  const journalCalls = { audit: [], overlay: 0 };
  const loaded = loadDataManagement(t, {
    functions: [...DATA_FUNCTIONS, ...JOURNAL_FUNCTIONS],
    overrides: {
      Store: JournalStore,
      localJournal,
      getActiveProfile: () => profile.current,
      journalStore: null,
      unreadableJournalProfileId: null,
      currentSession: { id: 's1', status: 'active' },
      appendAuditTrail: (key) => journalCalls.audit.push(key),
      updateOverlayWindow: () => {
        journalCalls.overlay += 1;
      },
      Date: FixedDate
    }
  });
  const profileDir = path.join(loaded.userData, 'profiles', 'p1');
  return {
    ...loaded,
    profile,
    journalCalls,
    profileDir,
    journalPath: path.join(profileDir, 'journal.json'),
    writeJournalFile: (text) => writeFiles(profileDir, { 'journal.json': text }),
    warnings: () => loaded.calls.console.filter(([method]) => method === 'warn').map(([, ...args]) => args)
  };
}

test('a journal that is not valid JSON is unreadable, logged once per finding without its text, and left as it is', (t) => {
  const { context, calls, userData, journalPath, writeJournalFile, warnings } = loadJournalRecovery(t);
  writeJournalFile(BROKEN_JOURNAL);

  for (let read = 0; read < 3; read += 1) {
    assert.throws(() => context.readJournal(), UNREADABLE);
  }
  assert.deepEqual(plain(context.getJournalStatus()), { unreadable: true });
  assert.deepEqual(plain(context.getJournalStatus()), { unreadable: true });

  // The parse error quotes the file, so neither its text nor the path goes into the error log.
  assert.deepEqual(warnings(), [[UNREADABLE_WARNING]]);
  const logged = JSON.stringify(calls.console);
  for (const text of [userData, JSON.stringify(userData).slice(1, -1), 'Secret Map', 'SyntaxError']) {
    assert.ok(!logged.includes(text), `the warning must not contain ${text}`);
  }
  assert.equal(fs.readFileSync(journalPath, 'utf8'), BROKEN_JOURNAL);

  writeJournalFile('{"sessions":[]}');
  assert.deepEqual(plain(context.getJournalStatus()), { unreadable: false });
  assert.deepEqual(plain(context.readJournal()), { sessions: [] });

  // Broken again later is a new finding.
  writeJournalFile(BROKEN_JOURNAL);
  assert.deepEqual(plain(context.getJournalStatus()), { unreadable: true });
  assert.deepEqual(warnings(), [[UNREADABLE_WARNING], [UNREADABLE_WARNING]]);
});

test('a journal read once and broken afterwards is unreadable too', (t) => {
  const { context, writeJournalFile, warnings } = loadJournalRecovery(t);
  writeJournalFile('{"sessions":[{"id":"a","status":"completed"}]}');
  assert.deepEqual(plain(context.readJournal()), { sessions: [{ id: 'a', status: 'completed' }] });
  const cached = context.journalStore;

  writeJournalFile(BROKEN_JOURNAL);
  assert.throws(() => context.readJournal(), UNREADABLE);
  assert.equal(context.journalStore, cached);
  assert.deepEqual(plain(context.getJournalStatus()), { unreadable: true });
  assert.deepEqual(warnings(), [[UNREADABLE_WARNING]]);
});

test('a journal whose sessions are not a list is unreadable, so no write replaces them', (t) => {
  const { context, journalPath, writeJournalFile, warnings } = loadJournalRecovery(t);
  const handEdited = '{"sessions":{"a":{"id":"a","mapName":"Secret Map"}}}';
  writeJournalFile(handEdited);

  assert.throws(() => context.readJournal(), UNREADABLE);
  assert.deepEqual(plain(context.getJournalStatus()), { unreadable: true });
  assert.deepEqual(warnings(), [[
    'The journal of the signed-in profile cannot be read (its sessions are not a list); the file is left as it is'
  ]]);
  assert.equal(fs.readFileSync(journalPath, 'utf8'), handEdited);

  // A journal without sessions yet is an empty one.
  for (const empty of ['{}', '{"sessions":null}']) {
    writeJournalFile(empty);
    assert.deepEqual(plain(context.readJournal()), { sessions: [] });
  }
});

test('a missing journal, no signed-in profile and other read errors are not an unreadable journal', (t) => {
  const { context, profile, journalPath, warnings } = loadJournalRecovery(t);

  assert.deepEqual(plain(context.getJournalStatus()), { unreadable: false });
  assert.deepEqual(plain(context.readJournal()), { sessions: [] });
  assert.equal(fs.existsSync(journalPath), false);

  profile.current = null;
  assert.deepEqual(plain(context.getJournalStatus()), { unreadable: false });
  assert.throws(() => context.readJournal(), /Local desktop sign-in is required/);

  profile.current = { id: 'p1' };
  context.journalStore = null;
  const denied = Object.assign(
    new Error("EACCES: permission denied, open 'C:\\Users\\someone\\journal.json'"),
    { code: 'EACCES' }
  );
  context.Store = class {
    constructor() {
      throw denied;
    }
  };
  assert.throws(() => context.readJournal(), (error) => error === denied);
  assert.deepEqual(plain(context.getJournalStatus()), { unreadable: false });
  assert.deepEqual(warnings(), []);
});

test('Start a new journal asks first, keeps the broken file under a dated name and starts an empty journal', async (t) => {
  const {
    context, calls, state, mainWindow, userData, profileDir, journalPath, journalCalls, writeJournalFile
  } = loadJournalRecovery(t);
  writeJournalFile('{"sessions":[{"id":"s1","status":"active"}]}');
  context.readJournal();
  writeJournalFile(BROKEN_JOURNAL);
  assert.deepEqual(plain(context.getJournalStatus()), { unreadable: true });
  calls.console.length = 0;
  state.answer = CONFIRM;

  assert.deepEqual(plain(await context.startNewJournal()), { started: true });

  assert.equal(calls.dialog.length, 1);
  const [parent, options] = calls.dialog[0];
  assert.equal(parent, mainWindow);
  assert.deepEqual(plain(options), {
    type: 'warning',
    buttons: [MAIN_PROCESS_TRANSLATIONS.en.dataNewJournalConfirm, MAIN_PROCESS_TRANSLATIONS.en.promptCancel],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: MAIN_PROCESS_TRANSLATIONS.en.dataNewJournalTitle,
    message: MAIN_PROCESS_TRANSLATIONS.en.dataNewJournalMessage,
    detail: MAIN_PROCESS_TRANSLATIONS.en.dataNewJournalDetail
  });
  for (const text of [userData, JSON.stringify(userData).slice(1, -1)]) {
    assert.ok(!JSON.stringify(options).includes(text), 'the confirm must not name the data folder');
  }
  assert.deepEqual(fs.readdirSync(profileDir), [BROKEN_NAME]);
  assert.equal(fs.readFileSync(path.join(profileDir, BROKEN_NAME), 'utf8'), BROKEN_JOURNAL);
  assert.equal(context.journalStore, null);
  assert.equal(context.unreadableJournalProfileId, null);
  assert.equal(context.currentSession, null);
  assert.deepEqual(journalCalls, { audit: ['auditJournalStarted'], overlay: 1 });
  assert.equal(context.dataActionRunning, false);
  assert.deepEqual(calls.console, []);

  assert.deepEqual(plain(context.getJournalStatus()), { unreadable: false });
  assert.deepEqual(plain(context.readJournal()), { sessions: [] });
  context.writeJournal({ sessions: [{ id: 'n1' }] });
  assert.deepEqual(JSON.parse(fs.readFileSync(journalPath, 'utf8')), { sessions: [{ id: 'n1' }] });
  assert.equal(fs.readFileSync(path.join(profileDir, BROKEN_NAME), 'utf8'), BROKEN_JOURNAL);
});

test('Start a new journal never overwrites an earlier broken journal', async (t) => {
  const { context, state, profileDir, writeJournalFile } = loadJournalRecovery(t);
  const earlier = {
    [BROKEN_NAME]: 'first broken',
    'journal.broken-20261028-190509-2.json': 'second broken'
  };
  writeFiles(profileDir, earlier);
  writeJournalFile(BROKEN_JOURNAL);
  state.answer = CONFIRM;

  assert.deepEqual(plain(await context.startNewJournal()), { started: true });

  assert.deepEqual(
    fs.readdirSync(profileDir).sort(),
    [...Object.keys(earlier), 'journal.broken-20261028-190509-3.json'].sort()
  );
  assert.equal(fs.readFileSync(path.join(profileDir, 'journal.broken-20261028-190509-3.json'), 'utf8'), BROKEN_JOURNAL);
  for (const [name, text] of Object.entries(earlier)) {
    assert.equal(fs.readFileSync(path.join(profileDir, name), 'utf8'), text);
  }
});

test('Start a new journal leaves a journal that can be read alone, also one repaired during the confirm', async (t) => {
  const { context, calls, state, profileDir, journalPath, journalCalls, writeJournalFile } = loadJournalRecovery(t);
  writeJournalFile('{"sessions":[]}');
  assert.deepEqual(plain(await context.startNewJournal()), { started: false, reason: 'readable' });
  assert.equal(calls.dialog.length, 0);

  writeJournalFile(BROKEN_JOURNAL);
  state.answer = async () => {
    writeJournalFile('{"sessions":[{"id":"fixed"}]}');
    return { response: 0, checkboxChecked: false };
  };
  assert.deepEqual(plain(await context.startNewJournal()), { started: false, reason: 'readable' });
  assert.equal(calls.dialog.length, 1);
  assert.deepEqual(fs.readdirSync(profileDir), ['journal.json']);
  assert.equal(fs.readFileSync(journalPath, 'utf8'), '{"sessions":[{"id":"fixed"}]}');

  fs.rmSync(journalPath);
  assert.deepEqual(plain(await context.startNewJournal()), { started: false, reason: 'readable' });
  assert.equal(calls.dialog.length, 1);
  assert.deepEqual(journalCalls, { audit: [], overlay: 0 });
  assert.deepEqual(plain(context.currentSession), { id: 's1', status: 'active' });
  assert.equal(context.dataActionRunning, false);
});

test('Start a new journal fails, and does not call it readable, while another program holds the journal', async (t) => {
  const { context, calls, state, profileDir, journalPath, journalCalls, writeJournalFile } = loadJournalRecovery(t);
  writeJournalFile(BROKEN_JOURNAL);
  // Node's readFileSync fails like this while another program holds the file without sharing it.
  const busy = Object.assign(new Error(`EBUSY: resource busy or locked, open '${journalPath}'`), { code: 'EBUSY' });
  context.Store = class {
    constructor() {
      throw busy;
    }
  };
  state.answer = CONFIRM;

  const result = plain(await context.startNewJournal());
  assert.deepEqual(result, { started: false, reason: 'failed' });
  for (const text of ['EBUSY', 'journal.json', 'profiles']) {
    assert.ok(!JSON.stringify(result).includes(text), `the answer must not contain ${text}`);
  }
  assert.equal(calls.dialog.length, 0);
  assert.equal(context.dataActionRunning, false);

  // Locked while the confirm is open.
  context.Store = JournalStore;
  state.answer = async () => {
    context.journalStore = {
      profileId: 'p1',
      store: {
        get store() {
          throw busy;
        }
      }
    };
    return { response: 0, checkboxChecked: false };
  };
  assert.deepEqual(plain(await context.startNewJournal()), { started: false, reason: 'failed' });
  assert.equal(calls.dialog.length, 1);

  assert.deepEqual(fs.readdirSync(profileDir), ['journal.json']);
  assert.equal(fs.readFileSync(journalPath, 'utf8'), BROKEN_JOURNAL);
  assert.deepEqual(journalCalls, { audit: [], overlay: 0 });
  assert.deepEqual(plain(context.currentSession), { id: 's1', status: 'active' });
  assert.equal(context.dataActionRunning, false);
  // Only the finding before the confirm; the lock's text, which names the path, is not logged.
  assert.deepEqual(calls.console, [['warn', UNREADABLE_WARNING]]);
});

test('Start a new journal does nothing when the signed-in profile changed during the confirm', async (t) => {
  const { context, state, profile, profileDir, journalPath, journalCalls, writeJournalFile } = loadJournalRecovery(t);
  writeJournalFile(BROKEN_JOURNAL);

  for (const next of [{ id: 'p2' }, null]) {
    profile.current = { id: 'p1' };
    state.answer = async () => {
      profile.current = next;
      return { response: 0, checkboxChecked: false };
    };
    assert.deepEqual(plain(await context.startNewJournal()), { started: false, reason: 'canceled' });
  }

  assert.deepEqual(fs.readdirSync(profileDir), ['journal.json']);
  assert.equal(fs.readFileSync(journalPath, 'utf8'), BROKEN_JOURNAL);
  assert.deepEqual(journalCalls, { audit: [], overlay: 0 });
});

test('Cancel or a failed confirm keeps the journal, and one data action runs at a time', async (t) => {
  const { context, calls, state, profileDir, journalPath, journalCalls, writeJournalFile, warnings } = loadJournalRecovery(t);
  writeJournalFile(BROKEN_JOURNAL);

  assert.deepEqual(plain(await context.startNewJournal()), { started: false, reason: 'canceled' });
  state.answer = async () => {
    throw new Error('showMessageBox failed for C:\\Users\\Alice');
  };
  assert.deepEqual(plain(await context.startNewJournal()), { started: false, reason: 'failed' });
  assert.equal(calls.dialog.length, 2);

  let answer;
  state.answer = () => new Promise((resolve) => {
    answer = resolve;
  });
  const starting = context.startNewJournal();
  assert.equal(context.dataActionRunning, true);
  assert.deepEqual(plain(await context.startNewJournal()), { started: false, reason: 'busy' });
  assert.deepEqual(plain(await context.clearLogs()), { busy: true });
  assert.equal(calls.dialog.length, 3);
  answer({ response: 1, checkboxChecked: false });
  assert.deepEqual(plain(await starting), { started: false, reason: 'canceled' });

  const clearing = context.clearLogs();
  assert.deepEqual(plain(await context.startNewJournal()), { started: false, reason: 'busy' });
  assert.equal(calls.dialog.length, 4);
  answer({ response: 1, checkboxChecked: false });
  assert.deepEqual(plain(await clearing), { canceled: true });

  assert.equal(context.dataActionRunning, false);
  assert.deepEqual(fs.readdirSync(profileDir), ['journal.json']);
  assert.equal(fs.readFileSync(journalPath, 'utf8'), BROKEN_JOURNAL);
  assert.deepEqual(journalCalls, { audit: [], overlay: 0 });
  assert.deepEqual(plain(context.currentSession), { id: 's1', status: 'active' });
  // Only the finding itself; the failed confirm's text is not logged.
  assert.deepEqual(calls.console, [['warn', UNREADABLE_WARNING]]);
  assert.equal(warnings().length, 1);
});

test('a rename that fails changes nothing and answers without the path or the error text', async (t) => {
  const { context, calls, state, profileDir, journalPath, journalCalls, writeJournalFile } = loadJournalRecovery(t);
  writeJournalFile('{"sessions":[{"id":"s1","status":"active"}]}');
  context.readJournal();
  const cached = context.journalStore;
  writeJournalFile(BROKEN_JOURNAL);
  context.getJournalStatus();
  calls.console.length = 0;
  state.answer = CONFIRM;
  context.fs = {
    ...fs,
    renameSync() {
      throw Object.assign(new Error(`EBUSY: resource busy or locked, rename '${journalPath}'`), { code: 'EBUSY' });
    }
  };

  const result = plain(await context.startNewJournal());
  assert.deepEqual(result, { started: false, reason: 'failed' });
  for (const text of ['EBUSY', 'journal.json', 'profiles']) {
    assert.ok(!JSON.stringify(result).includes(text), `the answer must not contain ${text}`);
  }
  assert.deepEqual(fs.readdirSync(profileDir), ['journal.json']);
  assert.equal(fs.readFileSync(journalPath, 'utf8'), BROKEN_JOURNAL);
  assert.equal(context.journalStore, cached);
  assert.equal(context.unreadableJournalProfileId, 'p1');
  assert.deepEqual(plain(context.currentSession), { id: 's1', status: 'active' });
  assert.deepEqual(journalCalls, { audit: [], overlay: 0 });
  assert.equal(context.dataActionRunning, false);
  assert.deepEqual(calls.console, []);
});

test('a journal set aside counts as started even when the activity log cannot be written', async (t) => {
  const { context, calls, state, profileDir, writeJournalFile } = loadJournalRecovery(t);
  writeJournalFile(BROKEN_JOURNAL);
  state.answer = CONFIRM;
  context.appendAuditTrail = () => {
    throw new Error("EPERM: operation not permitted, open 'C:\\Users\\Alice\\AppData\\Roaming\\Juice Journal\\config.json'");
  };

  assert.deepEqual(plain(await context.startNewJournal()), { started: true });

  assert.deepEqual(fs.readdirSync(profileDir), [BROKEN_NAME]);
  assert.equal(context.journalStore, null);
  assert.equal(context.currentSession, null);
  assert.deepEqual(plain(context.getJournalStatus()), { unreadable: false });
  assert.equal(context.dataActionRunning, false);
  assert.deepEqual(calls.console, [['warn', UNREADABLE_WARNING]]);
});

test('after Clear logs, the next read of an unreadable journal is logged again', async (t) => {
  const { context, state, writeJournalFile, warnings } = loadJournalRecovery(t);
  writeJournalFile(BROKEN_JOURNAL);
  context.getJournalStatus();
  context.getJournalStatus();
  assert.equal(warnings().length, 1);

  state.answer = CONFIRM;
  assert.deepEqual(plain(await context.clearLogs()), { cleared: true });
  assert.equal(context.unreadableJournalProfileId, null);
  context.getJournalStatus();
  assert.deepEqual(warnings(), [[UNREADABLE_WARNING], [UNREADABLE_WARNING]]);
});

const DELETED_FOLDERS = ['profiles', 'icon-cache', 'ocr-cache', 'logs', 'Partitions'];
// No maxRetries: rm repeats those at every folder level, so main tries the whole folder again instead.
const RM_OPTIONS = { recursive: true, force: true };
// A few of main.js's store defaults, null ones included: conf's clear() writes back only the defaults that are not null.
const SMALL_DEFAULTS = {
  apiUrl: 'http://localhost:3001',
  onlineEnabled: false,
  authToken: null,
  authTokenEncrypted: null,
  language: 'en',
  localProfiles: {},
  activeProfileId: null,
  auditTrail: [],
  poeOAuthTokens: null
};
const CLEARED_SETTINGS = { apiUrl: 'http://localhost:3001', onlineEnabled: false, language: 'en', localProfiles: {}, auditTrail: [] };
const NULL_DEFAULT_KEYS = ['authToken', 'authTokenEncrypted', 'activeProfileId', 'poeOAuthTokens'];
const DELETE_ALL_EVENTS = [
  'unregisterAll',
  'clearInterval gate',
  'logParser.stop',
  'gameDetector.stop',
  'handleLogout',
  'ocr.terminate',
  ...DELETED_FOLDERS.map((folder) => `rm ${folder}`),
  'store.clear',
  'store.set language',
  'clearCache',
  'clearStorageData',
  'relaunch',
  'quit'
];
// Delete everything never reads a journal and never ends the active run into one.
const NOT_CALLED = [
  'readJournal', 'getJournalStore', 'loadActiveSession', 'endCurrentSession', 'finalizeActiveSessionOnShutdown',
  'writeJournal', 'saveMapResultHistory'
];

// Delete everything over a real conf store and real folders in a temp data folder. Every step lands in one list; the
// stubs in NOT_CALLED note any call.
function loadDeleteAll(t, { functions = [], settings = {}, overrides = {} } = {}) {
  const events = [];
  const forbidden = [];
  const spies = { captureOffAtStop: [], rmOptions: [], setInterval: [], persistedPoeTokens: [] };
  const userData = makeTempDir(t);
  const state = {
    userDataPath: userData,
    rm: (target, options) => fs.promises.rm(target, options),
    terminate: async () => { },
    clearCache: async () => { },
    clearStorageData: async () => { }
  };
  const conf = new Conf({ cwd: userData, configName: 'config', defaults: SMALL_DEFAULTS });
  for (const [key, value] of Object.entries(settings)) {
    conf.set(key, value);
  }
  const store = {
    get: (key) => conf.get(key),
    set(key, value) {
      events.push(`store.set ${key}`);
      conf.set(key, value);
    },
    delete: (key) => conf.delete(key),
    clear() {
      events.push('store.clear');
      conf.clear();
    }
  };
  const record = (name) => () => {
    events.push(name);
  };
  const logParser = {
    isRunning: true,
    stop() {
      events.push('logParser.stop');
      this.isRunning = false;
    }
  };
  const syncScanHotkeys = () => { };
  let loaded = null;
  loaded = loadDataManagement(t, {
    userData,
    functions: [...DATA_FUNCTIONS, 'withTimeout', 'deleteAllLocalData', ...functions],
    overrides: {
      fs: {
        ...fs,
        promises: {
          ...fs.promises,
          rm: async (target, options) => {
            events.push(`rm ${path.basename(target)}`);
            spies.rmOptions.push(options);
            return state.rm(target, options);
          }
        }
      },
      app: {
        getPath: () => state.userDataPath,
        relaunch: record('relaunch'),
        quit: record('quit')
      },
      store,
      require: (name) => (name === 'electron'
        ? {
          session: {
            defaultSession: {
              clearCache: () => {
                events.push('clearCache');
                return state.clearCache();
              },
              clearStorageData: () => {
                events.push('clearStorageData');
                return state.clearStorageData();
              }
            }
          }
        }
        : require(name)),
      setTimeout,
      clearTimeout,
      BROWSER_DATA_CLEAR_TIMEOUT_MS: 1000,
      DELETE_ALL_FOLDER_ATTEMPTS: 3,
      DELETE_ALL_FOLDER_RETRY_MS: 1,
      globalShortcut: {
        unregisterAll: () => {
          events.push('unregisterAll');
          spies.captureOffAtStop.push(loaded.errorLogState.disabled);
        }
      },
      scanHotkeysActive: true,
      scanHotkeyGateInterval: 'gate',
      SCAN_HOTKEY_GATE_INTERVAL_MS: 500,
      syncScanHotkeys,
      setInterval: (callback, ms) => {
        events.push('setInterval');
        spies.setInterval.push([callback, ms]);
        return 'new gate';
      },
      clearInterval: (id) => {
        events.push(`clearInterval ${id}`);
      },
      logParser,
      gameDetector: { stop: record('gameDetector.stop'), start: record('gameDetector.start') },
      ocrScanner: {
        terminate: () => {
          events.push('ocr.terminate');
          return state.terminate();
        }
      },
      setupLogParser: record('setupLogParser'),
      handleLogout: record('handleLogout'),
      poeApiClient: { clearTokens: record('poe.clearTokens') },
      apiClient: {
        setToken: (token) => {
          events.push(`api.setToken ${token}`);
        }
      },
      currentSession: { id: 's1', status: 'active' },
      journalStore: { profileId: 'p1' },
      unreadableJournalProfileId: 'p1',
      // What the real handleLogout calls, for the cases that load it.
      appendAuditTrail: record('appendAuditTrail'),
      stashAnalyzer: { clearAll: record('stashAnalyzer.clearAll') },
      overlayMapResultState: { result: true },
      clearOverlayMapResultDismissTimer: record('clearOverlayMapResultDismissTimer'),
      updateOverlayWindow: record('updateOverlayWindow'),
      persistPoeClientTokens: (tokens) => spies.persistedPoeTokens.push(tokens),
      ...Object.fromEntries(NOT_CALLED.map((name) => [name, () => forbidden.push(name)])),
      ...overrides
    }
  });
  return {
    ...loaded,
    events,
    forbidden,
    spies,
    state,
    conf,
    store,
    logParser,
    syncScanHotkeys,
    count: (name) => events.filter((event) => event === name).length,
    readSettings: () => JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'))
  };
}

test('Delete everything runs as the one data action and answers busy meanwhile', async (t) => {
  const { context, events, state } = loadDeleteAll(t);
  context.dataActionRunning = true;
  assert.deepEqual(plain(await context.deleteAllLocalData()), { deleted: false, reason: 'busy' });
  assert.deepEqual(events, []);
  context.dataActionRunning = false;

  let rmStarted;
  const started = new Promise((resolve) => {
    rmStarted = resolve;
  });
  let releaseRm;
  const released = new Promise((resolve) => {
    releaseRm = resolve;
  });
  // profiles waits until the test lets it fail; every attempt fails.
  state.rm = async (target, options) => {
    if (path.basename(target) !== 'profiles') return fs.promises.rm(target, options);
    rmStarted();
    await released;
    throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
  };

  const first = context.deleteAllLocalData();
  await started;
  assert.equal(context.dataActionRunning, true);
  assert.deepEqual(plain(await context.deleteAllLocalData()), { deleted: false, reason: 'busy' });
  assert.deepEqual(plain(await context.clearLogs()), { busy: true });
  releaseRm();
  assert.deepEqual(plain(await first), { deleted: false, reason: 'failed', failed: ['profiles'] });
  assert.equal(context.dataActionRunning, false);

  state.rm = (target, options) => fs.promises.rm(target, options);
  assert.deepEqual(plain(await context.deleteAllLocalData()), { deleted: true });
});

test('Delete everything stops the writers and signs out before its first wait, then deletes, resets and restarts', async (t) => {
  const { context, events, spies, state, calls, errorLogState } = loadDeleteAll(t);
  errorLogState.recent.set('main|error|first failure', { at: Date.now(), repeats: 2 });
  let finishTerminate;
  state.terminate = () => new Promise((resolve) => {
    finishTerminate = resolve;
  });

  const deleting = context.deleteAllLocalData();
  // Nothing awaited yet: a quit or a tray action from here on finds no run to end.
  assert.deepEqual(events, DELETE_ALL_EVENTS.slice(0, DELETE_ALL_EVENTS.indexOf('ocr.terminate') + 1));
  finishTerminate();
  assert.deepEqual(plain(await deleting), { deleted: true });

  assert.deepEqual(events, DELETE_ALL_EVENTS);
  // The error log was off before the first writer stopped.
  assert.deepEqual(spies.captureOffAtStop, [true]);
  assert.deepEqual(plain(spies.rmOptions), DELETED_FOLDERS.map(() => RM_OPTIONS));
  assert.equal(context.scanHotkeysActive, false);
  assert.equal(context.scanHotkeyGateInterval, null);
  assert.equal(context.journalStore, null);
  assert.equal(context.unreadableJournalProfileId, null);
  assert.equal(context.bugReport, null);
  assert.equal(errorLogState.recent.size, 0);
  assert.deepEqual(calls.console, []);
});

test('Delete everything drops the active run without ending it and forgets the Path of Exile sign-in', async (t) => {
  const { context, forbidden, spies, count } = loadDeleteAll(t, { functions: ['handleLogout'] });

  assert.deepEqual(plain(await context.deleteAllLocalData()), { deleted: true });

  assert.deepEqual(forbidden, []);
  assert.equal(context.currentSession, null);
  assert.equal(count('poe.clearTokens'), 1);
  assert.deepEqual(spies.persistedPoeTokens, [null]);
  assert.equal(count('api.setToken null'), 1);
  assert.equal(context.overlayMapResultState, null);
});

test('Delete everything removes every profile folder, readable or not, the caches and the logs, and reads no journal', async (t) => {
  const { context, forbidden, userData } = loadDeleteAll(t);
  writeFiles(userData, {
    'profiles/p1/journal.json': BROKEN_JOURNAL,
    [`profiles/p1/${BROKEN_NAME}`]: BROKEN_JOURNAL,
    'profiles/p2/journal.json': '{"sessions":[]}',
    [`icon-cache/${'a'.repeat(64)}.png`]: Buffer.alloc(10),
    'ocr-cache/eng.traineddata': Buffer.alloc(10),
    'logs/errors.jsonl': TWO_ERROR_LINES,
    'Partitions/x/Preferences': '{}',
    'Cache/Cache_Data/f_000001': Buffer.alloc(10)
  });

  assert.deepEqual(plain(await context.deleteAllLocalData()), { deleted: true });

  for (const folder of DELETED_FOLDERS) {
    assert.equal(fs.existsSync(path.join(userData, folder)), false, `${folder} should be gone`);
  }
  // Chromium's own folders are not removed; the session calls clear them.
  assert.ok(fs.existsSync(path.join(userData, 'Cache', 'Cache_Data', 'f_000001')));
  assert.ok(fs.existsSync(path.join(userData, 'config.json')));
  assert.deepEqual(forbidden, []);
});

test('a folder that cannot be removed fails by name only; the other steps still run and nothing restarts', async (t) => {
  const {
    context, events, spies, state, calls, userData, errorLogState, syncScanHotkeys, readSettings, count
  } = loadDeleteAll(t, { settings: { language: 'tr', theme: 'x' } });
  writeFiles(userData, Object.fromEntries(DELETED_FOLDERS.map((folder) => [`${folder}/file.bin`, Buffer.alloc(10)])));
  state.rm = (target, options) => (path.basename(target) === 'icon-cache'
    ? Promise.reject(Object.assign(new Error(`EBUSY: resource busy or locked, rmdir '${target}'`), { code: 'EBUSY' }))
    : fs.promises.rm(target, options));

  const reply = plain(await context.deleteAllLocalData());

  assert.deepEqual(reply, { deleted: false, reason: 'failed', failed: ['icon-cache'] });
  for (const text of [userData, JSON.stringify(userData).slice(1, -1), 'EBUSY', 'rmdir']) {
    assert.ok(!JSON.stringify(reply).includes(text), `the answer must not contain ${text}`);
  }
  for (const folder of DELETED_FOLDERS.filter((name) => name !== 'icon-cache')) {
    assert.equal(fs.existsSync(path.join(userData, folder)), false, `${folder} should be gone`);
  }
  assert.ok(fs.existsSync(path.join(userData, 'icon-cache', 'file.bin')));
  assert.deepEqual(readSettings(), { ...CLEARED_SETTINGS, language: 'tr' });
  assert.equal(count('clearCache'), 1);
  assert.equal(count('clearStorageData'), 1);
  assert.equal(count('relaunch'), 0);
  assert.equal(count('quit'), 0);
  // Signed out, as at startup before a sign-in.
  assert.deepEqual(spies.setInterval, [[syncScanHotkeys, 500]]);
  assert.equal(context.scanHotkeyGateInterval, 'new gate');
  assert.equal(count('gameDetector.start'), 1);
  assert.equal(count('setupLogParser'), 1);
  assert.equal(errorLogState.disabled, false);
  assert.equal(context.dataActionRunning, false);
  assert.deepEqual(calls.console, []);
  assert.ok(events.indexOf('rm Partitions') < events.indexOf('setInterval'));

  state.rm = (target, options) => fs.promises.rm(target, options);
  assert.deepEqual(plain(await context.deleteAllLocalData()), { deleted: true });
});

test('a folder is tried again as a whole, three times at most, so a file held open fails it in well under a second', async (t) => {
  const waits = [];
  const { context, events, spies, state, userData } = loadDeleteAll(t, {
    overrides: {
      DELETE_ALL_FOLDER_RETRY_MS: 5,
      setTimeout: (callback, ms) => {
        waits.push(ms);
        return setTimeout(callback, ms);
      }
    }
  });
  writeFiles(userData, { 'logs/errors.jsonl': TWO_ERROR_LINES, 'icon-cache/a.png': Buffer.alloc(10) });
  const busy = (code) => Promise.reject(Object.assign(new Error(`${code}: resource busy or locked`), { code }));
  let logsTries = 0;
  state.rm = (target, options) => {
    const folder = path.basename(target);
    if (folder === 'icon-cache') return busy('EPERM');
    // The other program lets go of the log before the last try.
    logsTries += folder === 'logs' ? 1 : 0;
    if (folder === 'logs' && logsTries < 3) return busy('EBUSY');
    return fs.promises.rm(target, options);
  };

  assert.deepEqual(plain(await context.deleteAllLocalData()), { deleted: false, reason: 'failed', failed: ['icon-cache'] });

  assert.deepEqual(events.filter((event) => event.startsWith('rm ')), [
    'rm profiles',
    'rm icon-cache', 'rm icon-cache', 'rm icon-cache',
    'rm ocr-cache',
    'rm logs', 'rm logs', 'rm logs',
    'rm Partitions'
  ]);
  assert.equal(fs.existsSync(path.join(userData, 'logs')), false);
  assert.ok(fs.existsSync(path.join(userData, 'icon-cache', 'a.png')));
  // rm itself never retries; main waits between its own tries, twice for each of the two folders.
  assert.deepEqual(plain(spies.rmOptions), spies.rmOptions.map(() => RM_OPTIONS));
  assert.deepEqual(waits.filter((ms) => ms === 5), [5, 5, 5, 5]);
});

test('settings or browser data that cannot be cleared fail by name, and the other steps still run', async (t) => {
  const settingsLocked = loadDeleteAll(t);
  settingsLocked.store.clear = () => {
    throw new Error("EPERM: operation not permitted, open 'C:\\Users\\Alice\\AppData\\Roaming\\Juice Journal\\config.json'");
  };
  const reply = plain(await settingsLocked.context.deleteAllLocalData());
  assert.deepEqual(reply, { deleted: false, reason: 'failed', failed: ['settings'] });
  assert.ok(!JSON.stringify(reply).includes('Alice'));
  assert.equal(settingsLocked.count('clearCache'), 1);
  assert.equal(settingsLocked.count('clearStorageData'), 1);
  assert.equal(settingsLocked.count('relaunch'), 0);

  const storageFails = loadDeleteAll(t);
  storageFails.state.clearStorageData = async () => {
    throw new Error('clearStorageData failed');
  };
  assert.deepEqual(plain(await storageFails.context.deleteAllLocalData()), { deleted: false, reason: 'failed', failed: ['browserData'] });
  assert.deepEqual(storageFails.readSettings(), CLEARED_SETTINGS);
  assert.equal(storageFails.count('relaunch'), 0);

  // A clear that never ends counts as failed instead of holding the dialog busy for good.
  const cacheHangs = loadDeleteAll(t, { overrides: { BROWSER_DATA_CLEAR_TIMEOUT_MS: 10 } });
  cacheHangs.state.clearCache = () => new Promise(() => { });
  assert.deepEqual(plain(await cacheHangs.context.deleteAllLocalData()), { deleted: false, reason: 'failed', failed: ['browserData'] });
  assert.equal(cacheHangs.count('relaunch'), 0);
  assert.equal(cacheHangs.context.dataActionRunning, false);
  assert.equal(cacheHangs.errorLogState.disabled, false);
});

test('Delete everything keeps the language as it was set and resets every other setting', async (t) => {
  const { context, conf, readSettings } = loadDeleteAll(t, {
    settings: {
      language: 'de',
      apiUrl: 'http://127.0.0.1:9',
      onlineEnabled: true,
      authTokenEncrypted: 'y',
      localProfiles: { p1: { id: 'p1', accountName: 'Someone' } },
      activeProfileId: 'p1',
      'mapResults:p1': [{ id: 'r1' }],
      'lastKnownAccountState:p1': { accountName: 'Someone' },
      poeOAuthTokensEncrypted: 'x',
      legacyUserMigratedTo: 'p1',
      auditTrail: AUDIT_ENTRIES,
      _langMigrated: true,
      theme: 'x'
    }
  });

  assert.deepEqual(plain(await context.deleteAllLocalData()), { deleted: true });

  // conf writes back only the defaults that are not null; the next start supplies the null ones again.
  assert.deepEqual(readSettings(), { ...CLEARED_SETTINGS, language: 'de' });
  for (const key of NULL_DEFAULT_KEYS) {
    assert.equal(conf.get(key), undefined, `${key} should be gone`);
  }

  const noLanguage = loadDeleteAll(t, { settings: { language: null } });
  assert.deepEqual(plain(await noLanguage.context.deleteAllLocalData()), { deleted: true });
  assert.deepEqual(noLanguage.readSettings(), CLEARED_SETTINGS);
});

test('a successful Delete everything restarts once and stays busy until the process exits', async (t) => {
  const { context, events, errorLogState, count } = loadDeleteAll(t);

  assert.deepEqual(plain(await context.deleteAllLocalData()), { deleted: true });
  const eventCount = events.length;
  assert.deepEqual(plain(await context.deleteAllLocalData()), { deleted: false, reason: 'busy' });
  assert.deepEqual(plain(await context.clearLogs()), { busy: true });

  assert.equal(events.length, eventCount);
  assert.equal(count('relaunch'), 1);
  assert.equal(count('quit'), 1);
  assert.equal(context.dataActionRunning, true);
  assert.equal(errorLogState.disabled, true);
});

test('the quit after Delete everything writes no journal, map result or error log back', async (t) => {
  let loaded = null;
  const toErrorLog = (level) => (...args) => loaded.context.recordError('main', level, args);
  loaded = loadDeleteAll(t, {
    functions: ['handleLogout', 'getActiveProfile', 'getJournalStore', 'readJournal', 'loadActiveSession', 'finalizeActiveSessionOnShutdown'],
    settings: { localProfiles: { p1: { id: 'p1' } }, activeProfileId: 'p1' },
    overrides: {
      Store: JournalStore,
      localJournal,
      journalStore: null,
      unreadableJournalProfileId: null,
      currentSession: null,
      resolveShutdownSessionCompletion: async () => null,
      buildSessionShutdownMapResult: () => ({}),
      console: { log() { }, warn: toErrorLog('warn'), error: toErrorLog('error') }
    }
  });
  const { context, forbidden, userData } = loaded;
  writeFiles(userData, {
    'profiles/p1/journal.json': JSON.stringify({ sessions: [{ id: 's1', status: 'active', mapName: 'Dunes Map' }] })
  });
  assert.equal(context.loadActiveSession().id, 's1');

  assert.deepEqual(plain(await context.deleteAllLocalData()), { deleted: true });
  // What before-quit runs next.
  assert.equal(await context.finalizeActiveSessionOnShutdown(), null);

  assert.deepEqual(forbidden, []);
  for (const folder of ['profiles', 'logs']) {
    assert.equal(fs.existsSync(path.join(userData, folder)), false, `${folder} should not come back`);
  }
});

test('Delete everything removes no folder when the data folder is a drive root or not an absolute path', async (t) => {
  const { context, events, state, count } = loadDeleteAll(t);
  // Never the real removal here, even if the guard broke.
  state.rm = async () => { };

  for (const userDataPath of [path.parse(os.tmpdir()).root, '', 'Juice Journal']) {
    state.userDataPath = userDataPath;
    events.length = 0;
    assert.deepEqual(plain(await context.deleteAllLocalData()), { deleted: false, reason: 'failed', failed: ['userData'] });
    assert.ok(!events.some((event) => event.startsWith('rm ')), `nothing may be removed under ${JSON.stringify(userDataPath)}`);
    assert.equal(count('store.clear'), 1);
    assert.equal(count('clearStorageData'), 1);
    assert.equal(count('relaunch'), 0);
  }
});

test('a sign-out that fails still drops the run and the sign-in in memory, and nothing that writes a journal starts again', async (t) => {
  const { context, events, count } = loadDeleteAll(t, {
    overrides: {
      handleLogout: () => {
        throw new Error("EPERM: operation not permitted, open 'C:\\Users\\Alice\\AppData\\Roaming\\Juice Journal\\config.json'");
      }
    }
  });

  const reply = plain(await context.deleteAllLocalData());

  assert.deepEqual(reply, { deleted: false, reason: 'failed', failed: ['signOut'] });
  assert.ok(!JSON.stringify(reply).includes('Alice'));
  assert.equal(context.currentSession, null);
  assert.equal(count('poe.clearTokens'), 1);
  assert.equal(count('api.setToken null'), 1);
  assert.equal(context.journalStore, null);
  for (const name of ['setInterval', 'gameDetector.start', 'setupLogParser', 'relaunch']) {
    assert.ok(!events.includes(name), `${name} must not run`);
  }
  assert.equal(context.scanHotkeyGateInterval, null);
  assert.equal(context.dataActionRunning, false);
});

test('a failed delete answers with its steps when the log parser cannot start, and starts no second parser', async (t) => {
  const failBrowserData = async () => {
    throw new Error('clearStorageData failed');
  };
  const parserThrows = loadDeleteAll(t, {
    overrides: {
      setupLogParser: () => {
        throw new Error('Log file not found');
      }
    }
  });
  parserThrows.state.clearStorageData = failBrowserData;
  assert.deepEqual(plain(await parserThrows.context.deleteAllLocalData()), { deleted: false, reason: 'failed', failed: ['browserData'] });
  assert.equal(parserThrows.errorLogState.disabled, false);
  assert.equal(parserThrows.context.dataActionRunning, false);

  const parserRunning = loadDeleteAll(t);
  parserRunning.state.clearStorageData = failBrowserData;
  // A game check that was already under way started a parser again after the stop.
  parserRunning.state.terminate = async () => {
    parserRunning.logParser.isRunning = true;
  };
  assert.deepEqual(plain(await parserRunning.context.deleteAllLocalData()), { deleted: false, reason: 'failed', failed: ['browserData'] });
  assert.equal(parserRunning.count('gameDetector.start'), 1);
  assert.equal(parserRunning.count('setupLogParser'), 0);
});
