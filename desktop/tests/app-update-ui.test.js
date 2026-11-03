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
  assert.match(html, /id="app-update-action-btn"/);
  assert.match(html, /id="open-update-page-btn"/);
  assert.doesNotMatch(html, /install-update-btn/);
});

test('renderer about tab offers the download and its page only when an update is available', () => {
  // Labels sit in a .btn-label span next to the icon, so writes must not touch the button's own text.
  const buttonWithLabel = (extra) => {
    const label = { textContent: '' };
    return { ...extra, label, querySelector: (selector) => (selector === '.btn-label' ? label : null) };
  };
  const context = loadFunctions(['setButtonLabel', 'getAppUpdateErrorText', 'getAppUpdateActionLabel', 'renderAppUpdateState'], {
    elements: {
      appVersionValue: { textContent: '' },
      appUpdateStatus: { textContent: '' },
      appUpdateDetail: { textContent: '' },
      checkUpdatesBtn: buttonWithLabel({ disabled: false }),
      appUpdateActionBtn: buttonWithLabel({ hidden: true, disabled: true }),
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
  assert.equal(context.elements.appUpdateActionBtn.hidden, false);
  assert.equal(context.elements.appUpdateActionBtn.disabled, false);
  assert.equal(context.elements.appUpdateActionBtn.label.textContent, 'settings.downloadUpdate');
  assert.equal(context.elements.openUpdatePageBtn.hidden, false);
  assert.equal(context.elements.openUpdatePageBtn.disabled, false);
  assert.equal(context.elements.checkUpdatesBtn.disabled, false);
  assert.equal(context.elements.checkUpdatesBtn.label.textContent, 'settings.checkForUpdates');
  assert.equal(context.elements.openUpdatePageBtn.label.textContent, 'settings.openUpdatePage');
  assert.equal(context.elements.checkUpdatesBtn.textContent, undefined);

  context.state.appUpdate = { ...context.state.appUpdate, available: false, nextVersion: null };
  context.renderAppUpdateState();
  assert.equal(context.elements.appUpdateStatus.textContent, 'settings.updateUpToDate');
  assert.equal(context.elements.appUpdateActionBtn.hidden, true);
  assert.equal(context.elements.appUpdateActionBtn.disabled, true);
  assert.equal(context.elements.openUpdatePageBtn.hidden, true);
  assert.equal(context.elements.openUpdatePageBtn.disabled, true);
});

const UPDATE_RENDER_CASES = [
  {
    name: 'downloading',
    update: { available: true, downloading: true, downloadPercent: 42 },
    status: 'settings.updateAvailable',
    label: 'settings.updateDownloading',
    action: { hidden: false, disabled: true },
    page: { hidden: false },
    checkDisabled: true
  },
  {
    name: 'verifying',
    update: { available: true, verifying: true },
    status: 'settings.updateAvailable',
    label: 'settings.updateVerifying',
    action: { hidden: false, disabled: true },
    page: { hidden: false },
    checkDisabled: true
  },
  {
    name: 'ready',
    update: { available: true, readyToInstall: true },
    status: 'settings.updateReady',
    label: 'settings.installUpdate',
    action: { hidden: false, disabled: false },
    page: { hidden: true },
    checkDisabled: false
  },
  {
    name: 'installing',
    update: { available: true, readyToInstall: true, installing: true },
    status: 'settings.updateReady',
    label: 'settings.updateInstalling',
    action: { hidden: false, disabled: true },
    page: { hidden: true },
    checkDisabled: true
  },
  {
    name: 'checking while an update is offered',
    update: { available: true, checking: true },
    status: 'settings.checkingForUpdates',
    label: 'settings.downloadUpdate',
    action: { hidden: false, disabled: true },
    page: { hidden: false },
    checkDisabled: true
  },
  {
    name: 'signature failure',
    update: { available: true, error: 'bad', errorKind: 'signature' },
    status: 'settings.updateSignatureFailed',
    detail: '',
    label: 'settings.downloadUpdate',
    action: { hidden: true, disabled: true },
    page: { hidden: true },
    checkDisabled: false
  },
  {
    name: 'download failure',
    update: { available: true, error: 'network down', errorKind: 'download' },
    status: 'settings.updateDownloadFailed',
    detail: 'network down',
    label: 'settings.downloadUpdate',
    action: { hidden: false, disabled: false },
    page: { hidden: false },
    checkDisabled: false
  },
  {
    name: 'a failed install after restart',
    update: { available: true, installFailedVersion: '1.1.0' },
    status: 'settings.updateAvailable',
    detail: 'settings.updateInstallFailed',
    label: 'settings.downloadUpdate',
    action: { hidden: false, disabled: false },
    page: { hidden: false },
    checkDisabled: false
  }
];

for (const expected of UPDATE_RENDER_CASES) {
  test(`renderer about tab while ${expected.name}`, () => {
    const buttonWithLabel = () => {
      const label = { textContent: '' };
      return { hidden: true, disabled: true, label, querySelector: () => label };
    };
    const context = loadFunctions(['setButtonLabel', 'getAppUpdateErrorText', 'getAppUpdateActionLabel', 'renderAppUpdateState'], {
      elements: {
        appVersionValue: { textContent: '' },
        appUpdateStatus: { textContent: '' },
        appUpdateDetail: { textContent: '' },
        checkUpdatesBtn: buttonWithLabel(),
        appUpdateActionBtn: buttonWithLabel(),
        openUpdatePageBtn: buttonWithLabel()
      },
      state: { appUpdate: { enabled: true, currentVersion: '1.0.0', nextVersion: '1.1.0', ...expected.update } },
      window: { t: (key) => key }
    });

    context.renderAppUpdateState();

    const { appUpdateStatus, appUpdateDetail, appUpdateActionBtn, openUpdatePageBtn, checkUpdatesBtn } = context.elements;
    assert.equal(appUpdateStatus.textContent, expected.status);
    if (expected.detail !== undefined) {
      assert.equal(appUpdateDetail.textContent, expected.detail);
    }
    assert.equal(appUpdateActionBtn.label.textContent, expected.label);
    assert.equal(appUpdateActionBtn.hidden, expected.action.hidden);
    assert.equal(appUpdateActionBtn.disabled, expected.action.disabled);
    assert.equal(openUpdatePageBtn.hidden, expected.page.hidden);
    assert.equal(openUpdatePageBtn.disabled, expected.page.hidden);
    assert.equal(checkUpdatesBtn.disabled, expected.checkDisabled);
  });
}

test('the action button installs only when the update is ready', () => {
  const calls = [];
  const context = loadFunctions(['handleAppUpdateAction'], {
    state: { appUpdate: { available: true, readyToInstall: false } },
    handleDownloadAppUpdate: () => calls.push('download'),
    handleInstallAppUpdate: () => calls.push('install')
  });

  context.handleAppUpdateAction();
  context.state.appUpdate = { available: true, readyToInstall: true };
  context.handleAppUpdateAction();

  assert.deepEqual(calls, ['download', 'install']);
});

test('the ready toast offers the install', () => {
  const toasts = [];
  const handleInstallAppUpdate = async () => {};
  const context = loadFunctions(['applyAppUpdateState', 'showAppUpdateToast'], {
    state: { appUpdate: { available: true, nextVersion: '1.1.0' } },
    window: { t: (key) => key },
    renderAppUpdateState: () => {},
    handleInstallAppUpdate,
    showToast: (...args) => toasts.push(args)
  });

  context.applyAppUpdateState({ available: true, nextVersion: '1.1.0', readyToInstall: true });

  assert.equal(toasts.length, 1);
  assert.equal(toasts[0][3].action.label, 'settings.installUpdate');
  assert.equal(toasts[0][3].action.onSelect, handleInstallAppUpdate);
});

test('the install button and toast reach the main process', async () => {
  const calls = [];
  const context = loadFunctions(['handleInstallAppUpdate'], {
    window: {
      t: (key) => key,
      electronAPI: { installAppUpdate: async () => calls.push('install') }
    }
  });

  await context.handleInstallAppUpdate();

  assert.deepEqual(calls, ['install']);
});

for (const [name, appUpdate] of [
  ['no update is offered', { available: false }],
  ['the update is already verified', { available: true, readyToInstall: true }],
  ['a download is running', { available: true, downloading: true }],
  ['an install has begun', { available: true, readyToInstall: true, installing: true }]
]) {
  test(`a leftover download toast claims nothing when ${name}`, async () => {
    const toasts = [];
    const calls = [];
    const context = loadFunctions(['handleDownloadAppUpdate'], {
      state: { appUpdate },
      window: {
        t: (key) => key,
        electronAPI: { downloadAppUpdate: async () => calls.push('download') }
      },
      showAppUpdateToast: (...args) => toasts.push(args)
    });

    await context.handleDownloadAppUpdate();

    assert.deepEqual(toasts, []);
    assert.deepEqual(calls, []);
  });
}

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
  const context = loadFunctions(['applyAppUpdateState', 'showAppUpdateToast'], {
    state: { appUpdate: null },
    window: { t: (key) => key },
    renderAppUpdateState: () => {},
    handleDownloadAppUpdate: async () => {},
    showToast: (...args) => toasts.push(args)
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

  // The launch check can answer while the window still loads, so startup reads the state through the same path.
  assert.match(source, /applyAppUpdateState\(await window\.electronAPI\.getAppUpdateState\(\)\)/);
  context.applyAppUpdateState({ enabled: true, available: true, nextVersion: '1.1.0' });
  context.applyAppUpdateState({ enabled: true, available: true, nextVersion: '1.1.0' });

  assert.equal(toasts.length, 1);
});

test('each update step replaces the toast before it, so no stale button stays on screen', () => {
  const shown = [];
  const dismissed = [];
  const context = loadFunctions(['getAppUpdateErrorText', 'applyAppUpdateState', 'showAppUpdateToast'], {
    state: { appUpdate: null },
    window: { t: (key) => key },
    renderAppUpdateState: () => {},
    handleDownloadAppUpdate: async () => {},
    handleInstallAppUpdate: async () => {},
    dismissToast: (toast) => dismissed.push(toast),
    showToast: (title) => {
      shown.push(title);
      return title;
    }
  });
  const available = { enabled: true, available: true, nextVersion: '1.1.0' };

  context.applyAppUpdateState(available);
  context.applyAppUpdateState({ ...available, readyToInstall: true });
  context.applyAppUpdateState({ ...available, error: 'bad signature', errorKind: 'signature' });

  assert.deepEqual(shown, ['toast.updateAvailableTitle', 'toast.updateReadyTitle', 'settings.updateSignatureFailed']);
  assert.deepEqual(dismissed, ['toast.updateAvailableTitle', 'toast.updateReadyTitle']);
});

const READY_UPDATE = { available: true, nextVersion: '1.1.0', readyToInstall: true };
for (const [name, previous, next, expectedShown] of [
  ['a newer version replaces the ready toast', READY_UPDATE, { available: true, nextVersion: '1.2.0' }, ['toast.updateAvailableTitle']],
  ['a withdrawn release removes the ready toast', READY_UPDATE, { available: false, nextVersion: null }, []],
  ['a withdrawn release removes the download toast', { available: true, nextVersion: '1.1.0' }, { available: false, nextVersion: null }, []]
]) {
  test(`${name}`, () => {
    const shown = [];
    const dismissed = [];
    const context = loadFunctions(['applyAppUpdateState', 'showAppUpdateToast'], {
      state: { appUpdate: previous, appUpdateToast: 'ready toast' },
      window: { t: (key) => key },
      renderAppUpdateState: () => {},
      handleDownloadAppUpdate: async () => {},
      dismissToast: (toast) => dismissed.push(toast),
      showToast: (title) => {
        shown.push(title);
        return title;
      }
    });

    context.applyAppUpdateState(next);

    assert.deepEqual(dismissed, ['ready toast']);
    assert.deepEqual(shown, expectedShown);
  });
}

test('a failed install after a restart raises one toast that opens the download page', () => {
  const toasts = [];
  const handleOpenAppUpdatePage = async () => {};
  const context = loadFunctions(['applyAppUpdateState', 'showAppUpdateToast'], {
    state: { appUpdate: null },
    window: { t: (key) => key },
    renderAppUpdateState: () => {},
    handleOpenAppUpdatePage,
    showToast: (...args) => toasts.push(args)
  });
  const update = { enabled: true, available: false, installFailedVersion: '1.1.0' };

  context.applyAppUpdateState(update);
  context.applyAppUpdateState({ ...update, checking: true });
  // The launch check finds the version that failed, as it normally will.
  context.applyAppUpdateState({ ...update, available: true, nextVersion: '1.1.0' });

  assert.equal(toasts.length, 1);
  assert.equal(toasts[0][0], 'toast.updateInstallFailedTitle');
  assert.equal(toasts[0][3].action.onSelect, handleOpenAppUpdatePage);
});

test('a failed launch check raises no toast', () => {
  const toasts = [];
  const context = loadFunctions(['getAppUpdateErrorText', 'applyAppUpdateState', 'showAppUpdateToast'], {
    state: { appUpdate: null },
    window: { t: (key) => key },
    renderAppUpdateState: () => {},
    showToast: (...args) => toasts.push(args)
  });

  context.applyAppUpdateState({ enabled: true, available: false, error: 'offline', errorKind: 'check' });

  assert.deepEqual(toasts, []);
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
