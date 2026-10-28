const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.join(__dirname, '..');
const mainJs = fs.readFileSync(path.join(desktopRoot, 'main.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(desktopRoot, 'src', 'index.html'), 'utf8');
const overlayHtml = fs.readFileSync(path.join(desktopRoot, 'src', 'overlay.html'), 'utf8');

function getFunctionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should be defined`);

  const bodyStart = source.indexOf('{', start);
  assert.notEqual(bodyStart, -1, `${functionName} should have a body`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    }
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart, index + 1);
      }
    }
  }

  assert.fail(`Unable to parse ${functionName}`);
}

test('main and overlay BrowserWindows keep the renderer isolated and hardened', () => {
  for (const functionName of ['createMainWindow', 'createOverlayWindow']) {
    const body = getFunctionBody(mainJs, functionName);

    assert.match(body, /contextIsolation:\s*true/);
    assert.match(body, /nodeIntegration:\s*false/);
    assert.match(body, /sandbox:\s*true/);
    assert.match(body, /webSecurity:\s*true/);
    assert.match(body, /allowRunningInsecureContent:\s*false/);
  }
});

test('desktop BrowserWindows block untrusted navigation and new windows', () => {
  const hardenBody = getFunctionBody(mainJs, 'hardenWindowNavigation');

  assert.match(hardenBody, /webContents\.on\('will-navigate'/);
  assert.match(hardenBody, /event\.preventDefault\(\)/);
  assert.match(hardenBody, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);

  assert.match(getFunctionBody(mainJs, 'createMainWindow'), /hardenWindowNavigation\(mainWindow,\s*TRUSTED_RENDERER_FILES\.main\)/);
  assert.match(getFunctionBody(mainJs, 'createOverlayWindow'), /hardenWindowNavigation\(overlayWindow,\s*TRUSTED_RENDERER_FILES\.overlay\)/);
});

test('ipc handlers validate sender windows before running privileged channels', () => {
  const setupBody = getFunctionBody(mainJs, 'setupIPC');
  const installBody = getFunctionBody(mainJs, 'installValidatedIpcHandle');
  const assertBody = getFunctionBody(mainJs, 'assertTrustedIpcSender');
  const trustBody = getFunctionBody(mainJs, 'isTrustedRenderer');

  assert.match(setupBody, /installValidatedIpcHandle\(\)/);
  assert.match(installBody, /createValidatedIpcHandler\(channel,\s*getAllowedIpcRendererKinds\(channel\),\s*handler\)/);
  assert.match(assertBody, /Unauthorized IPC sender/);
  assert.match(trustBody, /sender !== windowRef\.webContents/);
  assert.match(trustBody, /frame !== sender\.mainFrame/);
  assert.match(mainJs, /'confirm-start-map-prompt-overlay': \['overlay'\]/);
  assert.match(mainJs, /'toggle-map-result-overlay-pin': \['main', 'overlay'\]/);
});

test('auth browser fallback keeps the URL out of the PowerShell command text', () => {
  const body = getFunctionBody(mainJs, 'openUrlWithWindowsFallback');
  const argList = body.match(/'powershell',\s*\[([\s\S]*?)\],/);

  assert.match(body, /execFile\(\s*[\r\n\s]*'powershell'/);
  assert.ok(argList, 'PowerShell should get an argument array');
  assert.doesNotMatch(argList[1], /authUrl/);
  assert.match(argList[1], /'Start-Process -FilePath \$env:JJ_OPEN_URL'/);
  assert.match(body, /JJ_OPEN_URL:\s*authUrl/);
  assert.match(body, /windowsHide:\s*true/);
  assert.doesNotMatch(body, /shell:\s*true/);
  assert.doesNotMatch(body, /cmd['"][\s\S]*\/c[\s\S]*start/i);
});

test('desktop HTML entrypoints keep a restrictive content security policy', () => {
  for (const html of [indexHtml, overlayHtml]) {
    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /default-src 'self'/);
    assert.match(html, /script-src 'self'/);
    assert.match(html, /object-src 'none'/);
    assert.match(html, /base-uri 'self'/);
    assert.match(html, /frame-ancestors 'none'/);
  }
});

test('desktop fonts are bundled locally instead of fetched from Google Fonts', () => {
  const stylesCss = fs.readFileSync(path.join(desktopRoot, 'src', 'styles.css'), 'utf8');
  const fontsCss = fs.readFileSync(path.join(desktopRoot, 'src', 'assets', 'fonts', 'fonts.css'), 'utf8');

  for (const source of [indexHtml, stylesCss]) {
    assert.doesNotMatch(source, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  }
  assert.match(stylesCss, /@import url\('assets\/fonts\/fonts\.css'\);/);

  for (const match of fontsCss.matchAll(/url\('([^']+)'\)/g)) {
    assert.ok(
      fs.existsSync(path.join(desktopRoot, 'src', 'assets', 'fonts', match[1])),
      `Expected bundled font file ${match[1]}`
    );
  }
  for (const family of ['Cinzel', 'SourceSans3']) {
    assert.ok(fs.existsSync(path.join(desktopRoot, 'src', 'assets', 'fonts', `OFL-${family}.txt`)), `Expected OFL licence for ${family}`);
  }
});

test('desktop renderer avoids raw HTML for toast and currency table rows', () => {
  const appJs = fs.readFileSync(path.join(desktopRoot, 'src', 'app.js'), 'utf8');
  const toastBody = getFunctionBody(appJs, 'showToast');
  const currencyBody = getFunctionBody(appJs, 'renderCurrencyTable');

  assert.doesNotMatch(toastBody, /\.(?:innerHTML|outerHTML)\s*\+?=|\.insertAdjacentHTML\(/);
  assert.match(toastBody, /\.textContent\s*=/);
  assert.doesNotMatch(currencyBody, /tbody\.innerHTML\s*=\s*sorted\.map/);
  assert.match(currencyBody, /document\.createDocumentFragment\(\)/);
  assert.match(currencyBody, /normalizeSafeImageSrc\(item\.iconUrl\)/);
  assert.match(currencyBody, /tbody\.replaceChildren\(fragment\)/);
});

test('main records crashes with the monitor only', () => {
  assert.match(mainJs, /process\.on\('uncaughtExceptionMonitor'/);
  assert.doesNotMatch(mainJs, /process\.(?:on|once|prependListener)\(\s*['"](?:uncaughtException|unhandledRejection)['"]/);
});

test('both windows record renderer errors after navigation hardening', () => {
  assert.match(
    getFunctionBody(mainJs, 'createMainWindow'),
    /hardenWindowNavigation\(mainWindow, TRUSTED_RENDERER_FILES\.main\);[\s\S]*attachRendererErrorCapture\(mainWindow, 'renderer'\)/
  );
  assert.match(
    getFunctionBody(mainJs, 'createOverlayWindow'),
    /hardenWindowNavigation\(overlayWindow, TRUSTED_RENDERER_FILES\.overlay\);[\s\S]*attachRendererErrorCapture\(overlayWindow, 'overlay'\)/
  );
});

test('the bug report stays local and opens only the GitHub issue form', () => {
  for (const functionName of ['collectBugReportInput', 'getBugReport']) {
    assert.doesNotMatch(
      getFunctionBody(mainJs, functionName),
      /buildDiagnosticsPayload|buildSensitiveSettingsSnapshot|healthCheck|apiClient|getJournalStore|readJournal|assertDesktopUserAuthenticated/
    );
  }

  const openBody = getFunctionBody(mainJs, 'openBugReportIssue');
  assert.match(openBody, /startsWith\(`\$\{bugReportModel\.REPORT_ISSUE_URL\}\?`\)/);
  assert.match(openBody, /ISSUE_URL_MAX_LENGTH/);
  assert.doesNotMatch(getFunctionBody(mainJs, 'isAllowedExternalAuthUrl'), /github/i);
  assert.doesNotMatch(indexHtml, /connect-src[^;]*github/i);
});

test('the bug report preview is written as text', () => {
  const appJs = fs.readFileSync(path.join(desktopRoot, 'src', 'app.js'), 'utf8');
  const body = getFunctionBody(appJs, 'loadBugReportPreview');

  assert.doesNotMatch(body, /innerHTML/);
  assert.match(body, /\.textContent\s*=/);
});

test('Settings > Data acts locally: no renderer input, main window only, opens only the data folder', () => {
  const preloadJs = fs.readFileSync(path.join(desktopRoot, 'preload.js'), 'utf8');
  const setupBody = getFunctionBody(mainJs, 'setupIPC');
  const scopesStart = mainJs.indexOf('const IPC_RENDERER_SCOPES');

  for (const line of [
    "ipcMain.handle('get-local-data-summary', () => getLocalDataSummary());",
    "ipcMain.handle('open-data-folder', () => openDataFolder());",
    "ipcMain.handle('clear-logs', () => clearLogs());"
  ]) {
    assert.ok(setupBody.includes(line), `setupIPC should register ${line}`);
  }
  // Left out of the scopes, so only the main window may call them.
  assert.notEqual(scopesStart, -1);
  assert.doesNotMatch(mainJs.slice(scopesStart, mainJs.indexOf('});', scopesStart)), /local-data|data-folder|clear-logs/);
  for (const line of [
    "getLocalDataSummary: () => ipcRenderer.invoke('get-local-data-summary'),",
    "openDataFolder: () => ipcRenderer.invoke('open-data-folder'),",
    "clearLogs: () => ipcRenderer.invoke('clear-logs'),"
  ]) {
    assert.ok(preloadJs.includes(line), `preload should expose ${line}`);
  }

  const openBody = getFunctionBody(mainJs, 'openDataFolder');
  assert.ok(openBody.includes("shell.openPath(app.getPath('userData'))"));
  assert.doesNotMatch(openBody, /openExternal|execFile|spawn|powershell/i);

  for (const functionName of ['getPathSize', 'getLocalDataSummary', 'openDataFolder', 'clearErrorLog', 'clearLogs']) {
    assert.doesNotMatch(
      getFunctionBody(mainJs, functionName),
      /apiClient|axios|http|fetch\(|healthCheck|buildDiagnosticsPayload/,
      `${functionName} must stay local`
    );
  }

  const clearBody = getFunctionBody(mainJs, 'clearLogs');
  for (const part of ['dialog.showMessageBox(mainWindow, {', 'defaultId: 1,', 'cancelId: 1,', 'noLink: true,']) {
    assert.ok(clearBody.includes(part), `clearLogs should contain ${part}`);
  }
  assert.ok(!clearBody.includes('appendAuditTrail'));
  // Flags, sizes and step names only: fs and shell error texts name the full path, a log line would carry it into the
  // error log, and during a clear it would undo the clear.
  for (const functionName of ['getPathSize', 'getLocalDataSummary', 'openDataFolder', 'clearErrorLog', 'clearLogs']) {
    const body = getFunctionBody(mainJs, functionName);
    assert.ok(!body.includes('.message'), `${functionName} must not pass on error text`);
    assert.ok(!body.includes('console.'), `${functionName} must not log`);
  }
});

test('the Data tab writes the path and the size as text', () => {
  const appJs = fs.readFileSync(path.join(desktopRoot, 'src', 'app.js'), 'utf8');
  const summaryBody = getFunctionBody(appJs, 'loadDataSummary');

  assert.doesNotMatch(summaryBody, /innerHTML/);
  assert.match(summaryBody, /\.textContent\s*=/);
  // Toasts use static keys only: an error text could name the folder, and a toast can end up in a public issue.
  for (const functionName of ['handleClearLogs', 'handleOpenDataFolder']) {
    const body = getFunctionBody(appJs, functionName);
    assert.doesNotMatch(body, /innerHTML/, functionName);
    assert.ok(!body.includes('.message'), `${functionName} must not show error text`);
    assert.ok(!body.includes('getUserFacingErrorMessage'), `${functionName} must not show error text`);
  }
});
