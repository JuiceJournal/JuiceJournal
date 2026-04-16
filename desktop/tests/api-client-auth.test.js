const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const clientModulePath = '../src/modules/apiClient';

function loadApiClientWithAxiosMock(axiosMock) {
  const originalLoad = Module._load;
  delete require.cache[require.resolve(clientModulePath)];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'axios') {
      return axiosMock;
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    return require(clientModulePath);
  } finally {
    Module._load = originalLoad;
  }
}

function createAxiosMock() {
  const requestHandlers = [];
  const responseHandlers = [];
  const client = {
    defaults: { baseURL: 'http://localhost:3001' },
    interceptors: {
      request: {
        use(handler) {
          requestHandlers.push(handler);
        }
      },
      response: {
        use(success, failure) {
          responseHandlers.push({ success, failure });
        }
      }
    },
    get: async () => ({ success: true, data: {} }),
    put: async () => ({ success: true, data: {} }),
    delete: async () => ({ success: true, data: {} }),
    post: async () => ({ success: true, data: {} })
  };

  const axiosMock = {
    create() {
      return client;
    },
    async request(config) {
      return {
        data: {
          success: true,
          data: {
            user: { id: 'user-1' }
          }
        },
        headers: {
          'set-cookie': ['juice_journal_auth=abc123; Path=/; HttpOnly; SameSite=Strict']
        },
        config
      };
    }
  };

  return {
    axiosMock,
    client,
    requestHandlers,
    responseHandlers
  };
}

test('desktop API client captures the auth cookie from login responses', async () => {
  const { axiosMock } = createAxiosMock();
  const APIClient = loadApiClientWithAxiosMock(axiosMock);
  const client = new APIClient('http://localhost:3001');

  const response = await client.login({ username: 'demo', password: 'secret' });

  assert.equal(client.token, 'juice_journal_auth=abc123');
  assert.equal(response.success, true);
  assert.deepEqual(response.data.user, { id: 'user-1' });
});

test('desktop API client sends the persisted auth cookie on authenticated requests', async () => {
  const { axiosMock, requestHandlers } = createAxiosMock();
  const APIClient = loadApiClientWithAxiosMock(axiosMock);
  const client = new APIClient('http://localhost:3001');

  client.setToken('juice_journal_auth=abc123');

  const config = await requestHandlers[0]({
    headers: {}
  });

  assert.equal(config.headers.Cookie, 'juice_journal_auth=abc123');
  assert.equal(config.headers.Authorization, undefined);
});
