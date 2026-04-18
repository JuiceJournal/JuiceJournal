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

test('successful poe oauth login initializes a local session and dashboard bootstrap', async () => {
  const calls = [];
  const button = {
    disabled: false,
    classList: {
      add: () => calls.push(['buttonLoadingOn']),
      remove: () => calls.push(['buttonLoadingOff'])
    }
  };
  const context = loadFunctions(['handlePoeOAuthLogin'], {
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
        startPoeLogin: async () => ({ mode: 'mock', requiresBrowser: false, state: 'oauth-state', mockCode: 'code' }),
        completePoeConnect: async () => { throw new Error('wrong endpoint'); },
        completePoeLogin: async (payload) => {
          calls.push(['completePoeLogin', payload.code, payload.state]);
          return { success: true, data: { user: { username: 'RangerMain' }, capabilities: {} } };
        }
      },
      t: (key) => key
    },
    setCurrentUser: (user) => calls.push(['setCurrentUser', user.username]),
    loadPoeLinkStatus: async () => calls.push(['loadPoeLinkStatus']),
    refreshTrackerData: async () => calls.push(['refreshTrackerData']),
    showToast: (...args) => calls.push(['showToast', ...args]),
    getUserFacingErrorMessage: (error) => String(error?.error || error?.message || error)
  });

  await context.handlePoeOAuthLogin();

  assert.deepEqual(
    calls.filter(([name]) => ['completePoeLogin', 'setCurrentUser', 'loadPoeLinkStatus', 'refreshTrackerData'].includes(name)),
    [
      ['completePoeLogin', 'code', 'oauth-state'],
      ['setCurrentUser', 'RangerMain'],
      ['loadPoeLinkStatus'],
      ['refreshTrackerData']
    ]
  );
});

test('bootstrapCurrentUserSession continues in guest mode when no auth token exists', async () => {
  const calls = [];
  const state = { mapResults: [{ id: 'map-1' }] };
  const context = loadFunctions(['hideLoginModal', 'isServerUnavailableError', 'bootstrapCurrentUserSession'], {
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
        hasAuthToken: async () => false,
        getRuntimeMode: async () => ({ isPackaged: false, isDev: true })
      },
      t: (key) => key
    },
    showLoginModal: () => calls.push(['showLoginModal']),
    showToast: (...args) => calls.push(['showToast', ...args]),
    setCurrentUser: () => calls.push(['setCurrentUser']),
    loadMapResultHistory: async () => calls.push(['loadMapResultHistory']),
    loadPoeLinkStatus: async () => calls.push(['loadPoeLinkStatus'])
  });

  const result = await context.bootstrapCurrentUserSession();

  assert.equal(result.mode, 'guest');
  assert.equal(state.mapResults.length, 0);
  assert.deepEqual(calls, [
    ['hideLoginModal', 'hidden'],
    ['hideRegisterModal', 'hidden']
  ]);
});

test('bootstrapCurrentUserSession falls back to offline guest mode when backend is unavailable', async () => {
  const calls = [];
  const state = { mapResults: [{ id: 'map-1' }] };
  const context = loadFunctions(['hideLoginModal', 'isServerUnavailableError', 'bootstrapCurrentUserSession'], {
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
        hasAuthToken: async () => true,
        getRuntimeMode: async () => ({ isPackaged: false, isDev: true }),
        getCurrentUser: async () => {
          throw new Error('Unable to reach the server');
        }
      },
      t: (key) => key
    },
    showLoginModal: () => calls.push(['showLoginModal']),
    showToast: (...args) => calls.push(['showToast', ...args]),
    setCurrentUser: () => calls.push(['setCurrentUser']),
    loadMapResultHistory: async () => calls.push(['loadMapResultHistory']),
    loadPoeLinkStatus: async () => calls.push(['loadPoeLinkStatus'])
  });

  const result = await context.bootstrapCurrentUserSession();

  assert.equal(result.mode, 'guest-offline');
  assert.equal(state.mapResults.length, 0);
  assert.deepEqual(calls, [
    ['hideLoginModal', 'hidden'],
    ['hideRegisterModal', 'hidden'],
    ['showToast', 'settings.api', 'toast.serverUnavailable', 'warning']
  ]);
});

test('bootstrapCurrentUserSession keeps the login modal for packaged live mode without a token', async () => {
  const calls = [];
  const state = { mapResults: [{ id: 'map-1' }] };
  const context = loadFunctions(['hideLoginModal', 'isServerUnavailableError', 'bootstrapCurrentUserSession'], {
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
        hasAuthToken: async () => false,
        getRuntimeMode: async () => ({ isPackaged: true, isDev: false })
      },
      t: (key) => key
    },
    showLoginModal: () => calls.push(['showLoginModal']),
    showToast: (...args) => calls.push(['showToast', ...args]),
    setCurrentUser: () => calls.push(['setCurrentUser']),
    loadMapResultHistory: async () => calls.push(['loadMapResultHistory']),
    loadPoeLinkStatus: async () => calls.push(['loadPoeLinkStatus'])
  });

  const result = await context.bootstrapCurrentUserSession();

  assert.equal(result.mode, 'login-required');
  assert.equal(state.mapResults.length, 0);
  assert.deepEqual(calls, [
    ['showLoginModal']
  ]);
});

test('bootstrapCurrentUserSession keeps the login modal when forceLiveAuth is enabled locally', async () => {
  const calls = [];
  const state = { mapResults: [{ id: 'map-1' }] };
  const context = loadFunctions(['hideLoginModal', 'isServerUnavailableError', 'bootstrapCurrentUserSession'], {
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
        hasAuthToken: async () => false,
        getRuntimeMode: async () => ({ isPackaged: false, isDev: true, forceLiveAuth: true })
      },
      t: (key) => key
    },
    showLoginModal: () => calls.push(['showLoginModal']),
    showToast: (...args) => calls.push(['showToast', ...args]),
    setCurrentUser: () => calls.push(['setCurrentUser']),
    loadMapResultHistory: async () => calls.push(['loadMapResultHistory']),
    loadPoeLinkStatus: async () => calls.push(['loadPoeLinkStatus'])
  });

  const result = await context.bootstrapCurrentUserSession();

  assert.equal(result.mode, 'login-required');
  assert.equal(state.mapResults.length, 0);
  assert.deepEqual(calls, [
    ['showLoginModal']
  ]);
});
