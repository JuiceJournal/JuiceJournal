# Map Result Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a manual farm-type flow that turns completed stash snapshot pairs into a persisted map-result record, shows the latest result on the desktop dashboard, and opens an in-game post-map result overlay after the `After Map Snapshot`.

**Architecture:** Keep the feature split into six seams: farm-type session state, pure result derivation, main-process persistence, dashboard projection, overlay projection, and history projection. The stash snapshot diff should be normalized into a `map result` record once, then every UI surface should consume that normalized record instead of re-calculating profit independently.

**Tech Stack:** Electron, Node.js, existing desktop renderer/main IPC, current stash snapshot workflow, `node:test`, Playwright Electron smoke tests

---

## File Structure

- Modify: `desktop/src/index.html`
  Purpose: add farm-type selection before a map, add the `Last Map Result` dashboard card, and add a simple history list/filter surface.
- Modify: `desktop/src/styles.css`
  Purpose: style the farm selector, latest result card, and result-history list.
- Modify: `desktop/src/app.js`
  Purpose: bind farm-type state, stitch snapshot completion into result derivation, request persistence via IPC, render dashboard/history, and trigger the overlay feed.
- Modify: `desktop/main.js`
  Purpose: persist map results locally, expose load/save IPC handlers, and forward completed results to the overlay window.
- Modify: `desktop/src/overlay.html`
  Purpose: add a dedicated map-result panel inside the existing mini overlay shell.
- Modify: `desktop/src/overlay.js`
  Purpose: render map-result overlay state, auto-dismiss timing, and pin/dismiss behavior.
- Create: `desktop/src/modules/farmTypeModel.js`
  Purpose: normalize and validate the list of user-selectable farm types plus active-session selection state.
- Create: `desktop/src/modules/mapResultModel.js`
  Purpose: derive a normalized `map result` record from before/after snapshots, farm type, and runtime timing.
- Create: `desktop/src/modules/mapResultStoreModel.js`
  Purpose: manage latest-result/history projections and local list updates in a pure, testable way.
- Create: `desktop/src/modules/mapResultOverlayModel.js`
  Purpose: derive compact overlay state from a completed result, including tone, timer, and pin behavior.
- Create: `desktop/tests/farm-type-model.test.js`
  Purpose: unit tests for farm-type normalization and active selection rules.
- Create: `desktop/tests/map-result-model.test.js`
  Purpose: unit tests for stash diff to input/output/profit conversion.
- Create: `desktop/tests/map-result-store-model.test.js`
  Purpose: unit tests for latest-result/history list persistence projections.
- Create: `desktop/tests/map-result-overlay-model.test.js`
  Purpose: unit tests for overlay timing, pinning, and presentation state.
- Create: `desktop/tests/map-result-ui.test.js`
  Purpose: renderer tests for farm-type selection, dashboard result card, and history rendering.
- Modify: `desktop/e2e/overlay-smoke.spec.js`
  Purpose: verify a completed mocked run opens the result overlay.
- Create: `desktop/e2e/map-result-history-smoke.spec.js`
  Purpose: verify a completed mocked run persists into the dashboard latest-result card and history list.

---

### Task 1: Add Active Farm Type Selection To The Map Session Flow

**Files:**
- Create: `desktop/src/modules/farmTypeModel.js`
- Modify: `desktop/src/index.html`
- Modify: `desktop/src/app.js`
- Test: `desktop/tests/farm-type-model.test.js`
- Test: `desktop/tests/map-result-ui.test.js`

- [ ] **Step 1: Write the failing farm-type model tests**

```js
test('farm type model exposes the supported selectable farms', () => {
  const { listFarmTypes } = require('../src/modules/farmTypeModel');

  assert.deepEqual(
    listFarmTypes().map((farm) => farm.id),
    ['abyss', 'breach', 'expedition', 'ritual', 'harbinger', 'essence', 'delirium']
  );
});

test('farm type model keeps the active selection until the session is cleared', () => {
  const { createFarmTypeState, selectFarmType, clearFarmType } = require('../src/modules/farmTypeModel');

  const state = createFarmTypeState();
  selectFarmType(state, 'breach');

  assert.equal(state.selectedFarmTypeId, 'breach');

  clearFarmType(state);

  assert.equal(state.selectedFarmTypeId, null);
});
```

- [ ] **Step 2: Run tests to verify red state**

Run: `cd desktop && node --test tests/farm-type-model.test.js`

Expected: FAIL with `MODULE_NOT_FOUND` because `farmTypeModel.js` does not exist yet.

- [ ] **Step 3: Implement the farm-type model and renderer hookup**

```js
// desktop/src/modules/farmTypeModel.js
const FARM_TYPES = [
  { id: 'abyss', label: 'Abyss' },
  { id: 'breach', label: 'Breach' },
  { id: 'expedition', label: 'Expedition' },
  { id: 'ritual', label: 'Ritual' },
  { id: 'harbinger', label: 'Harbinger' },
  { id: 'essence', label: 'Essence' },
  { id: 'delirium', label: 'Delirium' }
];

function createFarmTypeState() {
  return { selectedFarmTypeId: null };
}

function listFarmTypes() {
  return FARM_TYPES.slice();
}

function selectFarmType(state, farmTypeId) {
  state.selectedFarmTypeId = FARM_TYPES.some((farm) => farm.id === farmTypeId) ? farmTypeId : null;
  return state.selectedFarmTypeId;
}

function clearFarmType(state) {
  state.selectedFarmTypeId = null;
}
```

```html
<!-- desktop/src/index.html -->
<div class="map-farm-selector">
  <label for="map-farm-type">Farm Type</label>
  <select id="map-farm-type">
    <option value="">Select farm type</option>
  </select>
</div>
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd desktop && node --test tests/farm-type-model.test.js tests/map-result-ui.test.js`

Expected: PASS for the new farm-type model tests and the UI test that verifies the selector is rendered.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/farmTypeModel.js desktop/src/index.html desktop/src/app.js desktop/tests/farm-type-model.test.js desktop/tests/map-result-ui.test.js
git commit -m "feat: add active map farm type selection"
```

### Task 2: Derive A Normalized Map Result From Snapshot Pairs

**Files:**
- Create: `desktop/src/modules/mapResultModel.js`
- Modify: `desktop/src/app.js`
- Test: `desktop/tests/map-result-model.test.js`

- [ ] **Step 1: Write the failing result-derivation tests**

```js
test('map result model computes input output and profit from stash deltas', () => {
  const { deriveMapResult } = require('../src/modules/mapResultModel');

  const result = deriveMapResult({
    farmType: { id: 'abyss', label: 'Abyss' },
    runtimeSession: {
      currentInstance: null,
      lastCompletedInstance: { areaName: 'Crimson Shores', durationSeconds: 412 }
    },
    beforeSnapshot: {
      items: [
        { itemKey: 'scarab-breach', label: 'Breach Scarab', quantity: 4, unitValue: 12, currencyCode: 'chaos' },
        { itemKey: 'chaos-orb', label: 'Chaos Orb', quantity: 100, unitValue: 1, currencyCode: 'chaos' }
      ]
    },
    afterSnapshot: {
      items: [
        { itemKey: 'scarab-breach', label: 'Breach Scarab', quantity: 2, unitValue: 12, currencyCode: 'chaos' },
        { itemKey: 'chaos-orb', label: 'Chaos Orb', quantity: 168, unitValue: 1, currencyCode: 'chaos' }
      ]
    }
  });

  assert.equal(result.farmType, 'Abyss');
  assert.equal(result.inputValue, 24);
  assert.equal(result.outputValue, 68);
  assert.equal(result.netProfit, 44);
  assert.equal(result.durationSeconds, 412);
  assert.equal(result.profitState, 'positive');
});

test('map result model returns null when required snapshot data is incomplete', () => {
  const { deriveMapResult } = require('../src/modules/mapResultModel');

  assert.equal(deriveMapResult({ beforeSnapshot: null, afterSnapshot: null }), null);
});
```

- [ ] **Step 2: Run tests to verify red state**

Run: `cd desktop && node --test tests/map-result-model.test.js`

Expected: FAIL because `mapResultModel.js` has not been created yet.

- [ ] **Step 3: Implement the minimal map-result derivation model**

```js
// desktop/src/modules/mapResultModel.js
function deriveMapResult({ farmType, runtimeSession, beforeSnapshot, afterSnapshot, characterSummary, accountName, poeVersion } = {}) {
  if (!farmType || !beforeSnapshot?.items || !afterSnapshot?.items) {
    return null;
  }

  const beforeIndex = new Map(beforeSnapshot.items.map((item) => [item.itemKey, item]));
  const afterIndex = new Map(afterSnapshot.items.map((item) => [item.itemKey, item]));
  const allKeys = new Set([...beforeIndex.keys(), ...afterIndex.keys()]);
  const topInputs = [];
  const topOutputs = [];
  let inputValue = 0;
  let outputValue = 0;

  for (const itemKey of allKeys) {
    const before = beforeIndex.get(itemKey) || { quantity: 0, unitValue: 0, label: itemKey, currencyCode: 'chaos' };
    const after = afterIndex.get(itemKey) || { quantity: 0, unitValue: before.unitValue || 0, label: before.label, currencyCode: before.currencyCode };
    const quantityDelta = Number(after.quantity || 0) - Number(before.quantity || 0);
    const unitValue = Number(after.unitValue || before.unitValue || 0);
    const valueDelta = quantityDelta * unitValue;

    if (quantityDelta < 0) {
      inputValue += Math.abs(valueDelta);
      topInputs.push({ itemKey, label: before.label, quantityDelta, valueDelta: Math.abs(valueDelta), currencyCode: before.currencyCode });
    } else if (quantityDelta > 0) {
      outputValue += valueDelta;
      topOutputs.push({ itemKey, label: after.label, quantityDelta, valueDelta, currencyCode: after.currencyCode });
    }
  }

  const netProfit = outputValue - inputValue;
  const durationSeconds = runtimeSession?.lastCompletedInstance?.durationSeconds || 0;

  return {
    id: `map-result-${Date.now()}`,
    sessionId: runtimeSession?.sessionId || null,
    characterId: characterSummary?.id || null,
    characterName: characterSummary?.name || null,
    accountName: accountName || null,
    poeVersion: poeVersion || null,
    league: characterSummary?.league || null,
    farmType: farmType.label,
    durationSeconds,
    inputValue,
    outputValue,
    netProfit,
    profitState: netProfit > 0 ? 'positive' : netProfit < 0 ? 'negative' : 'neutral',
    topInputs: topInputs.sort((a, b) => b.valueDelta - a.valueDelta).slice(0, 3),
    topOutputs: topOutputs.sort((a, b) => b.valueDelta - a.valueDelta).slice(0, 3),
    createdAt: new Date().toISOString()
  };
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd desktop && node --test tests/map-result-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/mapResultModel.js desktop/src/app.js desktop/tests/map-result-model.test.js
git commit -m "feat: derive normalized map result records"
```

### Task 3: Persist Completed Map Results And Expose Latest/History Projections

**Files:**
- Create: `desktop/src/modules/mapResultStoreModel.js`
- Modify: `desktop/main.js`
- Modify: `desktop/src/app.js`
- Test: `desktop/tests/map-result-store-model.test.js`
- Test: `desktop/tests/main-settings.test.js`

- [ ] **Step 1: Write the failing persistence tests**

```js
test('map result store prepends the latest result and caps history length', () => {
  const { appendMapResult } = require('../src/modules/mapResultStoreModel');

  const history = appendMapResult(
    [{ id: 'old-1' }, { id: 'old-2' }],
    { id: 'new-1' },
    { maxResults: 2 }
  );

  assert.deepEqual(history.map((entry) => entry.id), ['new-1', 'old-1']);
});

test('main process persists map results and returns latest-first history', async () => {
  const handlers = {};
  const context = loadMainFunctions(['registerMapResultIpc'], {
    ipcMain: { handle: (name, handler) => { handlers[name] = handler; } },
    settings: { get: () => [], set: () => {} }
  });

  context.registerMapResultIpc();

  assert.equal(typeof handlers['map-results:save'], 'function');
  assert.equal(typeof handlers['map-results:list'], 'function');
});
```

- [ ] **Step 2: Run tests to verify red state**

Run: `cd desktop && node --test tests/map-result-store-model.test.js tests/main-settings.test.js`

Expected: FAIL because the new store model and IPC handlers do not exist yet.

- [ ] **Step 3: Implement the store model and main-process IPC**

```js
// desktop/src/modules/mapResultStoreModel.js
function appendMapResult(existingResults = [], nextResult, { maxResults = 100 } = {}) {
  return [nextResult, ...existingResults]
    .filter(Boolean)
    .slice(0, maxResults);
}

function filterMapResults(results = [], { farmType = '' } = {}) {
  if (!farmType) {
    return results;
  }

  return results.filter((result) => result.farmType === farmType);
}
```

```js
// desktop/main.js
ipcMain.handle('map-results:save', async (_event, result) => {
  const existing = settings.get('mapResults') || [];
  const next = appendMapResult(existing, result, { maxResults: 100 });
  settings.set('mapResults', next);
  sendOverlayEvent('map-result:completed', result);
  return next;
});

ipcMain.handle('map-results:list', async () => {
  return settings.get('mapResults') || [];
});
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd desktop && node --test tests/map-result-store-model.test.js tests/main-settings.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/mapResultStoreModel.js desktop/main.js desktop/src/app.js desktop/tests/map-result-store-model.test.js desktop/tests/main-settings.test.js
git commit -m "feat: persist completed map results locally"
```

### Task 4: Render The Latest Result On The Desktop Dashboard

**Files:**
- Modify: `desktop/src/index.html`
- Modify: `desktop/src/styles.css`
- Modify: `desktop/src/app.js`
- Test: `desktop/tests/map-result-ui.test.js`

- [ ] **Step 1: Write the failing dashboard-result tests**

```js
test('dashboard html includes a latest map result card and history filter', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="last-map-result-card"/);
  assert.match(html, /id="map-result-history"/);
  assert.match(html, /id="map-result-filter"/);
});

test('renderer projects the latest persisted result onto the dashboard card', () => {
  const elements = {
    lastMapResultCard: { dataset: {} },
    lastMapResultFarmType: { textContent: '' },
    lastMapResultDuration: { textContent: '' },
    lastMapResultProfit: { textContent: '' }
  };
  const context = loadFunctions(['renderLatestMapResult'], {
    elements,
    state: {
      mapResults: [
        { farmType: 'Abyss', durationSeconds: 412, netProfit: 44, profitState: 'positive' }
      ]
    }
  });

  context.renderLatestMapResult();

  assert.equal(elements.lastMapResultCard.dataset.resultState, 'ready');
  assert.equal(elements.lastMapResultFarmType.textContent, 'Abyss');
  assert.equal(elements.lastMapResultProfit.textContent, '+44 chaos');
});
```

- [ ] **Step 2: Run tests to verify red state**

Run: `cd desktop && node --test tests/map-result-ui.test.js`

Expected: FAIL because the dashboard result card and renderer bindings are missing.

- [ ] **Step 3: Implement the latest-result dashboard card**

```html
<!-- desktop/src/index.html -->
<div class="card last-map-result-card" id="last-map-result-card" data-result-state="empty">
  <div class="card-header">
    <h3>Last Map Result</h3>
  </div>
  <div class="map-result-summary">
    <strong id="last-map-result-farm-type">No completed map yet</strong>
    <span id="last-map-result-duration">—</span>
    <span id="last-map-result-profit">—</span>
  </div>
</div>
```

```js
// desktop/src/app.js
function renderLatestMapResult() {
  const latest = state.mapResults?.[0] || null;
  if (!latest) {
    elements.lastMapResultCard.dataset.resultState = 'empty';
    elements.lastMapResultFarmType.textContent = 'No completed map yet';
    elements.lastMapResultDuration.textContent = '—';
    elements.lastMapResultProfit.textContent = '—';
    return;
  }

  elements.lastMapResultCard.dataset.resultState = 'ready';
  elements.lastMapResultFarmType.textContent = latest.farmType;
  elements.lastMapResultDuration.textContent = `${Math.floor(latest.durationSeconds / 60)}m ${latest.durationSeconds % 60}s`;
  elements.lastMapResultProfit.textContent = `${latest.netProfit >= 0 ? '+' : ''}${latest.netProfit} chaos`;
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd desktop && node --test tests/map-result-ui.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/index.html desktop/src/styles.css desktop/src/app.js desktop/tests/map-result-ui.test.js
git commit -m "feat: add dashboard latest map result card"
```

### Task 5: Show The In-Game Post-Map Result Overlay After The After Snapshot

**Files:**
- Create: `desktop/src/modules/mapResultOverlayModel.js`
- Modify: `desktop/src/overlay.html`
- Modify: `desktop/src/overlay.js`
- Modify: `desktop/src/app.js`
- Modify: `desktop/main.js`
- Test: `desktop/tests/map-result-overlay-model.test.js`
- Modify: `desktop/e2e/overlay-smoke.spec.js`

- [ ] **Step 1: Write the failing overlay-model tests**

```js
test('overlay model opens a timed result toast for a completed positive run', () => {
  const { deriveMapResultOverlayState } = require('../src/modules/mapResultOverlayModel');

  const overlayState = deriveMapResultOverlayState({
    overlayEnabled: true,
    completedResult: {
      farmType: 'Abyss',
      durationSeconds: 412,
      netProfit: 44,
      inputValue: 24,
      outputValue: 68,
      profitState: 'positive'
    },
    now: 1_000,
    durationMs: 10_000
  });

  assert.equal(overlayState.visible, true);
  assert.equal(overlayState.tone, 'positive');
  assert.equal(overlayState.dismissAt, 11_000);
});

test('overlay model keeps the result visible while pinned', () => {
  const { pinMapResultOverlay, deriveMapResultOverlayState } = require('../src/modules/mapResultOverlayModel');

  const state = pinMapResultOverlay({ visible: true, pinned: false });
  const overlayState = deriveMapResultOverlayState({ overlayEnabled: true, completedResult: null, currentOverlayState: state, now: 15_000 });

  assert.equal(overlayState.visible, true);
  assert.equal(overlayState.pinned, true);
});
```

- [ ] **Step 2: Run tests to verify red state**

Run: `cd desktop && node --test tests/map-result-overlay-model.test.js`

Expected: FAIL with `MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the overlay presentation model and renderer**

```js
// desktop/src/modules/mapResultOverlayModel.js
function deriveMapResultOverlayState({ overlayEnabled, completedResult, currentOverlayState = {}, now = Date.now(), durationMs = 10_000 } = {}) {
  if (!overlayEnabled) {
    return { visible: false, pinned: false, result: null, tone: 'neutral' };
  }

  if (completedResult) {
    return {
      visible: true,
      pinned: false,
      result: completedResult,
      tone: completedResult.profitState || 'neutral',
      dismissAt: now + durationMs
    };
  }

  if (currentOverlayState.pinned) {
    return { ...currentOverlayState, visible: true };
  }

  if (currentOverlayState.dismissAt && now < currentOverlayState.dismissAt) {
    return { ...currentOverlayState, visible: true };
  }

  return { visible: false, pinned: false, result: null, tone: 'neutral' };
}
```

```js
// desktop/src/app.js
async function handleAfterMapSnapshotCompleted(resultPayload) {
  const derivedResult = deriveMapResult({
    farmType: state.activeFarmType,
    runtimeSession: state.runtimeSession,
    beforeSnapshot: stashState.beforeSnapshot,
    afterSnapshot: resultPayload.snapshot,
    characterSummary: state.account?.selectedCharacter,
    accountName: state.account?.accountName,
    poeVersion: normalizePoeVersion(state.detectedGameVersion || state.settings?.poeVersion)
  });

  if (!derivedResult) {
    return;
  }

  state.mapResults = await window.electronAPI.saveMapResult(derivedResult);
  renderLatestMapResult();
  renderMapResultHistory();
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd desktop && node --test tests/map-result-overlay-model.test.js && npx playwright test e2e/overlay-smoke.spec.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/mapResultOverlayModel.js desktop/src/overlay.html desktop/src/overlay.js desktop/src/app.js desktop/main.js desktop/tests/map-result-overlay-model.test.js desktop/e2e/overlay-smoke.spec.js
git commit -m "feat: show post-map result overlay"
```

### Task 6: Add Simple Result History With Farm-Type Filtering

**Files:**
- Modify: `desktop/src/index.html`
- Modify: `desktop/src/styles.css`
- Modify: `desktop/src/app.js`
- Create: `desktop/e2e/map-result-history-smoke.spec.js`
- Test: `desktop/tests/map-result-ui.test.js`

- [ ] **Step 1: Write the failing history tests**

```js
test('renderer filters map-result history by selected farm type', () => {
  const elements = {
    mapResultFilter: { value: 'Abyss' },
    mapResultHistory: { innerHTML: '' }
  };
  const context = loadFunctions(['renderMapResultHistory'], {
    elements,
    state: {
      mapResults: [
        { id: '1', farmType: 'Abyss', netProfit: 44, createdAt: '2026-04-11T12:00:00.000Z' },
        { id: '2', farmType: 'Breach', netProfit: 9, createdAt: '2026-04-11T11:00:00.000Z' }
      ]
    },
    filterMapResults: (results, filters) => results.filter((entry) => !filters.farmType || entry.farmType === filters.farmType)
  });

  context.renderMapResultHistory();

  assert.match(elements.mapResultHistory.innerHTML, /Abyss/);
  assert.doesNotMatch(elements.mapResultHistory.innerHTML, /Breach/);
});
```

- [ ] **Step 2: Run tests to verify red state**

Run: `cd desktop && node --test tests/map-result-ui.test.js`

Expected: FAIL because the history list and filter rendering do not exist yet.

- [ ] **Step 3: Implement the minimal history UI**

```html
<!-- desktop/src/index.html -->
<div class="card map-result-history-card">
  <div class="card-header">
    <h3>Map Result History</h3>
    <select id="map-result-filter">
      <option value="">All farms</option>
    </select>
  </div>
  <div id="map-result-history"></div>
</div>
```

```js
// desktop/src/app.js
function renderMapResultHistory() {
  const farmType = elements.mapResultFilter?.value || '';
  const filteredResults = filterMapResults(state.mapResults || [], { farmType });

  elements.mapResultHistory.innerHTML = filteredResults.map((result) => `
    <article class="map-result-row" data-profit-state="${result.profitState}">
      <strong>${result.farmType}</strong>
      <span>${result.netProfit >= 0 ? '+' : ''}${result.netProfit} chaos</span>
      <span>${new Date(result.createdAt).toLocaleString()}</span>
    </article>
  `).join('');
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd desktop && node --test tests/map-result-ui.test.js && npx playwright test e2e/map-result-history-smoke.spec.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/index.html desktop/src/styles.css desktop/src/app.js desktop/tests/map-result-ui.test.js desktop/e2e/map-result-history-smoke.spec.js
git commit -m "feat: add map result history filtering"
```

## Self-Review

### Spec coverage

- Manual farm-type selection: covered by Task 1.
- Result derivation from before/after stash snapshots: covered by Task 2.
- Local persistence with latest result and future-ready history: covered by Task 3.
- Desktop `Last Map Result` card: covered by Task 4.
- In-game `After Map Snapshot` overlay with auto-dismiss and pin behavior: covered by Task 5.
- Simple history list plus farm-type filter: covered by Task 6.
- Future community compatibility: handled by the normalized `map result` record introduced in Task 2 and persisted in Task 3.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” markers remain.
- Every task names exact files and concrete commands.
- Every behavior-changing step includes a code example or explicit command outcome.

### Type consistency

- `farmType` is normalized in Task 1 and consumed consistently as a normalized object in Task 2.
- `map result` shape introduced in Task 2 is reused consistently in Tasks 3-6.
- Overlay state uses `completedResult`, `dismissAt`, and `pinned` consistently in Task 5.

