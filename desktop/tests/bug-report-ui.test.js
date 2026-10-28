const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const desktopDir = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(desktopDir, 'src', 'index.html');
const appJsPath = path.join(desktopDir, 'src', 'app.js');
const stylesCssPath = path.join(desktopDir, 'src', 'styles.css');
const tokensCssPath = path.join(desktopDir, 'src', 'tokens.css');

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
      if (char === '\n') {
        inLineComment = false;
      }
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
      if (!escaped && char === '\'') {
        inSingleQuote = false;
      }
      escaped = !escaped && char === '\\';
      continue;
    }

    if (inDoubleQuote) {
      if (!escaped && char === '"') {
        inDoubleQuote = false;
      }
      escaped = !escaped && char === '\\';
      continue;
    }

    if (inTemplateString) {
      if (!escaped && char === '`') {
        inTemplateString = false;
      }
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

// A button whose text sits in a .btn-label span, or in the button itself when withLabelSpan is false.
function createButtonStub(labelKey, { text = labelKey, withLabelSpan = true } = {}) {
  const attributes = labelKey && !withLabelSpan ? { 'data-i18n': labelKey } : {};
  const button = {
    disabled: false,
    dataset: {},
    textContent: withLabelSpan ? '' : text,
    getAttribute: (name) => attributes[name] ?? null,
    setAttribute: (name, value) => {
      attributes[name] = String(value);
    },
    removeAttribute: (name) => {
      delete attributes[name];
    },
    querySelector: (selector) => (selector === '.btn-label' ? button.label : null)
  };
  button.label = withLabelSpan
    ? { textContent: text, getAttribute: (name) => (name === 'data-i18n' ? labelKey : null) }
    : null;
  return button;
}

function createClassList(...classNames) {
  const classes = new Set(classNames);
  return {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
    toggle: (name, force = !classes.has(name)) => (force ? classes.add(name) : classes.delete(name)),
    contains: (name) => classes.has(name)
  };
}

// The report is text only: touching innerHTML fails the test.
function createPreviewStub() {
  const attributes = {};
  return {
    textContent: '',
    getAttribute: (name) => attributes[name] ?? null,
    setAttribute: (name, value) => {
      attributes[name] = String(value);
    },
    removeAttribute: (name) => {
      delete attributes[name];
    },
    get innerHTML() {
      throw new Error('the preview is read as text only');
    },
    set innerHTML(value) {
      throw new Error('the preview is written as text only');
    }
  };
}

function createView() {
  return {
    preview: createPreviewStub(),
    // The markup text differs from t(key), so a restored label proves it was translated again.
    openButton: createButtonStub('settings.openBugReportIssue', { text: 'Copy and open GitHub issue' }),
    copyButton: createButtonStub('settings.copyBugReport', { text: 'Copy report', withLabelSpan: false }),
    reportId: null
  };
}

function loadReportHandlers(views, electronAPI) {
  const toasts = [];
  const context = loadFunctions(['setButtonBusy', 'loadBugReportPreview', 'handleCopyBugReport', 'handleOpenBugReportIssue'], {
    bugReportViews: views,
    showToast: (...args) => toasts.push(args),
    getUserFacingErrorMessage: (error, fallbackKey) => fallbackKey,
    window: {
      t: (key, values) => (values?.url ? `${key} ${values.url}` : key),
      electronAPI
    }
  });
  return { context, toasts };
}

// The markup from the tag that opens at start to its matching closing tag.
function markupAt(source, start) {
  assert.notEqual(start, -1);
  const tag = /^<(\w+)/.exec(source.slice(start))[1];
  const pattern = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
  pattern.lastIndex = start;
  let depth = 0;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) {
      return source.slice(start, pattern.lastIndex);
    }
  }
  assert.fail(`Unclosed <${tag}> at ${start}`);
}

function elementMarkup(source, id) {
  const idIndex = source.indexOf(`id="${id}"`);
  assert.notEqual(idIndex, -1, `Missing #${id}`);
  return markupAt(source, source.lastIndexOf('<', idIndex));
}

// Empty and without data-i18n, because applyTranslations would overwrite the report on a language change. A <pre> is
// generic to assistive tech, which ignores a name on it, so it is a named region.
function assertPreviewMarkup(markup, id) {
  const preview = elementMarkup(markup, id);
  const openTag = preview.match(/^<pre[^>]*>/)[0];
  assert.match(openTag, /class="bug-report-preview"/);
  assert.match(openTag, /role="region"/);
  assert.match(openTag, /tabindex="0"/);
  assert.match(openTag, /aria-label="Bug report preview"/);
  assert.match(openTag, /data-i18n-aria="settings\.bugReportPreviewAria"/);
  assert.doesNotMatch(openTag, /data-i18n="/);
  assert.equal(preview, `${openTag}</pre>`);
}

test('Settings > About ends with a Report a bug group that shows the report and two buttons', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const aboutTab = elementMarkup(html, 'settings-about');
  const group = elementMarkup(html, 'bug-report-group');

  assert.ok(aboutTab.includes(group), 'the group sits in the About tab');
  assert.equal(aboutTab.slice(aboutTab.indexOf(group) + group.length).trim(), '</div>', 'the group is the last one');
  assert.match(group, /^<div class="settings-group settings-group--wide" id="bug-report-group">/);
  assert.match(group, /<h3 data-i18n="settings\.reportBug">Report a bug<\/h3>/);
  assert.match(group, /<p class="settings-desc" data-i18n="settings\.bugReportDesc">/);
  assertPreviewMarkup(group, 'bug-report-preview');

  const openButton = elementMarkup(group, 'open-bug-report-issue');
  assert.match(openButton, /^<button id="open-bug-report-issue" class="btn btn-primary btn-small" type="button">/);
  assert.match(openButton, /<span class="btn-label" data-i18n="settings\.openBugReportIssue">/);
  assert.match(openButton, /<use href="assets\/icons\.svg#external"\/>/);
  assert.match(
    elementMarkup(group, 'copy-bug-report'),
    /^<button id="copy-bug-report" class="btn btn-secondary btn-small" type="button" data-i18n="settings\.copyBugReport">/
  );
  assert.match(group, /<p class="settings-desc bug-report-note" data-i18n="settings\.errorLogNote">/);

  // Clearing the error log lives in Settings > Data; About only points there.
  assert.doesNotMatch(group, /id="[^"]*clear/i);
  assert.match(group, /Settings (?:>|&gt;) Data/);
});

test('the sign-in panel links to a report panel with the same preview and buttons and a way back', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const signInPanel = markupAt(html, html.indexOf('<div class="modal-panel oauth-only">'));
  assert.match(
    signInPanel,
    /<p class="login-report-row">\s*<span data-i18n="login\.troubleSigningIn">Having trouble signing in\?<\/span>\s*<button type="button" class="btn btn-link" id="login-report-problem" data-i18n="login\.reportProblem">Report a problem<\/button>\s*<\/p>/
  );

  // The report panel takes the sign-in panel's column in the modal: the .hidden class swaps them, because the
  // sign-in panel's display: flex would beat a hidden attribute.
  const panel = elementMarkup(html, 'login-bug-report-panel');
  const modalShell = markupAt(html, html.indexOf('<div class="modal-shell">'));
  assert.ok(modalShell.includes(signInPanel) && modalShell.includes(panel));
  assert.match(
    panel,
    /^<div class="modal-panel bug-report-panel hidden" id="login-bug-report-panel" role="region" aria-labelledby="login-bug-report-title">/
  );
  assert.match(panel, /<h2 id="login-bug-report-title" data-i18n="settings\.reportBug">Report a bug<\/h2>/);
  assert.match(panel, /<p class="modal-subtitle compact" data-i18n="settings\.bugReportDesc">/);
  assertPreviewMarkup(panel, 'login-bug-report-preview');
  assert.match(
    elementMarkup(panel, 'login-open-bug-report-issue'),
    /class="btn btn-primary btn-small"[\s\S]*<span class="btn-label" data-i18n="settings\.openBugReportIssue">[\s\S]*<use href="assets\/icons\.svg#external"\/>/
  );
  assert.match(elementMarkup(panel, 'login-copy-bug-report'), /class="btn btn-secondary btn-small"[^>]*data-i18n="settings\.copyBugReport"/);
  assert.match(elementMarkup(panel, 'login-bug-report-back'), /data-i18n="login\.backToSignIn">Back to sign-in</);

  for (const id of [
    'bug-report-group', 'bug-report-preview', 'open-bug-report-issue', 'copy-bug-report', 'login-report-problem',
    'login-bug-report-panel', 'login-bug-report-title', 'login-bug-report-preview', 'login-open-bug-report-issue',
    'login-copy-bug-report', 'login-bug-report-back'
  ]) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1, `#${id} appears once`);
  }
});

test('a failed sign-in shows inline, directly above Report a problem, and an empty text hides the line', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const signInPanel = markupAt(html, html.indexOf('<div class="modal-panel oauth-only">'));
  const notice = elementMarkup(signInPanel, 'login-error');
  assert.match(notice, /^<p class="inline-notice error login-error hidden" id="login-error" role="alert">/);
  assert.match(
    notice,
    /<span class="notice-mark" aria-hidden="true"><svg class="icon" width="14" height="14"><use href="assets\/icons\.svg#alert"\/><\/svg><\/span>/
  );
  // Empty and without data-i18n: applyTranslations would otherwise wipe the reason on a language change.
  assert.equal(elementMarkup(notice, 'login-error-text'), '<span id="login-error-text"></span>');
  assert.match(signInPanel.slice(signInPanel.indexOf(notice) + notice.length), /^\s*<p class="login-report-row">/);
  for (const id of ['login-error', 'login-error-text']) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1, `#${id} appears once`);
  }

  const loginError = { classList: createClassList('hidden') };
  const loginErrorText = { textContent: '' };
  const context = loadFunctions(['setLoginError'], { elements: { loginError, loginErrorText } });

  context.setLoginError('Sign-in did not finish. Try again.');
  assert.equal(loginError.classList.contains('hidden'), false);
  assert.equal(loginErrorText.textContent, 'Sign-in did not finish. Try again.');
  context.setLoginError('');
  assert.equal(loginError.classList.contains('hidden'), true);
  assert.equal(loginErrorText.textContent, '');
});

test('loadBugReportPreview shows the report as text, remembers its id and clears the other view', async () => {
  const about = createView();
  const login = createView();
  login.preview.textContent = 'report 3';
  login.reportId = 3;
  const calls = [];
  const { context, toasts } = loadReportHandlers({ about, login }, {
    getBugReport: async (...args) => {
      calls.push([args.length, about.openButton.disabled, about.copyButton.disabled, about.preview.getAttribute('aria-busy')]);
      return { text: 'Juice Journal bug report\n<b>not markup</b>', reportId: 4 };
    }
  });

  await context.loadBugReportPreview(about);

  assert.deepEqual(calls, [[0, true, true, 'true']], 'both buttons wait while the report is built');
  assert.equal(about.preview.textContent, 'Juice Journal bug report\n<b>not markup</b>');
  assert.equal(about.reportId, 4);
  assert.equal(about.openButton.disabled, false);
  assert.equal(about.copyButton.disabled, false);
  assert.equal(about.preview.getAttribute('aria-busy'), null);
  assert.deepEqual(toasts, []);
  // Main now keeps only report 4, so report 3 can no longer be copied from the login view.
  assert.equal(login.preview.textContent, '');
  assert.equal(login.reportId, null);
  assert.equal(login.openButton.disabled, true);
  assert.equal(login.copyButton.disabled, true);
});

test('loadBugReportPreview says when the report cannot be built and keeps both buttons off', async () => {
  const about = createView();
  about.preview.textContent = 'report 2';
  about.reportId = 2;
  const { context, toasts } = loadReportHandlers({ about }, {
    getBugReport: async () => {
      throw new Error('Error invoking remote method');
    }
  });

  await context.loadBugReportPreview(about);

  assert.equal(about.preview.textContent, 'settings.bugReportLoadFailed');
  assert.equal(about.reportId, null);
  assert.equal(about.openButton.disabled, true);
  assert.equal(about.copyButton.disabled, true);
  assert.equal(about.preview.getAttribute('aria-busy'), null);
  // Focus may already sit on the preview, so the toast is what a screen reader announces.
  assert.deepEqual(toasts, [['settings.bugReportLoadFailed', 'toast.tryAgainShort', 'error']]);
});

test('Copy sends the id of the report on screen and says when it is on the clipboard', async () => {
  const about = createView();
  about.reportId = 7;
  const calls = [];
  const { context, toasts } = loadReportHandlers({ about }, {
    copyBugReport: async (...args) => {
      calls.push([args, about.copyButton.disabled, about.copyButton.getAttribute('aria-busy')]);
      return { copied: true };
    }
  });

  await context.handleCopyBugReport(about);

  assert.deepEqual(calls, [[[7], true, 'true']]);
  assert.equal(about.copyButton.disabled, false);
  assert.equal(about.copyButton.getAttribute('aria-busy'), null);
  assert.equal(about.copyButton.textContent, 'Copy report');
  assert.deepEqual(toasts, [['toast.bugReportCopied', '', 'success']]);
});

test('Copy reports a failure and gives the button back', async () => {
  const about = createView();
  about.reportId = 7;
  const { context, toasts } = loadReportHandlers({ about }, {
    copyBugReport: async () => {
      throw new Error('Clipboard busy');
    }
  });

  await context.handleCopyBugReport(about);

  assert.equal(about.copyButton.disabled, false);
  assert.equal(about.copyButton.getAttribute('aria-busy'), null);
  // The report itself is what fails here, so the hint does not send the user to report a bug.
  assert.deepEqual(toasts, [['toast.bugReportCopyFailed', 'toast.tryAgainShort', 'error']]);
});

test('Copy and Open copy nothing when main built a newer report, and show that report instead', async () => {
  for (const handlerName of ['handleCopyBugReport', 'handleOpenBugReportIssue']) {
    const about = createView();
    about.preview.textContent = 'report 7';
    about.reportId = 7;
    const { context, toasts } = loadReportHandlers({ about }, {
      copyBugReport: async () => ({ stale: true }),
      openBugReportIssue: async () => ({ stale: true }),
      getBugReport: async () => ({ text: 'report 9', reportId: 9 })
    });

    await context[handlerName](about);

    assert.deepEqual(toasts, [['toast.bugReportChanged', 'toast.bugReportChangedHint', 'warning']], handlerName);
    assert.equal(about.preview.textContent, 'report 9', handlerName);
    assert.equal(about.reportId, 9, handlerName);
    for (const button of [about.openButton, about.copyButton]) {
      assert.equal(button.disabled, false, handlerName);
      assert.equal(button.getAttribute('aria-busy'), null, handlerName);
    }
  }
});

test('the issue button sends the report id, waits with a busy label and says where to paste', async () => {
  const about = createView();
  about.reportId = 7;
  const calls = [];
  const { context, toasts } = loadReportHandlers({ about }, {
    openBugReportIssue: async (...args) => {
      calls.push([args, about.openButton.disabled, about.openButton.getAttribute('aria-busy'), about.openButton.label.textContent]);
      return { copied: true, opened: true };
    }
  });

  await context.handleOpenBugReportIssue(about);

  assert.deepEqual(calls, [[[7], true, 'true', 'settings.openingBugReportIssue']]);
  assert.equal(about.openButton.disabled, false);
  assert.equal(about.openButton.getAttribute('aria-busy'), null);
  assert.equal(about.openButton.label.textContent, 'settings.openBugReportIssue');
  assert.deepEqual(toasts, [['toast.bugReportCopied', 'toast.bugReportIssueOpened', 'success']]);
});

test('the issue button names the address when no browser opened, and reports a failure', async () => {
  const issueUrl = 'https://github.com/JuiceJournal/JuiceJournal/issues/new';
  const about = createView();
  about.reportId = 7;
  let answer = async () => ({ copied: true, opened: false, url: issueUrl });
  const { context, toasts } = loadReportHandlers({ about }, { openBugReportIssue: () => answer() });

  await context.handleOpenBugReportIssue(about);
  answer = async () => {
    throw new Error('Invalid bug report URL');
  };
  await context.handleOpenBugReportIssue(about);

  assert.deepEqual(toasts, [
    ['toast.bugReportCopied', `toast.bugReportOpenManually ${issueUrl}`, 'warning'],
    ['toast.bugReportOpenFailed', 'toast.tryAgainShort', 'error']
  ]);
  assert.equal(about.openButton.disabled, false);
  assert.equal(about.openButton.label.textContent, 'settings.openBugReportIssue');
});

test('Report a problem swaps the sign-in panel for the report, and Back or a new visit swaps it back', () => {
  const focused = [];
  const loads = [];
  const views = { about: {}, login: {} };
  const elements = {
    loginModal: { classList: createClassList('hidden') },
    registerModal: { classList: createClassList() },
    loginSignInPanel: { classList: createClassList() },
    loginBugReportPanel: { classList: createClassList('hidden') },
    loginBugReportPreview: { focus: () => focused.push('preview') },
    loginReportProblemBtn: { focus: () => focused.push('report-problem') }
  };
  const context = loadFunctions(['showLoginBugReport', 'showLoginSignIn', 'showLoginModal'], {
    elements,
    bugReportViews: views,
    loadBugReportPreview: async (view) => loads.push(view)
  });

  context.showLoginBugReport();
  assert.equal(elements.loginSignInPanel.classList.contains('hidden'), true);
  assert.equal(elements.loginBugReportPanel.classList.contains('hidden'), false);
  assert.deepEqual(focused, ['preview']);
  assert.equal(loads.length, 1);
  assert.equal(loads[0], views.login);

  context.showLoginSignIn({ restoreFocus: true });
  assert.equal(elements.loginSignInPanel.classList.contains('hidden'), false);
  assert.equal(elements.loginBugReportPanel.classList.contains('hidden'), true);
  assert.deepEqual(focused, ['preview', 'report-problem']);

  // Signing out reopens the modal at sign-in without moving focus.
  context.showLoginBugReport();
  context.showLoginModal();
  assert.equal(elements.loginModal.classList.contains('hidden'), false);
  assert.equal(elements.loginSignInPanel.classList.contains('hidden'), false);
  assert.equal(elements.loginBugReportPanel.classList.contains('hidden'), true);
  assert.deepEqual(focused, ['preview', 'report-problem', 'preview']);
});

test('the report buttons and the login links are wired to the shared handlers', () => {
  const body = extractFunctionSource(fs.readFileSync(appJsPath, 'utf8'), 'setupEventListeners');
  assert.match(body, /elements\.loginReportProblemBtn\.addEventListener\('click', showLoginBugReport\)/);
  assert.match(body, /elements\.loginBugReportBackBtn\.addEventListener\('click', \(\) => showLoginSignIn\(\{ restoreFocus: true \}\)\)/);
  assert.match(body, /Object\.values\(bugReportViews\)\.forEach\(\(view\) => \{/);
  assert.match(body, /view\.openButton\.addEventListener\('click', \(\) => handleOpenBugReportIssue\(view\)\)/);
  assert.match(body, /view\.copyButton\.addEventListener\('click', \(\) => handleCopyBugReport\(view\)\)/);
});

test('Settings > About builds the report on each visit to the tab, or to Settings while the tab is selected', () => {
  const loads = [];
  const views = { about: {}, login: {} };
  const aboutTab = { id: 'settings-about', classList: createClassList() };
  const loginModal = { classList: createClassList('hidden') };
  const navButton = (tab) => ({ dataset: { settingsTab: tab }, classList: createClassList(), setAttribute: () => {} });
  const context = loadFunctions(['showSettingsTab', 'navigateTo'], {
    elements: {
      settingsNavBtns: [navButton('api'), navButton('about')],
      settingsTabs: [{ id: 'settings-api', classList: createClassList() }, aboutTab],
      settingsAboutTab: aboutTab,
      loginModal,
      navButtons: [],
      pages: []
    },
    bugReportViews: views,
    closeSessionDrawer: () => {},
    loadBugReportPreview: async (view) => loads.push(view)
  });

  context.showSettingsTab('api');
  context.navigateTo('settings');
  assert.equal(loads.length, 0, 'About is not selected');

  context.showSettingsTab('about');
  assert.equal(loads.length, 1);
  context.navigateTo('settings');
  assert.equal(loads.length, 2);
  assert.ok(loads.every((view) => view === views.about));

  // Signed out, the tray's Settings item must not clear the login report behind the modal.
  loginModal.classList.remove('hidden');
  context.navigateTo('settings');
  context.showSettingsTab('about');
  assert.equal(loads.length, 2);
});

test('signing in over Settings > About builds that report again', async () => {
  for (const [settingsActive, aboutActive, expectedLoads] of [[true, true, 1], [true, false, 0], [false, true, 0]]) {
    const loads = [];
    const toasts = [];
    const views = { about: {}, login: {} };
    const context = loadFunctions(['handlePoeOAuthLogin'], {
      document: { getElementById: () => createButtonStub('login.poeOAuth') },
      elements: {
        loginModal: { classList: createClassList() },
        settingsPage: { classList: createClassList(...(settingsActive ? ['active'] : [])) },
        settingsAboutTab: { classList: createClassList(...(aboutActive ? ['active'] : [])) }
      },
      bugReportViews: views,
      window: {
        t: (key) => key,
        electronAPI: { signInWithPoe: async () => ({ success: true, profile: { id: 'profile-1' } }) }
      },
      setButtonBusy: () => {},
      loadProfileAccountStateCache: async () => {},
      toProfileUser: (profile) => profile,
      setCurrentUser: () => {},
      loadMapResultHistory: async () => {},
      syncPoeDeviceConnection: async () => {},
      refreshTrackerData: async () => {},
      showToast: (...args) => toasts.push(args),
      setLoginError: () => {},
      getUserFacingErrorMessage: (error) => String(error?.message || error),
      loadBugReportPreview: async (view) => loads.push(view)
    });

    await context.handlePoeOAuthLogin();

    // The modal closing confirms the sign-in; there is no welcome toast.
    assert.deepEqual(toasts, []);
    assert.equal(loads.length, expectedLoads, `settings ${settingsActive}, about ${aboutActive}`);
    assert.ok(loads.every((view) => view === views.about));
  }
});

test('a failed sign-in builds the login report again when it is open, so the report shows the failure', async () => {
  const answers = {
    refused: async () => ({ success: false, error: 'Path of Exile sign-in timed out' }),
    thrown: async () => {
      throw new Error('Error invoking remote method');
    }
  };
  for (const [answer, signInWithPoe] of Object.entries(answers)) {
    for (const [reportOpen, expectedLoads] of [[true, 1], [false, 0]]) {
      const loads = [];
      const toasts = [];
      const loginErrors = [];
      const views = { about: {}, login: {} };
      const context = loadFunctions(['handlePoeOAuthLogin'], {
        document: { getElementById: () => createButtonStub('login.poeOAuth') },
        elements: {
          loginModal: { classList: createClassList() },
          loginBugReportPanel: { classList: createClassList(...(reportOpen ? [] : ['hidden'])) }
        },
        bugReportViews: views,
        window: { t: (key, values) => (values?.reason ? `${key}:${values.reason}` : key), electronAPI: { signInWithPoe } },
        setButtonBusy: () => {},
        showToast: (...args) => toasts.push(args),
        setLoginError: (text) => loginErrors.push(text),
        getUserFacingErrorMessage: (error, fallbackKey) => fallbackKey,
        loadBugReportPreview: async (view) => loads.push(view)
      });

      await context.handlePoeOAuthLogin();

      // The failure shows inline above Report a problem, cleared first; mapped text or the hint, never raw text.
      assert.deepEqual(loginErrors, ['', 'login.failedInline:login.failedHint'], answer);
      // With the report open the sign-in panel and its line are hidden, so a toast says it meanwhile.
      assert.deepEqual(toasts, reportOpen ? [['login.failedTitle', '', 'error']] : [], answer);
      assert.equal(loads.length, expectedLoads, `${answer}, report open ${reportOpen}`);
      assert.ok(loads.every((view) => view === views.login));
    }
  }
});

test('the report preview is a wrapped mono box and the text button drops the button capitals', () => {
  const css = fs.readFileSync(stylesCssPath, 'utf8');
  const cssRule = (selector) => {
    const start = css.indexOf(`\n${selector} {`);
    assert.notEqual(start, -1, `Missing ${selector} rule`);
    return css.slice(start, css.indexOf('}', start));
  };

  const preview = cssRule('.bug-report-preview');
  for (const declaration of [
    'font-family: var(--font-mono);',
    'max-height: 240px;',
    'overflow: auto;',
    'white-space: pre-wrap;',
    'border-radius: var(--bevel-sm);'
  ]) {
    assert.ok(preview.includes(declaration), declaration);
  }
  assert.match(fs.readFileSync(tokensCssPath, 'utf8'), /--font-mono: 'Cascadia Mono', Consolas, monospace;/);

  const linkButton = cssRule('.btn-link');
  assert.match(linkButton, /padding: 0;/);
  assert.match(linkButton, /text-transform: none;/);
  // The 4px focus ring stays off the question mark before the link.
  assert.match(cssRule('.login-report-row .btn-link'), /margin-left: 0\.25rem;/);
  assert.match(cssRule('.bug-report-panel'), /display: flex;/);
  // Lower on the login screen, so the modal keeps its size when the report replaces sign-in.
  assert.match(cssRule('.bug-report-panel .bug-report-preview'), /max-height: 180px;/);
});
