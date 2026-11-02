const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const APIClient = require('../src/modules/apiClient');
const PoeApiClient = require('../src/modules/poeApiClient');

function startServer(handler) {
  return new Promise((resolve) => {
    const received = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        received.push({ url: req.url, method: req.method, body, cookie: req.headers.cookie });
        handler(req, res);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, received, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function json(res, value) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}

test('a redirect to another address gets neither the password nor the session cookie', async (t) => {
  const elsewhere = await startServer((req, res) => json(res, { success: true, data: {} }));
  const origin = await startServer((req, res) => {
    res.writeHead(307, { Location: `${elsewhere.url}${req.url}` });
    res.end();
  });
  t.after(() => { elsewhere.server.close(); origin.server.close(); });

  const client = new APIClient(origin.url, 'juice_journal_auth=secret', { online: true });

  await assert.rejects(client.login({ email: 'a@example.test', password: 'hunter2' }));
  await assert.rejects(client.client.get('/api/any'));

  assert.equal(origin.received.length, 2);
  assert.deepEqual(elsewhere.received, []);
});

test('a redirect on the same address still works', async (t) => {
  const origin = await startServer((req, res) => {
    if (req.url === '/api/moved') {
      res.writeHead(307, { Location: '/api/here' });
      res.end();
      return;
    }
    json(res, { success: true, data: { path: req.url } });
  });
  t.after(() => origin.server.close());

  const client = new APIClient(origin.url, null, { online: true });
  const reply = await client.client.get('/api/moved');

  assert.equal(reply.data.path, '/api/here');
});

test('a redirect check follows a changed server address', async (t) => {
  const moved = await startServer((req, res) => {
    if (req.url === '/api/moved') {
      res.writeHead(307, { Location: '/api/here' });
      res.end();
      return;
    }
    json(res, { success: true, data: {} });
  });
  t.after(() => moved.server.close());

  const client = new APIClient('http://localhost:3001', null, { online: true });
  client.setBaseURL(moved.url);

  await client.client.get('/api/moved');
  assert.equal(moved.received.length, 2);
});

// With a proxy in the environment axios sends an https request to an http proxy in plain text, instead of tunnelling.
test('credentials never go through a proxy from the environment', async (t) => {
  const proxy = await startServer((req, res) => json(res, { success: true, data: {} }));
  const origin = await startServer((req, res) => json(res, { success: true, data: {} }));
  const saved = { HTTP_PROXY: process.env.HTTP_PROXY, HTTPS_PROXY: process.env.HTTPS_PROXY, NO_PROXY: process.env.NO_PROXY };
  process.env.HTTP_PROXY = proxy.url;
  process.env.HTTPS_PROXY = proxy.url;
  delete process.env.NO_PROXY;
  t.after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    proxy.server.close();
    origin.server.close();
  });

  const client = new APIClient(origin.url, 'juice_journal_auth=secret', { online: true });
  await client.client.get('/api/any');
  await client.login({ email: 'a@example.test', password: 'hunter2' }).catch(() => {});

  assert.deepEqual(proxy.received, []);
  assert.equal(origin.received.length, 2);
  assert.equal(new PoeApiClient().client.defaults.proxy, false);
});
