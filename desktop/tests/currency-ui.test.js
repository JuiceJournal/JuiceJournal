const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const desktopRoot = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(desktopRoot, 'src', 'index.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(desktopRoot, 'src', 'styles.css'), 'utf8');

function getCssRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesCss.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`));
  assert.ok(match, `Expected ${selector} rule to exist`);
  return match[0];
}

test('currency page uses an integrated left market category list', () => {
  assert.match(indexHtml, /class="currency-market-layout"/);
  assert.match(indexHtml, /class="currency-type-panel"/);
  assert.match(indexHtml, /id="currency-type-filter" class="currency-type-tabs"/);
  assert.match(stylesCss, /\.currency-market-layout\s*\{[\s\S]*grid-template-columns:\s*172px minmax\(0,\s*1fr\)/);
  assert.match(stylesCss, /\.currency-type-tabs\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.doesNotMatch(getCssRule('.currency-type-panel'), /background:/);
});

test('currency category buttons avoid version accent side rails', () => {
  assert.doesNotMatch(getCssRule('.currency-type-btn.poe1-exclusive'), /border-left/);
  assert.doesNotMatch(getCssRule('.currency-type-btn.poe2-exclusive'), /border-left/);
});

// Runs app.js loadCurrencyPrices against a main process that has not answered yet.
function loadCurrencyPricesRenderer() {
  const appJs = fs.readFileSync(path.join(desktopRoot, 'src', 'app.js'), 'utf8');
  const start = appJs.indexOf('async function loadCurrencyPrices()');
  assert.notEqual(start, -1, 'Expected app.js to define loadCurrencyPrices()');
  const rest = appJs.slice(start);
  const source = rest.slice(0, rest.search(/\n\}\r?\n/) + 2);
  const tbody = { innerHTML: '' };
  const rendered = [];
  let answer;
  const context = vm.createContext({
    document: { getElementById: (id) => (id === 'currency-table-body' ? tbody : null) },
    window: {
      t: (key) => key,
      electronAPI: { getCurrencyPrices: () => new Promise((resolve) => { answer = resolve; }) }
    },
    currencyState: { poeVersion: 'poe1', league: 'Mirage', type: '', search: '', prices: [] },
    renderCurrencyTable: () => rendered.push(context.currencyState.prices.length),
    renderCurrencyEmptyRow() {},
    getUserFacingErrorMessage: (error, key) => key,
    timeAgo: () => 'now'
  });
  vm.runInContext(`${source};\nthis.loadCurrencyPrices = loadCurrencyPrices;`, context);
  return { context, tbody, rendered, answer: (json) => answer(json) };
}

test('currency table says it waits for the poe.ninja sync until the main process answers', async () => {
  const { context, tbody, rendered, answer } = loadCurrencyPricesRenderer();

  const load = context.loadCurrencyPrices();
  assert.match(tbody.innerHTML, /currency\.waitingForSync/);

  answer({ prices: [{ itemName: 'Divine Orb' }], count: 1 });
  await load;
  assert.deepEqual(rendered, [1]);
});
