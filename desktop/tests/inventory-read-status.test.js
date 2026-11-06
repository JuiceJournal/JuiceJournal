const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const desktopRoot = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(desktopRoot, ...parts), 'utf8');
const mainJs = read('main.js');
const preloadJs = read('preload.js');
const appJs = read('src', 'app.js');
const html = read('src', 'index.html');
const css = read('src', 'styles.css');

// The source of one top-level function, found by its signature and matched braces.
function extractFunction(source, name) {
  const start = Math.max(source.indexOf(`async function ${name}(`), source.indexOf(`\nfunction ${name}(`) + 1);
  assert.ok(start > 0 || source.startsWith(`function ${name}(`), `${name}() not found`);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return assert.fail(`${name}() is not closed`);
}

function loadFunctions(source, names, globals) {
  const context = vm.createContext({ console, ...globals });
  for (const name of names) {
    vm.runInContext(`${extractFunction(source, name)}\nthis.${name} = ${name};`, context);
  }
  return context;
}

const plain = (value) => JSON.parse(JSON.stringify(value));

function loadMainStatus({ enabled = true, profile = { id: 'p1' } } = {}) {
  const sent = [];
  const env = { enabled, profile };
  const context = loadFunctions(mainJs, ['noteInventoryRead', 'setInventoryReadBlocked', 'getInventoryReadStatus', 'sendInventoryReadStatus'], {
    inventoryReadStatus: { kind: 'none', at: null, profileId: null },
    inventoryReadBlocked: false,
    store: { get: (key) => (key === 'inventoryReadEnabled' ? env.enabled : undefined) },
    getActiveProfile: () => env.profile,
    mainWindow: { webContents: { send: (...args) => sent.push(plain(args)) } },
    Date
  });
  return { context, sent, env };
}

test('main records a read with its time and profile and sends the status without the profile', () => {
  const { context, sent } = loadMainStatus();

  context.noteInventoryRead('added', { count: 3, mapName: 'Hideout' });

  assert.equal(context.inventoryReadStatus.profileId, 'p1');
  assert.match(context.inventoryReadStatus.at, /^\d{4}-\d\d-\d\dT/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], 'inventory-read-status');
  assert.equal(sent[0][1].kind, 'added');
  assert.equal(sent[0][1].count, 3);
  assert.equal(sent[0][1].mapName, 'Hideout');
  assert.equal('profileId' in sent[0][1], false);
});

test('a window too small covers the last read until it fits again, and only a change is sent', () => {
  const { context, sent } = loadMainStatus();
  context.noteInventoryRead('added', { count: 3, mapName: 'Strand' });

  context.setInventoryReadBlocked(true);
  context.setInventoryReadBlocked(true);
  assert.deepEqual(plain(context.getInventoryReadStatus()), { kind: 'resolution', at: null });

  // The read before it comes back, so an 'added' the player has not seen is not lost.
  context.setInventoryReadBlocked(false);
  context.setInventoryReadBlocked(false);
  assert.equal(context.getInventoryReadStatus().kind, 'added');
  assert.deepEqual(sent.map(([, status]) => status.kind), ['added', 'resolution', 'added']);

  context.noteInventoryRead('saved');
  context.noteInventoryRead('saved');
  assert.equal(sent.length, 5, 'each read updates its time');
});

test('reading off wins over a window too small', () => {
  const { context, env } = loadMainStatus();
  context.setInventoryReadBlocked(true);
  env.enabled = false;
  assert.deepEqual(plain(context.getInventoryReadStatus()), { kind: 'off' });
});

test('the status is off when reading is off and empty when it was recorded for another profile', () => {
  const { context, env } = loadMainStatus();
  context.noteInventoryRead('saved');
  const saved = plain(context.getInventoryReadStatus());
  assert.equal(saved.kind, 'saved');
  assert.equal('profileId' in saved, false);

  env.profile = { id: 'p2' };
  assert.deepEqual(plain(context.getInventoryReadStatus()), { kind: 'none', at: null });
  env.profile = null;
  assert.deepEqual(plain(context.getInventoryReadStatus()), { kind: 'none', at: null });

  env.profile = { id: 'p1' };
  env.enabled = false;
  assert.deepEqual(plain(context.getInventoryReadStatus()), { kind: 'off' });
});

test('nothing is sent while there is no main window', () => {
  const { context } = loadMainStatus();
  context.mainWindow = null;

  assert.doesNotThrow(() => context.noteInventoryRead('saved'));
});

test('adding inventory loot records the added item count and the map name', async () => {
  const noted = [];
  const sent = [];
  const context = loadFunctions(mainJs, ['addInventoryLoot'], {
    localJournal: {
      getSession: () => ({ poeVersion: 'poe2', league: 'L' }),
      addLoot: (journal) => ({ journal, session: { mapName: 'Strand', profitChaos: 5 } })
    },
    readJournal: () => ({}),
    writeJournal: () => {},
    withTimeout: (promise) => promise,
    loadSessionPrices: async () => {},
    SESSION_PRICES_WAIT_MS: 1,
    priceService: { poeVersion: 'poe2', league: 'L', getItemType: () => 'currency', getPriceInfo: () => null },
    readLocalChaosPrice: () => 1,
    crypto: { randomUUID: () => 'id' },
    mainWindow: { webContents: { send: (...args) => sent.push(args[0]) } },
    isOverlayEnabled: () => true,
    showNotification: () => {},
    t: (key) => key,
    noteInventoryRead: (...args) => noted.push(plain(args))
  });

  await context.addInventoryLoot('s1', [{ name: 'Exalted Orb', quantity: 2 }, { name: 'Chaos Orb', quantity: 3 }], 1);

  assert.deepEqual(sent, ['session-loot-updated']);
  assert.deepEqual(noted, [['added', { count: 5, mapName: 'Strand' }]]);
});

test('a map without a name records no map name, and a journal write that fails records nothing', async () => {
  const noted = [];
  const globals = (overrides) => ({
    localJournal: {
      getSession: () => ({ poeVersion: 'poe2', league: 'L' }),
      addLoot: (journal) => ({ journal, session: { mapName: '', profitChaos: 0 } })
    },
    readJournal: () => ({}),
    writeJournal: () => {},
    withTimeout: (promise) => promise,
    loadSessionPrices: async () => {},
    SESSION_PRICES_WAIT_MS: 1,
    priceService: { poeVersion: 'poe2', league: 'L', getItemType: () => 'currency', getPriceInfo: () => null },
    readLocalChaosPrice: () => 1,
    crypto: { randomUUID: () => 'id' },
    mainWindow: null,
    isOverlayEnabled: () => true,
    showNotification: () => {},
    t: (key) => key,
    noteInventoryRead: (...args) => noted.push(plain(args)),
    ...overrides
  });

  await loadFunctions(mainJs, ['addInventoryLoot'], globals({})).addInventoryLoot('s1', [{ name: 'Exalted Orb', quantity: 1 }]);
  assert.deepEqual(noted, [['added', { count: 1, mapName: null }]]);

  noted.length = 0;
  const failing = loadFunctions(mainJs, ['addInventoryLoot'], globals({ writeJournal: () => { throw new Error('disk'); } }));
  await assert.rejects(failing.addInventoryLoot('s1', [{ name: 'Exalted Orb', quantity: 1 }]), /disk/);
  assert.deepEqual(noted, []);
});

test('main wires the watcher, the failure path, the IPC handle and the settings save to the status', () => {
  const watcherBody = extractFunction(mainJs, 'createInventoryWatcher');
  assert.match(watcherBody, /if \(kind === 'resolution' \|\| kind === 'measured'\) \{\s+setInventoryReadBlocked\(kind === 'resolution'\);\s+\} else if \(kind !== 'gain'\) \{\s+noteInventoryRead\(kind\);/);
  assert.ok(watcherBody.includes('noteInventoryRead(\'saveFailed\');'));
  // The failure is recorded before the player is told, in the same catch.
  assert.ok(watcherBody.indexOf('noteInventoryRead(\'saveFailed\')') < watcherBody.indexOf('showInventoryStatus(\'saveFailed\')'));

  assert.ok(extractFunction(mainJs, 'setupIPC').includes("ipcMain.handle('get-inventory-read-status', () => getInventoryReadStatus());"));
  // Left out of the scopes, so only the main window may call it.
  const scopesStart = mainJs.indexOf('const IPC_RENDERER_SCOPES');
  assert.doesNotMatch(mainJs.slice(scopesStart, mainJs.indexOf('});', scopesStart)), /inventory-read-status/);

  const settingsBody = extractFunction(mainJs, 'applyDesktopSettings');
  assert.match(settingsBody, /hasOwnProperty\.call\(settings, 'inventoryReadEnabled'\)\) \{\s+sendInventoryReadStatus\(\);/);
});

test('preload exposes the status read and the event, and lets the listener be removed', () => {
  assert.ok(preloadJs.includes("getInventoryReadStatus: () => ipcRenderer.invoke('get-inventory-read-status'),"));
  assert.ok(preloadJs.includes("ipcRenderer.on('inventory-read-status', (event, data) => callback(data));"));
  const allowed = preloadJs.slice(preloadJs.indexOf('const ALLOWED_CHANNELS'), preloadJs.indexOf('];', preloadJs.indexOf('const ALLOWED_CHANNELS')));
  assert.ok(allowed.includes("'inventory-read-status'"));
});

// The real dictionary and t(), as the renderer has them.
function loadRenderer({ language = 'en', version = 'poe2', user = { id: 'u1' }, status = null, load } = {}) {
  const window = {};
  vm.runInNewContext(read('src', 'modules', 'translations.js'), { window, document: { querySelectorAll: () => [] }, console });
  window._appState = { language };
  window.electronAPI = { getInventoryReadStatus: load || (async () => status) };

  const element = { hidden: true, dataset: {}, title: '' };
  const text = { textContent: '' };
  const context = loadFunctions(appJs, [
    'describeInventoryReadStatus', 'renderInventoryReadStatus', 'setInventoryReadStatus', 'loadInventoryReadStatus'
  ], {
    window,
    state: { currentUser: user, inventoryReadStatus: null },
    elements: { inventoryReadStatus: element, inventoryReadStatusText: text },
    getResolvedLeagueVersion: () => version,
    Date
  });
  return { context, element, text, window };
}

const at = new Date(2026, 10, 5, 14, 7).toISOString();

test('each kind reads as its own text and tone, with the local time as HH:MM', () => {
  const { context, element, text } = loadRenderer();
  const cases = [
    [{ kind: 'saved', at }, 'ok', 'Inventory read · 14:07'],
    [{ kind: 'added', at, count: 4, mapName: 'Strand' }, 'ok', '4 items added to Strand · 14:07'],
    [{ kind: 'added', at, count: 1, mapName: 'Strand' }, 'ok', '1 item added to Strand · 14:07'],
    [{ kind: 'added', at, count: 2, mapName: null }, 'ok', '2 items added to the last map · 14:07'],
    [{ kind: 'noGain', at }, 'ok', 'No new loot · 14:07'],
    [{ kind: 'noBaseline', at }, 'warn', 'Last map not counted · 14:07'],
    [{ kind: 'none', at: null }, 'warn', 'Inventory not read yet. Open it before your next map.'],
    [{ kind: 'resolution', at }, 'warn', 'Not read: needs a 1440p game window'],
    [{ kind: 'saveFailed', at }, 'warn', "Could not save the last map's loot · 14:07"],
    [{ kind: 'off' }, 'muted', 'Inventory reading is off']
  ];

  for (const [status, tone, expected] of cases) {
    context.setInventoryReadStatus(status);
    assert.equal(element.hidden, false, status.kind);
    assert.equal(element.dataset.tone, tone, status.kind);
    assert.equal(text.textContent, expected, status.kind);
  }
});

test('Turkish has its own text for every kind', () => {
  const { context, text } = loadRenderer({ language: 'tr' });
  const cases = [
    [{ kind: 'saved', at }, 'Envanter okundu - 14:07'],
    [{ kind: 'added', at, count: 4, mapName: 'Strand' }, '4 item Strand mapine eklendi - 14:07'],
    [{ kind: 'added', at, count: 1, mapName: null }, '1 item son mapine eklendi - 14:07'],
    [{ kind: 'noGain', at }, 'Yeni loot yok - 14:07'],
    [{ kind: 'noBaseline', at }, 'Son map sayilmadi - 14:07'],
    [{ kind: 'none', at: null }, 'Envanter henuz okunmadi. Sonraki mapten once ac.'],
    [{ kind: 'resolution', at }, 'Okunamadi: 1440p oyun penceresi gerekli'],
    [{ kind: 'saveFailed', at }, 'Son mapin lootu kaydedilemedi - 14:07'],
    [{ kind: 'off' }, 'Envanter okuma kapali']
  ];

  for (const [status, expected] of cases) {
    context.setInventoryReadStatus(status);
    assert.equal(text.textContent, expected, status.kind);
  }
});

test('the line is hidden for PoE 1, for unsupported, for an unknown or missing status and when signed out', () => {
  const hiddenFor = (options, status) => {
    const { context, element } = loadRenderer(options);
    context.setInventoryReadStatus(status);
    return element.hidden;
  };

  assert.equal(hiddenFor({}, { kind: 'saved', at }), false);
  assert.equal(hiddenFor({ version: 'poe1' }, { kind: 'saved', at }), true);
  assert.equal(hiddenFor({}, { kind: 'unsupported', at }), true);
  assert.equal(hiddenFor({}, { kind: 'somethingNew', at }), true);
  assert.equal(hiddenFor({}, null), true);
  assert.equal(hiddenFor({ user: null }, { kind: 'saved', at }), true);
});

test('the line follows the game and the language when they change, without a new status', () => {
  const { context, element, text, window } = loadRenderer({ version: 'poe1' });
  context.setInventoryReadStatus({ kind: 'noGain', at });
  assert.equal(element.hidden, true);

  context.getResolvedLeagueVersion = () => 'poe2';
  context.renderInventoryReadStatus();
  assert.equal(element.hidden, false);
  assert.equal(text.textContent, 'No new loot · 14:07');

  window._appState.language = 'tr';
  context.renderInventoryReadStatus();
  assert.equal(text.textContent, 'Yeni loot yok - 14:07');
});

test('loading asks main for the status and keeps the last one when that fails', async () => {
  const { context, text } = loadRenderer({ status: { kind: 'saved', at } });
  await context.loadInventoryReadStatus();
  assert.equal(text.textContent, 'Inventory read · 14:07');

  context.window.electronAPI.getInventoryReadStatus = async () => {
    throw new Error('gone');
  };
  await context.loadInventoryReadStatus();
  assert.equal(text.textContent, 'Inventory read · 14:07');
});

test('the renderer loads the status with the other tracker data, listens for it and redraws on language and game changes', () => {
  assert.match(extractFunction(appJs, 'refreshTrackerData'), /loadJournalStatus\(\),\s+loadInventoryReadStatus\(\)/);
  assert.ok(appJs.includes('window.electronAPI.onInventoryReadStatus(setInventoryReadStatus);'));
  assert.match(extractFunction(appJs, 'applyLocalizedChrome'), /renderInventoryReadStatus\(\)/);
  assert.match(extractFunction(appJs, 'syncRendererGameContext'), /renderInventoryReadStatus\(\)/);
});

test('Recent Loot holds the hidden status line under its header, and its colours come from the tokens', () => {
  assert.match(
    html,
    /<h3 data-i18n="dashboard.recentLoot">[^<]*<\/h3>\s*<\/div>\s*<p id="inventory-read-status" class="inventory-read-status" hidden><span class="inventory-read-status-dot" aria-hidden="true"><\/span><span id="inventory-read-status-text" class="inventory-read-status-text"><\/span><\/p>\s*<div id="recent-loot-list">/
  );

  const rule = (selector) => css.match(new RegExp(`${selector.replace(/[.[\]"=()]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] || '';
  assert.match(rule('.inventory-read-status'), /font-size: 0\.78rem/);
  assert.doesNotMatch(rule('.inventory-read-status'), /nowrap/);
  assert.match(rule('.inventory-read-status[hidden]'), /display: none/);
  assert.match(rule('.inventory-read-status-dot'), /width: 7px/);
  assert.match(rule('.inventory-read-status-dot'), /rotate\(45deg\)/);
  // The card is narrow: the line wraps, so the time at its end is never cut off.
  assert.doesNotMatch(rule('.inventory-read-status-text'), /nowrap|ellipsis/);
  assert.match(rule('.inventory-read-status-text'), /overflow-wrap: anywhere/);
  assert.match(rule('.inventory-read-status[data-tone="ok"] .inventory-read-status-dot'), /var\(--gain\)/);
  assert.match(rule('.inventory-read-status[data-tone="warn"] .inventory-read-status-dot'), /var\(--gold\)/);
});
