const test = require('node:test');
const assert = require('node:assert/strict');

const PoeApiClient = require('../src/modules/poeApiClient');

function createClient({ characters = [], status = 200, retryAfter = '60' } = {}) {
  const client = new PoeApiClient();
  const requests = [];
  const posts = [];

  client.client = {
    defaults: client.client.defaults,
    async request(config) {
      requests.push(config);
      if (status !== 200) {
        const error = new Error(`HTTP ${status}`);
        error.response = { status, headers: { 'retry-after': retryAfter } };
        throw error;
      }
      return { data: { characters }, headers: {} };
    },
    async post(url, body) {
      posts.push({ url, body: new URLSearchParams(body) });
      return { data: { access_token: 'access', refresh_token: 'refresh', expires_in: 36000, scope: 'account:characters' } };
    }
  };
  client.lastRequestAt = 0;
  client._throttle = async () => {};

  return { client, requests, posts };
}

test('poe api client identifies itself the way GGG asks', () => {
  const client = new PoeApiClient();
  const userAgent = client.client.defaults.headers['User-Agent'];

  assert.match(userAgent, /^OAuth \S+\/\d+\.\d+\.\d+ \(contact: https:\/\/github\.com\/JuiceJournal\/JuiceJournal\) JuiceJournal$/);
  assert.ok(client.clientId);
  assert.ok(userAgent.includes(client.clientId));
});

test('poe api client builds a PKCE authorize URL for the loopback redirect', () => {
  const { client } = createClient();
  const url = new URL(client.buildAuthorizeUrl({
    redirectUri: 'http://127.0.0.1:34127/oauth/poe/callback',
    codeChallenge: 'challenge',
    state: 'state-1'
  }));

  assert.equal(url.origin + url.pathname, 'https://www.pathofexile.com/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), client.clientId);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'account:characters');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:34127/oauth/poe/callback');
  assert.equal(url.searchParams.get('code_challenge'), 'challenge');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), 'state-1');
});

test('poe api client exchanges the code itself and hands the tokens to the listener', async () => {
  const { client, posts } = createClient();
  const persisted = [];
  client.setTokenListener((tokens) => persisted.push(tokens));

  await client.exchangeCode({ code: 'code-1', codeVerifier: 'verifier', redirectUri: 'http://127.0.0.1:34127/oauth/poe/callback' });

  assert.equal(posts[0].url, 'https://www.pathofexile.com/oauth/token');
  assert.equal(posts[0].body.get('grant_type'), 'authorization_code');
  assert.equal(posts[0].body.get('client_id'), client.clientId);
  assert.equal(posts[0].body.get('code_verifier'), 'verifier');
  assert.equal(posts[0].body.has('client_secret'), false);
  assert.equal(client.isAuthenticated(), true);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].refreshToken, 'refresh');
  assert.ok(persisted[0].tokenExpiresAt > Date.now());
});

test('poe api client keeps the expiry of tokens restored from disk', () => {
  const client = new PoeApiClient();
  client.setTokens({ accessToken: 'a', refreshToken: 'r', tokenExpiresAt: Date.now() - 1000 });

  assert.equal(client.isTokenExpired(), true);
});

test('poe api client lists one realm and stays inside the character list budget', async () => {
  const { client, requests } = createClient({ characters: [{ id: 'c1', name: 'AltShaman', current: true }] });
  client.setTokens({ accessToken: 'a', refreshToken: 'r', expiresIn: 36000 });

  assert.deepEqual(await client.listCharacters('poe2'), [{ id: 'c1', name: 'AltShaman', current: true }]);
  await client.listCharacters('poe1');
  await assert.rejects(client.listCharacters('poe2'), { code: 'POE_RATE_LIMITED' });

  assert.deepEqual(requests.map((request) => request.url), ['/character/poe2', '/character']);

  // Two more after the 10 s window, then the 300 s window (4 kept for us) is full.
  client.characterListRequests = client.characterListRequests.map((at) => at - 11_000);
  await client.listCharacters('poe2');
  await client.listCharacters('poe2');
  client.characterListRequests = client.characterListRequests.map((at) => at - 11_000);
  await assert.rejects(client.listCharacters('poe2'), { code: 'POE_RATE_LIMITED' });
  assert.equal(requests.length, 4);
});

test('poe api client waits out a server rate limit before asking again', async () => {
  const { client, requests } = createClient({ status: 429, retryAfter: '300' });
  client.setTokens({ accessToken: 'a', refreshToken: 'r', expiresIn: 36000 });

  await assert.rejects(client.listCharacters('poe2'), { code: 'POE_RATE_LIMITED', retryAfter: 300 });
  client.characterListRequests = [];
  await assert.rejects(client.listCharacters('poe2'), { code: 'POE_RATE_LIMITED' });

  assert.equal(requests.length, 1);
});

test('poe api client ends an expired sign-in without a refresh token before calling GGG', async () => {
  const { client, requests } = createClient();
  const persisted = [];
  client.setTokenListener((tokens) => persisted.push(tokens.accessToken));
  client.setTokens({ accessToken: 'a', refreshToken: undefined, tokenExpiresAt: Date.now() - 1 });

  await assert.rejects(client.listCharacters('poe2'), { code: 'POE_AUTH_EXPIRED' });

  assert.equal(requests.length, 0);
  assert.equal(client.isAuthenticated(), false);
  assert.deepEqual(persisted, [null]);
});
