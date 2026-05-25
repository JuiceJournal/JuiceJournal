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
  const calls = [];
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
    get: async (url, config) => {
      calls.push(['get', url, config]);
      return { success: true, data: {} };
    },
    put: async (url, data, config) => {
      calls.push(['put', url, data, config]);
      return { success: true, data: {} };
    },
    patch: async (url, data, config) => {
      calls.push(['patch', url, data, config]);
      return { success: true, data: { run: { id: 'published-1' } } };
    },
    delete: async (url, config) => {
      calls.push(['delete', url, config]);
      return { success: true, data: {} };
    },
    post: async (url, data, config) => {
      calls.push(['post', url, data, config]);
      return { success: true, data: { run: { id: 'published-1' } } };
    }
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
    calls,
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

test('desktop API client exposes farming hub publish endpoints', async () => {
  const { axiosMock, calls } = createAxiosMock();
  const APIClient = loadApiClientWithAxiosMock(axiosMock);
  const client = new APIClient('http://localhost:3001');

  const published = await client.publishFarmRun({ poeVersion: 'poe1', maps: [{ mapName: 'Dunes Map' }] });
  await client.getMyPublishedFarmRuns({ visibility: 'public' });
  await client.getPublicFarmRuns({ poeVersion: 'poe1' });
  await client.getPublishedFarmRun('published-1');
  await client.updatePublishedFarmRunVisibility('published-1', 'private');
  await client.deletePublishedFarmRun('published-1');

  assert.deepEqual(published, { id: 'published-1' });
  assert.deepEqual(calls.map((call) => call.slice(0, 2)), [
    ['post', '/api/farming-hub/runs'],
    ['get', '/api/farming-hub/runs/mine'],
    ['get', '/api/farming-hub/runs'],
    ['get', '/api/farming-hub/runs/published-1'],
    ['patch', '/api/farming-hub/runs/published-1/visibility'],
    ['delete', '/api/farming-hub/runs/published-1']
  ]);
  assert.deepEqual(calls[4][2], { visibility: 'private' });
});
