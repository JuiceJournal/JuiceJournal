// Bench only. Loaded with -r into the Electron main process before main.js, so the app code runs unmodified.
// It points the app at a throwaway profile, plays poe.ninja and the game CDN (unless BENCH_LIVE=1), and keeps timings
// in globalThis.__bench for run.cjs to read: IPC handler time, synchronous file calls, event loop lag and CPU profiles.
const fs = require('fs');
const path = require('path');
const inspector = require('inspector');
const { performance } = require('perf_hooks');
const electron = require('electron');

const { app, ipcMain, powerSaveBlocker, screen, session, Notification } = electron;
const fixtures = require('./fixtures.cjs');

const desktopDir = path.join(__dirname, '..');
const live = process.env.BENCH_LIVE === '1';
const bench = {
  mainStartedAt: Date.now(),
  processCreatedAt: process.getCreationTime(),
  live,
  ipc: {},
  fsSync: {},
  fsOn: false,
  notifications: 0,
  blockedRequests: [],
  iconDownloads: 0,
  iconEpoch: 0,
  stubLatencyMs: Number(process.env.BENCH_STUB_LATENCY_MS || 0),
  iconLatencyMs: Number(process.env.BENCH_ICON_LATENCY_MS || 40),
  liveRequests: []
};
globalThis.__bench = bench;

// ── Throwaway profile ────────────────────────────────────────────────────────
const appDataDir = process.env.BENCH_APP_DATA;
const userDataDir = process.env.BENCH_USER_DATA;
if (!appDataDir || !userDataDir) {
  throw new Error('bench: BENCH_APP_DATA and BENCH_USER_DATA are required; the real profile is never used');
}
app.setPath('appData', appDataDir);
app.setPath('userData', userDataDir);
app.setPath('sessionData', path.join(userDataDir, 'session-data'));

// A window the user drags over the bench window must not throttle it.
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// With the display asleep Chromium draws one frame a second, and every painted number is off by seconds.
app.whenReady().then(() => {
  powerSaveBlocker.start('prevent-display-sleep');
});

// ── Secondary monitor, when there is one ─────────────────────────────────────
if (process.env.BENCH_PRIMARY_SCREEN !== '1') {
  app.whenReady().then(() => {
    const primary = screen.getPrimaryDisplay();
    const target = screen.getAllDisplays().find((display) => display.id !== primary.id);
    bench.displays = screen.getAllDisplays().map(({ bounds, scaleFactor, displayFrequency }) => ({ bounds, scaleFactor, displayFrequency }));
    if (!target) {
      return;
    }
    bench.targetDisplay = { bounds: target.bounds, scaleFactor: target.scaleFactor, displayFrequency: target.displayFrequency };
    screen.getPrimaryDisplay = () => target;
    app.on('browser-window-created', (event, win) => {
      const area = target.workArea;
      const [width, height] = win.getSize();
      win.setBounds({
        x: area.x + Math.max(0, Math.round((area.width - width) / 2)),
        y: area.y + Math.max(0, Math.round((area.height - height) / 2)),
        width: Math.min(width, area.width),
        height: Math.min(height, area.height)
      });
    });
  });
}

// ── IPC handler time ─────────────────────────────────────────────────────────
// `syncMs` is the part that blocks the main process, `ms` includes what the handler awaits.
const rawHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => rawHandle(channel, async (...args) => {
  const startedAt = performance.now();
  const pending = handler(...args);
  const syncMs = performance.now() - startedAt;
  try {
    return await pending;
  } finally {
    const entry = bench.ipc[channel] ||= { calls: 0, ms: 0, syncMs: 0, maxMs: 0 };
    const ms = performance.now() - startedAt;
    entry.calls += 1;
    entry.ms += ms;
    entry.syncMs += syncMs;
    entry.maxMs = Math.max(entry.maxMs, ms);
  }
});

// ── Synchronous file calls on the main process ───────────────────────────────
function fileLabel(target) {
  if (typeof target !== 'string' && !Buffer.isBuffer(target) && !(target instanceof URL)) {
    return 'fd';
  }
  const base = path.basename(String(target));
  if (base.startsWith('journal.json')) return 'journal.json';
  if (base.startsWith('config.json')) return 'config.json';
  return 'other';
}

for (const name of ['readFileSync', 'writeFileSync', 'appendFileSync', 'statSync', 'lstatSync', 'existsSync', 'renameSync',
  'openSync', 'closeSync', 'fsyncSync', 'writeSync', 'readSync', 'readdirSync', 'mkdirSync', 'unlinkSync', 'rmSync', 'chmodSync',
  'chownSync', 'utimesSync', 'accessSync']) {
  const original = fs[name];
  fs[name] = function benchTimedFsCall(...args) {
    if (!bench.fsOn) {
      return original.apply(this, args);
    }
    const startedAt = performance.now();
    try {
      return original.apply(this, args);
    } finally {
      const key = `${name}:${fileLabel(args[0])}`;
      const entry = bench.fsSync[key] ||= { calls: 0, ms: 0, maxMs: 0 };
      const ms = performance.now() - startedAt;
      entry.calls += 1;
      entry.ms += ms;
      entry.maxMs = Math.max(entry.maxMs, ms);
    }
  };
}

// ── Event loop lag ───────────────────────────────────────────────────────────
// A 10 ms timer: how late it fires is how long the main process could not answer anything.
const LAG_INTERVAL_MS = 10;
let lagTimer = null;
let lagSamples = [];
bench.startLag = () => {
  lagSamples = [];
  let last = performance.now();
  clearInterval(lagTimer);
  lagTimer = setInterval(() => {
    const now = performance.now();
    lagSamples.push(Math.max(0, now - last - LAG_INTERVAL_MS));
    last = now;
  }, LAG_INTERVAL_MS);
};
bench.stopLag = () => {
  clearInterval(lagTimer);
  lagTimer = null;
  const sorted = [...lagSamples].sort((a, b) => a - b);
  const at = (quantile) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] : 0);
  return {
    samples: sorted.length,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: sorted.length ? sorted[sorted.length - 1] : 0,
    over50Ms: sorted.filter((lag) => lag > 50).length,
    blockedMs: sorted.filter((lag) => lag > 16).reduce((sum, lag) => sum + lag, 0)
  };
};

// ── CPU profile of the main process ──────────────────────────────────────────
const profiler = new inspector.Session();
const post = (method, params) => new Promise((resolve, reject) => {
  profiler.post(method, params, (error, result) => (error ? reject(error) : resolve(result)));
});
bench.cpuStart = async () => {
  profiler.connect();
  await post('Profiler.enable');
  await post('Profiler.setSamplingInterval', { interval: 250 });
  await post('Profiler.start');
};
if (process.env.BENCH_STARTUP_PROFILE) {
  // A whole launch: the main process from here on, every process's trace from app ready, each require of main.js.
  bench.cpuStart();
  const Module = require('module');
  const moduleRequire = Module.prototype.require;
  bench.mainRequires = [];
  Module.prototype.require = function benchTimedRequire(id) {
    if (!String(this.filename).endsWith('main.js')) {
      return moduleRequire.call(this, id);
    }
    const startedAt = performance.now();
    try {
      return moduleRequire.call(this, id);
    } finally {
      bench.mainRequires.push({ id, ms: performance.now() - startedAt });
    }
  };
  app.whenReady().then(() => electron.contentTracing.startRecording({
    included_categories: JSON.parse(process.env.BENCH_STARTUP_PROFILE),
    excluded_categories: ['*'],
    trace_buffer_size_in_kb: 200000
  }));
}
bench.cpuStop = async (filePath) => {
  const { profile } = await post('Profiler.stop');
  await post('Profiler.disable');
  profiler.disconnect();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(profile));
  return filePath;
};

// ── The app's services, reached without touching main.js ─────────────────────
const PriceService = require(path.join(desktopDir, 'src', 'modules', 'priceService.js'));
const setPoeVersion = PriceService.prototype.setPoeVersion;
PriceService.prototype.setPoeVersion = function benchCapturePriceService(version) {
  if (bench.priceService !== this) {
    bench.priceService = this;
    if (live) {
      const get = this.client.get.bind(this.client);
      this.client.get = async (url, options = {}) => {
        const startedAt = performance.now();
        const record = { path: new URL(url).pathname, type: options.params?.type || null };
        bench.liveRequests.push(record);
        try {
          const response = await get(url, options);
          record.ms = performance.now() - startedAt;
          record.status = response.status;
          record.encodedBytes = Number(response.headers?.['content-length']) || null;
          record.jsonChars = JSON.stringify(response.data).length;
          record.lines = Array.isArray(response.data?.lines) ? response.data.lines.length : null;
          return response;
        } catch (error) {
          record.ms = performance.now() - startedAt;
          record.status = error.response?.status || null;
          record.failed = true;
          throw error;
        }
      };
    }
  }
  return setPoeVersion.call(this, version);
};

const iconCacheModule = require(path.join(desktopDir, 'src', 'modules', 'iconCache.js'));
const { IconCache } = iconCacheModule;
iconCacheModule.IconCache = class extends IconCache {
  constructor(options) {
    super(options);
    bench.iconCache = this;
  }
};
bench.resetIconCache = () => {
  const cache = bench.iconCache;
  fs.rmSync(cache.dir, { recursive: true, force: true });
  cache.entries = null;
  cache.totalBytes = 0;
  cache.failures.clear();
};

// Next sync gets new icon URLs, so the renderer's image cache cannot answer them.
bench.nextIconEpoch = () => {
  bench.iconEpoch += 1;
};

// A write still running would put a kept list back after the folder goes.
const PriceSnapshotStore = require(path.join(desktopDir, 'src', 'modules', 'priceSnapshotStore.js'));
const saveSnapshot = PriceSnapshotStore.prototype.save;
PriceSnapshotStore.prototype.save = function benchCaptureSnapshots(snapshot) {
  bench.priceSnapshots = this;
  return saveSnapshot.call(this, snapshot);
};

bench.clearPrices = async ({ keepSnapshots = false } = {}) => {
  bench.priceService.clearCache();
  bench.priceService.indexStates.clear();
  await bench.priceSnapshots?.writes;
  if (!keepSnapshots) {
    fs.rmSync(path.join(process.env.BENCH_USER_DATA, 'price-snapshots'), { recursive: true, force: true });
  }
};

// What the sync queue ran, so a double sync shows up in the numbers.
const syncPrices = PriceService.prototype.syncPrices;
bench.syncCalls = [];
PriceService.prototype.syncPrices = function benchCountSync(league, options) {
  bench.syncCalls.push({ league, poeVersion: this.poeVersion, full: options?.full !== false });
  return syncPrices.call(this, league, options);
};

// A full sync through the real PriceService, on this thread as in the app.
bench.timedSync = async (league, poeVersion, { full = true, clear = true } = {}) => {
  if (clear) await bench.clearPrices();
  bench.startLag();
  const startedAt = performance.now();
  const status = await bench.priceService.ensureSynced(league, poeVersion, { full, force: true });
  const ms = performance.now() - startedAt;
  return { ms, itemCount: status.itemCount, lag: bench.stopLag() };
};

// ── Seeding and journal timings ──────────────────────────────────────────────
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const readConfig = () => JSON.parse(fs.readFileSync(configPath(), 'utf8'));
const journalDir = () => path.join(app.getPath('userData'), 'profiles', readConfig().activeProfileId);

// Writes what the running app reads next: conf reads the file again on every access.
bench.seedJournal = (runs) => {
  const profileId = readConfig().activeProfileId;
  if (!profileId) {
    throw new Error('bench: nobody is signed in');
  }
  fs.mkdirSync(journalDir(), { recursive: true });
  const journalText = JSON.stringify(fixtures.createJournal(runs), null, '\t');
  fs.writeFileSync(path.join(journalDir(), 'journal.json'), journalText);
  const config = readConfig();
  config[`mapResults:${profileId}`] = fixtures.createMapResults(runs);
  const configText = JSON.stringify(config, null, '\t');
  fs.writeFileSync(configPath(), configText);
  return { runs, journalBytes: Buffer.byteLength(journalText), configBytes: Buffer.byteLength(configText) };
};

// The steps of readJournal and writeJournal, through the same electron-store the app uses, and the model calls of one
// dashboard refresh. Milliseconds per step, one number per repeat.
bench.journalIo = (repeats) => {
  const Store = require(require.resolve('electron-store', { paths: [desktopDir] }));
  const localJournal = require(path.join(desktopDir, 'src', 'modules', 'localJournalModel.js'));
  const store = new Store({ name: 'journal', cwd: journalDir() });
  const file = path.join(journalDir(), 'journal.json');
  const steps = { fileRead: [], jsonParse: [], storeRead: [], stringify: [], storeWrite: [], getPersonalStats: [], listRecentLoot: [], listSessions: [], getActiveSession: [] };
  const time = (step, fn) => {
    const startedAt = performance.now();
    const value = fn();
    steps[step].push(performance.now() - startedAt);
    return value;
  };
  for (let index = 0; index < repeats; index += 1) {
    const text = time('fileRead', () => fs.readFileSync(file, 'utf8'));
    time('jsonParse', () => JSON.parse(text));
    const journal = time('storeRead', () => store.store);
    time('stringify', () => JSON.stringify(journal, null, '\t'));
    time('storeWrite', () => store.set('sessions', journal.sessions));
    const context = { poeVersion: 'poe1', league: 'Mirage' };
    time('getPersonalStats', () => localJournal.getPersonalStats(journal, { period: 'daily', ...context, now: new Date() }));
    time('listRecentLoot', () => localJournal.listRecentLoot(journal, { limit: 6, ...context }));
    time('listSessions', () => localJournal.listSessions(journal, { limit: 50 }));
    time('getActiveSession', () => localJournal.getActiveSession(journal));
  }
  return { journalBytes: fs.statSync(file).size, steps };
};

// ── Launch marks ─────────────────────────────────────────────────────────────
// Set from inside the page by a rAF loop started at dom-ready, so Playwright's attach time is not in the numbers.
if (process.env.BENCH_LAUNCH_MARKS === '1') {
  const script = `(() => {
    const marks = window.__launchMarks = {};
    const stopAt = performance.now() + 30000;
    const painted = (name) => requestAnimationFrame(() => requestAnimationFrame(() => { marks[name] ||= Date.now(); }));
    const text = (id) => document.getElementById(id)?.textContent?.trim() || '';
    const tick = () => {
      const modalHidden = document.getElementById('login-modal')?.classList.contains('hidden');
      const button = document.getElementById('poe-oauth-login');
      if (!modalHidden && button && !button.disabled) painted('guestInteractive');
      if (modalHidden && text('username')) painted('signedInInteractive');
      if (modalHidden && Number(text('today-sessions')) > 0) painted('statsPainted');
      if (performance.now() < stopAt && !(marks.signedInInteractive && marks.statsPainted)) requestAnimationFrame(tick);
    };
    tick();
  })()`;
  const overlayScript = `(() => {
    const tick = () => {
      if (document.querySelector('[data-overlay-mode="map-result"]')) {
        requestAnimationFrame(() => requestAnimationFrame(() => { window.__overlayPaintedAt = Date.now(); }));
      } else {
        requestAnimationFrame(tick);
      }
    };
    tick();
  })()`;
  app.on('web-contents-created', (event, contents) => {
    contents.once('dom-ready', () => {
      if (contents.getURL().endsWith('overlay.html')) {
        contents.executeJavaScript(overlayScript).catch(() => {});
      }
      if (!contents.getURL().endsWith('index.html')) {
        return;
      }
      bench.domReadyAt = Date.now();
      contents.executeJavaScript(script).catch(() => {});
    });
  });
  app.whenReady().then(() => {
    bench.appReadyAt = Date.now();
  });
}

// ── Network stubs ────────────────────────────────────────────────────────────
if (!live) {
  // Sign-in and GGG calls come from the e2e stub; poe.ninja and the CDN are answered here at realistic sizes.
  require(path.join(desktopDir, 'e2e', 'network-stub.cjs'));
  const axios = require(require.resolve('axios', { paths: [desktopDir] }));
  const iconPng = fs.readFileSync(path.join(desktopDir, 'src', 'assets', 'currency', 'poe1', 'chaos.png'));
  const delay = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

  const createClient = axios.create.bind(axios);
  axios.create = (config = {}) => {
    const client = createClient(config);
    const get = client.get.bind(client);
    client.get = async (url, options = {}) => {
      if (!String(url).startsWith('https://poe.ninja/')) {
        return get(url, options);
      }
      await delay(bench.stubLatencyMs);
      // Parsed here on purpose, as axios parses a real response on this thread.
      return { data: JSON.parse(fixtures.ninjaResponseText(url, options.params, bench.iconEpoch, bench.liveSizeFixtures)), headers: {} };
    };
    return client;
  };

  axios.get = async (url) => {
    if (!String(url).startsWith('https://web.poecdn.com/')) {
      throw new Error(`Unexpected request in the bench: ${url}`);
    }
    bench.iconDownloads += 1;
    await delay(bench.iconLatencyMs);
    return { data: iconPng, headers: { 'content-type': 'image/png' } };
  };

  app.whenReady().then(() => {
    session.defaultSession.protocol.handle('https', async (request) => {
      if (new URL(request.url).hostname === 'web.poecdn.com') {
        await delay(bench.iconLatencyMs);
        return new Response(iconPng, { headers: { 'content-type': 'image/png' } });
      }
      bench.blockedRequests.push(new URL(request.url).hostname);
      return new Response('', { status: 503 });
    });
  });
}

// The app's OS notifications would pile up on the user's desktop; the call is counted and dropped.
Notification.prototype.show = function benchDropNotification() {
  bench.notifications += 1;
};

bench.bootstrapMs = Date.now() - bench.mainStartedAt;
