const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Conf = require('conf');

const InventoryWatcher = require('../src/modules/inventoryWatcher');
const { shouldEnableScanHotkeys } = require('../src/modules/hotkeyModel');

const mainJsPath = path.join(__dirname, '..', 'main.js');
const PROFILE = { id: 'profile-1', poeSub: 'sub-1', accountName: 'Exile#1234' };
const SETTINGS_FUNCTIONS = ['loadParsedSettings', 'readParsedSetting', 'watchSettingsWrites'];

// A top-level function of main.js, up to its closing brace in column zero.
function loadFunctions(functionNames, contextOverrides = {}) {
  const source = fs.readFileSync(mainJsPath, 'utf8').replace(/\r\n/g, '\n');
  const context = vm.createContext({ console: { log() {}, warn() {} }, ...contextOverrides });
  for (const functionName of functionNames) {
    const start = source.indexOf(`\nfunction ${functionName}(`);
    assert.notEqual(start, -1, `main.js should define ${functionName}()`);
    const end = source.indexOf('\n}\n', start);
    vm.runInContext(`${source.slice(start, end + 2)};\nthis.${functionName} = ${functionName};`, context);
  }
  return context;
}

// The settings file as the app keeps it, signed in, with a count of how often it is read from disk: conf reads and
// parses the whole file on every get.
function createSettings(t, settings = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jj-tick-settings-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new Conf({ cwd: dir, configName: 'config' });
  for (const [key, value] of Object.entries({ localProfiles: { [PROFILE.id]: PROFILE }, activeProfileId: PROFILE.id, ...settings })) {
    store.set(key, value);
  }
  const disk = { reads: 0 };
  const readFileSync = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', function countedRead(file, ...rest) {
    if (file === store.path) disk.reads += 1;
    return readFileSync.call(this, file, ...rest);
  });
  return { store, disk, readText: () => readFileSync(store.path, 'utf8') };
}

test('the parsed settings stand until the file changes, by this app or from outside', (t) => {
  const { store, disk, readText } = createSettings(t, { defaultLeaguePoe2: 'Standard' });
  const context = loadFunctions(SETTINGS_FUNCTIONS, { fs, store });
  context.watchSettingsWrites();
  // A file time in whole milliseconds, so the test can put the very same time back below.
  const stamp = new Date('2026-11-10T08:00:00.000Z');
  fs.utimesSync(store.path, stamp, stamp);
  disk.reads = 0;

  for (let read = 0; read < 20; read += 1) {
    assert.equal(context.readParsedSetting('defaultLeaguePoe2'), 'Standard');
  }
  assert.equal(context.readParsedSetting('neverSaved'), undefined);
  assert.equal(disk.reads, 1);

  // A write through the app is read back at once, also when it leaves the file with the size and the time it had:
  // Windows stamps files by a clock that may tick only every 15 ms or so, so two writes can carry one time.
  const { size } = fs.statSync(store.path);
  store.set('defaultLeaguePoe2', 'Hardcore');
  fs.utimesSync(store.path, stamp, stamp);
  assert.equal(fs.statSync(store.path).size, size);
  assert.equal(fs.statSync(store.path).mtimeMs, stamp.getTime());
  assert.equal(context.readParsedSetting('defaultLeaguePoe2'), 'Hardcore');

  // An edit from outside is read as well, by the file's time, even one that leaves the size as it was.
  fs.writeFileSync(store.path, readText().replace('"Hardcore"', '"Standard"'));
  fs.utimesSync(store.path, stamp, new Date(stamp.getTime() + 2000));
  assert.equal(fs.statSync(store.path).size, size);
  assert.equal(context.readParsedSetting('defaultLeaguePoe2'), 'Standard');

  // And one that leaves the time as it was, by the file's size.
  fs.writeFileSync(store.path, readText().replace('"Standard"', '"Rise of the Abyssal"'));
  fs.utimesSync(store.path, stamp, new Date(stamp.getTime() + 2000));
  assert.equal(context.readParsedSetting('defaultLeaguePoe2'), 'Rise of the Abyssal');
});

test('a missing settings file is answered by conf and not kept, and a broken one throws as it did', (t) => {
  const { store } = createSettings(t);
  const context = loadFunctions(SETTINGS_FUNCTIONS, { fs, store });
  context.watchSettingsWrites();
  assert.equal(context.readParsedSetting('activeProfileId'), PROFILE.id);

  fs.rmSync(store.path);
  assert.equal(context.readParsedSetting('activeProfileId'), undefined);
  assert.equal(store.parsedSettings, null);
  store.set('activeProfileId', 'profile-2');
  assert.equal(context.readParsedSetting('activeProfileId'), 'profile-2');

  fs.writeFileSync(store.path, '{"activeProfileId": ');
  assert.throws(() => store.get('activeProfileId'), SyntaxError);
  assert.throws(() => context.readParsedSetting('activeProfileId'), SyntaxError);
});

test('main.js starts dropping the parsed settings on a write as soon as the store exists, before anything reads them', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8').replace(/\r\n/g, '\n');
  const watchCall = source.indexOf('\nwatchSettingsWrites();\n');

  assert.notEqual(watchCall, -1, 'main.js should call watchSettingsWrites() at load time');
  assert.ok(source.indexOf('const store = new Store(') < watchCall);
  // The error log and the startup migrations are the first to touch the settings.
  assert.ok(watchCall < source.indexOf('\ninstallErrorCapture();\n'));
});

// The half-second hotkey gate with the real inventory watcher behind it, over real settings and with no game running:
// what the app does every second while it is open.
function loadTickPaths(t, settings) {
  const { store, disk } = createSettings(t, settings);
  const clock = { now: 1_000_000 };
  const calls = { foreground: 0 };
  const context = loadFunctions([...SETTINGS_FUNCTIONS, 'getActiveProfile', 'getGameProcessIds', 'tickInventoryWatcher', 'syncScanHotkeys', 'createInventoryWatcher'], {
    fs,
    store,
    InventoryWatcher,
    shouldEnableScanHotkeys,
    Date: { now: () => clock.now },
    INVENTORY_POLL_MS: 1000,
    lastInventoryTickAt: 0,
    inventoryWatcher: null,
    scanHotkeysActive: false,
    gameDetector: { getDetectedProcesses: () => [], getDetectedGame: () => null },
    win32Probe: {
      getForegroundProcessId() {
        calls.foreground += 1;
        return 4120;
      }
    },
    logParser: null,
    overlayCharacterState: null,
    isGameWindowInFront: () => false,
    getGameWindowRect: () => null,
    listPricedInventoryItems: () => ({ complete: false, items: [] }),
    getInventoryIconPath: () => null,
    loadInventoryArt: () => null,
    showInventoryStatus() {},
    tryRegisterGlobalShortcuts() {},
    globalShortcut: { unregisterAll() {} }
  });
  context.watchSettingsWrites();
  context.inventoryWatcher = context.createInventoryWatcher();
  const runSeconds = (seconds) => {
    for (let pass = 0; pass < seconds * 2; pass += 1) {
      clock.now += 500;
      context.syncScanHotkeys();
    }
  };
  return { context, store, disk, calls, runSeconds };
}

test('the paths that run every second read the settings file once, and again only when it changes', (t) => {
  const { context, store, disk, calls, runSeconds } = loadTickPaths(t);
  const watcher = context.inventoryWatcher;
  disk.reads = 0;

  runSeconds(10);
  assert.equal(disk.reads, 1, 'ten seconds with the app open');
  assert.equal(calls.foreground, 20, 'signed in: the gate looks at the foreground window on every pass');
  assert.equal(watcher.profileId, PROFILE.id);
  assert.equal(watcher.deps.isEnabled(), true);

  // Signing out is seen on the next pass.
  store.set('activeProfileId', null);
  calls.foreground = 0;
  disk.reads = 0;
  runSeconds(2);
  assert.equal(calls.foreground, 0);
  assert.equal(watcher.deps.getProfileId(), null);
  assert.equal(watcher.profileId, null);
  assert.equal(disk.reads, 1);

  // So is another profile signing in, and inventory reading being turned off in Settings.
  store.set('localProfiles', { ...store.get('localProfiles'), 'profile-2': { id: 'profile-2', poeSub: 'sub-2' } });
  store.set('activeProfileId', 'profile-2');
  runSeconds(1);
  assert.equal(watcher.profileId, 'profile-2');
  assert.equal(calls.foreground, 2);
  store.set('inventoryReadEnabled', false);
  assert.equal(watcher.deps.isEnabled(), false);

  // Everything else still reads through the store.
  disk.reads = 0;
  assert.equal(context.getActiveProfile().id, 'profile-2');
  assert.equal(disk.reads, 2);
});

test('the first-read hint asks the parsed settings whether the overlay is on', (t) => {
  const { store, disk } = createSettings(t, { overlayEnabled: false });
  const shown = [];
  const context = loadFunctions([...SETTINGS_FUNCTIONS, 'isOverlayEnabled', 'maybeShowFirstReadNudge'], {
    fs,
    store,
    FIRST_READ_NUDGE_DEBOUNCE_MS: 3000,
    firstReadNudge: { characterKey: null, firstAt: 0, lastAt: 0 },
    firstReadNudgeShown: new Set(),
    overlayStartMapPromptState: null,
    overlayCharacterPromptState: null,
    overlayMapResultState: null,
    showInventoryStatus: (kind) => shown.push(kind)
  });
  context.watchSettingsWrites();
  disk.reads = 0;

  // With the overlay off the watcher reports every second for as long as the player stands in the hideout.
  for (let second = 0; second < 10; second += 1) {
    context.maybeShowFirstReadNudge('poe2:c1', second * 1000);
  }
  assert.equal(disk.reads, 1);
  assert.deepEqual(shown, []);

  store.set('overlayEnabled', true);
  for (let second = 10; second < 14; second += 1) {
    context.maybeShowFirstReadNudge('poe2:c1', second * 1000);
  }
  assert.deepEqual(shown, ['firstRead']);
});

test('the watcher\'s price lookups read the league from the parsed settings', (t) => {
  const { store, disk } = createSettings(t, { poeVersion: 'poe2', lastDetectedPoeVersion: 'poe2', defaultLeaguePoe2: 'Rites' });
  const asked = [];
  const context = loadFunctions([
    ...SETTINGS_FUNCTIONS, 'normalizePoeVersion', 'getLeagueKeyForVersion', 'getLegacyDefaultLeagueForVersion', 'resolveLeagueContext',
    'listPricedInventoryItems', 'createInventoryWatcher'
  ], {
    fs,
    store,
    InventoryWatcher: class { constructor(deps) { this.deps = deps; } },
    gameDetector: null,
    POE2_ESSENCE_ART: [],
    loadSessionPrices: async ({ league }) => {
      asked.push(league);
    },
    // Prices of another league are loaded, as after a look at that league on the Currency page.
    priceService: {
      poeVersion: 'poe2',
      league: 'Standard',
      fullySynced: true,
      revision: 1,
      getStatus: () => ({ itemCount: 1 }),
      listItems: () => [{ name: 'Exalted Orb', icon: 'ex.png', divineValue: 0.01 }]
    },
    isGameWindowInFront: () => true,
    getGameWindowRect: () => null,
    getInventoryIconPath: () => null,
    loadInventoryArt: () => null,
    showInventoryStatus() {}
  });
  context.watchSettingsWrites();
  const { getItemValues } = context.createInventoryWatcher().deps;
  disk.reads = 0;

  // Until the session's own prices are loaded the watcher asks on every tick.
  for (let tick = 0; tick < 10; tick += 1) {
    assert.equal(context.listPricedInventoryItems('poe2').complete, false);
    assert.equal(getItemValues('poe2'), null);
  }
  assert.equal(disk.reads, 1);
  assert.deepEqual([...new Set(asked)], ['Rites']);

  // A league saved in Settings is seen on the next tick.
  store.set('defaultLeaguePoe2', 'Standard');
  assert.equal(context.listPricedInventoryItems('poe2').complete, true);
  assert.equal(getItemValues('poe2').get('Exalted Orb'), 0.01);

  // Asked without the parsed reader, the league still comes through the store, one read for each setting it looks at.
  disk.reads = 0;
  assert.equal(context.resolveLeagueContext({ poeVersion: 'poe2' }).league, 'Standard');
  assert.equal(disk.reads, 4);
});
