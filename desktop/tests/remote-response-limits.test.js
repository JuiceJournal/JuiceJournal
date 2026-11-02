const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');

const APIClient = require('../src/modules/apiClient');
const PoeApiClient = require('../src/modules/poeApiClient');
const PriceService = require('../src/modules/priceService');

const MEGABYTE = 1024 * 1024;

async function startServer(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

// Sends a byte every few milliseconds, so the idle timeout never fires.
function drip(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.write('[');
  const timer = setInterval(() => res.write(' '), 20);
  res.on('close', () => clearInterval(timer));
}

// Keeps sending until the client hangs up, and reports how much that was.
function endlessBody(onClose) {
  return (req, res) => {
    const chunk = Buffer.alloc(64 * 1024, ' ');
    let sent = 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const send = () => {
      while (!res.destroyed && sent < 512 * MEGABYTE) {
        sent += chunk.length;
        if (!res.write(chunk)) {
          res.once('drain', send);
          return;
        }
      }
      res.end();
    };
    res.on('close', () => onClose(sent));
    send();
  };
}

async function withShortDeadline(t, ms, run) {
  const realTimeout = AbortSignal.timeout;
  const { mock } = t.mock.method(AbortSignal, 'timeout', () => realTimeout.call(AbortSignal, ms));
  try {
    return await run();
  } finally {
    mock.restore();
  }
}

test('a poe.ninja response that keeps dripping is cut off, and the sync queue moves on', async (t) => {
  const baseUrl = await startServer(t, drip);
  const service = new PriceService();
  const startedAt = Date.now();

  await withShortDeadline(t, 200, async () => {
    await assert.rejects(service.client.get(`${baseUrl}/slow`), /aborted|canceled/i);
  });
  assert.ok(Date.now() - startedAt < 5000);

  // Every request of a sync takes the deadline, so a queued sync is reached.
  t.mock.method(console, 'error', () => {});
  const realGet = service.client.get.bind(service.client);
  service.client.get = (url, options) => realGet(`${baseUrl}/slow`, options);
  await withShortDeadline(t, 50, async () => {
    const first = service.ensureSynced('Standard', 'poe2', { full: false });
    const second = service.ensureSynced('Standard', 'poe2', { full: false });
    await first;
    assert.equal((await second).league, 'Standard');
  });
});

test('the PoE API and online clients cut off a dripping response too', async (t) => {
  const baseUrl = await startServer(t, drip);

  await withShortDeadline(t, 200, async () => {
    const poe = new PoeApiClient();
    await assert.rejects(poe.client.get(`${baseUrl}/slow`), /aborted|canceled/i);

    const online = new APIClient(baseUrl, null, { online: true });
    await assert.rejects(online.healthCheck(), (error) => {
      assert.equal(error.code, 'REQUEST_TIMEOUT');
      return true;
    });

    await assert.rejects(online.requestWithSessionCookie({ method: 'get', url: '/slow' }), /aborted|canceled/i);
  });
});

test('a per-call timeout gets a deadline in proportion on the online client', async (t) => {
  const online = new APIClient('http://127.0.0.1:1', null, { online: true });
  const seen = [];
  const realTimeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    seen.push(ms);
    return realTimeout.call(AbortSignal, ms);
  });

  await online.takePoeStashSnapshot().catch(() => {});
  await online.healthCheck().catch(() => {});
  assert.deepEqual(seen, [480000, 40000]);
});

test('response bodies stop at the size cap instead of filling memory', { timeout: 30000 }, async (t) => {
  const sent = [];
  const baseUrl = await startServer(t, endlessBody((bytes) => sent.push(bytes)));

  const service = new PriceService();
  await assert.rejects(service.client.get(`${baseUrl}/big`), /maxContentLength/);

  const online = new APIClient(baseUrl, null, { online: true });
  await assert.rejects(online.healthCheck(), (error) => {
    assert.equal(error.code, 'UNEXPECTED_ERROR');
    return true;
  });
  await assert.rejects(online.requestWithSessionCookie({ method: 'get', url: '/big' }), /maxContentLength/);

  const poe = new PoeApiClient();
  await assert.rejects(poe.client.get(`${baseUrl}/big`), /maxContentLength/);

  while (sent.length < 4) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  // Sockets buffer some on top, but far less than the 512 MB on offer.
  assert.ok(Math.max(...sent) < 128 * MEGABYTE, `sent ${Math.max(...sent)} bytes`);
});

test('poe.ninja redirects cannot leave poe.ninja', async (t) => {
  let targetHits = 0;
  const target = await startServer(t, (req, res) => {
    targetHits += 1;
    res.end('{}');
  });
  const redirector = await startServer(t, (req, res) => {
    res.writeHead(302, { Location: `${target}/internal` });
    res.end();
  });

  const service = new PriceService();
  await assert.rejects(service.client.get(`${redirector}/start`), /redirected to another host/);
  assert.equal(targetHits, 0);

  const { beforeRedirect } = service.client.defaults;
  assert.doesNotThrow(() => beforeRedirect({ protocol: 'https:', hostname: 'poe.ninja' }));
  assert.throws(() => beforeRedirect({ protocol: 'http:', hostname: 'poe.ninja' }));
  assert.throws(() => beforeRedirect({ protocol: 'https:', hostname: 'poe.ninja.evil.example' }));
});

test('the session cookie does not follow a server address change over the wire', async (t) => {
  const cookies = [];
  const handler = (req, res) => {
    cookies.push(req.headers.cookie || null);
    res.setHeader('Content-Type', 'application/json');
    res.end('{"success":true,"data":{}}');
  };
  const original = await startServer(t, handler);
  const other = await startServer(t, handler);

  const client = new APIClient(original, 'juice_journal_auth=PROBEVALUE', { online: true });
  await client.getMe();
  client.setBaseURL(other);
  await client.getMe();

  assert.deepEqual(cookies, ['juice_journal_auth=PROBEVALUE', null]);
});
