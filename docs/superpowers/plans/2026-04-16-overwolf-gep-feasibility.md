# Overwolf GEP Feasibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal Overwolf GEP spike for Path of Exile 2 that can detect capability, subscribe to required features, normalize `me.character_name` into the existing internal hint contract, and fail closed when the Overwolf runtime or GEP package is unavailable.

**Architecture:** Keep the existing renderer hint contract and main-process `emitActiveCharacterHint(...)` path. Add a narrow Overwolf-specific adapter layer in desktop modules, keep the current native bridge intact, and make Overwolf support purely additive. Main process code should be able to answer three questions explicitly: is Overwolf runtime present, is GEP callable, and did we receive a usable PoE2 identity hint.

**Tech Stack:** Electron main process, Node test runner, Overwolf Electron GEP package API, existing desktop test harness.

---

### Task 1: Add Overwolf GEP model and capability normalization

**Files:**
- Create: `desktop/src/modules/overwolfGepModel.js`
- Create: `desktop/tests/overwolf-gep-model.test.js`
- Modify: `desktop/src/modules/nativeGameInfoProducerModel.js`

- [ ] **Step 1: Write the failing model tests**

```js
test('getOverwolfGepCapability returns available when required methods exist', () => {
  const { getOverwolfGepCapability } = require('../src/modules/overwolfGepModel');

  assert.deepEqual(
    getOverwolfGepCapability({
      setRequiredFeatures() {},
      getInfo() {},
      on() {},
      removeListener() {}
    }),
    {
      status: 'available',
      missing: []
    }
  );
});

test('normalizeOverwolfInfoHint returns a high-confidence poe2 hint from me.character_name', () => {
  const { normalizeOverwolfInfoHint } = require('../src/modules/overwolfGepModel');

  assert.deepEqual(
    normalizeOverwolfInfoHint({
      poeVersion: '  PoE2  ',
      info: {
        me: {
          character_name: ' KELLEE ',
          character_level: 92,
          character_exp: 123456789,
          character_class: 'Invoker'
        }
      }
    }),
    {
      source: 'overwolf-gep',
      poeVersion: 'poe2',
      characterName: 'KELLEE',
      className: 'Invoker',
      level: 92,
      experience: 123456789,
      confidence: 'high'
    }
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop && node --test tests/overwolf-gep-model.test.js`
Expected: FAIL with missing module / missing export assertions for `overwolfGepModel`

- [ ] **Step 3: Write the minimal model implementation**

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.overwolfGepModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOverwolfGepModel() {
  const REQUIRED_GEP_METHODS = ['setRequiredFeatures', 'getInfo', 'on', 'removeListener'];
  const POE2_REQUIRED_FEATURES = ['gep_internal', 'me', 'match_info'];

  function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeNumber(value) {
    if (value == null || typeof value === 'boolean') {
      return null;
    }

    const parsed = Number(typeof value === 'string' ? value.trim() : value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizePoeVersion(value) {
    const normalized = normalizeString(value).toLowerCase();
    return normalized === 'poe2' ? 'poe2' : null;
  }

  function getOverwolfGepCapability(gep) {
    const missing = REQUIRED_GEP_METHODS.filter(name => typeof gep?.[name] !== 'function');
    return {
      status: missing.length === 0 ? 'available' : 'unavailable',
      missing
    };
  }

  function getRequiredFeaturesForVersion(poeVersion) {
    return normalizePoeVersion(poeVersion) === 'poe2' ? [...POE2_REQUIRED_FEATURES] : [];
  }

  function normalizeOverwolfInfoHint({ poeVersion, info } = {}) {
    const normalizedPoeVersion = normalizePoeVersion(poeVersion);
    const me = info && typeof info === 'object' ? info.me : null;
    const characterName = normalizeString(me?.character_name);

    if (!normalizedPoeVersion || !characterName) {
      return null;
    }

    const className = normalizeString(me?.character_class) || null;

    return {
      source: 'overwolf-gep',
      poeVersion: normalizedPoeVersion,
      characterName,
      className,
      level: normalizeNumber(me?.character_level),
      experience: normalizeNumber(me?.character_exp),
      confidence: 'high'
    };
  }

  return {
    getOverwolfGepCapability,
    getRequiredFeaturesForVersion,
    normalizeOverwolfInfoHint
  };
});
```

- [ ] **Step 4: Point the existing producer model at the new normalization source**

```js
const {
  getRequiredFeaturesForVersion,
  normalizeOverwolfInfoHint
} = require('./overwolfGepModel');

module.exports = {
  getRequiredFeaturesForVersion,
  normalizeNativeInfoPayload: normalizeOverwolfInfoHint
};
```

- [ ] **Step 5: Run focused tests**

Run: `cd desktop && node --test tests/overwolf-gep-model.test.js tests/native-game-info-producer-model.test.js`
Expected: PASS for the new model tests and compatibility coverage

- [ ] **Step 6: Commit**

```bash
git add desktop/src/modules/overwolfGepModel.js desktop/src/modules/nativeGameInfoProducerModel.js desktop/tests/overwolf-gep-model.test.js desktop/tests/native-game-info-producer-model.test.js
git commit -m "feat: add overwolf gep model"
```

### Task 2: Add an Overwolf-specific producer adapter with explicit capability reporting

**Files:**
- Create: `desktop/src/modules/overwolfGepProducer.js`
- Create: `desktop/tests/overwolf-gep-producer.test.js`
- Modify: `desktop/src/modules/nativeGameInfoProducer.js`

- [ ] **Step 1: Write the failing producer tests**

```js
test('producer reports unavailable when the gep package is missing required methods', async () => {
  const { createOverwolfGepProducer } = require('../src/modules/overwolfGepProducer');

  const diagnostics = [];
  const producer = createOverwolfGepProducer({
    gep: { getInfo() {} },
    emitDiagnostic: payload => diagnostics.push(payload)
  });

  const started = await producer.start({
    poeVersion: 'poe2',
    gameId: 24886
  });

  assert.equal(started, false);
  assert.equal(diagnostics[0].code, 'overwolf-gep-unavailable');
});

test('producer emits a normalized hint after getInfo and new-info-update', async () => {
  const { createOverwolfGepProducer } = require('../src/modules/overwolfGepProducer');
  const emittedHints = [];
  const listeners = new Map();

  const producer = createOverwolfGepProducer({
    gep: {
      async setRequiredFeatures() {},
      async getInfo() {
        return {
          me: {
            character_name: 'KELLEE',
            character_level: 92,
            character_exp: 123456789
          }
        };
      },
      on(eventName, handler) {
        listeners.set(eventName, handler);
      },
      removeListener(eventName, handler) {
        if (listeners.get(eventName) === handler) {
          listeners.delete(eventName);
        }
      }
    },
    emitHint: payload => emittedHints.push(payload)
  });

  const started = await producer.start({ poeVersion: 'poe2', gameId: 24886 });
  assert.equal(started, true);
  assert.deepEqual(emittedHints[0].characterName, 'KELLEE');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop && node --test tests/overwolf-gep-producer.test.js`
Expected: FAIL with missing module / export assertions

- [ ] **Step 3: Implement the Overwolf producer**

```js
const {
  getOverwolfGepCapability,
  getRequiredFeaturesForVersion,
  normalizeOverwolfInfoHint
} = require('./overwolfGepModel');

function createOverwolfGepProducer({ gep, emitHint, emitDiagnostic, logger = console } = {}) {
  // keep the same session lifecycle shape already proven by nativeGameInfoProducer
  // but emit explicit capability diagnostics before returning false
}

module.exports = {
  createOverwolfGepProducer
};
```

- [ ] **Step 4: Convert the legacy producer into a thin compatibility wrapper**

```js
const { createOverwolfGepProducer } = require('./overwolfGepProducer');

function createNativeGameInfoProducer(options) {
  return createOverwolfGepProducer(options);
}

module.exports = {
  createNativeGameInfoProducer
};
```

- [ ] **Step 5: Run focused tests**

Run: `cd desktop && node --test tests/overwolf-gep-producer.test.js tests/native-game-info-producer.test.js`
Expected: PASS with existing lifecycle behavior preserved

- [ ] **Step 6: Commit**

```bash
git add desktop/src/modules/overwolfGepProducer.js desktop/src/modules/nativeGameInfoProducer.js desktop/tests/overwolf-gep-producer.test.js desktop/tests/native-game-info-producer.test.js
git commit -m "feat: add overwolf gep producer"
```

### Task 3: Wire Overwolf capability and diagnostics into the main process

**Files:**
- Modify: `desktop/main.js`
- Modify: `desktop/tests/main-settings.test.js`

- [ ] **Step 1: Write the failing main-process tests**

```js
test('runtime game detection logs overwolf gep availability diagnostics before starting the producer', async () => {
  const diagnostics = [];
  const context = loadMainWithMocks({
    createOverwolfGepProducer() {
      return {
        start: async () => true,
        stop: async () => true
      };
    },
    console: {
      log(...args) {
        diagnostics.push(args);
      },
      warn() {}
    }
  });

  await context.handleDetectedGameChange({
    game: 'poe2',
    gameId: 24886
  });

  assert.match(JSON.stringify(diagnostics), /OverwolfGep/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop && node --test tests/main-settings.test.js --test-name-pattern "Overwolf GEP|native game info producer"`
Expected: FAIL with missing `createOverwolfGepProducer` integration or missing diagnostic output

- [ ] **Step 3: Update main.js to use the Overwolf producer explicitly**

```js
const { createOverwolfGepProducer } = require('./src/modules/overwolfGepProducer');

function getNativeGameInfoProducer() {
  if (!nativeGameInfoProducer) {
    const gep = app?.overwolf?.packages?.gep || null;
    nativeGameInfoProducer = createOverwolfGepProducer({
      gep,
      emitHint: emitActiveCharacterHint,
      emitDiagnostic(payload) {
        console.log('[OverwolfGepDiagnostic]', JSON.stringify(payload));
      },
      logger: console
    });
  }

  return nativeGameInfoProducer;
}
```

- [ ] **Step 4: Keep the existing fail-closed game-version flow unchanged**

```js
// no precedence change: the Overwolf producer is still optional
// if start() returns false, keep the current native bridge + delayed API fallback behavior
```

- [ ] **Step 5: Run focused tests**

Run: `cd desktop && node --test tests/main-settings.test.js --test-name-pattern "runtime game detection|native game info producer|Overwolf GEP"`
Expected: PASS for startup, stop, and fail-closed coverage

- [ ] **Step 6: Commit**

```bash
git add desktop/main.js desktop/tests/main-settings.test.js
git commit -m "feat: wire overwolf gep diagnostics into main process"
```

### Task 4: Document the feasibility spike and user action points

**Files:**
- Modify: `desktop/README.md`
- Modify: `docs/superpowers/specs/2026-04-16-overwolf-gep-feasibility-design.md`

- [ ] **Step 1: Add explicit local DEV setup notes**

```md
## Overwolf GEP feasibility

- requires Overwolf Electron runtime support for `app.overwolf.packages.gep`
- for DEV-only games, start the app with:
  `--owepm-packages-url=https://electronapi-qa.overwolf.com/packages`
- when PoE2 is ready for PROD, remove that argument after DevRel confirms promotion
```

- [ ] **Step 2: Add explicit “user action required” checkpoints**

```md
### User actions that may be required later

1. Overwolf developer account access
2. app registration / console visibility
3. DEV environment package URL confirmation
4. DevRel coordination before PROD rollout
```

- [ ] **Step 3: Run the verification set**

Run: `cd desktop && node --test tests/overwolf-gep-model.test.js tests/overwolf-gep-producer.test.js tests/native-game-info-producer.test.js tests/main-settings.test.js`
Expected: PASS

Run: `cd desktop && node --test tests/*.test.js`
Expected: PASS for the full desktop suite

- [ ] **Step 4: Commit**

```bash
git add desktop/README.md docs/superpowers/specs/2026-04-16-overwolf-gep-feasibility-design.md
git commit -m "docs: add overwolf gep feasibility notes"
```
