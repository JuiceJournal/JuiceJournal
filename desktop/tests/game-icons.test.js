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
