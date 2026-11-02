// Bench only. The measurements, one function per area. Timed work runs inside the page (performance.now plus a double
// requestAnimationFrame) or the main process, so Playwright's own round trips are not in the numbers.
const fs = require('fs');
const path = require('path');
const fixtures = require('./fixtures.cjs');
const {
  closeApp, createProfile, hostBusyPercent, installPageHelpers, launchApp, removeProfile, round, signIn, statsOf,
  summarizeCpuProfile, summarizeTrace, waitForPricesIdle, waitForWindow
} = require('./harness.cjs');

const JOURNAL_SIZES = [100, 1000, 5000];
const LEAGUE = 'Mirage';
const POE2_LEAGUE = 'Fate of the Vaal';

function mainEval(electronApp, fn, arg) {
  return electronApp.evaluate(fn, arg);
}

const ipcReset = (electronApp) => mainEval(electronApp, () => {
  globalThis.__bench.ipc = {};
  globalThis.__bench.fsSync = {};
  globalThis.__bench.fsOn = true;
});

const ipcRead = (electronApp) => mainEval(electronApp, () => {
  const bench = globalThis.__bench;
  bench.fsOn = false;
  return { ipc: bench.ipc, fsSync: bench.fsSync };
});

// Per run, with the journal and settings file calls apart: what one refresh or map end costs the main process.
function perRun({ ipc, fsSync }, runs) {
  const ipcPerRun = Object.fromEntries(Object.entries(ipc)
    .sort((a, b) => b[1].syncMs - a[1].syncMs)
    .map(([channel, entry]) => [channel, {
      callsPerRun: round(entry.calls / runs),
      msPerCall: round(entry.ms / entry.calls),
      syncMsPerCall: round(entry.syncMs / entry.calls),
      maxMs: round(entry.maxMs)
    }]));
  const fsPerRun = Object.fromEntries(Object.entries(fsSync)
    .sort((a, b) => b[1].ms - a[1].ms)
    .map(([call, entry]) => [call, { callsPerRun: round(entry.calls / runs), msPerRun: round(entry.ms / runs), maxMs: round(entry.maxMs) }]));
  const totalFsMs = Object.values(fsSync).reduce((sum, entry) => sum + entry.ms, 0);
  return { ipc: ipcPerRun, fsSync: fsPerRun, fsSyncMsPerRun: round(totalFsMs / runs) };
}

async function startSignedIn(name, options) {
  const profile = createProfile(name);
  const { electronApp, page } = await launchApp(profile, options);
  await signIn(page);
  await page.evaluate(() => window.refreshTrackerData());
  await waitForPricesIdle(electronApp);
  return { profile, electronApp, page };
}

async function stop({ profile, electronApp }) {
  await closeApp(electronApp);
  removeProfile(profile);
}

// ── Baseline frame cost ──────────────────────────────────────────────────────
async function frameFloor(page, { sample }) {
  await sample('floor.doubleRaf', { note: 'What the paint wait alone costs: an empty double rAF. Part of every painted number below.' }, () => page.evaluate(async () => {
    const startedAt = performance.now();
    return { ms: (await window.__b.frame()) - startedAt };
  }));
}

// ── Currency ─────────────────────────────────────────────────────────────────
async function currency({ sample, guard }, results) {
  const context = await startSignedIn('currency');
  const { electronApp, page } = context;
  guard(page);
  try {
    await page.evaluate(() => window.__b.click('.nav-btn[data-page="currency"]'));
    await page.waitForSelector('#currency-table-body tr.currency-row');
    await waitForPricesIdle(electronApp);
    await frameFloor(page, { sample });

    const openPage = () => page.evaluate(() => window.__b.rowsAfter(() => window.__b.click('.nav-btn[data-page="currency"]')));
    const leaveToDashboard = async () => {
      await page.evaluate(() => window.__b.click('.nav-btn[data-page="dashboard"]'));
      await page.evaluate(() => window.__b.sleep(700));
    };

    // Cold: main holds no prices and no league list, and the table never listed this league.
    await sample('currency.open.coldCache', { warmup: false, dataset: 'PoE1 quick sync', note: 'Cold prices. 16 exchange types plus UniqueMap with its 300 ms pacing sleep.' }, async () => {
      await leaveToDashboard();
      await mainEval(electronApp, () => globalThis.__bench.clearPrices());
      await page.evaluate(() => {
        currencyState.listedKey = null;
        currencyState.prices = [];
        currencyState.typeCounts = null;
        document.getElementById('currency-table-body').replaceChildren();
        currencyState.renderedList = '';
        currencyState.rowWindow = null;
      });
      const result = await openPage();
      await waitForPricesIdle(electronApp);
      return result;
    });

    await mainEval(electronApp, (_, league) => globalThis.__bench.timedSync(league, 'poe1', { clear: false }), LEAGUE);
    await page.evaluate(() => loadCurrencyPrices());
    await page.evaluate(() => window.__b.sleep(300));

    await sample('currency.open.warmCache', { dataset: `${fixtures.POE1_COUNT} PoE1 prices`, note: 'Prices loaded in main. The previous rows show until these replace them.' }, async () => {
      await leaveToDashboard();
      return openPage();
    });

    // IPC alone, then the render alone.
    await ipcReset(electronApp);
    const pricesIpc = await sample('currency.ipc.getCurrencyPrices', { dataset: `${fixtures.POE1_COUNT} rows`, note: 'Round trip from the renderer: handler plus structured clone.' }, () => page.evaluate(async (league) => {
      const startedAt = performance.now();
      const response = await window.electronAPI.getCurrencyPrices({ poeVersion: 'poe1', league, limit: '500' });
      return { ms: performance.now() - startedAt, rows: response.prices.length };
    }, LEAGUE));
    pricesIpc.main = perRun(await ipcRead(electronApp), pricesIpc.runs + 1).ipc['get-currency-prices'];

    await ipcReset(electronApp);
    const leaguesIpc = await sample('currency.ipc.getCurrencyLeagues', {}, () => page.evaluate(async () => {
      const startedAt = performance.now();
      await window.electronAPI.getCurrencyLeagues('poe1');
      return { ms: performance.now() - startedAt };
    }));
    leaguesIpc.main = perRun(await ipcRead(electronApp), leaguesIpc.runs + 1).ipc['get-currency-leagues'];

    await sample('currency.render.450rows', { dataset: `${fixtures.POE1_COUNT} rows`, note: 'renderCurrencyTable with the rows already in the renderer.' }, () => page.evaluate(async () => {
      const startedAt = performance.now();
      renderCurrencyTable();
      const jsAt = performance.now();
      const paintedAt = await window.__b.frame();
      return { ms: paintedAt - startedAt, jsMs: jsAt - startedAt, paintMs: paintedAt - jsAt };
    }));

    // Type tabs.
    const typeTab = (type) => page.evaluate((value) => window.__b.rowsAfter(() => window.__b.click(`.currency-type-btn[data-type="${value}"]`)), type);
    await sample('currency.typeTab.toSmallTab', { dataset: 'Scarab, 40 rows' }, async () => {
      await typeTab('');
      return typeTab('scarab');
    });
    await sample('currency.typeTab.toAll', { dataset: `All, ${fixtures.POE1_COUNT} rows` }, async () => {
      await typeTab('scarab');
      return typeTab('');
    });

    // Search: includes the page's 300 ms debounce.
    const searches = ['orb', 'card', 'scarab', 'mirror', 'ess', 'oil'];
    await sample('currency.search.keystrokeToRows', { dataset: `${fixtures.POE1_COUNT} prices`, note: 'Includes the 300 ms debounce in setupCurrencyListeners.' }, (index) => page.evaluate(async (value) => {
      const input = document.getElementById('currency-search');
      const result = await window.__b.rowsAfter(() => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      return { ...result, afterDebounceMs: result.ms - 300 };
    }, searches[index % searches.length]));
    await page.evaluate(() => window.__b.rowsAfter(() => clearCurrencySearch()));

    // Sort.
    const sortFields = ['itemName', 'chaosValue', 'change', 'divineValue'];
    await sample('currency.sort.click', { dataset: `${fixtures.POE1_COUNT} rows` }, (index) => page.evaluate((field) => window.__b.rowsAfter(() => {
      window.__b.click(`.currency-table th[data-sort="${field}"] .currency-sort`);
    }), sortFields[index % sortFields.length]));
    await page.evaluate(() => {
      currencyState.sortField = 'chaosValue';
      currencyState.sortDir = 'desc';
      updateCurrencySortHeaders();
      renderCurrencyTable();
    });

    // Row detail.
    await sample('currency.rowDetail.open', {}, () => page.evaluate(async () => {
      const row = document.querySelector('#currency-table-body tr.currency-row');
      const startedAt = performance.now();
      row.click();
      const jsAt = performance.now();
      const paintedAt = await window.__b.frame();
      row.click();
      await window.__b.frame();
      return { ms: paintedAt - startedAt, jsMs: jsAt - startedAt };
    }));

    // Scrolling the list. A long list draws the rows near the screen as the page moves, so this is what that costs.
    await sample('currency.scroll.frames', { runs: 5, dataset: `${fixtures.POE1_COUNT} rows`, note: 'One pass from top to bottom at 80 px per frame. ms: the longest frame. frameMs and frameP95Ms: the frames of that pass.' }, () => page.evaluate(async () => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      await window.__b.frame();
      const bottom = document.documentElement.scrollHeight - window.innerHeight;
      const frames = [];
      let last = performance.now();
      while (window.scrollY < bottom - 1 && frames.length < 2000) {
        window.scrollBy({ top: 80, behavior: 'instant' });
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const now = performance.now();
        frames.push(now - last);
        last = now;
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
      await window.__b.frame();
      frames.sort((a, b) => a - b);
      return { ms: frames.at(-1), frameMs: frames[Math.floor(frames.length / 2)], frameP95Ms: frames[Math.floor(frames.length * 0.95)], frames: frames.length, rowsHeld: document.querySelectorAll('#currency-table-body tr.currency-row').length };
    }));

    // League switch and game toggle: cold reads poe.ninja again, cached finds the overviews still in main's 10 minute cache.
    const switchLeague = (league) => page.evaluate((value) => window.__b.rowsAfter(() => {
      const select = document.getElementById('currency-league');
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }), league);
    const syncCount = () => mainEval(electronApp, () => globalThis.__bench.syncCalls.length);
    let previousSyncs = await syncCount();
    const leagues = ['Standard', LEAGUE];
    await sample('currency.league.switch.coldCache', { dataset: 'Quick sync of the league', note: 'Overview cache cleared before each run.' }, async (index) => {
      await mainEval(electronApp, () => globalThis.__bench.priceService.cache.clear());
      const result = await switchLeague(leagues[index % 2]);
      await waitForPricesIdle(electronApp);
      const syncs = await syncCount();
      const syncsThisRun = syncs - previousSyncs;
      previousSyncs = syncs;
      return { ...result, syncsThisRun };
    });
    await sample('currency.league.switch.cachedOverviews', { dataset: 'Quick sync of the league', note: 'Every overview comes from the cache, but the pacing sleep still runs.' }, async (index) => {
      const result = await switchLeague(leagues[index % 2]);
      await waitForPricesIdle(electronApp);
      return result;
    });
    await switchLeague(LEAGUE);
    await waitForPricesIdle(electronApp);

    const toggleGame = (game) => page.evaluate((value) => window.__b.rowsAfter(() => window.__b.click(`.poe-toggle-btn[data-poe="${value}"]`)), game);
    previousSyncs = await syncCount();
    const toggleRun = async (game, clear) => {
      if (clear) {
        await mainEval(electronApp, () => globalThis.__bench.clearPrices());
      }
      const result = await toggleGame(game);
      await waitForPricesIdle(electronApp);
      const syncs = await syncCount();
      const syncsThisRun = syncs - previousSyncs;
      previousSyncs = syncs;
      await page.evaluate(() => window.__b.sleep(50));
      return { ...result, syncsThisRun };
    };
    await sample('currency.toggle.toPoe2.coldCache', { dataset: `${fixtures.POE2_COUNT} PoE2 prices`, runs: 15 }, async () => {
      await toggleRun('poe1', false);
      return toggleRun('poe2', true);
    });
    await sample('currency.toggle.toPoe1.coldCache', { dataset: 'PoE1 quick sync', runs: 15 }, async () => {
      await toggleRun('poe2', false);
      return toggleRun('poe1', true);
    });
    await sample('currency.toggle.toPoe2.cachedOverviews', { dataset: `${fixtures.POE2_COUNT} PoE2 prices`, runs: 15 }, async () => {
      await toggleRun('poe1', false);
      return toggleRun('poe2', false);
    });
    await sample('currency.toggle.toPoe1.cachedOverviews', { dataset: 'PoE1 quick sync', runs: 15, note: 'Cached overviews, one 300 ms pacing sleep for UniqueMap.' }, async () => {
      await toggleRun('poe2', false);
      return toggleRun('poe1', false);
    });
    // The toggle asks main before the league list answered. What the table then lists against what the page names:
    await toggleGame('poe2');
    await waitForPricesIdle(electronApp);
    await page.evaluate(() => window.__b.sleep(200));
    results.toggleLeagueCheck = await page.evaluate(() => ({
      leagueNamedOnPage: document.getElementById('currency-league').value,
      statusLine: document.getElementById('currency-status').textContent,
      listedKey: currencyState.listedKey
    }));
    results.toggleLeagueCheck.lastSync = await mainEval(electronApp, () => globalThis.__bench.syncCalls.at(-1));
    await toggleGame('poe1');
    await waitForPricesIdle(electronApp);
    await page.evaluate(() => window.__b.sleep(200));

    // Full sync through the real PriceService, network stubbed, nothing rendered.
    const syncRecords = async (name, league, game, runs, note) => {
      const lagRuns = [];
      const metric = await sample(name, { runs, warmup: true, minRuns: 2, dataset: game === 'poe1' ? `${fixtures.POE1_COUNT} PoE1 items` : `${fixtures.POE2_COUNT} PoE2 items`, note }, async () => {
        const { ms, itemCount, lag } = await mainEval(electronApp, (_, args) => globalThis.__bench.timedSync(args.league, args.game), { league, game });
        lagRuns.push(lag);
        return { ms, itemCount, lagMaxMs: lag.maxMs, lagBlockedMs: lag.blockedMs };
      });
      metric.eventLoopLastRun = lagRuns[lagRuns.length - 1];
      return metric;
    };
    await syncRecords('currency.sync.full.stubbed.poe2', POE2_LEAGUE, 'poe2', 15, 'No pacing sleeps in PoE2. Time is parsing and indexing.');
    await syncRecords('currency.sync.full.stubbed.poe1', LEAGUE, 'poe1', 5, '24 item types x 300 ms pacing sleep = 7200 ms of the total, the rest is parsing and indexing.');
    await sample('currency.sync.full.cachedOverviews.poe1', { runs: 5, dataset: `${fixtures.POE1_COUNT} PoE1 items`, note: 'A full sync inside the 10 minute overview cache, as a second click on Sync: no request is sent.' }, async () => {
      const { ms, itemCount, lag } = await mainEval(electronApp, (_, league) => globalThis.__bench.timedSync(league, 'poe1', { clear: false }), LEAGUE);
      return { ms, itemCount, lagMaxMs: lag?.maxMs };
    });

    // The same sync from the page's button: sync, rates, leagues, reload, repaint.
    await page.evaluate((league) => {
      currencyState.league = league;
    }, LEAGUE);
    await sample('currency.sync.buttonToPainted.poe1', { runs: 5, minRuns: 2, dataset: `${fixtures.POE1_COUNT} PoE1 items` }, async () => {
      await mainEval(electronApp, () => globalThis.__bench.priceService.cache.clear());
      return page.evaluate(async () => {
        const startedAt = performance.now();
        await handleCurrencySync();
        return { ms: (await window.__b.frame()) - startedAt };
      });
    });

    // 500 rows, the most the page lists.
    await page.evaluate((rows) => {
      window.__b.rows500 = rows;
    }, fixtures.createPriceRows(500));
    await sample('currency.render.500rows', { dataset: '500 rows, 90% with art', note: 'renderCurrencyTable plus the paint.' }, () => page.evaluate(async () => {
      currencyState.prices = window.__b.rows500;
      currencyState.total = 500;
      currencyState.type = '';
      const startedAt = performance.now();
      renderCurrencyTable();
      const jsAt = performance.now();
      const paintedAt = await window.__b.frame();
      return { ms: paintedAt - startedAt, jsMs: jsAt - startedAt, paintMs: paintedAt - jsAt };
    }));
    await mainEval(electronApp, () => {
      const cache = globalThis.__bench.iconCache;
      cache.queue.length = 0;
    });

    await ipcReset(electronApp);
    const iconIpc = await sample('currency.ipc.resolveCachedIcons', { dataset: '450 URLs', note: 'Round trip for a table full of icon URLs.' }, () => page.evaluate(async () => {
      const urls = window.__b.rows500.map((row) => row.iconUrl).filter(Boolean);
      const startedAt = performance.now();
      await window.electronAPI.resolveCachedIcons(urls);
      return { ms: performance.now() - startedAt };
    }));
    iconIpc.main = perRun(await ipcRead(electronApp), iconIpc.runs + 1).ipc['resolve-cached-icons'];
    await mainEval(electronApp, () => {
      globalThis.__bench.iconCache.queue.length = 0;
    });

    // Icons. Cold: new URLs, empty disk cache, so the page shows remote art while main downloads in the background.
    const iconRun = async () => {
      const result = await page.evaluate(async () => {
        const startedAt = performance.now();
        const rows = await window.__b.rowsAfter(() => loadCurrencyPrices());
        const settled = await window.__b.visibleIconsSettled();
        return { ms: settled.at - startedAt, rowsMs: rows.ms, icons: settled.icons, broken: settled.broken };
      });
      return result;
    };
    const downloadsDrained = () => mainEval(electronApp, async () => {
      const startedAt = performance.now();
      const cache = globalThis.__bench.iconCache;
      while (cache.queue.length > 0 || cache.activeDownloads > 0) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return performance.now() - startedAt;
    });
    await sample('currency.icons.coldCache', { runs: 5, warmup: false, minRuns: 2, note: 'Stubbed CDN answers each icon in 40 ms. Remote art until the background downloads finish.' }, async () => {
      await mainEval(electronApp, async (_, league) => {
        const bench = globalThis.__bench;
        bench.nextIconEpoch();
        bench.iconCache.queue.length = 0;
        bench.resetIconCache();
        await bench.timedSync(league, 'poe1', { full: false });
      }, LEAGUE);
      const result = await iconRun();
      return { ...result, restDownloadedMs: await downloadsDrained() };
    });

    await sample('currency.icons.warm.sameDocument', { dataset: 'Icons on disk, decoded in this page' }, iconRun);

    // A new page load empties the renderer's image cache; the icons come from the disk cache as after a restart.
    await sample('currency.icons.warm.afterReload', { runs: 5, warmup: false, minRuns: 2, dataset: 'Icons on disk, page reloaded' }, async () => {
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await page.locator('#login-modal').waitFor({ state: 'hidden' });
      await page.evaluate(installPageHelpers);
      await page.evaluate(() => window.__b.sleep(1000));
      return page.evaluate(async () => {
        const startedAt = performance.now();
        const rows = await window.__b.rowsAfter(() => window.__b.click('.nav-btn[data-page="currency"]'));
        const settled = await window.__b.visibleIconsSettled();
        return { ms: settled.at - startedAt, rowsMs: rows.ms, icons: settled.icons };
      });
    });

    results.iconDownloadsTotal = await mainEval(electronApp, () => globalThis.__bench.iconDownloads);

    // Cold again, with each request taking what a live poe.ninja request took (median 280 ms): they run one after another.
    const LIVE_REQUEST_MS = 280;
    await mainEval(electronApp, (_, ms) => {
      globalThis.__bench.stubLatencyMs = ms;
    }, LIVE_REQUEST_MS);
    await sample('currency.open.coldCache.liveLatency', { runs: 5, warmup: false, minRuns: 2, dataset: 'PoE1 quick sync, 280 ms per request', note: '17 overviews one at a time. firstChangeMs is the still rows appearing.' }, async () => {
      await leaveToDashboard();
      await mainEval(electronApp, () => globalThis.__bench.clearPrices());
      await page.evaluate(() => {
        currencyState.listedKey = null;
        currencyState.prices = [];
        currencyState.typeCounts = null;
        document.getElementById('currency-table-body').replaceChildren();
        currencyState.renderedList = '';
        currencyState.rowWindow = null;
      });
      const result = await openPage();
      await waitForPricesIdle(electronApp);
      return result;
    });
    // The same open with the list kept by the sync before it: first rows from disk, then the fresh list.
    await sample('currency.open.keptList.liveLatency', { runs: 5, warmup: false, minRuns: 2, dataset: 'PoE1 quick sync, 280 ms per request, kept list on disk', note: 'ms: the kept rows painted. liveMs: the fresh list painted.' }, async () => {
      await leaveToDashboard();
      await waitForPricesIdle(electronApp);
      await mainEval(electronApp, () => globalThis.__bench.clearPrices({ keepSnapshots: true }));
      await page.evaluate(() => {
        currencyState.listedKey = null;
        currencyState.prices = [];
        currencyState.typeCounts = null;
        document.getElementById('currency-table-body').replaceChildren();
        currencyState.renderedList = '';
        currencyState.rowWindow = null;
      });
      const result = await openPage();
      await waitForPricesIdle(electronApp);
      return result;
    });
    await sample('currency.toggle.toPoe2.coldCache.liveLatency', { runs: 5, warmup: false, minRuns: 2, dataset: 'PoE2, 280 ms per request' }, async () => {
      await toggleRun('poe1', false);
      return toggleRun('poe2', true);
    });
    await toggleGame('poe1');
    await waitForPricesIdle(electronApp);
    await mainEval(electronApp, () => {
      globalThis.__bench.stubLatencyMs = 0;
    });

    // Sizes the live run found: 4696 PoE1 prices after a full sync, not 450. The page still lists 500 at most.
    await mainEval(electronApp, () => {
      globalThis.__bench.liveSizeFixtures = true;
    });
    const liveDataset = 'Live sizes, 11 MB JSON';
    const liveSync = await syncRecords('currency.sync.full.stubbed.poe1.liveSize', LEAGUE, 'poe1', 3, 'The line counts live poe.ninja sent. 7200 ms of the total is pacing sleep.');
    liveSync.dataset = liveDataset;
    await page.evaluate(() => {
      currencyState.type = '';
    });
    await page.evaluate(() => window.__b.rowsAfter(() => loadCurrencyPrices()));
    await ipcReset(electronApp);
    const liveIpc = await sample('currency.ipc.getCurrencyPrices.liveSize', { dataset: liveDataset, note: 'queryPrices over all prices and the clone of the top 500.' }, () => page.evaluate(async (league) => {
      const startedAt = performance.now();
      const response = await window.electronAPI.getCurrencyPrices({ poeVersion: 'poe1', league, limit: '500' });
      return { ms: performance.now() - startedAt, rows: response.prices.length, total: response.total };
    }, LEAGUE));
    liveIpc.main = perRun(await ipcRead(electronApp), liveIpc.runs + 1).ipc['get-currency-prices'];
    await sample('currency.typeTab.toAll.liveSize', { dataset: `${liveDataset}, 500 rows` }, async () => {
      await typeTab('scarab');
      return typeTab('');
    });
    await sample('currency.search.keystrokeToRows.liveSize', { dataset: liveDataset, note: 'Includes the 300 ms debounce.' }, (index) => page.evaluate(async (value) => {
      const input = document.getElementById('currency-search');
      const result = await window.__b.rowsAfter(() => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      return { ...result, afterDebounceMs: result.ms - 300 };
    }, searches[index % searches.length]));
    await page.evaluate(() => window.__b.rowsAfter(() => clearCurrencySearch()));
    await mainEval(electronApp, () => {
      globalThis.__bench.liveSizeFixtures = false;
    });
  } finally {
    await stop(context);
  }
}

// ── Dashboard, Sessions, overlay after a map ─────────────────────────────────
async function dashboard({ sample, guard }, results, sizes = JOURNAL_SIZES) {
  for (const size of sizes) {
    const dataset = `${size} runs`;
    const context = await startSignedIn(`dashboard-${size}`);
    const { electronApp, page } = context;
    guard(page);
    try {
      const seeded = await mainEval(electronApp, (_, runs) => globalThis.__bench.seedJournal(runs), size);
      (results.journalFiles ||= {})[size] = seeded;
      await mainEval(electronApp, (_, league) => globalThis.__bench.priceService.ensureSynced(league, 'poe1', { full: true }), LEAGUE);
      await page.evaluate(() => window.refreshTrackerData());
      const shown = await page.evaluate(() => document.getElementById('today-sessions').textContent);
      (results.todaySessionsShown ||= {})[size] = shown;

      // refreshTrackerData, on the Dashboard page.
      const refresh = (options) => page.evaluate(async (refreshOptions) => {
        const startedAt = performance.now();
        await window.refreshTrackerData(refreshOptions);
        const doneAt = performance.now();
        const paintedAt = await window.__b.frame();
        return { ms: paintedAt - startedAt, excludingCoalesceMs: doneAt - startedAt - 300, paintMs: paintedAt - doneAt };
      }, options);

      await ipcReset(electronApp);
      await mainEval(electronApp, () => globalThis.__bench.startLag());
      const refreshMetric = await sample('dashboard.refreshTrackerData', { dataset, note: 'Includes its 300 ms coalescing wait; see parts.excludingCoalesceMs.' }, () => refresh({}));
      refreshMetric.eventLoop = await mainEval(electronApp, () => globalThis.__bench.stopLag());
      Object.assign(refreshMetric, { main: perRun(await ipcRead(electronApp), refreshMetric.runs + 1) });

      const withSessions = await sample('dashboard.refreshTrackerData.includeSessions', { dataset }, () => refresh({ includeSessions: true }));
      withSessions.note = 'As after a map ends.';

      // Sessions page.
      await ipcReset(electronApp);
      const sessionsMetric = await sample('sessions.open', { dataset, note: 'Click to the first 50 rows painted.' }, async () => {
        await page.evaluate(async () => {
          window.__b.click('.nav-btn[data-page="dashboard"]');
          await window.__b.sleep(500);
        });
        return page.evaluate(async () => {
          const list = document.getElementById('sessions-list');
          const done = new Promise((resolve) => {
            const observer = new MutationObserver(() => {
              if (list.querySelector('.session-item')) {
                observer.disconnect();
                resolve(performance.now());
              }
            });
            observer.observe(list, { childList: true, subtree: true });
          });
          const startedAt = performance.now();
          window.__b.click('.nav-btn[data-page="sessions"]');
          const rowsAt = await done;
          const paintedAt = await window.__b.frame();
          return { ms: paintedAt - startedAt, domMs: rowsAt - startedAt, paintMs: paintedAt - rowsAt, rows: list.querySelectorAll('.session-item').length };
        });
      });
      sessionsMetric.main = perRun(await ipcRead(electronApp), sessionsMetric.runs + 1).ipc['get-sessions'];
      await page.evaluate(async () => {
        window.__b.click('.nav-btn[data-page="dashboard"]');
        await window.__b.sleep(500);
      });

      // A map ending: from the end call to the Today's Summary numbers painted, and to the overlay card painted.
      let overlayPage = null;
      let runIndex = 0;
      const mapEnd = async () => {
        runIndex += 1;
        await page.evaluate(async (index) => {
          await window.__b.startMap(`Bench Map ${index}`);
          await window.__b.sleep(350);
          await window.refreshTrackerData();
          await window.__b.sleep(100);
        }, runIndex);
        overlayPage ||= await waitForWindow(electronApp, /Juice Journal Overlay/i);
        await overlayPage.evaluate(() => {
          window.__overlayPaintedAt = null;
          const card = document.querySelector('[data-overlay-state]');
          const observer = new MutationObserver(() => {
            if (card.dataset.overlayMode === 'map-result') {
              observer.disconnect();
              requestAnimationFrame(() => requestAnimationFrame(() => {
                window.__overlayPaintedAt = Date.now();
              }));
            }
          });
          observer.observe(card, { attributes: true, attributeFilter: ['data-overlay-mode'] });
        });
        const result = await page.evaluate(async (index) => {
          const count = document.getElementById('today-sessions');
          const profit = document.getElementById('today-profit');
          const before = count.textContent;
          let countChangedAt = null;
          let lastProfitChangeAt = null;
          const countObserver = new MutationObserver(() => {
            if (count.textContent !== before) countChangedAt ??= performance.now();
          });
          countObserver.observe(count, { childList: true, characterData: true, subtree: true });
          const profitObserver = new MutationObserver(() => {
            if (countChangedAt !== null) lastProfitChangeAt = performance.now();
          });
          profitObserver.observe(profit, { childList: true, characterData: true, subtree: true });

          const wallStartedAt = Date.now();
          const startedAt = performance.now();
          await window.electronAPI.endSession({ totalLootChaos: 600, profitChaos: 500 + index, durationSeconds: 120 });
          const endCallAt = performance.now();
          while (countChangedAt === null) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            if (performance.now() - startedAt > 30000) throw new Error('Today\'s numbers did not change');
          }
          const firstPaintedAt = await window.__b.frame();
          // The profit rolls for 450 ms (countUp). It has settled once it stops changing.
          while (lastProfitChangeAt === null || performance.now() - lastProfitChangeAt < 150) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            if (performance.now() - startedAt > 30000) break;
          }
          countObserver.disconnect();
          profitObserver.disconnect();
          return {
            ms: firstPaintedAt - startedAt,
            endCallMs: endCallAt - startedAt,
            settledMs: lastProfitChangeAt - startedAt,
            wallStartedAt
          };
        }, runIndex);
        const overlayPaintedAt = await overlayPage.evaluate(async () => {
          const stopAt = Date.now() + 10000;
          while (!window.__overlayPaintedAt && Date.now() < stopAt) {
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          return window.__overlayPaintedAt;
        });
        await page.evaluate(async () => {
          await window.electronAPI.dismissMapResultOverlay();
          await window.__b.sleep(50);
        });
        const { wallStartedAt, ...timings } = result;
        return { ...timings, overlayPaintedMs: overlayPaintedAt ? overlayPaintedAt - wallStartedAt : undefined };
      };

      await ipcReset(electronApp);
      await mainEval(electronApp, () => globalThis.__bench.startLag());
      const mapEndMetric = await sample('dashboard.mapEnd.toNumbersPainted', {
        dataset,
        note: 'ms: end call to the new count and first rolled amount painted. parts.settledMs: the amount done rolling (450 ms countUp). parts.overlayPaintedMs: overlay card painted. Each run also starts a map, which is in the event loop and file numbers.'
      }, mapEnd);
      mapEndMetric.eventLoop = await mainEval(electronApp, () => globalThis.__bench.stopLag());
      mapEndMetric.main = perRun(await ipcRead(electronApp), mapEndMetric.runs + 1);

      // Overlay: result to painted, with the journal out of the way.
      if (size === sizes[0]) {
        await sample('overlay.mapResult.toPainted', { note: 'showMapResultOverlay from the renderer to the card painted in the overlay window. Across two processes, by Date.now.' }, async (index) => {
          await overlayPage.evaluate(() => {
            window.__overlayPaintedAt = null;
            const card = document.querySelector('[data-overlay-state]');
            const observer = new MutationObserver(() => {
              if (card.dataset.overlayMode === 'map-result') {
                observer.disconnect();
                requestAnimationFrame(() => requestAnimationFrame(() => {
                  window.__overlayPaintedAt = Date.now();
                }));
              }
            });
            observer.observe(card, { attributes: true, attributeFilter: ['data-overlay-mode'] });
          });
          const started = await page.evaluate(async (run) => {
            const startedAt = Date.now();
            await window.electronAPI.showMapResultOverlay({
              id: `bench-overlay-${run}`,
              farmType: 'Ritual',
              durationSeconds: 300,
              netProfit: 200 + run,
              poeVersion: 'poe1',
              lootItemCount: 4,
              topOutputs: [{ label: 'Divine Orb', quantityDelta: 1, valueDelta: 150 }]
            });
            return { startedAt, ipcMs: Date.now() - startedAt };
          }, index);
          const paintedAt = await overlayPage.evaluate(async () => {
            const stopAt = Date.now() + 10000;
            while (!window.__overlayPaintedAt && Date.now() < stopAt) {
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            return window.__overlayPaintedAt;
          });
          await page.evaluate(async () => {
            await window.electronAPI.dismissMapResultOverlay();
            await window.__b.sleep(100);
          });
          return { ms: paintedAt - started.startedAt, ipcMs: started.ipcMs };
        });
      }
    } finally {
      await stop(context);
    }
  }
}

// ── Main-process journal I/O ─────────────────────────────────────────────────
async function journalIo({ record, guard }, results, sizes = JOURNAL_SIZES) {
  guard(null);
  const context = await startSignedIn('journal-io');
  const { electronApp } = context;
  try {
    for (const size of sizes) {
      await mainEval(electronApp, (_, runs) => globalThis.__bench.seedJournal(runs), size);

      const { journalBytes, steps } = await mainEval(electronApp, (_, repeats) => globalThis.__bench.journalIo(repeats), size >= 5000 ? 10 : 16);
      for (const [step, values] of Object.entries(steps)) {
        const kept = values.slice(1);
        record(`main.journal.${step}`, kept.map((ms) => ({ ms })), {
          dataset: `${size} runs, ${(journalBytes / 1048576).toFixed(1)} MB`,
          warmupMs: values[0]
        });
      }
    }
  } finally {
    await stop(context);
  }
}

// ── Idle while a map runs ────────────────────────────────────────────────────
const RENDERER_METRICS = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount'];

async function idle({ sample, guard }, results, { windowMs = 15000, runs = 5 } = {}) {
  const context = await startSignedIn('idle');
  const { electronApp, page } = context;
  guard(page);
  try {
    await mainEval(electronApp, (_, count) => globalThis.__bench.seedJournal(count), 1000);
    await mainEval(electronApp, (_, league) => globalThis.__bench.priceService.ensureSynced(league, 'poe1', { full: true }), LEAGUE);
    await page.evaluate(() => window.refreshTrackerData());
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');

    const measureWindow = async () => {
      const metricsNow = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));
      const before = await metricsNow();
      await mainEval(electronApp, ({ app }) => {
        app.getAppMetrics();
        globalThis.__bench.startLag();
      });
      const hidden = await page.evaluate(() => document.hidden);
      await new Promise((resolve) => setTimeout(resolve, windowMs));
      const { metrics, lag } = await mainEval(electronApp, ({ app }) => ({
        metrics: app.getAppMetrics().map(({ type, cpu, serviceName, name }) => ({ type, name: name || serviceName || '', percent: cpu.percentCPUUsage, wakeups: cpu.idleWakeupsPerSecond })),
        lag: globalThis.__bench.stopLag()
      }));
      const after = await metricsNow();
      const seconds = windowMs / 1000;
      const delta = Object.fromEntries(RENDERER_METRICS.map((name) => [name, after[name] - before[name]]));
      const percentByType = {};
      for (const entry of metrics) {
        percentByType[entry.type] = (percentByType[entry.type] || 0) + entry.percent;
      }
      return {
        ms: delta.TaskDuration * 1000 / seconds,
        mainProcessCpuPercent: percentByType.Browser,
        rendererCpuPercent: percentByType.Tab,
        gpuCpuPercent: percentByType.GPU,
        allProcessesCpuPercent: metrics.reduce((sum, entry) => sum + entry.percent, 0),
        rendererScriptMsPerSec: delta.ScriptDuration * 1000 / seconds,
        layoutsPerSec: delta.LayoutCount / seconds,
        styleRecalcsPerSec: delta.RecalcStyleCount / seconds,
        mainLoopLagMaxMs: lag.maxMs,
        mainLoopBlockedMs: lag.blockedMs,
        documentHidden: hidden ? 1 : 0
      };
    };

    await sample('idle.noMap.rendererTaskMsPerSec', { runs, warmup: true, minRuns: 2, dataset: `${windowMs / 1000} s windows, Dashboard`, note: 'ms: renderer main thread busy per second. parts hold CPU % by process (100% = one core).' }, measureWindow);

    // Clock tick cost, with a running map and the overlay showing its own clock.
    await page.evaluate(() => window.__b.startMap('Bench Running Map'));
    await page.evaluate(() => window.__b.sleep(1000));
    await page.evaluate(() => {
      const original = updateActiveSessionClock;
      window.__clockStats = { ticks: 0, ms: 0, max: 0 };
      window.updateActiveSessionClock = function benchTimedClock() {
        const startedAt = performance.now();
        original();
        const ms = performance.now() - startedAt;
        window.__clockStats.ticks += 1;
        window.__clockStats.ms += ms;
        window.__clockStats.max = Math.max(window.__clockStats.max, ms);
      };
      stopSessionClock();
      startSessionClock();
    });
    await sample('idle.mapRunning.rendererTaskMsPerSec', { runs, warmup: true, minRuns: 2, dataset: `${windowMs / 1000} s windows, Dashboard, overlay shown`, note: 'ms: renderer main thread busy per second. parts hold CPU % by process (100% = one core).' }, measureWindow);
    results.clockTick = await page.evaluate(() => ({
      ticks: window.__clockStats.ticks,
      jsMsPerTick: window.__clockStats.ms / Math.max(1, window.__clockStats.ticks),
      maxMs: window.__clockStats.max
    }));

    // The same state in a trace: who fires timers and how often.
    const traceFile = path.join(results.artifactsDir, 'trace-idle-map-running.json');
    await startTrace(electronApp);
    await new Promise((resolve) => setTimeout(resolve, windowMs));
    await stopTrace(electronApp, traceFile);
    results.idleTrace = summarizeTrace(traceFile, { wallMs: windowMs });
    await page.evaluate(() => window.electronAPI.endSession({ totalLootChaos: 1, profitChaos: 1, durationSeconds: 30 }));
  } finally {
    await stop(context);
  }
}

const TRACE_CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'loading', 'toplevel', '__metadata'];

function startTrace(electronApp) {
  return electronApp.evaluate(({ contentTracing }, categories) => contentTracing.startRecording({
    included_categories: categories,
    excluded_categories: ['*'],
    trace_buffer_size_in_kb: 200000
  }), TRACE_CATEGORIES);
}

function stopTrace(electronApp, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return electronApp.evaluate(({ contentTracing }, target) => contentTracing.stopRecording(target), filePath);
}

// ── App launch ───────────────────────────────────────────────────────────────
async function launch({ record, guard }, results, { runs = 5 } = {}) {
  guard(null);
  const frameCheck = (page) => page.evaluate(async () => {
    const startedAt = performance.now();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - startedAt;
  });
  const readMarks = async (electronApp, page, name, timeoutMs = 30000) => {
    await page.waitForFunction((mark) => window.__launchMarks?.[mark], name, { timeout: timeoutMs });
    return page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByName('first-contentful-paint')[0];
      return {
        marks: window.__launchMarks,
        timeOrigin: performance.timeOrigin,
        domContentLoaded: navigation?.domContentLoadedEventEnd,
        load: navigation?.loadEventEnd,
        fcp: paint?.startTime
      };
    });
  };
  const launchTimes = (electronApp) => electronApp.evaluate(() => {
    const { processCreatedAt, mainStartedAt, appReadyAt, domReadyAt } = globalThis.__bench;
    return { processCreatedAt, mainStartedAt, appReadyAt, domReadyAt };
  });

  // First run with an empty profile.
  const guest = [];
  for (let index = 0; index < runs + 2; index += 1) {
    const profile = createProfile('launch-guest');
    const spawnAt = Date.now();
    const { electronApp, page } = await launchApp(profile, { marks: true });
    try {
      const info = await readMarks(electronApp, page, 'guestInteractive');
      const times = await launchTimes(electronApp);
      guest.push({
        ms: info.marks.guestInteractive - times.processCreatedAt,
        fromSpawnMs: info.marks.guestInteractive - spawnAt,
        bootstrapToMainMs: times.mainStartedAt - times.processCreatedAt,
        appReadyMs: times.appReadyAt - times.processCreatedAt,
        rendererNavStartMs: info.timeOrigin - times.processCreatedAt,
        rendererDomContentLoadedMs: info.domContentLoaded,
        rendererFcpMs: info.fcp,
        frameCheckMs: await frameCheck(page)
      });
    } finally {
      await closeApp(electronApp);
      removeProfile(profile);
    }
  }
  record('app.launch.toInteractive.guest', guest, { dataset: 'New profile, login shown', note: 'Process created to the sign-in button painted. Run under Playwright, which adds its debugger attach.' });

  // Signed-in restores at two journal sizes, then the Currency page right after.
  for (const size of [100, 5000]) {
    const profile = createProfile(`launch-${size}`);
    const first = await launchApp(profile);
    await signIn(first.page);
    await first.page.evaluate(() => window.refreshTrackerData());
    await waitForPricesIdle(first.electronApp);
    await first.electronApp.evaluate((_, runCount) => globalThis.__bench.seedJournal(runCount), size);
    await closeApp(first.electronApp);

    const signedIn = [];
    const currencyOpen = [];
    const overlayFirstShow = [];
    for (let index = 0; index < runs + 1; index += 1) {
      const { electronApp, page } = await launchApp(profile, { marks: true });
      try {
        const info = await readMarks(electronApp, page, 'statsPainted', 60000);
        const times = await launchTimes(electronApp);
        signedIn.push({
          ms: info.marks.signedInInteractive - times.processCreatedAt,
          statsPaintedMs: info.marks.statsPainted - times.processCreatedAt,
          rendererFcpMs: info.fcp,
          frameCheckMs: await frameCheck(page)
        });
        await page.evaluate(installPageHelpers);
        currencyOpen.push(await page.evaluate(() => window.__b.rowsAfter(() => window.__b.click('.nav-btn[data-page="currency"]'))));
        // No map ran yet, so the overlay window does not exist until this result asks for it.
        const startedAt = await page.evaluate(async () => {
          const at = Date.now();
          await window.electronAPI.showMapResultOverlay({ id: 'bench-first', farmType: 'Ritual', durationSeconds: 300, netProfit: 200, poeVersion: 'poe1', lootItemCount: 4 });
          return at;
        });
        const overlayPage = await waitForWindow(electronApp, /Juice Journal Overlay/i);
        await overlayPage.waitForFunction(() => window.__overlayPaintedAt);
        overlayFirstShow.push({ ms: (await overlayPage.evaluate(() => window.__overlayPaintedAt)) - startedAt });
      } finally {
        await closeApp(electronApp);
      }
    }
    removeProfile(profile);
    record('app.launch.toInteractive.signedIn', signedIn.slice(1), {
      dataset: `${size} runs in the journal`,
      warmupMs: signedIn[0].ms,
      note: 'Process created to the signed-in UI painted. parts.statsPaintedMs: Today\'s Summary filled.'
    });
    record('currency.open.firstAfterLaunch', currencyOpen.slice(1), {
      dataset: `${size} runs in the journal`,
      warmupMs: currencyOpen[0].ms,
      note: 'First click on Currency right after launch. Cold prices, possibly behind the Dashboard\'s own sync.'
    });
    record('overlay.firstShow.windowCreated', overlayFirstShow.slice(1), {
      dataset: `${size} runs in the journal`,
      warmupMs: overlayFirstShow[0].ms,
      note: 'A map result when the overlay window does not exist yet. A started map creates it earlier in normal play.'
    });
  }
}

// ── Profiles of the slowest items ────────────────────────────────────────────
async function profiles({ sample, guard }, results) {
  const artifacts = results.artifactsDir;
  const out = (results.profiles = {});

  // A whole launch to the sign-in button.
  const startupProfile = createProfile('startup');
  const started = await launchApp(startupProfile, { marks: true, startupProfileCategories: TRACE_CATEGORIES });
  try {
    await started.page.waitForFunction(() => window.__launchMarks?.guestInteractive);
    const traceFile = path.join(artifacts, 'startup.trace.json');
    const cpuFile = path.join(artifacts, 'startup.main.cpuprofile');
    await stopTrace(started.electronApp, traceFile);
    await started.electronApp.evaluate((_, target) => globalThis.__bench.cpuStop(target), cpuFile);
    out['startup.trace'] = summarizeTrace(traceFile, { top: 25 });
    out['startup.main'] = summarizeCpuProfile(JSON.parse(fs.readFileSync(cpuFile, 'utf8')), 25);
    out.startupTimes = await started.electronApp.evaluate(() => {
      const bench = globalThis.__bench;
      return {
        bootstrapMs: bench.bootstrapMs,
        processCreatedToBootstrapMs: bench.mainStartedAt - bench.processCreatedAt,
        processCreatedToAppReadyMs: bench.appReadyAt - bench.processCreatedAt,
        slowestMainRequires: [...bench.mainRequires].sort((a, b) => b.ms - a.ms).slice(0, 12)
      };
    });
  } finally {
    await closeApp(started.electronApp);
    removeProfile(startupProfile);
  }

  const context = await startSignedIn('profiles');
  const { electronApp, page } = context;
  const mainProfile = async (name, work) => {
    const filePath = path.join(artifacts, `${name}.main.cpuprofile`);
    await electronApp.evaluate(() => globalThis.__bench.cpuStart());
    await work();
    await electronApp.evaluate((_, target) => globalThis.__bench.cpuStop(target), filePath);
    out[`${name}.main`] = summarizeCpuProfile(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  };
  const rendererProfile = async (name, work) => {
    const filePath = path.join(artifacts, `${name}.renderer.cpuprofile`);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
    await cdp.send('Profiler.start');
    await work();
    const { profile } = await cdp.send('Profiler.stop');
    await cdp.detach();
    fs.writeFileSync(filePath, JSON.stringify(profile));
    out[`${name}.renderer`] = summarizeCpuProfile(profile);
  };
  const traced = async (name, work) => {
    const filePath = path.join(artifacts, `${name}.trace.json`);
    await startTrace(electronApp);
    const startedAt = Date.now();
    await work();
    const wallMs = Date.now() - startedAt;
    await stopTrace(electronApp, filePath);
    out[`${name}.trace`] = summarizeTrace(filePath, { wallMs });
  };

  try {
    await mainEval(electronApp, (_, league) => globalThis.__bench.priceService.ensureSynced(league, 'poe1', { full: true }), LEAGUE);
    await page.evaluate((rows) => {
      window.__b.rows500 = rows;
    }, fixtures.createPriceRows(500));
    await page.evaluate(() => window.__b.click('.nav-btn[data-page="currency"]'));
    await page.waitForSelector('#currency-table-body tr.currency-row');
    await page.evaluate(() => window.__b.rowsAfter(() => loadCurrencyPrices()));
    guard(page);

    // Experiments, with no app change, that put a number on a suspected cause.
    const reopen = (emptyHiddenTable) => async () => {
      await page.evaluate(() => window.__b.click('.nav-btn[data-page="dashboard"]'));
      await page.evaluate(() => window.__b.sleep(700));
      return page.evaluate(async (empty) => {
        if (empty) document.getElementById('currency-table-body').replaceChildren();
        return window.__b.rowsAfter(() => window.__b.click('.nav-btn[data-page="currency"]'));
      }, emptyHiddenTable);
    };
    await sample('experiment.currencyOpen.control', { dataset: '450 rows' }, reopen(false));
    await sample('experiment.currencyOpen.hiddenTableEmptied', { dataset: '450 rows', note: 'As the control, with the stale rows removed while the page is hidden. The gap is the layout of rows that are about to be replaced.' }, reopen(true));

    const renderRows = (name, dataset, note, variant) => sample(name, { dataset, note }, () => page.evaluate(async (which) => {
      const rows = window.__b.rows500;
      currencyState.prices = {
        all: rows,
        noSparklines: rows.map((row) => ({ ...row, sparklineData: { data: [] } })),
        first50: rows.slice(0, 50)
      }[which];
      renderCurrencyTable();
      await window.__b.frame();
      const startedAt = performance.now();
      renderCurrencyTable();
      const jsAt = performance.now();
      const paintedAt = await window.__b.frame();
      return { ms: paintedAt - startedAt, jsMs: jsAt - startedAt, paintMs: paintedAt - jsAt };
    }, variant));
    await renderRows('experiment.render.500rows', '500 replaced by 500', 'Control for the two below.', 'all');
    await renderRows('experiment.render.500rows.noSparklines', '500 replaced by 500', 'The same rows without the 7-day sparkline.', 'noSparklines');
    await renderRows('experiment.render.50rows', '50 replaced by 50', 'What a render costs when only the rows near the viewport exist.', 'first50');

    await sample('experiment.numberFormat.toLocaleString.1500calls', { note: 'The calls one 500-row render makes.' }, () => page.evaluate(() => {
      const startedAt = performance.now();
      for (let index = 0; index < 1500; index += 1) {
        (index * 1.37).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      }
      return { ms: performance.now() - startedAt };
    }));
    await sample('experiment.numberFormat.sharedIntl.1500calls', { note: 'The same with one shared Intl.NumberFormat.' }, () => page.evaluate(() => {
      const format = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const startedAt = performance.now();
      for (let index = 0; index < 1500; index += 1) {
        format.format(index * 1.37);
      }
      return { ms: performance.now() - startedAt };
    }));
    guard(null);

    await rendererProfile('currencyOpenWarmx3', async () => {
      for (let index = 0; index < 3; index += 1) {
        await reopen(false)();
      }
    });
    await traced('currencyOpenWarmx3', async () => {
      for (let index = 0; index < 3; index += 1) {
        await reopen(false)();
      }
    });

    const render500 = () => page.evaluate(async () => {
      currencyState.prices = window.__b.rows500;
      for (let index = 0; index < 5; index += 1) {
        renderCurrencyTable();
        await window.__b.frame();
      }
    });
    await rendererProfile('render500x5', render500);
    await traced('render500x5', render500);

    await mainProfile('getCurrencyPricesx20', () => page.evaluate(async (league) => {
      for (let index = 0; index < 20; index += 1) {
        await window.electronAPI.getCurrencyPrices({ poeVersion: 'poe1', league, limit: '500' });
      }
    }, LEAGUE));
    await mainProfile('fullSyncPoe1', () => mainEval(electronApp, (_, league) => globalThis.__bench.timedSync(league, 'poe1'), LEAGUE));

    await page.evaluate(async () => {
      window.__b.click('.nav-btn[data-page="dashboard"]');
      await window.__b.sleep(600);
    });
    await mainEval(electronApp, (_, runs) => globalThis.__bench.seedJournal(runs), 5000);
    await page.evaluate(() => window.refreshTrackerData());
    await mainProfile('refresh5000x5', () => page.evaluate(async () => {
      for (let index = 0; index < 5; index += 1) {
        await window.refreshTrackerData({ includeSessions: true });
      }
    }));
    await rendererProfile('refresh5000x5', () => page.evaluate(async () => {
      for (let index = 0; index < 5; index += 1) {
        await window.refreshTrackerData({ includeSessions: true });
      }
    }));
    await mainProfile('mapEnd5000x3', () => page.evaluate(async () => {
      for (let index = 0; index < 3; index += 1) {
        await window.__b.startMap(`Bench Profile Map ${index}`);
        await window.__b.sleep(500);
        await window.electronAPI.endSession({ totalLootChaos: 600, profitChaos: 500, durationSeconds: 120 });
        await window.__b.sleep(1500);
      }
    }));
  } finally {
    await stop(context);
  }
}

// ── Live poe.ninja ───────────────────────────────────────────────────────────
// Read-only and at the app's own pacing: not signed in, nothing rendered, at most three syncs in total.
async function livePoeNinja({ record, guard }, results, plan = ['poe1', 'poe2', 'poe1']) {
  guard(null);
  if (plan.length + (results.live?.runs.length || 0) > 3) {
    throw new Error('At most three live runs in one results file');
  }
  const profile = createProfile('live');
  const { electronApp } = await launchApp(profile, { live: true });
  const out = (results.live ||= { runs: [] });
  try {
    await electronApp.evaluate(async () => {
      for (let tries = 0; tries < 100 && !globalThis.__bench.priceService; tries += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    });
    for (const game of plan) {
      const run = await electronApp.evaluate(async (_, poeVersion) => {
        const bench = globalThis.__bench;
        bench.liveRequests.length = 0;
        const leagues = await bench.priceService.getLeagues(poeVersion);
        const league = leagues.find((entry) => entry.active && !entry.hardcore)?.name || leagues[0]?.name || 'Standard';
        bench.priceService.clearCache();
        const { ms, itemCount, lag } = await bench.timedSync(league, poeVersion, { clear: false });
        const startedAt = performance.now();
        const query = bench.priceService.queryPrices({ limit: 500 });
        return {
          poeVersion,
          leagueCount: leagues.length,
          ms,
          itemCount,
          lag,
          queryMs: performance.now() - startedAt,
          shown: query.prices.length,
          typeCounts: query.typeCounts,
          requests: bench.liveRequests
        };
      }, game);
      const networkMs = run.requests.reduce((sum, request) => sum + (request.ms || 0), 0);
      out.runs.push({
        ...run,
        ms: round(run.ms),
        networkMs: round(networkMs),
        requestCount: run.requests.length,
        failedRequests: run.requests.filter((request) => request.failed).length,
        totalJsonChars: run.requests.reduce((sum, request) => sum + (request.jsonChars || 0), 0),
        requestMs: statsOf(run.requests.map((request) => request.ms)),
        requests: run.requests.map((request) => ({ ...request, ms: round(request.ms) }))
      });
    }
    for (const game of new Set(plan)) {
      const runs = out.runs.filter((run) => run.poeVersion === game);
      record(`currency.sync.full.live.${game}`, runs.map((run) => ({ ms: run.ms, networkMs: run.networkMs, itemCount: run.itemCount, requestCount: run.requestCount })), {
        dataset: `live poe.ninja, ${runs[0].itemCount} items`,
        note: 'Read-only requests at the app\'s own pacing. Few runs on purpose.'
      });
    }
  } finally {
    await closeApp(electronApp);
    removeProfile(profile);
  }
}

module.exports = { currency, dashboard, hostBusyPercent, idle, journalIo, launch, livePoeNinja, profiles };
