const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const overlayStateModel = require('../src/modules/overlayStateModel');

const overlayJsPath = path.join(__dirname, '..', 'src', 'overlay.js');
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
    replaceWith(...nodes) { element.replacedWith = nodes; }
  };
  return element;
}

// Runs overlay.js against a fake card and fake timers, so the test controls when the clock ticks.
function loadOverlay() {
  const elements = Object.fromEntries(ELEMENT_SELECTORS.map((selector) => [selector, createElement()]));
  const intervals = new Map();
  let nextTimerId = 1;
  const clock = { now: 0 };
  const window = {
    overlayStateModel,
    profitCurrencyModel: require('../src/modules/profitCurrencyModel'),
    profitTierModel: require('../src/modules/profitTierModel')
  };
  const context = vm.createContext({
    window,
    document: {
      readyState: 'complete',
      querySelector: (selector) => elements[selector] || null,
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

  vm.runInContext(fs.readFileSync(overlayJsPath, 'utf8'), context);

  return {
    renderState: window.JuiceOverlay.renderState,
    card: elements['[data-overlay-state]'],
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
  assert.deepEqual(currencyIcon.replacedWith, [' div']);

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
  assert.equal(overlay.secondary.textContent, 'No loot recorded');
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
