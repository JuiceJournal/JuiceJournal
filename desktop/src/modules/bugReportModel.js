/**
 * Bug Report Model
 * Error log and bug report helpers for the main process. Pure: main.js passes in everything they read.
 */

'use strict';

const ERROR_SOURCES = new Set(['main', 'renderer', 'overlay', 'process']);
const ERROR_LEVELS = new Set(['warn', 'error', 'fatal']);
const MAX_FRAMES = 8;
const MAX_RAW_TEXT_LENGTH = 4000;
const MAX_MESSAGE_LENGTH = 500;
const MAX_FRAME_LENGTH = 200;
const MAX_CODE_LENGTH = 40;
const MAX_REPORT_ERRORS = 20;
const MAX_REPORT_ACTIVITY = 10;
const REPORT_ISSUE_URL = 'https://github.com/JuiceJournal/JuiceJournal/issues/new';
// shell.openExternal refuses longer URLs on Windows.
const ISSUE_URL_MAX_LENGTH = 2081;
const MAX_ISSUE_FIELD_LENGTH = 120;
const GAME_NAMES = new Map([['poe1', 'PoE1'], ['poe2', 'PoE2']]);
const PLATFORM_NAMES = new Map([['win32', 'Windows'], ['darwin', 'macOS'], ['linux', 'Linux']]);
// Private leagues are named by their owner and end in their id, for example 'Guild Fun (PL12345)'.
const PRIVATE_LEAGUE_PATTERN = /\(PL\d+\)\s*$/i;
// A name never matches inside a longer word or inside a label such as '<app>' that an earlier pass wrote.
const WORD_START = '(?<![A-Za-z0-9_<>-])';
const WORD_END = '(?![A-Za-z0-9_<>-])';

// Run in this order. Labels they write never match again, so the report can redact log lines a second time.
// These find their text by fixed words ('Bearer', 'is not valid JSON'), so they run before the known names: a
// character named 'Json' would otherwise change those words first.
const EARLY_REDACTION_BACKSTOPS = [
  // V8 quotes up to about 20 characters of the input in a JSON.parse error, journal content included.
  [/, (?:\.\.\.)?"[\s\S]{0,64}?"(?:\.\.\.)? is not valid JSON/g, ', <json> is not valid JSON'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>'],
  [/([?&#](?:code|state|token|access_token|refresh_token|id_token|code_verifier)=)[^&#\s"']+/gi, '$1<redacted>'],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/g, '<token>']
];
// Run after the known names and paths.
const LATE_REDACTION_BACKSTOPS = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>'],
  // Name#1234, also percent-encoded in a URL.
  [/\b\w+(?:#|%23)\d{4}\b/g, '<account>'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>'],
  [/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\s"'`<>:]+/gi, '$1<user>'],
  // A private league nobody named: after 'league:' or 'league=' its whole name goes, elsewhere only its id.
  [/(\bleague(?::\s*|=|\s+))[^\n:;,"'&?=]{1,80}?\s*(?:\(|%28)PL\d+(?:\)|%29)/gi, '$1<private league>'],
  [/(\(|%28)PL\d+(\)|%29)/gi, '$1PL<id>$2'],
  // '/' is not in the class, so a path nobody named stays readable.
  [/[A-Za-z0-9+_=-]{40,}/g, '<redacted>']
];

function normalizeTargetKey(value) {
  return value.toLowerCase().replace(/[\\/]+/g, '/');
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toList(value) {
  return Array.isArray(value) ? value.filter((entry) => entry !== null && entry !== undefined) : [];
}

// 'E:\Games\Path of Exile\logs\Client.txt' -> 'E:\Games\Path of Exile'
function getGameFolder(poePath) {
  return /^(.*?)(?:[\\/]+logs)?[\\/]+[^\\/]*$/i.exec(poePath)?.[1] || '';
}

function buildRedactionTargets({
  userData,
  appPath,
  home,
  username,
  poePaths = [],
  apiUrl,
  leagues = [],
  profiles = [],
  accountStates = []
} = {}) {
  const candidates = [];
  const add = (value, label, kind) => candidates.push({ value, label, kind });
  const characters = toList(accountStates).flatMap((state) => toList(state.characters));

  add(userData, '<userData>', 'path');
  add(appPath, '<app>', 'path');
  add(home, '~', 'path');
  toList(poePaths).forEach((poePath) => add(typeof poePath === 'string' ? getGameFolder(poePath) : null, '<poe>', 'path'));
  add(apiUrl, '<server>', 'path');
  try {
    add(new URL(apiUrl).host, '<server>', 'word');
  } catch {
    // No custom server.
  }
  toList(profiles).forEach((profile) => {
    add(profile.accountName, '<account>', 'word');
    add(profile.poeSub, '<account>', 'word');
  });
  toList(accountStates).forEach((state) => add(state.accountName, '<account>', 'word'));
  characters.forEach((character) => add(character.name, '<character>', 'word'));
  [...toList(leagues), ...characters.map((character) => character.league)]
    .filter((league) => typeof league === 'string' && PRIVATE_LEAGUE_PATTERN.test(league))
    .forEach((league) => add(league, '<private league>', 'word'));
  add(username, '<user>', 'word');

  const seen = new Set();
  return candidates
    .filter(({ value }) => typeof value === 'string')
    .map(({ value, label, kind }) => ({
      value: kind === 'path' ? value.trim().replace(/[\\/]+$/, '') : value.trim(),
      label,
      kind
    }))
    .filter(({ value }) => {
      const key = normalizeTargetKey(value);
      if (value.length < 3 || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.value.length - a.value.length);
}

function encodeTargetValue(value) {
  try {
    return encodeURIComponent(value);
  } catch {
    return value;
  }
}

function redactText(text, targets = []) {
  if (text === null || text === undefined) {
    return '';
  }

  let result = String(text);
  for (const [pattern, replacement] of EARLY_REDACTION_BACKSTOPS) {
    result = result.replace(pattern, replacement);
  }
  if (targets.length > 0) {
    // A name inside a URL is percent-encoded ('Exile%231234'), so each name is matched in that form too.
    const entries = targets
      .flatMap((target) => {
        const encoded = target.kind === 'word' ? encodeTargetValue(target.value) : target.value;
        return encoded === target.value ? [target] : [target, { ...target, value: encoded }];
      })
      .sort((a, b) => b.value.length - a.value.length);
    const labels = new Map();
    const alternatives = entries.map(({ value, label, kind }) => {
      const key = normalizeTargetKey(value);
      if (!labels.has(key)) {
        labels.set(key, label);
      }
      return kind === 'path'
        ? `${value.split(/[\\/]+/).map(escapeRegExp).join('[\\\\/]+')}(?![A-Za-z0-9_-])`
        : `${WORD_START}${escapeRegExp(value)}${WORD_END}`;
    });
    // One pass, so a label written here is never scanned again.
    result = result.replace(
      new RegExp(alternatives.join('|'), 'gi'),
      (match) => labels.get(normalizeTargetKey(match)) || '<redacted>'
    );
  }

  for (const [pattern, replacement] of LATE_REDACTION_BACKSTOPS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function isErrorLike(value) {
  return Object.prototype.toString.call(value) === '[object Error]'
    || (value !== null && typeof value === 'object' && !Array.isArray(value) && typeof value.message === 'string');
}

// Reads only name and message: axios errors carry their request config and headers.
function formatError(error) {
  const message = String(error.message ?? '');
  return typeof error.name === 'string' && error.name && error.name !== 'Error'
    ? `${error.name}: ${message}`
    : message;
}

function formatConsoleArg(arg) {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg === null || ['undefined', 'number', 'boolean', 'bigint'].includes(typeof arg)) {
    return String(arg);
  }
  return '[object]';
}

function getStackFrames(stack) {
  return typeof stack === 'string'
    ? stack.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith('at ')).slice(0, MAX_FRAMES)
    : [];
}

// One error log entry from a thrown value or a console call's arguments. Not redacted yet.
function normalizeErrorEntry({ at, source, level, error } = {}) {
  const args = Array.isArray(error) ? error : [error];
  const firstError = args.find(isErrorLike) || null;
  const errorFrames = firstError ? getStackFrames(firstError.stack) : [];
  const textFrames = [];
  const lines = args
    .map((arg) => (isErrorLike(arg) ? formatError(arg) : formatConsoleArg(arg)))
    .join(' ')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line, index) => {
      // A stack frame never comes first; later 'at ' lines are frames of a printed stack.
      if (index > 0 && line.startsWith('at ')) {
        textFrames.push(line);
        return false;
      }
      // Node's '(Use `electron --trace-warnings ...`)' hint.
      return line !== '' && !line.startsWith('(Use `');
    });
  const frames = errorFrames.length > 0 ? errorFrames : textFrames.slice(0, MAX_FRAMES);
  const code = firstError?.code;

  return {
    at: String(at),
    source: ERROR_SOURCES.has(source) ? source : 'main',
    level: ERROR_LEVELS.has(level) ? level : 'error',
    message: lines.join(' ').replace(/^\(node:\d+\) /, '').slice(0, MAX_RAW_TEXT_LENGTH),
    ...(typeof code === 'string' || typeof code === 'number'
      ? { code: String(code).slice(0, MAX_RAW_TEXT_LENGTH) }
      : {}),
    ...(frames.length > 0 ? { frames } : {})
  };
}

// Redacts first and cuts second, so a token is never cut below the backstop lengths.
function redactErrorEntry(entry, targets) {
  const frames = (entry.frames || []).map((frame) => redactText(frame, targets).slice(0, MAX_FRAME_LENGTH));
  return {
    at: entry.at,
    source: entry.source,
    level: entry.level,
    message: redactText(entry.message, targets).slice(0, MAX_MESSAGE_LENGTH),
    // apiClient passes server error codes through, so a code is redacted like the message.
    ...(entry.code !== undefined ? { code: redactText(entry.code, targets).slice(0, MAX_CODE_LENGTH) } : {}),
    ...(frames.length > 0 ? { frames } : {}),
    ...(entry.repeats > 0 ? { repeats: entry.repeats } : {})
  };
}

// The level a main-process console.warn/error call is logged with, or null to skip it.
function classifyMainConsoleMessage(method, args) {
  const first = typeof args?.[0] === 'string' ? args[0] : '';
  // Electron logs every rejected ipcMain.handle this way; most are expected validation errors.
  if (first.startsWith("Error occurred in handler for '")) {
    return 'warn';
  }
  // Node's generic follow-up line after each unhandled rejection, and its trace hint.
  if (/^\(node:\d+\) UnhandledPromiseRejectionWarning: Unhandled promise rejection\./.test(first)
    || first.startsWith('(Use `')) {
    return null;
  }
  if (/^\(node:\d+\) UnhandledPromiseRejectionWarning: /.test(first)) {
    return 'error';
  }
  if (/^\(node:\d+\) /.test(first)) {
    return 'warn';
  }
  return method === 'error' ? 'error' : 'warn';
}

function shouldRecordRendererMessage(details) {
  const message = String(details?.message ?? '');
  return details?.level === 'error'
    // Chromium prefixes failed IPC calls with 'Uncaught (in promise) Error: '; main already logged them as warnings.
    && !message.includes("Error invoking remote method '")
    // Printed at every window load because both pages set frame-ancestors in a meta CSP; not an app error.
    && !message.includes('is ignored when delivered via a <meta> element');
}

function keepNewestLines(text, { maxLines, maxBytes }) {
  const lines = String(text).split('\n').map((line) => line.replace(/\r$/, '')).filter(Boolean);
  const kept = [];
  let bytes = 0;
  for (let index = lines.length - 1; index >= 0 && kept.length < maxLines; index -= 1) {
    bytes += Buffer.byteLength(lines[index], 'utf8') + 1;
    if (bytes > maxBytes) {
      break;
    }
    kept.unshift(lines[index]);
  }
  return kept.length > 0 ? `${kept.join('\n')}\n` : '';
}

// Newest first. Skips blank, corrupt and half-written lines.
function parseErrorLog(text, limit = 20) {
  const lines = String(text ?? '').split('\n');
  const entries = [];
  for (let index = lines.length - 1; index >= 0 && entries.length < limit; index -= 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }

    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.message !== 'string') {
      continue;
    }

    entries.push({
      at: String(entry.at ?? ''),
      source: ERROR_SOURCES.has(entry.source) ? entry.source : 'main',
      level: ERROR_LEVELS.has(entry.level) ? entry.level : 'error',
      message: entry.message,
      ...(typeof entry.code === 'string' || typeof entry.code === 'number' ? { code: entry.code } : {}),
      frames: Array.isArray(entry.frames)
        ? entry.frames.filter((frame) => typeof frame === 'string').slice(0, MAX_FRAMES)
        : [],
      ...(typeof entry.repeats === 'number' && entry.repeats > 0 ? { repeats: entry.repeats } : {})
    });
  }
  return entries;
}

function formatGame(poeVersion) {
  return GAME_NAMES.get(poeVersion) || 'none';
}

// Private leagues are named by their owner, so the report names public leagues only.
function formatLeague(name) {
  if (typeof name !== 'string' || !name.trim()) {
    return 'not set';
  }
  return PRIVATE_LEAGUE_PATTERN.test(name) ? 'private league' : name.trim();
}

function formatPlatform(platform) {
  return PLATFORM_NAMES.get(platform) || String(platform || 'unknown');
}

function onOff(value) {
  return value ? 'on' : 'off';
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function textOrUnknown(value) {
  return typeof value === 'string' && value ? value : 'unknown';
}

// A header line, then the stack frames indented below it.
function formatErrorEntry(entry) {
  const message = String(entry.message).replace(/\s+/g, ' ').slice(0, MAX_MESSAGE_LENGTH);
  const code = entry.code !== undefined ? ` [code ${entry.code}]` : '';
  const repeats = entry.repeats > 0 ? ` (+${entry.repeats} repeats)` : '';
  return [
    `[${entry.at}] ${entry.source} ${entry.level}: ${message}${code}${repeats}`,
    ...toList(entry.frames).slice(0, MAX_FRAMES).map((frame) => `    ${String(frame).slice(0, MAX_FRAME_LENGTH)}`)
  ];
}

// The text the user pastes into a GitHub issue. Always English, built only from what main collected on this PC.
function buildBugReportText({ generatedAt, app, os, settings, signedIn, sessionActive, localData, errors, activity }) {
  const shownErrors = toList(errors).slice(0, MAX_REPORT_ERRORS);
  const shownActivity = toList(activity).slice(0, MAX_REPORT_ACTIVITY);
  const journalSize = typeof localData.journalBytes === 'number' ? `${localData.journalBytes} bytes` : 'n/a';
  const mapResults = typeof localData.mapResults === 'number' ? localData.mapResults : 'n/a';

  return [
    'Juice Journal bug report',
    `Generated: ${generatedAt}`,
    '',
    app.isPackaged
      ? `App: ${app.version}, installed`
      : `App: ${app.version}, source build, commit ${textOrUnknown(app.commit)}`,
    `Runtime: Electron ${app.electron}, Chromium ${app.chrome}, Node ${app.node}`,
    `OS: ${formatPlatform(os.platform)} ${os.release} ${os.arch}`,
    `Language: ${settings.language}`,
    `Game: ${formatGame(settings.poeVersion)} (last detected: ${formatGame(settings.lastDetectedPoeVersion)})`,
    `Default leagues: PoE1 ${formatLeague(settings.defaultLeaguePoe1)}, PoE2 ${formatLeague(settings.defaultLeaguePoe2)}`,
    `Online features: ${onOff(settings.onlineEnabled)}, custom server: ${yesNo(settings.customServer)}`,
    `Client.txt found: ${yesNo(settings.clientTxtFound)}`,
    `Scan hotkey: ${settings.scanHotkey}`,
    `Notifications: ${onOff(settings.notifications)}, sound: ${onOff(settings.soundNotifications)}, `
      + `auto-start session: ${onOff(settings.autoStartSession)}`,
    `Signed in (local profile): ${yesNo(signedIn)}`,
    `Active session: ${sessionActive ? 'active' : 'none'}`,
    `Local data: journal.json ${journalSize}, map results ${mapResults}, activity entries ${localData.activityEntries}`,
    '',
    `Recent errors (newest first): ${shownErrors.length || 'none'}`,
    ...shownErrors.flatMap(formatErrorEntry),
    '',
    `Recent activity (newest first): ${shownActivity.length || 'none'}`,
    // Keys and times only: an entry's values can hold map names.
    ...shownActivity.map((entry) => `${textOrUnknown(entry.createdAt)} ${textOrUnknown(entry.key)}`)
  ].join('\n');
}

// The two issue form fields the URL fills in. The report itself never goes into the URL.
function buildIssueFields({ app, os, settings }) {
  const build = app.commit ? `source build, ${app.commit}` : 'source build';
  return {
    version: `${app.version} (${app.isPackaged ? 'installed' : build})`,
    environment: `${formatPlatform(os.platform)} ${os.release} ${os.arch}, Electron ${app.electron}, `
      + `${formatGame(settings.poeVersion)}, language ${settings.language}, online ${onOff(settings.onlineEnabled)}`
  };
}

// Printable ASCII only, so the URL stays far below ISSUE_URL_MAX_LENGTH for any input and encodeURIComponent never
// meets a lone surrogate.
function toIssueField(value) {
  return String(value ?? '').replace(/[^\x20-\x7E]/g, '?').slice(0, MAX_ISSUE_FIELD_LENGTH);
}

function buildIssueUrl({ version, environment } = {}) {
  return `${REPORT_ISSUE_URL}?template=bug_report.yml`
    + `&version=${encodeURIComponent(toIssueField(version))}`
    + `&environment=${encodeURIComponent(toIssueField(environment))}`;
}

module.exports = {
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
};
