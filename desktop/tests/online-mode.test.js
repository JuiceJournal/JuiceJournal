const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const APIClient = require('../src/modules/apiClient');

// Real axios with a recording adapter, so the request pipeline (interceptors included) runs as in the app.
function createRecordingClient(options) {
  const client = new APIClient('http://localhost:3001', null, options);
  const requests = [];
  client.client.defaults.adapter = async (config) => {
    requests.push(config.url);
    return { data: { success: true, data: { runs: [] } }, status: 200, statusText: 'OK', headers: {}, config };
  };
  return { client, requests };
}

test('API client sends nothing to the server while online features are off', async () => {
  const { client, requests } = createRecordingClient();

  await assert.rejects(client.healthCheck(), { code: 'ONLINE_DISABLED' });
  await assert.rejects(client.getPublicFarmRuns({ poeVersion: 'poe1' }), { code: 'ONLINE_DISABLED' });
  await assert.rejects(client.publishFarmRun({ maps: [] }), { code: 'ONLINE_DISABLED' });
  await assert.rejects(client.startPoeLogin({}), { code: 'ONLINE_DISABLED' });

  assert.deepEqual(requests, []);
});

test('API client sign-in requests stop too while online features are off', async () => {
  const client = new APIClient('http://localhost:3001');
  const originalRequest = axios.request;
  let requestCount = 0;
  axios.request = async () => {
    requestCount += 1;
    return { data: { success: true }, headers: {} };
  };

  try {
    await assert.rejects(client.login({ username: 'demo', password: 'secret' }), { code: 'ONLINE_DISABLED' });
    await assert.rejects(client.completePoeLogin({ code: 'abc' }), { code: 'ONLINE_DISABLED' });
  } finally {
    axios.request = originalRequest;
  }

  assert.equal(requestCount, 0);
});

test('API client reaches the server only while online features are on', async () => {
  const { client, requests } = createRecordingClient({ online: true });

  await client.healthCheck();
  client.setOnline(false);
  await assert.rejects(client.healthCheck(), { code: 'ONLINE_DISABLED' });
  client.setOnline(true);
  await client.getPublicFarmRuns();

  assert.deepEqual(requests, ['/health', '/api/farming-hub/runs']);
});
