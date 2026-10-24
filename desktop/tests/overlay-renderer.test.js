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

function createElement() {
  const attributes = {};
  return {
    textContent: '',
    hidden: false,
    disabled: false,
    dataset: {},
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null; },
    addEventListener() {},
    replaceChildren() {},
    append() {},
    appendChild() {},
    prepend() {}
  };
}

// Runs overlay.js against a fake card and fake timers, so the test controls when the clock ticks.
function loadOverlay() {
  const elements = Object.fromEntries(ELEMENT_SELECTORS.map((selector) => [selector, createElement()]));
  const intervals = new Map();
  let nextTimerId = 1;
  const clock = { now: 0 };
  const window = {
    overlayStateModel,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {}
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
    clearInterval(id) { intervals.delete(id); },
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame
  });

  vm.runInContext(fs.readFileSync(overlayJsPath, 'utf8'), context);

  return {
    renderState: window.JuiceOverlay.renderState,
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
