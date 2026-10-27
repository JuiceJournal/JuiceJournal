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

const appJs = fs.readFileSync(appJsPath, 'utf8');

function loadAppFunctions(context, functionNames) {
  vm.runInContext(
    functionNames.map((name) => `${extractFunctionSource(appJs, name)};\nthis.${name} = ${name};`).join('\n'),
    context
  );
}

// Runs app.js loadCurrencyPrices against a main process that answers each request when the test says so. Its
// timers run only when the test calls runTimers.
function loadCurrencyPricesRenderer(currencyState = {}) {
  const elements = { 'currency-table-body': { innerHTML: '' }, 'currency-footer': { textContent: '' } };
  const rendered = [];
  const emptyRows = [];
  const requests = [];
  const answers = [];
  const timers = new Map();
  let nextTimer = 0;
  const context = vm.createContext({
    document: { getElementById: (id) => elements[id] || null },
    window: {
      t: (key) => key,
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
      ...currencyState
    },
    renderCurrencyTable: () => rendered.push(context.currencyState.prices.map((price) => price.league)),
    renderCurrencyEmptyRow: (tbody, message) => emptyRows.push(message),
    getUserFacingErrorMessage: (error, key) => key,
    timeAgo: () => 'now'
  });
  loadAppFunctions(context, ['currencyLoadingRowsHTML', 'loadCurrencyPrices']);
  return {
    context,
    tbody: elements['currency-table-body'],
    footer: elements['currency-footer'],
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
  assert.match(tbody.innerHTML, /<tr class="currency-loading-row"><td colspan="7" class="currency-loading-label">currency\.waitingForSync<\/td><\/tr>/);
  // A live region inserted together with its text is not announced, so the label is plain text.
  assert.doesNotMatch(tbody.innerHTML, /role="status"|aria-live/);
  const placeholders = tbody.innerHTML.match(/<tr class="currency-row--placeholder" aria-hidden="true">[\s\S]*?<\/tr>/g) || [];
  assert.equal(placeholders.length, 8);
  for (const row of placeholders) {
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
  assert.equal(footer.textContent, '1 items');
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
  assert.equal(footer.textContent, '1 items');
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

test('currency table shows still rows and clears the footer when another game or league loads', () => {
  for (const currencyState of [{ league: 'Standard' }, { poeVersion: 'poe2' }]) {
    const { context, tbody, footer } = loadCurrencyPricesRenderer({ listedKey: 'poe1:Mirage', ...currencyState });
    tbody.innerHTML = '<tr><td>Divine Orb</td></tr>';
    footer.textContent = '1 items';

    context.loadCurrencyPrices();
    assert.equal((tbody.innerHTML.match(/class="currency-row--placeholder"/g) || []).length, 8, JSON.stringify(currencyState));
    assert.equal(footer.textContent, '');
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
  const { context, tbody, footer, emptyRows, fail } = loadCurrencyPricesRenderer({ listedKey: 'poe1:Standard' });
  tbody.innerHTML = '<tr><td>Divine Orb</td></tr>';
  footer.textContent = '1 items';

  const reload = context.loadCurrencyPrices({ cacheOnly: true });
  fail(0, new Error('main went away'));
  await reload;

  assert.deepEqual(emptyRows, []);
  assert.equal(tbody.innerHTML, '<tr><td>Divine Orb</td></tr>');
  assert.equal(footer.textContent, '1 items');
  assert.equal(context.currencyState.listedKey, 'poe1:Standard');

  // A failed normal load does show the error and forgets the listed league.
  const load = context.loadCurrencyPrices();
  fail(1, new Error('main went away'));
  await load;
  assert.deepEqual(emptyRows, ['currency.loadError']);
  assert.equal(context.currencyState.listedKey, null);
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

test('currency table columns keep fixed widths and line values up on the right', () => {
  assert.match(stylesCss, /\.currency-th-num\s*\{\s*width:\s*40px;\s*\}/);
  assert.match(stylesCss, /\.currency-th-icon\s*\{\s*width:\s*44px;\s*\}/);
  assert.match(stylesCss, /\.currency-th-trend\s*\{\s*width:\s*96px;\s*\}/);
  assert.doesNotMatch(getCssRule('.currency-td-num'), /width:/);
  // `.currency-table th` and `td` set padding and text-align, so the overrides need the table prefix to win.
  assert.match(stylesCss, /\.currency-table \.currency-th-icon,\s*\.currency-table \.currency-td-icon\s*\{\s*padding-inline:\s*6px;\s*\}/);
  assert.match(
    stylesCss,
    /\.currency-table \.currency-th-chaos,\s*\.currency-table \.currency-th-divine,\s*\.currency-table \.currency-td-chaos,\s*\.currency-table \.currency-td-divine\s*\{\s*text-align:\s*right;\s*\}/
  );
  assert.match(stylesCss, /\.currency-td-chaos \.value-chip,\s*\.currency-td-divine \.value-chip\s*\{\s*justify-content:\s*flex-end;\s*\}/);
  // A list sorted by value would glow down its top rows, so the table keeps the tier colour only.
  assert.match(stylesCss, /\.currency-td-chaos\[data-profit-tier\]\s*\{\s*text-shadow:\s*none;\s*\}/);
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

test('the header Sync button carries the sync icon and keeps its text in a label span', () => {
  const button = indexHtml.match(/<button id="currency-sync-btn"[^>]*>[\s\S]*?<\/button>/)[0];
  assert.match(button, /class="btn btn-primary btn-small"/);
  assert.match(button, /<use href="assets\/icons\.svg#sync"\/>/);
  assert.match(button, /<span class="btn-label" data-i18n="currency\.sync">Sync<\/span>/);
});

function descendantsWithClass(root, className) {
  return root.children.flatMap((child) => [
    ...(String(child.className).split(/\s+/).includes(className) ? [child] : []),
    ...descendantsWithClass(child, className)
  ]);
}

// renderCurrencyTable, its empty row and handleCurrencySync in a small fake DOM. Elements keep their children,
// classes, attributes and listeners, so rows and buttons can be read back and clicked.
function loadCurrencyTableRenderer({ currencyState = {}, canSync = true, syncCurrencyPrices, loadCurrencyPrices } = {}) {
  const document = {};
  const createElement = (tagName) => {
    const attributes = {};
    const handlers = {};
    const element = {
      tagName: tagName.toUpperCase(),
      className: '',
      textContent: '',
      dataset: {},
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
        element.children = nodes.flatMap((node) => (node.tagName === '#FRAGMENT' ? node.children : [node]));
      },
      insertAdjacentHTML: (position, html) => { element.markup = html; },
      addEventListener: (type, handler) => { (handlers[type] ||= []).push(handler); },
      click: () => (handlers.click || []).forEach((handler) => handler({ type: 'click' })),
      focus: () => { document.activeElement = element; },
      querySelector: (selector) => descendantsWithClass(element, selector.slice(1))[0] || null
    };
    return element;
  };

  const tbody = createElement('tbody');
  const header = createElement('button');
  const headerLabel = createElement('span');
  headerLabel.className = 'btn-label';
  headerLabel.setAttribute('data-i18n', 'currency.sync');
  headerLabel.textContent = 'currency.sync';
  header.appendChild(headerLabel);
  const byId = { 'currency-table-body': tbody, 'currency-sync-btn': header };

  Object.assign(document, {
    body: createElement('body'),
    createElement,
    createDocumentFragment: () => createElement('#fragment'),
    getElementById: (id) => byId[id] || null,
    querySelectorAll(selector) {
      if (selector === '.poe-toggle-btn') return [];
      assert.equal(selector, '.currency-empty-action .btn');
      return descendantsWithClass(tbody, 'currency-empty-action').flatMap((action) => descendantsWithClass(action, 'btn'));
    },
    querySelector: (selector) => document.querySelectorAll(selector)[0] || null
  });
  document.activeElement = document.body;

  const syncCalls = [];
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
      prices: [], rates: {}, syncing: false,
      ...currencyState
    },
    canCurrentUserSyncPrices: () => canSync,
    state: { settings: { poeVersion: 'poe1' } },
    setToggleButtonPressed() {},
    updateTypeFilterDropdown() {},
    normalizeSafeImageSrc: () => '',
    createCurrencyValueElement: (value) => {
      const chip = createElement('span');
      chip.className = 'value-chip';
      chip.textContent = String(value);
      return chip;
    },
    createSparklineElement: () => null,
    applyCachedItemIcons() {},
    showToast() {},
    getUserFacingErrorMessage: (error, key) => key,
    refreshProfitCurrencyRates: async () => null,
    loadCurrencyLeagues: async () => {},
    loadCurrencyPrices: loadCurrencyPrices || (async () => {})
  });
  loadAppFunctions(context, [
    'getProfitTierFor', 'applyProfitTier', 'setButtonBusy', 'renderCurrencyEmptyRow', 'renderCurrencyTable', 'handleCurrencySync',
    'loadCurrencyPage'
  ]);
  return { context, document, tbody, header, syncCalls };
}

test('an empty currency list offers Sync now to accounts that can sync, but not for a search that matches nothing', () => {
  const syncs = [];
  const { context, tbody } = loadCurrencyTableRenderer();
  context.handleCurrencySync = () => syncs.push('sync');
  context.renderCurrencyTable();

  const cell = tbody.children[0].children[0];
  assert.equal(cell.textContent, 'currency.noData');
  const [button] = descendantsWithClass(cell, 'btn');
  assert.equal(button.className, 'btn btn-secondary btn-small');
  assert.equal(button.type, 'button');
  assert.equal(button.disabled, undefined);
  assert.match(button.markup, /^<svg class="icon icon-sm"[^>]*aria-hidden="true"><use href="assets\/icons\.svg#sync"\/><\/svg>$/);
  const label = button.querySelector('.btn-label');
  assert.equal(label.getAttribute('data-i18n'), 'currency.syncNow');
  assert.equal(label.textContent, 'currency.syncNow');

  button.click();
  assert.deepEqual(syncs, ['sync']);

  const restricted = loadCurrencyTableRenderer({ canSync: false });
  restricted.context.renderCurrencyTable();
  assert.equal(restricted.tbody.children[0].children[0].textContent, 'currency.noData');
  assert.deepEqual(descendantsWithClass(restricted.tbody, 'btn'), []);

  const search = loadCurrencyTableRenderer({ currencyState: { search: 'mirrorr' } });
  search.context.renderCurrencyTable();
  assert.equal(search.tbody.children[0].children[0].textContent, 'currency.noMatch');
  assert.deepEqual(descendantsWithClass(search.tbody, 'btn'), []);
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
  const run = async ({ listed, focusMovesTo }) => {
    const harness = loadCurrencyTableRenderer({
      loadCurrencyPrices: async () => {
        harness.context.currencyState.prices = listed;
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

// Draws the category rail from app.js's own category lists, as updateTypeFilterDropdown does for one game.
function renderCategoryRail(poeVersion) {
  const container = { innerHTML: '', querySelectorAll: () => [] };
  const context = vm.createContext({
    document: { getElementById: (id) => (id === 'currency-type-filter' ? container : null) },
    window: { t: (key) => key },
    currencyState: { poeVersion, type: '' },
    getCurrencyAssetPath: (type, version) => `assets/currency/${version}/${type}.png`
  });
  const listSource = (name) => {
    const start = appJs.indexOf(`const ${name} = [`);
    assert.notEqual(start, -1, `${name} should exist`);
    return appJs.slice(start, appJs.indexOf('\n];', start) + 3);
  };
  vm.runInContext(
    [
      listSource('POE1_CATEGORY_TYPES'),
      listSource('POE2_CATEGORY_TYPES'),
      extractFunctionSource(appJs, 'updateTypeFilterDropdown'),
      'updateTypeFilterDropdown();'
    ].join('\n'),
    context
  );
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

test('category tabs show their own bundled art or an empty slot, never a stand-in orb', () => {
  // The Currency tab keeps the real Chaos Orb; only PoE 2 bundles art for its other categories.
  const expectedArt = {
    poe1: { currency: 'chaos' },
    poe2: {
      currency: 'chaos', fragment: 'fragment', essence: 'essence', rune: 'rune', gem: 'uncut-gem',
      soul_core: 'soul-core', expedition: 'expedition'
    }
  };
  for (const [poeVersion, tabCount] of [['poe1', 19], ['poe2', 11]]) {
    const tabs = renderCategoryRail(poeVersion).match(/<button [\s\S]*?<\/button>/g) || [];
    assert.equal(tabs.length, tabCount, poeVersion);

    const withArt = [];
    for (const tab of tabs) {
      const type = tab.match(/data-type="([^"]*)"/)[1];
      const art = expectedArt[poeVersion][type];
      if (art) {
        withArt.push(type);
        assert.match(tab, new RegExp(`<img src="assets/currency/${poeVersion}/${art}\\.png"`), `${poeVersion} ${type}`);
        assert.doesNotMatch(tab, /<span class="currency-tab-icon"/, `${poeVersion} ${type}`);
      } else {
        assert.doesNotMatch(tab, /<img/, `${poeVersion} ${type || 'all'}`);
        assert.match(tab, /<span class="currency-tab-icon" aria-hidden="true"><\/span>/, `${poeVersion} ${type || 'all'}`);
      }
      assert.match(tab, /<span>category\.\w+<\/span><\/button>$/, `${poeVersion} ${type || 'all'}`);
    }
    assert.deepEqual(withArt, Object.keys(expectedArt[poeVersion]), poeVersion);
  }
});

test('a rail tab without art keeps a 14px icon slot so the labels line up', () => {
  const icon = getCssRule('.currency-tab-icon');
  assert.match(icon, /width:\s*14px;/);
  assert.match(icon, /height:\s*14px;/);
});
