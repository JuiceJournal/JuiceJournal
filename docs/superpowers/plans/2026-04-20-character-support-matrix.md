# Character Support Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete desktop support for every currently playable Path of Exile 1 and Path of Exile 2 base class and ascendancy, with explicit matrix-backed portrait/banner coverage and no fallback for supported entries.

**Architecture:** Introduce a canonical character support matrix module that separates official playable identities from runtime alias quirks. Route all desktop visual resolution through this matrix, then harden the renderer and tests around the canonical roster. Finish by importing any missing assets and verifying that every supported entry resolves to a real portrait and banner.

**Tech Stack:** Node.js test runner, Electron desktop renderer/main process code, static image assets, official Path of Exile roster data captured in repo-owned support tables.

---

### Task 1: Add Canonical Roster Tests

**Files:**
- Create: `desktop/tests/character-support-matrix.test.js`
- Modify: `desktop/tests/character-visual-model.test.js`
- Modify: `desktop/tests/dashboard-character-card.test.js`

- [ ] **Step 1: Write a failing canonical roster test file**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PLAYABLE_CHARACTER_SUPPORT,
  EXPECTED_PLAYABLE_KEYS,
  findCharacterSupportEntry,
} = require('../src/modules/characterSupportMatrix');

const desktopDir = path.resolve(__dirname, '..');

test('character support matrix includes every playable canonical entry', () => {
  const actualKeys = PLAYABLE_CHARACTER_SUPPORT.map((entry) => entry.id).sort();
  assert.deepEqual(actualKeys, [...EXPECTED_PLAYABLE_KEYS].sort());
});

test('every canonical entry declares a portrait and banner file that exists', () => {
  PLAYABLE_CHARACTER_SUPPORT.forEach((entry) => {
    assert.ok(entry.portraitPath, `${entry.id} missing portraitPath`);
    assert.ok(entry.bannerPath, `${entry.id} missing bannerPath`);

    const portraitPath = path.join(desktopDir, 'src', entry.portraitPath);
    const bannerPath = path.join(desktopDir, 'src', entry.bannerPath);

    assert.equal(fs.existsSync(portraitPath), true, `Missing portrait asset for ${entry.id}: ${entry.portraitPath}`);
    assert.equal(fs.existsSync(bannerPath), true, `Missing banner asset for ${entry.id}: ${entry.bannerPath}`);
  });
});

test('matrix resolves canonical base-class and ascendancy lookups', () => {
  assert.equal(
    findCharacterSupportEntry({ poeVersion: 'poe1', className: 'Templar' })?.id,
    'poe1:templar'
  );

  assert.equal(
    findCharacterSupportEntry({ poeVersion: 'poe2', className: 'Monk', ascendancy: 'Invoker' })?.id,
    'poe2:monk:invoker'
  );
});

test('matrix resolves observed runtime aliases to canonical entries', () => {
  assert.equal(
    findCharacterSupportEntry({ poeVersion: 'poe2', className: 'Monk2' })?.id,
    'poe2:monk:invoker'
  );

  assert.equal(
    findCharacterSupportEntry({ poeVersion: 'poe2', className: 'Druid2' })?.id,
    'poe2:druid:shaman'
  );
});
```

- [ ] **Step 2: Run the new test to verify RED**

Run: `node --test desktop/tests/character-support-matrix.test.js`

Expected: FAIL because `desktop/src/modules/characterSupportMatrix.js` does not exist yet.

- [ ] **Step 3: Tighten visual-model expectations around base-class vs ascendancy labels**

Add failing assertions in `desktop/tests/character-visual-model.test.js` and `desktop/tests/dashboard-character-card.test.js` so supported ascendancies must expose:

```js
assert.equal(visual.classLabel, 'Invoker');
assert.equal(visual.baseClassLabel, 'Monk');
```

and renderer expectations:

```js
assert.equal(elements.characterClass.textContent, 'Invoker');
assert.equal(elements.characterClassMeta.textContent, 'Monk');
```

- [ ] **Step 4: Run targeted desktop tests to confirm they fail for the right reason**

Run: `node --test desktop/tests/character-visual-model.test.js desktop/tests/dashboard-character-card.test.js`

Expected: FAIL on missing `baseClassLabel`, missing canonical mappings, or current renderer using the wrong meta line.

### Task 2: Implement the Canonical Support Matrix

**Files:**
- Create: `desktop/src/modules/characterSupportMatrix.js`
- Modify: `desktop/src/modules/characterVisualModel.js`

- [ ] **Step 1: Create the matrix module with the official playable roster**

Add:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.characterSupportMatrix = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCharacterSupportMatrix() {
  const PLAYABLE_CHARACTER_SUPPORT = [
    // Example entries only; implement the full 51-entry roster from the approved spec.
    {
      id: 'poe1:templar',
      poeVersion: 'poe1',
      baseClass: 'Templar',
      ascendancy: null,
      classLabel: 'Templar',
      baseClassLabel: 'Templar',
      detailLabel: null,
      portraitKey: 'templar',
      bannerKey: 'templar',
      badgeText: 'T',
      tone: 'gold',
      portraitPath: 'assets/characters/poe1/templar.jpg',
      bannerPath: 'assets/characters/banners/poe1/templar.jpg'
    },
    {
      id: 'poe2:monk:invoker',
      poeVersion: 'poe2',
      baseClass: 'Monk',
      ascendancy: 'Invoker',
      classLabel: 'Invoker',
      baseClassLabel: 'Monk',
      detailLabel: 'Invoker',
      portraitKey: 'monk',
      bannerKey: 'monk-invoker',
      badgeText: 'M',
      tone: 'azure',
      portraitPath: 'assets/characters/poe2/monk.png',
      bannerPath: 'assets/characters/banners/poe2/monk-invoker.webp'
    }
  ];

  const OBSERVED_RUNTIME_ALIASES = {
    'poe2:druid2': 'poe2:druid:shaman',
    'poe2:monk2': 'poe2:monk:invoker',
    'poe2:mercenary3': 'poe2:mercenary:gemling-legionnaire',
    'poe2:huntress1': 'poe2:huntress:amazon'
  };

  function findCharacterSupportEntry(input = {}) {
    // Normalize className / ascendancy / poeVersion and resolve aliases first.
  }

  return {
    PLAYABLE_CHARACTER_SUPPORT,
    EXPECTED_PLAYABLE_KEYS: PLAYABLE_CHARACTER_SUPPORT.map((entry) => entry.id),
    OBSERVED_RUNTIME_ALIASES,
    findCharacterSupportEntry
  };
});
```

- [ ] **Step 2: Rebuild the visual model as a facade over the matrix**

Refactor `desktop/src/modules/characterVisualModel.js` to:

```js
const support = getCharacterSupportMatrix().findCharacterSupportEntry({
  poeVersion: character.poeVersion,
  className,
  ascendancy
});

if (support) {
  return {
    ...support,
    fallbackInitials: createInitials(character.name)
  };
}
```

Keep the current neutral fallback for unsupported or malformed input.

- [ ] **Step 3: Run the matrix and visual tests to verify GREEN**

Run:

- `node --test desktop/tests/character-support-matrix.test.js`
- `node --test desktop/tests/character-visual-model.test.js`

Expected: matrix structure passes, but asset-existence assertions may still fail until all files are present.

### Task 3: Update Renderer Semantics

**Files:**
- Modify: `desktop/src/app.js`
- Modify: `desktop/tests/dashboard-character-card.test.js`

- [ ] **Step 1: Change the card meta line to show base class, not duplicate ascendancy**

Update:

```js
if (elements.characterClass) {
  elements.characterClass.textContent = isReady ? visual.classLabel : 'Unknown Class';
}

if (elements.characterClassMeta) {
  elements.characterClassMeta.textContent = isReady
    ? (visual.baseClassLabel || visual.classLabel)
    : 'Unknown Class';
}
```

- [ ] **Step 2: Run the renderer test to verify GREEN**

Run: `node --test desktop/tests/dashboard-character-card.test.js`

Expected: PASS with main label `Invoker` and meta label `Monk` for ascendancy-backed entries.

### Task 4: Import Missing Assets

**Files:**
- Add or modify: `desktop/src/assets/characters/poe1/*`
- Add or modify: `desktop/src/assets/characters/poe2/*`
- Add or modify: `desktop/src/assets/characters/banners/poe1/*`
- Add or modify: `desktop/src/assets/characters/banners/poe2/*`
- Modify: `desktop/src/modules/characterSupportMatrix.js`

- [ ] **Step 1: Inventory missing assets directly from failing matrix tests**

Run: `node --test desktop/tests/character-support-matrix.test.js`

Expected: missing-file assertions identify the exact portrait/banner paths not yet present.

- [ ] **Step 2: Download or normalize the missing files**

For each missing entry:

- prefer official GGG/Path of Exile images
- normalize filenames to match explicit matrix paths
- place portraits under `desktop/src/assets/characters/...`
- place banners under `desktop/src/assets/characters/banners/...`

- [ ] **Step 3: Wire the final file paths into the canonical entries**

Update each affected entry in `desktop/src/modules/characterSupportMatrix.js` until every supported entry declares real file paths.

- [ ] **Step 4: Re-run the matrix asset test until all entries pass**

Run: `node --test desktop/tests/character-support-matrix.test.js`

Expected: PASS with no missing portrait or banner files for any supported entry.

### Task 5: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run the targeted desktop character suite**

Run:

```bash
node --test desktop/tests/character-support-matrix.test.js desktop/tests/character-visual-model.test.js desktop/tests/dashboard-character-card.test.js desktop/tests/account-state-model.test.js desktop/tests/active-character-native-detection.test.js
```

Expected: PASS

- [ ] **Step 2: Run the full desktop test suite**

Run: `npm test`

Working directory: `desktop`

Expected: PASS

- [ ] **Step 3: Record any residual follow-ups**

If runtime alias coverage still depends on only a subset of observed overlay tokens, document that explicitly in the close-out:

- canonical gameplay roster is complete
- alias table is complete only for currently observed runtime tokens

