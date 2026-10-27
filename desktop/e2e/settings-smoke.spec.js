const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { once } = require('events');
const { test, expect } = require('playwright/test');
const { _electron: electron } = require('playwright');
const { REPORT_ISSUE_URL, ISSUE_URL_MAX_LENGTH } = require('../src/modules/bugReportModel');

const SMOKE_USER = {
  id: 'smoke-user-id',
  username: 'RangerMain',
  password: 'smoke-password',
  token: 'smoke-poe-token',
  accountName: 'SmokeAccount',
  selectedCharacter: {
    id: 'char-smoke-main',
    name: 'RangerMain',
    level: 96,
    class: 'Ranger',
    ascendancy: 'Deadeye',
    league: 'Standard',
  },
};

function toSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'desktop-smoke';
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
  currentUserId: null
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
  await expect(page.locator('#login-form')).toHaveCount(0);
  await expect(page.locator('#register-form')).toHaveCount(0);
  await expect(page.locator('#poe-oauth-login')).toBeVisible();
  await expect(page.locator('#poe-oauth-login')).toBeEnabled();
  await expect(page.locator('#username')).toHaveText('Guest');
}

async function signIn(page) {
  await page.locator('#poe-oauth-login').click();
  await expect(page.locator('#login-modal')).toBeHidden();
  await expect(page.locator('#username')).toHaveText(SMOKE_USER.username);
}

// Windows may hand the clipboard text back with CRLF line ends.
function toLf(text) {
  return String(text).replace(/\r\n/g, '\n');
}

function readClipboard(electronApp) {
  return electronApp.evaluate(({ clipboard }) => clipboard.readText());
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

test('settings smoke: launches desktop app and shows core settings controls', async ({}, testInfo) => {
  const backend = await startSmokeBackend();
  const isolatedProfile = createIsolatedProfile(testInfo, backend.baseUrl);
  const bootstrap = createBootstrapScript(testInfo);
  const readErrorLog = () => {
    try {
      return fs.readFileSync(path.join(isolatedProfile.userDataDir, 'logs', 'errors.jsonl'), 'utf8');
    } catch {
      return '';
    }
  };
  let electronApp;
  let testError = null;

  try {
    electronApp = await electron.launch({
      args: ['-r', bootstrap.bootstrapPath, path.join(__dirname, '..')],
      cwd: path.join(__dirname, '..'),
      env: isolatedProfile.env,
    });
    const page = await waitForAppWindow(electronApp, /Juice Journal/i);
    // The bug report buttons write the real clipboard, so main keeps the developer's one and puts it back in finally.
    await electronApp.evaluate(({ clipboard }) => {
      const image = clipboard.readImage();
      globalThis.__e2eSavedClipboard = {
        text: clipboard.readText(),
        html: clipboard.readHTML(),
        rtf: clipboard.readRTF(),
        ...(image.isEmpty() ? {} : { image })
      };
    });

    await waitForGuestReady(page);

    // A failed sign-in can be reported from the sign-in screen: the report takes the sign-in panel's place.
    await page.locator('#login-report-problem').click();
    await expect(page.locator('#login-bug-report-panel')).toBeVisible();
    await expect(page.locator('#poe-oauth-login')).toBeHidden();
    const loginPreview = page.locator('#login-bug-report-preview');
    await expect(loginPreview).toBeFocused();
    await expect(loginPreview).toContainText('Juice Journal bug report');
    await expect(loginPreview).toContainText('Signed in (local profile): no');
    await page.locator('#login-copy-bug-report').click();
    const loginReport = toLf(await loginPreview.textContent());
    await expect.poll(async () => toLf(await readClipboard(electronApp))).toBe(loginReport);
    await page.locator('#login-bug-report-back').click();
    await expect(page.locator('#poe-oauth-login')).toBeVisible();
    await expect(page.locator('#login-report-problem')).toBeFocused();

    await signIn(page);
    // Seeded right after sign-in: the renderer's console message is not ordered against later IPC calls.
    await electronApp.evaluate(({ app }) => console.error(new Error(`e2e main failure in ${app.getPath('userData')}`)));
    await page.evaluate(() => console.error('e2e renderer failure'));
    await expect.poll(readErrorLog).toContain('e2e renderer failure');
    await expect.poll(readErrorLog).toContain('e2e main failure in <userData>');

    await page.locator('.nav-btn[data-page="settings"]').click();
    await expect(page.locator('#settings-page')).toHaveClass(/active/);
    await expect(page.locator('#save-settings')).toBeVisible();
    await expect(page.locator('#reset-settings')).toBeVisible();

    await expect(page.locator('#global-language')).toBeVisible();
    await expect(page.locator('#api-url')).toHaveValue(backend.baseUrl);

    await page.locator('.settings-nav-btn[data-settings-tab="poe"]').click();
    await expect(page.locator('#settings-poe')).toHaveClass(/active/);
    await expect(page.locator('#poe-path')).toBeVisible();
    await expect(page.locator('#auto-start-session')).toBeVisible();

    // The field itself is the keycap; the old badge stays in the DOM but is not drawn twice.
    await page.locator('.settings-nav-btn[data-settings-tab="hotkeys"]').click();
    await expect(page.locator('#settings-hotkeys')).toHaveClass(/active/);
    await expect(page.locator('#scan-hotkey')).toHaveValue('F9');
    await expect(page.locator('#scan-hotkey-display')).toBeHidden();
    const hotkeyHints = page.locator('#settings-hotkeys .hotkey-hint');
    await expect(hotkeyHints).toHaveCount(2);
    await expect(hotkeyHints).toHaveText(['Click, then press the new keys', 'Click, then press the new keys']);

    await page.locator('.settings-nav-btn[data-settings-tab="api"]').click();
    await expect(page.locator('#settings-api')).toHaveClass(/active/);
    await expect(page.locator('#api-url')).toHaveValue(backend.baseUrl);
    await expect(page.locator('#test-connection')).toBeVisible();
    await expect(page.locator('#export-diagnostics')).toBeVisible();
    await expect(page.locator('#pending-sync-count')).toHaveCount(0);

    // Short groups sit two to a row at the default window size, so the server address and its status share a row.
    const apiUrlBox = await page.locator('#settings-api .settings-group:has(#api-url)').boundingBox();
    const statusBox = await page.locator('#settings-api .settings-group:has(.connection-status)').boundingBox();
    expect(Math.abs(statusBox.y - apiUrlBox.y)).toBeLessThanOrEqual(1);
    expect(statusBox.x).toBeGreaterThanOrEqual(apiUrlBox.x + apiUrlBox.width);

    // Online features start off: the server hears nothing, even from the Farming Hub and the diagnostics export.
    await expect(page.locator('#online-enabled')).not.toBeChecked();
    await expect(page.locator('#test-connection')).toBeDisabled();
    await expect(page.locator('#online-sign-in')).toBeDisabled();
    // Off by choice is not a failure: the status reads a grey 'Off', not 'Disconnected'.
    await expect(page.locator('#settings-api .connection-status')).toHaveClass(/is-off/);
    await expect(page.locator('#connection-text')).toHaveText('Off');
    const diagnosticsPath = path.join(isolatedProfile.rootDir, 'diagnostics.json');
    await electronApp.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, diagnosticsPath);
    await page.evaluate(() => window.electronAPI.exportDiagnostics('safe'));
    expect(JSON.parse(fs.readFileSync(diagnosticsPath, 'utf8')).api.status).toBe('disabled');
    // Leave the Online tab, so the Hub's off panel has to switch back to it.
    await page.locator('.settings-nav-btn[data-settings-tab="general"]').click();
    await expect(page.locator('#settings-general')).toHaveClass(/active/);
    await page.locator('.nav-btn[data-page="farming-hub"]').click();
    await expect(page.locator('#farming-hub-list')).toContainText('needs online features');
    await expect(page.locator('#farming-hub-page .farming-hub-filters')).toBeHidden();
    await expect(page.locator('#farming-hub-refresh-btn')).toBeDisabled();
    await expect(page.locator('#farming-hub-list')).toContainText('Farming Hub is off');
    await page.locator('#farming-hub-list [data-hub-action="open-online-settings"]').click();
    await expect(page.locator('#settings-page')).toHaveClass(/active/);
    await expect(page.locator('#settings-api')).toHaveClass(/active/);
    await expect(page.locator('.settings-nav-btn[data-settings-tab="api"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#online-enabled')).toBeFocused();

    // Settings > About builds the report on this PC: both seeded errors, and no names, addresses or paths.
    await page.locator('.settings-nav-btn[data-settings-tab="about"]').click();
    const aboutPreview = page.locator('#bug-report-preview');
    await expect(aboutPreview).toContainText('Juice Journal bug report');
    await expect(aboutPreview).toContainText('Signed in (local profile): yes');
    await expect(aboutPreview).toContainText('auditLogin');
    await expect(aboutPreview).toContainText('e2e main failure in <userData>');
    await expect(aboutPreview).toContainText('e2e renderer failure');
    await expect(aboutPreview).toContainText('custom server: yes');
    const aboutReport = toLf(await aboutPreview.textContent());
    for (const privateText of [
      SMOKE_USER.username,
      `${SMOKE_USER.id}-ggg`,
      backend.baseUrl,
      isolatedProfile.userDataDir,
      isolatedProfile.userDataDir.replace(/\\/g, '/'),
      os.homedir()
    ]) {
      expect(aboutReport).not.toContain(privateText);
    }
    await page.locator('#copy-bug-report').click();
    await expect.poll(async () => toLf(await readClipboard(electronApp))).toBe(aboutReport);
    // Cleared first, so the clipboard check below proves the issue button copied the report too.
    await electronApp.evaluate(({ clipboard }) => clipboard.clear());
    await page.locator('#open-bug-report-issue').click();
    await expect.poll(() => electronApp.evaluate(() => (globalThis.__e2eExternalUrls || []).length)).toBe(1);
    const [issueUrl] = await electronApp.evaluate(() => globalThis.__e2eExternalUrls);
    expect(issueUrl.startsWith(`${REPORT_ISSUE_URL}?`)).toBe(true);
    expect(issueUrl.length).toBeLessThanOrEqual(ISSUE_URL_MAX_LENGTH);
    const issueParams = new URL(issueUrl).searchParams;
    expect([...issueParams.keys()].sort()).toEqual(['environment', 'template', 'version']);
    expect(issueParams.get('template')).toBe('bug_report.yml');
    expect(toLf(await readClipboard(electronApp))).toBe(aboutReport);
    expect(backend.requests).toEqual([]);

    // The Save button would also send the smoke server's random port, which settings reject, so only the switch is set.
    await page.evaluate(() => window.electronAPI.setSettings({ onlineEnabled: true }));
    await page.reload();
    await expect(page.locator('#username')).toHaveText(SMOKE_USER.username);
    await expect(page.locator('#online-enabled')).toBeChecked();
    await expect(page.locator('#settings-api .connection-status')).not.toHaveClass(/is-off/);
    await expect(page.locator('#connection-text')).toHaveText('Disconnected');
    await expect(page.locator('#test-connection')).toBeEnabled();
    await expect(page.locator('#online-sign-in')).toBeEnabled();
    await page.locator('.nav-btn[data-page="farming-hub"]').click();
    await expect(page.locator('#farming-hub-page .farming-hub-filters')).toBeVisible();
    await expect(page.locator('#farming-hub-refresh-btn')).toBeEnabled();
    await expect.poll(() => backend.requests).toContain('GET /api/farming-hub/runs');
  } catch (error) {
    testError = error;
  } finally {
    const cleanupErrors = [];

    if (electronApp) {
      try {
        await electronApp.evaluate(({ clipboard }) => {
          const saved = globalThis.__e2eSavedClipboard;
          if (!saved) return;
          const data = Object.fromEntries(Object.entries(saved).filter(([, value]) => value));
          if (Object.keys(data).length) {
            clipboard.write(data);
          } else {
            clipboard.clear();
          }
        });
      } catch (error) {
        cleanupErrors.push(`Clipboard restore failed: ${error.message}`);
      }

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

    try {
      fs.rmSync(isolatedProfile.rootDir, { recursive: true, force: true });
    } catch (error) {
      cleanupErrors.push(`Isolated profile cleanup failed: ${error.message}`);
    }

    try {
      fs.rmSync(bootstrap.bootstrapDir, { recursive: true, force: true });
    } catch (error) {
      cleanupErrors.push(`Bootstrap cleanup failed: ${error.message}`);
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
