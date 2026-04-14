# Native Active Character Producer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the missing main-process native producer so Juice Journal emits real active-character hints from native `info` payloads and updates the character card within `1-3` seconds after PoE2 load.

**Architecture:** Add a focused producer module in desktop main that reads `app.overwolf.packages.gep`, registers the PoE2 feature set, normalizes `info.me.*` fields into the existing `activeCharacterHint` contract, and emits through the already-implemented `emitActiveCharacterHint(...)` channel. Keep the current delayed API refresh as fallback by emitting only high-confidence native hints and failing closed when the native package is absent.

**Tech Stack:** Electron main/preload, plain CommonJS modules, Node test runner (`node --test`), existing desktop native hint transport in `main.js`, `preload.js`, and `src/app.js`

---

## File Structure

- Create: `desktop/src/modules/nativeGameInfoProducerModel.js`
  - Pure helpers for `requiredFeatures`, `info` payload extraction, and hint normalization.
- Create: `desktop/src/modules/nativeGameInfoProducer.js`
  - Main-process lifecycle wrapper around `app.overwolf.packages.gep`.
- Create: `desktop/tests/native-game-info-producer-model.test.js`
  - Unit tests for payload parsing and fail-closed behavior.
- Create: `desktop/tests/native-game-info-producer.test.js`
  - Integration-style tests for producer lifecycle, subscriptions, and stale-game protection.
- Modify: `desktop/main.js`
  - Instantiate producer, wire it to game launch/switch/close, and emit `active-character-hint`.
- Modify: `desktop/tests/main-settings.test.js`
  - Add regression coverage for main-process integration if existing helpers are reused there.
- Modify: `desktop/tests/active-character-native-detection.test.js`
  - Confirm the renderer still prioritizes the emitted native hint over the delayed API fallback.

## Task 1: Add Pure Native Info Parsing Model

**Files:**
- Create: `desktop/src/modules/nativeGameInfoProducerModel.js`
- Test: `desktop/tests/native-game-info-producer-model.test.js`

- [ ] **Step 1: Write the failing model tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getRequiredFeaturesForVersion,
  normalizeNativeInfoPayload
} = require('../src/modules/nativeGameInfoProducerModel');

test('getRequiredFeaturesForVersion returns PoE2 feature set', () => {
  assert.deepEqual(
    getRequiredFeaturesForVersion('poe2'),
    ['gep_internal', 'me', 'match_info']
  );
});

test('normalizeNativeInfoPayload returns a high-confidence hint', () => {
  const hint = normalizeNativeInfoPayload({
    poeVersion: 'poe2',
    info: {
      me: {
        character_name: 'KELLEE',
        character_level: 92,
        character_exp: 123456789
      }
    }
  });

  assert.deepEqual(hint, {
    source: 'native-info',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    level: 92,
    experience: 123456789,
    confidence: 'high'
  });
});

test('normalizeNativeInfoPayload returns null without character_name', () => {
  assert.equal(
    normalizeNativeInfoPayload({
      poeVersion: 'poe2',
      info: { me: { character_level: 92 } }
    }),
    null
  );
});
```

- [ ] **Step 2: Run the model test to verify it fails**

Run: `cd desktop && node --test tests/native-game-info-producer-model.test.js`

Expected: FAIL with `Cannot find module '../src/modules/nativeGameInfoProducerModel'`

- [ ] **Step 3: Write the minimal parsing model**

```js
const POE2_REQUIRED_FEATURES = ['gep_internal', 'me', 'match_info'];

function getRequiredFeaturesForVersion(poeVersion) {
  if (poeVersion === 'poe2') {
    return [...POE2_REQUIRED_FEATURES];
  }

  return [];
}

function normalizeNativeInfoPayload({ poeVersion, info } = {}) {
  const me = info && typeof info === 'object' ? info.me : null;
  const characterName = typeof me?.character_name === 'string'
    ? me.character_name.trim()
    : '';

  if (!poeVersion || !characterName) {
    return null;
  }

  const level = Number.isFinite(Number(me.character_level))
    ? Number(me.character_level)
    : null;
  const experience = Number.isFinite(Number(me.character_exp))
    ? Number(me.character_exp)
    : null;

  return {
    source: 'native-info',
    poeVersion,
    characterName,
    level,
    experience,
    confidence: 'high'
  };
}

module.exports = {
  getRequiredFeaturesForVersion,
  normalizeNativeInfoPayload
};
```

- [ ] **Step 4: Run the model test to verify it passes**

Run: `cd desktop && node --test tests/native-game-info-producer-model.test.js`

Expected: PASS with `3/3`

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/nativeGameInfoProducerModel.js desktop/tests/native-game-info-producer-model.test.js
git commit -m "feat: add native game info producer model"
```

## Task 2: Add Main-Process Native Producer Lifecycle

**Files:**
- Create: `desktop/src/modules/nativeGameInfoProducer.js`
- Test: `desktop/tests/native-game-info-producer.test.js`

- [ ] **Step 1: Write the failing producer lifecycle tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { createNativeGameInfoProducer } = require('../src/modules/nativeGameInfoProducer');

test('producer emits hint after immediate getInfo', async () => {
  const emitted = [];
  const gep = {
    setRequiredFeaturesCalls: [],
    getInfoCalls: [],
    listeners: new Map(),
    async setRequiredFeatures(gameId, features) {
      this.setRequiredFeaturesCalls.push({ gameId, features });
    },
    async getInfo(gameId) {
      this.getInfoCalls.push(gameId);
      return {
        me: {
          character_name: 'KELLEE',
          character_level: 92,
          character_exp: 123
        }
      };
    },
    on(eventName, handler) {
      this.listeners.set(eventName, handler);
    },
    removeListener() {}
  };

  const producer = createNativeGameInfoProducer({
    gep,
    emitHint: hint => emitted.push(hint)
  });

  await producer.start({
    poeVersion: 'poe2',
    gameId: 24886
  });

  assert.equal(emitted[0].characterName, 'KELLEE');
});

test('producer ignores stale info from an older session', async () => {
  const emitted = [];
  const listeners = new Map();
  const gep = {
    async setRequiredFeatures() {},
    async getInfo() {
      return null;
    },
    on(eventName, handler) {
      listeners.set(eventName, handler);
    },
    removeListener() {}
  };

  const producer = createNativeGameInfoProducer({
    gep,
    emitHint: hint => emitted.push(hint)
  });

  await producer.start({ poeVersion: 'poe2', gameId: 24886 });
  await producer.stop();
  await listeners.get('new-info-update')?.({}, 24886);

  assert.equal(emitted.length, 0);
});
```

- [ ] **Step 2: Run the producer test to verify it fails**

Run: `cd desktop && node --test tests/native-game-info-producer.test.js`

Expected: FAIL with `Cannot find module '../src/modules/nativeGameInfoProducer'`

- [ ] **Step 3: Write the minimal producer**

```js
const {
  getRequiredFeaturesForVersion,
  normalizeNativeInfoPayload
} = require('./nativeGameInfoProducerModel');

function createNativeGameInfoProducer({ gep, emitHint, logger = console } = {}) {
  let sessionId = 0;
  let active = null;
  let infoUpdateHandler = null;
  let gameExitHandler = null;

  async function emitFromInfo(currentSessionId, gameId) {
    if (!gep || !active || currentSessionId !== sessionId) {
      return;
    }

    const info = await gep.getInfo(gameId);
    if (!active || currentSessionId !== sessionId) {
      return;
    }

    const hint = normalizeNativeInfoPayload({
      poeVersion: active.poeVersion,
      info
    });

    if (hint) {
      emitHint(hint);
    }
  }

  async function start({ poeVersion, gameId } = {}) {
    await stop();

    const features = getRequiredFeaturesForVersion(poeVersion);
    if (!gep || !gameId || features.length === 0) {
      return false;
    }

    sessionId += 1;
    const currentSessionId = sessionId;
    active = { poeVersion, gameId };

    await gep.setRequiredFeatures(gameId, features);

    infoUpdateHandler = async (_event, updatedGameId) => {
      if (!active || updatedGameId !== active.gameId) {
        return;
      }
      await emitFromInfo(currentSessionId, updatedGameId);
    };

    gameExitHandler = (_event, exitedGameId) => {
      if (active && exitedGameId === active.gameId) {
        stop().catch(error => logger.warn(error));
      }
    };

    gep.on('new-info-update', infoUpdateHandler);
    gep.on('game-exit', gameExitHandler);

    await emitFromInfo(currentSessionId, gameId);
    return true;
  }

  async function stop() {
    sessionId += active ? 1 : 0;
    if (gep && infoUpdateHandler && typeof gep.removeListener === 'function') {
      gep.removeListener('new-info-update', infoUpdateHandler);
    }
    if (gep && gameExitHandler && typeof gep.removeListener === 'function') {
      gep.removeListener('game-exit', gameExitHandler);
    }
    infoUpdateHandler = null;
    gameExitHandler = null;
    active = null;
  }

  return { start, stop };
}

module.exports = { createNativeGameInfoProducer };
```

- [ ] **Step 4: Run the producer test to verify it passes**

Run: `cd desktop && node --test tests/native-game-info-producer.test.js`

Expected: PASS with `2/2`

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/nativeGameInfoProducer.js desktop/tests/native-game-info-producer.test.js
git commit -m "feat: add native game info producer"
```

## Task 3: Wire Producer Into `desktop/main.js`

**Files:**
- Modify: `desktop/main.js`
- Modify: `desktop/tests/main-settings.test.js`

- [ ] **Step 1: Write the failing main integration test**

```js
test('game launch starts the native producer for poe2', async () => {
  const starts = [];
  const context = loadMainWithMocks({
    createNativeGameInfoProducer: () => ({
      start: async (payload) => starts.push(payload),
      stop: async () => {}
    })
  });

  await context.handleDetectedGameChange({
    game: 'poe2',
    gameId: 24886
  });

  assert.deepEqual(starts[0], {
    poeVersion: 'poe2',
    gameId: 24886
  });
});
```

- [ ] **Step 2: Run the main integration test to verify it fails**

Run: `cd desktop && node --test tests/main-settings.test.js --test-name-pattern "native producer"`

Expected: FAIL because `main.js` does not create or start the producer yet

- [ ] **Step 3: Integrate the producer in `main.js`**

```js
const { createNativeGameInfoProducer } = require('./src/modules/nativeGameInfoProducer');

let nativeGameInfoProducer = null;

function getNativeGameInfoProducer() {
  if (!nativeGameInfoProducer) {
    const gep = app?.overwolf?.packages?.gep || null;
    nativeGameInfoProducer = createNativeGameInfoProducer({
      gep,
      emitHint: emitActiveCharacterHint,
      logger: console
    });
  }

  return nativeGameInfoProducer;
}

async function syncNativeCharacterProducer({ detectedVersion, gameId }) {
  const producer = getNativeGameInfoProducer();

  if (!detectedVersion || !gameId) {
    await producer.stop();
    return;
  }

  await producer.start({
    poeVersion: detectedVersion,
    gameId
  });
}
```

Call `syncNativeCharacterProducer(...)` from the same game-change path that already emits:

- `game-detected`
- `game-version-changed`
- `game-closed`

and call `producer.stop()` on logout / app shutdown.

- [ ] **Step 4: Run the main integration test to verify it passes**

Run: `cd desktop && node --test tests/main-settings.test.js --test-name-pattern "native producer"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/main.js desktop/tests/main-settings.test.js
git commit -m "feat: wire native character producer into main process"
```

## Task 4: Prove Native Producer Beats API Fallback

**Files:**
- Modify: `desktop/tests/active-character-native-detection.test.js`
- Modify: `desktop/tests/active-character-refresh.test.js`

- [ ] **Step 1: Write the failing renderer precedence test**

```js
test('high-confidence native hint clears pending api refresh timers', async () => {
  const env = createActiveCharacterTestEnvironment();

  env.scheduleActiveCharacterRefresh({ version: 'poe2' });
  const applied = env.applyNativeCharacterHint({
    source: 'native-info',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    confidence: 'high'
  });

  assert.equal(applied, true);
  assert.equal(env.state.activeCharacterRefreshSource, 'native-high-confidence');
  assert.equal(env.getPendingRefreshTimerCount(), 0);
});
```

- [ ] **Step 2: Run the renderer precedence tests to verify they fail if integration regresses**

Run: `cd desktop && node --test tests/active-character-native-detection.test.js tests/active-character-refresh.test.js`

Expected: Existing suite should fail until producer-driven source precedence is fully respected

- [ ] **Step 3: Tighten the existing renderer assertions if needed**

```js
assert.equal(state.account.summary.name, 'KELLEE');
assert.equal(state.account.summary.poeVersion, 'poe2');
assert.equal(state.activeCharacterRefreshSource, 'native-high-confidence');
```

Do not add new renderer behavior here. This task only locks in that the new producer path does not regress the consumer path already built.

- [ ] **Step 4: Run the full native-character suite**

Run: `cd desktop && node --test tests/native-game-info-producer-model.test.js tests/native-game-info-producer.test.js tests/active-character-native-detection.test.js tests/active-character-refresh.test.js tests/account-state-model.test.js tests/game-detector.test.js tests/character-visual-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/tests/active-character-native-detection.test.js desktop/tests/active-character-refresh.test.js
git commit -m "test: cover native producer precedence over api refresh"
```

## Task 5: End-to-End Desktop Verification

**Files:**
- Modify: `desktop/tests/main-settings.test.js`
- Modify: `desktop/README.md`

- [ ] **Step 1: Add a smoke-level main-process test for missing GEP**

```js
test('native producer fails closed when gep package is unavailable', async () => {
  const context = loadMainWithMocks({
    app: { overwolf: { packages: {} } }
  });

  await context.handleDetectedGameChange({
    game: 'poe2',
    gameId: 24886
  });

  assert.equal(context.emittedActiveCharacterHints.length, 0);
});
```

- [ ] **Step 2: Run the smoke-level main-process tests**

Run: `cd desktop && node --test tests/main-settings.test.js --test-name-pattern "gep|native producer"`

Expected: PASS

- [ ] **Step 3: Document the live validation matrix**

```md
## Native Active Character Validation

- Launch PoE2.
- Select a different character.
- Press Play.
- Confirm Juice Journal switches the card within 1-3 seconds.
- If no hint arrives, confirm the previous character remains visible and API fallback still runs.
```

Add this to the desktop README section that already covers local testing.

- [ ] **Step 4: Run the desktop regression set**

Run: `cd desktop && node --test tests/*.test.js`

Expected: PASS for the full desktop test suite

- [ ] **Step 5: Commit**

```bash
git add desktop/tests/main-settings.test.js desktop/README.md
git commit -m "docs: add native producer validation coverage"
```

## Self-Review

- Spec coverage:
  - Producer lifecycle: Task 2
  - `requiredFeatures` and `info.me.*` parsing: Task 1
  - Main-process emission through existing channel: Task 3
  - Fallback preservation and precedence: Task 4
  - Manual/live validation and fail-closed behavior: Task 5
- Placeholder scan:
  - No `TODO`, `TBD`, or “similar to previous task” placeholders remain.
- Type consistency:
  - `createNativeGameInfoProducer`, `getRequiredFeaturesForVersion`, and `normalizeNativeInfoPayload` are named consistently across all tasks.
