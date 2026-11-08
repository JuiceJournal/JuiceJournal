const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { once } = require('events');
const { test, expect } = require('playwright/test');
const { _electron: electron } = require('playwright');

const POE_ACCOUNT = {
  sub: 'dropdown-smoke-ggg',
  username: 'DropdownAccount',
  characters: {
    poe1: [
      { id: 'poe1-dropdown', name: 'DropdownRanger', level: 90, class: 'Ranger', ascendancy: 'Deadeye', league: 'Standard', current: true },
      { id: 'poe1-second', name: 'DropdownWitch', level: 80, class: 'Witch', ascendancy: 'Elementalist', league: 'Standard', current: false }
    ],
    poe2: []
  }
};

// --brass in tokens.css, the open state's border.
const GOLD = 'rgb(232, 182, 90)';

async function startSmokeBackend() {
  const server = http.createServer((request, response) => {
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ success: false, data: null, error: 'Unhandled smoke endpoint', errorCode: 'NOT_FOUND' }));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

function createIsolatedProfile(apiUrl) {
  const tempRoot = path.join(os.tmpdir(), 'juice-journal-playwright');
  fs.mkdirSync(tempRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tempRoot, 'dropdown-smoke-'));
  const appDataDir = path.join(rootDir, 'app-data');
  const userDataDir = path.join(rootDir, 'user-data');
  const tempDir = path.join(rootDir, 'temp');
  for (const dir of [appDataDir, userDataDir, tempDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(path.join(userDataDir, 'config.json'), JSON.stringify({
    apiUrl,
    language: 'en',
    poeVersion: 'poe1',
    autoStartSession: false,
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

app.setPath('appData', process.env.JUICE_JOURNAL_E2E_APP_DATA_DIR);
app.setPath('userData', process.env.JUICE_JOURNAL_E2E_USER_DATA_DIR);
app.setPath('sessionData', path.join(process.env.JUICE_JOURNAL_E2E_USER_DATA_DIR, 'session-data'));
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
      JUICE_JOURNAL_E2E_POE_ACCOUNT: JSON.stringify(POE_ACCOUNT),
      TMP: tempDir,
      TEMP: tempDir
    }
  };
}

async function waitForAppWindow(electronApp) {
  await expect.poll(async () => {
    for (const page of electronApp.windows()) {
      if (/^Juice Journal$/i.test(await page.title().catch(() => ''))) {
        return true;
      }
    }
    return false;
  }, { timeout: 30000 }).toBe(true);

  for (const page of electronApp.windows()) {
    if (/^Juice Journal$/i.test(await page.title())) {
      return page;
    }
  }
  throw new Error('App window disappeared');
}

async function shutdownElectronApp(electronApp) {
  const childProcess = electronApp.process();
  const exited = childProcess.exitCode === null ? once(childProcess, 'exit') : Promise.resolve();
  await electronApp.evaluate(({ app, BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.destroy();
    }
    app.exit(0);
  }).catch(() => {});
  await exited;
}

const isOpen = (select) => select.evaluate((element) => element.matches(':open'));

async function expectOpen(select) {
  await select.click();
  expect(await isOpen(select)).toBe(true);
}

async function expectListBelow(select) {
  const selectBox = await select.boundingBox();
  const optionBox = await select.locator('option').first().boundingBox();
  expect(optionBox.y).toBeGreaterThanOrEqual(selectBox.y + selectBox.height);
}

async function expectOpenBorderIsGold(select) {
  await expect.poll(() => select.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe(GOLD);
}

// A page change animates in, so positions are only comparable once it has finished.
async function openPage(page, name) {
  await page.locator(`.nav-btn[data-page="${name}"]`).click();
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity)
    .map((animation) => animation.finished.catch(() => {}))));
}

async function shoot(page, testInfo, name) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
}

test('dropdown smoke: selects use the themed picker by mouse and keyboard, in toolbars and in modals', async ({}, testInfo) => {
  test.setTimeout(90000);
  const backend = await startSmokeBackend();
  const profile = createIsolatedProfile(backend.baseUrl);
  let electronApp;

  try {
    electronApp = await electron.launch({
      args: ['-r', profile.bootstrapPath, path.join(__dirname, '..')],
      cwd: path.join(__dirname, '..'),
      env: profile.env
    });
    const page = await waitForAppWindow(electronApp);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#poe-oauth-login')).toBeEnabled();
    await page.locator('#poe-oauth-login').click();
    await expect(page.locator('#login-modal')).toBeHidden();
    await expect(page.locator('#character-picker')).toBeVisible();

    // A native popup is drawn by the OS and ignores the theme.
    const nativeSelects = await page.evaluate(() => [...document.querySelectorAll('select')]
      .filter((select) => getComputedStyle(select).appearance !== 'base-select')
      .map((select) => select.id));
    expect(nativeSelects).toEqual([]);

    const farmType = page.locator('#session-farm-type-select');

    // Mouse: the list opens on the page, reads as spaced rows, keeps farm colours, and a click picks and closes.
    await expectOpen(farmType);
    await expectListBelow(farmType);
    await expectOpenBorderIsGold(farmType);
    const row = farmType.locator('option[value="abyss"]');
    await expect(row).toBeVisible();
    await expect.poll(async () => (await row.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(32);
    expect(await row.evaluate((element) => getComputedStyle(element).color))
      .not.toBe(await farmType.locator('option[value=""]').evaluate((element) => getComputedStyle(element).color));
    await row.hover();
    await shoot(page, testInfo, 'dashboard-farm-type-open');
    await row.click();
    expect(await isOpen(farmType)).toBe(false);
    await expect(farmType).toHaveValue('abyss');
    await expect.poll(() => page.evaluate(() => window.electronAPI.getActiveFarmType())).toBe('abyss');

    // Keyboard: Escape leaves the value alone, arrows and Enter pick.
    await farmType.focus();
    await page.keyboard.press('Enter');
    expect(await isOpen(farmType)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await isOpen(farmType)).toBe(false);
    await expect(farmType).toHaveValue('abyss');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect(await isOpen(farmType)).toBe(false);
    await expect(farmType).toHaveValue('breach');
    await expect.poll(() => page.evaluate(() => window.electronAPI.getActiveFarmType())).toBe('breach');

    // A click outside closes without a change.
    await farmType.click();
    await page.mouse.click(5, 300);
    expect(await isOpen(farmType)).toBe(false);
    await expect(farmType).toHaveValue('breach');

    // Options rebuilt under an open list leave the keyboard working.
    await farmType.focus();
    await page.keyboard.press('Enter');
    await farmType.evaluate((element) => {
      element.innerHTML = element.innerHTML;
      element.value = 'breach';
    });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect(await isOpen(farmType)).toBe(false);
    await expect(farmType).toHaveValue('expedition');

    // The only select inside a <label>: its text is not the label's uppercase, and a pick sticks.
    const characterPicker = page.locator('#character-picker');
    await expect(characterPicker).toBeVisible();
    await expectOpen(characterPicker);
    const secondCharacter = characterPicker.locator('option[value="poe1-second"]');
    expect(await secondCharacter.evaluate((element) => getComputedStyle(element).textTransform)).toBe('none');
    await shoot(page, testInfo, 'character-picker-open');
    await secondCharacter.click();
    expect(await isOpen(characterPicker)).toBe(false);
    await expect(characterPicker).toHaveValue('poe1-second');

    // In a modal, Escape closes only the list and Enter only picks; the modal goes on the next Escape.
    await page.locator('#start-session-btn').click();
    const modal = page.locator('#map-session-modal');
    await expect(modal).toBeVisible();
    const modalFarm = page.locator('#map-session-farm-type-select');
    await expectOpen(modalFarm);
    await shoot(page, testInfo, 'modal-farm-type-open');
    await page.keyboard.press('Escape');
    expect(await isOpen(modalFarm)).toBe(false);
    await expect(modal).toBeVisible();
    await modalFarm.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect(await isOpen(modalFarm)).toBe(false);
    await expect(modal).toBeVisible();
    await expectOpen(modalFarm);
    await modalFarm.locator('option[value="ritual"]').click();
    await expect(modalFarm).toHaveValue('ritual');
    await expect(modal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    // The filter bar stays on one row at one height and each list opens below its filter.
    await openPage(page, 'sessions');
    const leagueFilter = page.locator('#session-league-filter');
    await expect(leagueFilter).toBeVisible();
    await shoot(page, testInfo, 'sessions-filters-closed');
    const filterBoxes = await Promise.all(
      ['#session-filter', '#session-version-filter', '#session-league-filter', '#session-farm-filter']
        .map((selector) => page.locator(selector).boundingBox())
    );
    for (const filterBox of filterBoxes) {
      expect(filterBox.y).toBe(filterBoxes[0].y);
      expect(filterBox.height).toBe(filterBoxes[0].height);
    }

    await expectOpen(leagueFilter);
    await expectListBelow(leagueFilter);
    await shoot(page, testInfo, 'sessions-league-open');
    await page.keyboard.press('Escape');

    // A pick does not resize a filter.
    const statusFilter = page.locator('#session-filter');
    const statusWidth = (await statusFilter.boundingBox()).width;
    await expectOpen(statusFilter);
    await expectListBelow(statusFilter);
    await shoot(page, testInfo, 'sessions-status-open');
    await statusFilter.locator('option').last().click();
    expect((await statusFilter.boundingBox()).width).toBe(statusWidth);

    // The Market toolbar: the select matches its neighbours and a long league does not push the row.
    await openPage(page, 'currency');
    const currencyLeague = page.locator('#currency-league');
    await expect(currencyLeague).toBeVisible();
    const syncBox = await page.locator('#currency-sync-btn').boundingBox();
    const leagueBox = await currencyLeague.boundingBox();
    expect(Math.abs(leagueBox.height - syncBox.height)).toBeLessThanOrEqual(1);
    const toggleX = (await page.locator('.poe-toggle').boundingBox()).x;
    await expectOpen(currencyLeague);
    await expectListBelow(currencyLeague);
    await shoot(page, testInfo, 'currency-league-open');
    await currencyLeague.locator('option', { hasText: 'HC SSF Mirage' }).click();
    await expect(currencyLeague).toHaveValue('HC SSF Mirage');
    expect((await page.locator('.poe-toggle').boundingBox()).x).toBe(toggleX);

    // A select with the hidden attribute stays hidden on the page that holds it.
    await openPage(page, 'settings');
    const language = page.locator('#global-language');
    await expect(language).toBeVisible();
    expect(await page.locator('#default-league-select').evaluate((element) => element.hidden === (getComputedStyle(element).display === 'none'))).toBe(true);
    await expectOpen(language);
    await expectOpenBorderIsGold(language);
    await shoot(page, testInfo, 'settings-language-open');
    await page.keyboard.press('Escape');
  } finally {
    if (electronApp) {
      await shutdownElectronApp(electronApp);
    }
    await new Promise((resolve) => backend.server.close(resolve));
    fs.rmSync(profile.rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
});
