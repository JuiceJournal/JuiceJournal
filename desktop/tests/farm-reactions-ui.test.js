const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const srcDir = path.join(__dirname, '..', 'src');
const appJs = fs.readFileSync(path.join(srcDir, 'app.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8');

function extractFunction(name) {
  const start = appJs.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `app.js should define ${name}()`);
  const bodyStart = appJs.indexOf(') {', start) + 2;
  let depth = 0;
  for (let index = bodyStart; index < appJs.length; index += 1) {
    if (appJs[index] === '{') depth += 1;
    if (appJs[index] === '}' && --depth === 0) return appJs.slice(start, index + 1);
  }
  return assert.fail(`Unable to parse ${name}()`);
}

function loadRenderer() {
  const context = vm.createContext({
    window: { profitTierModel: require('../src/modules/profitTierModel') },
    getCurrencyAssetPath: (type, poeVersion) => `assets/currency/${poeVersion}/${type}.png`
  });
  const memeLabels = appJs.slice(appJs.indexOf('const PROFIT_MEME_LABELS'), appJs.indexOf('};', appJs.indexOf('const PROFIT_MEME_LABELS')) + 2);
  vm.runInContext(`${memeLabels}\n${extractFunction('profitMemeHTML')}\n${extractFunction('farmRunReactionsHTML')}\nthis.profitMemeHTML = profitMemeHTML;\nthis.farmRunReactionsHTML = farmRunReactionsHTML;`, context);
  return context;
}

test('meme badges show the flask mascot only for extreme profit tiers', () => {
  const { profitMemeHTML } = loadRenderer();

  assert.match(profitMemeHTML('rare'), /data-meme="pog"[\s\S]*assets\/brand\/reactions\/pog\.svg[\s\S]*Pog/);
  assert.match(profitMemeHTML('loss'), /data-meme="bricked"[\s\S]*Bricked/);
  assert.match(profitMemeHTML('mirror'), /Mirror tier/);
  assert.equal(profitMemeHTML('normal'), '');
  assert.equal(profitMemeHTML('magic'), '');

  for (const meme of ['bricked', 'pog', 'juiced', 'mirror', 'holy']) {
    assert.ok(fs.existsSync(path.join(srcDir, 'assets', 'brand', 'reactions', `${meme}.svg`)), `Missing ${meme}.svg`);
  }
});

test('Farming Hub runs show each community reaction with its count', () => {
  const { farmRunReactionsHTML } = loadRenderer();
  const html = farmRunReactionsHTML({ divine: 3, pog: 7 }, 'poe2');

  assert.match(html, /title="Divine"><img src="assets\/currency\/poe2\/divine\.png"[^>]*>3</);
  assert.match(html, /class="hub-reaction is-empty" title="Holy"><img src="assets\/brand\/reactions\/holy\.svg"[^>]*>0</);
  assert.match(html, /title="Pog"><img src="assets\/brand\/reactions\/pog\.svg"[^>]*>7</);
});

test('session drawer rule stays a standalone selector', () => {
  // A broken cleanup once left `.farming-hub-run-metrics strong,` glued to this fixed-position rule.
  const index = stylesCss.indexOf('\n.session-drawer {');
  const before = stylesCss.slice(0, index).trimEnd();

  assert.ok(index > 0);
  assert.ok(before.endsWith('}'), 'Expected .session-drawer to start a new rule');
});
