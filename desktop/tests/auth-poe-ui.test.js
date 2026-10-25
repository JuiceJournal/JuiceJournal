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

test('desktop login surface exposes only Path of Exile OAuth entry', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.doesNotMatch(html, /id="login-form"/);
  assert.doesNotMatch(html, /id="register-form"/);
  assert.match(html, /id="poe-oauth-login"/);
});

test('login art column describes shipped features and translates every line', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const art = html.match(/<div class="modal-art">([\s\S]*?)<div class="modal-panel/)[1];
  // The brand name stays as is in every locale.
  const copy = art.replace(/<div class="modal-logo">[\s\S]*?<span>Juice Journal<\/span>\s*<\/div>/, '');
  const context = vm.createContext({ window: {}, document: { querySelectorAll: () => [] } });
  vm.runInContext(fs.readFileSync(path.join(desktopDir, 'src', 'modules', 'translations.js'), 'utf8'), context);
  const { en, tr } = context.window.Translations;

  // The built-in sign-in requests only account:characters, so stash tracking is off for everyone.
  assert.doesNotMatch(art, /stash/i);

  const icons = [...copy.matchAll(/<span class="modal-feature-icon">([\s\S]*?)<\/span>/g)];
  assert.equal(icons.length, 3);
  for (const [, icon] of icons) {
    assert.match(icon, /<use href="assets\/icons\.svg#[\w-]+"\/>/);
  }

  const lines = [...copy.matchAll(/<(\w+)([^>]*)>([^<]*[^<\s][^<]*)<\/\1>/g)];
  assert.ok(lines.length >= 9, 'Expected kicker, headline, lede and three feature rows');
  for (const [, tag, attributes, text] of lines) {
    const key = attributes.match(/data-i18n="([^"]+)"/)?.[1];
    assert.ok(key, `<${tag}>${text.trim()}</${tag}> has no data-i18n`);
    assert.equal(en[key], text.trim(), `${key} must match the English markup`);
    assert.ok(tr[key] && tr[key] !== en[key], `${key} needs a Turkish string`);
  }
});

test('device sign-in opens the local profile and loads its history', async () => {
  const calls = [];
  // The markup text differs from t(key), so the restore below proves the label was translated again.
  const button = createButtonStub('login.poeOAuth', { text: 'Sign in with Path of Exile' });
  const context = loadFunctions(['setButtonBusy', 'toProfileUser', 'handlePoeOAuthLogin'], {
    document: {
      getElementById: (id) => {
        if (id === 'poe-oauth-login') {
          return button;
        }

        throw new Error(`Unexpected element lookup: ${id}`);
      }
    },
    elements: {
      loginModal: {
        classList: {
          add: (className) => calls.push(['hideLoginModal', className])
        }
      }
    },
    window: {
      electronAPI: {
        signInWithPoe: async () => {
          calls.push(['signInWithPoe']);
          calls.push(['buttonWhileWaiting', button.disabled, button.getAttribute('aria-busy'), button.label.textContent]);
          return { success: true, profile: { id: 'profile-1', accountName: 'Exile#1234' }, error: null };
        }
      },
      t: (key) => key
    },
    // Recorded only once the load has finished, so the order also proves the sign-in waits for it.
    loadProfileAccountStateCache: async () => {
      await Promise.resolve();
      calls.push(['loadProfileAccountStateCache']);
    },
    setCurrentUser: (user) => calls.push(['setCurrentUser', user.username, user.accountName]),
    loadMapResultHistory: async () => calls.push(['loadMapResultHistory']),
    syncPoeDeviceConnection: async () => calls.push(['syncPoeDeviceConnection']),
    refreshTrackerData: async () => calls.push(['refreshTrackerData']),
    showToast: (...args) => calls.push(['showToast', ...args]),
    getUserFacingErrorMessage: (error) => String(error?.error || error?.message || error)
  });

  await context.handlePoeOAuthLogin();

  assert.deepEqual(
    calls.filter(([name]) => [
      'signInWithPoe', 'loadProfileAccountStateCache', 'setCurrentUser', 'hideLoginModal', 'loadMapResultHistory',
      'syncPoeDeviceConnection', 'refreshTrackerData'
    ].includes(name)),
    [
      ['signInWithPoe'],
      ['loadProfileAccountStateCache'],
      ['setCurrentUser', 'Exile#1234', 'Exile#1234'],
      ['hideLoginModal', 'hidden'],
      ['loadMapResultHistory'],
      ['syncPoeDeviceConnection'],
      ['refreshTrackerData']
    ]
  );
  assert.deepEqual(
    calls.find(([name]) => name === 'buttonWhileWaiting'),
    ['buttonWhileWaiting', true, 'true', 'login.waitingBrowser']
  );
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-busy'), null);
  assert.equal(button.label.textContent, 'login.poeOAuth');
});

test('busy buttons without a translated label get their own text back', () => {
  const context = loadFunctions(['setButtonBusy'], { window: { t: (key) => `t:${key}` } });
  const plain = createButtonStub(null, { text: 'Disconnect', withLabelSpan: false });
  const translated = createButtonStub('settings.testConnection', { text: 'Test', withLabelSpan: false });

  context.setButtonBusy(plain, true);
  assert.equal(plain.textContent, 'Disconnect', 'no busy label leaves the text alone');
  assert.equal(plain.getAttribute('aria-busy'), 'true');
  context.setButtonBusy(plain, false);
  assert.equal(plain.textContent, 'Disconnect');

  context.setButtonBusy(plain, true, 'Working...');
  assert.equal(plain.textContent, 'Working...');
  context.setButtonBusy(plain, true, 'Still working...');
  assert.equal(plain.textContent, 'Still working...');
  context.setButtonBusy(plain, false);
  assert.equal(plain.textContent, 'Disconnect', 'a second busy call keeps the idle text');
  assert.deepEqual({ ...plain.dataset }, {});

  context.setButtonBusy(translated, true, 'Testing...');
  context.setButtonBusy(translated, false);
  assert.equal(translated.textContent, 't:settings.testConnection');
  assert.equal(translated.disabled, false);

  assert.doesNotThrow(() => context.setButtonBusy(null, true, 'Missing'));
});

test('test connection shows a busy button, then lets the online settings decide its state', async () => {
  const calls = [];
  const button = createButtonStub('settings.testConnection', { text: 'Test connection', withLabelSpan: false });
  const context = loadFunctions(['setButtonBusy', 'handleTestConnection'], {
    elements: {
      testConnection: button,
      apiUrl: { value: 'http://127.0.0.1:3001' },
      connectionDot: { classList: { add: () => {}, remove: () => {} } },
      connectionText: { textContent: '' }
    },
    window: {
      electronAPI: {
        testOnlineConnection: async (url) => {
          calls.push(['test', url, button.disabled, button.getAttribute('aria-busy'), button.textContent]);
        }
      },
      t: (key) => key
    },
    showToast: () => {},
    // Online features can be off, so the final disabled state is renderOnlineSettings' call, made after the restore.
    renderOnlineSettings: () => {
      calls.push(['render', button.getAttribute('aria-busy'), button.textContent]);
      button.disabled = true;
    }
  });

  await context.handleTestConnection();

  assert.deepEqual(calls, [
    ['test', 'http://127.0.0.1:3001', true, 'true', 'settings.testing'],
    ['render', null, 'settings.testConnection']
  ]);
  assert.equal(button.disabled, true);
});

test('server sign-in stays busy and disabled while the browser is open, then shows the account state', async () => {
  const calls = [];
  const button = createButtonStub('settings.onlineSignIn', { text: 'Sign in to the server' });
  const state = { onlineAccount: { enabled: true, signedIn: false } };
  const context = loadFunctions(['setButtonBusy', 'renderOnlineSettings', 'handleOnlineSignIn'], {
    state,
    elements: { onlineSignIn: button },
    window: {
      electronAPI: {
        startPoeLogin: async () => {
          // Another settings action redraws the Online tab while the browser is still open.
          context.renderOnlineSettings();
          calls.push(['waiting', button.disabled, button.getAttribute('aria-busy'), button.label.textContent]);
          return { success: true };
        }
      },
      t: (key) => key
    },
    showToast: () => {},
    getUserFacingErrorMessage: () => 'failed',
    refreshOnlineAccount: async () => {
      state.onlineAccount = { enabled: true, signedIn: true };
      context.renderOnlineSettings();
      calls.push(['refreshed', button.disabled, button.getAttribute('aria-busy')]);
    }
  });

  await context.handleOnlineSignIn();

  assert.deepEqual(calls, [
    ['waiting', true, 'true', 'login.waitingBrowser'],
    ['refreshed', true, 'true']
  ]);
  assert.equal(button.getAttribute('aria-busy'), null);
  assert.equal(button.label.textContent, 'settings.onlineSignIn');
  assert.equal(button.disabled, true, 'signed in, so Sign in stays off');
});

test('sign-in panel translates every line and keeps the button icons outside the label', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const panel = html.match(/<div class="modal-panel oauth-only">([\s\S]*?)<!-- New Map Session Modal -->/)[1];
  const context = vm.createContext({ window: {}, document: { querySelectorAll: () => [] } });
  vm.runInContext(fs.readFileSync(path.join(desktopDir, 'src', 'modules', 'translations.js'), 'utf8'), context);
  const { en, tr } = context.window.Translations;
  assert.ok(tr['login.waitingBrowser'] && tr['login.waitingBrowser'] !== en['login.waitingBrowser']);

  const button = panel.match(/<button[^>]*id="poe-oauth-login"[^>]*>([\s\S]*?)<\/button>/);
  assert.doesNotMatch(button[0].match(/<button[^>]*>/)[0], /data-i18n/, 'applyTranslations would wipe the icons');
  assert.match(button[1], /assets\/brand\/mark-small\.svg/);
  assert.match(button[1], /<span class="btn-label" data-i18n="login\.poeOAuth">/);
  assert.match(button[1], /assets\/icons\.svg#external/);

  // Step numbers are digits in every locale.
  const lines = [...panel.matchAll(/<(\w+)([^>]*)>([^<]*[^<\s][^<]*)<\/\1>/g)].filter(([, , , text]) => !/^\d+$/.test(text));
  assert.ok(lines.length >= 7, 'Expected heading, sub, label, helper, three steps and the caution line');
  for (const [, tag, attributes, text] of lines) {
    const key = attributes.match(/data-i18n="([^"]+)"/)?.[1];
    assert.ok(key, `<${tag}>${text.trim()}</${tag}> has no data-i18n`);
    assert.equal(en[key], text.trim(), `${key} must match the English markup`);
    assert.ok(tr[key] && tr[key] !== en[key], `${key} needs a Turkish string`);
  }
});

test('signing in swaps the previous profile character cache for the new profile one', async () => {
  const state = { settings: { language: 'tr', lastKnownAccountState: { accountName: 'Exile#1234' } } };
  let answer = { language: 'tr', lastKnownAccountState: { accountName: 'Alt#0001' } };
  const context = loadFunctions(['loadProfileAccountStateCache'], {
    state,
    window: {
      electronAPI: {
        getSettings: async () => {
          if (answer instanceof Error) {
            throw answer;
          }
          return answer;
        }
      }
    }
  });

  await context.loadProfileAccountStateCache();
  assert.deepEqual(state.settings.lastKnownAccountState, { accountName: 'Alt#0001' });

  answer = { language: 'tr', lastKnownAccountState: null };
  await context.loadProfileAccountStateCache();
  assert.equal(state.settings.lastKnownAccountState, null);

  state.settings.lastKnownAccountState = { accountName: 'Exile#1234' };
  answer = new Error('IPC closed');
  await context.loadProfileAccountStateCache();
  assert.equal(state.settings.lastKnownAccountState, null);
  assert.equal(state.settings.language, 'tr');
});

test('bootstrapCurrentUserSession requires login when no local profile exists', async () => {
  const calls = [];
  const state = { mapResults: [{ id: 'map-1' }] };
  const profileLookup = async () => null;
  const context = loadFunctions(['hideLoginModal', 'toProfileUser', 'bootstrapCurrentUserSession'], {
    state,
    elements: {
      loginModal: {
        classList: {
          add: (className) => calls.push(['hideLoginModal', className])
        }
      },
      registerModal: {
        classList: {
          add: (className) => calls.push(['hideRegisterModal', className])
        }
      }
    },
    window: {
      electronAPI: {
        getLocalProfile: async () => profileLookup()
      },
      t: (key) => key
    },
    showLoginModal: () => calls.push(['showLoginModal']),
    setCurrentUser: (user) => calls.push(['setCurrentUser', user.username]),
    loadMapResultHistory: async () => calls.push(['loadMapResultHistory']),
    syncPoeDeviceConnection: async () => calls.push(['syncPoeDeviceConnection'])
  });

  const result = await context.bootstrapCurrentUserSession();

  assert.equal(result.mode, 'login-required');
  assert.equal(state.mapResults.length, 0);
  assert.deepEqual(calls, [
    ['showLoginModal']
  ]);
});

test('bootstrapCurrentUserSession opens a stored profile without the server or a live sign-in', async () => {
  const calls = [];
  const state = { mapResults: [] };
  const profileLookup = async () => ({ id: 'profile-1', accountName: 'Exile#1234' });
  const context = loadFunctions(['hideLoginModal', 'toProfileUser', 'bootstrapCurrentUserSession'], {
    state,
    elements: {
      loginModal: {
        classList: {
          add: (className) => calls.push(['hideLoginModal', className])
        }
      },
      registerModal: {
        classList: {
          add: (className) => calls.push(['hideRegisterModal', className])
        }
      }
    },
    window: {
      electronAPI: {
        getLocalProfile: async () => profileLookup()
      },
      t: (key) => key
    },
    showLoginModal: () => calls.push(['showLoginModal']),
    setCurrentUser: (user) => calls.push(['setCurrentUser', user.username]),
    loadMapResultHistory: async () => calls.push(['loadMapResultHistory']),
    syncPoeDeviceConnection: async () => calls.push(['syncPoeDeviceConnection'])
  });

  const result = await context.bootstrapCurrentUserSession();

  assert.equal(result.mode, 'authenticated');
  assert.deepEqual(calls, [
    ['setCurrentUser', 'Exile#1234'],
    ['hideLoginModal', 'hidden'],
    ['hideRegisterModal', 'hidden'],
    ['loadMapResultHistory'],
    ['syncPoeDeviceConnection']
  ]);
});

test('bootstrapCurrentUserSession requires login when the profile cannot be read', async () => {
  const calls = [];
  const state = { mapResults: [{ id: 'map-1' }] };
  const profileLookup = async () => {
    throw new Error('IPC unavailable');
  };
  const context = loadFunctions(['hideLoginModal', 'toProfileUser', 'bootstrapCurrentUserSession'], {
    state,
    elements: {
      loginModal: {
        classList: {
          add: (className) => calls.push(['hideLoginModal', className])
        }
      },
      registerModal: {
        classList: {
          add: (className) => calls.push(['hideRegisterModal', className])
        }
      }
    },
    window: {
      electronAPI: {
        getLocalProfile: async () => profileLookup()
      },
      t: (key) => key
    },
    showLoginModal: () => calls.push(['showLoginModal']),
    setCurrentUser: (user) => calls.push(['setCurrentUser', user.username]),
    loadMapResultHistory: async () => calls.push(['loadMapResultHistory']),
    syncPoeDeviceConnection: async () => calls.push(['syncPoeDeviceConnection'])
  });

  const result = await context.bootstrapCurrentUserSession();

  assert.equal(result.mode, 'login-required');
  assert.deepEqual(calls, [
    ['showLoginModal']
  ]);
});

