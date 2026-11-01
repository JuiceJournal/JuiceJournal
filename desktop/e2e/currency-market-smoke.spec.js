const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { once } = require('events');
const { test, expect } = require('playwright/test');
const { _electron: electron } = require('playwright');

const POE_ACCOUNT = {
  sub: 'currency-market-smoke-ggg',
  username: 'MarketAccount',
  characters: {
    poe1: [{ id: 'poe1-market', name: 'MarketRanger', level: 90, class: 'Ranger', ascendancy: 'Deadeye', league: 'Standard', current: true }],
    poe2: []
  }
};

// poe.ninja lists none of these with art (as it lists divination cards), so every row shows a bundled fallback and
// nothing is fetched from the game CDN. Enough cards to scroll the page past the sticky table header.
const CARD_COUNT = 60;
const LONG_CARD_NAME = 'The Card Whose Name Runs Far Past The Width Of Its Column In The Market Table, '
  + 'However Wide The Window Is, Because It Keeps Going Long After Any Real Divination Card Would Have Stopped';
const PRICES = {
  'Divine Orb': 150,
  'Chaos Orb': 1,
  'E2E Tiny Orb': 0.5,
  'Message in a Bottle': { chaos: 12, type: 'Fragment', change: -4.25 },
  'E2E Runegraft': { chaos: 8, type: 'Runegraft' },
  [LONG_CARD_NAME]: { chaos: 5000, type: 'DivinationCard', change: 12.4 },
  ...Object.fromEntries(Array.from({ length: CARD_COUNT - 1 }, (_, index) => [
    `E2E Card ${String(index + 1).padStart(2, '0')}`,
    { chaos: 1000 - index * 10, type: 'DivinationCard', change: index % 2 ? -81.46 : 3 }
  ]))
};

function toSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'currency-market-smoke';
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

async function startSmokeBackend() {
  const server = http.createServer((request, response) => {
    writeJson(response, 404, { success: false, data: null, error: 'Unhandled smoke endpoint', errorCode: 'NOT_FOUND' });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Smoke backend did not expose a TCP port');
  }

  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function createIsolatedProfile(testInfo, apiUrl) {
  const tempRoot = path.join(os.tmpdir(), 'juice-journal-playwright');
  fs.mkdirSync(tempRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tempRoot, `${toSlug(testInfo.title)}-`));
  const appDataDir = path.join(rootDir, 'app-data');
  const userDataDir = path.join(rootDir, 'user-data');
  const tempDir = path.join(rootDir, 'temp');
  const clientLogPath = path.join(rootDir, 'Path of Exile', 'logs', 'Client.txt');

  fs.mkdirSync(appDataDir, { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });
  fs.mkdirSync(path.dirname(clientLogPath), { recursive: true });
  fs.writeFileSync(clientLogPath, '');
  fs.writeFileSync(path.join(userDataDir, 'config.json'), JSON.stringify({
    apiUrl,
    language: 'en',
    poeVersion: 'poe1',
    lastDetectedPoeVersion: 'poe1',
    poePath: clientLogPath,
    autoStartSession: false,
    authToken: null,
    authTokenEncrypted: null,
    currentUserId: null
  }, null, '\t'));

  return {
    rootDir,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JUICE_JOURNAL_FORCE_LIVE_AUTH: '1',
      JUICE_JOURNAL_E2E_APP_DATA_DIR: appDataDir,
      JUICE_JOURNAL_E2E_USER_DATA_DIR: userDataDir,
      JUICE_JOURNAL_E2E_POE_ACCOUNT: JSON.stringify(POE_ACCOUNT),
      JUICE_JOURNAL_E2E_PRICES: JSON.stringify(PRICES),
      TMP: tempDir,
      TEMP: tempDir,
    },
  };
}

function createBootstrapScript(testInfo) {
  const bootstrapRoot = path.join(os.tmpdir(), 'juice-journal-playwright');
  fs.mkdirSync(bootstrapRoot, { recursive: true });
  const bootstrapDir = fs.mkdtempSync(path.join(bootstrapRoot, `${toSlug(testInfo.title)}-bootstrap-`));
  const bootstrapPath = path.join(bootstrapDir, 'bootstrap.cjs');
  fs.writeFileSync(bootstrapPath, `
const path = require('path');
const { app } = require('electron');
require(${JSON.stringify(path.join(__dirname, 'network-stub.cjs'))});
const win32Probe = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'modules', 'win32Probe.js'))});

const appDataDir = process.env.JUICE_JOURNAL_E2E_APP_DATA_DIR;
const userDataDir = process.env.JUICE_JOURNAL_E2E_USER_DATA_DIR;
if (!appDataDir || !userDataDir) {
  throw new Error('Missing smoke harness path overrides');
}

// No game runs, so the detector never reads the real process list or window.
win32Probe.scanProcesses = () => [];
win32Probe.findProcessWindow = () => null;

app.setPath('appData', appDataDir);
app.setPath('userData', userDataDir);
app.setPath('sessionData', path.join(userDataDir, 'session-data'));
`, 'utf8');

  return { bootstrapDir, bootstrapPath };
}

async function waitForAppWindow(electronApp, expectedTitle) {
  const timeoutAt = Date.now() + 30000;
  while (Date.now() < timeoutAt) {
    for (const page of electronApp.windows()) {
      try {
        if (expectedTitle.test(await page.title())) {
          return page;
        }
      } catch {
        // Ignore windows that are still initializing.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for app window matching ${expectedTitle}`);
}

async function shutdownElectronApp(electronApp) {
  const childProcess = electronApp?.process?.();
  try {
    await electronApp.evaluate(({ app, BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.destroy();
      }
      app.exit(0);
    });
  } catch {
    // The app may already be gone.
  }
  if (childProcess && childProcess.exitCode === null) {
    await Promise.race([
      once(childProcess, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 5000))
    ]);
    if (childProcess.exitCode === null) {
      childProcess.kill('SIGKILL');
    }
  }
}

test('currency market smoke: bundled art for rows without art, a localized type, a bevel plate tab and a sticky header', async ({}, testInfo) => {
  const backend = await startSmokeBackend();
  const isolatedProfile = createIsolatedProfile(testInfo, backend.baseUrl);
  const bootstrap = createBootstrapScript(testInfo);
  let electronApp;

  try {
    electronApp = await electron.launch({
      args: ['-r', bootstrap.bootstrapPath, path.join(__dirname, '..')],
      cwd: path.join(__dirname, '..'),
      env: isolatedProfile.env,
    });
    const page = await waitForAppWindow(electronApp, /^Juice Journal$/i);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#poe-oauth-login')).toBeEnabled();
    await page.locator('#poe-oauth-login').click();
    await expect(page.locator('#login-modal')).toBeHidden();

    await page.locator('.nav-btn[data-page="currency"]').click();
    await expect(page.locator('#currency-page')).toHaveClass(/active/);
    const rows = page.locator('#currency-table-body tr.currency-row');
    await expect(rows).toHaveCount(CARD_COUNT + 5);
    const total = Object.keys(PRICES).length;
    await expect(page.locator('#currency-status')).toContainText(`Standard · ${total} prices · Synced`);
    await expect(page.locator('#currency-footer')).toHaveText(`Showing ${total} of ${total}`);

    // Every rail tab has art or our line icon in its slot; the rail counts the listed prices.
    const tab = (type) => page.locator(`.currency-type-btn[data-type="${type}"]`);
    await expect(page.locator('.currency-type-btn')).toHaveCount(20);
    await expect(page.locator('.currency-tab-slot:empty')).toHaveCount(0);
    await expect(tab('')).toHaveAttribute('aria-pressed', 'true');
    await expect(tab('divination_card').locator('img')).toHaveAttribute('src', 'assets/currency/poe1/divination-card.png');
    await expect(tab('divination_card').locator('.currency-tab-count')).toHaveText(String(CARD_COUNT));
    // Every listed price sits under a tab, so the tabs add up to All.
    await expect(tab('rune').locator('.currency-tab-label')).toHaveText('Runegraft');
    await expect(tab('rune').locator('.currency-tab-count')).toHaveText('1');
    await expect(tab('').locator('.currency-tab-count')).toHaveText(String(total));
    const tabCounts = await page.locator('.currency-type-btn:not([data-type=""]) .currency-tab-count').allTextContents();
    expect(tabCounts.reduce((sum, count) => sum + Number(count), 0)).toBe(total);
    // The quick sync reads no base types, so that tab is empty and steps back.
    await expect(tab('base_type')).toHaveClass(/currency-type-btn--empty/);

    // Cards and fragments without art show their category's bundled art; a currency row shows our chest.
    const row = (name) => rows.filter({ has: page.locator('.currency-item-name', { hasText: name }) });
    const longCard = row(LONG_CARD_NAME);
    await expect(longCard.locator('.item-slot img')).toHaveAttribute('src', 'assets/currency/poe1/divination-card.png');
    expect(await longCard.locator('.item-slot img').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(longCard.locator('.currency-item-meta')).toHaveText('Div Card');
    await expect(longCard.locator('.currency-item-name')).toHaveAttribute('title', LONG_CARD_NAME);
    await expect(row('Message in a Bottle').locator('.item-slot img')).toHaveAttribute('src', 'assets/currency/poe1/fragment.png');
    await expect(row('Chaos Orb').locator('.item-slot use')).toHaveAttribute('href', 'assets/icons.svg#chest');
    await expect(page.locator('img[data-icon-url]')).toHaveCount(0);
    // 0.5 chaos at 150c/div is a real price too small for two decimals, and the Divine column says so.
    await expect(row('E2E Tiny Orb').locator('.currency-td-divine .value-chip')).toHaveText('<0.01');
    // The 7d column reads as signed text with an arrow, not colour alone.
    await expect(longCard.locator('.currency-change')).toHaveAttribute('data-trend', 'up');
    await expect(longCard.locator('.currency-change-value')).toHaveText('+12.4%');
    await expect(longCard.locator('.currency-change-value use')).toHaveAttribute('href', 'assets/icons.svg#arrow-up');

    // The long name ends in an ellipsis, so the fixed columns keep their widths across a filter.
    const columnWidths = () => page.locator('.currency-table thead th').evaluateAll((cells) => cells.map((cell) => Math.round(cell.getBoundingClientRect().width)));
    const widthsInAll = await columnWidths();
    expect(await longCard.locator('.currency-item-name').evaluate((name) => name.scrollWidth > name.clientWidth)).toBe(true);
    await page.locator('#currency-page').screenshot({ path: testInfo.outputPath('currency-all.png') });

    await tab('divination_card').click();
    await expect(tab('divination_card')).toHaveAttribute('aria-pressed', 'true');
    await expect(tab('')).toHaveAttribute('aria-pressed', 'false');
    await expect(rows).toHaveCount(CARD_COUNT);
    // A tab already names the type.
    await expect(page.locator('.currency-item-meta')).toHaveCount(0);
    expect(await columnWidths()).toEqual(widthsInAll);
    // The selected tab is a bevel plate in a brass ring, with no side stripe.
    // Polled, because the tab eases into its selected state.
    await expect.poll(() => tab('divination_card').evaluate((button) => getComputedStyle(button).boxShadow))
      .toMatch(/^rgba\([^)]*, 0\.45\) 0px 0px 0px 1px inset$/);

    // The column labels stay under the app header while the page scrolls.
    await page.evaluate(() => window.scrollTo(0, 1200));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
    const headerBottom = await page.locator('.header').evaluate((header) => Math.round(header.getBoundingClientRect().bottom));
    const theadTop = await page.locator('.currency-table thead th').first().evaluate((cell) => Math.round(cell.getBoundingClientRect().top));
    expect(Math.abs(theadTop - headerBottom)).toBeLessThanOrEqual(1);
    const railTop = await page.locator('.currency-type-panel').evaluate((panel) => Math.round(panel.getBoundingClientRect().top));
    expect(railTop).toBeGreaterThanOrEqual(headerBottom);
    await page.screenshot({ path: testInfo.outputPath('currency-scrolled.png') });
    await page.evaluate(() => window.scrollTo(0, 0));

    // A row opens its detail under it, one at a time.
    await rows.first().click();
    await expect(rows.first()).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.currency-detail-row')).toHaveCount(1);
    await expect(page.locator('.currency-detail-row .currency-detail-slot img')).toHaveAttribute('src', 'assets/currency/poe1/divination-card.png');
    await rows.nth(1).press('Enter');
    await expect(page.locator('.currency-detail-row')).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('aria-expanded', 'false');
    // The rows are one Tab stop, and arrow keys move it.
    await expect(page.locator('#currency-table-body tr.currency-row[tabindex="0"]')).toHaveCount(1);
    await rows.nth(1).press('ArrowDown');
    await expect(rows.nth(2)).toBeFocused();
    await expect(rows.nth(2)).toHaveAttribute('tabindex', '0');
    await expect(page.locator('#currency-table-body tr.currency-row[tabindex="0"]')).toHaveCount(1);
    await page.locator('#currency-page').screenshot({ path: testInfo.outputPath('currency-detail.png') });

    // The window controls and filters read in the app's language, not hard-coded Turkish.
    await expect(page.locator('#win-minimize')).toHaveAttribute('aria-label', 'Minimize');
    await expect(page.locator('.nav')).toHaveAttribute('aria-label', 'Main navigation');
    const ariaInTurkish = await page.evaluate(() => {
      const previous = window._appState.language;
      window._appState.language = 'tr';
      window.applyTranslations();
      const labels = ['win-minimize', 'session-drawer-close', 'session-version-filter']
        .map((id) => document.getElementById(id).getAttribute('aria-label'));
      window._appState.language = previous;
      window.applyTranslations();
      return labels;
    });
    expect(ariaInTurkish).toEqual(['Kucult', 'Kapat', "Session'lari oyuna gore filtrele"]);

    // A search that matches nothing offers to clear it.
    await page.locator('#currency-search').fill('zzzz');
    await expect(page.locator('.currency-empty')).toContainText('No items match this search.');
    await expect(page.locator('#currency-search-clear')).toBeVisible();
    await page.locator('.currency-empty-action .btn').click();
    await expect(page.locator('#currency-search')).toHaveValue('');
    await expect(rows).toHaveCount(CARD_COUNT);

    // A busy Sync keeps its width in both languages, so the controls next to it never move.
    const syncWidths = await page.evaluate(() => {
      const button = document.getElementById('currency-sync-btn');
      const label = button.querySelector('.btn-label');
      const disabled = button.disabled;
      const widths = {};
      for (const lang of ['en', 'tr']) {
        document.documentElement.lang = lang;
        const strings = window.Translations[lang];
        label.textContent = strings['currency.sync'];
        const idle = button.getBoundingClientRect().width;
        setButtonBusy(button, true, strings['currency.syncing']);
        widths[lang] = [idle, button.getBoundingClientRect().width];
        setButtonBusy(button, false);
      }
      document.documentElement.lang = 'en';
      button.disabled = disabled;
      return widths;
    });
    for (const [lang, [idle, busy]] of Object.entries(syncWidths)) {
      expect(busy, lang).toBe(idle);
    }
  } finally {
    if (electronApp) {
      await shutdownElectronApp(electronApp);
    }
    await new Promise((resolve) => backend.server.close(resolve));
    for (const target of [isolatedProfile.rootDir, bootstrap.bootstrapDir]) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
});
