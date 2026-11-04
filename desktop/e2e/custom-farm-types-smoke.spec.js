const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('playwright/test');
const { _electron: electron } = require('playwright');

const ACCOUNT_A = { sub: 'custom-farm-a', username: 'FarmerA', characters: { poe1: [], poe2: [] } };
const ACCOUNT_B = { sub: 'custom-farm-b', username: 'FarmerB', characters: { poe1: [], poe2: [] } };

function createIsolatedProfile() {
  const tempRoot = path.join(os.tmpdir(), 'juice-journal-playwright');
  fs.mkdirSync(tempRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tempRoot, 'custom-farm-types-'));
  const appDataDir = path.join(rootDir, 'app-data');
  const userDataDir = path.join(rootDir, 'user-data');
  const tempDir = path.join(rootDir, 'temp');
  const clientLogPath = path.join(rootDir, 'Path of Exile 2', 'logs', 'Client.txt');
  for (const dir of [appDataDir, userDataDir, tempDir, path.dirname(clientLogPath)]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(clientLogPath, '');
  // The store has to survive the relaunches, so the spec writes it once here instead of in the bootstrap.
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
    configPath: path.join(userDataDir, 'config.json'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JUICE_JOURNAL_FORCE_LIVE_AUTH: '1',
      JUICE_JOURNAL_E2E_APP_DATA_DIR: appDataDir,
      JUICE_JOURNAL_E2E_USER_DATA_DIR: userDataDir,
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

async function signIn(page, account) {
  await expect(page.locator('#login-modal')).toBeVisible();
  await expect(page.locator('#poe-oauth-login')).toBeEnabled();
  await page.locator('#poe-oauth-login').click();
  await expect(page.locator('#login-modal')).toBeHidden();
  await expect(page.locator('#username')).toHaveText(account.username);
}

const pickOption = (page, name, value) => page.locator(`label:has(input[name="${name}"][value="${value}"])`).click();

async function openCustomFarmSettings(page) {
  await page.locator('.nav-btn[data-page="dashboard"]').click();
  await page.locator('#manage-farm-types-btn').click();
  await expect(page.locator('#custom-farm-types-group')).toBeVisible();
}

async function fillCustomFarmForm(page, { name, color, icon }) {
  await page.locator('#custom-farm-name').fill(name);
  await pickOption(page, 'custom-farm-color', color);
  await pickOption(page, 'custom-farm-icon', icon);
  await page.locator('#custom-farm-save-btn').click();
}

// A <use> that found its symbol has a box; one the window could not load has none.
const iconHasBox = (locator) => locator.evaluate((use) => use.getBBox().width > 0);

test('custom farm types smoke: made, shown, renamed and deleted per profile, across relaunches', async () => {
  test.setTimeout(240000);
  const profile = createIsolatedProfile();
  let electronApp = null;
  const launchApp = async (account) => {
    electronApp = await electron.launch({
      args: ['-r', profile.bootstrapPath, path.join(__dirname, '..')],
      cwd: path.join(__dirname, '..'),
      env: { ...profile.env, JUICE_JOURNAL_E2E_POE_ACCOUNT: JSON.stringify(account) },
    });
    const page = await waitForWindow(electronApp, /^Juice Journal$/i);
    await page.waitForLoadState('domcontentloaded');
    return page;
  };
  const relaunch = async (account) => {
    await shutdownElectronApp(electronApp);
    electronApp = null;
    return launchApp(account);
  };
  const readConfig = () => JSON.parse(fs.readFileSync(profile.configPath, 'utf8'));

  try {
    let page = await launchApp(ACCOUNT_A);
    await signIn(page, ACCOUNT_A);
    const profileIdA = readConfig().activeProfileId;

    // Create: a clash is refused, then the form saves the type for the active game.
    await openCustomFarmSettings(page);
    await page.locator('#custom-farm-add-btn').click();
    await fillCustomFarmForm(page, { name: 'Ritual', color: 'amber', icon: 'farm-tablet' });
    await expect(page.locator('#custom-farm-error')).toHaveText('A farm type already has that name.');
    await fillCustomFarmForm(page, { name: 'Boss Tablets', color: 'amber', icon: 'farm-tablet' });
    await expect(page.locator('#custom-farm-form')).toBeHidden();
    await expect(page.locator('.custom-farm-name')).toHaveText('Boss Tablets');
    await expect(page.locator('.custom-farm-games')).toHaveText('PoE 2');
    const [created] = await page.evaluate(() => window.electronAPI.getCustomFarmTypes());
    expect(created).toMatchObject({ label: 'Boss Tablets', color: 'amber', icon: 'farm-tablet', poeVersions: ['poe2'] });
    expect(created.id).toMatch(/^custom-/);
    expect(readConfig()[`customFarmTypes:${profileIdA}`]).toEqual([created]);
    const customOption = `option[value="${created.id}"]`;

    // Dashboard picker: an open dropdown draws the icon, and the selection holds.
    await page.locator('.nav-btn[data-page="dashboard"]').click();
    const picker = page.locator('#session-farm-type-select');
    await expect(picker.locator(customOption)).toHaveText('Boss Tablets');
    await picker.selectOption(created.id);
    await expect(picker).toHaveValue(created.id);
    await picker.focus();
    await page.keyboard.press('Space');
    await expect(picker.locator(`${customOption} use`)).toHaveAttribute('href', 'assets/icons.svg#farm-tablet');
    expect(await iconHasBox(picker.locator(`${customOption} use`))).toBe(true);
    await page.keyboard.press('Escape');

    // Overlay start prompt: the chip has its colour and its icon, and picking it comes back to the main window.
    await page.evaluate(({ id, label }) => {
      window.__overlayPromptResults = [];
      window.electronAPI.onStartMapPromptOverlayResult((result) => window.__overlayPromptResults.push(result));
      return window.electronAPI.showStartMapPromptOverlay({
        mapName: 'Cemetery Map',
        farmTypeOptions: [{ id, label }, { id: 'ritual', label: 'Ritual' }]
      });
    }, { id: created.id, label: created.label });
    const overlay = await waitForWindow(electronApp, /Juice Journal Overlay/i);
    const chip = overlay.locator(`[data-farm-type-id="${created.id}"]`);
    await expect(chip).toHaveAttribute('data-farm-color', 'amber');
    await expect(chip).toHaveCSS('color', 'rgb(255, 176, 46)');
    expect(await iconHasBox(chip.locator('use'))).toBe(true);
    await chip.click();
    await overlay.locator('[data-overlay-start-submit]').click();
    await expect.poll(() => page.evaluate(() => window.__overlayPromptResults)).toEqual([
      { action: 'confirm', mapName: 'Cemetery Map', farmTypeId: created.id, source: 'map-detected' }
    ]);

    // Main-window start prompt and active session card.
    await page.locator('#start-session-btn').click();
    await expect(page.locator('#map-session-modal')).toBeVisible();
    const promptPicker = page.locator('#map-session-farm-type-select');
    await expect(promptPicker.locator(`${customOption} use`)).toHaveAttribute('href', 'assets/icons.svg#farm-tablet');
    await expect(promptPicker).toHaveValue(created.id);
    await page.locator('#map-session-confirm-btn').click();
    const liveFarm = page.locator('.session-live-farm');
    await expect(liveFarm).toHaveText('Boss Tablets');
    await expect(liveFarm).toHaveAttribute('data-farm-color', 'amber');
    expect(await iconHasBox(liveFarm.locator('use'))).toBe(true);

    // Result card, stored result and Sessions.
    await page.evaluate(() => window.electronAPI.endSession({}));
    const resultName = page.locator('#last-map-result-farm-type');
    await expect(resultName).toHaveText('Boss Tablets');
    await expect(resultName).toHaveAttribute('data-farm-color', 'amber');
    expect(await iconHasBox(resultName.locator('use'))).toBe(true);
    expect(readConfig()[`mapResults:${profileIdA}`][0]).toMatchObject({ farmTypeId: created.id, farmType: 'Boss Tablets' });
    const sessionFarm = page.locator(`#sessions-list [data-farm-type="${created.id}"]`);
    await page.locator('.nav-btn[data-page="sessions"]').click();
    await expect(sessionFarm).toHaveText('Boss Tablets');
    await expect(page.locator('#session-farm-filter option', { hasText: 'Boss Tablets' })).toHaveCount(1);

    // Overlay result card.
    await page.evaluate(({ id }) => window.electronAPI.showMapResultOverlay({
      id: 'overlay-result', farmTypeId: id, farmType: 'Boss Tablets', netProfit: 40, durationSeconds: 300, poeVersion: 'poe2'
    }, { durationMs: 60000 }), { id: created.id });
    const overlayName = overlay.locator('[data-overlay-primary] .jj-primary-name');
    await expect(overlayName).toHaveText('Boss Tablets');
    await expect(overlayName).toHaveAttribute('data-farm-color', 'amber');
    expect(await iconHasBox(overlayName.locator('use'))).toBe(true);
    await overlay.locator('[data-overlay-dismiss]').click();

    // Edit: the same id, and the rename and colour reach the past session and the stored result.
    await openCustomFarmSettings(page);
    await page.locator('[data-custom-farm-action="edit"]').click();
    await expect(page.locator('#custom-farm-name')).toHaveValue('Boss Tablets');
    await fillCustomFarmForm(page, { name: 'Overseer Juice', color: 'red', icon: 'farm-skull' });
    await expect(page.locator('.custom-farm-name')).toHaveText('Overseer Juice');
    const [edited] = await page.evaluate(() => window.electronAPI.getCustomFarmTypes());
    expect(edited).toMatchObject({ id: created.id, label: 'Overseer Juice', color: 'red', icon: 'farm-skull' });
    expect(readConfig()[`mapResults:${profileIdA}`][0].farmType).toBe('Overseer Juice');
    await page.locator('.nav-btn[data-page="sessions"]').click();
    await expect(sessionFarm).toHaveText('Overseer Juice');
    await expect(sessionFarm).toHaveAttribute('data-farm-color', 'red');

    // A relaunch keeps the type, the selection and the signed-in profile.
    page = await relaunch(ACCOUNT_A);
    await expect(page.locator('#username')).toHaveText(ACCOUNT_A.username);
    await expect(page.locator('#session-farm-type-select')).toHaveValue(created.id);
    await expect(page.locator('.custom-farm-name', { hasText: 'Overseer Juice' })).toHaveCount(1);

    // A second profile on this PC starts with none of it, and can use the same name.
    await page.locator('#logout-btn').click();
    await expect(page.locator('#login-modal')).toBeVisible();
    page = await relaunch(ACCOUNT_B);
    await signIn(page, ACCOUNT_B);
    const profileIdB = readConfig().activeProfileId;
    expect(profileIdB).not.toBe(profileIdA);
    expect(await page.evaluate(() => window.electronAPI.getCustomFarmTypes())).toEqual([]);
    expect(await page.evaluate(() => window.electronAPI.getActiveFarmType())).toBeNull();
    await expect(page.locator(`#session-farm-type-select ${customOption}`)).toHaveCount(0);
    await expect(page.locator('#session-farm-type-select')).toHaveValue('');
    const rendererSettings = await page.evaluate(() => window.electronAPI.getSettings());
    expect(Object.keys(rendererSettings).filter((key) => key.startsWith('customFarmTypes'))).toEqual([]);
    await openCustomFarmSettings(page);
    await expect(page.locator('.custom-farm-empty')).toBeVisible();
    await page.locator('#custom-farm-add-btn').click();
    await fillCustomFarmForm(page, { name: 'Overseer Juice', color: 'blue', icon: 'farm-star' });
    await expect(page.locator('.custom-farm-name')).toHaveText('Overseer Juice');
    expect(await page.evaluate(() => window.electronAPI.getCustomFarmTypes())).toEqual([expect.objectContaining({ color: 'blue' })]);

    // Back on the first profile its own type returns, and deleting it leaves its past session readable.
    await page.locator('#logout-btn').click();
    await expect(page.locator('#login-modal')).toBeVisible();
    page = await relaunch(ACCOUNT_A);
    await signIn(page, ACCOUNT_A);
    await expect(page.locator('.custom-farm-name')).toHaveText('Overseer Juice');
    expect(await page.evaluate(() => window.electronAPI.getCustomFarmTypes())).toEqual([expect.objectContaining({ id: created.id, color: 'red' })]);
    await openCustomFarmSettings(page);
    await page.locator('[data-custom-farm-action="delete"]').click();
    await expect(page.locator('.custom-farm-confirm')).toContainText('Delete Overseer Juice?');
    await page.locator('[data-custom-farm-action="confirm-delete"]').click();
    await expect(page.locator('.custom-farm-empty')).toBeVisible();
    await expect(page.locator(`#session-farm-type-select ${customOption}`)).toHaveCount(0);
    expect(await page.evaluate(() => window.electronAPI.getActiveFarmType())).toBeNull();

    page = await relaunch(ACCOUNT_A);
    // The app opens on the dashboard, so the Settings list is in the page but not on screen.
    await expect(page.locator('.custom-farm-empty')).toBeAttached();
    await expect(page.locator(`#session-farm-type-select ${customOption}`)).toHaveCount(0);
    await expect(page.locator('#last-map-result-farm-type')).toHaveText('Overseer Juice');
    await expect(page.locator('#last-map-result-farm-type')).toHaveAttribute('data-farm-color', 'red');
    await page.locator('.nav-btn[data-page="sessions"]').click();
    const deletedFarm = page.locator(`#sessions-list [data-farm-type="${created.id}"]`);
    await expect(deletedFarm).toHaveText('Overseer Juice');
    await expect(deletedFarm).toHaveAttribute('data-farm-color', 'red');
    expect(await iconHasBox(deletedFarm.locator('use'))).toBe(true);
  } finally {
    if (electronApp) {
      await shutdownElectronApp(electronApp);
    }
    fs.rmSync(profile.rootDir, { recursive: true, force: true });
  }
});
