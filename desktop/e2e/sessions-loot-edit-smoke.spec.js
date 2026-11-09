const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('playwright/test');
const { _electron: electron } = require('playwright');

const ACCOUNT = { sub: 'loot-edit-a', username: 'LootEditor', characters: { poe1: [], poe2: [] } };
const SESSION_ID = 'loot-edit-session-1';
const ENDED_AT = '2026-11-04T10:30:00.000Z';
const RESULT_ID = `map-result-${SESSION_ID}-${Date.parse(ENDED_AT)}`;

function createIsolatedProfile() {
  const tempRoot = path.join(os.tmpdir(), 'juice-journal-playwright');
  fs.mkdirSync(tempRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tempRoot, 'sessions-loot-edit-'));
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
    userDataDir,
    configPath: path.join(userDataDir, 'config.json'),
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

// A finished run with three editable entries and one saved before entries had ids.
function createSession() {
  const at = (minutes) => new Date(Date.parse(ENDED_AT) - minutes * 60000).toISOString();
  return {
    id: SESSION_ID,
    mapName: 'Cemetery Map',
    mapTier: 15,
    status: 'completed',
    durationSec: 300,
    costChaos: 20,
    totalLootChaos: 218,
    profitChaos: 198,
    poeVersion: 'poe2',
    league: 'Standard',
    startedAt: at(5),
    endedAt: ENDED_AT,
    lootEntries: [
      { id: 'loot-divine', itemName: 'Divine Orb', quantity: 2, chaosValue: 100, createdAt: at(4), updatedAt: at(4) },
      { id: 'loot-chaos', itemName: 'Chaos Orb', quantity: 3, chaosValue: 1, createdAt: at(3), updatedAt: at(3) },
      { id: 'loot-exalted', itemName: 'Exalted Orb', quantity: 1, chaosValue: 10, createdAt: at(2), updatedAt: at(2) },
      { itemName: 'Old Scroll', quantity: 1, chaosValue: 5, createdAt: at(1) }
    ]
  };
}

function createMapResult(overrides) {
  return {
    poeVersion: 'poe2',
    league: 'Standard',
    farmType: 'Unknown',
    durationSeconds: 300,
    inputValue: 20,
    topInputs: [],
    topOutputs: [],
    ...overrides
  };
}

const getJournalSession = (page) => page.evaluate((id) => window.electronAPI.getSessionDetails(id), SESSION_ID);
// The same call the app makes to load Map Result History.
const getMapResults = (page) => page.evaluate(() => window.electronAPI.getMapResults());
const lootRow = (page, lootId) => page.locator(`#session-drawer-loot .session-drawer-loot-item[data-loot-id="${lootId}"]`);

test('sessions loot edit smoke: quantity and remove reach the journal and the saved result, without moving it', async () => {
  test.setTimeout(180000);
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

    // The profile exists after sign-in, so the journal goes into its folder before Sessions loads it.
    const profileId = JSON.parse(fs.readFileSync(profile.configPath, 'utf8')).activeProfileId;
    const journalDir = path.join(profile.userDataDir, 'profiles', profileId);
    fs.mkdirSync(journalDir, { recursive: true });
    fs.writeFileSync(path.join(journalDir, 'journal.json'), JSON.stringify({ sessions: [{ ...createSession(), lootUnread: true }] }));

    // The edited run's result goes in first, a newer unrelated one second, so the edited one is not first in the list.
    await page.evaluate((result) => window.electronAPI.saveMapResult(result), createMapResult({
      id: RESULT_ID, sessionId: SESSION_ID, mapName: 'Cemetery Map', outputValue: 218, netProfit: 198,
      profitState: 'positive', publishState: 'published', publishedRunId: 'run-1', createdAt: ENDED_AT
    }));
    await page.evaluate((result) => window.electronAPI.saveMapResult(result), createMapResult({
      id: 'map-result-other-run', mapName: 'Dunes Map', outputValue: 50, netProfit: 30, profitState: 'positive',
      createdAt: '2026-11-04T11:00:00.000Z'
    }));
    const before = await getMapResults(page);
    expect(before.map((result) => result.id)).toEqual(['map-result-other-run', RESULT_ID]);
    expect(before[1]).toMatchObject({ publishState: 'published', netProfit: 198 });

    await page.locator('.nav-btn[data-page="sessions"]').click();
    await page.locator(`#sessions-list [data-session-id="${SESSION_ID}"]`).click();
    await expect(page.locator('#session-detail-drawer')).not.toHaveClass(/hidden/);
    await expect(page.locator('#session-drawer-title')).toHaveText('Cemetery Map');
    await expect(page.locator('#session-drawer-loot-count')).toHaveText('7');

    // The read that settled this map left new items unread, so the run says so.
    await expect(page.locator('.session-drawer-loot-note')).toContainText('could not be read');

    // The old entry never gets controls; the others do once editing is on.
    const toggle = page.locator('#session-drawer-loot-edit');
    await expect(toggle).toHaveText('Edit');
    await toggle.click();
    await expect(toggle).toHaveText('Done');
    await expect(page.locator('.session-drawer-loot-qty')).toHaveCount(3);
    await expect(page.locator('.session-drawer-loot-remove')).toHaveCount(3);
    const oldRow = page.locator('#session-drawer-loot .session-drawer-loot-item', { hasText: 'Old Scroll' });
    await expect(oldRow).toHaveCount(1);
    await expect(oldRow.locator('input, button')).toHaveCount(0);

    // Quantity: 2 -> 5 Divine Orbs is 500 chaos instead of 200.
    const divineQty = lootRow(page, 'loot-divine').locator('.session-drawer-loot-qty');
    await expect(divineQty).toHaveValue('2');
    await expect(lootRow(page, 'loot-divine').locator('.session-drawer-loot-value')).toContainText('200');
    await divineQty.fill('5');
    await divineQty.press('Enter');
    await expect(lootRow(page, 'loot-divine').locator('.session-drawer-loot-value')).toContainText('500');
    await expect(lootRow(page, 'loot-divine').locator('.session-drawer-loot-qty')).toHaveValue('5');
    await expect(page.locator('.session-drawer-facts')).toContainText('518');
    await expect(page.locator('#session-drawer-loot-count')).toHaveText('10');
    let session = await getJournalSession(page);
    expect(session.status).toBe('completed');
    expect(session.lootEntries.find((entry) => entry.id === 'loot-divine').quantity).toBe(5);
    expect(session.lootEntries.map((entry) => entry.id)).toEqual(['loot-divine', 'loot-chaos', 'loot-exalted', undefined]);
    expect(session.totalLootChaos).toBe(518);
    expect(session.profitChaos).toBe(498);

    // Rebuilding the rows fires focusout on the box being typed in. A rebuild, here from the remove button disarming
    // after four seconds, keeps the half-typed number and focus, and saves nothing.
    const exaltedRemove = lootRow(page, 'loot-exalted').locator('.session-drawer-loot-remove');
    await exaltedRemove.click();
    await expect(exaltedRemove).toHaveClass(/is-armed/);
    const exaltedQty = lootRow(page, 'loot-exalted').locator('.session-drawer-loot-qty');
    await exaltedQty.click();
    await exaltedQty.fill('7');
    await expect(exaltedRemove).not.toHaveClass(/is-armed/, { timeout: 6000 });
    await expect(exaltedQty).toHaveValue('7');
    await expect(exaltedQty).toBeFocused();
    expect((await getJournalSession(page)).lootEntries.find((entry) => entry.id === 'loot-exalted').quantity).toBe(1);
    await exaltedQty.fill('1');
    await exaltedQty.press('Enter');
    expect((await getJournalSession(page)).totalLootChaos).toBe(518);

    // Remove takes two clicks: the first only arms the row.
    const chaosRemove = lootRow(page, 'loot-chaos').locator('.session-drawer-loot-remove');
    await chaosRemove.click();
    await expect(chaosRemove).toHaveClass(/is-armed/);
    await expect(chaosRemove).toHaveText('Remove?');
    await expect(chaosRemove).toHaveAttribute('aria-label', 'Confirm removing Chaos Orb');
    expect((await getJournalSession(page)).lootEntries).toHaveLength(4);

    // Escape only disarms; the drawer stays open.
    await page.keyboard.press('Escape');
    await expect(chaosRemove).not.toHaveClass(/is-armed/);
    await expect(page.locator('#session-detail-drawer')).not.toHaveClass(/hidden/);
    expect((await getJournalSession(page)).lootEntries).toHaveLength(4);

    await chaosRemove.click();
    await expect(chaosRemove).toHaveClass(/is-armed/);
    await chaosRemove.click();
    await expect(lootRow(page, 'loot-chaos')).toHaveCount(0);
    await expect(page.locator('.session-drawer-facts')).toContainText('515');
    session = await getJournalSession(page);
    expect(session.lootEntries.map((entry) => entry.id)).toEqual(['loot-divine', 'loot-exalted', undefined]);
    expect(session.totalLootChaos).toBe(515);
    expect(session.profitChaos).toBe(495);

    // The saved result kept its place and publish state, and follows the new profit.
    await expect.poll(async () => (await getMapResults(page)).find((result) => result.id === RESULT_ID)?.netProfit).toBe(495);
    const after = await getMapResults(page);
    expect(after.map((result) => result.id)).toEqual(['map-result-other-run', RESULT_ID]);
    expect(after[1]).toMatchObject({ publishState: 'published', publishedRunId: 'run-1', outputValue: 515, netProfit: 495, lootItemCount: 7 });
    expect(after[0]).toMatchObject({ outputValue: 50, netProfit: 30 });

    // An item the read left unread is added by hand. No prices are loaded for this run's league, so it counts as 0.
    const addRow = page.locator('[data-session-loot-add]');
    await expect(addRow).toBeVisible();
    await addRow.locator('[name="itemName"]').fill('Essence of Ruin');
    await addRow.locator('[name="quantity"]').fill('2');
    await addRow.locator('[name="quantity"]').press('Enter');
    await expect(page.locator('#session-drawer-loot .session-drawer-loot-item', { hasText: 'Essence of Ruin' })).toHaveCount(1);
    await expect(addRow.locator('[name="itemName"]')).toHaveValue('');
    session = await getJournalSession(page);
    expect(session.lootEntries[0]).toMatchObject({ itemName: 'Essence of Ruin', quantity: 2, source: 'manual', chaosValue: 0 });
    expect(session.totalLootChaos).toBe(515);
  } finally {
    if (electronApp) {
      await shutdownElectronApp(electronApp);
    }
    fs.rmSync(profile.rootDir, { recursive: true, force: true });
  }
});
