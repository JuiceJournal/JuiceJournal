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
  for (const key of new Set(Object.values(overlayKeys))) {
    if (key !== 'transmute') {
      assert.ok(fs.existsSync(path.join(srcDir, 'assets', 'currency', 'poe1', `${key}.png`)), `poe1 ${key}`);
    }
  }
  for (const file of Object.values(poe2Files)) {
    assert.ok(fs.existsSync(path.join(srcDir, 'assets', 'currency', 'poe2', file)), `poe2 ${file}`);
  }
});
