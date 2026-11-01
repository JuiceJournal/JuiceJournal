const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const srcDir = path.join(__dirname, '..', 'src');
const appJs = fs.readFileSync(path.join(srcDir, 'app.js'), 'utf8');

function getBlock(source, startToken) {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${startToken} should exist`);
  return source.slice(start, source.indexOf('\n};', start) + 3);
}

test('every bundled game icon path in the renderer exists', () => {
  const paths = [...appJs.matchAll(/'(assets\/currency\/[^']+)'/g)].map((match) => match[1]);

  assert.ok(paths.length > 0);
  for (const assetPath of paths) {
    assert.ok(fs.existsSync(path.join(srcDir, assetPath)), `Missing game icon ${assetPath}`);
  }
});

test('PoE 2 category tabs use PoE 2 art instead of falling back to PoE 1 icons', () => {
  const variants = getBlock(appJs, 'const CURRENCY_IMAGE_VARIANTS');
  const poe2Block = variants.slice(variants.indexOf('poe2:'));
  const poe2Keys = new Set([...poe2Block.matchAll(/^\s*'?([\w-]+)'?:\s*'assets\/currency\/poe2\//gm)].map((match) => match[1]));
  const tabIcons = [...appJs.slice(appJs.indexOf('const POE2_CATEGORY_TYPES')).split('];')[0].matchAll(/icon: '([\w-]+)'/g)]
    .map((match) => match[1]);

  assert.ok(tabIcons.length > 0);
  for (const icon of tabIcons) {
    assert.ok(poe2Keys.has(icon), `PoE 2 tab icon "${icon}" has no PoE 2 image`);
  }
  for (const profitType of ['chaos', 'divine', 'mirror']) {
    assert.ok(poe2Keys.has(profitType), `PoE 2 profit values need a ${profitType} image`);
  }
});

test('category tabs only name bundled art of their own game, each once', () => {
  const vm = require('node:vm');
  const images = vm.runInNewContext(`${getBlock(appJs, 'const CURRENCY_IMAGE_VARIANTS')}\n${getBlock(appJs, 'const CURRENCY_IMAGES')}\n({ CURRENCY_IMAGE_VARIANTS, CURRENCY_IMAGES })`);
  const categoryBlock = (name) => appJs.slice(appJs.indexOf(`const ${name}`)).split('];')[0];

  // getCurrencyAssetPath falls back to a Chaos Orb for a key it does not know, which would draw a stand-in.
  for (const [poeVersion, name] of [['poe1', 'POE1_CATEGORY_TYPES'], ['poe2', 'POE2_CATEGORY_TYPES']]) {
    const tabIcons = [...categoryBlock(name).matchAll(/icon: '([\w-]+)'/g)].map((match) => match[1]);
    assert.ok(tabIcons.length > 0, poeVersion);
    assert.equal(new Set(tabIcons).size, tabIcons.length, `${poeVersion} tab icons repeat`);
    for (const icon of tabIcons) {
      const bundled = images.CURRENCY_IMAGE_VARIANTS[poeVersion][icon] || (poeVersion === 'poe1' && images.CURRENCY_IMAGES[icon]);
      assert.ok(bundled, `${poeVersion} tab icon "${icon}" has no bundled image`);
    }
  }

  // Tabs that are no game category, or have no current art, show one of our line icons in place of an orb.
  for (const [name, values] of [
    ['POE1_CATEGORY_TYPES', ['', 'incubator', 'base_type', 'other']],
    ['POE2_CATEGORY_TYPES', ['', 'ultimatum', 'other']]
  ]) {
    for (const value of values) {
      assert.match(categoryBlock(name), new RegExp(`value: '${value}',[^\\n]*icon: null, glyph: '(layers|chest)'`), `${name} ${value || 'all'}`);
    }
  }
});

test('every PoE 1 category but Incubator and Base Type has bundled art, and so do PoE 2 idols', () => {
  const vm = require('node:vm');
  const images = vm.runInNewContext(`${getBlock(appJs, 'const CURRENCY_IMAGE_VARIANTS')}\n({ CURRENCY_IMAGE_VARIANTS })`);
  const poe1Art = [
    'fragment', 'scarab', 'essence', 'fossil', 'map', 'divination-card', 'gem', 'unique', 'oil', 'beast', 'delirium-orb',
    'catalyst', 'omen', 'tattoo'
  ];
  for (const key of poe1Art) {
    assert.equal(images.CURRENCY_IMAGE_VARIANTS.poe1[key], `assets/currency/poe1/${key}.png`, key);
  }
  assert.equal(images.CURRENCY_IMAGE_VARIANTS.poe2.idol, 'assets/currency/poe2/idol.png');

  // The notice names the new art and where it came from.
  const notice = fs.readFileSync(path.join(srcDir, 'assets', 'currency', 'NOTICE.md'), 'utf8');
  assert.match(notice, /PoE 1 category images/);
  assert.match(notice, /poe2\/idol\.png/);
});

test('game art ships with a notice and the About page credits Grinding Gear Games', () => {
  const indexHtml = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
  const translations = fs.readFileSync(path.join(srcDir, 'modules', 'translations.js'), 'utf8');

  assert.match(fs.readFileSync(path.join(srcDir, 'assets', 'currency', 'NOTICE.md'), 'utf8'), /Grinding Gear Games/);
  assert.match(indexHtml, /data-i18n="settings\.gameArtNotice"/);
  assert.equal((translations.match(/'settings\.gameArtNotice':/g) || []).length, 2);
});

test('the overlay knows the same bundled item art as the main window, and every file exists', () => {
  const vm = require('node:vm');
  const overlayJs = fs.readFileSync(path.join(srcDir, 'overlay.js'), 'utf8');
  const readObject = (source, name) => vm.runInNewContext(`(${source.match(new RegExp(`var ${name} = (\\{[\\s\\S]*?\\});`))[1]})`);
  const overlayKeys = readObject(overlayJs, 'LOCAL_ICON_KEYS');
  const poe2Files = readObject(overlayJs, 'POE2_ICON_FILES');
  const appKeys = vm.runInNewContext(`${getBlock(appJs, 'const LOCAL_ITEM_ICON_KEYS')}\nLOCAL_ITEM_ICON_KEYS`);

  // Both objects come from other vm realms, so they are compared as plain data.
  assert.deepEqual(
    JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(appKeys).map(([name, key]) => [name.toLowerCase(), key])))),
    JSON.parse(JSON.stringify(overlayKeys))
  );
  const images = vm.runInNewContext(`${getBlock(appJs, 'const CURRENCY_IMAGE_VARIANTS')}\n${getBlock(appJs, 'const CURRENCY_IMAGES')}\n({ CURRENCY_IMAGE_VARIANTS, CURRENCY_IMAGES })`);
  for (const key of new Set([...Object.values(overlayKeys), 'chaos', 'divine', 'mirror'])) {
    const appPoe1 = images.CURRENCY_IMAGE_VARIANTS.poe1[key] || images.CURRENCY_IMAGES[key] || '';
    const overlayPoe1 = key === 'transmute' ? '' : `assets/currency/poe1/${key}.png`;
    assert.equal(overlayPoe1, appPoe1, `poe1 ${key}`);
    const appPoe2 = images.CURRENCY_IMAGE_VARIANTS.poe2[key] || '';
    const overlayPoe2 = poe2Files[key] ? `assets/currency/poe2/${poe2Files[key]}` : '';
    assert.equal(overlayPoe2, appPoe2, `poe2 ${key}`);
    for (const iconPath of [overlayPoe1, overlayPoe2].filter(Boolean)) {
      assert.ok(fs.existsSync(path.join(srcDir, iconPath)), iconPath);
    }
  }
});
