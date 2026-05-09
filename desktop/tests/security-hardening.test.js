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

test('auth browser fallback avoids shell command composition', () => {
  const body = getFunctionBody(mainJs, 'openUrlWithWindowsFallback');

  assert.match(body, /execFile\(\s*[\r\n\s]*'powershell'/);
  assert.match(body, /Start-Process -FilePath \$args\[0\]/);
  assert.match(body, /windowsHide:\s*true/);
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

test('desktop renderer avoids raw HTML for toast and currency table rows', () => {
  const appJs = fs.readFileSync(path.join(desktopRoot, 'src', 'app.js'), 'utf8');
  const toastBody = getFunctionBody(appJs, 'showToast');
  const currencyBody = getFunctionBody(appJs, 'renderCurrencyTable');

  assert.doesNotMatch(toastBody, /\.innerHTML\s*=/);
  assert.match(toastBody, /\.textContent\s*=/);
  assert.doesNotMatch(currencyBody, /tbody\.innerHTML\s*=\s*sorted\.map/);
  assert.match(currencyBody, /document\.createDocumentFragment\(\)/);
  assert.match(currencyBody, /normalizeSafeImageSrc\(item\.iconUrl\)/);
  assert.match(currencyBody, /tbody\.replaceChildren\(fragment\)/);
});
