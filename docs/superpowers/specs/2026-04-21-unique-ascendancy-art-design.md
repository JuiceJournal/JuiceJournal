# Unique Ascendancy Art Coverage Design

## Goal

Upgrade the desktop character presentation so every currently playable Path of Exile 1 and Path of Exile 2 ascendancy has its own dedicated portrait and its own dedicated banner on the dashboard character summary surface.

The intended result is:

- no playable ascendancy falls back to a shared base-class portrait
- no playable ascendancy falls back to a shared base-class banner
- users with different characters always see artwork that matches the specific class identity shown in the UI

## Why This Supersedes The Previous Design

The earlier character support matrix design established complete gameplay coverage, but it allowed explicit asset reuse between base classes and ascendancies.

That is no longer sufficient for the product requirement.

The updated requirement is stricter:

- shared assets may still be acceptable for base-class entries
- but playable ascendancy entries must have unique art coverage

This design supersedes the asset-coverage portion of:

- `docs/superpowers/specs/2026-04-20-character-support-matrix-design.md`

The canonical roster, alias handling, and matrix architecture still stand. The change is specifically about the asset contract for playable ascendancies.

## Current Gap

The current support matrix ensures that every playable entry resolves to a portrait path and a banner path, but many of those paths are reused from the base class.

Examples of the current gap:

- PoE1 ascendancies currently reuse their base-class portrait and banner.
- Multiple PoE2 ascendancies still reuse their base-class portrait and banner.
- Only a small subset of PoE2 ascendancies currently has unique banner treatment.

This means the UI can be technically complete while still failing the intended visual identity requirement.

## Product Requirement

For every playable ascendancy in PoE1 and PoE2:

- `classLabel` should show the ascendancy name
- `baseClassLabel` should show the base class
- `portraitPath` must point to a unique ascendancy portrait asset
- `bannerPath` must point to a unique ascendancy banner asset

For base-class entries:

- unique art is preferred but not required by this design
- base-class entries may continue to use one portrait and one banner per base class

## Supported Roster

The canonical playable roster remains unchanged from the existing support matrix spec.

### Path of Exile 1 Ascendancies

- Duelist: Slayer, Gladiator, Champion
- Shadow: Assassin, Saboteur, Trickster
- Marauder: Juggernaut, Berserker, Chieftain
- Witch: Necromancer, Occultist, Elementalist
- Ranger: Deadeye, Warden, Pathfinder
- Templar: Inquisitor, Hierophant, Guardian
- Scion: Ascendant, Reliquarian

### Path of Exile 2 Ascendancies

- Sorceress: Stormweaver, Chronomancer
- Warrior: Titan, Warbringer, Smith of Kitava
- Ranger: Deadeye, Pathfinder
- Witch: Blood Mage, Infernalist, Lich
- Mercenary: Witchhunter, Gemling Legionnaire, Tactician
- Monk: Invoker, Acolyte of Chayula
- Huntress: Amazon, Ritualist
- Druid: Oracle, Shaman

Total playable ascendancies that require unique portrait + banner coverage:

- PoE1: 19
- PoE2: 17
- Total: 36

## New Asset Contract

The support matrix must now satisfy two different contracts:

### Base-Class Contract

Each base class entry must resolve to:

- a portrait
- a banner
- class label metadata
- tone metadata

These may remain one-per-base-class.

### Ascendancy Contract

Each ascendancy entry must resolve to:

- a unique portrait asset
- a unique banner asset
- ascendancy-specific label metadata
- base-class label metadata
- tone metadata

“Unique” here means the matrix entry must not point at the same portrait or banner path as its base-class entry.

It may share color family or style language, but not the exact same file path.

## Architecture

The current architecture remains correct:

- `desktop/src/modules/characterSupportMatrix.js` remains the canonical source of truth
- `desktop/src/modules/characterVisualModel.js` remains the resolver facade
- `desktop/src/app.js` continues to render from normalized visual output

What changes is the completeness rule:

- the support matrix is no longer allowed to reuse base-class art for ascendancy entries

## Asset Strategy

### Priority Order

1. Official Grinding Gear Games artwork
2. Official patch-art or marketing screenshots cropped into stable portrait/banner frames
3. If official art is unavailable, controlled web-sourced imagery that is visually consistent with the existing style

### File Placement

Base-class assets may stay where they are.

Ascendancy-specific assets should use explicit names that preserve the canonical identity:

- PoE1 portraits: `desktop/src/assets/characters/poe1/<ascendancy-slug>.png|jpg|webp`
- PoE1 banners: `desktop/src/assets/characters/banners/poe1/<ascendancy-slug>.png|jpg|webp`
- PoE2 portraits: `desktop/src/assets/characters/poe2/<ascendancy-slug>.png|jpg|webp`
- PoE2 banners: `desktop/src/assets/characters/banners/poe2/<ascendancy-slug>.png|jpg|webp`

Examples:

- `deadeye.jpg`
- `elementalist.jpg`
- `ascendant.jpg`
- `stormweaver.jpg`
- `blood-mage.jpg`
- `acolyte-of-chayula.webp`

### Normalization Rule

The matrix should explicitly map:

- canonical ascendancy name
- asset file path

No path should be derived by guessing from the class name at runtime.

## Resolver Behavior

Resolver behavior does not change structurally:

1. canonical base class + ascendancy wins
2. base class only resolves to a base-class entry
3. numeric overlay aliases resolve into canonical entries

What changes is the expected output:

- every ascendancy entry must now resolve to unique art paths

## UI Semantics

The desktop character card should continue to show:

- main label: ascendancy
- secondary/meta label: base class

Examples:

- `Invoker` / `Monk`
- `Necromancer` / `Witch`
- `Champion` / `Duelist`

This is especially important now that the art also differentiates ascendancies.

## Testing Strategy

The current matrix tests must become stricter.

### Required Test Rules

1. Every playable ascendancy has a portrait path.
2. Every playable ascendancy has a banner path.
3. Every playable ascendancy portrait file exists.
4. Every playable ascendancy banner file exists.
5. Every playable ascendancy portrait path differs from its base-class portrait path.
6. Every playable ascendancy banner path differs from its base-class banner path.

### Matrix Coverage Tests

Continue to test:

- all canonical playable entries exist
- all observed numeric runtime aliases resolve correctly

### Renderer Tests

Continue to test:

- main label shows ascendancy
- meta label shows base class
- portrait/banner URLs resolve to the new ascendancy-specific files

## Migration Plan

Implementation should happen in this order:

1. Tighten tests first so shared ascendancy art fails.
2. Add ascendancy-specific file paths to the matrix.
3. Import or normalize all missing ascendancy portrait assets.
4. Import or normalize all missing ascendancy banner assets.
5. Re-run matrix and renderer tests until every playable ascendancy passes.

## Risks

### Risk 1: Inconsistent Visual Quality

If ascendancy art comes from mixed sources, the UI can look inconsistent.

Mitigation:

- keep the crop ratio and output dimensions standardized
- use consistent filename conventions
- prefer official art first

### Risk 2: Asset Volume

This requirement is significantly larger than the previous matrix.

Mitigation:

- keep matrix architecture unchanged
- treat asset collection as a deterministic checklist against the canonical roster

### Risk 3: Future Playable Additions

PoE2 roster changes will create immediate art gaps.

Mitigation:

- retain the canonical roster test
- add a unique-art assertion for every new ascendancy

## Recommendation

Proceed with the existing canonical matrix architecture, but tighten the definition of completeness:

- complete gameplay support
- complete unique ascendancy portrait coverage
- complete unique ascendancy banner coverage

This matches the user-facing expectation for the dashboard character banner much better than the prior shared-asset model.

## Source Notes

Roster sources remain the same as in the prior matrix spec:

- Path of Exile Ascendancy Classes: `https://www.pathofexile.com/ascendancy/classes`
- Path of Exile 2 Early Access Ascendancy announcement: `https://www.pathofexile.com/forum/view-thread/3592012`
- Path of Exile 2 Content Update 0.2.0 patch notes: `https://www.pathofexile.com/forum/view-thread/3740562`
- Path of Exile 2 Content Update 0.4.0 patch notes: `https://www.pathofexile.com/forum/view-thread/3883495`
