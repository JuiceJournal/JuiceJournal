# Overwolf GEP Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Juice Journal's optional native GEP bridge for PoE1/PoE2 and add a separate Overwolf runtime capture harness.

**Architecture:** The production desktop app stays on normal Electron and treats Overwolf as an optional runtime capability. `nativeGameInfoProducerModel` owns payload normalization, `nativeGameInfoProducer` owns GEP subscription lifecycle, and `desktop/overwolf-spike/` is manual tooling for real payload capture.

**Tech Stack:** Node.js, Electron, node:test, optional Overwolf `ow-electron` runtime for the spike harness.

---

## File Structure

- Modify `desktop/src/modules/nativeGameInfoProducerModel.js`
  - Add PoE1 feature selection.
  - Normalize PoE1/PoE2 `me`, `match_info`, `game_info`, and event payloads into one serializable contract.
- Modify `desktop/src/modules/nativeGameInfoProducer.js`
  - Keep lifecycle behavior unchanged.
  - Emit normalized info payloads and normalized event payloads.
- Modify `desktop/main.js`
  - Add PoE1 native GEP base game id.
  - Preserve fail-closed behavior when Overwolf globals are unavailable.
- Modify `desktop/tests/native-game-info-producer-model.test.js`
  - Add red tests for PoE1, optional runtime fields, and event normalization.
- Modify `desktop/tests/native-game-info-producer.test.js`
  - Add red tests for PoE1 startup and event emission.
- Modify `desktop/tests/main-settings.test.js`
  - Add red test for PoE1 game id wiring.
- Create `desktop/overwolf-spike/package.json`
  - Manual scripts for `ow-electron` runtime capture.
- Create `desktop/overwolf-spike/manifest.json`
  - Minimal targeting/events metadata for PoE/PoE2 manual testing.
- Create `desktop/overwolf-spike/index.html`
  - Small capture UI.
- Create `desktop/overwolf-spike/main.js`
  - Minimal main process that opens the capture UI.
- Create `desktop/overwolf-spike/capture.js`
  - Subscribes to documented features and displays sanitized payloads.
- Create `desktop/overwolf-spike/README.md`
  - Manual runbook for Overwolf runtime validation.
- Create `desktop/overwolf-spike/fixtures/.gitkeep`
  - Placeholder directory for sanitized manually captured payload fixtures.

---

### Task 1: Native GEP Payload Contract

**Files:**
- Modify: `desktop/tests/native-game-info-producer-model.test.js`
- Modify: `desktop/src/modules/nativeGameInfoProducerModel.js`

- [ ] **Step 1: Write failing tests for PoE1 and PoE2 contract normalization**

Add tests that assert:

```js
assert.deepEqual(getRequiredFeaturesForVersion('poe1'), [
  'gep_internal',
  'me',
  'match_info',
  'game_info',
  'death',
  'kill'
]);

assert.deepEqual(normalizeNativeInfoPayload({
  poeVersion: 'poe1',
  info: {
    me: {
      character_name: 'MapRunner',
      character_level: '95',
      character_class: 'Deadeye',
      character_experience: '987654321'
    },
    match_info: {
      current_zone: 'Cemetery',
      opened_page: 'stash'
    },
    language: {
      language: 'en',
      chat_language: 'en'
    }
  }
}), {
  source: 'native-info',
  poeVersion: 'poe1',
  characterName: 'MapRunner',
  className: 'Deadeye',
  level: 95,
  experience: 987654321,
  currentZone: 'Cemetery',
  openedPage: 'stash',
  inTown: null,
  scene: null,
  eventName: null,
  eventData: null,
  confidence: 'high'
});
```

Also add tests for PoE2 `in_town`, `scene`, and event normalization:

```js
assert.deepEqual(normalizeNativeEventPayload({
  poeVersion: 'poe2',
  event: { name: 'boss_kill', data: 'Fire Fury' }
}), {
  source: 'native-info',
  poeVersion: 'poe2',
  characterName: null,
  className: null,
  level: null,
  experience: null,
  currentZone: null,
  openedPage: null,
  inTown: null,
  scene: null,
  eventName: 'boss_kill',
  eventData: 'Fire Fury',
  confidence: 'medium'
});
```

- [ ] **Step 2: Run tests to verify red**

Run:

```powershell
node --test desktop/tests/native-game-info-producer-model.test.js
```

Expected: FAIL because PoE1 returns an empty feature list and `normalizeNativeEventPayload` is not exported.

- [ ] **Step 3: Implement the native contract**

Update `nativeGameInfoProducerModel.js` so it exports:

```js
getRequiredFeaturesForVersion(poeVersion)
normalizeNativeInfoPayload({ poeVersion, info })
normalizeNativeEventPayload({ poeVersion, event })
```

Rules:

- `poe1` and `poe2` both return `['gep_internal', 'me', 'match_info', 'game_info', 'death', 'kill']`
- PoE1 experience reads `character_experience`
- PoE2 experience reads `character_exp`, with fallback to `character_experience`
- text fields are trimmed
- numeric fields become numbers or `null`
- boolean `in_town` accepts booleans and `"true"` / `"false"` strings
- `chat` events return `null`
- non-chat events become medium-confidence event payloads

- [ ] **Step 4: Run tests to verify green**

Run:

```powershell
node --test desktop/tests/native-game-info-producer-model.test.js
```

Expected: PASS.

---

### Task 2: Producer and Main Wiring

**Files:**
- Modify: `desktop/tests/native-game-info-producer.test.js`
- Modify: `desktop/tests/main-settings.test.js`
- Modify: `desktop/src/modules/nativeGameInfoProducer.js`
- Modify: `desktop/main.js`

- [ ] **Step 1: Write failing producer/main tests**

Add producer tests that assert:

```js
await producer.start({ poeVersion: 'poe1', gameId: 7212 });
assert.deepEqual(setRequiredFeaturesCalls[0], {
  gameId: 7212,
  features: ['gep_internal', 'me', 'match_info', 'game_info', 'death', 'kill']
});
```

Add an event test:

```js
const eventHandler = listeners.get('new-game-event');
await eventHandler({}, 24886, { events: [{ name: 'death', data: null }] });
assert.deepEqual(emitted[0].eventName, 'death');
```

Add main test that asserts:

```js
assert.equal(context.getNativeGameInfoGameId('poe1'), 7212);
assert.equal(context.getNativeGameInfoGameId('poe2'), 24886);
```

- [ ] **Step 2: Run tests to verify red**

Run:

```powershell
node --test desktop/tests/native-game-info-producer.test.js desktop/tests/main-settings.test.js
```

Expected: FAIL because PoE1 game id is null and producer does not listen for game events.

- [ ] **Step 3: Implement producer wiring**

Update `nativeGameInfoProducer.js`:

- import `normalizeNativeEventPayload`
- subscribe to `new-game-event`
- remove `new-game-event` on cleanup
- on event callback, emit normalized non-chat events
- preserve stale-session guards and rollback behavior

Update `main.js`:

- return `7212` for `poe1`
- keep `24886` for `poe2`
- return `null` for unknown versions

- [ ] **Step 4: Run tests to verify green**

Run:

```powershell
node --test desktop/tests/native-game-info-producer.test.js desktop/tests/main-settings.test.js
```

Expected: PASS.

---

### Task 3: Overwolf Spike Harness

**Files:**
- Create: `desktop/overwolf-spike/package.json`
- Create: `desktop/overwolf-spike/manifest.json`
- Create: `desktop/overwolf-spike/index.html`
- Create: `desktop/overwolf-spike/main.js`
- Create: `desktop/overwolf-spike/capture.js`
- Create: `desktop/overwolf-spike/README.md`
- Create: `desktop/overwolf-spike/fixtures/.gitkeep`
- Modify: `desktop/tests/overwolf-spike.test.js`

- [ ] **Step 1: Write failing harness structure test**

Create `desktop/tests/overwolf-spike.test.js` with assertions:

```js
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../overwolf-spike');

test('overwolf spike harness documents manual runtime capture', () => {
  for (const file of ['package.json', 'manifest.json', 'index.html', 'main.js', 'capture.js', 'README.md']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});
```

Add checks that:

- package scripts include `start` and `start:dev-gep`
- manifest mentions PoE and PoE2 game ids
- README says this is manual tooling and not part of normal desktop release
- capture script avoids persisting raw chat content

- [ ] **Step 2: Run test to verify red**

Run:

```powershell
node --test desktop/tests/overwolf-spike.test.js
```

Expected: FAIL because the harness does not exist.

- [ ] **Step 3: Create harness files**

Create a minimal harness:

- `package.json` uses `ow-electron .` scripts and dev dependencies for `@overwolf/ow-electron`
- `manifest.json` contains PoE and PoE2 targeting/event metadata as a manual starting point
- `main.js` creates a small window and loads `index.html`
- `capture.js` checks for Overwolf APIs, sets required features, prints sanitized info/events, and redacts chat event data
- `README.md` documents install/run steps and states the harness is not shipped with the normal app

- [ ] **Step 4: Run harness structure test to verify green**

Run:

```powershell
node --test desktop/tests/overwolf-spike.test.js
```

Expected: PASS.

---

### Task 4: Full Verification and Commits

**Files:**
- All modified implementation, tests, docs, and spike harness files

- [ ] **Step 1: Run targeted tests**

Run:

```powershell
node --test desktop/tests/native-game-info-producer-model.test.js desktop/tests/native-game-info-producer.test.js desktop/tests/main-settings.test.js desktop/tests/overwolf-spike.test.js
```

Expected: PASS.

- [ ] **Step 2: Run full desktop test suite**

Run from `desktop/`:

```powershell
npm test
```

Expected: PASS.

- [ ] **Step 3: Review diff**

Run:

```powershell
git diff --stat
git diff --check
```

Expected: no whitespace errors and changes limited to native GEP, spike harness, tests, and plan.

- [ ] **Step 4: Commit in logical groups**

Suggested commits:

```powershell
git add docs/superpowers/plans/2026-04-25-overwolf-gep-spike.md
git commit -m "docs: add overwolf gep spike implementation plan"

git add desktop/src/modules/nativeGameInfoProducerModel.js desktop/src/modules/nativeGameInfoProducer.js desktop/main.js desktop/tests/native-game-info-producer-model.test.js desktop/tests/native-game-info-producer.test.js desktop/tests/main-settings.test.js
git commit -m "feat(desktop): expand optional overwolf gep bridge"

git add desktop/overwolf-spike desktop/tests/overwolf-spike.test.js
git commit -m "test(desktop): add overwolf gep spike harness"
```

