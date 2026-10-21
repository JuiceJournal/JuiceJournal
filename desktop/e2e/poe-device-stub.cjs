// Test-only. The e2e bootstrap scripts load this into the Electron main process before the app starts. It plays
// the browser and pathofexile.com for the device sign-in, so specs sign in without leaving the machine.
// JUICE_JOURNAL_E2E_POE_ACCOUNT holds the account: { sub, username, characters: { poe1: [], poe2: [] } }.
const http = require('http');
const path = require('path');
const { shell } = require('electron');

const axios = require(require.resolve('axios', { paths: [path.join(__dirname, '..')] }));
const account = JSON.parse(process.env.JUICE_JOURNAL_E2E_POE_ACCOUNT || '{}');

// The "browser" approves at once and calls the app's loopback redirect.
shell.openExternal = async (authUrl) => {
  const url = new URL(authUrl);
  const callback = new URL(url.searchParams.get('redirect_uri'));
  callback.searchParams.set('code', 'e2e-code');
  callback.searchParams.set('state', url.searchParams.get('state'));
  http.get(callback, (response) => response.resume());
};

const createClient = axios.create.bind(axios);
axios.create = (config = {}) => {
  const client = createClient(config);
  if (config.baseURL !== 'https://api.pathofexile.com') {
    return client;
  }

  client.post = async (url) => {
    if (url !== 'https://www.pathofexile.com/oauth/token') {
      throw new Error(`Unexpected GGG request in e2e: POST ${url}`);
    }
    return {
      data: {
        access_token: 'e2e-access-token',
        expires_in: 36000,
        token_type: 'bearer',
        scope: 'account:characters',
        sub: account.sub,
        username: account.username
      }
    };
  };
  client.request = async ({ url }) => ({
    data: { characters: account.characters?.[url === '/character/poe2' ? 'poe2' : 'poe1'] || [] },
    headers: {}
  });
  return client;
};
