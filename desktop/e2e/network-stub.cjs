// Test-only. The e2e bootstrap scripts load this into the Electron main process before the app starts. It plays
// the browser, pathofexile.com and poe.ninja, so specs never leave the machine.
// JUICE_JOURNAL_E2E_POE_ACCOUNT holds the account: { sub, username, characters: { poe1: [], poe2: [] } }.
// JUICE_JOURNAL_E2E_PRICES holds poe.ninja chaos values by item name; every league is "Standard".
const http = require('http');
const path = require('path');
const { shell } = require('electron');

const axios = require(require.resolve('axios', { paths: [path.join(__dirname, '..')] }));
const account = JSON.parse(process.env.JUICE_JOURNAL_E2E_POE_ACCOUNT || '{}');
const prices = JSON.parse(process.env.JUICE_JOURNAL_E2E_PRICES || '{}');

// The "browser" approves at once and calls the app's loopback redirect.
shell.openExternal = async (authUrl) => {
  const url = new URL(authUrl);
  const callback = new URL(url.searchParams.get('redirect_uri'));
  callback.searchParams.set('code', 'e2e-code');
  callback.searchParams.set('state', url.searchParams.get('state'));
  http.get(callback, (response) => response.resume()).on('error', (error) => {
    console.error('e2e network stub could not reach the sign-in callback', error);
  });
};

function poeNinjaResponse(url, params = {}) {
  if (url.endsWith('/data/index-state')) {
    return { economyLeagues: [{ name: 'Standard', displayName: 'Standard', url: 'standard' }], oldEconomyLeagues: [] };
  }
  if (url.includes('/economy/exchange/') && params.type === 'Currency') {
    const names = Object.keys(prices);
    return {
      core: { primary: 'chaos', rates: {} },
      items: names.map((name, index) => ({ id: `e2e-${index}`, name })),
      lines: names.map((name, index) => ({ id: `e2e-${index}`, primaryValue: prices[name] }))
    };
  }
  return { lines: [], items: [] };
}

const createClient = axios.create.bind(axios);
axios.create = (config = {}) => {
  const client = createClient(config);
  const get = client.get.bind(client);
  client.get = async (url, options = {}) => (
    String(url).startsWith('https://poe.ninja/')
      ? { data: poeNinjaResponse(url, options.params), headers: {} }
      : get(url, options)
  );

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
  client.request = async ({ url }) => {
    if (url !== '/character' && url !== '/character/poe2') {
      throw new Error(`Unexpected GGG request in e2e: ${url}`);
    }
    return {
      data: { characters: account.characters?.[url === '/character/poe2' ? 'poe2' : 'poe1'] || [] },
      headers: {}
    };
  };
  return client;
};
