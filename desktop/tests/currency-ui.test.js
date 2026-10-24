const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const desktopRoot = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(desktopRoot, 'src', 'index.html'), 'utf8');
const appJsPath = path.join(desktopRoot, 'src', 'app.js');
const stylesCss = fs.readFileSync(path.join(desktopRoot, 'src', 'styles.css'), 'utf8');

function getCssRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesCss.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`));
  assert.ok(match, `Expected ${selector} rule to exist`);
  return match[0];
}

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}`;
  const asyncSignature = `async ${signature}`;
  const asyncStartIndex = source.indexOf(asyncSignature);
  const plainStartIndex = source.indexOf(signature);
  const startIndex = asyncStartIndex !== -1 ? asyncStartIndex : plainStartIndex;

  if (startIndex === -1) {
    assert.fail(`Expected ${path.basename(appJsPath)} to define ${functionName}()`);
  }

  let bodyStartIndex = -1;
  let parenDepth = 0;
  let seenParamList = false;
  const searchStartIndex = startIndex + (asyncStartIndex !== -1 ? asyncSignature.length : signature.length);

  for (let index = searchStartIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') {
      parenDepth += 1;
      continue;
    }
    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        seenParamList = true;
      }
      continue;
    }
    if (seenParamList && char === '{') {
      bodyStartIndex = index;
      break;
    }
  }

  if (bodyStartIndex === -1) {
    assert.fail(`Unable to locate ${functionName}() body in ${path.basename(appJsPath)}`);
  }

  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = bodyStartIndex; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (inSingleQuote) {
      if (!escaped && char === '\'') inSingleQuote = false;
      escaped = !escaped && char === '\\';
      continue;
    }
    if (inDoubleQuote) {
      if (!escaped && char === '"') inDoubleQuote = false;
      escaped = !escaped && char === '\\';
      continue;
    }
    if (inTemplateString) {
      if (!escaped && char === '`') inTemplateString = false;
      escaped = !escaped && char === '\\';
      continue;
    }
    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (char === '\'') {
      inSingleQuote = true;
      escaped = false;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      escaped = false;
      continue;
    }
    if (char === '`') {
      inTemplateString = true;
      escaped = false;
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  assert.fail(`Unable to parse ${functionName}() from ${path.basename(appJsPath)}`);
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

// Runs app.js loadCurrencyPrices against a main process that answers each request when the test says so.
function loadCurrencyPricesRenderer() {
  const source = extractFunctionSource(fs.readFileSync(appJsPath, 'utf8'), 'loadCurrencyPrices');
  const elements = { 'currency-table-body': { innerHTML: '' }, 'currency-footer': { textContent: '' } };
  const rendered = [];
  const answers = [];
  const context = vm.createContext({
    document: { getElementById: (id) => elements[id] || null },
    window: {
      t: (key) => key,
      electronAPI: { getCurrencyPrices: () => new Promise((resolve) => answers.push(resolve)) }
    },
    currencyState: { poeVersion: 'poe1', league: 'Mirage', type: '', search: '', prices: [], pricesRequest: 0 },
    renderCurrencyTable: () => rendered.push(context.currencyState.prices.map((price) => price.league)),
    renderCurrencyEmptyRow() {},
    getUserFacingErrorMessage: (error, key) => key,
    timeAgo: () => 'now'
  });
  vm.runInContext(`${source};\nthis.loadCurrencyPrices = loadCurrencyPrices;`, context);
  return {
    context,
    tbody: elements['currency-table-body'],
    footer: elements['currency-footer'],
    rendered,
    answer: (index, json) => answers[index](json)
  };
}

test('currency table says it waits for the poe.ninja sync until the main process answers', async () => {
  const { context, tbody, rendered, answer } = loadCurrencyPricesRenderer();

  const load = context.loadCurrencyPrices();
  assert.match(tbody.innerHTML, /currency\.waitingForSync/);

  answer(0, { prices: [{ itemName: 'Divine Orb', league: 'Mirage' }], count: 1 });
  await load;
  assert.deepEqual(rendered, [['Mirage']]);
});

test('currency table ignores an earlier request that answers after a later one', async () => {
  const { context, footer, rendered, answer } = loadCurrencyPricesRenderer();

  // Standard waits behind a running sync while the user switches back to the loaded Mirage league.
  const standard = context.loadCurrencyPrices();
  const mirage = context.loadCurrencyPrices();
  answer(1, { prices: [{ itemName: 'Divine Orb', league: 'Mirage' }], count: 1 });
  await mirage;
  answer(0, {
    prices: [{ itemName: 'Divine Orb', league: 'Standard' }, { itemName: 'Chaos Orb', league: 'Standard' }],
    count: 2
  });
  await standard;

  assert.deepEqual(rendered, [['Mirage']]);
  assert.deepEqual(context.currencyState.prices.map((price) => price.league), ['Mirage']);
  assert.equal(footer.textContent, '1 items');
});
