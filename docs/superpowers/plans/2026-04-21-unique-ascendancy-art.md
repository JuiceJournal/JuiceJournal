# Unique Ascendancy Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every playable Path of Exile 1 and Path of Exile 2 ascendancy its own unique portrait and banner on the desktop character summary surface.

**Architecture:** Keep the canonical support matrix as the source of truth, but tighten its contract so ascendancy entries can no longer reuse base-class portrait or banner paths. Drive the work with stricter matrix tests first, then add the missing art assets and update the matrix until every ascendancy resolves to its own file pair.

**Tech Stack:** Node.js test runner, Electron desktop renderer, static image assets, canonical character support matrix in `desktop/src/modules/characterSupportMatrix.js`.

---

### Task 1: Tighten Matrix Tests So Shared Ascendancy Art Fails

**Files:**
- Modify: `desktop/tests/character-support-matrix.test.js`
- Modify: `desktop/tests/character-visual-model.test.js`

- [ ] **Step 1: Add a failing uniqueness audit for ascendancy portrait and banner paths**

Replace or extend `desktop/tests/character-support-matrix.test.js` with these checks:

```js
test('every playable ascendancy declares portrait and banner assets', () => {
  const ascendancyEntries = PLAYABLE_CHARACTER_SUPPORT.filter((entry) => entry.ascendancy);

  assert.equal(ascendancyEntries.length, 36);

  ascendancyEntries.forEach((entry) => {
    assert.ok(entry.portraitPath, `${entry.id} missing portraitPath`);
    assert.ok(entry.bannerPath, `${entry.id} missing bannerPath`);
  });
});

test('every playable ascendancy uses portrait and banner files different from its base class', () => {
  const baseEntries = new Map(
    PLAYABLE_CHARACTER_SUPPORT
      .filter((entry) => !entry.ascendancy)
      .map((entry) => [`${entry.poeVersion}:${entry.baseClass}`, entry])
  );

  const sharedPortraits = [];
  const sharedBanners = [];

  PLAYABLE_CHARACTER_SUPPORT
    .filter((entry) => entry.ascendancy)
    .forEach((entry) => {
      const baseEntry = baseEntries.get(`${entry.poeVersion}:${entry.baseClass}`);
      assert.ok(baseEntry, `Missing base entry for ${entry.id}`);

      if (entry.portraitPath === baseEntry.portraitPath) {
        sharedPortraits.push(entry.id);
      }

      if (entry.bannerPath === baseEntry.bannerPath) {
        sharedBanners.push(entry.id);
      }
    });

  assert.deepEqual(sharedPortraits, []);
  assert.deepEqual(sharedBanners, []);
});
```

- [ ] **Step 2: Add a failing visual-model expectation for a currently shared portrait**

Add a concrete check in `desktop/tests/character-visual-model.test.js` that forces one shared PoE1 ascendancy and one shared PoE2 ascendancy to become unique:

```js
test('character visual model maps PoE1 Necromancer to a unique witch ascendancy treatment', () => {
  const visual = deriveCharacterVisual({
    name: 'HexArchivist',
    poeVersion: 'poe1',
    className: 'Witch',
    ascendancy: 'Necromancer'
  });

  assert.equal(visual.classLabel, 'Necromancer');
  assert.equal(visual.baseClassLabel, 'Witch');
  assert.equal(visual.portraitPath, 'assets/characters/poe1/necromancer.jpg');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe1/necromancer.jpg');
});

test('character visual model maps PoE2 Invoker to a unique monk ascendancy portrait and banner', () => {
  const visual = deriveCharacterVisual({
    name: 'KELLEE',
    poeVersion: 'poe2',
    className: 'Monk',
    ascendancy: 'Invoker'
  });

  assert.equal(visual.classLabel, 'Invoker');
  assert.equal(visual.baseClassLabel, 'Monk');
  assert.equal(visual.portraitPath, 'assets/characters/poe2/invoker.png');
  assert.equal(visual.bannerPath, 'assets/characters/banners/poe2/invoker.webp');
});
```

- [ ] **Step 3: Run the focused tests to verify RED**

Run:

```bash
node --test desktop/tests/character-support-matrix.test.js desktop/tests/character-visual-model.test.js
```

Expected:
- shared-asset assertions fail for many ascendancy entries
- concrete `Necromancer` and `Invoker` asset expectations fail because those files do not exist yet

### Task 2: Add Unique Ascendancy Asset Paths To The Matrix

**Files:**
- Modify: `desktop/src/modules/characterSupportMatrix.js`

- [ ] **Step 1: Introduce unique canonical asset names for every ascendancy entry**

Update every ascendancy entry so it points at a dedicated file path rather than the base-class path.

Examples of the exact target pattern:

```js
createEntry({
  poeVersion: 'poe1',
  baseClass: 'Witch',
  ascendancy: 'Necromancer',
  portraitKey: 'necromancer',
  bannerKey: 'necromancer',
  badgeText: 'N',
  tone: 'violet',
  portraitPath: 'assets/characters/poe1/necromancer.jpg',
  bannerPath: 'assets/characters/banners/poe1/necromancer.jpg',
}),

createEntry({
  poeVersion: 'poe2',
  baseClass: 'Monk',
  ascendancy: 'Invoker',
  portraitKey: 'invoker',
  bannerKey: 'invoker',
  badgeText: 'I',
  tone: 'azure',
  portraitPath: 'assets/characters/poe2/invoker.png',
  bannerPath: 'assets/characters/banners/poe2/invoker.webp',
}),
```

Apply the same pattern to all 36 ascendancy entries.

- [ ] **Step 2: Keep alias resolution unchanged while updating only asset targets**

Do not change canonical IDs or alias keys in this task. The work here is asset specificity, not lookup semantics.

- [ ] **Step 3: Run the focused tests again**

Run:

```bash
node --test desktop/tests/character-support-matrix.test.js desktop/tests/character-visual-model.test.js
```

Expected:
- uniqueness assertions may now pass structurally
- asset-existence assertions should still fail until the real files are added

### Task 3: Add Missing PoE1 Ascendancy Art

**Files:**
- Create: `desktop/src/assets/characters/poe1/*.jpg|png|webp`
- Create: `desktop/src/assets/characters/banners/poe1/*.jpg|png|webp`
- Modify: `desktop/src/modules/characterSupportMatrix.js`

- [ ] **Step 1: Add the exact PoE1 portrait files**

Create one portrait file for each:

```text
desktop/src/assets/characters/poe1/slayer.jpg
desktop/src/assets/characters/poe1/gladiator.jpg
desktop/src/assets/characters/poe1/champion.jpg
desktop/src/assets/characters/poe1/assassin.jpg
desktop/src/assets/characters/poe1/saboteur.jpg
desktop/src/assets/characters/poe1/trickster.jpg
desktop/src/assets/characters/poe1/juggernaut.jpg
desktop/src/assets/characters/poe1/berserker.jpg
desktop/src/assets/characters/poe1/chieftain.jpg
desktop/src/assets/characters/poe1/necromancer.jpg
desktop/src/assets/characters/poe1/occultist.jpg
desktop/src/assets/characters/poe1/elementalist.jpg
desktop/src/assets/characters/poe1/deadeye.jpg
desktop/src/assets/characters/poe1/warden.jpg
desktop/src/assets/characters/poe1/pathfinder.jpg
desktop/src/assets/characters/poe1/inquisitor.jpg
desktop/src/assets/characters/poe1/hierophant.jpg
desktop/src/assets/characters/poe1/guardian.jpg
desktop/src/assets/characters/poe1/ascendant.jpg
desktop/src/assets/characters/poe1/reliquarian.jpg
```

- [ ] **Step 2: Add the exact PoE1 banner files**

Create one banner file for each:

```text
desktop/src/assets/characters/banners/poe1/slayer.jpg
desktop/src/assets/characters/banners/poe1/gladiator.jpg
desktop/src/assets/characters/banners/poe1/champion.jpg
desktop/src/assets/characters/banners/poe1/assassin.jpg
desktop/src/assets/characters/banners/poe1/saboteur.jpg
desktop/src/assets/characters/banners/poe1/trickster.jpg
desktop/src/assets/characters/banners/poe1/juggernaut.jpg
desktop/src/assets/characters/banners/poe1/berserker.jpg
desktop/src/assets/characters/banners/poe1/chieftain.jpg
desktop/src/assets/characters/banners/poe1/necromancer.jpg
desktop/src/assets/characters/banners/poe1/occultist.jpg
desktop/src/assets/characters/banners/poe1/elementalist.jpg
desktop/src/assets/characters/banners/poe1/deadeye.jpg
desktop/src/assets/characters/banners/poe1/warden.jpg
desktop/src/assets/characters/banners/poe1/pathfinder.jpg
desktop/src/assets/characters/banners/poe1/inquisitor.jpg
desktop/src/assets/characters/banners/poe1/hierophant.jpg
desktop/src/assets/characters/banners/poe1/guardian.jpg
desktop/src/assets/characters/banners/poe1/ascendant.jpg
desktop/src/assets/characters/banners/poe1/reliquarian.jpg
```

- [ ] **Step 3: Re-run the matrix test to verify PoE1 asset coverage**

Run:

```bash
node --test desktop/tests/character-support-matrix.test.js
```

Expected:
- remaining failures should now be limited to PoE2 ascendancy files not yet added

### Task 4: Add Missing PoE2 Ascendancy Art

**Files:**
- Create: `desktop/src/assets/characters/poe2/*.png|jpg|webp`
- Create: `desktop/src/assets/characters/banners/poe2/*.png|jpg|webp`
- Modify: `desktop/src/modules/characterSupportMatrix.js`

- [ ] **Step 1: Add the exact PoE2 portrait files**

Create one portrait file for each ascendancy-specific entry:

```text
desktop/src/assets/characters/poe2/stormweaver.png
desktop/src/assets/characters/poe2/chronomancer.png
desktop/src/assets/characters/poe2/titan.png
desktop/src/assets/characters/poe2/warbringer.png
desktop/src/assets/characters/poe2/smith-of-kitava.png
desktop/src/assets/characters/poe2/deadeye.png
desktop/src/assets/characters/poe2/pathfinder.png
desktop/src/assets/characters/poe2/blood-mage.png
desktop/src/assets/characters/poe2/infernalist.png
desktop/src/assets/characters/poe2/lich.png
desktop/src/assets/characters/poe2/witchhunter.png
desktop/src/assets/characters/poe2/gemling-legionnaire.png
desktop/src/assets/characters/poe2/tactician.png
desktop/src/assets/characters/poe2/invoker.png
desktop/src/assets/characters/poe2/acolyte-of-chayula.png
desktop/src/assets/characters/poe2/amazon.png
desktop/src/assets/characters/poe2/ritualist.png
desktop/src/assets/characters/poe2/oracle.png
desktop/src/assets/characters/poe2/shaman.png
```

- [ ] **Step 2: Add the exact PoE2 banner files**

Create one banner file for each:

```text
desktop/src/assets/characters/banners/poe2/stormweaver.jpg
desktop/src/assets/characters/banners/poe2/chronomancer.jpg
desktop/src/assets/characters/banners/poe2/titan.jpg
desktop/src/assets/characters/banners/poe2/warbringer.jpg
desktop/src/assets/characters/banners/poe2/smith-of-kitava.jpg
desktop/src/assets/characters/banners/poe2/deadeye.jpg
desktop/src/assets/characters/banners/poe2/pathfinder.jpg
desktop/src/assets/characters/banners/poe2/blood-mage.jpg
desktop/src/assets/characters/banners/poe2/infernalist.jpg
desktop/src/assets/characters/banners/poe2/lich.jpg
desktop/src/assets/characters/banners/poe2/witchhunter.jpg
desktop/src/assets/characters/banners/poe2/gemling-legionnaire.jpg
desktop/src/assets/characters/banners/poe2/tactician.jpg
desktop/src/assets/characters/banners/poe2/invoker.jpg
desktop/src/assets/characters/banners/poe2/acolyte-of-chayula.jpg
desktop/src/assets/characters/banners/poe2/amazon.jpg
desktop/src/assets/characters/banners/poe2/ritualist.jpg
desktop/src/assets/characters/banners/poe2/oracle.jpg
desktop/src/assets/characters/banners/poe2/shaman.jpg
```

- [ ] **Step 3: Align the matrix with the actual final file extensions**

If a sourced file lands as `.webp` instead of `.jpg`, update the matrix entry immediately so the path remains exact and explicit.

- [ ] **Step 4: Re-run the matrix and visual-model tests to verify GREEN**

Run:

```bash
node --test desktop/tests/character-support-matrix.test.js desktop/tests/character-visual-model.test.js
```

Expected: PASS

### Task 5: Renderer Verification

**Files:**
- Modify: `desktop/tests/dashboard-character-card.test.js`
- Modify: `desktop/src/app.js` only if needed

- [ ] **Step 1: Add or update a renderer test for a uniquely illustrated ascendancy**

Ensure the test asserts explicit ascendancy artwork:

```js
assert.equal(elements.characterClass.textContent, 'Necromancer');
assert.equal(elements.characterClassMeta.textContent, 'Witch');
assert.equal(elements.characterBannerImage.src.endsWith('/assets/characters/banners/poe1/necromancer.jpg'), true);
assert.equal(elements.characterPortraitImage.src.endsWith('/assets/characters/poe1/necromancer.jpg'), true);
```

- [ ] **Step 2: Run the renderer test**

Run:

```bash
node --test desktop/tests/dashboard-character-card.test.js
```

Expected: PASS

### Task 6: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run the full desktop character-art verification set**

Run:

```bash
node --test desktop/tests/character-support-matrix.test.js desktop/tests/character-visual-model.test.js desktop/tests/dashboard-character-card.test.js
```

Expected: PASS

- [ ] **Step 2: Run the full desktop suite**

Run:

```bash
npm test
```

Working directory: `desktop`

Expected: PASS

- [ ] **Step 3: Call out remaining operational caveats**

The close-out should explicitly say whether:

- all 36 playable ascendancies now have unique portrait and banner assets
- any source images were approximate rather than official
- any future roster additions will still require new asset work

