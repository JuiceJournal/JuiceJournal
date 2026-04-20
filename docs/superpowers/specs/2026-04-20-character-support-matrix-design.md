# Character Support Matrix Design

## Goal

Make the desktop character presentation fully support every currently playable base class and every currently playable ascendancy in Path of Exile 1 and Path of Exile 2, with explicit portrait, banner, label, and tone metadata for each supported gameplay entry.

The intended result is that no supported playable class or ascendancy renders through the generic `unknown` fallback path.

## Current Problem

The project already receives real character identity from backend account payloads and cached account state, but the desktop visual layer is only partially modeled:

- `desktop/src/modules/accountStateModel.js` preserves `className` and `ascendancy`.
- `backend/services/poeApiService.js` normalizes live character payloads from official Path of Exile account APIs.
- `desktop/src/modules/characterVisualModel.js` contains a partial, hand-maintained mapping table for a subset of classes and a subset of PoE2 numeric variant tokens.

This creates three concrete issues:

1. Officially playable entries are missing from the visual mapping.
2. Asset coverage is inconsistent across base classes and ascendancies.
3. Numeric overlay-style aliases are mixed directly into the visual model and at least one current mapping is demonstrably unsafe to trust as a global source of truth.

## Official Supported Roster

This design uses the following official playable roster as of April 20, 2026.

### Path of Exile 1

Source: official Ascendancy Classes page on `pathofexile.com`, crawled in April 2026.

Base classes:

- Duelist
- Shadow
- Marauder
- Witch
- Ranger
- Templar
- Scion

Ascendancies:

- Duelist: Slayer, Gladiator, Champion
- Shadow: Assassin, Saboteur, Trickster
- Marauder: Juggernaut, Berserker, Chieftain
- Witch: Necromancer, Occultist, Elementalist
- Ranger: Deadeye, Warden, Pathfinder
- Templar: Inquisitor, Hierophant, Guardian
- Scion: Ascendant, Reliquarian

### Path of Exile 2

Sources:

- official Early Access ascendancy announcement on `pathofexile.com`
- official 0.2.0 `Dawn of the Hunt` patch notes
- official 0.4.0 `The Last of the Druids` patch notes

Base classes:

- Sorceress
- Warrior
- Ranger
- Witch
- Mercenary
- Monk
- Huntress
- Druid

Ascendancies:

- Sorceress: Stormweaver, Chronomancer
- Warrior: Titan, Warbringer, Smith of Kitava
- Ranger: Deadeye, Pathfinder
- Witch: Blood Mage, Infernalist, Lich
- Mercenary: Witchhunter, Gemling Legionnaire, Tactician
- Monk: Invoker, Acolyte of Chayula
- Huntress: Amazon, Ritualist
- Druid: Oracle, Shaman

## Support Contract

The support contract is defined against gameplay identity, not against current asset file names and not against the current numeric variant names in tests.

Every supported entry must resolve to:

- `classLabel`
- `baseClassLabel`
- `detailLabel`
- `portraitKey`
- `bannerKey`
- `portraitPath`
- `bannerPath`
- `tone`
- `badgeText`

Supported entries are:

- every PoE1 base class
- every PoE1 ascendancy
- every PoE2 base class
- every PoE2 ascendancy

That is a canonical matrix of:

- 7 PoE1 base entries
- 19 PoE1 ascendancy entries
- 8 PoE2 base entries
- 17 PoE2 ascendancy entries

Total: 51 explicitly supported gameplay entries.

## Resolver Behavior

The visual resolver must stop treating the current in-file class tables as the source of truth. Instead, it should resolve through a canonical support matrix with explicit alias handling.

### Canonical Inputs

The resolver must accept:

- `poeVersion`
- `className` or `class`
- optional `ascendancy`

The resolver must normalize these shapes:

1. API-style payloads
   - Example: `class=Monk`, `ascendancy=Invoker`
2. account-state payloads
   - Example: `className=Monk`, `ascendancy=Invoker`
3. overlay/native variant aliases already observed in this codebase
   - Example: `Monk2`, `Druid2`, `Mercenary3`, `Huntress1`

### Resolution Rules

1. If `poeVersion + base class + ascendancy` matches a canonical entry, return that ascendancy entry.
2. If only `poeVersion + base class` is present, return the base-class entry.
3. If an observed alias maps to a canonical entry, resolve through that alias table first.
4. If the input is not part of the official playable roster, return the existing neutral fallback.

### UI Semantics

The desktop card should distinguish the visible ascendancy from the underlying base class:

- `characterClass` should display the resolved gameplay identity
  - Ascendancy if present
  - Base class otherwise
- `characterClassMeta` should display the base class
  - Example: main label `Invoker`, meta label `Monk`
  - Example: main label `Templar`, meta label `Templar`

This avoids losing class context while still surfacing ascendancy identity.

## Proposed File Structure

### New Module

Add a dedicated data module for canonical support, for example:

- `desktop/src/modules/characterSupportMatrix.js`

Responsibilities:

- define the 51 canonical playable entries
- define alias mappings from observed runtime tokens to canonical entries
- expose lookup helpers

The matrix should not infer support from filenames. Each supported entry should declare its asset paths explicitly so tests can treat the matrix as authoritative.

### Existing Visual Model

Keep `desktop/src/modules/characterVisualModel.js` as the public resolver facade, but reduce it to:

- input normalization
- delegation into the support matrix
- final fallback behavior for unsupported, non-playable, or malformed data

### Renderer

Update `desktop/src/app.js` so the summary card uses:

- `visual.classLabel` for the main class line
- `visual.baseClassLabel` for the class meta line

## Asset Strategy

### Principle

Every supported gameplay entry must have explicit asset coverage by the end of the implementation.

### Asset Policy

1. Prefer official Grinding Gear Games / Path of Exile promotional or patch assets when available.
2. If official assets are inaccessible in a usable form, download the closest high-quality web asset that matches the game identity and visual style.
3. Store portrait assets under:
   - `desktop/src/assets/characters/poe1/`
   - `desktop/src/assets/characters/poe2/`
4. Store banner assets under:
   - `desktop/src/assets/characters/banners/poe1/`
   - `desktop/src/assets/characters/banners/poe2/`

### Reuse vs Dedicated Art

The matrix must be explicit for every entry. Asset reuse is allowed only when it is intentional and represented explicitly in the matrix.

That means:

- two entries may point at the same portrait or banner path
- but the matrix must still contain both entries separately
- no entry is considered "supported by implication"

This matters because gameplay support is defined by explicit entries, not by whatever happens after stripping suffixes.

## Testing Strategy

The current example-based tests are not enough. The new tests must verify matrix completeness.

### Required Tests

1. Canonical matrix completeness
   - every official playable base class and ascendancy is present
   - no expected official entry is missing

2. Asset existence
   - every canonical entry points to an existing portrait file
   - every canonical entry points to an existing banner file

3. Resolver correctness for canonical names
   - base class only resolves to base-class entry
   - base class + ascendancy resolves to ascendancy entry

4. Alias correctness for observed runtime tokens
   - currently observed aliases such as `Monk2`, `Druid2`, `Mercenary3`, `Huntress1` resolve to the intended canonical entries

5. Renderer output
   - main class text shows ascendancy when present
   - meta class text shows the base class

### Non-Goal for Tests

The implementation should not pretend to know every possible future overlay numeric token. The canonical support matrix is authoritative for gameplay identities; the alias table is authoritative only for observed and confirmed runtime aliases.

## Error Handling

### Supported Playable Entries

Supported playable entries must not silently degrade. Missing assets or missing matrix rows should fail tests before shipping.

### Unsupported or Malformed Inputs

Keep the existing neutral fallback for:

- unreleased classes
- malformed data
- incomplete payloads with no usable class identity

Runtime fallback remains useful for corrupted or unexpected input, but it is no longer acceptable for officially playable entries.

## Risks

### Risk 1: Wrong Numeric Alias Assumptions

The current PoE2 numeric aliases in the repo are partial and not trustworthy as a global truth. This is already visible because the current variant mapping is incomplete and structurally brittle.

Mitigation:

- make canonical support depend on official class + ascendancy names
- isolate numeric aliases in a separate alias table
- only add numeric aliases that are observed in tests, fixtures, or runtime captures

### Risk 2: Asset Style Drift

Downloading web images can create inconsistent visual language across entries.

Mitigation:

- prefer official GGG art first
- normalize dimensions and formats during asset import
- keep asset choices explicit in the matrix so replacements are easy

### Risk 3: Future Class Additions

PoE2 is still evolving.

Mitigation:

- treat the supported roster as versioned and date-bound
- when GGG adds new playable classes or ascendancies, extend the canonical matrix and tests deliberately

## Recommendation

Implement a canonical support matrix now instead of extending the current `CLASS_VISUALS` and `POE2_CLASS_VARIANTS` objects in place.

That gives the project:

- a single place to reason about playable coverage
- deterministic tests for roster completeness
- clear separation between official gameplay identities and runtime alias quirks
- a safe path for adding downloaded assets without further hard-coding logic into the renderer

## Source Notes

Official sources used to define the playable roster:

- Path of Exile Ascendancy Classes: `https://www.pathofexile.com/ascendancy/classes`
- Path of Exile 2 Early Access Ascendancy announcement: `https://www.pathofexile.com/forum/view-thread/3592012`
- Path of Exile 2 Content Update 0.2.0 patch notes: `https://www.pathofexile.com/forum/view-thread/3740562`
- Path of Exile 2 Content Update 0.4.0 patch notes: `https://www.pathofexile.com/forum/view-thread/3883495`
