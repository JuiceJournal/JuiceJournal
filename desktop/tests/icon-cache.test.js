const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const { IconCache, normalizeIconUrl, getIconKey } = require('../src/modules/iconCache');

const CHAOS_URL = 'https://web.poecdn.com/gen/image/WzI1LDE0/d119a0d734/CurrencyRerollRare.png';
const DIVINE_URL = 'https://web.poecdn.com/gen/image/WzI1LDE0/e1a54ff97d/CurrencyModValues.png';
const EXALT_URL = 'https://web.poecdn.com/gen/image/WzI1LDE0/b102771c23/CurrencyAddModToRare.png';

function createTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jj-icon-cache-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'icon-cache');
}

function pngOf(size) {
  return Buffer.alloc(size, 1);
}

function createFetch(responses = {}) {
  const calls = [];
  const fetchIcon = async (url) => {
    calls.push(url);
    const response = responses[url];
    if (response instanceof Error) {
      throw response;
    }
    return response || { contentType: 'image/png', data: pngOf(100) };
  };
  return { fetchIcon, calls };
}

async function settle(cache) {
  while (cache.downloads.size > 0) {
    await Promise.all([...cache.downloads.values()]);
  }
}

test('icon cache only accepts https URLs on web.poecdn.com', () => {
  assert.equal(normalizeIconUrl(CHAOS_URL), CHAOS_URL);
  assert.equal(normalizeIconUrl(`${CHAOS_URL}#frag`), CHAOS_URL);

  for (const url of [
    'http://web.poecdn.com/gen/image/a.png',
    'https://web.poecdn.com.evil.example/a.png',
    'https://evil.example/web.poecdn.com/a.png',
    'https://cdn.web.poecdn.com/a.png',
    'https://user:pass@web.poecdn.com/a.png',
    'https://web.poecdn.com:8443/a.png',
    'file:///C:/Windows/win.ini',
    '/gen/image/a.png',
    `https://web.poecdn.com/${'a'.repeat(2100)}.png`,
    null,
    42
  ]) {
    assert.equal(normalizeIconUrl(url), null, String(url).slice(0, 80));
  }
});

test('icon cache never fetches URLs outside the allow-list', async (t) => {
  const { fetchIcon, calls } = createFetch();
  const cache = new IconCache({ dir: createTempDir(t), fetchIcon });

  assert.deepEqual(cache.resolveIconUrls(['https://evil.example/a.png', 'http://web.poecdn.com/a.png']), {});
  assert.equal(await cache.ensureIconUrl('https://evil.example/a.png'), null);
  assert.deepEqual(calls, []);
});

test('icon cache stores each icon under a SHA-256 of its URL', async (t) => {
  const dir = createTempDir(t);
  const { fetchIcon } = createFetch({
    [DIVINE_URL]: { contentType: 'image/webp; charset=binary', data: pngOf(50) }
  });
  const cache = new IconCache({ dir, fetchIcon });

  const chaosFile = await cache.ensureIconUrl(CHAOS_URL);
  const divineFile = await cache.ensureIconUrl(DIVINE_URL);

  const chaosKey = crypto.createHash('sha256').update(CHAOS_URL).digest('hex');
  assert.equal(getIconKey(CHAOS_URL), chaosKey);
  assert.equal(fileURLToPath(chaosFile), path.join(dir, `${chaosKey}.png`));
  assert.equal(fileURLToPath(divineFile), path.join(dir, `${getIconKey(DIVINE_URL)}.webp`));
  assert.deepEqual(fs.readdirSync(dir).sort(), [`${chaosKey}.png`, `${getIconKey(DIVINE_URL)}.webp`].sort());
});

test('icon cache lookups return at once and download each icon only once', async (t) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const cache = new IconCache({
    dir: createTempDir(t),
    fetchIcon: async (url) => {
      calls.push(url);
      await gate;
      return { contentType: 'image/png', data: pngOf(10) };
    }
  });

  assert.deepEqual(cache.resolveIconUrls([CHAOS_URL, CHAOS_URL]), {});
  const waiting = cache.ensureIconUrl(CHAOS_URL);
  assert.deepEqual(cache.resolveIconUrls([CHAOS_URL]), {});
  release();

  assert.match(await waiting, /^file:/);
  assert.deepEqual(calls, [CHAOS_URL]);
  assert.match(cache.resolveIconUrls([CHAOS_URL])[CHAOS_URL], /^file:/);
});

test('icon cache keeps serving cached icons when the network is gone', async (t) => {
  const dir = createTempDir(t);
  const online = new IconCache({ dir, fetchIcon: createFetch().fetchIcon });
  online.resolveIconUrls([CHAOS_URL, DIVINE_URL]);
  await settle(online);

  const { fetchIcon, calls } = createFetch({ [CHAOS_URL]: new Error('offline'), [DIVINE_URL]: new Error('offline') });
  const offline = new IconCache({ dir, fetchIcon });
  const resolved = offline.resolveIconUrls([CHAOS_URL, DIVINE_URL]);

  assert.deepEqual(Object.keys(resolved).sort(), [CHAOS_URL, DIVINE_URL].sort());
  assert.ok(fs.existsSync(fileURLToPath(resolved[CHAOS_URL])));
  assert.deepEqual(calls, []);
});

test('icon cache evicts the least recently used icons above the size cap', async (t) => {
  const dir = createTempDir(t);
  const cache = new IconCache({ dir, maxBytes: 250, fetchIcon: createFetch().fetchIcon });

  await cache.ensureIconUrl(CHAOS_URL);
  await cache.ensureIconUrl(DIVINE_URL);
  cache.getCachedIconUrl(CHAOS_URL);
  await cache.ensureIconUrl(EXALT_URL);

  assert.equal(cache.totalBytes, 200);
  assert.deepEqual(
    fs.readdirSync(dir).sort(),
    [`${getIconKey(CHAOS_URL)}.png`, `${getIconKey(EXALT_URL)}.png`].sort()
  );

  // After a restart, recency comes from file times: the icon used more recently survives a smaller cap.
  fs.utimesSync(path.join(dir, `${getIconKey(EXALT_URL)}.png`), new Date(1_000), new Date(1_000));
  fs.utimesSync(path.join(dir, `${getIconKey(CHAOS_URL)}.png`), new Date(2_000), new Date(2_000));
  const smaller = new IconCache({ dir, maxBytes: 150, fetchIcon: async () => new Promise(() => {}) });

  assert.match(smaller.getCachedIconUrl(CHAOS_URL), /^file:/);
  assert.equal(smaller.totalBytes, 100);
  assert.deepEqual(fs.readdirSync(dir), [`${getIconKey(CHAOS_URL)}.png`]);
});

test('icon cache falls back to no icon when a download fails and retries later', async (t) => {
  const dir = createTempDir(t);
  let now = 1_000_000;
  const { fetchIcon, calls } = createFetch({ [CHAOS_URL]: new Error('ECONNRESET') });
  const cache = new IconCache({ dir, fetchIcon, now: () => now });

  assert.equal(await cache.ensureIconUrl(CHAOS_URL), null);
  assert.deepEqual(cache.resolveIconUrls([CHAOS_URL]), {});
  assert.equal(await cache.ensureIconUrl(CHAOS_URL), null);
  assert.deepEqual(calls, [CHAOS_URL]);
  assert.deepEqual(fs.readdirSync(dir), []);

  now += 11 * 60 * 1000;
  assert.equal(await cache.ensureIconUrl(CHAOS_URL), null);
  assert.deepEqual(calls, [CHAOS_URL, CHAOS_URL]);
});

test('icon cache rejects responses that are not small images', async (t) => {
  const dir = createTempDir(t);
  const { fetchIcon } = createFetch({
    [CHAOS_URL]: { contentType: 'text/html', data: Buffer.from('<html>') },
    [DIVINE_URL]: { contentType: 'image/png', data: pngOf(2 * 1024 * 1024) },
    [EXALT_URL]: { contentType: 'image/svg+xml', data: Buffer.from('<svg/>') }
  });
  const cache = new IconCache({ dir, fetchIcon });

  assert.equal(await cache.ensureIconUrl(CHAOS_URL), null);
  assert.equal(await cache.ensureIconUrl(DIVINE_URL), null);
  assert.equal(await cache.ensureIconUrl(EXALT_URL), null);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('icon cache removes interrupted downloads and ignores foreign files', (t) => {
  const dir = createTempDir(t);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${getIconKey(CHAOS_URL)}.1a2b3c4d.tmp`), 'partial');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep');

  const cache = new IconCache({ dir, fetchIcon: async () => new Promise(() => {}) });
  cache.resolveIconUrls([CHAOS_URL]);

  assert.deepEqual(fs.readdirSync(dir), ['notes.txt']);
  assert.equal(cache.totalBytes, 0);
});
