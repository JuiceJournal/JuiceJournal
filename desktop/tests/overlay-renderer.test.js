const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const overlayStateModel = require('../src/modules/overlayStateModel');

const overlayJsPath = path.join(__dirname, '..', 'src', 'overlay.js');
const overlayHtmlPath = path.join(__dirname, '..', 'src', 'overlay.html');
const translationsJsPath = path.join(__dirname, '..', 'src', 'modules', 'translations.js');
const ELEMENT_SELECTORS = [
  '[data-overlay-state]',
  '[data-overlay-kicker-label]',
  '[data-overlay-pin]',
  '[data-overlay-dismiss]',
  '[data-overlay-primary]',
  '[data-overlay-secondary]',
  '[data-overlay-meta]'
];

// A fake element that records its children and listeners, so tests can read what the renderer built.
function createElement(tagName = 'span') {
  const attributes = {};
  const element = {
    tagName,
    textContent: '',
    hidden: false,
    disabled: false,
    dataset: {},
    children: [],
    listeners: {},
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null; },
    addEventListener(type, listener) { element.listeners[type] = listener; },
    replaceChildren(...nodes) { element.children = nodes; },
    append(...nodes) { element.children.push(...nodes); },
    appendChild(node) { element.children.push(node); return node; },
    prepend(...nodes) { element.children.unshift(...nodes); },
    insertAdjacentHTML(position, html) { element.insertedHTML = [position, html]; },
    querySelectorAll: () => [],
    remove() { element.removed = true; }
  };
  return element;
}

// Runs overlay.js against a fake card and fake timers, so the test controls when the clock ticks.
function loadOverlay({ extraSelectors = [], farmTypeModel = null } = {}) {
  const elements = Object.fromEntries([...ELEMENT_SELECTORS, ...extraSelectors].map((selector) => [selector, createElement()]));
  const intervals = new Map();
  let nextTimerId = 1;
  const clock = { now: 0 };
  const window = {
    overlayStateModel,
    profitCurrencyModel: require('../src/modules/profitCurrencyModel'),
    profitTierModel: require('../src/modules/profitTierModel'),
    ...(farmTypeModel ? { farmTypeModel } : {})
  };
  const context = vm.createContext({
    window,
    document: {
      readyState: 'complete',
      documentElement: {},
      querySelector: (selector) => elements[selector] || null,
      querySelectorAll: () => [],
      createElement
    },
    Date: { now: () => clock.now },
    setInterval(callback, delay) {
      const id = nextTimerId++;
      intervals.set(id, { callback, delay });
      return id;
    },
    clearInterval(id) { intervals.delete(id); }
  });

  vm.runInContext(fs.readFileSync(translationsJsPath, 'utf8'), context);
  vm.runInContext(fs.readFileSync(overlayJsPath, 'utf8'), context);

  return {
    window,
    elements,
    renderState: window.JuiceOverlay.renderState,
    card: elements['[data-overlay-state]'],
    kicker: elements['[data-overlay-kicker-label]'],
    primary: elements['[data-overlay-primary]'],
    secondary: elements['[data-overlay-secondary]'],
    meta: elements['[data-overlay-meta]'],
    pin: elements['[data-overlay-pin]'],
    intervals,
    clock,
    tick() {
      for (const { callback } of intervals.values()) callback();
    }
  };
}

function createRunningMapState(now) {
  return overlayStateModel.deriveOverlayState({
    enabled: true,
    character: { name: 'MainOne' },
    runtime: {
      currentInstance: { areaName: 'Overgrown', enteredAt: new Date(now - 252 * 1000).toISOString() },
      totalActiveSeconds: 600,
      summary: { status: 'active', currentAreaName: 'Overgrown', currentInstanceSeconds: 0, totalActiveSeconds: 600 }
    },
    now
  });
}

test('overlay renderer ticks the meta line once a second while a map is running', () => {
  const overlay = loadOverlay();
  const now = Date.parse('2026-05-04T12:15:12.000Z');
  overlay.clock.now = now;

  overlay.renderState(createRunningMapState(now));

  assert.equal(overlay.meta.textContent, 'Map 4:12 \u00b7 Total 14:12');
  assert.equal(overlay.intervals.size, 1);
  assert.equal([...overlay.intervals.values()][0].delay, 1000);

  overlay.clock.now = now + 3000;
  overlay.tick();
  assert.equal(overlay.meta.textContent, 'Map 4:15 \u00b7 Total 14:15');

  // A later push replaces the clock but keeps the single timer.
  overlay.renderState(createRunningMapState(now + 3000));
  assert.equal(overlay.intervals.size, 1);
});

test('overlay renderer shows the map result card and its clockless lines in the app language', () => {
  const overlay = loadOverlay();
  const mapResult = (result) => ({ visibility: 'visible', mode: 'map-result', language: 'tr', mapResult: { visible: true, result } });

  overlay.renderState(mapResult({ netProfit: 40, durationSeconds: 300, lootItemCount: 3 }));
  assert.equal(overlay.kicker.textContent, 'Map Tamamlandi');
  assert.equal(overlay.primary.children[0].textContent, 'Tamamlanan Map');
  assert.equal(overlay.secondary.textContent, '3 item tarandi');
  assert.equal(overlay.meta.textContent, '5dk 00sn');
  assert.equal(overlay.pin.textContent, 'Sabitle');

  overlay.renderState(mapResult({ netProfit: 40, lootItemCount: 0, farmType: 'No farm type' }));
  assert.equal(overlay.primary.children[0].textContent, 'Farm tipi yok');
  assert.equal(overlay.secondary.textContent, 'Loot taranmadi');

  overlay.renderState(mapResult({ netProfit: 40, farmType: 'Unknown farm type' }));
  assert.equal(overlay.primary.children[0].textContent, 'Bilinmeyen farm tipi');

  overlay.renderState({ ...mapResult({ netProfit: 40 }), mapResult: { visible: true, pinned: true, result: { netProfit: 40 } } });
  assert.equal(overlay.pin.textContent, 'Sabitlendi');
});

test('overlay renderer labels each prompt and ticks its clock in the app language', () => {
  const overlay = loadOverlay();
  const now = Date.parse('2026-05-04T12:15:12.000Z');
  overlay.clock.now = now;

  overlay.renderState({
    ...overlayStateModel.deriveOverlayState({ enabled: true, now, language: 'tr', startMapPrompt: { mapName: 'Channel', expiresAt: now + 7000 } }),
    language: 'tr'
  });
  assert.equal(overlay.kicker.textContent, 'Yeni Map');
  assert.equal(overlay.primary.children[0].textContent, 'Channel');
  assert.equal(overlay.secondary.textContent, 'Farm tipi sec');
  assert.equal(overlay.meta.textContent, '7 sn icinde kapanir');

  overlay.clock.now = now + 2000;
  overlay.tick();
  assert.equal(overlay.meta.textContent, '5 sn icinde kapanir');

  overlay.renderState({
    ...overlayStateModel.deriveOverlayState({
      enabled: true,
      now,
      language: 'tr',
      characterPrompt: { selectedId: 'a', characters: [{ id: 'a', name: 'MainOne', level: 90 }, { id: 'b', name: 'AltTwo' }] }
    }),
    language: 'tr'
  });
  assert.equal(overlay.kicker.textContent, 'Oynanan karakter');
});

test('overlay.html translates every label it starts with', () => {
  const html = fs.readFileSync(overlayHtmlPath, 'utf8');
  const translations = fs.readFileSync(translationsJsPath, 'utf8');
  for (const [label, key] of [
    ['Dismiss', 'overlay.dismiss'],
    ['Farm Type', 'dashboard.farmType'],
    ['Cancel', 'mapSession.cancel'],
    ['Start Map', 'mapSession.startMap'],
    ['Switch character', 'overlay.switchCharacter'],
    ['Keep', 'overlay.keepCharacter']
  ]) {
    assert.match(html, new RegExp(`data-i18n="${key}"[^>]*>${label}<`), label);
    assert.equal(translations.split(`'${key}':`).length - 1, 2, key);
  }
});

test('overlay renderer stops the clock when nothing is running or the card hides', () => {
  const overlay = loadOverlay();
  const now = Date.parse('2026-05-04T12:15:12.000Z');
  overlay.clock.now = now;

  overlay.renderState(createRunningMapState(now));
  assert.equal(overlay.intervals.size, 1);

  overlay.renderState({ visibility: 'visible', mode: 'map-result', mapResult: { visible: true, result: { netProfit: 40, durationSeconds: 300 } } });
  assert.equal(overlay.intervals.size, 0);
  assert.equal(overlay.meta.textContent, '5m 00s');

  overlay.renderState(createRunningMapState(now));
  overlay.renderState({ ...createRunningMapState(now), visibility: 'hidden' });
  assert.equal(overlay.intervals.size, 0);
});

test('overlay renderer labels the pinned result card in text, not only by colour', () => {
  const overlay = loadOverlay();
  const mapResult = { visible: true, result: { netProfit: 40 } };

  overlay.renderState({ visibility: 'visible', mode: 'map-result', mapResult: { ...mapResult, pinned: true } });
  assert.equal(overlay.pin.getAttribute('aria-pressed'), 'true');
  assert.equal(overlay.pin.textContent, 'Pinned');

  overlay.renderState({ visibility: 'visible', mode: 'map-result', mapResult: { ...mapResult, pinned: false } });
  assert.equal(overlay.pin.getAttribute('aria-pressed'), 'false');
  assert.equal(overlay.pin.textContent, 'Pin');
});

// 1 divine = 100c and 1 mirror = 200,000c.
const RATES = { divineChaos: 100, mirrorChaos: 200000 };

function renderResult(overlay, result) {
  overlay.renderState({ visibility: 'visible', mode: 'map-result', mapResult: { visible: true, result: { profitCurrencyRates: RATES, ...result } } });
}

test('the result card shows the amount with its currency icon, the top drop in a slot and the tier reaction', () => {
  const overlay = loadOverlay();
  renderResult(overlay, {
    farmType: 'Ritual',
    netProfit: 750,
    durationSeconds: 412,
    poeVersion: 'poe1',
    topOutputs: [{ label: 'Divine Orb', valueDelta: 600 }]
  });

  const [, , value] = overlay.primary.children;
  assert.equal(value.className, 'jj-value');
  assert.equal(value.textContent, '+7.50');
  const [currencyIcon] = value.children;
  assert.equal(currencyIcon.src, 'assets/currency/poe1/divine.png');
  assert.equal(currencyIcon.alt, 'Divine Orb');
  // A missing image falls back to naming the currency in text.
  currencyIcon.listeners.error();
  assert.equal(currencyIcon.removed, true);
  assert.equal(value.textContent, '+7.50 div');

  assert.equal(overlay.secondary.textContent, 'Divine Orb +6.00 div');
  const [slot] = overlay.secondary.children;
  assert.equal(slot.className, 'jj-slot');
  assert.equal(slot.children[0].src, 'assets/currency/poe1/divine.png');

  assert.equal(overlay.card.dataset.profitTier, 'unique');
  const [meme, metaText] = overlay.meta.children;
  assert.equal(meme.src, 'assets/brand/reactions/juiced.svg');
  assert.equal(metaText, 'Juiced · 6m 52s');
});

test('the result card uses the same game art only and says how much loot was scanned', () => {
  const overlay = loadOverlay();

  renderResult(overlay, { netProfit: 250, poeVersion: 'poe2', topOutputs: [{ label: 'vaal orb', valueDelta: 40 }] });
  assert.equal(overlay.primary.children[2].children[0].src, 'assets/currency/poe2/divine.webp');
  assert.equal(overlay.secondary.children.length, 0, 'no PoE 1 art for a PoE 2 drop');

  renderResult(overlay, { netProfit: 0, topOutputs: [], lootItemCount: 3 });
  assert.equal(overlay.secondary.textContent, '3 items scanned');
  renderResult(overlay, { netProfit: 0, topOutputs: [], lootItemCount: 1 });
  assert.equal(overlay.secondary.textContent, '1 item scanned');
  renderResult(overlay, { netProfit: 0, topOutputs: [] });
  assert.equal(overlay.secondary.textContent, 'No loot scanned');
});

test('the result card of a map with no loot shows no profit of 0 and no tier', () => {
  const overlay = loadOverlay();
  renderResult(overlay, { netProfit: 0, noLoot: true, durationSeconds: 250, lootItemCount: 0, topOutputs: [] });

  assert.equal(overlay.primary.children.length, 1, 'only the name');
  assert.equal(overlay.secondary.textContent, 'No loot scanned');
  assert.equal(overlay.card.dataset.profitTier, undefined);
  assert.equal(overlay.meta.textContent, '4m 10s');

  renderResult(overlay, { netProfit: 0, totalLootChaos: 0, durationSeconds: 250, topOutputs: [] });
  assert.equal(overlay.primary.children.length, 3, 'a stash result of exactly 0 keeps its value');
});

test('a loss keeps its colour on the card but shows the number in bright text', () => {
  const overlay = loadOverlay();
  renderResult(overlay, { netProfit: -540, durationSeconds: 250, topOutputs: [] });

  assert.equal(overlay.card.dataset.profitTier, 'loss');
  const [value] = overlay.primary.children.slice(2);
  assert.equal(value.textContent, '-5.40');
  const [meme, metaText] = overlay.meta.children;
  assert.equal(meme.src, 'assets/brand/reactions/bricked.svg');
  assert.equal(metaText, 'Bricked · 4m 10s');
});

test('the overlay takes its language from the state main pushes', () => {
  const overlay = loadOverlay();
  const applied = [];
  overlay.window.applyTranslations = () => applied.push(overlay.window._appState.language);

  overlay.renderState({ visibility: 'waiting' });
  overlay.renderState({ visibility: 'waiting', language: 'tr' });
  overlay.renderState({ visibility: 'visible', language: 'tr' });
  overlay.renderState({ visibility: 'waiting', language: 'en' });

  assert.deepEqual(applied, ['tr', 'en']);
});

test('a prompt counts down to closing on its own', () => {
  const overlay = loadOverlay();
  const now = Date.parse('2026-05-04T12:15:12.000Z');
  overlay.clock.now = now;

  overlay.renderState(overlayStateModel.deriveOverlayState({
    enabled: true,
    now,
    startMapPrompt: { mapName: 'Channel', expiresAt: now + 7000 }
  }));
  assert.equal(overlay.meta.textContent, 'closes in 7s');
  assert.equal(overlay.intervals.size, 1);

  overlay.clock.now = now + 2000;
  overlay.tick();
  assert.equal(overlay.meta.textContent, 'closes in 5s');
});

const CUSTOM_FARM_ID = 'custom-3f2b8f6e-0000-4000-8000-000000000001';
const CUSTOM_FARM = { id: CUSTOM_FARM_ID, label: 'Boss Tablets', color: 'amber', icon: 'farm-tablet', poeVersions: ['poe2'] };

test('the overlay result card shows a custom farm type in its colour and icon, also after it was deleted', (t) => {
  const farmTypeModel = require('../src/modules/farmTypeModel');
  t.after(() => farmTypeModel.setCustomFarmTypes([]));
  const overlay = loadOverlay({ farmTypeModel });
  const render = (customFarmTypes) => overlay.renderState({
    visibility: 'visible',
    mode: 'map-result',
    customFarmTypes,
    mapResult: { visible: true, result: { farmTypeId: CUSTOM_FARM_ID, farmType: 'Boss Tablets', netProfit: 40, profitCurrencyRates: RATES } }
  });

  render([CUSTOM_FARM]);
  let [name] = overlay.primary.children;
  assert.equal(name.textContent, 'Boss Tablets');
  assert.equal(name.getAttribute('data-farm-type'), CUSTOM_FARM_ID);
  assert.equal(name.getAttribute('data-farm-color'), 'amber');
  assert.match(name.insertedHTML[1], /assets\/icons\.svg#farm-tablet/);

  render([{ ...CUSTOM_FARM, deletedAt: '2026-11-04T10:00:00.000Z' }]);
  [name] = overlay.primary.children;
  assert.equal(name.textContent, 'Boss Tablets');
  assert.equal(name.getAttribute('data-farm-color'), 'amber');

  // Signed out, the same stored result has nothing to look its colour up in.
  render([]);
  [name] = overlay.primary.children;
  assert.equal(name.textContent, 'Boss Tablets');
  assert.equal(name.getAttribute('data-farm-color'), null);
});

test('the overlay result card shows a farm type name that matches an object property as written', () => {
  const overlay = loadOverlay();

  overlay.renderState({ visibility: 'visible', mode: 'map-result', mapResult: { visible: true, result: { farmType: 'constructor', netProfit: 40, profitCurrencyRates: RATES } } });

  assert.equal(overlay.primary.children[0].textContent, 'constructor');
});

test('the overlay start prompt offers a custom farm type as a coloured chip with its icon', (t) => {
  const farmTypeModel = require('../src/modules/farmTypeModel');
  t.after(() => farmTypeModel.setCustomFarmTypes([]));
  const overlay = loadOverlay({
    farmTypeModel,
    extraSelectors: ['[data-overlay-start-form]', '[data-overlay-start-farm-types]']
  });

  overlay.renderState({
    visibility: 'visible',
    mode: 'start-map-prompt',
    customFarmTypes: [CUSTOM_FARM],
    startMapPrompt: {
      mapName: 'Burial Chambers',
      farmTypeId: CUSTOM_FARM_ID,
      farmTypeOptions: [{ id: CUSTOM_FARM_ID, label: 'Boss <Tablets>' }, { id: 'ritual', label: 'Ritual' }]
    }
  });

  const chips = overlay.elements['[data-overlay-start-farm-types]'].innerHTML;
  assert.match(chips, new RegExp(`data-farm-type-id="${CUSTOM_FARM_ID}" data-farm-type="${CUSTOM_FARM_ID}" data-farm-color="amber" aria-pressed="true">`));
  assert.match(chips, /assets\/icons\.svg#farm-tablet"\/><\/svg>Boss &lt;Tablets&gt;<\/button>/);
  assert.match(chips, /data-farm-type-id="ritual" data-farm-type="ritual" aria-pressed="false">Ritual<\/button>/);
});
