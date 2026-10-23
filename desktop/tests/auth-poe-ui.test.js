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

test('desktop login surface exposes only Path of Exile OAuth entry', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.doesNotMatch(html, /id="login-form"/);
  assert.doesNotMatch(html, /id="register-form"/);
  assert.match(html, /id="poe-oauth-login"/);
});

test('device sign-in opens the local profile and loads its history', async () => {
  const calls = [];
  const button = {
    disabled: false,
    classList: {
      add: () => calls.push(['buttonLoadingOn']),
      remove: () => calls.push(['buttonLoadingOff'])
    }
  };
  const context = loadFunctions(['toProfileUser', 'handlePoeOAuthLogin'], {
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

