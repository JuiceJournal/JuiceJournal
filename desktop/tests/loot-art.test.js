const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const desktopDir = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(desktopDir, 'src', 'app.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(desktopDir, 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(desktopDir, 'preload.js'), 'utf8');

function extractFunctionSource(source, functionName) {
  const asyncStart = source.indexOf(`async function ${functionName}(`);
  const start = asyncStart !== -1 ? asyncStart : source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `Expected ${functionName}() to exist`);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return assert.fail(`Could not find the end of ${functionName}()`);
}

// One-line constants, so the tests run the real declarations.
// A top-level const, or a let that a function changes.
function extractConstSource(source, name) {
  const constStart = source.indexOf(`const ${name} = `);
  const start = constStart !== -1 ? constStart : source.indexOf(`let ${name} = `);
  assert.notEqual(start, -1, `Expected ${name} to exist`);
  return source.slice(start, source.indexOf(';', start) + 1);
}

function load(source, functionNames, constNames, contextOverrides) {
  const context = vm.createContext({ console, ...contextOverrides });
  for (const name of constNames) {
    vm.runInContext(extractConstSource(source, name), context);
  }
  for (const name of functionNames) {
    vm.runInContext(`${extractFunctionSource(source, name)};\nthis.${name} = ${name};`, context);
  }
  return context;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const CDN = 'https://web.poecdn.com/gen/image/';

// ---- main: getItemIcons ----

function loadMain({ priceService, snapshots = {} }) {
  const calls = { newestLeague: [], load: [] };
  const context = load(mainSource, ['loadItemIconIndex', 'dropItemIconIndex', 'getItemIcons'], ['ITEM_ICON_MAX_NAMES', 'ITEM_ICON_MAX_NAME_LENGTH', 'itemIconIndexes'], {
    priceService,
    priceSnapshots: {
      newestLeague: async (poeVersion) => { calls.newestLeague.push(poeVersion); return snapshots[poeVersion] ? 'Mirage' : null; },
      load: async (poeVersion, league) => { calls.load.push([poeVersion, league]); return snapshots[poeVersion] || null; }
    }
  });
  return { context, calls };
}

const entry = (name, icon) => ({ name, chaosValue: 1, icon });

test('getItemIcons answers the art of the loaded list for the names it knows, case-insensitively', async () => {
  const prices = { 'divine orb': { icon: `${CDN}divine.png` }, 'chaos orb': { icon: `${CDN}chaos.png` } };
  const { context, calls } = loadMain({
    priceService: { poeVersion: 'poe1', getPriceInfo: (name) => prices[name.toLowerCase().trim()] || null }
  });

  const icons = plain(await context.getItemIcons(['Divine Orb', 'CHAOS ORB'], 'poe1'));

  assert.deepEqual(icons, { 'Divine Orb': `${CDN}divine.png`, 'CHAOS ORB': `${CDN}chaos.png` });
  assert.deepEqual(calls.newestLeague, [], 'the loaded list needs no kept file');
});

test('getItemIcons looks in the kept list for names the loaded list lacks, as while it is still loading', async () => {
  const { context, calls } = loadMain({
    priceService: { poeVersion: 'poe2', getPriceInfo: (name) => (name === 'Divine Orb' ? { icon: `${CDN}divine.png` } : null) },
    snapshots: { poe2: { entries: [entry('Omen of Light', `${CDN}omen.png`)] } }
  });

  const icons = plain(await context.getItemIcons(['Divine Orb', 'Omen of Light', 'Unknown Thing'], 'poe2'));

  assert.deepEqual(icons, { 'Divine Orb': `${CDN}divine.png`, 'Omen of Light': `${CDN}omen.png` });
  assert.deepEqual(calls.newestLeague, ['poe2'], 'the kept list is read once for the call');
});

test('getItemIcons drops art that is not an https URL', async () => {
  const prices = {
    a: { icon: `${CDN}a.png` },
    b: { icon: 'http://web.poecdn.com/b.png' },
    c: { icon: 'javascript:alert(1)' },
    d: { icon: null },
    e: { icon: 42 }
  };
  const { context } = loadMain({
    priceService: { poeVersion: 'poe1', getPriceInfo: (name) => prices[name] || null }
  });

  assert.deepEqual(plain(await context.getItemIcons(['a', 'b', 'c', 'd', 'e'], 'poe1')), { a: `${CDN}a.png` });
});

test('getItemIcons reads the newest kept list of a game the price service does not hold, never the other game\'s list', async () => {
  const { context, calls } = loadMain({
    priceService: { poeVersion: 'poe1', getPriceInfo: () => ({ icon: `${CDN}poe1-art.png` }) },
    snapshots: {
      poe2: { entries: [entry('Divine Orb', `${CDN}poe2-divine.png`), entry('Http Thing', 'http://example.test/x.png')] }
    }
  });

  const icons = plain(await context.getItemIcons(['divine orb', 'Http Thing', 'Nothing'], 'poe2'));

  assert.deepEqual(icons, { 'divine orb': `${CDN}poe2-divine.png` });
  assert.deepEqual(calls.load, [['poe2', 'Mirage']]);
});

test('getItemIcons answers nothing for a game with no loaded or kept list', async () => {
  const { context } = loadMain({ priceService: null });
  assert.deepEqual(plain(await context.getItemIcons(['Divine Orb'], 'poe1')), {});
});

test('getItemIcons builds the kept-list index once and builds it again after a new snapshot', async () => {
  const { context, calls } = loadMain({
    priceService: { poeVersion: 'poe1', getPriceInfo: () => null },
    snapshots: { poe2: { entries: [entry('Divine Orb', `${CDN}poe2-divine.png`)] } }
  });

  await context.getItemIcons(['Divine Orb'], 'poe2');
  await context.getItemIcons(['Divine Orb'], 'poe2');
  assert.equal(calls.load.length, 1);

  context.dropItemIconIndex('poe1');
  await context.getItemIcons(['Divine Orb'], 'poe2');
  assert.equal(calls.load.length, 1, 'a new list of the other game leaves this index alone');

  context.dropItemIconIndex('poe2');
  await context.getItemIcons(['Divine Orb'], 'poe2');
  assert.equal(calls.load.length, 2);
});

test('getItemIcons ignores a bad game, a non-array, and names that are not usable strings', async () => {
  const seen = [];
  const { context } = loadMain({
    priceService: { poeVersion: 'poe1', getPriceInfo: (name) => { seen.push(name); return { icon: `${CDN}x.png` }; } }
  });

  assert.deepEqual(plain(await context.getItemIcons(['Divine Orb'], 'poe3')), {});
  assert.deepEqual(plain(await context.getItemIcons(['Divine Orb'], undefined)), {});
  assert.deepEqual(plain(await context.getItemIcons('Divine Orb', 'poe1')), {});
  assert.deepEqual(plain(await context.getItemIcons(null, 'poe1')), {});
  assert.deepEqual(seen, []);

  const long = 'x'.repeat(201);
  const icons = plain(await context.getItemIcons(['Good', '', '   ', 7, null, { name: 'obj' }, long], 'poe1'));
  assert.deepEqual(Object.keys(icons), ['Good']);
});

test('getItemIcons reads at most 200 names', async () => {
  const seen = [];
  const { context } = loadMain({
    priceService: { poeVersion: 'poe1', getPriceInfo: (name) => { seen.push(name); return null; } }
  });
  const names = Array.from({ length: 250 }, (_, index) => `Item ${index}`);

  await context.getItemIcons(names, 'poe1');

  assert.equal(seen.length, 200);
  assert.equal(seen.at(-1), 'Item 199');
});

test('get-item-icons is a main-window handler, preload exposes it, and a new kept list drops the index', () => {
  assert.match(mainSource, /ipcMain\.handle\('get-item-icons', \(event, names, poeVersion\) => getItemIcons\(names, poeVersion\)\)/);
  const scopes = mainSource.slice(mainSource.indexOf('const IPC_RENDERER_SCOPES'), mainSource.indexOf('let validatedIpcHandleInstalled'));
  assert.doesNotMatch(scopes, /get-item-icons/);
  assert.match(preloadSource, /getItemIcons: \(names, poeVersion\) => ipcRenderer\.invoke\('get-item-icons', names, poeVersion\)/);
  assert.match(
    mainSource,
    /priceService\.onSynced = \(snapshot\) => priceSnapshots\.save\(snapshot\)\.then\(\(\) => dropItemIconIndex\(snapshot\.poeVersion\)\)/
  );
});

// ---- renderer: the art lookup ----

function loadRenderer({ getItemIcons } = {}) {
  const electronAPI = getItemIcons ? { getItemIcons } : {};
  return load(
    appSource,
    ['lootArtKey', 'lootArtUrl', 'ensureLootArt', 'ensureLootArtForRows', 'clearLootArtMisses'],
    ['lootArtCache', 'lootArtAsking', 'LOOT_ART_ASK_SIZE', 'lootArtGeneration'],
    {
      window: { electronAPI },
      getLocalItemIconPath: (name) => (String(name).toLowerCase() === 'divine orb' ? 'assets/currency/poe1/divine.png' : '')
    }
  );
}

test('applyCachedItemIcons shows art found in the icon cache at once on the next draw, and asks main only for the rest', async () => {
  const asked = [];
  const context = load(appSource, ['applyCachedItemIcons'], ['cachedItemIconSources'], {
    window: {
      electronAPI: {
        resolveCachedIcons: async (urls) => {
          asked.push([...urls]);
          return Object.fromEntries(urls.filter((url) => url.includes('cached')).map((url) => [url, `file:///cache/${url.split('/').pop()}`]));
        }
      }
    },
    normalizeSafeImageSrc: (src) => src
  });
  const draw = () => {
    const images = ['cached-a.png', 'remote-b.png'].map((file) => ({ dataset: { iconUrl: `${CDN}${file}` }, src: '' }));
    return { images, container: { querySelectorAll: () => images } };
  };

  const first = draw();
  await context.applyCachedItemIcons(first.container);
  assert.deepEqual(first.images.map((img) => img.src), ['file:///cache/cached-a.png', `${CDN}remote-b.png`]);

  // A redraw: the cached art is there before main answers, and only the remote art is asked for again.
  const second = draw();
  const pending = context.applyCachedItemIcons(second.container);
  assert.equal(second.images[0].src, 'file:///cache/cached-a.png');
  await pending;
  assert.deepEqual(asked, [[`${CDN}cached-a.png`, `${CDN}remote-b.png`], [`${CDN}remote-b.png`]]);
});

test('lootArtUrl prefers the stored art, then what main looked up, then nothing', async () => {
  const context = loadRenderer({ getItemIcons: async () => ({ 'Ambush Scarab': `${CDN}scarab.png` }) });

  assert.equal(context.lootArtUrl({ itemName: 'Ambush Scarab', icon: `${CDN}stored.png` }, 'poe1'), `${CDN}stored.png`);
  assert.equal(context.lootArtUrl({ itemName: 'Ambush Scarab' }, 'poe1'), '');

  await context.ensureLootArt(['Ambush Scarab'], 'poe1');
  assert.equal(context.lootArtUrl({ itemName: 'Ambush Scarab' }, 'poe1'), `${CDN}scarab.png`);
  assert.equal(context.lootArtUrl({ itemName: '  ambush scarab ' }, 'poe1'), `${CDN}scarab.png`);
  assert.equal(context.lootArtUrl({ itemName: 'Ambush Scarab' }, 'poe2'), '', 'art is never shared across games');
  assert.equal(context.lootArtUrl({ itemName: 'Ambush Scarab', icon: `${CDN}stored.png` }, 'poe1'), `${CDN}stored.png`);
});

test('ensureLootArt asks only for names without bundled art or an answer, and caches misses', async () => {
  const asked = [];
  const context = loadRenderer({
    getItemIcons: async (names, poeVersion) => {
      asked.push([plain(names), poeVersion]);
      return { 'Ambush Scarab': `${CDN}scarab.png` };
    }
  });

  await context.ensureLootArt(['Divine Orb', 'Ambush Scarab', 'Odd Thing', 'ambush scarab', '', '  '], 'poe1');
  assert.deepEqual(asked, [[['Ambush Scarab', 'Odd Thing'], 'poe1']]);

  await context.ensureLootArt(['Ambush Scarab', 'Odd Thing', 'Divine Orb'], 'poe1');
  assert.equal(asked.length, 1, 'hits and misses are not asked again');
  assert.equal(context.lootArtUrl({ itemName: 'Odd Thing' }, 'poe1'), '');

  await context.ensureLootArt(['Odd Thing'], 'poe2');
  assert.equal(asked.length, 2, 'another game is another answer');
  assert.equal(asked[1][1], 'poe2');
});

test('ensureLootArt does not repeat an ask that is still running, and every view waiting on it redraws', async () => {
  const asked = [];
  let answer;
  const context = loadRenderer({
    getItemIcons: (names) => new Promise((resolve) => { asked.push(plain(names)); answer = () => resolve({ 'Ambush Scarab': `${CDN}scarab.png` }); })
  });
  const redraws = [];

  // Map Result History asks first; Recent Loot shows the same item while the answer is on its way.
  const first = context.ensureLootArt(['Ambush Scarab'], 'poe1', () => redraws.push('history'));
  const second = context.ensureLootArt(['Ambush Scarab', 'Divine Orb'], 'poe1', () => redraws.push('recent'));
  await new Promise((resolve) => setImmediate(resolve));
  answer();
  await Promise.all([first, second]);

  assert.deepEqual(asked, [['Ambush Scarab']]);
  assert.deepEqual(redraws.sort(), ['history', 'recent']);
});

test('a price update during an ask keeps that ask\'s art but not its misses, and the next draw asks again', async () => {
  const asked = [];
  let answer;
  const context = loadRenderer({
    getItemIcons: (names) => new Promise((resolve) => {
      asked.push(plain(names));
      answer = () => resolve({ 'Ambush Scarab': `${CDN}scarab.png` });
    })
  });

  const pending = context.ensureLootArt(['Ambush Scarab', 'Odd Thing'], 'poe1');
  await new Promise((resolve) => setImmediate(resolve));
  context.clearLootArtMisses();
  assert.equal(vm.runInContext('lootArtAsking.poe1.size', context), 0, 'nothing waits on an answer from the old list');
  answer();
  await pending;

  assert.equal(context.lootArtUrl({ itemName: 'Ambush Scarab' }, 'poe1'), `${CDN}scarab.png`);
  assert.equal(vm.runInContext("lootArtCache.poe1.has('odd thing')", context), false, 'the old list\'s miss is not kept');
  const again = context.ensureLootArt(['Odd Thing'], 'poe1');
  await new Promise((resolve) => setImmediate(resolve));
  answer();
  await again;
  assert.deepEqual(asked, [['Ambush Scarab', 'Odd Thing'], ['Odd Thing']]);
});

test('an ask that fails leaves nothing marked as asked, also for the views waiting on it', async () => {
  let fail;
  const context = loadRenderer({
    getItemIcons: () => new Promise((resolve, reject) => { fail = () => reject(new Error('gone')); })
  });
  const redraws = [];

  const first = context.ensureLootArt(['Ambush Scarab'], 'poe1', () => redraws.push('first'));
  const second = context.ensureLootArt(['Ambush Scarab'], 'poe1', () => redraws.push('second'));
  await new Promise((resolve) => setImmediate(resolve));
  fail();
  await Promise.all([first, second]);

  assert.deepEqual(redraws, []);
  assert.equal(vm.runInContext('lootArtAsking.poe1.size', context), 0);
  assert.equal(vm.runInContext('lootArtCache.poe1.size', context), 0);
});

test('ensureLootArt redraws only when it brought art', async () => {
  let redraws = 0;
  const context = loadRenderer({
    getItemIcons: async (names) => (names.includes('Ambush Scarab') ? { 'Ambush Scarab': `${CDN}scarab.png` } : {})
  });
  const redraw = () => { redraws += 1; };

  await context.ensureLootArt(['Odd Thing'], 'poe1', redraw);
  assert.equal(redraws, 0, 'nothing found');
  await context.ensureLootArt(['Odd Thing'], 'poe1', redraw);
  assert.equal(redraws, 0, 'nothing asked');
  await context.ensureLootArt(['Ambush Scarab'], 'poe1', redraw);
  assert.equal(redraws, 1);
  await context.ensureLootArt(['Ambush Scarab'], 'poe1', redraw);
  assert.equal(redraws, 1, 'nothing new to bring');
});

test('ensureLootArt keeps no answer when main fails, so a later draw asks again', async () => {
  let calls = 0;
  const context = loadRenderer({
    getItemIcons: async () => { calls += 1; throw new Error('gone'); }
  });
  let redraws = 0;

  await context.ensureLootArt(['Ambush Scarab'], 'poe1', () => { redraws += 1; });
  await context.ensureLootArt(['Ambush Scarab'], 'poe1', () => { redraws += 1; });

  assert.equal(calls, 2);
  assert.equal(redraws, 0);
});

test('ensureLootArt asks main in groups of 200 names and works without the bridge', async () => {
  const sizes = [];
  const context = loadRenderer({ getItemIcons: async (names) => { sizes.push(names.length); return {}; } });
  await context.ensureLootArt(Array.from({ length: 450 }, (_, index) => `Item ${index}`), 'poe1');
  assert.deepEqual(sizes, [200, 200, 50]);

  const bare = loadRenderer();
  await bare.ensureLootArt(['Ambush Scarab'], 'poe1', () => assert.fail('nothing to redraw'));
});

test('ensureLootArtForRows asks once per game with that game\'s names', async () => {
  const asked = [];
  const context = loadRenderer({ getItemIcons: async (names, poeVersion) => { asked.push([plain(names), poeVersion]); return {}; } });

  context.ensureLootArtForRows([
    { name: 'A', poeVersion: 'poe1' },
    { name: 'B', poeVersion: 'poe2' },
    { name: 'C', poeVersion: 'poe1' }
  ]);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(asked.sort((left, right) => left[1].localeCompare(right[1])), [[['A', 'C'], 'poe1'], [['B'], 'poe2']]);
});

test('clearLootArtMisses forgets the names without art, so art found after a sync shows', async () => {
  let known = {};
  const asked = [];
  const context = loadRenderer({
    getItemIcons: async (names) => { asked.push(plain(names)); return Object.fromEntries(names.filter((name) => known[name]).map((name) => [name, known[name]])); }
  });
  known = { Kept: `${CDN}kept.png` };
  await context.ensureLootArt(['Kept', 'Late'], 'poe1');
  assert.equal(context.lootArtUrl({ itemName: 'Late' }, 'poe1'), '');

  context.clearLootArtMisses();
  known = { Kept: `${CDN}kept.png`, Late: `${CDN}late.png` };
  await context.ensureLootArt(['Kept', 'Late'], 'poe1');

  assert.deepEqual(asked, [['Kept', 'Late'], ['Late']]);
  assert.equal(context.lootArtUrl({ itemName: 'Late' }, 'poe1'), `${CDN}late.png`);
  assert.equal(context.lootArtUrl({ itemName: 'Kept' }, 'poe1'), `${CDN}kept.png`);
});
