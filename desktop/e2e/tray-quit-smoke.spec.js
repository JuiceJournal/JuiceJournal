const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { once } = require('events');
const { test, expect } = require('playwright/test');
const { _electron: electron } = require('playwright');

const SMOKE_USER = {
  id: 'smoke-poe-user-id',
  username: 'RangerMain',
  selectedCharacter: {
    id: 'char-smoke-main',
    name: 'RangerMain',
    level: 96,
    class: 'Ranger',
    ascendancy: 'Deadeye',
    league: 'Standard'
  }
};

function toSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'desktop-smoke';
}

async function startSmokeBackend() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      success: false,
      data: null,
      error: `Unhandled smoke endpoint: ${request.method} ${url.pathname}`,
      errorCode: 'NOT_FOUND'
    }));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Smoke backend did not expose a TCP port');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

function createIsolatedProfile(testInfo, apiUrl) {
  const tempRoot = path.join(os.tmpdir(), 'juice-journal-playwright');
  fs.mkdirSync(tempRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tempRoot, `${toSlug(testInfo.title)}-`));
  const appDataDir = path.join(rootDir, 'app-data');
  const userDataDir = path.join(rootDir, 'user-data');
  const tempDir = path.join(rootDir, 'temp');
  const poeLogPath = path.join(rootDir, 'Client.txt');

  fs.mkdirSync(appDataDir, { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(poeLogPath, '2026/04/10 12:00:00 Client started\n', 'utf8');

  return {
    rootDir,
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
      JUICE_JOURNAL_E2E_POE_LOG_PATH: poeLogPath,
      TMP: tempDir,
      TEMP: tempDir
    }
  };
}

function createBootstrapScript(testInfo, { overlayEnabled }) {
  const bootstrapRoot = path.join(os.tmpdir(), 'juice-journal-playwright');
  fs.mkdirSync(bootstrapRoot, { recursive: true });
  const bootstrapDir = fs.mkdtempSync(path.join(bootstrapRoot, `${toSlug(testInfo.title)}-bootstrap-`));
  const bootstrapPath = path.join(bootstrapDir, 'bootstrap.cjs');
  fs.writeFileSync(bootstrapPath, `
const fs = require('fs');
const path = require('path');
const { app, Tray } = require('electron');
require(${JSON.stringify(path.join(__dirname, 'network-stub.cjs'))});

const appDataDir = process.env.JUICE_JOURNAL_E2E_APP_DATA_DIR;
const userDataDir = process.env.JUICE_JOURNAL_E2E_USER_DATA_DIR;
const apiUrl = process.env.JUICE_JOURNAL_E2E_API_URL;
const poeLogPath = process.env.JUICE_JOURNAL_E2E_POE_LOG_PATH;

if (!appDataDir || !userDataDir || !apiUrl || !poeLogPath) {
  throw new Error('Missing smoke harness path overrides');
}

app.setPath('appData', appDataDir);
app.setPath('userData', userDataDir);
app.setPath('sessionData', path.join(userDataDir, 'session-data'));

fs.writeFileSync(path.join(userDataDir, 'config.json'), JSON.stringify({
  apiUrl,
  language: 'en',
  poeVersion: 'poe1',
  poePath: poeLogPath,
  autoStartSession: false,
  overlayEnabled: ${JSON.stringify(overlayEnabled)},
  authToken: null,
  authTokenEncrypted: null,
  currentUserId: null
}, null, '\\t'));

// Keep the latest tray menu reachable, so the test can pick its items like a user does.
const setContextMenu = Tray.prototype.setContextMenu;
Tray.prototype.setContextMenu = function keepLatestTrayMenu(menu) {
  globalThis.__e2eTrayMenu = menu;
  return setContextMenu.call(this, menu);
};
`, 'utf8');

  return {
    bootstrapDir,
    bootstrapPath
  };
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

async function signInWithPoeOAuth(page) {
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#poe-oauth-login')).toBeEnabled();
  await page.locator('#poe-oauth-login').click();
  await expect(page.locator('#login-modal')).toBeHidden();
  await expect(page.locator('#username')).toHaveText(SMOKE_USER.username);
}

async function startMap(page) {
  await page.locator('#start-session-btn').click();
  await page.locator('#map-session-confirm-btn').click();
  await expect(page.locator('#end-session-btn')).toBeVisible();
}

async function clickTrayItem(electronApp, label) {
  await electronApp.evaluate((_electron, wantedLabel) => {
    const item = globalThis.__e2eTrayMenu?.items.find((menuItem) => menuItem.label === wantedLabel);
    if (!item) {
      throw new Error(`Tray menu has no "${wantedLabel}" item`);
    }

    // Electron calls a picked menu item with (event, focusedWindow, focusedWebContents).
    setImmediate(() => item.click({}, null, null));
  }, label);
}

function readJournalSessions(userDataDir) {
  const profilesDir = path.join(userDataDir, 'profiles');
  return fs.readdirSync(profilesDir)
    .map((profileId) => path.join(profilesDir, profileId, 'journal.json'))
    .filter((journalPath) => fs.existsSync(journalPath))
    .flatMap((journalPath) => JSON.parse(fs.readFileSync(journalPath, 'utf8')).sessions || []);
}

async function closeServer(server) {
  if (!server?.listening) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function waitForProcessExit(childProcess, timeoutMs) {
  if (childProcess.exitCode !== null) {
    return {
      exitCode: childProcess.exitCode,
      signal: childProcess.signalCode
    };
  }

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      childProcess.off('exit', handleExit);
      reject(new Error(`Electron process did not exit within ${timeoutMs}ms`));
    }, timeoutMs);

    function handleExit(exitCode, signal) {
      clearTimeout(timeout);
      resolve({ exitCode, signal });
    }

    childProcess.once('exit', handleExit);
  });
}

async function shutdownElectronApp(electronApp, childProcess) {
  try {
    await electronApp.evaluate(({ app, BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.destroy();
      }

      app.exit(0);
    });
  } catch {
    // The process may already be gone.
  }

  try {
    await waitForProcessExit(childProcess, 5000);
  } catch {
    childProcess.kill('SIGKILL');
    await waitForProcessExit(childProcess, 5000);
  }
}

async function runTrayQuitScenario(testInfo, { overlayEnabled, hideToTray }) {
  const backend = await startSmokeBackend();
  const isolatedProfile = createIsolatedProfile(testInfo, backend.baseUrl);
  const bootstrap = createBootstrapScript(testInfo, { overlayEnabled });
  let electronApp;
  let childProcess;

  try {
    electronApp = await electron.launch({
      args: ['-r', bootstrap.bootstrapPath, path.join(__dirname, '..')],
      cwd: path.join(__dirname, '..'),
      env: isolatedProfile.env
    });
    childProcess = electronApp.process();
    const page = await waitForAppWindow(electronApp, /^Juice Journal$/i);

    await signInWithPoeOAuth(page);
    await startMap(page);
    if (overlayEnabled) {
      await waitForAppWindow(electronApp, /Juice Journal Overlay/i);
    }

    if (hideToTray) {
      await clickTrayItem(electronApp, 'Hide Window');
      await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
        .filter((window) => window.getTitle() === 'Juice Journal')
        .some((window) => window.isVisible()))).toBe(false);
    }

    // Before the fix the overlay (closable: false) cancelled the quit: the main window closed and the tray stayed.
    await clickTrayItem(electronApp, 'Quit');
    const exit = await waitForProcessExit(childProcess, 15000);

    expect(exit.exitCode).toBe(0);
    expect(readJournalSessions(isolatedProfile.userDataDir).map((session) => session.status)).toEqual(['completed']);
  } finally {
    // Tear down only a process that is still alive: app.exit(0) skips app.quit, which is why this escaped the other specs.
    if (childProcess && childProcess.exitCode === null) {
      await shutdownElectronApp(electronApp, childProcess);
    }
    await closeServer(backend.server);
    fs.rmSync(isolatedProfile.rootDir, { recursive: true, force: true });
    fs.rmSync(bootstrap.bootstrapDir, { recursive: true, force: true });
  }
}

test('tray quit smoke: quits with a map running, the overlay open and the window hidden to the tray', async ({}, testInfo) => {
  await runTrayQuitScenario(testInfo, { overlayEnabled: true, hideToTray: true });
});

test('tray quit smoke: quits with a map running and the overlay setting off', async ({}, testInfo) => {
  await runTrayQuitScenario(testInfo, { overlayEnabled: false, hideToTray: false });
});
