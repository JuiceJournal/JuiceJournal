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

const appJs = fs.readFileSync(appJsPath, 'utf8');

test('currency category tabs carry no side stripe in any state, and the selected tab is a bevel plate', () => {
  // A 2px inset side shadow under the bevel left a half-height ember stub next to the selected tab.
  const tabRules = stylesCss.match(/[^{}]*\.currency-type-btn[^{}]*\{[^}]*\}/g) || [];
  assert.ok(tabRules.length >= 4);
  for (const rule of tabRules) {
    assert.doesNotMatch(rule, /border-left|inset\s+[1-9]\d*px\s+0\s+0/, rule.trim());
  }
  const active = getCssRule('.currency-type-btn.active');
  assert.match(active, /background:\s*rgb\(var\(--plate-raised-rgb\) \/ 0\.9\);/);
  assert.match(active, /box-shadow:\s*inset 0 0 0 1px rgb\(var\(--brass-rgb\) \/ 0\.45\);/);
  assert.match(active, /color:\s*var\(--text-bright\);/);
  assert.match(stylesCss, /\.currency-type-btn\.active \.currency-tab-count\s*\{\s*color:\s*var\(--gold-light\);\s*\}/);
  // The version-exclusive classes did nothing any more, so they are gone.
  assert.doesNotMatch(stylesCss, /poe[12]-exclusive/);
  assert.doesNotMatch(appJs, /poe[12]-exclusive|poe[12]Only/);
});

function loadAppFunctions(context, functionNames) {
  vm.runInContext(
    functionNames.map((name) => `${extractFunctionSource(appJs, name)};\nthis.${name} = ${name};`).join('\n'),
    context
  );
}

// A top-level `const NAME = [...]` or `= {...}` block of app.js, as source.
function constSource(name) {
  const start = appJs.indexOf(`const ${name} = `);
  assert.notEqual(start, -1, `${name} should exist`);
  const opener = appJs[start + `const ${name} = `.length];
  const end = opener === '[' || opener === '{'
    ? appJs.indexOf(opener === '[' ? '\n];' : '\n};', start) + 3
    : appJs.indexOf(';', start) + 1;
  return appJs.slice(start, end).replace(/^const /, 'var ');
}

// The t() stand-in names the key and, when given, its values, so tests can read both.
const fakeT = (key, values) => (values ? `${key} ${JSON.stringify(values)}` : key);
const listed = (shown, total) => fakeT('currency.listedCount', { shown, total });

// Runs app.js loadCurrencyPrices against a main process that answers each request when the test says so. Its
// timers run only when the test calls runTimers.
function loadCurrencyPricesRenderer(currencyState = {}) {
  const elements = {
    'currency-table-body': { innerHTML: '' },
    'currency-footer': { textContent: '' },
    'currency-status': { textContent: '' }
  };
  const rendered = [];
  const emptyRows = [];
  const requests = [];
  const answers = [];
  const timers = new Map();
  let nextTimer = 0;
  const context = vm.createContext({
    document: { getElementById: (id) => elements[id] || null },
    window: {
      t: fakeT,
      electronAPI: {
        getCurrencyPrices: (params) => {
          requests.push({ ...params });
          return new Promise((resolve, reject) => answers.push({ resolve, reject }));
        }
      }
    },
    setTimeout: (callback, delay) => {
      timers.set(++nextTimer, { callback, delay });
      return nextTimer;
    },
    clearTimeout: (id) => timers.delete(id),
    currencyState: {
      poeVersion: 'poe1', league: 'Mirage', type: '', search: '', prices: [], pricesRequest: 0, listedKey: null, rates: {},
      total: 0, typeCounts: null, syncedTypes: [], updatedAt: null, loadError: null, syncing: false,
      ...currencyState
    },
    renderCurrencyTable: () => rendered.push(context.currencyState.prices.map((price) => price.league)),
    renderCurrencyEmptyRow: (tbody, message, options = {}) => emptyRows.push(options.action ? `${message} [${options.action}]` : message),
    updateCurrencyTypeCounts() {},
    getUserFacingErrorMessage: (error, key) => key
  });
  loadAppFunctions(context, ['currencyLoadingRowsHTML', 'loadCurrencyPrices', 'renderCurrencyStatus', 'formatSyncedAgo']);
  return {
    context,
    tbody: elements['currency-table-body'],
    footer: elements['currency-footer'],
    status: elements['currency-status'],
    rendered,
    emptyRows,
    requests,
    timers,
    runTimers: () => {
      for (const [id, timer] of [...timers]) {
        timers.delete(id);
        timer.callback();
      }
    },
    answer: (index, json) => answers[index].resolve(json),
    fail: (index, error) => answers[index].reject(error)
  };
}

test('currency table says it waits for the poe.ninja sync until the main process answers', async () => {
  const { context, tbody, rendered, answer } = loadCurrencyPricesRenderer();

  const load = context.loadCurrencyPrices();
  assert.match(tbody.innerHTML, /<tr class="currency-loading-row"><td colspan="4" class="currency-loading-label">currency\.waitingForSync<\/td><\/tr>/);
  // A live region inserted together with its text is not announced, so the label is plain text.
  assert.doesNotMatch(tbody.innerHTML, /role="status"|aria-live/);
  const placeholders = tbody.innerHTML.match(/<tr class="currency-row--placeholder" aria-hidden="true">[\s\S]*?<\/tr>/g) || [];
  assert.equal(placeholders.length, 8);
  for (const row of placeholders) {
    // The still rows have the listed rows' four columns, so nothing moves when the prices arrive.
    assert.equal((row.match(/<td /g) || []).length, 4);
    assert.match(row, /<span class="item-slot"><\/span>/);
    assert.equal((row.match(/<span class="currency-bar[ "]/g) || []).length, 2);
  }

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
  assert.equal(footer.textContent, listed('1', '1'));
});

test('currency table keeps the listed rows while main answers a filter of the same game and league', async () => {
  const { context, tbody, footer, rendered, timers, answer } = loadCurrencyPricesRenderer({ listedKey: 'poe1:Mirage', search: 'orb' });
  tbody.innerHTML = '<tr><td>Divine Orb</td></tr>';
  footer.textContent = '1 items';

  const load = context.loadCurrencyPrices();
  assert.equal(tbody.innerHTML, '<tr><td>Divine Orb</td></tr>');
  assert.equal(footer.textContent, '1 items');

  answer(0, { prices: [{ itemName: 'Chaos Orb', league: 'Mirage' }], count: 1, league: 'Mirage' });
  await load;
  assert.deepEqual(rendered, [['Mirage']]);
  // Answered in time, so the still rows never come.
  assert.equal(timers.size, 0);
});

test('kept currency rows give way to still rows when main waits for a sync before it answers', async () => {
  // Another league's sync unloaded the listed Mirage, so main syncs Mirage again before it answers the Fragment tab.
  const { context, tbody, footer, rendered, timers, runTimers, answer } = loadCurrencyPricesRenderer({
    listedKey: 'poe1:Mirage',
    type: 'fragment'
  });
  tbody.innerHTML = '<tr><td>Divine Orb</td></tr>';
  footer.textContent = '1 items';

  const load = context.loadCurrencyPrices();
  assert.equal(tbody.innerHTML, '<tr><td>Divine Orb</td></tr>');
  assert.deepEqual([...timers.values()].map((timer) => timer.delay), [300]);
  runTimers();
  assert.match(tbody.innerHTML, /currency\.waitingForSync/);
  assert.equal((tbody.innerHTML.match(/class="currency-row--placeholder"/g) || []).length, 8);
  assert.equal(footer.textContent, '');

  answer(0, { prices: [{ itemName: 'Chaos Orb', league: 'Mirage' }], count: 1, league: 'Mirage' });
  await load;
  assert.deepEqual(rendered, [['Mirage']]);
  assert.equal(footer.textContent, listed('1', '1'));
});

test('a slow currency request that a later one replaced does not draw still rows', async () => {
  const { context, tbody, timers, runTimers, answer } = loadCurrencyPricesRenderer({ listedKey: 'poe1:Mirage' });

  const slow = context.loadCurrencyPrices();
  context.currencyState.search = 'orb';
  const later = context.loadCurrencyPrices();
  answer(1, { prices: [{ itemName: 'Chaos Orb', league: 'Mirage' }], count: 1, league: 'Mirage' });
  await later;
  tbody.innerHTML = '<tr><td>Chaos Orb</td></tr>';

  assert.equal(timers.size, 1);
  runTimers();
  assert.equal(tbody.innerHTML, '<tr><td>Chaos Orb</td></tr>');
  answer(0, { prices: [], count: 0, league: 'Mirage' });
  await slow;
});

test('currency table shows still rows and clears the footer and rail counts when another game or league loads', () => {
  for (const currencyState of [{ league: 'Standard' }, { poeVersion: 'poe2' }]) {
    const { context, tbody, footer } = loadCurrencyPricesRenderer({
      listedKey: 'poe1:Mirage',
      typeCounts: { currency: 3 },
      ...currencyState
    });
    tbody.innerHTML = '<tr><td>Divine Orb</td></tr>';
    footer.textContent = '1 items';

    context.loadCurrencyPrices();
    assert.equal((tbody.innerHTML.match(/class="currency-row--placeholder"/g) || []).length, 8, JSON.stringify(currencyState));
    assert.equal(footer.textContent, '');
    // The counts belonged to the listed game and league.
    assert.equal(context.currencyState.typeCounts, null);
  }
});

test('currency table keeps the rates and listed league of the latest request only', async () => {
  const { context, answer } = loadCurrencyPricesRenderer();

  context.currencyState.league = 'Standard';
  const standard = context.loadCurrencyPrices();
  context.currencyState.league = 'Mirage';
  const mirage = context.loadCurrencyPrices();
  answer(1, { prices: [], count: 0, league: 'Mirage', rates: { divineChaos: 150, mirrorChaos: 90000 } });
  await mirage;
  answer(0, { prices: [], count: 0, league: 'Standard', rates: { divineChaos: 90, mirrorChaos: null } });
  await standard;

  assert.deepEqual(context.currencyState.rates, { divineChaos: 150, mirrorChaos: 90000 });
  assert.equal(context.currencyState.listedKey, 'poe1:Mirage');
});

test('the status line names the league, its price count and sync age, and the footer how many matches show', async () => {
  const { context, status, footer, answer } = loadCurrencyPricesRenderer();

  const load = context.loadCurrencyPrices();
  answer(0, {
    prices: Array.from({ length: 500 }, (_, index) => ({ itemName: `Item ${index}` })),
    count: 500,
    total: 4210,
    typeCounts: { currency: 4000, divination_card: 210 },
    syncedTypes: ['currency', 'divination_card'],
    updatedAt: new Date(Date.now() - 4 * 60000).toISOString(),
    league: 'Mirage'
  });
  await load;

  assert.equal(
    status.textContent,
    `Mirage · ${fakeT('currency.priceCount', { count: '4,210' })} · ${fakeT('currency.syncedAgo', { time: fakeT('time.minutesAgo', { count: 4 }) })}`
  );
  assert.equal(footer.textContent, listed('500', '4,210'));
  assert.deepEqual(JSON.parse(JSON.stringify(context.currencyState.syncedTypes)), ['currency', 'divination_card']);

  // While a sync runs the line says so; before the first sync it says that instead of an age.
  context.currencyState.syncing = true;
  context.renderCurrencyStatus();
  assert.equal(status.textContent, 'Mirage · currency.syncing');
  context.currencyState.syncing = false;
  context.currencyState.updatedAt = null;
  context.renderCurrencyStatus();
  assert.equal(status.textContent, 'Mirage · currency.neverSynced');
});

test('the sync age reads in the page language at each step', () => {
  const { context } = loadCurrencyPricesRenderer();
  const ago = (minutes) => context.formatSyncedAgo(new Date(Date.now() - minutes * 60000).toISOString());
  assert.equal(ago(0), 'time.justNow');
  assert.equal(ago(59), fakeT('time.minutesAgo', { count: 59 }));
  assert.equal(ago(125), fakeT('time.hoursAgo', { count: 2 }));
  assert.equal(ago(3 * 1440), fakeT('time.daysAgo', { count: 3 }));
});

test('a cache-only currency reload keeps the rows when main no longer holds the listed league', async () => {
  // The table lists Standard while Mirage is selected, so a normal load would draw still rows here.
  const { context, tbody, footer, rendered, requests, timers, answer } = loadCurrencyPricesRenderer({
    listedKey: 'poe1:Standard',
    rates: { divineChaos: 150 }
  });
  tbody.innerHTML = '<tr><td>Divine Orb</td></tr>';
  footer.textContent = '1 items';

  const reload = context.loadCurrencyPrices({ cacheOnly: true });
  assert.equal(requests[0].cacheOnly, true);
  assert.equal(tbody.innerHTML, '<tr><td>Divine Orb</td></tr>');
  assert.equal(footer.textContent, '1 items');
  assert.equal(timers.size, 0);
  answer(0, { prices: null, count: 0, league: 'Mirage', poeVersion: 'poe1', updatedAt: null, rates: {} });
  await reload;

  assert.deepEqual(rendered, []);
  assert.equal(tbody.innerHTML, '<tr><td>Divine Orb</td></tr>');
  assert.doesNotMatch(tbody.innerHTML, /currency-row--placeholder/);
  assert.equal(footer.textContent, '1 items');
  assert.equal(context.currencyState.listedKey, 'poe1:Standard');
  assert.deepEqual(context.currencyState.rates, { divineChaos: 150 });
});

test('a failed cache-only currency reload leaves the listed rows as they are', async () => {
  const { context, tbody, footer, status, emptyRows, fail } = loadCurrencyPricesRenderer({
    listedKey: 'poe1:Standard',
    prices: [{ itemName: 'Divine Orb' }],
    typeCounts: { currency: 1 },
    updatedAt: new Date().toISOString()
  });
  tbody.innerHTML = '<tr><td>Divine Orb</td></tr>';
  footer.textContent = '1 items';

  const reload = context.loadCurrencyPrices({ cacheOnly: true });
  fail(0, new Error('main went away'));
  await reload;

  assert.deepEqual(emptyRows, []);
  assert.equal(tbody.innerHTML, '<tr><td>Divine Orb</td></tr>');
  assert.equal(footer.textContent, '1 items');
  assert.equal(context.currencyState.listedKey, 'poe1:Standard');

  // A failed normal load shows the error with Retry, forgets the listed league and clears the stale footer, rail
  // counts and sync time. It keeps the error, so a redraw writes the message in the language of that moment.
  const error = new Error('main went away');
  const load = context.loadCurrencyPrices();
  fail(1, error);
  await load;
  assert.deepEqual(emptyRows, ['currency.loadError [retry]']);
  assert.equal(context.currencyState.listedKey, null);
  assert.equal(context.currencyState.loadError, error);
  assert.equal(context.currencyState.typeCounts, null);
  assert.equal(footer.textContent, '');
  assert.equal(status.textContent, 'Mirage');
});

test('a cache-only currency reload does not drop a league load that waits for a sync', async () => {
  const { context, tbody, rendered, requests, answer } = loadCurrencyPricesRenderer();

  const load = context.loadCurrencyPrices();
  const reload = context.loadCurrencyPrices({ cacheOnly: true });
  assert.equal(requests[0].cacheOnly, undefined);
  assert.equal((tbody.innerHTML.match(/class="currency-row--placeholder"/g) || []).length, 8);
  answer(1, { prices: null, count: 0, league: 'Mirage', poeVersion: 'poe1', updatedAt: null, rates: {} });
  await reload;
  answer(0, { prices: [{ itemName: 'Divine Orb', league: 'Mirage' }], count: 1, league: 'Mirage' });
  await load;

  assert.deepEqual(rendered, [['Mirage']]);
  assert.equal(context.currencyState.listedKey, 'poe1:Mirage');
});

test('currency table has four fixed columns, so widths never jump between still, empty and listed rows', () => {
  const table = indexHtml.match(/<table class="currency-table">[\s\S]*?<\/table>/)[0];
  assert.match(
    table,
    /<colgroup>\s*<col>\s*<col class="currency-col-chaos">\s*<col class="currency-col-divine">\s*<col class="currency-col-change">\s*<\/colgroup>/
  );
  assert.equal((table.match(/<th\b/g) || []).length, 4);
  assert.match(table, /<td colspan="4" class="currency-empty"/);
  assert.match(getCssRule('.currency-table'), /table-layout:\s*fixed;/);
  assert.match(stylesCss, /\.currency-col-chaos\s*\{\s*width:\s*120px;\s*\}/);
  assert.match(stylesCss, /\.currency-col-divine\s*\{\s*width:\s*110px;\s*\}/);
  assert.match(stylesCss, /\.currency-col-change\s*\{\s*width:\s*150px;\s*\}/);
  // A long name ends in an ellipsis instead of widening its column.
  assert.match(getCssRule('.currency-item-meta'), /text-overflow:\s*ellipsis;/);
  // `.currency-table td` sets text-align, so the overrides need the table prefix to win.
  assert.match(stylesCss, /\.currency-table \.currency-td-chaos,\s*\.currency-table \.currency-td-divine\s*\{\s*text-align:\s*right;\s*\}/);
  assert.match(stylesCss, /\.currency-td-chaos \.value-chip,\s*\.currency-td-divine \.value-chip\s*\{\s*justify-content:\s*flex-end;\s*\}/);
  // A list sorted by value would glow down its top rows, so the table keeps the tier colour only.
  assert.match(stylesCss, /\.currency-td-chaos\[data-profit-tier\]\s*\{\s*text-shadow:\s*none;\s*\}/);
});

test('the column labels and the rail stay in view under the app header', () => {
  const head = getCssRule('.currency-table thead th');
  assert.match(head, /position:\s*sticky;/);
  assert.match(head, /top:\s*var\(--header-height\);/);
  assert.match(head, /background:\s*var\(--bg-base\);/);
  // A scrolling wrap would hold the sticky header inside itself, so the wrap only clips to its bevel.
  const wrap = getCssRule('.currency-table-wrap');
  assert.match(wrap, /overflow:\s*clip;/);
  assert.doesNotMatch(wrap, /overflow-[xy]/);
  assert.match(getCssRule('.currency-type-panel'), /top:\s*calc\(var\(--header-height\) \+ 0\.75rem\);/);
});

test('currency still rows are quiet bars that never move', () => {
  const bar = getCssRule('.currency-bar');
  assert.match(bar, /background:\s*rgb\(var\(--ink-rgb\) \/ 0\.06\);/);
  assert.match(bar, /border-radius:\s*var\(--bevel-xs\);/);

  const stillRules = stylesCss.match(/[^{}]*(?:currency-bar|currency-row--placeholder|currency-loading)[^{}]*\{[^}]*\}/g) || [];
  assert.ok(stillRules.length >= 4);
  for (const rule of stillRules) {
    assert.doesNotMatch(rule, /animation|transition/, rule.trim());
  }
});

test('the header Sync button carries the sync icon, keeps its text in a label span and never resizes when busy', () => {
  const button = indexHtml.match(/<button id="currency-sync-btn"[^>]*>[\s\S]*?<\/button>/)[0];
  assert.match(button, /class="btn btn-primary btn-small"/);
  assert.match(button, /<use href="assets\/icons\.svg#sync"\/>/);
  assert.match(button, /<span class="btn-label" data-i18n="currency\.sync">Sync<\/span>/);
  assert.match(stylesCss, /#currency-sync-btn\s*\{\s*min-inline-size:\s*[\d.]+rem;\s*\}/);
  assert.match(stylesCss, /:lang\(tr\) #currency-sync-btn\s*\{\s*min-inline-size:\s*[\d.]+rem;\s*\}/);
});

test('the Currency controls have names, sort headers are buttons, and every control shows keyboard focus', () => {
  assert.match(indexHtml, /<select id="currency-league"[^>]*data-i18n-aria="currency\.leagueAria"/);
  assert.match(indexHtml, /<input [^>]*id="currency-search"[^>]*data-i18n-aria="currency\.searchAria"/);
  assert.match(indexHtml, /<button type="button" id="currency-search-clear"[^>]*data-i18n-aria="currency\.clearSearch"[^>]*hidden>/);

  const headers = indexHtml.match(/<th class="currency-th-[a-z]+[^"]*" data-sort="[^"]+"[^>]*><button type="button" class="currency-sort"[^>]*>[^<]*<\/button><\/th>/g) || [];
  assert.equal(headers.length, 4);
  assert.match(indexHtml, /<th class="currency-th-chaos active" data-sort="chaosValue" aria-sort="descending">/);

  for (const selector of ['.currency-type-btn', '.poe-toggle-btn', '.currency-search', '.currency-select', '.currency-sort', '.currency-row']) {
    const escaped = selector.replace('.', '\\.');
    assert.match(stylesCss, new RegExp(`${escaped}:focus-visible[^{]*\\{\\s*outline:\\s*2px solid var\\(--gold-light\\);`), selector);
  }
});

test('the sorted column header says its order with aria-sort and the others carry none', () => {
  const headers = ['itemName', 'chaosValue', 'divineValue', 'change'].map((sort) => {
    const attributes = {};
    const classes = new Set();
    return {
      dataset: { sort },
      classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
      setAttribute: (name, value) => { attributes[name] = value; },
      removeAttribute: (name) => { delete attributes[name]; },
      attributes,
      classes
    };
  });
  const context = vm.createContext({
    document: { querySelectorAll: () => headers },
    currencyState: { sortField: 'change', sortDir: 'asc' }
  });
  loadAppFunctions(context, ['updateCurrencySortHeaders']);

  context.updateCurrencySortHeaders();
  assert.deepEqual(headers.map((th) => th.attributes['aria-sort'] || null), [null, null, null, 'ascending']);
  assert.deepEqual([...headers[3].classes].sort(), ['active', 'asc']);
  context.currencyState.sortField = 'chaosValue';
  context.currencyState.sortDir = 'desc';
  context.updateCurrencySortHeaders();
  assert.deepEqual(headers.map((th) => th.attributes['aria-sort'] || null), [null, 'descending', null, null]);
  assert.deepEqual([...headers[1].classes], ['active']);
});

function descendantsWithClass(root, className) {
  // A chip's number is a text child, with no children of its own.
  return (root.children || []).flatMap((child) => [
    ...(String(child.className).split(/\s+/).includes(className) ? [child] : []),
    ...descendantsWithClass(child, className)
  ]);
}

// A small fake DOM. Elements keep their children, classes, attributes and listeners, so rows and buttons can be read
// back and clicked.
function createFakeDocument() {
  const document = {};
  const createElement = (tagName) => {
    const attributes = {};
    const handlers = {};
    const element = {
      tagName: tagName.toUpperCase(),
      className: '',
      textContent: '',
      dataset: {},
      style: {},
      children: [],
      markup: '',
      setAttribute: (name, value) => { attributes[name] = String(value); },
      getAttribute: (name) => (name in attributes ? attributes[name] : null),
      removeAttribute: (name) => { delete attributes[name]; },
      append: (...nodes) => { element.children.push(...nodes); },
      appendChild: (node) => {
        element.children.push(node);
        return node;
      },
      replaceChildren: (...nodes) => {
        element.markup = '';
        element.children = nodes.flatMap((node) => (node.tagName === '#FRAGMENT' ? node.children : [node]));
      },
      insertAdjacentHTML: (position, html) => { element.markup = html; },
      addEventListener: (type, handler) => { (handlers[type] ||= []).push(handler); },
      dispatch: (type, event = {}) => (handlers[type] || []).forEach((handler) => handler({ type, ...event })),
      click: () => element.dispatch('click'),
      focus: () => { document.activeElement = element; },
      querySelector: (selector) => descendantsWithClass(element, selector.slice(1))[0] || null
    };
    return element;
  };
  Object.assign(document, {
    createElement,
    createElementNS: (namespace, tagName) => createElement(tagName),
    createDocumentFragment: () => createElement('#fragment')
  });
  document.body = createElement('body');
  document.activeElement = document.body;
  return document;
}

// renderCurrencyTable, its empty row and handleCurrencySync in the fake DOM.
function loadCurrencyTableRenderer({ currencyState = {}, canSync = true, syncCurrencyPrices, loadCurrencyPrices } = {}) {
  const document = createFakeDocument();
  const tbody = document.createElement('tbody');
  const header = document.createElement('button');
  const headerLabel = document.createElement('span');
  headerLabel.className = 'btn-label';
  headerLabel.setAttribute('data-i18n', 'currency.sync');
  headerLabel.textContent = 'currency.sync';
  header.appendChild(headerLabel);
  const byId = { 'currency-table-body': tbody, 'currency-sync-btn': header };

  Object.assign(document, {
    getElementById: (id) => byId[id] || null,
    querySelectorAll(selector) {
      if (selector === '.poe-toggle-btn') return [];
      assert.equal(selector, '.currency-empty-sync');
      return descendantsWithClass(tbody, 'currency-empty-sync');
    },
    querySelector: (selector) => document.querySelectorAll(selector)[0] || null
  });

  const syncCalls = [];
  const searchClears = [];
  const context = vm.createContext({
    document,
    window: {
      t: (key) => key,
      profitTierModel: require('../src/modules/profitTierModel'),
      electronAPI: {
        syncCurrencyPrices: (options) => {
          syncCalls.push({ ...options });
          return syncCurrencyPrices ? syncCurrencyPrices() : Promise.resolve({});
        }
      }
    },
    currencyState: {
      poeVersion: 'poe1', league: 'Mirage', type: '', search: '', sortField: 'chaosValue', sortDir: 'desc',
      prices: [], rates: {}, syncedTypes: [], loadError: null, expandedKey: null, syncing: false,
      ...currencyState
    },
    canCurrentUserSyncPrices: () => canSync,
    state: { settings: { poeVersion: 'poe1' } },
    setToggleButtonPressed() {},
    updateTypeFilterDropdown() {},
    updateCurrencySortHeaders() {},
    renderCurrencyStatus() {},
    clearCurrencySearch: () => searchClears.push('clear'),
    getCurrencyTypeLabel: (type) => `label:${type}`,
    createCurrencyItemSlot: () => {
      const slot = document.createElement('span');
      slot.className = 'item-slot';
      return slot;
    },
    createPriceChangeElement: (change) => {
      const box = document.createElement('div');
      box.className = 'currency-change';
      box.textContent = String(change);
      return box;
    },
    toggleCurrencyRowDetail() {},
    buildCurrencyDetailRow: (item) => {
      const row = document.createElement('tr');
      row.className = 'currency-detail-row';
      row.textContent = item.itemName;
      return row;
    },
    createCurrencyValueElement: (value) => {
      const chip = document.createElement('span');
      chip.className = 'value-chip';
      chip.textContent = String(value);
      return chip;
    },
    applyCachedItemIcons() {},
    showToast() {},
    getUserFacingErrorMessage: (error, key) => key,
    refreshProfitCurrencyRates: async () => null,
    loadCurrencyLeagues: async () => {},
    loadCurrencyPrices: loadCurrencyPrices || (async () => {})
  });
  loadAppFunctions(context, [
    'getProfitTierFor', 'applyProfitTier', 'setButtonBusy', 'selectCurrencyEmptyState', 'renderCurrencyEmptyRow',
    'renderCurrencyTable', 'handleCurrencySync', 'loadCurrencyPage'
  ]);
  return { context, document, tbody, header, syncCalls, searchClears };
}

test('each empty currency table names why and offers the one action that can fill it', () => {
  const render = (currencyState, canSync = true) => {
    const harness = loadCurrencyTableRenderer({ currencyState, canSync });
    // The button takes handleCurrencySync when it is drawn, so the stand-in goes in first.
    const syncs = [];
    harness.context.handleCurrencySync = () => syncs.push('sync');
    harness.context.renderCurrencyTable();
    const cell = harness.tbody.children[0].children[0];
    const [button] = descendantsWithClass(cell, 'btn');
    return { ...harness, syncs, cell, button, label: button?.querySelector('.btn-label') };
  };

  // A league with no prices at all, or a tab the quick sync skipped: Sync now, for accounts that can sync.
  for (const [currencyState, message] of [
    [{}, 'currency.noData'],
    [{ type: 'gem', syncedTypes: ['currency'] }, 'currency.notSyncedCategory']
  ]) {
    const { syncs, cell, button, label } = render(currencyState);
    assert.equal(cell.textContent, message);
    assert.equal(cell.colSpan, 4);
    assert.equal(button.className, 'btn btn-secondary btn-small currency-empty-sync');
    assert.equal(button.type, 'button');
    assert.match(button.markup, /^<svg class="icon icon-sm"[^>]*aria-hidden="true"><use href="assets\/icons\.svg#sync"\/><\/svg>$/);
    assert.equal(label.getAttribute('data-i18n'), 'currency.syncNow');
    assert.equal(label.textContent, 'currency.syncNow');
    button.click();
    assert.deepEqual(syncs, ['sync'], message);

    const restricted = render(currencyState, false);
    assert.equal(restricted.cell.textContent, message);
    assert.equal(restricted.button, undefined);
  }

  // The sync read this tab's type and poe.ninja lists none of it this league, so a sync cannot help.
  const empty = render({ type: 'incubator', syncedTypes: ['currency', 'incubator'] });
  assert.equal(empty.cell.textContent, 'currency.emptyCategory');
  assert.equal(empty.button, undefined);

  // A search that matches nothing offers to clear it.
  const search = render({ search: 'mirrorr', type: 'gem', syncedTypes: [] });
  assert.equal(search.cell.textContent, 'currency.noMatch');
  assert.equal(search.button.className, 'btn btn-secondary btn-small');
  assert.equal(search.label.getAttribute('data-i18n'), 'currency.clearSearch');
  search.button.click();
  assert.deepEqual(search.searchClears, ['clear']);

  // A failed load keeps its message on every redraw and offers Retry.
  const reloads = [];
  const failed = loadCurrencyTableRenderer({
    currencyState: { loadError: new Error('main went away'), prices: [{ itemName: 'Divine Orb', chaosValue: 150 }] },
    loadCurrencyPrices: async () => reloads.push('load')
  });
  failed.context.renderCurrencyTable();
  const failedCell = failed.tbody.children[0].children[0];
  assert.equal(failedCell.textContent, 'currency.loadError');
  const [retry] = descendantsWithClass(failedCell, 'btn');
  assert.equal(retry.querySelector('.btn-label').getAttribute('data-i18n'), 'currency.retry');
  retry.click();
  assert.deepEqual(reloads, ['load']);
});

test('selectCurrencyEmptyState tells a skipped category from one with no listings', () => {
  const context = vm.createContext({});
  loadAppFunctions(context, ['selectCurrencyEmptyState']);
  const select = (state) => context.selectCurrencyEmptyState(state);

  assert.equal(select({ search: 'x', type: 'gem', syncedTypes: ['gem'] }), 'noMatch');
  assert.equal(select({ type: '' }), 'noData');
  assert.equal(select({ type: 'gem', syncedTypes: ['gem'] }), 'zeroListings');
  assert.equal(select({ type: 'gem', syncedTypes: ['currency'] }), 'notSynced');
  assert.equal(select({ type: 'gem', syncedTypes: null }), 'notSynced');
});

test('currency rows merge art, name and type into one Item cell, with the type only in the All view', () => {
  const prices = [
    { itemName: 'House of Mirrors', itemType: 'divination_card', chaosValue: 9000, divineValue: 60, change: -3.2 },
    { itemName: 'Chaos Orb', itemType: 'currency', chaosValue: 1, divineValue: 0.006, change: null }
  ];
  const { context, tbody } = loadCurrencyTableRenderer({ currencyState: { prices } });
  context.renderCurrencyTable();

  assert.equal(tbody.children.length, 2);
  const [row] = tbody.children;
  assert.equal(row.className, 'currency-row');
  // The rows are one Tab stop: the first row, or the open one.
  assert.deepEqual(tbody.children.map((child) => child.tabIndex), [0, -1]);
  assert.equal(row.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(row.children.map((cell) => cell.className), ['currency-td-item', 'currency-td-chaos', 'currency-td-divine', 'currency-td-change']);
  const name = descendantsWithClass(row, 'currency-item-name')[0];
  assert.equal(name.textContent, 'House of Mirrors');
  assert.equal(name.title, 'House of Mirrors');
  assert.equal(descendantsWithClass(row, 'currency-item-meta')[0].textContent, 'label:divination_card');
  assert.equal(descendantsWithClass(row, 'item-slot').length, 1);
  assert.equal(descendantsWithClass(row, 'currency-change')[0].textContent, '-3.2');

  // A tab already names the type.
  const filtered = loadCurrencyTableRenderer({ currencyState: { prices: [prices[0]], type: 'divination_card' } });
  filtered.context.renderCurrencyTable();
  assert.deepEqual(descendantsWithClass(filtered.tbody, 'currency-item-meta'), []);

  // The open detail stays open when the table redraws.
  const open = loadCurrencyTableRenderer({ currencyState: { prices, expandedKey: 'chaos orb' } });
  open.context.renderCurrencyTable();
  assert.deepEqual(open.tbody.children.map((child) => child.className), ['currency-row', 'currency-row', 'currency-detail-row']);
  assert.equal(open.tbody.children[1].getAttribute('aria-expanded'), 'true');
  assert.equal(open.tbody.children[2].textContent, 'Chaos Orb');
  assert.deepEqual(open.tbody.children.slice(0, 2).map((child) => child.tabIndex), [-1, 0]);
});

test('sorting by the 7d change puts rows without a change last in both orders', () => {
  const prices = [
    { itemName: 'Flat', change: 0 },
    { itemName: 'Unknown', change: null },
    { itemName: 'Gainer', change: 12.4 },
    { itemName: 'Missing' },
    { itemName: 'Loser', change: -81.5 }
  ];
  const order = (sortDir) => {
    const { context, tbody } = loadCurrencyTableRenderer({ currencyState: { prices, sortField: 'change', sortDir } });
    context.renderCurrencyTable();
    return tbody.children.map((row) => descendantsWithClass(row, 'currency-item-name')[0].textContent);
  };
  assert.deepEqual(order('desc'), ['Gainer', 'Flat', 'Loser', 'Unknown', 'Missing']);
  assert.deepEqual(order('asc'), ['Loser', 'Flat', 'Gainer', 'Unknown', 'Missing']);
});

test('arrow keys, Home and End move focus between price rows and carry the one Tab stop', () => {
  const focused = [];
  const tbody = {};
  const rows = ['a', 'b', 'c'].map((name, index) => ({ name, tabIndex: index ? -1 : 0, parentElement: tbody, focus: () => focused.push(name) }));
  tbody.querySelectorAll = (selector) => {
    assert.equal(selector, '.currency-row');
    return rows;
  };
  const context = vm.createContext({});
  loadAppFunctions(context, ['moveCurrencyRowFocus']);
  const tabIndexes = () => rows.map((row) => row.tabIndex);

  assert.equal(context.moveCurrencyRowFocus(rows[0], 'ArrowDown'), true);
  assert.deepEqual(tabIndexes(), [-1, 0, -1]);
  assert.equal(context.moveCurrencyRowFocus(rows[1], 'End'), true);
  assert.deepEqual(tabIndexes(), [-1, -1, 0]);
  // Past the last row nothing moves, and the key is left to the page.
  assert.equal(context.moveCurrencyRowFocus(rows[2], 'ArrowDown'), false);
  assert.equal(context.moveCurrencyRowFocus(rows[2], 'ArrowUp'), true);
  assert.equal(context.moveCurrencyRowFocus(rows[1], 'Home'), true);
  assert.equal(context.moveCurrencyRowFocus(rows[0], 'Tab'), false);
  assert.deepEqual(tabIndexes(), [0, -1, -1]);
  assert.deepEqual(focused, ['b', 'c', 'b', 'a']);
});

test('currency rows colour the chaos value by loot-filter tier against the list\'s own Divine and Mirror prices', () => {
  const prices = [
    { itemName: 'Blessed Orb', chaosValue: 200, divineValue: 1.3 },
    { itemName: 'Hinekora\'s Lock', chaosValue: 800, divineValue: 5.3 },
    { itemName: 'Mirror of Kalandra', chaosValue: 90000, divineValue: 600 }
  ];
  const { context, tbody } = loadCurrencyTableRenderer({
    currencyState: { prices, rates: { divineChaos: 150, mirrorChaos: 90000 } }
  });
  const tiers = () => tbody.children.map((row) => descendantsWithClass(row, 'currency-td-chaos')[0].dataset.profitTier);

  context.renderCurrencyTable();
  assert.deepEqual(tiers(), ['mirror', 'unique', 'rare']);
  for (const row of tbody.children) {
    assert.equal(descendantsWithClass(row, 'currency-td-divine')[0].dataset.profitTier, undefined);
  }

  // Without the list's Divine price the size of a value is unknown.
  context.currencyState.rates = {};
  context.renderCurrencyTable();
  assert.deepEqual(tiers(), ['normal', 'normal', 'normal']);
});

test('the header Sync and the table Sync now start one sync between them', async () => {
  let finishSync;
  const { context, tbody, header, syncCalls } = loadCurrencyTableRenderer({
    syncCurrencyPrices: () => new Promise((resolve) => { finishSync = resolve; })
  });
  context.renderCurrencyTable();
  const [inline] = descendantsWithClass(tbody, 'btn');

  const first = context.handleCurrencySync();
  const second = context.handleCurrencySync();
  assert.deepEqual(syncCalls, [{ league: 'Mirage', poeVersion: 'poe1' }]);
  assert.equal(context.currencyState.syncing, true);
  for (const button of [header, inline]) {
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute('aria-busy'), 'true');
    assert.equal(button.querySelector('.btn-label').textContent, 'currency.syncing');
  }

  // A Sync now drawn while the sync runs shows that sync.
  context.renderCurrencyTable();
  const [redrawn] = descendantsWithClass(tbody, 'btn');
  assert.notEqual(redrawn, inline);
  assert.equal(redrawn.disabled, true);

  finishSync({});
  await Promise.all([first, second]);
  assert.equal(syncCalls.length, 1);
  assert.equal(context.currencyState.syncing, false);
  for (const [button, idleLabel] of [[header, 'currency.sync'], [redrawn, 'currency.syncNow']]) {
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute('aria-busy'), null);
    assert.equal(button.querySelector('.btn-label').textContent, idleLabel);
  }
});

test('coming back to the Currency page while a sync runs keeps the header Sync busy', async () => {
  let finishSync;
  const { context, header } = loadCurrencyTableRenderer({
    syncCurrencyPrices: () => new Promise((resolve) => { finishSync = resolve; })
  });

  const sync = context.handleCurrencySync();
  await context.loadCurrencyPage();
  assert.equal(header.disabled, true);
  assert.equal(header.getAttribute('aria-busy'), 'true');
  assert.equal(header.querySelector('.btn-label').textContent, 'currency.syncing');

  finishSync({});
  await sync;
  assert.equal(header.disabled, false);
  await context.loadCurrencyPage();
  assert.equal(header.disabled, false);

  const restricted = loadCurrencyTableRenderer({ canSync: false });
  await restricted.context.loadCurrencyPage();
  assert.equal(restricted.header.disabled, true);
  assert.equal(restricted.header.title, 'currency.syncRestricted');
});

test('a keyboard user who started a currency sync gets focus back on a Sync control', async () => {
  // loadCurrencyPrices draws the table again, which drops focus from a Sync now it replaces.
  const run = async ({ listed: rows, focusMovesTo }) => {
    const harness = loadCurrencyTableRenderer({
      loadCurrencyPrices: async () => {
        harness.context.currencyState.prices = rows;
        harness.context.renderCurrencyTable();
        harness.document.activeElement = focusMovesTo || harness.document.body;
      }
    });
    harness.context.renderCurrencyTable();
    descendantsWithClass(harness.tbody, 'btn')[0].focus();
    await harness.context.handleCurrencySync();
    return harness;
  };

  const empty = await run({ listed: [] });
  assert.equal(empty.document.activeElement, descendantsWithClass(empty.tbody, 'btn')[0]);

  const filled = await run({ listed: [{ itemName: 'Divine Orb', chaosValue: 150 }] });
  assert.equal(filled.document.activeElement, filled.header);

  const search = { className: 'currency-search' };
  const elsewhere = await run({ listed: [], focusMovesTo: search });
  assert.equal(elsewhere.document.activeElement, search);
});

// app.js's category lists, art tables and the Currency helpers that read them, for one game at a time.
function loadCurrencyHelpers({ poeVersion = 'poe1', document = createFakeDocument() } = {}) {
  const context = vm.createContext({
    document,
    URL,
    window: { t: (key) => key, location: { href: 'file:///app/index.html' } },
    state: { settings: { poeVersion } },
    currencyState: { poeVersion, type: '' },
    setToggleButtonPressed() {},
    loadCurrencyPrices() {}
  });
  vm.runInContext(
    [
      'POE1_CATEGORY_TYPES', 'POE2_CATEGORY_TYPES', 'CURRENCY_TAB_GLYPH_SVG', 'CURRENCY_ROW_CHEST_SVG', 'PRICE_CHANGE_ARROW_SVG',
      'CURRENCY_IMAGE_VARIANTS', 'CURRENCY_IMAGES'
    ].map(constSource).join('\n'),
    context
  );
  loadAppFunctions(context, [
    'getCurrencyAssetPath', 'normalizeSafeImageSrc', 'normalizeLootCategory', 'formatLootCategoryLabel',
    'getCurrencyCategoryList', 'getCurrencyTypeLabel', 'getCurrencyCategoryArt', 'resolveCurrencyRowArt',
    'createCurrencyItemSlot', 'updateTypeFilterDropdown', 'updateCurrencyTypeCounts', 'formatPriceChange',
    'createPriceChangeElement', 'createSparklineElement'
  ]);
  return context;
}

// Draws the category rail from app.js's own category lists, as updateTypeFilterDropdown does for one game.
function renderCategoryRail(poeVersion) {
  const container = { innerHTML: '', querySelectorAll: () => [] };
  const context = loadCurrencyHelpers({ poeVersion });
  context.document.getElementById = (id) => (id === 'currency-type-filter' ? container : null);
  context.updateTypeFilterDropdown();
  return container.innerHTML;
}

test('the currency rail has no version pill and its art is decorative next to the label', () => {
  for (const poeVersion of ['poe1', 'poe2']) {
    const rail = renderCategoryRail(poeVersion);
    assert.doesNotMatch(rail, /currency-version-badge/, poeVersion);
    const images = rail.match(/<img [^>]*>/g) || [];
    assert.ok(images.length > 0, poeVersion);
    for (const image of images) {
      assert.match(image, / alt=""/, image);
    }
  }
  assert.doesNotMatch(stylesCss, /currency-version-badge/);
  assert.doesNotMatch(appJs, /currency-version-badge/);
});

test('every category tab shows its bundled art or our line icon in a slot, never an empty box or a stand-in orb', () => {
  const expectedArt = {
    poe1: {
      currency: 'chaos', fragment: 'fragment', scarab: 'scarab', essence: 'essence', fossil: 'fossil', map: 'map',
      divination_card: 'divination-card', gem: 'gem', unique: 'unique', oil: 'oil', beast: 'beast',
      delirium_orb: 'delirium-orb', catalyst: 'catalyst', omen: 'omen', tattoo: 'tattoo'
    },
    poe2: {
      currency: 'chaos', fragment: 'fragment', essence: 'essence', rune: 'rune', gem: 'uncut-gem',
      soul_core: 'soul-core', idol: 'idol', expedition: 'expedition'
    }
  };
  // All is our layers icon; the tabs that are no game category, or have no current art, get our chest.
  const expectedGlyph = {
    poe1: { '': 'layers', incubator: 'chest', rune: 'chest', base_type: 'chest', other: 'chest' },
    poe2: { '': 'layers', ultimatum: 'chest', vaal: 'chest', other: 'chest' }
  };
  for (const [poeVersion, tabCount] of [['poe1', 20], ['poe2', 12]]) {
    const tabs = renderCategoryRail(poeVersion).match(/<button [\s\S]*?<\/button>/g) || [];
    assert.equal(tabs.length, tabCount, poeVersion);

    for (const tab of tabs) {
      const type = tab.match(/data-type="([^"]*)"/)[1];
      const where = `${poeVersion} ${type || 'all'}`;
      const art = expectedArt[poeVersion][type];
      const glyph = expectedGlyph[poeVersion][type];
      assert.ok(Boolean(art) !== Boolean(glyph), where);
      assert.match(tab, /^<button type="button" class="currency-type-btn[^"]*"/, where);
      assert.match(tab, new RegExp(`aria-pressed="${type === ''}"`), where);
      if (art) {
        const file = poeVersion === 'poe2' && art === 'divine' ? 'divine.webp' : `${art}.png`;
        assert.match(tab, new RegExp(`<span class="item-slot currency-tab-slot"><img src="assets/currency/${poeVersion}/${file}" alt=""`), where);
        assert.ok(fs.existsSync(path.join(desktopRoot, 'src', 'assets', 'currency', poeVersion, file)), where);
      } else {
        assert.match(tab, new RegExp(`<span class="item-slot currency-tab-slot"><svg class="icon"[^>]*aria-hidden="true"><use href="assets/icons\\.svg#${glyph}"/></svg></span>`), where);
      }
      assert.match(tab, /<span class="currency-tab-label">category\.\w+<\/span><span class="currency-tab-count"><\/span><\/button>$/, where);
    }
  }
  assert.match(getCssRule('.currency-tab-slot'), /--slot-size:\s*20px;/);
});

test('rail tabs count the listed prices of their type, and a tab with none is dimmed', () => {
  const makeTab = (type) => {
    const count = { textContent: '' };
    const classes = new Set();
    return {
      dataset: { type },
      querySelector: () => count,
      classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
      count,
      classes
    };
  };
  const tabs = ['', 'currency', 'fragment', 'scarab'].map(makeTab);
  const context = loadCurrencyHelpers();
  context.document.getElementById = () => ({ querySelectorAll: () => tabs });

  context.currencyState.typeCounts = { currency: 1200, fragment: 0, divination_card: 34 };
  context.updateCurrencyTypeCounts();
  assert.deepEqual(tabs.map((tab) => tab.count.textContent), ['1,234', '1,200', '0', '0']);
  assert.deepEqual(tabs.map((tab) => tab.classes.has('currency-type-btn--empty')), [false, false, true, true]);

  // Before a list loads there is nothing to count, so nothing is dimmed.
  context.currencyState.typeCounts = null;
  context.updateCurrencyTypeCounts();
  assert.deepEqual(tabs.map((tab) => tab.count.textContent), ['', '', '', '']);
  assert.deepEqual(tabs.map((tab) => tab.classes.size), [0, 0, 0, 0]);
});

test('every type a game can price has a rail tab, so the tabs add up to All', () => {
  const priceServiceJs = fs.readFileSync(path.join(desktopRoot, 'src', 'modules', 'priceService.js'), 'utf8');
  const start = priceServiceJs.indexOf('const NINJA_ITEM_TYPES = ') + 'const NINJA_ITEM_TYPES = '.length;
  const itemTypeOf = vm.runInNewContext(`(${priceServiceJs.slice(start, priceServiceJs.indexOf('};', start) + 1)})`);
  const registry = require('../src/modules/currencyRegistry');

  for (const poeVersion of ['poe1', 'poe2']) {
    registry.setPoeVersion(poeVersion);
    // queryPrices files a type it cannot map under other.
    const priced = [...registry.getCurrencyTypes(), ...registry.getItemTypes()]
      .map((type) => itemTypeOf[type.toLowerCase()] || 'other');
    assert.ok(priced.includes(poeVersion === 'poe1' ? 'rune' : 'vaal'), poeVersion);

    const context = loadCurrencyHelpers({ poeVersion });
    const tabs = context.getCurrencyCategoryList(poeVersion).map((category) => {
      const count = { textContent: '' };
      return { dataset: { type: category.value }, querySelector: () => count, classList: { toggle() {} }, count };
    });
    context.document.getElementById = () => ({ querySelectorAll: () => tabs });
    context.currencyState.typeCounts = {};
    for (const itemType of priced) {
      assert.ok(tabs.some((tab) => tab.dataset.type === itemType), `${poeVersion} ${itemType} has no tab`);
      context.currencyState.typeCounts[itemType] = (context.currencyState.typeCounts[itemType] || 0) + 1;
    }
    context.updateCurrencyTypeCounts();

    const [all, ...rest] = tabs;
    assert.equal(all.dataset.type, '');
    assert.equal(Number(all.count.textContent), priced.length, poeVersion);
    assert.equal(rest.reduce((sum, tab) => sum + Number(tab.count.textContent), 0), priced.length, poeVersion);
  }
});

test('the Divine column and row detail mark a price too small to show, and leave the rest alone', () => {
  const prices = [
    { itemName: 'Half a Chaos', itemType: 'currency', chaosValue: 0.5, divineValue: 0.5 / 150 },
    { itemName: 'Rounds Up', itemType: 'currency', chaosValue: 0.9, divineValue: 0.006 },
    { itemName: 'Whole', itemType: 'currency', chaosValue: 225, divineValue: 1.5 },
    { itemName: 'Unpriced', itemType: 'currency', chaosValue: 0.001, divineValue: 0 },
    { itemName: 'Missing', itemType: 'currency', chaosValue: 3, divineValue: null }
  ];
  const { context, tbody } = loadCurrencyTableRenderer({ currencyState: { prices, sortField: 'none' } });
  // The real chip and detail in place of the table harness's stand-ins.
  context.window.profitCurrencyModel = require('../src/modules/profitCurrencyModel');
  Object.assign(context, {
    CURRENCY_NAMES: {},
    getCurrencyAssetPath: (type) => `${type}.png`,
    normalizeSafeImageSrc: (src) => src
  });
  loadAppFunctions(context, ['getProfitCurrencyModel', 'formatCurrencyAmount', 'createCurrencyValueElement', 'buildCurrencyDetailRow']);
  // A chip's first child is its number, as text.
  const chipText = (chip) => chip.children[0].trim();
  const rowNamed = (name) => tbody.children.find((row) => descendantsWithClass(row, 'currency-item-name')[0].textContent === name);
  const divineOf = (name) => rowNamed(name).children[2].children[0];

  context.renderCurrencyTable();
  assert.equal(chipText(divineOf('Half a Chaos')), '<0.01');
  assert.equal(chipText(divineOf('Rounds Up')), '0.01');
  assert.equal(chipText(divineOf('Whole')), '1.50');
  // No price stays the dash it was.
  for (const name of ['Unpriced', 'Missing']) {
    assert.equal(divineOf(name).className, 'text-muted', name);
    assert.equal(divineOf(name).textContent, '-', name);
  }
  // The chaos column keeps its rounding.
  assert.equal(chipText(rowNamed('Unpriced').children[1].children[0]), '0');

  const detailValues = (item) => descendantsWithClass(context.buildCurrencyDetailRow(item), 'currency-detail-values')[0].children;
  assert.deepEqual(detailValues(prices[0]).map(chipText), ['0.50', '<0.01']);
  assert.deepEqual(detailValues(prices[2]).map(chipText), ['225', '1.50']);
  // No price, no Divine chip.
  assert.deepEqual(detailValues(prices[3]).map(chipText), ['0']);
  assert.deepEqual(detailValues(prices[4]).map(chipText), ['3.0']);
});

test('price types read as their localized tab label, never as the raw snake_case key', () => {
  const priceServiceJs = fs.readFileSync(path.join(desktopRoot, 'src', 'modules', 'priceService.js'), 'utf8');
  const typesBlock = priceServiceJs.slice(priceServiceJs.indexOf('const NINJA_ITEM_TYPES'), priceServiceJs.indexOf('};', priceServiceJs.indexOf('const NINJA_ITEM_TYPES')));
  const itemTypes = [...new Set([...typesBlock.matchAll(/:\s*'([a-z_]+)'/g)].map((match) => match[1]).concat('other'))];
  assert.ok(itemTypes.includes('divination_card'));

  for (const poeVersion of ['poe1', 'poe2']) {
    const context = loadCurrencyHelpers({ poeVersion });
    for (const itemType of itemTypes) {
      const label = context.getCurrencyTypeLabel(itemType, poeVersion);
      assert.ok(label && !label.includes('_'), `${poeVersion} ${itemType}: ${label}`);
    }
    assert.equal(context.getCurrencyTypeLabel('divination_card', poeVersion), 'category.divCard');
    assert.equal(context.getCurrencyTypeLabel('delirium_orb', poeVersion), 'category.deliriumOrb');
    assert.equal(context.getCurrencyTypeLabel('soul_core', poeVersion), 'category.soulCore');
    // One type in each game's own word: PoE 1 runegrafts, PoE 2 runes. PoE 1 has no Vaal tab, but PoE 2's names it.
    assert.equal(context.getCurrencyTypeLabel('rune', poeVersion), poeVersion === 'poe1' ? 'category.runegraft' : 'category.rune');
    assert.equal(context.getCurrencyTypeLabel('vaal', poeVersion), 'category.vaal');
    assert.equal(context.getCurrencyTypeLabel('lineage_support_gem', poeVersion), 'Lineage Support Gem');
  }
});

test('remote art loads from the game CDN and nowhere else', () => {
  const { normalizeSafeImageSrc } = loadCurrencyHelpers({ poeVersion: 'poe1' });

  assert.equal(normalizeSafeImageSrc('https://web.poecdn.com/gen/image/a.png'), 'https://web.poecdn.com/gen/image/a.png');
  assert.equal(normalizeSafeImageSrc('//web.poecdn.com/gen/image/a.png'), 'https://web.poecdn.com/gen/image/a.png');
  assert.equal(normalizeSafeImageSrc('assets/currency/poe1/fragment.png'), 'assets/currency/poe1/fragment.png');
  for (const refused of [
    'https://tracker.example/x.png',
    'https://web.poecdn.com.evil.example/x.png',
    'https://web.poecdn.com@evil.example/x.png',
    'https://user@web.poecdn.com/x.png',
    'https://web.poecdn.com:8443/x.png',
    'http://web.poecdn.com/x.png',
    'file://192.0.2.1/s/a.png',
    '//192.0.2.1/s/a.png'
  ]) {
    assert.equal(normalizeSafeImageSrc(refused), '', refused);
  }
});

test('a price row takes its own art, then its category art, then our chest icon', () => {
  const poe1 = loadCurrencyHelpers({ poeVersion: 'poe1' });
  const poe2 = loadCurrencyHelpers({ poeVersion: 'poe2' });
  const art = (context, item) => JSON.parse(JSON.stringify(context.resolveCurrencyRowArt(item)));
  const cdn = 'https://web.poecdn.com/gen/image/abc/Doctor.png';

  // poe.ninja's exchange lists divination cards without art, and every card shares one inventory icon.
  assert.deepEqual(art(poe1, { itemType: 'divination_card', iconUrl: null }), {
    remote: '', bundled: 'assets/currency/poe1/divination-card.png'
  });
  assert.deepEqual(art(poe1, { itemType: 'divination_card', iconUrl: cdn }), {
    remote: cdn, bundled: 'assets/currency/poe1/divination-card.png'
  });
  assert.deepEqual(art(poe1, { itemType: 'fragment' }), { remote: '', bundled: 'assets/currency/poe1/fragment.png' });
  assert.deepEqual(art(poe2, { itemType: 'fragment' }), { remote: '', bundled: 'assets/currency/poe2/fragment.png' });
  assert.deepEqual(art(poe2, { itemType: 'idol' }), { remote: '', bundled: 'assets/currency/poe2/idol.png' });
  // A Chaos Orb would read as the item's own art, and the categories without current art have none to give. PoE 2's rune
  // is not a PoE 1 runegraft, and a Vaal Orb would be a stand-in for PoE 2's Vaal items.
  for (const itemType of ['currency', 'other', 'rune', 'vaal', 'base_type']) {
    assert.deepEqual(art(poe1, { itemType }), { remote: '', bundled: '' }, itemType);
  }
  assert.deepEqual(art(poe2, { itemType: 'vaal' }), { remote: '', bundled: '' });
  assert.deepEqual(art(poe2, { itemType: 'rune' }), { remote: '', bundled: 'assets/currency/poe2/rune.png' });
  assert.deepEqual(art(poe1, { itemType: 'gem', iconUrl: 'javascript:alert(1)' }), { remote: '', bundled: 'assets/currency/poe1/gem.png' });

  // Every category art file the rows can fall back to exists.
  for (const context of [poe1, poe2]) {
    const version = context.currencyState.poeVersion;
    for (const category of context.getCurrencyCategoryList(version)) {
      const bundled = context.getCurrencyCategoryArt(category.value, version);
      if (bundled) assert.ok(fs.existsSync(path.join(desktopRoot, 'src', bundled)), bundled);
    }
  }
});

test('a price slot falls back along the art chain when an image fails to load', () => {
  const context = loadCurrencyHelpers({ poeVersion: 'poe1' });
  const cdn = 'https://web.poecdn.com/gen/image/abc/Doctor.png';

  const slot = context.createCurrencyItemSlot({ itemType: 'divination_card', iconUrl: cdn });
  assert.equal(slot.className, 'item-slot');
  let [img] = slot.children;
  assert.equal(img.tagName, 'IMG');
  // Decorative: the name sits next to the slot, and an English alt would not follow the language.
  assert.equal(img.alt, '');
  assert.equal(img.dataset.iconUrl, cdn);
  img.dispatch('error');
  assert.equal(img.src, 'assets/currency/poe1/divination-card.png');
  img.dispatch('error');
  assert.deepEqual(slot.children, []);
  assert.match(slot.markup, /<use href="assets\/icons\.svg#chest"\/>/);

  const bundledOnly = context.createCurrencyItemSlot({ itemType: 'scarab' }, 'poe1', 'currency-detail-slot');
  assert.equal(bundledOnly.className, 'item-slot currency-detail-slot');
  [img] = bundledOnly.children;
  assert.equal(img.src, 'assets/currency/poe1/scarab.png');
  assert.equal(img.dataset.iconUrl, undefined);
  img.dispatch('error');
  assert.match(bundledOnly.markup, /#chest/);

  const none = context.createCurrencyItemSlot({ itemType: 'currency', iconUrl: null });
  assert.deepEqual(none.children, []);
  assert.match(none.markup, /<svg class="icon" width="16" height="16" aria-hidden="true"><use href="assets\/icons\.svg#chest"\/><\/svg>/);
});

test('the 7d change reads as signed text with an arrow, and the sparkline skips missing days', () => {
  const context = loadCurrencyHelpers();
  assert.equal(context.formatPriceChange(12.44), '+12.4%');
  assert.equal(context.formatPriceChange(-81.46), '-81.5%');
  assert.equal(context.formatPriceChange(0.04), '0.0%');
  assert.equal(context.formatPriceChange(1234.56), '+1,234.6%');
  assert.equal(context.formatPriceChange(null), '');
  assert.equal(context.formatPriceChange(undefined), '');
  assert.equal(context.formatPriceChange('x'), '');

  const down = context.createPriceChangeElement(-25.47, { data: [null, 0, null, -9.18, -25.47] });
  assert.equal(down.dataset.trend, 'down');
  const [value, spark] = down.children;
  assert.match(value.markup, /#arrow-down/);
  assert.equal(value.children[0].textContent, '-25.5%');
  // Three real days of five; the missing ones are skipped instead of drawn as 0%.
  const line = spark.children.find((child) => child.tagName === 'POLYLINE');
  assert.equal(line.getAttribute('points').split(' ').length, 3);
  assert.equal(line.style.stroke, 'var(--loss)');

  // The colour follows the week's change, not the first and last points: [-10, -5] is still 5% down.
  const stillDown = context.createSparklineElement({ data: [-10, -5] }, { change: -5 });
  assert.equal(stillDown.children.find((child) => child.tagName === 'POLYLINE').style.stroke, 'var(--loss)');
  const up = context.createPriceChangeElement(3, { data: [1, 2] });
  assert.equal(up.dataset.trend, 'up');
  assert.match(up.children[0].markup, /#arrow-up/);

  const none = context.createPriceChangeElement(null, { data: [] });
  assert.equal(none.dataset.trend, 'none');
  assert.equal(none.children.length, 1);
  assert.equal(none.children[0].children[0].textContent, '-');

  // The detail's larger line marks each day under it.
  const detail = context.createSparklineElement({ data: [1, 2, 3, 4, 5, 6, 7] }, { width: 240, height: 48, change: 1, ticks: true });
  assert.equal(detail.getAttribute('width'), '240');
  assert.equal(detail.children.filter((child) => child.getAttribute('class') === 'currency-spark-tick').length, 7);
});
