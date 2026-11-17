const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('playwright/test');
const { _electron: electron } = require('playwright');

const ACCOUNT = { sub: 'guide-a', username: 'GuideReader', characters: { poe1: [], poe2: [] } };

function createIsolatedProfile() {
  const tempRoot = path.join(os.tmpdir(), 'juice-journal-playwright');
  fs.mkdirSync(tempRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tempRoot, 'guide-'));
  const appDataDir = path.join(rootDir, 'app-data');
  const userDataDir = path.join(rootDir, 'user-data');
  const tempDir = path.join(rootDir, 'temp');
  const clientLogPath = path.join(rootDir, 'Path of Exile 2', 'logs', 'Client.txt');
  for (const dir of [appDataDir, userDataDir, tempDir, path.dirname(clientLogPath)]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(clientLogPath, '');
  fs.writeFileSync(path.join(userDataDir, 'config.json'), JSON.stringify({
    apiUrl: 'http://127.0.0.1:9',
    language: 'en',
    poeVersion: 'poe2',
    lastDetectedPoeVersion: 'poe2',
    poePath: clientLogPath,
    autoStartSession: false,
    notifications: false,
    overlayEnabled: true,
    authToken: null,
    authTokenEncrypted: null,
    currentUserId: null
  }, null, '\t'));

  const bootstrapPath = path.join(rootDir, 'bootstrap.cjs');
  fs.writeFileSync(bootstrapPath, `
const path = require('path');
const { app } = require('electron');
require(${JSON.stringify(path.join(__dirname, 'network-stub.cjs'))});
const win32Probe = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'modules', 'win32Probe.js'))});

// The game detector finds no game, so the real process list and game log are never read.
win32Probe.scanProcesses = () => [];
win32Probe.findProcessWindow = () => null;

const userDataDir = process.env.JUICE_JOURNAL_E2E_USER_DATA_DIR;
app.setPath('appData', process.env.JUICE_JOURNAL_E2E_APP_DATA_DIR);
app.setPath('userData', userDataDir);
app.setPath('sessionData', path.join(userDataDir, 'session-data'));
`, 'utf8');

  return {
    rootDir,
    bootstrapPath,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JUICE_JOURNAL_FORCE_LIVE_AUTH: '1',
      JUICE_JOURNAL_E2E_APP_DATA_DIR: appDataDir,
      JUICE_JOURNAL_E2E_USER_DATA_DIR: userDataDir,
      JUICE_JOURNAL_E2E_POE_ACCOUNT: JSON.stringify(ACCOUNT),
      TMP: tempDir,
      TEMP: tempDir,
    },
  };
}

async function waitForWindow(electronApp, expectedTitle) {
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
  throw new Error(`Timed out waiting for a window matching ${expectedTitle}`);
}

async function shutdownElectronApp(electronApp) {
  const childProcess = electronApp.process();
  const exited = new Promise((resolve) => childProcess.once('exit', resolve));
  await electronApp.evaluate(({ app, BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.destroy();
    }
    app.exit(0);
  }).catch(() => {});
  await exited;
}

async function signIn(page) {
  await expect(page.locator('#login-modal')).toBeVisible();
  await expect(page.locator('#poe-oauth-login')).toBeEnabled();
  await page.locator('#poe-oauth-login').click();
  await expect(page.locator('#login-modal')).toBeHidden();
  await expect(page.locator('#username')).toHaveText(ACCOUNT.username);
}

test('guide smoke: the Guide tab lists the questions, opens one, searches and follows the language', async () => {
  test.setTimeout(60000);
  const profile = createIsolatedProfile();
  let electronApp = null;

  try {
    electronApp = await electron.launch({
      args: ['-r', profile.bootstrapPath, path.join(__dirname, '..')],
      cwd: path.join(__dirname, '..'),
      env: profile.env,
    });
    const page = await waitForWindow(electronApp, /^Juice Journal$/i);
    await page.waitForLoadState('domcontentloaded');
    await signIn(page);
    // A new profile is met by the first-map steps: with no game running, the first one is current.
    const coach = page.locator('#coach-card');
    await expect(coach).toBeVisible();
    await expect(coach.locator('#coach-progress')).toHaveText('Step 1 of 5');
    await expect(coach.locator('.coach-node-name')).toHaveText(['Start the game', 'Get ready', 'Open your inventory', 'Run a map', 'Count the loot']);
    await expect(coach.locator('.coach-node[aria-current="step"] .coach-node-name')).toHaveText('Start the game');
    await expect(coach.locator('#coach-message')).toHaveText('Start Path of Exile and enter the game. The app finds it on its own.');
    // A step on the rail can be pressed to read what it is about; pressing it again goes back to the current one.
    const mapStep = coach.locator('.coach-node[data-coach-step="map"]');
    await mapStep.click();
    await expect(mapStep).toHaveAttribute('aria-pressed', 'true');
    await expect(coach.locator('#coach-message')).toHaveText('Inventory read. Run a map at your own pace, with no need to stop for loot.');
    await mapStep.click();
    await expect(coach.locator('#coach-message')).toHaveText('Start Path of Exile and enter the game. The app finds it on its own.');
    if (process.env.COACH_SHOT) {
      const shot = (name) => page.locator('#coach-card').screenshot({ path: process.env.COACH_SHOT.replace('.png', '-' + name + '.png') });
      await page.screenshot({ path: process.env.COACH_SHOT });
      for (const [name, coachState] of [
        ['inventory', { step: 'inventory', index: 3, total: 5, message: 'openInventory', status: 'do' }],
        ['loading', { step: 'ready', index: 2, total: 5, message: 'loading', status: 'wait' }],
        ['done', { step: 'done', index: 5, total: 5, message: 'done', status: 'done' }]
      ]) {
        await page.evaluate((value) => window.setCoachState(value), coachState);
        await page.waitForTimeout(1100);
        await shot(name);
      }
      await page.evaluate(() => window.electronAPI.getCoachState().then(window.setCoachState));
    }
    // Hide puts them away for this profile, and the Guide brings them back on the Dashboard.
    await coach.locator('#coach-hide').click();
    await expect(coach).toBeHidden();
    await page.locator('.nav-btn[data-page="guide"]').click();
    await page.locator('#guide-show-coach').click();
    await expect(page.locator('#dashboard-page')).toHaveClass(/active/);
    await expect(coach).toBeVisible();

    // The Guide tab opens the page with every section and question, all closed.
    await page.locator('.nav-btn[data-page="guide"]').click();
    await expect(page.locator('#guide-page')).toHaveClass(/active/);
    await expect(page.locator('.guide-section')).toHaveCount(6);
    await expect(page.locator('.guide-topic')).toHaveCount(21);
    await expect(page.locator('.guide-topic[open]')).toHaveCount(0);
    await expect(page.locator('#guide-empty')).toBeHidden();

    // A question opens to its answer.
    const customFarm = page.locator('.guide-topic[data-topic="customFarm"]');
    await customFarm.locator('summary').click();
    await expect(customFarm.locator('.guide-answer p').first()).toContainText('press Manage next to Farm type');

    // A search narrows the list and shows the answers; the opened question stays open after it is cleared.
    await page.locator('#guide-search').fill('entry cost');
    await expect(page.locator('.guide-topic[data-topic="entryCost"]')).toBeVisible();
    await expect(page.locator('.guide-topic[data-topic="firstMap"]')).toHaveCount(0);
    await expect(page.locator('.guide-topic:not([open])')).toHaveCount(0);
    await page.locator('#guide-search').fill('no such word here');
    await expect(page.locator('#guide-empty')).toBeVisible();
    await page.locator('#guide-search').fill('');
    await expect(page.locator('.guide-topic')).toHaveCount(21);
    await expect(page.locator('.guide-topic[open]')).toHaveCount(1);

    // The page follows the language.
    await page.evaluate(() => {
      window._appState.language = 'tr';
      window.applyTranslations();
    });
    await expect(page.locator('.guide-section-title').first()).toHaveText('Başlarken');
    await expect(customFarm.locator('summary')).toHaveText('Kendi farm tipimi nasıl eklerim?');
    await expect(customFarm).toHaveAttribute('open', '');

    // Every language in the picker has its own text, loaded from its file, and the page takes its language.
    await expect(page.locator('#global-language option')).toHaveText([
      'English', 'Türkçe', 'Deutsch', 'Français', 'Español', 'Italiano', 'Português (Brasil)', 'Русский', '日本語', '한국어', '简体中文', '繁體中文'
    ]);
    for (const [language, title, question] of [
      ['de', 'Erste Schritte', 'Wie füge ich einen eigenen Farmtyp hinzu?'],
      ['ja', 'はじめに', '自分のファームタイプを追加するには？']
    ]) {
      await page.evaluate((code) => {
        window._appState.language = code;
        window.applyTranslations();
      }, language);
      await expect(page.locator('.guide-section-title').first()).toHaveText(title);
      await expect(customFarm.locator('summary')).toHaveText(question);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
    }
    if (process.env.GUIDE_SHOT) {
      await page.evaluate(() => {
        window._appState.language = 'en';
        window.applyTranslations();
      });
      await page.screenshot({ path: process.env.GUIDE_SHOT });
    }
  } finally {
    if (electronApp) {
      await shutdownElectronApp(electronApp);
    }
    fs.rmSync(profile.rootDir, { recursive: true, force: true });
  }
});
