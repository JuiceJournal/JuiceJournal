// Bench only. Launching the app in a throwaway profile, in-page timing helpers, statistics and profile summaries.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { once } = require('events');
const { execFileSync } = require('child_process');
const { _electron: electron } = require('playwright');

const desktopDir = path.join(__dirname, '..');
const bootstrapPath = path.join(__dirname, 'bootstrap.cjs');
const tempRoot = process.env.BENCH_TMP || path.join(os.tmpdir(), 'juice-journal-bench');

const POE_ACCOUNT = {
  sub: 'bench-ggg-account',
  username: 'BenchAccount',
  characters: {
    poe1: [{ id: 'bench-poe1', name: 'BenchRanger', level: 96, class: 'Ranger', ascendancy: 'Deadeye', league: 'Mirage', current: true }],
    poe2: [{ id: 'bench-poe2', name: 'BenchMonk', level: 90, class: 'Monk', ascendancy: 'Invoker', league: 'Fate of the Vaal', current: false }]
  }
};

function createProfile(name) {
  fs.mkdirSync(tempRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tempRoot, `${name}-`));
  const appDataDir = path.join(rootDir, 'app-data');
  const userDataDir = path.join(rootDir, 'user-data');
  const tempDir = path.join(rootDir, 'temp');
  const clientLogPath = path.join(rootDir, 'Client.txt');
  for (const dir of [appDataDir, userDataDir, tempDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(clientLogPath, '');
  fs.writeFileSync(path.join(userDataDir, 'config.json'), JSON.stringify({
    apiUrl: 'http://127.0.0.1:9',
    language: 'en',
    poeVersion: 'poe1',
    lastDetectedPoeVersion: 'poe1',
    poePath: clientLogPath,
    autoStartSession: false,
    overlayEnabled: true,
    notifications: true,
    authToken: null,
    authTokenEncrypted: null,
    currentUserId: null
  }, null, '\t'));
  return { rootDir, appDataDir, userDataDir, tempDir };
}

function removeProfile(profile) {
  fs.rmSync(profile.rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

async function waitForWindow(electronApp, expectedTitle, timeoutMs = 30000) {
  const timeoutAt = Date.now() + timeoutMs;
  while (Date.now() < timeoutAt) {
    for (const page of electronApp.windows()) {
      try {
        if (expectedTitle.test(await page.title())) {
          return page;
        }
      } catch {
        // Still initializing.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for a window matching ${expectedTitle}`);
}

// Runs in the page. `visible` means painted: two animation frames after the DOM changed.
function installPageHelpers() {
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now()))));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Runs `action`, then waits for the table to hold price rows again (or a message row).
  const rowsAfter = async (action, { timeoutMs = 60000 } = {}) => {
    const tbody = document.getElementById('currency-table-body');
    const statusLine = document.getElementById('currency-status');
    let firstChangeAt = null;
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error('Currency rows did not appear'));
      }, timeoutMs);
      const observer = new MutationObserver(() => {
        const now = performance.now();
        firstChangeAt ??= now;
        if (tbody.querySelector('tr.currency-row, td.currency-empty')) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(now);
        }
      });
      observer.observe(tbody, { childList: true });
      observer.observe(statusLine, { childList: true, characterData: true, subtree: true });
    });
    const startedAt = performance.now();
    await action();
    const rowsAt = await done;
    const paintedAt = await frame();
    const result = {
      ms: paintedAt - startedAt,
      domMs: rowsAt - startedAt,
      paintMs: paintedAt - rowsAt,
      firstChangeMs: firstChangeAt - startedAt,
      rows: tbody.querySelectorAll('tr.currency-row').length,
      keptList: currencyState.lastKnown
    };
    if (currencyState.lastKnown) {
      while (currencyState.lastKnown && performance.now() - startedAt < timeoutMs) {
        await sleep(5);
      }
      result.liveMs = (await frame()) - startedAt;
    }
    return result;
  };

  // Resolves once every item icon inside the viewport has loaded (or fell back).
  const visibleIconsSettled = async ({ timeoutMs = 60000 } = {}) => {
    const stopAt = performance.now() + timeoutMs;
    for (;;) {
      const visible = [...document.querySelectorAll('#currency-table-body tr.currency-row')].filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      });
      const images = visible.flatMap((row) => [...row.querySelectorAll('.currency-td-item img')]);
      if (visible.length > 0 && images.every((img) => img.getAttribute('src') && img.complete)) {
        return { at: await frame(), icons: images.length, broken: images.filter((img) => img.naturalWidth === 0).length };
      }
      if (performance.now() > stopAt) {
        throw new Error('Visible icons did not settle');
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  };

  window.__b = {
    frame,
    sleep,
    rowsAfter,
    visibleIconsSettled,
    click(selector) {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`No element for ${selector}`);
      element.click();
    },
    // In the game and league the Dashboard shows, as the page's own Start button asks.
    startMap(mapName) {
      const { poeVersion, league } = getSelectedTrackerContext();
      return window.electronAPI.startSession({ mapName, mapTier: 16, poeVersion, league });
    }
  };
}

async function launchApp(profile, { live = false, marks = false, startupProfileCategories = null } = {}) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const electronApp = await electron.launch({
    args: ['-r', bootstrapPath, desktopDir],
    cwd: desktopDir,
    env: {
      ...env,
      NODE_ENV: 'test',
      JUICE_JOURNAL_FORCE_LIVE_AUTH: '1',
      JUICE_JOURNAL_E2E_POE_ACCOUNT: JSON.stringify(POE_ACCOUNT),
      BENCH_APP_DATA: profile.appDataDir,
      BENCH_USER_DATA: profile.userDataDir,
      BENCH_LIVE: live ? '1' : '0',
      BENCH_LAUNCH_MARKS: marks ? '1' : '0',
      BENCH_STARTUP_PROFILE: startupProfileCategories ? JSON.stringify(startupProfileCategories) : '',
      TMP: profile.tempDir,
      TEMP: profile.tempDir
    }
  });
  const page = await waitForWindow(electronApp, /^Juice Journal$/);
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(installPageHelpers);
  return { electronApp, page };
}

async function signIn(page) {
  await page.locator('#poe-oauth-login').click();
  await page.locator('#login-modal').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.getElementById('username')?.textContent?.trim());
}

async function waitForPricesIdle(electronApp) {
  await electronApp.evaluate(async () => {
    await globalThis.__bench.priceService.syncQueue.catch(() => {});
  });
}

async function closeApp(electronApp) {
  const childProcess = electronApp?.process?.();
  try {
    await electronApp.evaluate(({ app, BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.destroy();
      }
      app.exit(0);
    });
  } catch {
    // Already gone.
  }
  if (childProcess && childProcess.exitCode === null) {
    await Promise.race([once(childProcess, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
    if (childProcess.exitCode === null) {
      childProcess.kill('SIGKILL');
    }
  }
}

// Nearest rank, so a p95 of few runs is an actual run.
function percentile(sorted, quantile) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] : null;
}

const FRAME_GUARD_MS = 100;

const round = (value) => (typeof value === 'number' ? Math.round(value * 100) / 100 : value);

function statsOf(values) {
  const sorted = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
  return {
    runs: sorted.length,
    medianMs: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    minMs: round(sorted[0] ?? null),
    maxMs: round(sorted[sorted.length - 1] ?? null)
  };
}

// Runs `fn` `runs` times plus a warm-up run that is thrown away (unless the metric is about first load).
// `fn` returns { ms, ...other numbers }; the other numbers get their own median and p95 under `parts`.
function createRecorder(results, { scale = 1, log = console.log } = {}) {
  const scaled = (runs, minimum) => Math.max(minimum, Math.round(runs * scale));
  let guardPage = null;

  // A median double rAF, so a sleeping display or a throttled window cannot pass as a slow app.
  const frameCost = () => guardPage.evaluate(async () => {
    const costs = [];
    for (let index = 0; index < 5; index += 1) {
      const startedAt = performance.now();
      await window.__b.frame();
      costs.push(performance.now() - startedAt);
      await window.__b.sleep(30);
    }
    return costs.sort((a, b) => a - b)[2];
  });

  async function waitForHealthyFrames() {
    const stopAt = Date.now() + 120000;
    while (guardPage && (await frameCost()) > FRAME_GUARD_MS) {
      if (Date.now() > stopAt) {
        throw new Error('The window draws too few frames to measure; is the display on?');
      }
      log('waiting: the window draws too few frames');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  async function sample(name, { runs = 15, warmup = true, dataset, note, minRuns = 3 } = {}, fn) {
    const count = scaled(runs, minRuns);
    const total = count + (warmup ? 1 : 0);
    for (let attempt = 1; ; attempt += 1) {
      await waitForHealthyFrames();
      const records = [];
      let warmupRecord = null;
      for (let index = 0; index < total; index += 1) {
        const entry = await fn(index);
        if (warmup && index === 0) {
          warmupRecord = entry;
        } else {
          records.push(entry);
        }
      }
      if (!guardPage || attempt === 3 || (await frameCost()) <= FRAME_GUARD_MS) {
        return record(name, records, { dataset, note, warmupMs: warmupRecord?.ms });
      }
      log(`${name}: frames went bad during the runs, measuring again`);
    }
  }

  function record(name, records, { dataset, note, warmupMs } = {}) {
    const parts = {};
    for (const key of new Set(records.flatMap((entry) => Object.keys(entry)))) {
      if (key !== 'ms') {
        const values = records.map((entry) => entry[key]);
        if (values.some((value) => typeof value === 'number')) {
          const { medianMs, p95Ms } = statsOf(values);
          parts[key] = { median: medianMs, p95: p95Ms };
        }
      }
    }
    const metric = {
      name,
      dataset,
      ...statsOf(records.map((entry) => entry.ms)),
      warmupMs: round(warmupMs),
      parts,
      samples: records.map((entry) => round(entry.ms)),
      note
    };
    results.metrics.push(metric);
    log(`${name}${dataset ? ` [${dataset}]` : ''}: median ${metric.medianMs} ms, p95 ${metric.p95Ms} ms (n=${metric.runs})`);
    return metric;
  }

  return { sample, record, guard: (page) => { guardPage = page; } };
}

// Self time per function of a V8 CPU profile.
function summarizeCpuProfile(profile, top = 15) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const selfUs = new Map();
  const deltas = profile.timeDeltas || [];
  (profile.samples || []).forEach((id, index) => {
    selfUs.set(id, (selfUs.get(id) || 0) + (deltas[index] || 0));
  });
  const byFunction = new Map();
  let totalUs = 0;
  for (const [id, us] of selfUs) {
    const { functionName, url, lineNumber } = nodes.get(id).callFrame;
    const key = `${functionName || '(anonymous)'} ${url ? `${path.basename(url)}:${lineNumber + 1}` : ''}`.trim();
    byFunction.set(key, (byFunction.get(key) || 0) + us);
    totalUs += us;
  }
  return {
    totalMs: round(totalUs / 1000),
    top: [...byFunction.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([fn, us]) => ({ fn, selfMs: round(us / 1000), pct: round((us / totalUs) * 100) }))
  };
}

// Time per event name and thread of a Chrome trace; names nest, so they do not add up.
function summarizeTrace(filePath, { top = 14, wallMs = null } = {}) {
  const { traceEvents } = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const processNames = new Map();
  const threadNames = new Map();
  for (const event of traceEvents) {
    if (event.ph !== 'M') continue;
    if (event.name === 'process_labels' && event.args?.labels) processNames.set(event.pid, event.args.labels);
    if (event.name === 'process_name' && !processNames.has(event.pid)) processNames.set(event.pid, event.args?.name);
    if (event.name === 'thread_name') threadNames.set(`${event.pid}:${event.tid}`, event.args?.name);
  }

  const threads = new Map();
  const timers = new Map();
  const calls = new Map();
  for (const event of traceEvents) {
    const thread = threadNames.get(`${event.pid}:${event.tid}`) || '';
    if (!['CrRendererMain', 'CrBrowserMain', 'Compositor', 'VizCompositorThread'].includes(thread)) continue;
    const key = `${processNames.get(event.pid) || event.pid} / ${thread}`;
    if (event.name === 'TimerFire') {
      timers.set(key, (timers.get(key) || 0) + 1);
    }
    if (event.ph !== 'X' || !event.dur) continue;
    const names = threads.get(key) || new Map();
    const entry = names.get(event.name) || { ms: 0, count: 0 };
    entry.ms += event.dur / 1000;
    entry.count += 1;
    names.set(event.name, entry);
    threads.set(key, names);
    if (event.name === 'FunctionCall' && event.args?.data) {
      const { functionName, url, lineNumber } = event.args.data;
      const callKey = `${key} / ${functionName || '(anonymous)'} ${url ? `${path.basename(url)}:${lineNumber}` : ''}`;
      const call = calls.get(callKey) || { ms: 0, count: 0 };
      call.ms += event.dur / 1000;
      call.count += 1;
      calls.set(callKey, call);
    }
  }

  return {
    wallMs,
    threads: Object.fromEntries([...threads.entries()].map(([key, names]) => [key, [...names.entries()]
      .sort((a, b) => b[1].ms - a[1].ms)
      .slice(0, top)
      .map(([name, { ms, count }]) => ({ name, ms: round(ms), count }))])),
    timerFires: Object.fromEntries(timers),
    functionCalls: [...calls.entries()]
      .sort((a, b) => b[1].ms - a[1].ms)
      .slice(0, top)
      .map(([call, { ms, count }]) => ({ call, ms: round(ms), count }))
  };
}

function otherAppProcesses() {
  const output = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8' });
  return output.split(/\r?\n/)
    .map((line) => line.split('","')[0].replace(/^"/, ''))
    .filter((name) => /^(electron\.exe|PathOfExile.*|Juice Journal.*)$/i.test(name));
}

// How busy the machine is over a short window, in % of all cores.
async function hostBusyPercent(windowMs = 2000) {
  const snapshot = () => os.cpus().reduce((sum, cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return { total: sum.total + total, idle: sum.idle + cpu.times.idle };
  }, { total: 0, idle: 0 });
  const before = snapshot();
  await new Promise((resolve) => setTimeout(resolve, windowMs));
  const after = snapshot();
  return round(100 * (1 - (after.idle - before.idle) / (after.total - before.total)));
}

module.exports = {
  closeApp,
  createProfile,
  createRecorder,
  hostBusyPercent,
  installPageHelpers,
  launchApp,
  otherAppProcesses,
  removeProfile,
  round,
  signIn,
  statsOf,
  summarizeCpuProfile,
  summarizeTrace,
  tempRoot,
  waitForPricesIdle,
  waitForWindow
};
