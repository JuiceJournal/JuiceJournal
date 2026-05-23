# Overlay Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize the in-game overlay with glassmorphism design, smooth animations, and reliable Overwolf injection.

**Architecture:** Overlay HTML/CSS rewritten with modern PoE-themed glassmorphism. overlay.js reimplemented with clean state machine. overwolfOverlayProvider.js enhanced with exponential backoff retry and injection state machine. main.js adds proactive injection triggers on game detection.

**Tech Stack:** Vanilla JS, CSS3 (backdrop-filter, keyframes, custom properties), Overwolf GEP overlay API

**Spec:** `docs/superpowers/specs/2026-05-23-overlay-redesign.md`

---

### Task 1: Add exponential backoff retry to overwolfOverlayProvider.js

**Files:**
- Modify: `desktop/src/modules/overwolfOverlayProvider.js` (entire file)
- Test: `desktop/tests/overwolf-overlay-provider.test.js`

- [ ] **Step 1: Add retry state and backoff constants to the provider closure**

Add inside the provider closure (after line 198, before `function isAvailable()`):

```javascript
const MAX_RETRY_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 2000;
let injectionRetryCount = 0;
let injectionRetryTimer = null;
```

- [ ] **Step 2: Add `scheduleInjectionRetry` function**

Add after the status functions:

```javascript
function clearInjectionRetry() {
  if (injectionRetryTimer) {
    clearTimeout(injectionRetryTimer);
    injectionRetryTimer = null;
  }
}

function scheduleInjectionRetry(retryFn) {
  clearInjectionRetry();
  if (injectionRetryCount >= MAX_RETRY_ATTEMPTS) {
    return false;
  }
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, injectionRetryCount);
  injectionRetryTimer = setTimeout(() => {
    injectionRetryTimer = null;
    injectionRetryCount += 1;
    retryFn();
  }, delay);
  return true;
}

function resetInjectionRetry() {
  clearInjectionRetry();
  injectionRetryCount = 0;
}
```

- [ ] **Step 3: Add injection state machine**

Add after retry functions:

```javascript
const INJECTION_STATES = Object.freeze({ IDLE: 'idle', INJECTING: 'injecting', INJECTED: 'injected', FAILED: 'failed' });
let injectionState = INJECTION_STATES.IDLE;

function getInjectionState() { return injectionState; }

function setInjectionState(state) {
  injectionState = state;
  if (state === INJECTION_STATES.INJECTED) {
    resetInjectionRetry();
  }
}
```

- [ ] **Step 4: Add render queue for deferred rendering**

Add after injection state machine:

```javascript
let pendingRenderState = null;

function queueRender(state) {
  pendingRenderState = state;
}

function flushRenderQueue(renderFn) {
  if (pendingRenderState) {
    const state = pendingRenderState;
    pendingRenderState = null;
    return renderFn(state);
  }
  return Promise.resolve(null);
}
```

- [ ] **Step 5: Export new functions**

Update the return statement to include new exports:

```javascript
return {
  isAvailable,
  getStatus,
  renderState,
  hide,
  scheduleInjectionRetry,
  resetInjectionRetry,
  getInjectionState,
  setInjectionState,
  queueRender,
  flushRenderQueue,
  INJECTION_STATES
};
```

- [ ] **Step 6: Run existing tests**

Run: `npm test`
Expected: All existing tests pass (they test the public API which is unchanged)

- [ ] **Step 7: Add test for retry backoff** 

In `desktop/tests/overwolf-overlay-provider.test.js`, add:

```javascript
test('overwolf overlay provider retries injection with exponential backoff up to max attempts', async () => {
  const scheduleCalls = [];
  const provider = createOverwolfOverlayProvider({
    overlayApi: {
      createWindow: () => Promise.resolve({ showInactive: () => {}, executeJavaScript: () => Promise.resolve(), loadFile: () => Promise.resolve() }),
      getActiveGameInfo: () => null
    },
    entryPath: '/fake/overlay.html',
    preloadPath: '/fake/preload.js'
  });

  let retryFn = null;
  const originalSetTimeout = setTimeout;
  let timeoutCallCount = 0;
  globalThis.setTimeout = (fn, delay) => {
    timeoutCallCount++;
    scheduleCalls.push({ call: timeoutCallCount, delay });
    retryFn = fn;
    return { unref: () => {} };
  };

  // First attempt: 2s delay
  provider.scheduleInjectionRetry(() => scheduleCalls.push({ retry: 1 }));
  assert.equal(scheduleCalls[0].delay, 2000);
  // Execute the retry then schedule next
  retryFn();
  assert.equal(scheduleCalls[1].retry, 1);

  // Second attempt: 4s delay
  provider.scheduleInjectionRetry(() => scheduleCalls.push({ retry: 2 }));
  assert.equal(scheduleCalls[2].delay, 4000);

  // Third: 8s
  retryFn();
  provider.scheduleInjectionRetry(() => scheduleCalls.push({ retry: 3 }));
  assert.equal(scheduleCalls[4].delay, 8000);

  // Fourth: 16s
  retryFn();
  provider.scheduleInjectionRetry(() => scheduleCalls.push({ retry: 4 }));
  assert.equal(scheduleCalls[6].delay, 16000);

  // Fifth: 32s
  retryFn();
  provider.scheduleInjectionRetry(() => scheduleCalls.push({ retry: 5 }));
  assert.equal(scheduleCalls[8].delay, 32000);

  // Sixth attempt should be rejected
  retryFn();
  const result = provider.scheduleInjectionRetry(() => scheduleCalls.push({ retry: 6 }));
  assert.equal(result, false);

  // Reset clears count
  provider.resetInjectionRetry();
  const afterReset = provider.scheduleInjectionRetry(() => scheduleCalls.push({ retry: 'after-reset' }));
  assert.equal(afterReset, true);

  globalThis.setTimeout = originalSetTimeout;
});
```

- [ ] **Step 8: Run tests**

Run: `npm test`
Expected: All tests pass including the new retry backoff test

- [ ] **Step 9: Commit**

```bash
git add desktop/src/modules/overwolfOverlayProvider.js desktop/tests/overwolf-overlay-provider.test.js
git commit -m "feat: add exponential backoff retry and injection state machine to overlay provider"
```

---

### Task 2: Proactive injection trigger and elevation toast in main.js

**Files:**
- Modify: `desktop/main.js:1124-1140, 1244-1287`

- [ ] **Step 1: Replace the simple retry with the provider's backoff system**

Replace `scheduleOverwolfOverlayInjectionRetry` (lines 1124-1140) with:

```javascript
function scheduleOverwolfOverlayInjectionRetry(detectedVersion) {
  const provider = getOverwolfOverlayProvider();
  return provider.scheduleInjectionRetry(() => {
    requestOverwolfOverlayInjectionForDetectedGame({
      detectedVersion,
      retry: true
    });
  });
}

function clearOverwolfOverlayInjectionRetry() {
  const provider = getOverwolfOverlayProvider();
  return provider.resetInjectionRetry();
}
```

- [ ] **Step 2: Add elevation mismatch toast to game-launched event**

In `registerOverwolfOverlayEvents` (line 1160-1167), add a notification to the renderer:

```javascript
if (gameInfo?.processInfo?.isElevated) {
  console.warn(`[OverwolfOverlay] Cannot inject into elevated game process: ${gameName}`);
  if (typeof event?.dismiss === 'function') {
    event.dismiss();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('runtime-event', {
      type: 'overlay-elevation-mismatch',
      game: gameName
    });
  }
  return;
}
```

- [ ] **Step 3: Add proactive injection when game is detected**

Find the `applyGameVersion` function call chain where the game detector emits events. Add at the end of `handleGameLaunched` / game detection flow (search for where `updateOverlayWindow` is called after game detection):

```javascript
// After game detection, attempt overlay injection
if (isOverwolfOverlayAvailable()) {
  const detectedVersion = normalizePoeVersion(gameDetector ? gameDetector.getDetectedGame() : null);
  if (detectedVersion) {
    requestOverwolfOverlayInjectionForDetectedGame({ detectedVersion }).catch(() => {});
  }
}
```

- [ ] **Step 4: Add injection state guard in `updateOverlayWindow`**

In the `updateOverlayWindow` function (~line 2981), add an injection state check before rendering via Overwolf:

```javascript
const overwolfAvailable = typeof isOverwolfOverlayAvailable === 'function'
  ? isOverwolfOverlayAvailable()
  : false;

if (overwolfAvailable) {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    overlayWindow.hide();
  }
  const provider = getOverwolfOverlayProvider();
  if (provider.getInjectionState() !== provider.INJECTION_STATES.INJECTED && overlayState.visibility !== 'hidden') {
    provider.queueRender(overlayState);
    return overlayState;
  }
  provider.flushRenderQueue((queuedState) => renderOverwolfOverlayWindow(queuedState));
  renderOverwolfOverlayWindow(overlayState).catch(() => { });
  return overlayState;
}
```

- [ ] **Step 5: Flush render queue on game-injected event**

In the `game-injected` handler (line 1175), add queue flush:

```javascript
overlayApi.on('game-injected', (gameInfo) => {
  if (isOverwolfOverlayGameInfo(gameInfo)) {
    console.info(`[OverwolfOverlay] Game injected ${gameInfo?.name || gameInfo?.id || 'unknown'}`);
    clearOverwolfOverlayInjectionRetry();
    const provider = getOverwolfOverlayProvider();
    provider.setInjectionState(provider.INJECTION_STATES.INJECTED);
    provider.flushRenderQueue((queuedState) => renderOverwolfOverlayWindow(queuedState));
    updateOverlayWindow();
  }
});
```

- [ ] **Step 6: Handle injection failure state**

In the `game-injection-error` handler (line 1183), add failure tracking:

```javascript
overlayApi.on('game-injection-error', (gameInfo, error) => {
  if (isOverwolfOverlayGameInfo(gameInfo)) {
    console.warn('[OverwolfOverlay] Game injection failed', error, gameInfo);
    const provider = getOverwolfOverlayProvider();
    provider.setInjectionState(provider.INJECTION_STATES.FAILED);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('runtime-event', {
        type: 'overlay-injection-failed',
        game: gameInfo?.name || 'unknown'
      });
    }
  }
});
```

- [ ] **Step 7: Add `renderOverwolfOverlayWindow` provider usage**

Update `renderOverwolfOverlayWindow` (~line 1465) to use provider's injection guard and return structured result:

```javascript
function renderOverwolfOverlayWindow(overlayState) {
  const provider = getOverwolfOverlayProvider();
  if (!provider.isAvailable()) {
    return Promise.resolve({
      handled: false,
      provider: 'overwolf',
      reason: 'overlay-api-unavailable'
    });
  }

  return provider.renderState(overlayState).catch((error) => {
    console.warn('[OverwolfOverlayProvider] Failed to render overlay state', error);
    return {
      handled: false,
      provider: 'overwolf',
      reason: 'render-failed'
    };
  });
}
```

(This replaces lines 1465-1491)

- [ ] **Step 8: Run tests**

Run: `npm test`
Expected: Existing Overwolf overlay tests (tests 280-284) still pass

- [ ] **Step 9: Commit**

```bash
git add desktop/main.js
git commit -m "feat: proactive injection, backoff retry, render queue, elevation toast"
```

---

### Task 3: Rewrite overlay.html with modern glassmorphism CSS

**Files:**
- Modify: `desktop/src/overlay.html` (entire file)

- [ ] **Step 1: Write the complete new overlay.html**

```html
<!DOCTYPE html>
<html lang="en" data-overlay-visibility="waiting">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';">
  <title>Juice Journal Overlay</title>
  <style>
    :root {
      --jj-bg: rgba(6, 8, 12, 0.76);
      --jj-border: rgba(200, 155, 60, 0.28);
      --jj-glow: rgba(200, 155, 60, 0.10);
      --jj-text: #e8dcc8;
      --jj-muted: #8a7a60;
      --jj-accent: #c8a84e;
      --jj-positive: #6dd48d;
      --jj-negative: #e8746c;
      --jj-radius: 14px;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; }

    html, body {
      width: 100%; height: 100%;
      overflow: hidden;
      background: transparent;
      color: var(--jj-text);
      font-family: "Inter", "Segoe UI", system-ui, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
    }

    body {
      display: flex;
      align-items: flex-start;
      justify-content: flex-end;
      padding: 16px;
    }

    /* ── Card Shell ── */
    .jj-card {
      position: relative;
      min-width: 320px;
      max-width: 440px;
      border: 1px solid var(--jj-border);
      border-radius: var(--jj-radius);
      background:
        radial-gradient(ellipse at 80% 0%, rgba(200, 155, 60, 0.08), transparent 60%),
        linear-gradient(160deg, rgba(10, 12, 16, 0.82), var(--jj-bg));
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      box-shadow:
        0 0 0 1px rgba(200, 155, 60, 0.06),
        0 8px 32px rgba(0, 0, 0, 0.48),
        0 0 60px var(--jj-glow);
      overflow: hidden;
      transition: transform 250ms cubic-bezier(0.22, 0.84, 0.24, 1),
                  opacity 200ms ease;
    }

    .jj-card::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: linear-gradient(105deg, rgba(200, 155, 60, 0.10), transparent 40%, rgba(255, 255, 255, 0.03));
      pointer-events: none;
    }

    /* ── States ── */
    [data-overlay-state="hidden"] { display: none; }

    [data-overlay-state="waiting"] {
      opacity: 0.7;
      --jj-accent: #8aadd4;
      --jj-border: rgba(138, 173, 212, 0.22);
      --jj-glow: rgba(138, 173, 212, 0.06);
    }

    /* ── Slide animation from right ── */
    [data-overlay-mode="map-result"][data-overlay-state="visible"] {
      animation: jj-slide-in 250ms cubic-bezier(0.22, 0.84, 0.24, 1) both;
    }

    [data-overlay-exiting="true"] {
      animation: jj-slide-out 200ms ease-in both;
    }

    @keyframes jj-slide-in {
      from { opacity: 0; transform: translateX(60px); }
      to   { opacity: 1; transform: translateX(0); }
    }

    @keyframes jj-slide-out {
      from { opacity: 1; transform: translateX(0); }
      to   { opacity: 0; transform: translateX(60px); }
    }

    /* ── Tone variants ── */
    [data-overlay-mode="map-result"][data-overlay-tone="positive"] {
      --jj-accent: var(--jj-positive);
      --jj-border: rgba(109, 212, 141, 0.30);
      --jj-glow: rgba(109, 212, 141, 0.08);
    }

    [data-overlay-mode="map-result"][data-overlay-tone="negative"] {
      --jj-accent: var(--jj-negative);
      --jj-border: rgba(232, 116, 108, 0.30);
      --jj-glow: rgba(232, 116, 108, 0.08);
    }

    [data-overlay-mode="start-map-prompt"][data-overlay-state="visible"] {
      --jj-accent: #d4af60;
      --jj-border: rgba(212, 175, 96, 0.38);
    }

    /* ── Content ── */
    .jj-content {
      position: relative;
      display: grid;
      gap: 8px;
      padding: 14px 16px;
    }

    /* ── Header row ── */
    .jj-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .jj-label {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: var(--jj-accent);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
    }

    .jj-label::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 10px currentColor;
    }

    .jj-actions {
      display: flex;
      gap: 6px;
      pointer-events: auto;
    }

    .jj-btn {
      border: 1px solid rgba(200, 155, 60, 0.25);
      border-radius: 999px;
      background: rgba(8, 10, 14, 0.70);
      color: var(--jj-text);
      padding: 3px 10px;
      font: inherit;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      cursor: pointer;
      pointer-events: auto;
      transition: border-color 120ms, background 120ms;
      white-space: nowrap;
    }

    .jj-btn:hover {
      border-color: rgba(200, 155, 60, 0.55);
      background: rgba(12, 14, 18, 0.88);
    }

    .jj-btn[aria-pressed="true"] {
      border-color: rgba(232, 220, 200, 0.50);
      background: rgba(200, 155, 60, 0.20);
    }

    .jj-btn-dismiss {
      border-color: rgba(232, 116, 108, 0.25);
    }

    .jj-btn-dismiss:hover {
      border-color: rgba(232, 116, 108, 0.55);
    }

    .jj-btn[hidden] { display: none; }

    /* ── Primary line ── */
    .jj-primary {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.01em;
      line-height: 1.25;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ── Secondary row ── */
    .jj-secondary-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      color: var(--jj-muted);
      font-size: 11px;
    }

    .jj-secondary {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .jj-meta {
      flex-shrink: 0;
      color: var(--jj-accent);
      font-variant-numeric: tabular-nums;
    }

    /* ── Start Map Form ── */
    .jj-form {
      display: grid;
      gap: 10px;
      margin-top: 6px;
      pointer-events: auto;
    }

    .jj-form[hidden] { display: none; }

    .jj-field {
      display: grid;
      gap: 4px;
      color: var(--jj-muted);
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    .jj-field input, .jj-field select {
      width: 100%;
      border: 1px solid rgba(212, 175, 96, 0.32);
      border-radius: 10px;
      background: rgba(4, 5, 7, 0.88);
      color: var(--jj-text);
      font: 600 13px "Inter", "Segoe UI", system-ui, sans-serif;
      letter-spacing: 0.02em;
      outline: none;
      padding: 9px 10px;
      transition: border-color 120ms, box-shadow 120ms;
    }

    .jj-field input:focus, .jj-field select:focus {
      border-color: rgba(232, 220, 200, 0.72);
      box-shadow: 0 0 0 2px rgba(212, 175, 96, 0.14);
    }

    .jj-form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .jj-form-btn {
      border: 1px solid rgba(212, 175, 96, 0.35);
      border-radius: 999px;
      background: rgba(8, 10, 14, 0.78);
      color: var(--jj-text);
      cursor: pointer;
      font: 700 10px "Inter", "Segoe UI", system-ui, sans-serif;
      letter-spacing: 0.12em;
      padding: 8px 14px;
      text-transform: uppercase;
      transition: background 120ms, border-color 120ms;
    }

    .jj-form-btn:hover {
      border-color: rgba(212, 175, 96, 0.65);
    }

    .jj-form-btn.primary {
      background: linear-gradient(135deg, #c8a84e, #8b6914);
      color: #0e0a04;
      border-color: transparent;
    }

    .jj-form-btn.primary:hover {
      background: linear-gradient(135deg, #d4b860, #9e7a1e);
    }

    .jj-form-btn:disabled {
      cursor: wait;
      opacity: 0.60;
    }

    /* ── Profit highlight ── */
    .jj-profit {
      font-size: 15px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
  </style>
</head>
<body>
  <main class="jj-card" data-overlay-state="waiting" data-overlay-mode="runtime" data-overlay-tone="neutral" aria-live="polite">
    <section class="jj-content">
      <div class="jj-header">
        <span class="jj-label" data-overlay-kicker-label>Juice Journal</span>
        <div class="jj-actions">
          <button class="jj-btn" type="button" data-overlay-pin aria-pressed="false" hidden>Pin</button>
          <button class="jj-btn jj-btn-dismiss" type="button" data-overlay-dismiss hidden>Dismiss</button>
        </div>
      </div>
      <div class="jj-primary" data-overlay-primary>Waiting for game</div>
      <div class="jj-secondary-row">
        <span class="jj-secondary" data-overlay-secondary>Waiting for runtime session</span>
        <span class="jj-meta" data-overlay-meta></span>
      </div>
      <form class="jj-form" data-overlay-start-form hidden>
        <label class="jj-field">
          <span>Map</span>
          <input type="text" data-overlay-start-map-name autocomplete="off" spellcheck="false">
        </label>
        <label class="jj-field">
          <span>Farm Type</span>
          <select data-overlay-start-farm-type></select>
        </label>
        <div class="jj-form-actions">
          <button class="jj-form-btn" type="button" data-overlay-start-cancel>Cancel</button>
          <button class="jj-form-btn primary" type="submit" data-overlay-start-submit>Start Map</button>
        </div>
      </form>
    </section>
  </main>
  <script src="modules/overlayStateModel.js"></script>
  <script src="modules/profitCurrencyModel.js"></script>
  <script src="overlay.js"></script>
</body>
</html>
```

- [ ] **Step 2: Run e2e overlay smoke test**

Run: `npm run test:smoke`
Expected: Some tests may need selector adjustments. Note which fail.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/overlay.html
git commit -m "feat: redesign overlay HTML with modern glassmorphism PoE theme"
```

---

### Task 4: Rewrite overlay.js with clean state machine and animations

**Files:**
- Modify: `desktop/src/overlay.js` (entire file)

- [ ] **Step 1: Write the new overlay.js**

```javascript
(function initializeOverlay(root) {
  const el = {
    card: document.querySelector('[data-overlay-state]'),
    kickerLabel: document.querySelector('[data-overlay-kicker-label]'),
    pin: document.querySelector('[data-overlay-pin]'),
    dismiss: document.querySelector('[data-overlay-dismiss]'),
    primary: document.querySelector('[data-overlay-primary]'),
    secondary: document.querySelector('[data-overlay-secondary]'),
    meta: document.querySelector('[data-overlay-meta]'),
    startForm: document.querySelector('[data-overlay-start-form]'),
    startMapName: document.querySelector('[data-overlay-start-map-name]'),
    startFarmType: document.querySelector('[data-overlay-start-farm-type]'),
    startSubmit: document.querySelector('[data-overlay-start-submit]'),
    startCancel: document.querySelector('[data-overlay-start-cancel]')
  };

  var passthroughEnabled = true;
  var lastRenderedMode = 'runtime';
  var animFrameId = null;

  function setText(element, value) {
    if (element) { element.textContent = value || ''; }
  }

  function escapeHTML(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function setPointerPassthrough(ignore) {
    var nextValue = ignore !== false;
    if (passthroughEnabled === nextValue) return;
    passthroughEnabled = nextValue;
    if (typeof root.electronAPI?.setOverlayPointerPassthrough === 'function') {
      root.electronAPI.setOverlayPointerPassthrough(nextValue).catch(function () {});
    }
  }

  function normalizeFarmTypeOptions(value) {
    if (!Array.isArray(value)) return [];
    return value.map(function (entry) {
      if (!entry || typeof entry !== 'object') return null;
      var id = String(entry.id || '').trim();
      return id ? { id: id, label: String(entry.label || id).trim() } : null;
    }).filter(Boolean);
  }

  function formatSignedProfit(value, rates) {
    var model = root.profitCurrencyModel;
    if (model && typeof model.formatProfitCurrencyText === 'function') {
      return model.formatProfitCurrencyText(value, rates || {}, { signed: true });
    }
    var rounded = Math.round(Number(value || 0));
    var prefix = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
    return prefix + Math.abs(rounded) + 'c';
  }

  function formatDuration(seconds) {
    var s = Math.max(0, Number(seconds || 0) | 0);
    if (!s) return '';
    var m = (s / 60) | 0;
    var sec = s % 60;
    return m ? m + 'm ' + (sec < 10 ? '0' : '') + sec + 's' : sec + 's';
  }

  function deriveState(input) {
    if (input && typeof input === 'object' && typeof input.visibility === 'string') return input;
    var model = root.overlayStateModel;
    if (model && typeof model.deriveOverlayState === 'function') {
      return model.deriveOverlayState(input || {});
    }
    return { visibility: 'waiting', primaryLine: 'Waiting for game', secondaryLine: 'Waiting for runtime session', metaLine: '' };
  }

  /* ── Mode: Runtime / Waiting ── */
  function renderRuntimeMode(state) {
    setText(el.kickerLabel, 'Juice Journal');
    setText(el.primary, state.primaryLine || 'Waiting for game');
    setText(el.secondary, state.secondaryLine || '');
    setText(el.meta, state.metaLine || '');
  }

  /* ── Mode: Map Result ── */
  function renderMapResultMode(state) {
    var result = (state.mapResult && state.mapResult.result) || {};
    var rates = result.profitCurrencyRates || result.currencyRates || (state.mapResult && state.mapResult.profitCurrencyRates) || {};
    var topOutput = Array.isArray(result.topOutputs) && result.topOutputs.length > 0 ? result.topOutputs[0] : null;
    setText(el.kickerLabel, 'Map Complete');
    setText(el.primary, (result.farmType || 'Completed Map') + '  ' + formatSignedProfit(result.netProfit, rates));
    setText(el.secondary, topOutput ? (topOutput.label || '') + ' ' + formatSignedProfit(topOutput.valueDelta, rates) : 'Completed map result');
    setText(el.meta, formatDuration(result.durationSeconds));
  }

  /* ── Mode: Start Map Prompt ── */
  function renderStartMapPrompt(state) {
    var prompt = (state.startMapPrompt && typeof state.startMapPrompt === 'object') ? state.startMapPrompt : {};
    setText(el.kickerLabel, 'New Map');
    setText(el.primary, prompt.mapName || state.primaryLine || 'Unknown Map');
    var ctxParts = [prompt.farmType || 'Choose farm type'];
    if (prompt.poeVersion) ctxParts.push(prompt.poeVersion.replace(/^poe/i, 'PoE '));
    if (prompt.league) ctxParts.push(prompt.league);
    setText(el.secondary, ctxParts.filter(Boolean).join(' \u00b7 '));
    setText(el.meta, 'confirm map start');
  }

  function renderStartMapForm(state) {
    if (!el.startForm) return;
    var showForm = state.mode === 'start-map-prompt' && state.visibility !== 'hidden';
    el.startForm.hidden = !showForm;
    if (!showForm) return;
    var prompt = (state.startMapPrompt && typeof state.startMapPrompt === 'object') ? state.startMapPrompt : {};
    if (el.startMapName && document.activeElement !== el.startMapName) {
      el.startMapName.value = prompt.mapName || state.primaryLine || 'Unknown Map';
    }
    if (el.startFarmType) {
      var opts = normalizeFarmTypeOptions(prompt.farmTypeOptions);
      var selId = opts.some(function (e) { return e.id === prompt.farmTypeId; }) ? prompt.farmTypeId : '';
      el.startFarmType.innerHTML = '<option value="">No farm type</option>' +
        opts.map(function (e) { return '<option value="' + escapeHTML(e.id) + '">' + escapeHTML(e.label) + '</option>'; }).join('');
      el.startFarmType.value = selId;
    }
  }

  function clearExitingAnimation() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    if (el.card) el.card.setAttribute('data-overlay-exiting', 'false');
  }

  /* ── Main render ── */
  function renderState(input) {
    var state = deriveState(input);
    var visibility = state.visibility || 'waiting';
    var mode = state.mode || 'runtime';
    var tone = (state.mapResult && state.mapResult.tone) || state.tone || 'neutral';
    var isExiting = visibility === 'hidden' && lastRenderedMode === 'map-result';

    clearExitingAnimation();

    if (el.card) {
      el.card.dataset.overlayState = visibility;
      el.card.dataset.overlayMode = mode;
      el.card.dataset.overlayTone = tone;

      if (isExiting) {
        el.card.setAttribute('data-overlay-exiting', 'true');
        animFrameId = requestAnimationFrame(function () {
          animFrameId = requestAnimationFrame(function () {
            el.card.hidden = true;
            el.card.setAttribute('data-overlay-exiting', 'false');
          });
        });
      } else {
        el.card.hidden = visibility === 'hidden';
      }
    }

    if (mode === 'map-result') {
      renderMapResultMode(state);
    } else if (mode === 'start-map-prompt') {
      renderStartMapPrompt(state);
    } else {
      renderRuntimeMode(state);
    }

    renderStartMapForm(state);

    if (el.pin) {
      var showPin = mode === 'map-result' && visibility !== 'hidden';
      el.pin.hidden = !showPin;
      el.pin.setAttribute('aria-pressed', showPin && (state.mapResult && state.mapResult.pinned) ? 'true' : 'false');
      if (el.dismiss) el.dismiss.hidden = !showPin;
      if (!showPin) {
        setPointerPassthrough(mode === 'start-map-prompt' && visibility !== 'hidden' ? false : true);
      }
    }

    lastRenderedMode = mode;
  }

  /* ── IPC helpers ── */
  function getStartMapPromptPayload() {
    return {
      mapName: String(el.startMapName ? el.startMapName.value : '').trim() || 'Unknown Map',
      farmTypeId: String(el.startFarmType ? el.startFarmType.value : '').trim() || null
    };
  }

  function setStartMapPromptBusy(busy) {
    [el.startMapName, el.startFarmType, el.startSubmit, el.startCancel].filter(Boolean).forEach(function (e) { e.disabled = busy; });
  }

  /* ── Event bindings ── */
  if (el.pin) {
    el.pin.addEventListener('click', function () {
      if (typeof root.electronAPI?.toggleMapResultOverlayPin !== 'function') return;
      el.pin.disabled = true;
      root.electronAPI.toggleMapResultOverlayPin().finally(function () { el.pin.disabled = false; setPointerPassthrough(true); });
    });
  }

  if (el.dismiss) {
    el.dismiss.addEventListener('click', function () {
      if (typeof root.electronAPI?.dismissMapResultOverlay !== 'function') return;
      el.dismiss.disabled = true;
      root.electronAPI.dismissMapResultOverlay().finally(function () { el.dismiss.disabled = false; setPointerPassthrough(true); });
    });
  }

  if (el.startForm) {
    el.startForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (typeof root.electronAPI?.confirmStartMapPromptOverlay !== 'function') return;
      setStartMapPromptBusy(true);
      root.electronAPI.confirmStartMapPromptOverlay(getStartMapPromptPayload()).finally(function () { setStartMapPromptBusy(false); });
    });
  }

  if (el.startCancel) {
    el.startCancel.addEventListener('click', function () {
      if (typeof root.electronAPI?.cancelStartMapPromptOverlay !== 'function') return;
      setStartMapPromptBusy(true);
      root.electronAPI.cancelStartMapPromptOverlay().finally(function () { setStartMapPromptBusy(false); });
    });
  }

  /* ── Pointer passthrough ── */
  root.addEventListener('mousemove', function (event) {
    var isInteractive = el.card && el.card.dataset.overlayMode === 'start-map-prompt' && el.card.dataset.overlayState !== 'hidden';
    if (isInteractive) { setPointerPassthrough(false); return; }
    if (!el.pin || el.pin.hidden) { setPointerPassthrough(true); return; }
    var btns = [el.pin, el.dismiss].filter(Boolean).filter(function (b) { return !b.hidden; });
    var hovering = btns.some(function (b) {
      var r = b.getBoundingClientRect();
      return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    });
    setPointerPassthrough(!hovering);
  });

  root.addEventListener('mouseleave', function () {
    setPointerPassthrough(true);
  });

  /* ── Public API ── */
  root.JuiceOverlay = { renderState: renderState };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { renderState(root.__JUICE_OVERLAY_INITIAL_STATE__ || null); }, { once: true });
  } else {
    renderState(root.__JUICE_OVERLAY_INITIAL_STATE__ || null);
  }
})(window);
```

- [ ] **Step 2: Run e2e overlay smoke test**

Run: `npm run test:smoke`
Expected: All smoke tests pass after CSS selector adjustments

- [ ] **Step 3: Review and adjust e2e selectors**

Check `desktop/e2e/overlay-smoke.spec.js` for any stale CSS selectors referencing old class names (`.overlay-card`, `.overlay-primary`, etc.). Update to new class names (`.jj-card`, `.jj-primary`, etc.):

Old → New mappings:
- `.overlay-card` → `.jj-card`
- `.overlay-primary` → `.jj-primary`
- `.overlay-kicker-label` → `.jj-label`
- `.overlay-pin` → `.jj-btn`
- `.overlay-dismiss` → `.jj-btn.jj-btn-dismiss`
- `[data-overlay-primary]` → `[data-overlay-primary]` (attribute selector unchanged)
- `[data-overlay-pin]` → `[data-overlay-pin]` (attribute selector unchanged)

- [ ] **Step 4: Run e2e tests again**

Run: `npm run test:smoke`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: All 335+ tests pass

- [ ] **Step 6: Commit**

```bash
git add desktop/src/overlay.js desktop/e2e/overlay-smoke.spec.js
git commit -m "feat: rewrite overlay.js with clean state machine and modern rendering"
```

---

### Task 5: Final integration test and cleanup

**Files:**
- Verify: all changed files

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass, zero failures

- [ ] **Step 2: Run e2e tests**

Run: `npm run test:smoke`
Expected: All smoke tests pass

- [ ] **Step 3: Verify visual QA**

Run: `npm run test:visual-qa`
Expected: Visual QA passes or minor expected diffs

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: final integration, all tests pass"
```
