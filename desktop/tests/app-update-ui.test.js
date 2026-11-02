const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const desktopDir = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(desktopDir, 'src', 'index.html');
const appJsPath = path.join(desktopDir, 'src', 'app.js');

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}`;
  const asyncSignature = `async ${signature}`;
  const asyncStartIndex = source.indexOf(asyncSignature);
  const plainStartIndex = source.indexOf(signature);
  const startIndex = asyncStartIndex !== -1 ? asyncStartIndex : plainStartIndex;

  if (startIndex === -1) {
    assert.fail(`Expected ${path.basename(appJsPath)} to define ${functionName}()`);
  }

  let bodyStartIndex = -1;
  let parenDepth = 0;
  let seenParamList = false;
  const searchStartIndex = startIndex + (asyncStartIndex !== -1 ? asyncSignature.length : signature.length);

  for (let index = searchStartIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') {
      parenDepth += 1;
      continue;
    }
    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        seenParamList = true;
      }
      continue;
    }
    if (seenParamList && char === '{') {
      bodyStartIndex = index;
      break;
    }
  }

  if (bodyStartIndex === -1) {
    assert.fail(`Unable to locate ${functionName}() body in ${path.basename(appJsPath)}`);
  }

  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = bodyStartIndex; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (inSingleQuote) {
      if (!escaped && char === '\'') inSingleQuote = false;
      escaped = !escaped && char === '\\';
      continue;
    }
    if (inDoubleQuote) {
      if (!escaped && char === '"') inDoubleQuote = false;
      escaped = !escaped && char === '\\';
      continue;
    }
    if (inTemplateString) {
      if (!escaped && char === '`') inTemplateString = false;
      escaped = !escaped && char === '\\';
      continue;
    }
    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (char === '\'') {
      inSingleQuote = true;
      escaped = false;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      escaped = false;
      continue;
    }
    if (char === '`') {
      inTemplateString = true;
      escaped = false;
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  assert.fail(`Unable to parse ${functionName}() from ${path.basename(appJsPath)}`);
}

function loadFunctions(functionNames, contextOverrides = {}) {
  const source = fs.readFileSync(appJsPath, 'utf8');
  const context = vm.createContext({
    console,
    ...contextOverrides
  });

  for (const functionName of functionNames) {
    const functionSource = extractFunctionSource(source, functionName);
    vm.runInContext(`${functionSource};\nthis.${functionName} = ${functionName};`, context);
  }

  return context;
}

test('settings html includes desktop update status controls', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="app-version-value"/);
  assert.match(html, /id="app-update-status"/);
  assert.match(html, /id="app-update-detail"/);
  assert.match(html, /id="check-updates-btn"/);
  assert.match(html, /id="open-update-page-btn"/);
  assert.doesNotMatch(html, /install-update-btn/);
});

test('renderer about tab offers the download page only when an update is available', () => {
  // Labels sit in a .btn-label span next to the icon, so writes must not touch the button's own text.
  const buttonWithLabel = (extra) => {
    const label = { textContent: '' };
    return { ...extra, label, querySelector: (selector) => (selector === '.btn-label' ? label : null) };
  };
  const context = loadFunctions(['setButtonLabel', 'renderAppUpdateState'], {
    elements: {
      appVersionValue: { textContent: '' },
      appUpdateStatus: { textContent: '' },
      appUpdateDetail: { textContent: '' },
      checkUpdatesBtn: buttonWithLabel({ disabled: false }),
      openUpdatePageBtn: buttonWithLabel({ hidden: true, disabled: true })
    },
    state: {
      appUpdate: {
        enabled: true,
        supported: true,
        checking: false,
        available: true,
        currentVersion: '1.0.0',
        nextVersion: '1.1.0',
        error: null
      }
    },
    window: {
      t: (key, values) => {
        if (key === 'settings.updateAvailable') return `Update available: ${values.version}`;
        return key;
      }
    }
  });

  context.renderAppUpdateState();

  assert.equal(context.elements.appVersionValue.textContent, '1.0.0');
  assert.equal(context.elements.appUpdateStatus.textContent, 'Update available: 1.1.0');
  assert.equal(context.elements.openUpdatePageBtn.hidden, false);
  assert.equal(context.elements.openUpdatePageBtn.disabled, false);
  assert.equal(context.elements.checkUpdatesBtn.disabled, false);
  assert.equal(context.elements.checkUpdatesBtn.label.textContent, 'settings.checkForUpdates');
  assert.equal(context.elements.openUpdatePageBtn.label.textContent, 'settings.openUpdatePage');
  assert.equal(context.elements.checkUpdatesBtn.textContent, undefined);

  context.state.appUpdate = { ...context.state.appUpdate, available: false, nextVersion: null };
  context.renderAppUpdateState();
  assert.equal(context.elements.appUpdateStatus.textContent, 'settings.updateUpToDate');
  assert.equal(context.elements.openUpdatePageBtn.hidden, true);
  assert.equal(context.elements.openUpdatePageBtn.disabled, true);
});

test('a failed update check shows in the About status line and is read out, without a toast', async () => {
  const toasts = [];
  const announced = [];
  const state = { appUpdate: { enabled: true, currentVersion: '1.0.0' } };
  const context = loadFunctions(['handleCheckForAppUpdate'], {
    state,
    elements: { appUpdateStatus: { textContent: 'settings.updateUpToDate' } },
    window: {
      t: (key) => key,
      electronAPI: {
        checkForAppUpdate: async () => {
          throw new Error("Error invoking remote method 'check-for-app-update': Error: net::ERR_INTERNET_DISCONNECTED");
        }
      }
    },
    renderAppUpdateState: () => assert.fail('a failed check keeps the last state'),
    announceStatus: (text) => announced.push(text),
    showToast: (...args) => toasts.push(args)
  });

  await context.handleCheckForAppUpdate();

  assert.equal(context.elements.appUpdateStatus.textContent, 'settings.updateError');
  assert.deepEqual(announced, ['settings.updateError']);
  assert.deepEqual(toasts, []);
  assert.equal(state.appUpdate.currentVersion, '1.0.0');
});

test('a new version found before the listener exists still raises its toast, and only one', () => {
  const toasts = [];
  const context = loadFunctions(['applyAppUpdateState'], {
    state: { appUpdate: null },
    window: { t: (key) => key },
    renderAppUpdateState: () => {},
    handleOpenAppUpdatePage: async () => {},
    showToast: (...args) => toasts.push(args)
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

  // The launch check can answer while the window still loads, so startup reads the state through the same path.
  assert.match(source, /applyAppUpdateState\(await window\.electronAPI\.getAppUpdateState\(\)\)/);
  context.applyAppUpdateState({ enabled: true, available: true, nextVersion: '1.1.0' });
  context.applyAppUpdateState({ enabled: true, available: true, nextVersion: '1.1.0' });

  assert.equal(toasts.length, 1);
});

test('a language change redraws the update status line', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const chrome = source.slice(source.indexOf('function applyLocalizedChrome()'), source.indexOf('function applyLocalizedChrome()') + 1200);
  assert.match(chrome, /renderAppUpdateState\(\)/);
});

test('a download page that will not open says which step failed, with the try-again hint instead of raw text', async () => {
  const toasts = [];
  const context = loadFunctions(['handleOpenAppUpdatePage'], {
    window: {
      t: (key) => key,
      electronAPI: {
        openAppUpdatePage: async () => {
          throw new Error('EPERM: operation not permitted, C:\\Users\\someone\\AppData\\Local\\Temp');
        }
      }
    },
    getUserFacingErrorMessage: (error, fallbackKey) => fallbackKey,
    showToast: (...args) => toasts.push(args)
  });

  await context.handleOpenAppUpdatePage();

  assert.deepEqual(toasts, [['toast.updatePageFailed', 'toast.tryAgain', 'error']]);
});
