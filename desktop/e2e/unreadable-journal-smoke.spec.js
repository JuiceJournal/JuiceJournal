const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { once } = require('events');
const { test, expect } = require('playwright/test');
const { _electron: electron } = require('playwright');

const SMOKE_USER = {
  id: 'unreadable-journal-user-id',
  username: 'RangerMain',
  selectedCharacter: {
    id: 'char-unreadable-journal',
    name: 'RangerMain',
    level: 96,
    class: 'Ranger',
    ascendancy: 'Deadeye',
    league: 'Standard',
  },
};

// The local profile the broken journal belongs to; the stubbed sign-in opens it through its GGG account id.
const PROFILE_ID = 'unreadable-journal-profile';
// Cut off mid-session, as after a bad hand edit. The map name must never reach a log, report or toast.
const BROKEN_JOURNAL = '{"sessions": [ {"id": "a", "mapName": "Secret Map", ';
const BROKEN_FILE_NAME = /^journal\.broken-\d{8}-\d{6}(-\d+)?\.json$/;

function toSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unreadable-journal-smoke';
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

async function startSmokeBackend() {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    requests.push(`${request.method} ${url.pathname}`);

    writeJson(response, 404, {
      success: false,
      data: null,
      error: `Unhandled smoke endpoint: ${request.method} ${url.pathname}`,
      errorCode: 'NOT_FOUND',
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Smoke backend did not expose a TCP port');
  }

  return {
    server,
    requests,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function createIsolatedProfile(testInfo, apiUrl) {
  const tempRoot = path.join(os.tmpdir(), 'juice-journal-playwright');
  fs.mkdirSync(tempRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tempRoot, `${toSlug(testInfo.title)}-`));
  const appDataDir = path.join(rootDir, 'app-data');
  const userDataDir = path.join(rootDir, 'user-data');
  const tempDir = path.join(rootDir, 'temp');

  fs.rmSync(rootDir, { recursive: true, force: true });
  fs.mkdirSync(appDataDir, { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  return {
    rootDir,
    appDataDir,
    userDataDir,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JUICE_JOURNAL_FORCE_LIVE_AUTH: '1',
      JUICE_JOURNAL_E2E_APP_DATA_DIR: appDataDir,
      JUICE_JOURNAL_E2E_USER_DATA_DIR: userDataDir,
      JUICE_JOURNAL_E2E_API_URL: apiUrl,
      JUICE_JOURNAL_E2E_POE_ACCOUNT: JSON.stringify({
        sub: `${SMOKE_USER.id}-ggg`,
        username: SMOKE_USER.username,
        characters: { poe1: [{ ...SMOKE_USER.selectedCharacter, current: true }] }
      }),
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
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
require(${JSON.stringify(path.join(__dirname, 'network-stub.cjs'))});

const appDataDir = process.env.JUICE_JOURNAL_E2E_APP_DATA_DIR;
const userDataDir = process.env.JUICE_JOURNAL_E2E_USER_DATA_DIR;
const apiUrl = process.env.JUICE_JOURNAL_E2E_API_URL;

if (!appDataDir || !userDataDir || !apiUrl) {
  throw new Error('Missing smoke harness path overrides');
}

fs.mkdirSync(appDataDir, { recursive: true });
fs.mkdirSync(userDataDir, { recursive: true });

app.setPath('appData', appDataDir);
app.setPath('userData', userDataDir);
app.setPath('sessionData', path.join(userDataDir, 'session-data'));

const configPath = path.join(userDataDir, 'config.json');
fs.writeFileSync(configPath, JSON.stringify({
  apiUrl,
  language: 'en',
  poeVersion: 'poe1',
  authToken: null,
  authTokenEncrypted: null,
  currentUserId: null,
  localProfiles: ${JSON.stringify({
    [PROFILE_ID]: { id: PROFILE_ID, poeSub: `${SMOKE_USER.id}-ggg`, accountName: SMOKE_USER.username }
  })}
}, null, '\\t'));
`, 'utf8');

  return {
    bootstrapDir,
    bootstrapPath,
  };
}

async function waitForAppWindow(electronApp, expectedTitle) {
  const timeoutAt = Date.now() + 30000;

  while (Date.now() < timeoutAt) {
    const windows = electronApp.windows();
    for (const page of windows) {
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

async function waitForGuestReady(page) {
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveTitle(/Juice Journal/i);
  await expect(page.locator('#login-modal')).toBeVisible();
  await expect(page.locator('#poe-oauth-login')).toBeVisible();
  await expect(page.locator('#poe-oauth-login')).toBeEnabled();
  await expect(page.locator('#username')).toHaveText('Guest');
}

async function signIn(page) {
  await page.locator('#poe-oauth-login').click();
  await expect(page.locator('#login-modal')).toBeHidden();
  await expect(page.locator('#username')).toHaveText(SMOKE_USER.username);
}

async function startMap(page, mapName) {
  await page.locator('#start-session-btn').click();
  await expect(page.locator('#map-session-modal')).toBeVisible();
  await page.locator('#map-session-name-input').fill(mapName);
  await page.locator('#map-session-confirm-btn').click();
  await expect(page.locator('#map-session-modal')).toBeHidden();
}

async function closeServer(server) {
  if (!server?.listening) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function waitForProcessExit(childProcess, timeoutMs) {
  if (!childProcess) {
    return { exitCode: null, signal: null };
  }

  if (childProcess.exitCode !== null) {
    return {
      exitCode: childProcess.exitCode,
      signal: childProcess.signalCode,
    };
  }

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      childProcess.off('exit', handleExit);
      childProcess.off('error', handleError);
      reject(new Error(`Electron process did not exit within ${timeoutMs}ms`));
    }, timeoutMs);

    function handleExit(exitCode, signal) {
      clearTimeout(timeout);
      childProcess.off('error', handleError);
      resolve({ exitCode, signal });
    }

    function handleError(error) {
      clearTimeout(timeout);
      childProcess.off('exit', handleExit);
      reject(error);
    }

    childProcess.once('exit', handleExit);
    childProcess.once('error', handleError);
  });
}

async function shutdownElectronApp(electronApp) {
  const childProcess = electronApp?.process?.();
  const cleanupErrors = [];

  try {
    await electronApp.evaluate(({ app, BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.destroy();
      }

      app.exit(0);
    });
  } catch (error) {
    if (!childProcess || childProcess.exitCode === null) {
      cleanupErrors.push(`Failed to request Electron shutdown: ${error.message}`);
    }
  }

  try {
    await waitForProcessExit(childProcess, 5000);
  } catch (error) {
    cleanupErrors.push(error.message);
    if (childProcess && childProcess.exitCode === null) {
      childProcess.kill('SIGKILL');
      try {
        await waitForProcessExit(childProcess, 5000);
      } catch (forcedExitError) {
        cleanupErrors.push(`Forced Electron shutdown failed: ${forcedExitError.message}`);
      }
    }
  }

  if (cleanupErrors.length > 0) {
    throw new Error(cleanupErrors.join('; '));
  }
}

test('unreadable journal smoke: warns on Dashboard and Sessions and starts a new journal beside the broken one', async ({}, testInfo) => {
  const backend = await startSmokeBackend();
  const isolatedProfile = createIsolatedProfile(testInfo, backend.baseUrl);
  const bootstrap = createBootstrapScript(testInfo);
  const profileDir = path.join(isolatedProfile.userDataDir, 'profiles', PROFILE_ID);
  const journalPath = path.join(profileDir, 'journal.json');
  const readErrorLog = () => {
    try {
      return fs.readFileSync(path.join(isolatedProfile.userDataDir, 'logs', 'errors.jsonl'), 'utf8');
    } catch {
      return '';
    }
  };
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(journalPath, BROKEN_JOURNAL);
  let electronApp;
  let testError = null;

  try {
    electronApp = await electron.launch({
      args: ['-r', bootstrap.bootstrapPath, path.join(__dirname, '..')],
      cwd: path.join(__dirname, '..'),
      env: isolatedProfile.env,
    });
    const page = await waitForAppWindow(electronApp, /Juice Journal/i);

    await waitForGuestReady(page);
    await signIn(page);

    // Sign-in works, and the Dashboard says why the history is empty instead of showing nothing.
    const dashboardNotice = page.locator('#dashboard-journal-notice');
    await expect(dashboardNotice).toBeVisible();
    await expect(dashboardNotice).toContainText('Your journal could not be read');
    await expect(dashboardNotice).toContainText('nothing was deleted');

    // A map cannot start in a journal main cannot read, and the toast says so instead of Try again.
    await startMap(page, 'Dunes Map');
    const startToast = page.locator('#toast-container .toast', { hasText: 'Could not start the map' });
    await expect(startToast).toBeVisible();
    await expect(startToast).toContainText('Your journal could not be read.');
    await expect(startToast).not.toContainText('Try again');
    await expect(page.locator('#end-session-btn')).toBeHidden();
    expect(fs.readFileSync(journalPath, 'utf8')).toBe(BROKEN_JOURNAL);

    await page.locator('.nav-btn[data-page="sessions"]').click();
    const sessionsNotice = page.locator('#sessions-journal-notice');
    await expect(sessionsNotice).toBeVisible();
    // The notice says why the list is empty; the list does not say it a second time.
    await expect(page.locator('#sessions-list')).toBeEmpty();

    // Open data folder is the Data tab's action; the network stub records the path instead of opening it.
    await sessionsNotice.locator('[data-journal-action="open-folder"]').click();
    await expect.poll(() => electronApp.evaluate(() => globalThis.__e2eOpenedPaths || [])).toEqual([isolatedProfile.userDataDir]);

    // Report a problem opens Settings > About with a report that names the cause but nothing from the journal.
    await sessionsNotice.locator('[data-journal-action="report"]').click();
    await expect(page.locator('#settings-about')).toHaveClass(/active/);
    const aboutPreview = page.locator('#bug-report-preview');
    await expect(aboutPreview).toBeFocused();
    await expect(aboutPreview).toContainText('cannot be read (invalid JSON)');
    await expect(aboutPreview).not.toContainText('Secret Map');
    await expect.poll(readErrorLog).toContain('cannot be read (invalid JSON)');
    expect(readErrorLog()).not.toContain('Secret Map');
    expect(readErrorLog()).not.toContain('SyntaxError');

    // Start a new journal asks in main first; Cancel leaves the broken file where it is.
    await page.locator('.nav-btn[data-page="dashboard"]').click();
    await expect(dashboardNotice).toBeVisible();
    await electronApp.evaluate(({ dialog }) => {
      globalThis.__e2eMessageBoxes = [];
      globalThis.__e2eMessageBoxResponse = 1;
      dialog.showMessageBox = async (...args) => {
        globalThis.__e2eMessageBoxes.push(args.at(-1));
        return { response: globalThis.__e2eMessageBoxResponse, checkboxChecked: false };
      };
    });
    const startNewButton = dashboardNotice.locator('[data-journal-action="start-new"]');
    await startNewButton.click();
    await expect.poll(() => electronApp.evaluate(() => globalThis.__e2eMessageBoxes.length)).toBe(1);
    const [confirmOptions] = await electronApp.evaluate(() => globalThis.__e2eMessageBoxes);
    expect(confirmOptions).toMatchObject({
      type: 'warning',
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      buttons: ['Start new journal', 'Cancel']
    });
    expect(confirmOptions.detail).toContain('journal.broken-');
    expect(Object.values(confirmOptions).flat().join('\n')).not.toContain(isolatedProfile.userDataDir);
    await expect(startNewButton).toBeEnabled();
    await expect(dashboardNotice).toBeVisible();
    expect(fs.readdirSync(profileDir)).toEqual(['journal.json']);
    expect(fs.readFileSync(journalPath, 'utf8')).toBe(BROKEN_JOURNAL);

    // Confirmed: the broken file is renamed beside an empty journal, and the notice goes on both pages.
    await electronApp.evaluate(() => { globalThis.__e2eMessageBoxResponse = 0; });
    await startNewButton.click();
    await expect(page.locator('#toast-container .toast', { hasText: 'New journal started' })).toBeVisible();
    await expect(dashboardNotice).toBeHidden();
    await expect(page.locator('#start-session-btn')).toBeFocused();
    const brokenFiles = fs.readdirSync(profileDir);
    expect(brokenFiles).toHaveLength(1);
    expect(brokenFiles[0]).toMatch(BROKEN_FILE_NAME);
    const brokenPath = path.join(profileDir, brokenFiles[0]);
    expect(fs.readFileSync(brokenPath, 'utf8')).toBe(BROKEN_JOURNAL);
    await page.locator('.nav-btn[data-page="sessions"]').click();
    await expect(page.locator('#sessions-page')).toHaveClass(/active/);
    await expect(sessionsNotice).toBeHidden();
    await expect(page.locator('#sessions-list')).not.toContainText('Your journal could not be read.');

    // The new journal takes a map.
    await page.locator('.nav-btn[data-page="dashboard"]').click();
    await startMap(page, 'Dunes Map');
    await expect(page.locator('#end-session-btn')).toBeVisible();
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    expect(journal.sessions.map((session) => session.mapName)).toEqual(['Dunes Map']);
    expect(fs.readFileSync(brokenPath, 'utf8')).toBe(BROKEN_JOURNAL);
    expect(fs.readdirSync(profileDir).sort()).toEqual([brokenFiles[0], 'journal.json'].sort());
    await expect(dashboardNotice).toBeHidden();

    // The journal breaks while the PoE1 map runs: End map says why, and the notice comes back.
    const runningJournal = fs.readFileSync(journalPath, 'utf8');
    fs.writeFileSync(journalPath, BROKEN_JOURNAL);
    const endMap = async () => {
      await page.locator('#end-session-btn').click();
      await expect(page.locator('#map-session-modal')).toBeVisible();
      await page.locator('#map-session-confirm-btn').click();
      await expect(page.locator('#map-session-modal')).toBeHidden();
    };
    await endMap();
    const endToast = page.locator('#toast-container .toast', { hasText: 'Could not end the map' });
    await expect(endToast).toBeVisible();
    await expect(endToast).toContainText('Your journal could not be read.');
    await expect(endToast).not.toContainText('Try again');
    await expect(dashboardNotice).toBeVisible();
    await expect(page.locator('#end-session-btn')).toBeVisible();

    // Repaired by hand before the click: main leaves it alone, and focus lands on End map, which shows while the map runs.
    fs.writeFileSync(journalPath, runningJournal);
    // The click lands before the next refresh finds the repair and hides the notice; any refresh (prices loading for
    // the running map) may come first, so the click is dispatched without waiting for the button to stay visible.
    await startNewButton.dispatchEvent('click');
    await expect(page.locator('#toast-container .toast', { hasText: 'Your journal can be read now' })).toBeVisible();
    await expect(dashboardNotice).toBeHidden();
    await expect(page.locator('#end-session-btn')).toBeFocused();
    expect(await electronApp.evaluate(() => globalThis.__e2eMessageBoxes.length)).toBe(2);

    // Broken again mid-map and confirmed: the map goes with the old journal, and focus lands on Start map.
    fs.writeFileSync(journalPath, BROKEN_JOURNAL);
    await endMap();
    await expect(dashboardNotice).toBeVisible();
    await startNewButton.click();
    await expect(page.locator('#toast-container .toast', { hasText: 'New journal started' }).last()).toBeVisible();
    await expect(dashboardNotice).toBeHidden();
    await expect(page.locator('#end-session-btn')).toBeHidden();
    await expect(page.locator('#start-session-btn')).toBeFocused();
    const keptFiles = fs.readdirSync(profileDir).filter((name) => name !== 'journal.json');
    expect(keptFiles).toHaveLength(2);
    expect(keptFiles).toContain(brokenFiles[0]);
    expect(fs.existsSync(journalPath)).toBe(false);
    expect(backend.requests).toEqual([]);
  } catch (error) {
    testError = error;
  } finally {
    const cleanupErrors = [];

    if (electronApp) {
      try {
        await shutdownElectronApp(electronApp);
      } catch (error) {
        cleanupErrors.push(`Electron cleanup failed: ${error.message}`);
      }
    }

    try {
      await closeServer(backend.server);
    } catch (error) {
      cleanupErrors.push(`Smoke backend cleanup failed: ${error.message}`);
    }

    for (const target of [isolatedProfile.rootDir, bootstrap.bootstrapDir]) {
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch (error) {
        cleanupErrors.push(`Failed to remove ${target}: ${error.message}`);
      }
    }

    if (cleanupErrors.length > 0) {
      const cleanupError = new Error(cleanupErrors.join('\n'));
      if (testError) {
        throw new AggregateError([testError, cleanupError], 'Smoke test failed with cleanup errors');
      }

      throw cleanupError;
    }

    if (testError) {
      throw testError;
    }
  }
});
