const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  REPORT_ISSUE_URL,
  ISSUE_URL_MAX_LENGTH,
  buildRedactionTargets,
  redactText,
  normalizeErrorEntry,
  redactErrorEntry,
  classifyMainConsoleMessage,
  shouldRecordRendererMessage,
  keepNewestLines,
  parseErrorLog,
  buildBugReportText,
  buildIssueFields,
  buildIssueUrl
} = require('../src/modules/bugReportModel');

const FIXTURE = {
  userData: 'C:\\Users\\Alice\\AppData\\Roaming\\Juice Journal',
  appPath: 'D:\\Dev\\JuiceJournal\\desktop',
  home: 'C:\\Users\\Alice',
  username: 'Alice',
  poePaths: ['E:\\Games\\Path of Exile\\logs\\Client.txt'],
  apiUrl: 'https://jj.example.org/',
  leagues: ['Guild Fun (PL12345)', 'Standard'],
  profiles: [{ accountName: 'Exile#1234', poeSub: 'sub-9f8e7d6c' }],
  accountStates: [{
    accountName: 'Exile#1234',
    characters: [{ name: 'FireLad', league: 'Mirage' }, { name: 'Al', league: 'Side Quest (pl77)' }]
  }]
};

const targets = buildRedactionTargets(FIXTURE);

test('buildRedactionTargets lists paths, names and private leagues once, longest first', () => {
  assert.deepEqual(targets.map(({ value, label, kind }) => [value, label, kind]), [
    ['C:\\Users\\Alice\\AppData\\Roaming\\Juice Journal', '<userData>', 'path'],
    ['D:\\Dev\\JuiceJournal\\desktop', '<app>', 'path'],
    ['E:\\Games\\Path of Exile', '<poe>', 'path'],
    ['https://jj.example.org', '<server>', 'path'],
    ['Guild Fun (PL12345)', '<private league>', 'word'],
    ['Side Quest (pl77)', '<private league>', 'word'],
    ['C:\\Users\\Alice', '~', 'path'],
    ['jj.example.org', '<server>', 'word'],
    ['sub-9f8e7d6c', '<account>', 'word'],
    ['Exile#1234', '<account>', 'word'],
    ['FireLad', '<character>', 'word'],
    ['Alice', '<user>', 'word']
  ]);
  for (let index = 1; index < targets.length; index += 1) {
    assert.ok(targets[index - 1].value.length >= targets[index].value.length);
  }
});

test('buildRedactionTargets keeps every game folder and skips the default server and bad input', () => {
  const result = buildRedactionTargets({
    home: 'C:\\Users\\Alice\\',
    apiUrl: null,
    poePaths: [
      'E:\\Games\\Path of Exile\\logs\\Client.txt',
      'F:/Steam/common/Path of Exile 2/LOGS/Client.txt',
      'Client.txt',
      null
    ],
    profiles: [null, 'x', { accountName: '  Spaced#0001  ' }],
    accountStates: { characters: [{ name: 'Nope' }] },
    leagues: 'Guild Fun (PL12345)'
  });

  assert.deepEqual(result.map(({ value, label }) => [value, label]), [
    ['F:/Steam/common/Path of Exile 2', '<poe>'],
    ['E:\\Games\\Path of Exile', '<poe>'],
    ['C:\\Users\\Alice', '~'],
    ['Spaced#0001', '<account>']
  ]);
  assert.deepEqual(buildRedactionTargets(), []);
});

test('redactText replaces known paths in any slash style and case', () => {
  assert.equal(redactText('C:\\Users\\Alice\\AppData\\Roaming\\Juice Journal\\config.json', targets), '<userData>\\config.json');
  assert.equal(redactText('c:/users/alice/appdata/roaming/juice journal/x', targets), '<userData>/x');
  assert.equal(redactText('C:\\Users\\Alice/AppData\\\\Roaming/Juice Journal', targets), '<userData>');
  assert.equal(redactText('C:\\Users\\Alice\\Documents', targets), '~\\Documents');
  assert.equal(redactText('C:\\Users\\Alicea\\x', targets), 'C:\\Users\\<user>\\x');
  assert.equal(redactText('E:\\Games\\Path of Exile\\logs\\Client.txt', targets), '<poe>\\logs\\Client.txt');
  assert.equal(redactText('at main (D:\\Dev\\JuiceJournal\\desktop\\main.js:10:5)', targets), 'at main (<app>\\main.js:10:5)');
  assert.equal(redactText('https://jj.example.org/api', targets), '<server>/api');
  assert.equal(redactText('connect ECONNREFUSED jj.example.org', targets), 'connect ECONNREFUSED <server>');
});

test('redactText replaces whole names only and leaves game words alone', () => {
  assert.equal(redactText('Exile#1234 has FireLad', targets), '<account> has <character>');
  assert.equal(redactText('Alice and Alicea', targets), '<user> and Alicea');
  assert.equal(redactText('exile#1234 sub-9f8e7d6c', targets), '<account> <account>');
  assert.equal(redactText('Dunes Map in Settlers of Kalguur', targets), 'Dunes Map in Settlers of Kalguur');
  assert.equal(redactText('/character?name=Exile%231234&realm=pc', targets), '/character?name=<account>&realm=pc');
  assert.equal(
    redactText('/currencyoverview?league=Guild%20Fun%20(PL12345)&type=Currency', targets),
    '/currencyoverview?league=<private league>&type=Currency'
  );
  // Only the percent-encoded name finds this one: no backstop removes a league name after 'league/'.
  assert.equal(
    redactText('https://www.pathofexile.com/private-leagues/league/Guild%20Fun%20(PL12345)/ladder', targets),
    'https://www.pathofexile.com/private-leagues/league/<private league>/ladder'
  );
  assert.equal(
    redactText('Price sync failed for currency/Currency: Unknown PoE2 league: Guild Fun (PL12345)', targets),
    'Price sync failed for currency/Currency: Unknown PoE2 league: <private league>'
  );
  assert.equal(redactText('League Mirage', targets), 'League Mirage');
});

test('redactText never rewrites its own labels, in one call or when the report redacts a log line again', () => {
  const wordTargets = buildRedactionTargets({
    appPath: 'D:\\Dev\\desktop',
    username: 'app',
    accountStates: [{ accountName: 'server', characters: [{ name: 'user' }, { name: 'account' }] }]
  });
  const written = redactText('D:\\Dev\\desktop\\main.js failed for app, user and server', wordTargets);

  assert.equal(written, '<app>\\main.js failed for <user>, <character> and <account>');
  assert.equal(redactText(written, wordTargets), written);
  assert.equal(redactText(redactText('Bearer abc ?code=x eyJa.b C:\\Users\\Bob (PL1)', []), []), 'Bearer <redacted> ?code=<redacted> <token> C:\\Users\\<user> (PL<id>)');
});

test('redactText backstops catch tokens, ids and user folders nobody named', () => {
  assert.equal(redactText('Authorization: Bearer abc.def-ghi'), 'Authorization: Bearer <redacted>');
  assert.equal(
    redactText('http://127.0.0.1:1/callback?code=x&state=y&code_verifier=z#access_token=t'),
    'http://127.0.0.1:1/callback?code=<redacted>&state=<redacted>&code_verifier=<redacted>#access_token=<redacted>'
  );
  assert.equal(redactText('jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln here'), 'jwt <token> here');
  assert.equal(redactText('mail bob@example.com now'), 'mail <email> now');
  assert.equal(redactText('Someone#4321 and Someone%234321'), '<account> and <account>');
  assert.equal(redactText('id 123e4567-E89B-12d3-a456-426614174000'), 'id <id>');
  assert.equal(redactText('C:\\Users\\Bob\\x and C:/Users/Bob/x'), 'C:\\Users\\<user>\\x and C:/Users/<user>/x');
  assert.equal(redactText('key Abcdefghij_klmnopqrst-uvwxyz0123456789ABCDEFG end'), 'key <redacted> end');
  assert.equal(redactText('Unknown PoE2 league: Old Friends League (PL12345)'), 'Unknown PoE2 league: <private league>');
  assert.equal(
    redactText('/currencyoverview?league=Guild+Fun+%28PL98765%29&type=Currency'),
    '/currencyoverview?league=<private league>&type=Currency'
  );
  assert.equal(redactText('Joined Old Friends League (PL12345)'), 'Joined Old Friends League (PL<id>)');
  assert.equal(redactText('/ladder/Guild%20Fun%20%28pl777%29'), '/ladder/Guild%20Fun%20%28PL<id>%29');
  assert.equal(
    redactText('/home/somebody/projects/juice-journal/desktop/src/modules/main.js'),
    '/home/somebody/projects/juice-journal/desktop/src/modules/main.js'
  );
  assert.equal(redactText(null), '');
  assert.equal(redactText(undefined), '');
  assert.equal(redactText(42), '42');
});

test('redactText removes the journal text V8 quotes in a JSON.parse error', () => {
  let message;
  try {
    JSON.parse('{"sessions":[{"mapName":"Dunes Map"},]}');
  } catch (error) {
    message = `Unable to load active session after sign-in SyntaxError: ${error.message}`;
  }

  assert.match(message, /"nes Map"/);
  assert.equal(
    redactText(message),
    "Unable to load active session after sign-in SyntaxError: Unexpected token ']', <json> is not valid JSON"
  );
  assert.equal(
    redactText('Unexpected token \'S\', "Secret Map"... is not valid JSON'),
    "Unexpected token 'S', <json> is not valid JSON"
  );
});

test('redactText removes journal text and tokens before a name can change the words they are found by', () => {
  const nameTargets = buildRedactionTargets({ accountStates: [{ characters: [{ name: 'Json' }, { name: 'Bearer' }] }] });
  let message;
  try {
    JSON.parse('{"sessions":[{"mapName":"Strand Map"},]}');
  } catch (error) {
    message = `Error occurred in handler for 'get-recent-loot': SyntaxError: ${error.message}`;
  }

  // Written to the log, then redacted again for the report.
  const written = redactText(message, nameTargets);
  assert.equal(
    written,
    "Error occurred in handler for 'get-recent-loot': SyntaxError: Unexpected token ']', <json> is not valid <character>"
  );
  assert.equal(redactText(written, nameTargets), written);
  assert.equal(redactText('Authorization: Bearer abc.def-ghi', nameTargets), 'Authorization: <character> <redacted>');
});

test('redactText shortens a packaged stack frame to the app folder', () => {
  const packaged = buildRedactionTargets({
    appPath: 'C:\\Users\\Alice\\AppData\\Local\\Programs\\juice-journal\\resources\\app.asar',
    home: 'C:\\Users\\Alice'
  });

  assert.equal(
    redactText('at Object.<anonymous> (C:\\Users\\Alice\\AppData\\Local\\Programs\\juice-journal\\resources\\app.asar\\main.js:120:5)', packaged),
    'at Object.<anonymous> (<app>\\main.js:120:5)'
  );
});

test('normalizeErrorEntry reads name, message, code and stack only', () => {
  const error = new TypeError('msg');
  error.code = 'EPERM';
  error.stack = ['TypeError: msg', ...Array.from({ length: 12 }, (_, index) => `    at f${index} (a.js:${index}:1)`)].join('\n');

  const entry = normalizeErrorEntry({ at: 1, source: 'renderer', level: 'warn', error });
  assert.deepEqual(entry, {
    at: '1',
    source: 'renderer',
    level: 'warn',
    message: 'TypeError: msg',
    code: 'EPERM',
    frames: Array.from({ length: 8 }, (_, index) => `at f${index} (a.js:${index}:1)`)
  });

  assert.equal(normalizeErrorEntry({ error: vm.runInNewContext('new Error("x")') }).message, 'x');
  assert.equal(normalizeErrorEntry({ error: [{ some: 'object' }, 'text', 3, null, undefined, true] }).message, '[object] text 3 null undefined true');
});

test('normalizeErrorEntry never writes an axios config, headers or response', () => {
  const axiosError = Object.assign(new Error('Request failed with status code 500'), {
    name: 'AxiosError',
    code: 'ERR_BAD_RESPONSE',
    config: { headers: { Authorization: 'Bearer secret' } },
    response: { data: { token: 'secret' } }
  });
  const entry = normalizeErrorEntry({ error: ['Price sync failed', axiosError] });

  assert.equal(entry.message, 'Price sync failed AxiosError: Request failed with status code 500');
  assert.equal(entry.code, 'ERR_BAD_RESPONSE');
  assert.doesNotMatch(JSON.stringify(entry), /secret|headers/);
});

test('normalizeErrorEntry joins console arguments and turns Node warning text into one line', () => {
  const ipcEntry = normalizeErrorEntry({
    error: ["Error occurred in handler for 'set-settings':", new Error('Invalid API URL')]
  });
  assert.equal(ipcEntry.message, "Error occurred in handler for 'set-settings': Invalid API URL");
  assert.ok(ipcEntry.frames.length > 0);

  const rejection = normalizeErrorEntry({
    error: ['(node:123) UnhandledPromiseRejectionWarning: Error: boom\n    at f (a.js:1:1)\n(Use `electron --trace-warnings ...` to show where the warning was created)']
  });
  assert.equal(rejection.message, 'UnhandledPromiseRejectionWarning: Error: boom');
  assert.deepEqual(rejection.frames, ['at f (a.js:1:1)']);

  const prose = normalizeErrorEntry({ error: 'at startup the folder was missing' });
  assert.equal(prose.message, 'at startup the folder was missing');
  assert.equal(prose.frames, undefined);

  const fallback = normalizeErrorEntry({ at: 'x', source: 'elsewhere', level: 'info', error: 'boom' });
  assert.deepEqual(fallback, { at: 'x', source: 'main', level: 'error', message: 'boom' });
  assert.equal(normalizeErrorEntry({ error: 'x'.repeat(5000) }).message.length, 4000);
});

test('redactErrorEntry redacts before it cuts', () => {
  const token = 'A'.repeat(43);
  const entry = redactErrorEntry({
    at: 't',
    source: 'main',
    level: 'error',
    message: `${'x '.repeat(240)}${token}${' y'.repeat(1250)}`,
    code: `failed ${token}`,
    frames: [`at ${'f '.repeat(150)}`, 'at C:\\Users\\Alice\\a.js:1:1', `at ${'f '.repeat(85)}${token}`],
    repeats: 2
  }, targets);

  assert.equal(entry.message.length, 500);
  assert.match(entry.message, /^(x ){240}<redacted> y/);
  assert.doesNotMatch(entry.message, /AAAA/);
  assert.equal(entry.code, 'failed <redacted>');
  assert.equal(entry.frames[0].length, 200);
  assert.equal(entry.frames[1], 'at ~\\a.js:1:1');
  // The token crosses the 200-character cut; cut first, its 27 leftover characters would be too short to catch.
  assert.match(entry.frames[2], /^at (f ){85}<redacted>$/);
  assert.equal(entry.repeats, 2);

  assert.deepEqual(
    redactErrorEntry({ at: 't', source: 'main', level: 'warn', message: 'm', frames: [], repeats: 0 }, targets),
    { at: 't', source: 'main', level: 'warn', message: 'm' }
  );
  assert.equal(redactErrorEntry({ at: 't', source: 'main', level: 'warn', message: 'm', code: 'Bearer abc' }, []).code, 'Bearer <redacted>');
});

test('classifyMainConsoleMessage keeps real problems and skips Node follow-up lines', () => {
  assert.equal(classifyMainConsoleMessage('error', ["Error occurred in handler for 'get-recent-loot':", new Error('x')]), 'warn');
  assert.equal(
    classifyMainConsoleMessage('error', ['(node:1) UnhandledPromiseRejectionWarning: Unhandled promise rejection. This error originated ...']),
    null
  );
  assert.equal(classifyMainConsoleMessage('error', ['(Use `electron --trace-warnings ...` to show where the warning was created)']), null);
  assert.equal(classifyMainConsoleMessage('error', ['(node:1) UnhandledPromiseRejectionWarning: Error: boom']), 'error');
  assert.equal(classifyMainConsoleMessage('error', ['(node:1) [DEP0040] DeprecationWarning: x']), 'warn');
  assert.equal(classifyMainConsoleMessage('warn', ['plain']), 'warn');
  assert.equal(classifyMainConsoleMessage('error', ['plain']), 'error');
  assert.equal(classifyMainConsoleMessage('error', [new Error('x')]), 'error');
  assert.equal(classifyMainConsoleMessage('warn', []), 'warn');
});

test('shouldRecordRendererMessage keeps renderer errors, not IPC failures main logged or the meta CSP notice', () => {
  assert.equal(shouldRecordRendererMessage({ level: 'warning', message: 'x' }), false);
  assert.equal(
    shouldRecordRendererMessage({ level: 'error', message: "Uncaught (in promise) Error: Error invoking remote method 'x': Error: y" }),
    false
  );
  assert.equal(
    shouldRecordRendererMessage({
      level: 'error',
      message: "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element."
    }),
    false
  );
  assert.equal(shouldRecordRendererMessage({ level: 'error', message: 'Uncaught TypeError: a is not a function' }), true);
  assert.equal(shouldRecordRendererMessage(null), false);
});

test('keepNewestLines keeps the newest lines within the line and byte limits', () => {
  const text = 'one\r\ntwo\n\nthree\nfour\n';

  assert.equal(keepNewestLines(text, { maxLines: 2, maxBytes: 100 }), 'three\nfour\n');
  assert.equal(keepNewestLines(text, { maxLines: 10, maxBytes: 11 }), 'three\nfour\n');
  assert.equal(keepNewestLines(text, { maxLines: 10, maxBytes: 100 }), 'one\ntwo\nthree\nfour\n');
  assert.equal(keepNewestLines(text, { maxLines: 10, maxBytes: 3 }), '');
  assert.equal(keepNewestLines('', { maxLines: 10, maxBytes: 100 }), '');
});

test('parseErrorLog returns sanitized entries newest first and skips bad lines', () => {
  const text = [
    JSON.stringify({ at: 'a', source: 'main', level: 'warn', message: 'first' }),
    '{"at":"b","message":',
    '',
    JSON.stringify({ at: 'c', source: 'renderer', level: 'error', message: 'second', code: 'EPERM', frames: ['at x', 5, null], repeats: 3 }),
    JSON.stringify({ at: 'd', message: 7 }),
    JSON.stringify(['array']),
    JSON.stringify({ at: 'e', source: 'evil', level: 'panic', message: 'third', code: { nested: true }, repeats: 0 })
  ].join('\n');

  assert.deepEqual(parseErrorLog(text), [
    { at: 'e', source: 'main', level: 'error', message: 'third', frames: [] },
    { at: 'c', source: 'renderer', level: 'error', message: 'second', code: 'EPERM', frames: ['at x'], repeats: 3 },
    { at: 'a', source: 'main', level: 'warn', message: 'first', frames: [] }
  ]);
  assert.deepEqual(parseErrorLog(text, 1).map((entry) => entry.message), ['third']);
  assert.deepEqual(parseErrorLog(''), []);
});

const REPORT_INPUT = {
  generatedAt: '2026-10-27T09:14:03.512Z',
  app: { version: '1.0.0', isPackaged: false, commit: '5edaf46', electron: '41.3.0', chrome: '146.0.0.0', node: '24.15.0' },
  os: { platform: 'win32', release: '10.0.26300', arch: 'x64' },
  settings: {
    language: 'en',
    poeVersion: 'poe1',
    lastDetectedPoeVersion: 'poe2',
    defaultLeaguePoe1: 'Guild Fun (PL12345)',
    defaultLeaguePoe2: null,
    onlineEnabled: false,
    // buildSafeSettingsSnapshot always sets these two; the report must not read them.
    hasCustomApiUrl: true,
    hasPoePath: false,
    customServer: false,
    clientTxtFound: true,
    scanHotkey: 'F9',
    notifications: true,
    soundNotifications: false,
    autoStartSession: true
  },
  signedIn: true,
  sessionActive: false,
  localData: { journalBytes: 48213, mapResults: 37, activityEntries: 112 },
  errors: [],
  activity: []
};

function buildReport({ app = {}, os = {}, settings = {}, localData = {}, ...rest } = {}) {
  return buildBugReportText({
    ...REPORT_INPUT,
    ...rest,
    app: { ...REPORT_INPUT.app, ...app },
    os: { ...REPORT_INPUT.os, ...os },
    settings: { ...REPORT_INPUT.settings, ...settings },
    localData: { ...REPORT_INPUT.localData, ...localData }
  });
}

test('buildBugReportText prints the fixed English layout with no trailing newline', () => {
  assert.equal(buildReport(), [
    'Juice Journal bug report',
    'Generated: 2026-10-27T09:14:03.512Z',
    '',
    'App: 1.0.0, source build, commit 5edaf46',
    'Runtime: Electron 41.3.0, Chromium 146.0.0.0, Node 24.15.0',
    'OS: Windows 10.0.26300 x64',
    'Language: en',
    'Game: PoE1 (last detected: PoE2)',
    'Default leagues: PoE1 private league, PoE2 not set',
    'Online features: off, custom server: no',
    'Client.txt found: yes',
    'Scan hotkey: F9',
    'Notifications: on, sound: off, auto-start session: on',
    'Signed in (local profile): yes',
    'Active session: none',
    'Local data: journal.json 48213 bytes, map results 37, activity entries 112',
    '',
    'Recent errors (newest first): none',
    '',
    'Recent activity (newest first): none'
  ].join('\n'));
});

test('buildBugReportText covers installed builds, unknown values and league names', () => {
  const installed = buildReport({ app: { isPackaged: true } }).split('\n');
  assert.ok(installed.includes('App: 1.0.0, installed'));
  assert.ok(!installed.some((line) => line.includes('commit')));

  const lines = buildReport({
    app: { commit: null },
    os: { platform: 'freebsd' },
    settings: {
      poeVersion: 'constructor',
      lastDetectedPoeVersion: null,
      defaultLeaguePoe1: '  Mirage  ',
      defaultLeaguePoe2: 'x (pl9)  ',
      onlineEnabled: true,
      customServer: true,
      clientTxtFound: false
    },
    signedIn: false,
    sessionActive: true,
    localData: { journalBytes: null, mapResults: null, activityEntries: 0 }
  }).split('\n');
  for (const line of [
    'App: 1.0.0, source build, commit unknown',
    'OS: freebsd 10.0.26300 x64',
    'Game: none (last detected: none)',
    'Default leagues: PoE1 Mirage, PoE2 private league',
    'Online features: on, custom server: yes',
    'Client.txt found: no',
    'Signed in (local profile): no',
    'Active session: active',
    'Local data: journal.json n/a, map results n/a, activity entries 0'
  ]) {
    assert.ok(lines.includes(line), `missing line: ${line}`);
  }

  assert.match(buildReport({ os: { platform: 'darwin' } }), /^OS: macOS 10\.0\.26300 x64$/m);
  assert.match(buildReport({ settings: { defaultLeaguePoe1: '   ', defaultLeaguePoe2: 7 } }), /^Default leagues: PoE1 not set, PoE2 not set$/m);
});

test('buildBugReportText prints the newest 20 errors on one line each with up to 8 frames', () => {
  const frames = Array.from({ length: 12 }, (_, index) => `at f${index} (app.js:${index}:1)`);
  const errors = Array.from({ length: 25 }, (_, index) => ({ at: `t${index}`, source: 'main', level: 'warn', message: `error ${index}`, frames: [] }));
  errors[0] = { at: 't0', source: 'renderer', level: 'error', message: 'first\n  line\ttwo', code: 'EPERM', repeats: 3, frames };
  errors[1] = { at: 't1', source: 'process', level: 'fatal', message: 'x'.repeat(600), frames: [] };

  const lines = buildReport({ errors }).split('\n');
  const start = lines.indexOf('Recent errors (newest first): 20');
  assert.notEqual(start, -1);
  assert.equal(lines[start + 1], '[t0] renderer error: first line two [code EPERM] (+3 repeats)');
  assert.deepEqual(lines.slice(start + 2, start + 10), frames.slice(0, 8).map((frame) => `    ${frame}`));
  assert.equal(lines[start + 10], `[t1] process fatal: ${'x'.repeat(500)}`);
  assert.deepEqual(
    lines.filter((line) => line.startsWith('[')).map((line) => line.slice(1, line.indexOf(']'))),
    Array.from({ length: 20 }, (_, index) => `t${index}`)
  );
  assert.equal(lines[start + 11], '[t2] main warn: error 2');
  assert.ok(!lines.some((line) => line.includes('[code') && !line.startsWith('[t0]')));
  assert.ok(!lines.some((line) => line.includes('repeats') && !line.startsWith('[t0]')));
});

test('buildBugReportText prints the newest 10 activity keys with their times and never their values', () => {
  const activity = Array.from({ length: 12 }, (_, index) => ({
    key: `auditKey${index}`,
    createdAt: `2026-10-27T09:00:${String(index).padStart(2, '0')}.000Z`,
    values: { mapName: 'Secret Map' }
  }));
  activity[1] = { key: null, createdAt: undefined };

  const text = buildReport({ activity });
  const lines = text.split('\n');
  const start = lines.indexOf('Recent activity (newest first): 10');
  assert.notEqual(start, -1);
  assert.deepEqual(lines.slice(start + 1, start + 3), ['2026-10-27T09:00:00.000Z auditKey0', 'unknown unknown']);
  assert.equal(lines.length, start + 11);
  assert.equal(lines.at(-1), '2026-10-27T09:00:09.000Z auditKey9');
  assert.doesNotMatch(text, /Secret Map|mapName/);
});

test('buildBugReportText output survives a second redaction unchanged', () => {
  const targets = buildRedactionTargets({
    home: 'C:\\Users\\Alice',
    username: 'Alice',
    profiles: [{ accountName: 'Exile#1234' }],
    accountStates: [{ characters: [{ name: 'FireLad' }] }]
  });
  const text = buildReport({
    errors: [
      {
        at: '2026-10-27T09:10:00.000Z',
        source: 'main',
        level: 'warn',
        message: "Error occurred in handler for 'get-recent-loot': <account> as <character> in <private league>",
        code: 'ERR_BAD_RESPONSE',
        repeats: 2,
        frames: ['at readJournal (<app>\\main.js:812:10)', 'at ~\\AppData\\x.js:1:1']
      },
      { at: '2026-10-27T09:00:00.000Z', source: 'renderer', level: 'error', message: 'Uncaught TypeError: x (app.js:10)', frames: [] }
    ],
    activity: [{ key: 'auditLogin', createdAt: '2026-10-27T08:00:00.000Z' }]
  });

  assert.equal(redactText(text, targets), text);
  assert.equal(redactText(buildReport({ app: { isPackaged: true } }), targets), buildReport({ app: { isPackaged: true } }));
});

test('buildIssueFields fills in only the version and the environment', () => {
  assert.deepEqual(buildIssueFields(REPORT_INPUT), {
    version: '1.0.0 (source build, 5edaf46)',
    environment: 'Windows 10.0.26300 x64, Electron 41.3.0, PoE1, language en, online off'
  });
  assert.equal(buildIssueFields({ ...REPORT_INPUT, app: { ...REPORT_INPUT.app, isPackaged: true } }).version, '1.0.0 (installed)');
  assert.equal(buildIssueFields({ ...REPORT_INPUT, app: { ...REPORT_INPUT.app, commit: null } }).version, '1.0.0 (source build)');
});

test('buildIssueUrl opens the bug report form with version and environment only, within the URL limit', () => {
  const url = buildIssueUrl(buildIssueFields(REPORT_INPUT));
  const parsed = new URL(url);

  assert.ok(url.startsWith(`${REPORT_ISSUE_URL}?template=bug_report.yml`));
  assert.deepEqual([...parsed.searchParams.keys()], ['template', 'version', 'environment']);
  assert.equal(parsed.searchParams.get('version'), '1.0.0 (source build, 5edaf46)');
  assert.equal(parsed.searchParams.get('environment'), 'Windows 10.0.26300 x64, Electron 41.3.0, PoE1, language en, online off');

  for (const unit of ['a', '€', '&', '%', '\uD800', '\n']) {
    const long = unit.repeat(10 * 1024);
    const longUrl = buildIssueUrl({ version: long, environment: long });
    const params = new URL(longUrl).searchParams;

    assert.ok(longUrl.length <= ISSUE_URL_MAX_LENGTH, `${JSON.stringify(unit)} gives ${longUrl.length} chars`);
    assert.deepEqual([...params.keys()], ['template', 'version', 'environment']);
    assert.ok(params.get('version').length <= 120);
    assert.ok(params.get('environment').length <= 120);
    assert.match(params.get('version'), /^[\x20-\x7E]+$/);
  }
  assert.equal(buildIssueUrl(), `${REPORT_ISSUE_URL}?template=bug_report.yml&version=&environment=`);
});

test('the issue URL parameters match the bug report issue form', () => {
  const templatePath = path.join(__dirname, '..', '..', '.github', 'ISSUE_TEMPLATE', 'bug_report.yml');
  const template = fs.readFileSync(templatePath, 'utf8');
  const params = new URL(buildIssueUrl({ version: '1', environment: 'x' })).searchParams;

  assert.match(template, /^labels: \[bug\]$/m);
  for (const id of ['what-happened', 'steps', 'version', 'environment', 'report']) {
    assert.match(template, new RegExp(`^\\s+id: ${id}$`, 'm'), `the form should declare id ${id}`);
  }
  for (const key of params.keys()) {
    if (key !== 'template') {
      assert.match(template, new RegExp(`^\\s+id: ${key}$`, 'm'), `the URL fills ${key}, which the form should declare`);
    }
  }
  assert.equal(params.get('template'), path.basename(templatePath));
});
