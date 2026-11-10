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
  '[data-overlay-drops]',
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
    mapResultOverlayModel: require('../src/modules/mapResultOverlayModel'),
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
    drops: elements['[data-overlay-drops]'],
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
  assert.equal(overlay.secondary.textContent, '3 item sayildi');
  assert.equal(overlay.meta.textContent, '5dk 00sn');
  assert.equal(overlay.pin.textContent, 'Sabitle');

  overlay.renderState(mapResult({ netProfit: 40, lootItemCount: 0, farmType: 'No farm type' }));
  assert.equal(overlay.primary.children[0].textContent, 'Farm tipi yok');
  assert.equal(overlay.secondary.textContent, 'Loot sayilmadi');

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
  assert.equal(overlay.meta.textContent, '7 sn icinde baslar');

  overlay.clock.now = now + 2000;
  overlay.tick();
  assert.equal(overlay.meta.textContent, '5 sn icinde baslar');

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

test('the result card shows the amount with its currency icon, the top drops as rows and the tier reaction', () => {
  const overlay = loadOverlay();
  renderResult(overlay, {
    farmType: 'Ritual',
    netProfit: 750,
    durationSeconds: 412,
    poeVersion: 'poe1',
    topOutputs: [{ label: 'Divine Orb', quantityDelta: 3, valueDelta: 600 }]
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

  assert.equal(overlay.secondary.textContent, '', 'the rows carry the loot');
  assert.equal(overlay.drops.hidden, false);
  const [row] = overlay.drops.children;
  assert.equal(row.className, 'jj-drop');
  const [slot, name, worth] = row.children;
  assert.equal(slot.className, 'jj-slot');
  assert.equal(slot.children[0].src, 'assets/currency/poe1/divine.png');
  assert.equal(name.className, 'jj-drop-name');
  assert.equal(name.children[0].className, 'jj-drop-label');
  assert.equal(name.children[0].textContent, 'Divine Orb');
  assert.equal(name.children[1].className, 'jj-drop-qty');
  assert.equal(name.children[1].textContent, '\u00d73');
  assert.equal(worth.className, 'jj-drop-value');
  assert.equal(worth.textContent, '+6.00');
  assert.equal(worth.children[0].className, 'jj-mini');
  assert.equal(worth.children[0].src, 'assets/currency/poe1/divine.png');
  worth.children[0].listeners.error();
  assert.equal(worth.textContent, '+6.00 div', 'a missing image names the currency in text');

  assert.equal(overlay.card.dataset.profitTier, 'unique');
  const [meme, metaText] = overlay.meta.children;
  assert.equal(meme.src, 'assets/brand/reactions/juiced.svg');
  assert.equal(metaText, 'Juiced · 6m 52s');
});

test('the result card uses the same game art only and says how much loot was counted', () => {
  const overlay = loadOverlay();

  renderResult(overlay, { netProfit: 250, poeVersion: 'poe2', topOutputs: [{ label: 'vaal orb', valueDelta: 40 }] });
  assert.equal(overlay.primary.children[2].children[0].src, 'assets/currency/poe2/divine.webp');
  const [poe2Slot] = overlay.drops.children[0].children;
  assert.equal(poe2Slot.children.length, 0, 'no PoE 1 art for a PoE 2 drop: an empty slot well');

  renderResult(overlay, { netProfit: 0, topOutputs: [], lootItemCount: 3 });
  assert.equal(overlay.secondary.textContent, '3 items counted');
  renderResult(overlay, { netProfit: 0, topOutputs: [], lootItemCount: 1 });
  assert.equal(overlay.secondary.textContent, '1 item counted');
  renderResult(overlay, { netProfit: 0, topOutputs: [] });
  assert.equal(overlay.secondary.textContent, 'No loot counted');
});

test('the result card of a map with no loot shows no profit of 0 and no tier', () => {
  const overlay = loadOverlay();
  renderResult(overlay, { netProfit: 0, noLoot: true, durationSeconds: 250, lootItemCount: 0, topOutputs: [] });

  assert.equal(overlay.primary.children.length, 1, 'only the name');
  assert.equal(overlay.secondary.textContent, 'No loot counted');
  assert.equal(overlay.card.dataset.profitTier, undefined);
  assert.equal(overlay.meta.textContent, '4m 10s');

  renderResult(overlay, { netProfit: 0, totalLootChaos: 0, durationSeconds: 250, topOutputs: [] });
  assert.equal(overlay.primary.children.length, 3, 'a stash result of exactly 0 keeps its value');
});

test('the result card of a map still waiting for its inventory loot asks for the inventory instead of saying no loot', () => {
  const overlay = loadOverlay();

  renderResult(overlay, { netProfit: 0, noLoot: true, lootPending: true, durationSeconds: 250, lootItemCount: 0, topOutputs: [] });
  assert.equal(overlay.secondary.textContent, 'Open your inventory to count your loot');
  assert.equal(overlay.primary.children.length, 1, 'still no profit of 0');

  // Loot that arrived wins over the waiting line, and a map not waiting says it counted none.
  renderResult(overlay, { netProfit: 0, lootPending: true, lootItemCount: 3, topOutputs: [] });
  assert.equal(overlay.secondary.textContent, '3 items counted');
  renderResult(overlay, { netProfit: 0, noLoot: true, lootPending: false, durationSeconds: 250, lootItemCount: 0, topOutputs: [] });
  assert.equal(overlay.secondary.textContent, 'No loot counted');

  overlay.renderState({
    visibility: 'visible',
    mode: 'map-result',
    language: 'tr',
    mapResult: { visible: true, result: { netProfit: 0, noLoot: true, lootPending: true, lootItemCount: 0, topOutputs: [] } }
  });
  assert.equal(overlay.secondary.textContent, 'Lootu saymak icin envanterini ac');
});

test('a result whose loot covers several maps says how many', () => {
  const overlay = loadOverlay();

  renderResult(overlay, { netProfit: 10, lootItemCount: 3, lootMapCount: 2, topOutputs: [] });
  assert.equal(overlay.secondary.textContent, '3 items counted · 2 maps');

  renderResult(overlay, { netProfit: 10, lootItemCount: 3, lootMapCount: 1, topOutputs: [] });
  assert.equal(overlay.secondary.textContent, '3 items counted');
});

test('the result card lists at most three worthwhile drops and hides the list when there are none', () => {
  const overlay = loadOverlay();
  renderResult(overlay, {
    netProfit: 900,
    topOutputs: [
      { label: 'Chaos Orb', quantityDelta: 40, valueDelta: 40 },
      { label: 'Worthless', valueDelta: 0 },
      { label: 'Divine Orb', valueDelta: 300 },
      { label: 'Exalted Orb', quantityDelta: 2, valueDelta: 20 },
      { label: 'Fourth', valueDelta: 10 }
    ]
  });
  assert.deepEqual(overlay.drops.children.map((row) => row.children[1].children[0].textContent), ['Chaos Orb', 'Divine Orb', 'Exalted Orb']);
  assert.equal(overlay.drops.children[1].children[1].children[1].textContent, '\u00d71');

  renderResult(overlay, { netProfit: 5, lootItemCount: 3, topOutputs: [{ label: 'Chaos Orb', valueDelta: 0 }] });
  assert.equal(overlay.drops.hidden, true);
  assert.equal(overlay.drops.children.length, 0);
  assert.equal(overlay.secondary.textContent, '3 items counted');
});

test('a drop worth less than the smallest step reads <0.01, not 0', () => {
  const overlay = loadOverlay();
  renderResult(overlay, { netProfit: 5, topOutputs: [{ label: 'Scrap', valueDelta: 0.004 }] });
  const [row] = overlay.drops.children;
  assert.equal(row.children[2].textContent, '<0.01');
});

test('a drop name is item text and only ever goes in as text', () => {
  const overlay = loadOverlay();
  renderResult(overlay, { netProfit: 5, topOutputs: [{ label: '<img src=x onerror=alert(1)>', valueDelta: 5 }] });
  const [row] = overlay.drops.children;
  assert.equal(row.children[1].children[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(row.insertedHTML, undefined);
  assert.equal(row.children[1].insertedHTML, undefined);
  assert.equal(row.children[1].children[0].insertedHTML, undefined);
});

test('the maps note stays on the left of the secondary row beside the drop rows', () => {
  const overlay = loadOverlay();
  renderResult(overlay, { netProfit: 10, lootMapCount: 2, durationSeconds: 60, topOutputs: [{ label: 'Divine Orb', valueDelta: 100 }] });
  assert.equal(overlay.secondary.textContent, '2 maps');
  assert.equal(overlay.meta.textContent, '1m 00s');

  renderResult(overlay, { netProfit: 10, lootMapCount: 1, topOutputs: [{ label: 'Divine Orb', valueDelta: 100 }] });
  assert.equal(overlay.secondary.textContent, '');
});

test('a remote drop icon fills the slot of its own row once the cache has it, and never a later result', async () => {
  const overlay = loadOverlay();
  const pending = {};
  overlay.window.electronAPI = {
    getCachedIcon: (url) => new Promise((resolve) => { pending[url] = resolve; })
  };
  renderResult(overlay, {
    netProfit: 10,
    topOutputs: [
      { label: 'Omen of Light', valueDelta: 50, icon: 'https://cdn.example/omen.png' },
      { label: 'Divine Orb', valueDelta: 40, icon: 'https://cdn.example/divine.png' },
      { label: 'Mystery', valueDelta: 30 }
    ]
  });
  const [omenSlot] = overlay.drops.children[0].children;
  const [divineSlot] = overlay.drops.children[1].children;
  const [mysterySlot] = overlay.drops.children[2].children;
  assert.deepEqual(Object.keys(pending), ['https://cdn.example/omen.png'], 'the bundled art needs no fetch');
  assert.equal(omenSlot.children.length, 0);

  pending['https://cdn.example/omen.png']('file:///cache/omen.png');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(omenSlot.children[0].src, 'file:///cache/omen.png');
  assert.equal(divineSlot.children[0].src, 'assets/currency/poe1/divine.png');
  assert.equal(mysterySlot.children.length, 0);

  // Another result renders while an icon is still loading: its late arrival fills only the rows now on screen.
  renderResult(overlay, { netProfit: 10, topOutputs: [{ label: 'Rune', valueDelta: 5, icon: 'https://cdn.example/rune.png' }] });
  const [runeSlot] = overlay.drops.children[0].children;
  renderResult(overlay, { netProfit: 10, topOutputs: [{ label: 'Other', valueDelta: 5 }] });
  pending['https://cdn.example/rune.png']('file:///cache/rune.png');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runeSlot.children.length, 0, 'the slot of a replaced row stays as it was');
  assert.equal(overlay.drops.children[0].children[0].children.length, 0);

  // A cached icon is there at once the next time.
  renderResult(overlay, { netProfit: 10, topOutputs: [{ label: 'Rune', valueDelta: 5, icon: 'https://cdn.example/rune.png' }] });
  assert.equal(overlay.drops.children[0].children[0].children[0].src, 'file:///cache/rune.png');
});

test('leaving the result card clears its rows', () => {
  const overlay = loadOverlay();
  renderResult(overlay, { netProfit: 10, topOutputs: [{ label: 'Divine Orb', valueDelta: 100 }] });
  overlay.renderState({ visibility: 'visible', mode: 'inventory-status', primaryLine: 'Inventory', secondaryLine: 'x' });
  assert.equal(overlay.drops.hidden, true);
  assert.equal(overlay.drops.children.length, 0);
});

test('the inventory status mode shows its note under an Inventory kicker with nothing else', () => {
  const overlay = loadOverlay();

  overlay.renderState({ visibility: 'visible', mode: 'inventory-status', primaryLine: 'Open your inventory first.' });

  assert.equal(overlay.kicker.textContent, 'Inventory');
  assert.equal(overlay.primary.children[0].textContent, 'Open your inventory first.');
  assert.equal(overlay.primary.children.length, 1);
  assert.equal(overlay.secondary.textContent, '');
  assert.equal(overlay.meta.textContent, '');

  overlay.renderState({ visibility: 'visible', mode: 'inventory-status', language: 'tr', primaryLine: 'Once envanterini ac.' });
  assert.equal(overlay.kicker.textContent, 'Envanter');
  assert.equal(overlay.primary.children[0].textContent, 'Once envanterini ac.');
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

test('the start prompt counts down to starting the map on its own', () => {
  const overlay = loadOverlay();
  const now = Date.parse('2026-05-04T12:15:12.000Z');
  overlay.clock.now = now;

  overlay.renderState(overlayStateModel.deriveOverlayState({
    enabled: true,
    now,
    startMapPrompt: { mapName: 'Channel', expiresAt: now + 7000 }
  }));
  assert.equal(overlay.meta.textContent, 'starts in 7s');
  assert.equal(overlay.intervals.size, 1);

  overlay.clock.now = now + 2000;
  overlay.tick();
  assert.equal(overlay.meta.textContent, 'starts in 5s');
});

test('at 0 the start prompt takes no more clicks, and the next prompt takes them again', () => {
  const overlay = loadOverlay({
    extraSelectors: ['[data-overlay-start-form]', '[data-overlay-start-farm-types]', '[data-overlay-start-submit]', '[data-overlay-start-cancel]']
  });
  const submit = overlay.elements['[data-overlay-start-submit]'];
  const cancel = overlay.elements['[data-overlay-start-cancel]'];
  const now = Date.parse('2026-05-04T12:15:12.000Z');
  overlay.clock.now = now;
  const show = (at) => overlay.renderState(overlayStateModel.deriveOverlayState({
    enabled: true,
    now: at,
    startMapPrompt: { mapName: 'Channel', expiresAt: at + 7000 }
  }));

  show(now);
  overlay.clock.now = now + 6000;
  overlay.tick();
  assert.equal(submit.disabled, false);

  overlay.clock.now = now + 7000;
  overlay.tick();
  assert.equal(overlay.meta.textContent, 'starts in 0s');
  assert.equal(submit.disabled, true);
  assert.equal(cancel.disabled, true);

  // The same map entered again is a new prompt.
  show(now + 60000);
  assert.equal(submit.disabled, false);
  assert.equal(cancel.disabled, false);
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

test('the start prompt chips show each farm type\'s entry cost, and a farm type without one says where to set it', () => {
  const overlay = loadOverlay({
    extraSelectors: ['[data-overlay-start-form]', '[data-overlay-start-farm-types]', '[data-overlay-start-cost-note]']
  });
  const prompt = (farmTypeId) => overlay.renderState({
    visibility: 'visible',
    mode: 'start-map-prompt',
    startMapPrompt: {
      mapName: 'Burial Chambers',
      farmTypeId,
      farmTypeOptions: [{ id: 'breach', label: 'Breach', cost: '1.2 div' }, { id: 'ritual', label: 'Ritual' }]
    }
  });
  const note = overlay.elements['[data-overlay-start-cost-note]'];

  prompt('breach');
  const chips = overlay.elements['[data-overlay-start-farm-types]'].innerHTML;
  assert.match(chips, /Breach<span class="jj-chip-cost">1\.2 div<\/span><\/button>/);
  assert.match(chips, /aria-pressed="false">Ritual<\/button>/);
  assert.equal(note.hidden, true);

  prompt('ritual');
  assert.equal(note.hidden, false);
  assert.equal(note.textContent, 'No entry cost yet: click the box and type it.');

  // A cost is kept per farm type, so No farm type asks for one first.
  prompt(null);
  assert.equal(note.hidden, false);
  assert.equal(note.textContent, 'Pick a farm type to set its entry cost.');
});

// The start card with its cost box, wired to a fake electronAPI that records what the overlay asks main for.
function loadCostCard() {
  const overlay = loadOverlay({
    extraSelectors: [
      '[data-overlay-start-form]', '[data-overlay-start-farm-types]', '[data-overlay-start-cost-note]',
      '[data-overlay-start-cost-input]', '[data-overlay-start-cost-units]', '[data-overlay-start-submit]', '[data-overlay-start-cancel]'
    ]
  });
  const calls = [];
  const unitButtons = ['chaos', 'divine'].map((unit) => {
    const button = createElement('button');
    button.setAttribute('data-cost-unit', unit);
    return button;
  });
  const units = overlay.elements['[data-overlay-start-cost-units]'];
  units.querySelectorAll = (selector) => (selector === 'button' || selector === '[data-cost-unit]' ? unitButtons : []);
  const input = overlay.elements['[data-overlay-start-cost-input]'];
  input.value = '';
  input.focus = () => { calls.push(['focus-input']); input.listeners.focus?.(); };
  input.blur = () => { calls.push(['blur-input']); input.listeners.blur?.(); };
  let confirmAnswer = (payload) => ({ action: 'confirm', ...payload });
  overlay.window.electronAPI = {
    confirmStartMapPromptOverlay: async (payload) => { calls.push(['confirm', JSON.parse(JSON.stringify(payload))]); return confirmAnswer(payload); },
    engageStartMapPromptOverlay: async (options) => { calls.push(['engage', JSON.parse(JSON.stringify(options))]); return true; },
    releaseStartMapPromptKeyboard: async () => { calls.push(['release']); return true; }
  };
  overlay.renderState({
    visibility: 'visible',
    mode: 'start-map-prompt',
    startMapPrompt: {
      mapName: 'Burial Chambers',
      farmTypeId: 'breach',
      createdAt: 1000,
      farmTypeOptions: [
        { id: 'breach', label: 'Breach', cost: '1.2 div', costAmount: 1.2, costUnit: 'divine' },
        { id: 'ritual', label: 'Ritual' }
      ]
    }
  });
  const pick = (farmTypeId) => overlay.elements['[data-overlay-start-farm-types]'].listeners.click({
    target: { closest: () => ({ getAttribute: () => farmTypeId }) }
  });
  const submit = () => overlay.elements['[data-overlay-start-form]'].listeners.submit({ preventDefault() {} });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return {
    overlay,
    calls,
    input,
    unitButtons,
    note: overlay.elements['[data-overlay-start-cost-note]'],
    pick,
    submit,
    settle,
    answerConfirm(answer) { confirmAnswer = answer; }
  };
}

test('the start card\'s cost box shows the selected farm type\'s cost as typed, and only a change is sent with Start', async () => {
  const card = loadCostCard();
  assert.equal(card.input.value, '1.2');
  assert.equal(card.input.disabled, false);
  assert.deepEqual(card.unitButtons.map((b) => b.getAttribute('aria-pressed')), ['false', 'true']);

  card.submit();
  await card.settle();
  assert.deepEqual(card.calls.at(-1), ['confirm', { farmTypeId: 'breach' }]);

  // A farm type without a cost starts empty; a typed amount, with a comma, goes with the farm type.
  card.pick('ritual');
  assert.equal(card.input.value, '');
  assert.deepEqual(card.calls.at(-1), ['engage', { keyboard: false }], 'picking a farm type stops the countdown');
  card.input.value = '35,5';
  card.submit();
  await card.settle();
  assert.deepEqual(card.calls.at(-1), ['confirm', { farmTypeId: 'ritual', cost: { amount: 35.5, unit: 'chaos' } }]);

  // Clicking the farm type already picked keeps what was typed.
  card.input.value = '40';
  card.pick('ritual');
  assert.equal(card.input.value, '40');

  // No farm type has no cost box.
  card.pick('');
  assert.equal(card.input.disabled, true);
  assert.equal(card.unitButtons[0].disabled, true);
  card.submit();
  await card.settle();
  assert.deepEqual(card.calls.at(-1), ['confirm', { farmTypeId: null }]);
});

test('an unreadable or unsaved cost keeps the start card up and says why', async () => {
  const card = loadCostCard();
  card.input.value = 'abc';
  const before = card.calls.length;
  card.submit();
  await card.settle();
  assert.equal(card.calls.length, before, 'nothing is sent');
  assert.equal(card.note.textContent, 'Enter a number from 0 to 10000.');
  assert.equal(card.note.getAttribute('data-tone'), 'error');

  // Typing clears the error.
  card.input.listeners.input();
  assert.notEqual(card.note.getAttribute('data-tone'), 'error');

  card.input.value = '3';
  card.answerConfirm(() => ({ ok: false, error: 'COST_INVALID' }));
  card.calls.length = 0;
  card.submit();
  await card.settle();
  assert.equal(card.note.textContent, 'Could not save the entry cost.');
  // The box gets the keyboard back, enabled, so the amount can be fixed.
  assert.equal(card.input.disabled, false);
  assert.deepEqual(card.calls.at(-1), ['focus-input']);
});

test('the cost box borrows the keyboard on a click and Esc gives it back to the game', async () => {
  const card = loadCostCard();

  card.input.listeners.mousedown();
  await card.settle();
  assert.deepEqual(card.calls.slice(0, 2), [['engage', { keyboard: true }], ['focus-input']]);
  assert.equal(card.note.textContent, 'Enter saves it and starts the map, Esc goes back to the game.');

  let prevented = false;
  card.input.listeners.keydown({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(card.calls.slice(2), [['blur-input'], ['release']]);
  // Other keys are the box's own.
  card.input.listeners.keydown({ key: '5', preventDefault() { assert.fail('only Esc is taken'); } });
});

test('a unit click leaves the keyboard where it is: with the game, or in the box while the player types there', async () => {
  const card = loadCostCard();
  const units = card.overlay.elements['[data-overlay-start-cost-units]'];
  const clickUnit = (index) => units.listeners.click({ target: { closest: () => card.unitButtons[index] } });
  const pressed = () => card.unitButtons.map((b) => b.getAttribute('aria-pressed'));

  // The game has the keyboard: the unit is picked and the countdown stops, and the keys stay with the game. Taken into
  // the box, the keys of the next fight would be typed there and Enter would start the map with them as its cost.
  clickUnit(0);
  await card.settle();
  assert.deepEqual(pressed(), ['true', 'false']);
  assert.deepEqual(card.calls, [['engage', { keyboard: false }]]);

  // Pressing a unit never moves the focus, so a box the player is typing in keeps it.
  let prevented = false;
  units.listeners.mousedown({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);

  // While the player types in the box a unit click changes the unit and nothing else. Asking main again would hand
  // the keyboard back to the game in the middle of the amount.
  card.input.listeners.mousedown();
  await card.settle();
  card.calls.length = 0;
  clickUnit(1);
  await card.settle();
  assert.deepEqual(pressed(), ['false', 'true']);
  assert.deepEqual(card.calls, []);

  // Once the typing has ended (Esc), a unit click goes to main again, without the keyboard.
  card.input.listeners.keydown({ key: 'Escape', preventDefault() {} });
  card.calls.length = 0;
  clickUnit(0);
  await card.settle();
  assert.deepEqual(card.calls, [['engage', { keyboard: false }]]);
});

test('a map with no loot and no baseline says it was not counted, in the warning tone, and asks for the inventory before the next map', () => {
  const overlay = loadOverlay();

  renderResult(overlay, { netProfit: 0, noLoot: true, lootUncounted: true, durationSeconds: 250, lootItemCount: 0, topOutputs: [] });
  assert.equal(overlay.kicker.textContent, 'Map complete \u00b7 not counted');
  assert.equal(overlay.card.dataset.overlayTone, 'uncounted');
  assert.equal(overlay.secondary.textContent, 'Open your inventory before the next map');
  assert.equal(overlay.card.dataset.profitTier, undefined);
  assert.equal(overlay.primary.children.length, 1, 'no profit of 0');

  // An ordinary result keeps its kicker and tone.
  renderResult(overlay, { netProfit: 0, noLoot: true, durationSeconds: 250, lootItemCount: 0, topOutputs: [] });
  assert.equal(overlay.kicker.textContent, 'Map Complete');
  assert.notEqual(overlay.card.dataset.overlayTone, 'uncounted');

  overlay.renderState({
    visibility: 'visible',
    mode: 'map-result',
    language: 'tr',
    mapResult: { visible: true, result: { netProfit: 0, noLoot: true, lootUncounted: true, lootItemCount: 0, topOutputs: [] } }
  });
  assert.equal(overlay.kicker.textContent, 'Map tamamlandi - sayilmadi');
  assert.equal(overlay.secondary.textContent, 'Sonraki mapten once envanterini ac');

});

test('a result whose read left new items unread says so beside its loot line', () => {
  const overlay = loadOverlay();

  renderResult(overlay, { netProfit: 0, noLoot: true, lootUnread: true, durationSeconds: 250, lootItemCount: 0, topOutputs: [] });
  assert.equal(overlay.secondary.textContent, 'No loot counted · Some items not read');

  renderResult(overlay, { netProfit: 0, noLoot: true, durationSeconds: 250, lootItemCount: 0, topOutputs: [] });
  assert.equal(overlay.secondary.textContent, 'No loot counted');
});
