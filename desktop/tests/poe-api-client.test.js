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
      return {
        data: {
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 36000,
          scope: 'account:characters',
          sub: 'account-uuid',
          username: 'Exile#1234'
        }
      };
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

  const account = await client.exchangeCode({ code: 'code-1', codeVerifier: 'verifier', redirectUri: 'http://127.0.0.1:34127/oauth/poe/callback' });

  assert.deepEqual(account, { scope: 'account:characters', sub: 'account-uuid', username: 'Exile#1234' });

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

test('poe api client makes no stash request when the sign-in lacks account:stashes', async () => {
  const { client, requests } = createClient();
  const persisted = [];
  client.setTokenListener((tokens) => persisted.push(tokens));
  await client.exchangeCode({ code: 'code-1', codeVerifier: 'verifier', redirectUri: 'http://127.0.0.1:34127/oauth/poe/callback' });

  await assert.rejects(client.listStashTabs('Mirage'), { code: 'POE_SCOPE_MISSING' });
  await assert.rejects(client.getStashItems('Mirage', 'tab-1'), { code: 'POE_SCOPE_MISSING' });

  assert.equal(requests.length, 0);
  assert.equal(client.isAuthenticated(), true);
  assert.equal(client.hasScope('account:stashes'), false);
  assert.equal(persisted[0].scope, 'account:characters');
});

test('poe api client keeps the granted scope of tokens restored from disk', async () => {
  const { client, requests } = createClient();
  client.setTokens({ accessToken: 'a', tokenExpiresAt: Date.now() + 60_000, scope: 'account:characters account:stashes' });

  await client.listStashTabs('Mirage');
  assert.deepEqual(requests.map((request) => request.url), ['/stash/Mirage']);

  // A token refresh keeps the scope. Tokens saved before the scope was recorded came from the built-in
  // sign-in, which never asked for stashes.
  client.setTokens({ accessToken: 'b', tokenExpiresAt: Date.now() + 60_000 });
  assert.equal(client.hasScope('account:stashes'), true);
  client.clearTokens();
  client.setTokens({ accessToken: 'c', tokenExpiresAt: Date.now() + 60_000 });
  assert.equal(client.hasScope('account:stashes'), false);
});

test('poe api client ends the sign-in when GGG rejects the token with 401', async () => {
  const { client } = createClient({ status: 401 });
  const persisted = [];
  client.setTokenListener((tokens) => persisted.push(tokens.accessToken));
  client.setTokens({ accessToken: 'a', tokenExpiresAt: Date.now() + 60_000 });

  await assert.rejects(client.listCharacters('poe1'), { code: 'POE_AUTH_EXPIRED' });

  assert.equal(client.isAuthenticated(), false);
  assert.deepEqual(persisted, [null]);
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

const STASH_SCOPE = 'account:characters account:stashes';

function tokenEndpointError(status) {
  const error = new Error(status ? `HTTP ${status}` : 'connect ECONNRESET');
  if (status) {
    error.response = { status, headers: {} };
  }
  return error;
}

// A client whose token endpoint and API answer from scripted lists: an Error is thrown, anything else is returned.
function createScriptedClient({ tokenReplies = [], apiReplies = [] } = {}) {
  const { client, requests, posts } = createClient();
  const persisted = [];
  client.setTokenListener((tokens) => persisted.push(tokens.accessToken));

  client.client.post = async (url, body) => {
    posts.push({ url, body: new URLSearchParams(body) });
    // One macrotask, so a second caller really does arrive while this refresh is still in flight.
    await new Promise((resolve) => setImmediate(resolve));
    const reply = tokenReplies.length > 0 ? tokenReplies.shift() : null;
    if (reply instanceof Error) {
      throw reply;
    }
    return { data: reply || { access_token: 'access', refresh_token: 'refresh-2', expires_in: 36000 } };
  };
  client.client.request = async (config) => {
    requests.push(config);
    const reply = apiReplies.length > 0 ? apiReplies.shift() : null;
    if (reply instanceof Error) {
      throw reply;
    }
    return { data: reply || { stashes: [] }, headers: {} };
  };

  return { client, requests, posts, persisted };
}

test('poe api client counts an expired sign-in as ended unless a refresh token renews it', () => {
  const { client } = createClient();

  assert.equal(client.isAuthenticated(), false);
  assert.equal(client.canRenew(), false);

  client.setTokens({ accessToken: 'a', tokenExpiresAt: Date.now() + 60_000 });
  assert.equal(client.isAuthenticated(), true);
  assert.equal(client.canRenew(), false);

  client.setTokens({ accessToken: 'a', tokenExpiresAt: Date.now() - 1000 });
  assert.equal(client.isAuthenticated(), false);
  assert.equal(client.canRenew(), false);

  client.setTokens({ accessToken: 'a', refreshToken: 'r', tokenExpiresAt: Date.now() - 1000 });
  assert.equal(client.isAuthenticated(), true);
  assert.equal(client.canRenew(), true);
});

test('poe api client refreshes once when two calls find the token expired at the same time', async () => {
  const { client, requests, posts, persisted } = createScriptedClient();
  client.setTokens({ accessToken: 'old', refreshToken: 'refresh-1', tokenExpiresAt: Date.now() - 1000, scope: STASH_SCOPE });

  await Promise.all([client.listStashTabs('Mirage'), client.listStashTabs('Mirage')]);

  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.get('grant_type'), 'refresh_token');
  assert.equal(posts[0].body.get('refresh_token'), 'refresh-1');
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map((request) => request.headers.Authorization), ['Bearer access', 'Bearer access']);
  assert.deepEqual(persisted, ['access']);
  assert.equal(client.getTokens().refreshToken, 'refresh-2');
  assert.equal(client.refreshInFlight, null);
});

test('a refresh answered after a sign-out or a new sign-in changes nothing', async () => {
  const signedOut = createScriptedClient();
  signedOut.client.setTokens({ accessToken: 'old', refreshToken: 'refresh-1', tokenExpiresAt: Date.now() - 1000 });
  const pending = signedOut.client.refreshAccessToken();
  signedOut.client.clearTokens();
  await pending;
  assert.equal(signedOut.client.getTokens().accessToken, null, 'the answer does not bring the old sign-in back');
  assert.deepEqual(signedOut.persisted, []);

  const refused = Object.assign(new Error('Request failed with status code 400'), { response: { status: 400 } });
  const replaced = createScriptedClient({ tokenReplies: [refused] });
  replaced.client.setTokens({ accessToken: 'old', refreshToken: 'refresh-1', tokenExpiresAt: Date.now() - 1000 });
  const refusedLater = replaced.client.refreshAccessToken();
  replaced.client.setTokens({ accessToken: 'new', refreshToken: 'refresh-new', expiresIn: 36000 });
  await assert.rejects(refusedLater);
  assert.equal(replaced.client.getTokens().accessToken, 'new', 'a refusal of the old token leaves the new sign-in alone');
  assert.deepEqual(replaced.persisted, []);
});

test('poe api client lets a later refresh start once the one under way has finished', async () => {
  const { client, posts } = createScriptedClient();
  client.setTokens({ accessToken: 'old', refreshToken: 'refresh-1', tokenExpiresAt: Date.now() - 1000 });

  await client.refreshAccessToken();
  await client.refreshAccessToken();

  assert.deepEqual(posts.map((post) => post.body.get('refresh_token')), ['refresh-1', 'refresh-2']);
});

test('poe api client ends the sign-in when GGG refuses the refresh token with 400 or 401', async () => {
  for (const status of [400, 401]) {
    const { client, requests, persisted } = createScriptedClient({ tokenReplies: [tokenEndpointError(status)] });
    client.setTokens({ accessToken: 'old', refreshToken: 'refresh-1', tokenExpiresAt: Date.now() - 1000 });

    await assert.rejects(client.refreshAccessToken(), { code: 'POE_AUTH_EXPIRED' }, `status ${status}`);

    assert.equal(client.isAuthenticated(), false, `status ${status}`);
    assert.equal(client.canRenew(), false, `status ${status}`);
    assert.deepEqual(persisted, [null], `status ${status}`);
    assert.equal(requests.length, 0, `status ${status}`);
    assert.equal(client.refreshInFlight, null, `status ${status}`);
  }
});

test('poe api client keeps the sign-in when the refresh fails on the network or with a server error', async () => {
  for (const failure of [tokenEndpointError(null), tokenEndpointError(503)]) {
    const { client, persisted } = createScriptedClient({ tokenReplies: [failure] });
    client.setTokens({ accessToken: 'old', refreshToken: 'refresh-1', tokenExpiresAt: Date.now() - 1000 });

    await assert.rejects(client.refreshAccessToken(), (error) => error === failure && error.code !== 'POE_AUTH_EXPIRED');

    assert.equal(client.getTokens().accessToken, 'old');
    assert.equal(client.getTokens().refreshToken, 'refresh-1');
    assert.equal(client.canRenew(), true);
    assert.deepEqual(persisted, []);
    assert.equal(client.refreshInFlight, null);
  }
});

test('poe api client keeps a refresh or a sign-in that worked when the token listener throws', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const { client } = createScriptedClient();
  client.setTokenListener(() => {
    throw new Error('config.json is locked');
  });

  client.setTokens({ accessToken: 'old', refreshToken: 'refresh-1', tokenExpiresAt: Date.now() - 1000 });
  const tokens = await client.refreshAccessToken();

  assert.equal(tokens.accessToken, 'access');
  assert.equal(client.getTokens().accessToken, 'access');
  assert.equal(client.isAuthenticated(), true);

  client.clearTokens();
  await client.exchangeCode({ code: 'code-1', codeVerifier: 'verifier', redirectUri: 'http://127.0.0.1:34127/oauth/poe/callback' });

  assert.equal(client.getTokens().accessToken, 'access');
  assert.equal(client.isAuthenticated(), true);
  assert.equal(warn.mock.callCount(), 2);
});

test('poe api client refreshes once and retries once when GGG answers 401 and a refresh token exists', async () => {
  const { client, requests, posts, persisted } = createScriptedClient({ apiReplies: [tokenEndpointError(401)] });
  client.setTokens({ accessToken: 'old', refreshToken: 'refresh-1', tokenExpiresAt: Date.now() + 60_000, scope: STASH_SCOPE });

  await client.listStashTabs('Mirage');

  assert.equal(requests.length, 2);
  assert.equal(posts.length, 1);
  assert.deepEqual(requests.map((request) => request.headers.Authorization), ['Bearer old', 'Bearer access']);
  assert.deepEqual(persisted, ['access']);
  assert.equal(client.isAuthenticated(), true);
});

test('poe api client ends the sign-in when the retry after a refresh is also answered with 401', async () => {
  const { client, requests, posts, persisted } = createScriptedClient({ apiReplies: [tokenEndpointError(401), tokenEndpointError(401)] });
  client.setTokens({ accessToken: 'old', refreshToken: 'refresh-1', tokenExpiresAt: Date.now() + 60_000, scope: STASH_SCOPE });

  await assert.rejects(client.listStashTabs('Mirage'), { code: 'POE_AUTH_EXPIRED' });

  assert.equal(requests.length, 2);
  assert.equal(posts.length, 1);
  assert.equal(client.isAuthenticated(), false);
  assert.deepEqual(persisted, ['access', null]);
});

test('poe api client ends the sign-in at once on 401 when there is no refresh token', async () => {
  const { client, requests, posts, persisted } = createScriptedClient({ apiReplies: [tokenEndpointError(401)] });
  client.setTokens({ accessToken: 'old', tokenExpiresAt: Date.now() + 60_000, scope: STASH_SCOPE });

  await assert.rejects(client.listStashTabs('Mirage'), { code: 'POE_AUTH_EXPIRED' });

  assert.equal(requests.length, 1);
  assert.equal(posts.length, 0);
  assert.equal(client.isAuthenticated(), false);
  assert.deepEqual(persisted, [null]);
});
