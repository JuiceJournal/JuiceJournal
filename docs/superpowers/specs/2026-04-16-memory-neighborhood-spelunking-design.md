# Memory Neighborhood Spelunking Design

Date: 2026-04-16
Status: Draft for review
Scope: Read-only neighborhood-level memory spelunking for PoE active-character identity

## Goal

Extend the current read-only memory feasibility spike beyond direct string hits and determine whether the PoE process contains:

- stable region fingerprints
- local textual islands
- neighboring string clusters
- or small repeated structures

that can correlate to the active character within `1-3 seconds` after `Play`.

This phase is still:

- user-mode
- read-only
- diagnostics-only
- non-production

## Why This Phase Exists

The first read-only memory spike already works technically:

- the bridge can find the live PoE process
- it can enumerate readable committed regions
- it can scan bounded memory for exact target strings

But in live sampling:

- `hitCount = 0`
- no direct character-name matches appeared

So the next question is not “can we read memory?”
It is:

- are the useful signals nearby, but not directly equal to the known names

## Decision Boundary

This phase is allowed to:

- read bounded process memory
- inspect neighboring bytes around weak or indirect cues
- compute region fingerprints
- search for short textual islands
- classify regions as stable, noisy, or candidate-bearing

This phase is not allowed to:

- write memory
- inject code
- hook the process
- resolve pointer chains deeply
- automate input
- ship user-visible behavior

## Recommended Direction

Instead of looking only for exact full-name hits, inspect neighborhoods and repeated patterns.

Recommended order:

1. region fingerprinting
2. local text island extraction
3. neighborhood clustering
4. repeated A/A/B comparison

## Probe Strategy

### 1. Region Fingerprinting

For each accepted readable region:

- hash the first bounded slice
- hash a few offset windows
- record size and protection

Goal:

- determine whether some regions change consistently when the selected character changes

### 2. Local Text Islands

Inside each region buffer:

- extract ASCII and UTF-16LE text islands above a minimum length
- keep only bounded snippets
- avoid dumping raw binary

Goal:

- detect character-adjacent text that is not an exact full-name hit
- e.g. class names, ascendancies, labels, nearby metadata

### 3. Neighborhood Clustering

When a short interesting island is found:

- inspect nearby windows around the hit
- summarize surrounding text islands
- compute a neighborhood fingerprint

Goal:

- if direct identity is absent, discover whether a stable region neighborhood differs per character

### 4. A/A/B Comparison

The output must be compared across:

- character A, sample 1
- character A, sample 2
- character B, sample 1

Goal:

- separate stable character-sensitive signals from random runtime noise

## Architecture

### Native Bridge

Recommended additions:

- `MemoryRegionFingerprintProbe`
- `MemoryTextIslandExtractor`
- `MemoryNeighborhoodProfiler`
- `MemoryComparisonCoordinator`

The existing `MemoryProbe` and `MemoryStringScanner` remain useful:

- `MemoryProbe` finds safe readable regions
- `MemoryStringScanner` still checks direct hits
- new profilers work on the same bounded buffers

### Diagnostics

New diagnostic messages should be narrow and explicit:

- `memory-feasibility-probe`
- `memory-region-fingerprint`
- `memory-text-islands`
- `memory-neighborhood-profile`
- `memory-comparison-candidate`

No hint promotion in this phase.

## Success Criteria

This phase succeeds if one of these is proven:

1. direct identity found nearby
   - a text island or nearby string cluster contains clear active-character identity

2. stable region correlation found
   - one or more neighborhoods remain stable for A/A and differ for B

3. negative result with evidence
   - neighborhoods are too noisy or too uniform to use

## Testing Strategy

### Unit Tests

- text island extraction ignores binary noise
- UTF-16 and ASCII islands are both recognized
- region fingerprints are stable for identical buffers
- bounded output never exceeds configured limits

### Integration Tests

- explicit memory spike command emits neighborhood diagnostics
- diagnostics remain JSON-safe and bounded
- no production hint is emitted

### Manual Validation

For live PoE2 testing:

1. run A sample
2. repeat A sample
3. switch to B
4. run B sample
5. compare fingerprints and extracted islands

## Out of Scope

Still out of scope:

- pointer-chain resolution
- object layout reverse-engineering
- production hint promotion
- anti-detection work
- drivers or kernel access

## Recommended Next Step

Write the implementation plan for:

1. memory region fingerprinting
2. text island extraction
3. neighborhood diagnostics
4. A/A/B comparison workflow
