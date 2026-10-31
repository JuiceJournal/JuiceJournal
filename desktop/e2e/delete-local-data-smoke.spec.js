const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { once } = require('events');
const { test, expect } = require('playwright/test');
const { _electron: electron } = require('playwright');

const SMOKE_USER = {
  id: 'delete-local-data-user-id',
  username: 'RangerMain',
  selectedCharacter: {
    id: 'char-delete-local-data',
    name: 'RangerMain',
    level: 96,
    class: 'Ranger',
    ascendancy: 'Deadeye',
    league: 'Standard',
  },
};

// The stubbed sign-in opens profile A through its GGG account id, so its journal is the live one. Profile B belongs to
// another account on this PC. Each test makes one of the two journals unreadable.
const PROFILE_A = 'delete-local-data-profile-a';
const PROFILE_B = 'delete-local-data-profile-b';
const BROKEN_JOURNAL = '{"sessions": [ {"id": "a", "mapName": "Secret Map", ';
const BROKEN_COPY = 'journal.broken-20261028-190509.json';
const VALID_JOURNAL = JSON.stringify({
  sessions: [{ id: 'b-1', mapName: 'Dunes Map', status: 'completed', startedAt: '2026-10-28T10:00:00.000Z' }]
});
// Seeded under user data; Delete everything removes each of them.
const SEEDED_FOLDERS = ['profiles', 'icon-cache', 'ocr-cache', 'logs', 'Partitions'];
// conf's clear() writes back only the defaults that are not null, and main sets the language again.
const KEPT_CONFIG_KEYS = [
  'apiUrl', 'auditTrail', 'autoStartSession', 'language', 'localProfiles', 'notifications', 'onlineEnabled',
  'overlayEnabled', 'poePath', 'poeVersion', 'scanHotkey', 'soundNotifications', 'stashScanHotkey', 'strategyPresets'
];
// The sign-ins, the active profile and every profile's map results and character list.
const REMOVED_CONFIG_KEYS = [
  'activeProfileId', 'activeFarmTypeId', 'authToken', 'authTokenEncrypted', 'currentUserId', 'poeOAuthTokens',
  'poeOAuthTokensEncrypted', `mapResults:${PROFILE_A}`, `lastKnownAccountState:${PROFILE_A}`, 'defaultLeaguePoe1'
];
// The run the real-quit test leaves running; afterwards no file under user data may name it.
const RUNNING_MAP = 'Crimson Temple Map';

function toSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'delete-local-data-smoke';
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
    tempRoot,
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

// Every request the main process starts, answered by the stub or not, so a test can check that none went out. The
// app's requests all go through axios or Node's http, https or fetch.
globalThis.__e2eRequests = [];
const recordCalls = (target, method, label) => {
  const original = target[method];
  target[method] = function (...args) {
    globalThis.__e2eRequests.push(label);
    return original.apply(this, args);
  };
};
for (const name of ['http', 'https']) {
  recordCalls(require(name), 'request', name + '.request');
  recordCalls(require(name), 'get', name + '.get');
}
recordCalls(globalThis, 'fetch', 'fetch');
const axios = require(require.resolve('axios', { paths: [${JSON.stringify(path.join(__dirname, '..'))}] }));
const createClient = axios.create;
axios.create = (config) => {
  const client = createClient(config);
  for (const method of ['get', 'post', 'request']) {
    recordCalls(client, method, 'axios.' + method);
  }
  return client;
};

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
  defaultLeaguePoe1: 'Standard',
  poeOAuthTokensEncrypted: 'e2e-not-a-token',
  auditTrail: [{ id: 'e2e-audit-1', key: 'auditLogin', values: {}, level: 'info', createdAt: '2026-10-28T10:00:00.000Z' }],
  localProfiles: ${JSON.stringify({
    [PROFILE_A]: { id: PROFILE_A, poeSub: `${SMOKE_USER.id}-ggg`, accountName: SMOKE_USER.username },
    [PROFILE_B]: { id: PROFILE_B, poeSub: 'delete-local-data-other-ggg', accountName: 'OtherMain' }
  })},
  ${JSON.stringify(`mapResults:${PROFILE_A}`)}: [{ id: 'result-1', localRunId: 'result-1', mapName: 'Dunes Map', netProfit: 42, profitChaos: 42, calculationStatus: 'calculated', createdAt: '2026-10-28T10:30:00.000Z' }],
  ${JSON.stringify(`lastKnownAccountState:${PROFILE_A}`)}: { apiCurrentByGame: { poe1: ${JSON.stringify(SMOKE_USER.selectedCharacter.id)} } }
}, null, '\\t'));
`, 'utf8');

  return {
    bootstrapDir,
    bootstrapPath,
  };
}

// Every journal, cache and log Delete everything removes, and a Partitions folder left over from the Overwolf version.
// The unreadable profile also keeps a journal.broken-* copy.
function seedUserData(userDataDir, { unreadableProfile }) {
  const write = (relativePath, content) => {
    const filePath = path.join(userDataDir, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  };
  const readableProfile = unreadableProfile === PROFILE_A ? PROFILE_B : PROFILE_A;
  write(`profiles/${unreadableProfile}/journal.json`, BROKEN_JOURNAL);
  write(`profiles/${unreadableProfile}/${BROKEN_COPY}`, BROKEN_JOURNAL);
  write(`profiles/${readableProfile}/journal.json`, VALID_JOURNAL);
  write(`icon-cache/${'a1'.repeat(32)}.png`, 'not really a png');
  write('ocr-cache/eng.traineddata', 'not really OCR data');
  write('logs/errors.jsonl', '{"level":"error","message":"e2e seeded error"}\n');
  write('Partitions/overwolf/Preferences', '{}');
}

function listFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function readConfig(userDataDir) {
  return JSON.parse(fs.readFileSync(path.join(userDataDir, 'config.json'), 'utf8'));
}

// What a finished Delete everything leaves: no seeded folder, and settings that are the defaults and the language.
function expectDataDeleted(userDataDir, language) {
  expect(SEEDED_FOLDERS.filter((folder) => fs.existsSync(path.join(userDataDir, folder)))).toEqual([]);
  const config = readConfig(userDataDir);
  expect(Object.keys(config).sort()).toEqual(KEPT_CONFIG_KEYS);
  expect(config).toMatchObject({
    language,
    localProfiles: {},
    auditTrail: [],
    apiUrl: 'http://localhost:3001',
    onlineEnabled: false,
    overlayEnabled: false
  });
  for (const key of REMOVED_CONFIG_KEYS) {
    expect(config).not.toHaveProperty([key]);
  }
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
  await expect(page.locator('#end-session-btn')).toBeVisible();
}

async function openDataTab(page) {
  await page.locator('.nav-btn[data-page="settings"]').click();
  await page.locator('.settings-nav-btn[data-settings-tab="data"]').click();
  await expect(page.locator('#delete-all-local-data')).toBeVisible();
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

// Seeds an isolated user data folder, launches the app on it, signs in and runs the test, then cleans up. The cleanup
// also copes with an app that has already quit by itself.
async function runSignedIn(testInfo, seedOptions, runTest) {
  const backend = await startSmokeBackend();
  const isolatedProfile = createIsolatedProfile(testInfo, backend.baseUrl);
  const bootstrap = createBootstrapScript(testInfo);
  const { userDataDir } = isolatedProfile;
  let electronApp;
  // Kept from the start: once the app has quit, Playwright no longer hands out its process.
  let childProcess = null;
  let testError = null;

  try {
    // Never against a real profile: the folder this test deletes lies in its own temp root.
    const relativeUserData = path.relative(isolatedProfile.tempRoot, userDataDir);
    expect(relativeUserData.startsWith('..') || path.isAbsolute(relativeUserData)).toBe(false);
    seedUserData(userDataDir, seedOptions);

    electronApp = await electron.launch({
      args: ['-r', bootstrap.bootstrapPath, path.join(__dirname, '..')],
      cwd: path.join(__dirname, '..'),
      env: isolatedProfile.env,
    });
    childProcess = electronApp.process();
    expect(await electronApp.evaluate(({ app }) => app.getPath('userData'))).toBe(userDataDir);
    const page = await waitForAppWindow(electronApp, /Juice Journal/i);

    await waitForGuestReady(page);
    await signIn(page);
    await runTest({ electronApp, childProcess, page, isolatedProfile });
  } catch (error) {
    testError = error;
  } finally {
    const cleanupErrors = [];

    if (electronApp && childProcess?.exitCode === null) {
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
}

test('delete local data smoke: asks with a checkbox, removes every journal, cache and log, keeps the language and restarts', async ({}, testInfo) => {
  await runSignedIn(testInfo, { unreadableProfile: PROFILE_A }, async ({ electronApp, page, isolatedProfile }) => {
    const { userDataDir } = isolatedProfile;
    const seededFolders = () => SEEDED_FOLDERS.filter((folder) => fs.existsSync(path.join(userDataDir, folder)));
    // The window's own requests; the bundled files it loads are not requests to anyone.
    const rendererRequests = [];
    page.on('request', (request) => {
      if (/^(https?|wss?):/.test(request.url())) {
        rendererRequests.push(request.url());
      }
    });
    await expect(page.locator('#dashboard-journal-notice')).toBeVisible();

    // A language main keeps as it is: the UI stays English, and getLanguage would fold it to English.
    await page.evaluate(() => window.electronAPI.setSettings({ language: 'de' }));
    // The restart is recorded instead of run, so the test can look at the folder afterwards.
    await electronApp.evaluate(({ app }) => {
      globalThis.__e2eRestart = { relaunch: 0, quit: 0 };
      app.relaunch = () => {
        globalThis.__e2eRestart.relaunch += 1;
      };
      app.quit = () => {
        globalThis.__e2eRestart.quit += 1;
      };
    });
    const restarts = () => electronApp.evaluate(() => globalThis.__e2eRestart);

    await openDataTab(page);
    const deleteAllButton = page.locator('#delete-all-local-data');
    await expect(deleteAllButton).toHaveText('Delete everything');
    expect(await page.evaluate(() => {
      const clearLogs = document.getElementById('clear-logs');
      const deleteAll = document.getElementById('delete-all-local-data');
      return Boolean(clearLogs.compareDocumentPosition(deleteAll) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);

    const modal = page.locator('#delete-all-modal');
    const ack = page.locator('#delete-all-ack');
    const cancel = page.locator('#delete-all-cancel');
    const confirm = page.locator('#delete-all-confirm');
    const openDialog = async () => {
      await deleteAllButton.click();
      await expect(modal).toBeVisible();
      await expect(cancel).toBeFocused();
      await expect(ack).not.toBeChecked();
      await expect(confirm).toBeDisabled();
    };
    // Where Cancel and Delete everything sit in the dialog, so the busy label cannot move them under the pointer.
    const actionRow = () => page.evaluate(() => {
      const content = document.querySelector('.delete-all-content').getBoundingClientRect();
      const place = (id) => {
        const box = document.getElementById(id).getBoundingClientRect();
        return { left: box.left - content.left, width: box.width };
      };
      return { cancel: place('delete-all-cancel'), confirm: place('delete-all-confirm') };
    });
    const expectNothingDeleted = async () => {
      await expect(modal).toBeHidden();
      await expect(deleteAllButton).toBeFocused();
      expect(await restarts()).toEqual({ relaunch: 0, quit: 0 });
      expect(seededFolders()).toEqual(SEEDED_FOLDERS);
    };

    // Enter on the dialog as it opens presses Cancel, never Delete everything.
    await openDialog();
    await expect(modal).toContainText('Delete everything?');
    await expect(modal).toContainText('not revoked');
    // Tab stays in the dialog and skips the disabled Delete everything.
    await page.keyboard.press('Tab');
    await expect(ack).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Enter');
    await expectNothingDeleted();

    await openDialog();
    await page.keyboard.press('Escape');
    await expectNothingDeleted();

    // Ticking enables Delete everything, unticking disables it again.
    await openDialog();
    await ack.check();
    await expect(confirm).toBeEnabled();
    await ack.uncheck();
    await expect(confirm).toBeDisabled();
    await ack.check();
    const idleRow = await actionRow();
    // From here on, nothing may go over the network. The recorder saw the sign-in's requests, so an empty list at the
    // end means that none went out.
    expect(await electronApp.evaluate(() => globalThis.__e2eRequests)).toEqual(expect.arrayContaining(['http.get', 'axios.post']));
    await electronApp.evaluate(() => {
      globalThis.__e2eRequests.length = 0;
    });
    rendererRequests.length = 0;
    await confirm.click();

    await expect.poll(restarts).toEqual({ relaunch: 1, quit: 1 });
    // The dialog stays busy until the app goes, focus stays in it, and the button row does not move.
    await expect(modal).toBeVisible();
    await expect(confirm).toHaveAttribute('aria-busy', 'true');
    await expect(confirm).toHaveText('Deleting...');
    await expect(page.locator('#delete-all-title')).toBeFocused();
    expect(await actionRow()).toEqual(idleRow);

    expectDataDeleted(userDataDir, 'de');

    // A second call while the app restarts answers busy and cannot restart twice.
    expect(await page.evaluate(() => window.electronAPI.deleteAllLocalData())).toEqual({ deleted: false, reason: 'busy' });
    expect(await restarts()).toEqual({ relaunch: 1, quit: 1 });
    expect(await electronApp.evaluate(() => globalThis.__e2eRequests)).toEqual([]);
    expect(rendererRequests).toEqual([]);
  });
});

test('delete local data smoke: with a map running, the app really quits after the delete and writes nothing back', async ({}, testInfo) => {
  await runSignedIn(testInfo, { unreadableProfile: PROFILE_B }, async ({ electronApp, childProcess, page, isolatedProfile }) => {
    const { userDataDir, rootDir } = isolatedProfile;
    const journalPath = path.join(userDataDir, 'profiles', PROFILE_A, 'journal.json');
    await expect(page.locator('#dashboard-journal-notice')).toBeHidden();

    // A running map is in the journal, and its overlay window is the one that cannot be closed.
    await startMap(page, RUNNING_MAP);
    await expect.poll(() => fs.readFileSync(journalPath, 'utf8').includes(RUNNING_MAP)).toBe(true);
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => (
      BrowserWindow.getAllWindows().filter((window) => !window.isClosable()).length
    ))).toBe(1);

    // Only the relaunch is replaced: it writes to a file beside user data, because the process is gone afterwards.
    const relaunchLog = path.join(rootDir, 'relaunch.log');
    expect(path.relative(userDataDir, relaunchLog).startsWith('..')).toBe(true);
    await electronApp.evaluate(({ app }, logPath) => {
      const { appendFileSync } = process.mainModule.require('fs');
      app.relaunch = () => appendFileSync(logPath, 'relaunch\n');
    }, relaunchLog);

    await openDataTab(page);
    await page.locator('#delete-all-local-data').click();
    await page.locator('#delete-all-ack').check();
    await page.locator('#delete-all-confirm').click();

    const exit = await waitForProcessExit(childProcess, 20000);
    expect(exit.exitCode).toBe(0);
    expect(fs.readFileSync(relaunchLog, 'utf8')).toBe('relaunch\n');

    // Neither the end of the run on the way out nor anything else on the quit path wrote the data back.
    expectDataDeleted(userDataDir, 'en');
    const needles = [Buffer.from(RUNNING_MAP, 'utf8'), Buffer.from(RUNNING_MAP, 'utf16le')];
    const namingFiles = listFiles(userDataDir).filter((file) => {
      const content = fs.readFileSync(file);
      return needles.some((needle) => content.includes(needle));
    });
    expect(namingFiles).toEqual([]);
  });
});

test('delete local data smoke: a folder that cannot be deleted leaves sign-in with the reset settings, and Try again deletes from there', async ({}, testInfo) => {
  await runSignedIn(testInfo, { unreadableProfile: PROFILE_A }, async ({ electronApp, page, isolatedProfile }) => {
    const { userDataDir } = isolatedProfile;
    const signInButton = page.locator('#poe-oauth-login');
    const modal = page.locator('#delete-all-modal');
    // The seeded server address, which the reset turns back into the default.
    await expect(page.locator('#api-url')).not.toHaveValue('http://localhost:3001');
    await electronApp.evaluate(({ app }) => {
      globalThis.__e2eRestart = { relaunch: 0, quit: 0 };
      app.relaunch = () => {
        globalThis.__e2eRestart.relaunch += 1;
      };
      app.quit = () => {
        globalThis.__e2eRestart.quit += 1;
      };
    });
    const restarts = () => electronApp.evaluate(() => globalThis.__e2eRestart);
    // profiles/ fails as if another program held a file in it; every other step runs.
    await electronApp.evaluate(() => {
      const { promises } = process.mainModule.require('fs');
      globalThis.__e2eRm = promises.rm;
      promises.rm = async (target, options) => {
        if (target.endsWith('profiles')) {
          throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
        }
        return globalThis.__e2eRm(target, options);
      };
    });

    await openDataTab(page);
    await page.locator('#delete-all-local-data').click();
    await page.locator('#delete-all-ack').check();
    await page.locator('#delete-all-confirm').click();

    const toast = page.locator('#toast-container .toast', { hasText: 'Not everything could be deleted' });
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Close any program that has one of them open, then try again.');
    await expect(modal).toBeHidden();
    await expect(page.locator('#login-modal')).toBeVisible();
    await expect(signInButton).toBeFocused();
    await expect(page.locator('#username')).toHaveText('Guest');
    expect(await restarts()).toEqual({ relaunch: 0, quit: 0 });
    expect(fs.existsSync(path.join(userDataDir, 'profiles', PROFILE_A, 'journal.json'))).toBe(true);
    // The form shows what main reset, so a Save cannot write the old settings back, and the window did not sign out
    // a second time into the activity log main cleared.
    await expect(page.locator('#api-url')).toHaveValue('http://localhost:3001');
    expect(readConfig(userDataDir)).toMatchObject({ auditTrail: [], localProfiles: {} });
    expect(readConfig(userDataDir)).not.toHaveProperty(['poeOAuthTokensEncrypted']);

    // The other program let go. Try again opens the dialog over sign-in, without a new sign-in first.
    await electronApp.evaluate(() => {
      process.mainModule.require('fs').promises.rm = globalThis.__e2eRm;
    });
    await toast.getByRole('button', { name: 'Try again' }).click();
    await expect(modal).toBeVisible();
    await expect(page.locator('#delete-all-cancel')).toBeFocused();
    await page.locator('#delete-all-ack').check();
    await page.locator('#delete-all-confirm').click();

    await expect.poll(restarts).toEqual({ relaunch: 1, quit: 1 });
    expectDataDeleted(userDataDir, 'en');
  });
});
