# Artifact Parser Design

Date: 2026-04-15
Status: Draft for review
Scope: Targeted parsing of discovered PoE2 local artifact files for native character identity evidence

## Goal

Use the newly discovered local artifact files under `My Games/Path of Exile 2` to determine whether any of them expose:

- direct character identity
- stable per-character content differences
- or at least a strong enough correlation signal to narrow the active character without relying on `accountHint`

This phase does not widen probe surface again. It goes deeper into the artifacts we already found.

## Current Evidence

Live bridge diagnostics now consistently surface these PoE2 artifacts:

- `poe2_production`
- `poe2_production_Config.ini`
- `poe2_production_Loaded.mtx`
- `EShop/eshop_recommend_config_...json`

Current preview observations:

- `poe2_production_Config.ini`
  - contains gateway/display/runtime settings
  - `account_name=` is present but empty
  - no visible character name in current preview
- `poe2_production_Loaded.mtx`
  - contains numeric ids only
  - likely resource/material/load-state data
- `poe2_production`
  - present as a candidate
  - not yet parsed by file type/format
- `EShop ... json`
  - currently appears unhelpful

So the question is no longer "can we find artifacts?" It is:

- do these artifacts contain direct or correlated identity once parsed properly?

## Product Requirement

The production bar stays the same:

1. user selects a character
2. user presses `Play`
3. Juice Journal switches to the loaded character within `1-3 seconds`

This phase succeeds if it gives us one of:

- direct artifact identity
- stable per-character artifact delta
- documented evidence that these artifacts are not useful enough

## Recommended Direction

Focus only on the files we already have and parse them intentionally rather than treating them as plain filenames.

Recommended order:

1. `poe2_production_Config.ini`
2. `poe2_production`
3. `poe2_production_Loaded.mtx`
4. `EShop/*.json`

## Why This Order

### 1. `poe2_production_Config.ini`

Most likely to contain human-readable keys.

Questions:

- are there hidden keys below the current preview window that reference the last selected character
- do values change immediately after a character switch or `Play`
- is there any per-character or per-class key naming pattern

This is the cheapest parser to build and the easiest to reason about.

### 2. `poe2_production`

This file is suspicious because:

- it uses the same naming family as the config files
- it may be a state file or extensionless text/binary hybrid

Questions:

- is it plain text, INI-like, JSON-like, or binary
- if text-like, does it contain character-sensitive keys
- if binary, does it have stable string islands or simple records

### 3. `poe2_production_Loaded.mtx`

Probably not direct identity, but still worth checking for correlation.

Questions:

- does the numeric sequence change per character or only per content pack/loadout
- is the change stable across repeated launches of the same character
- can its fingerprint narrow the candidate set enough to be useful

### 4. `EShop/*.json`

Lowest probability.

Questions:

- are these only commerce/cache artifacts
- do they include account-only or character-only personalization

## Architecture

### Bridge Side

Add file-specific parsers instead of one generic artifact blob reader.

Recommended split:

- `ArtifactSnapshotReader`
  - reads bounded metadata and preview safely
- `ProductionConfigParser`
  - parses `.ini`-style keys from `poe2_production_Config.ini`
- `ProductionStateParser`
  - detects whether `poe2_production` is text or binary and extracts safe textual/structural hints
- `LoadedMtxParser`
  - computes stable summary/fingerprint from numeric sequences
- `ArtifactCorrelationCoordinator`
  - compares parsed outputs between samples and against character pool

### Diagnostic Model

Each parser should emit its own narrow diagnostic payload rather than one big opaque object.

Examples:

- `artifact-config-parse`
- `artifact-state-parse`
- `artifact-loaded-mtx-parse`
- `artifact-correlation`

### Hint Promotion

Still strict:

- no hint from `accountHint` alone
- no hint from weak artifact guesses
- only promote if a parsed artifact yields one exact native-backed candidate

## Parser Rules

### Text-like Files

For `.ini`, `.json`, and extensionless files that look textual:

- read bounded content
- normalize line endings
- parse key/value pairs when possible
- keep raw preview for diagnostics

### Binary-ish Files

For `.mtx` or extensionless files that are not textual:

- do not dump raw binary
- compute:
  - line/token count
  - first N tokens
  - stable hash/fingerprint
  - last write time

### Correlation Rules

Artifact evidence is interesting only if it is:

- stable for the same character across repeated launches
- different between characters
- or directly identity-bearing

One noisy diff is not enough.

## Success Criteria

This phase succeeds if one of these is proven:

1. direct identity
   - parsed artifact content contains character name or equivalent identity

2. stable correlation
   - parsed artifact fingerprint differs consistently per character and is stable per repeated launch

3. negative result with evidence
   - the artifact files are parseable but do not carry usable identity

## Testing Strategy

### Unit Tests

- config parser extracts keys safely
- state parser distinguishes text vs binary-like content
- loaded mtx parser produces stable summaries
- unreadable or malformed files fail closed

### Process Tests

- artifact diagnostics remain bounded
- preview fields remain strings
- parsed diagnostic payloads do not crash the bridge

### Manual Validation

For one PoE2 account with at least two characters:

1. sample character A
2. sample character A again
3. sample character B
4. compare parsed artifact diagnostics

Interpretation:

- A vs A should stay stable
- A vs B should differ if the file is character-sensitive

## Out of Scope

Still out of scope:

- OCR
- memory reading
- driver/kernel instrumentation
- production hint promotion from unvalidated artifact deltas

## Recommended Next Step

Write the implementation plan for:

1. file-specific artifact parsers
2. bounded parsed diagnostics
3. stable artifact fingerprint comparison
4. live validation across repeated A/B samples
