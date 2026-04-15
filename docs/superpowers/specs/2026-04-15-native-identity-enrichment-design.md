# Native Identity Enrichment Design

Date: 2026-04-15
Status: Draft for review
Scope: Remove production dependence on `accountHint` by enriching the local native bridge with stronger low-risk identity signals for `PoE1 + PoE2`

## Goal

Move the local native bridge toward the same product bar as the overlay implementation:

- `active-character-hint` must be driven by a real native identity signal
- `accountHint` must not be the primary production decision path
- the final behavior must still hit the `1-3 second` target for both `PoE1` and `PoE2`

This phase is not about polishing the current heuristic. It is about replacing the remaining soft dependency with a native-first identity path.

## Current State

The branch now has:

- low-risk probe scaffolding
- bridge diagnostics
- persistent stdin/stdout bridge lifecycle
- synchronized `characterPool`
- synchronized `accountHint`
- gated hint emission that still relies on `accountHint + characterPool` exact match

This is useful for validation, but it is not the final product answer.

Why:

- if the chosen character changes while the account payload is stale, the bridge still inherits that staleness
- if we keep `accountHint` as the production identity source, we are not actually solving the native identity problem
- this does not meet the "overlay-level certainty" bar

## Product Requirement

For both games:

1. user selects a character
2. user presses `Play`
3. Juice Journal switches to the loaded character within `1-3 seconds`

The production-quality path must satisfy:

- no wrong character switches
- no blank card
- no dependence on stale web payload timing
- no silent fallback to weak guesses

## Core Decision

### Production Identity Source

Production `active-character-hint` must come from:

- native signal only

Not from:

- `accountHint` alone
- `characterPool + accountHint` alone
- delayed API refresh

### Role of `accountHint`

`accountHint` may remain only as:

- instrumentation aid
- debug comparison surface
- tie-break input after native identity has already been narrowed to a single candidate class of outcomes

It must not be allowed to create a production hint when native identity is absent.

## Recommended Direction

Enrich the bridge with stronger user-mode, low-risk native signals before considering anything more invasive.

Recommended order:

1. process command line and ancestry
2. foreground window tree enrichment
3. module / named pipe / mutex / handle snapshots
4. local artifact or IPC side-channel correlation
5. only after those fail: explicit escalation decision

## Candidate Enrichment Paths

### 1. Process Command Line and Ancestry

Questions:

- does `PathOfExile` or its parent/child chain expose stable arguments around `Play`
- does Steam/native launcher behavior differ in a useful way
- does a relaunch or child transition correlate tightly enough with selected character commit

Implementation targets:

- process executable path
- parent process id
- parent executable name
- command line
- child process transitions within a narrow time window

### 2. Foreground Window Tree Enrichment

Current `WindowProbe` only captures one foreground window.

We should extend it to inspect:

- owner window
- root window
- sibling candidate windows in the same process tree
- transient title/class changes around `Play`

Goal:

- determine whether character select vs in-world load exposes a stable, character-sensitive window pattern

### 3. Module / Named Pipe / Mutex / Handle Snapshots

We already know process count alone is too weak.

We should check whether the game process exposes stable identity-adjacent artifacts during world entry:

- loaded modules
- named pipes
- mutex names
- file mappings
- other process-level object names that change consistently with the selected character path

This remains user-mode and non-driver.

### 4. Local Artifact / IPC Side Channels

Questions:

- does the game or launcher create/update local artifacts at the moment the selected character is committed
- are there side channels outside `Client.txt` that are more identity-sensitive

Examples:

- launcher temp files
- runtime cache writes
- local IPC endpoints

## Promotion Rule

The bridge may emit a production `active-character-hint` only when:

- a native signal exists
- the signal is specific enough to narrow the candidate set
- the signal is stable across repeated runs
- the result does not require `accountHint` to invent identity

Allowed:

- native identity directly yields `characterName`
- native signal narrows candidates and `characterPool` confirms one exact match

Not allowed:

- no native identity signal, then `accountHint` fills the whole gap
- multiple native candidates, then `accountHint` picks one
- stale `accountHint` overriding contradictory native evidence

## Architecture Changes

### Bridge

Add richer probe surfaces instead of making `HintResolver` smarter in the dark.

Recommended additions:

- `ProcessTreeProbe`
- `CommandLineProbe`
- `WindowTreeProbe`
- `ArtifactProbe`
- `IdentityProbeCoordinator`

`HintResolver` should remain strict and boring:

- accept enriched native evidence
- reject ambiguous evidence
- emit nothing when identity is not native-backed

### Desktop Main

Desktop main should keep:

- `characterPool` sync
- optional `accountHint` sync

But should be explicit that:

- `accountHint` is not trusted as the production source
- bridge diagnostics should expose whether a hint was native-backed or validation-backed

## Diagnostics Strategy

This phase should stay diagnostics-heavy.

New diagnostic payloads should explain:

- which probe found evidence
- what was observed
- whether the evidence is identity-bearing, identity-adjacent, or noise
- why a hint was emitted or rejected

Example messages:

- `process-tree-probe`
- `command-line-probe`
- `window-tree-probe`
- `artifact-probe`
- `hint-resolution-rejected`
- `hint-resolution-promoted`

## Success Criteria

This phase succeeds only if one of these is proven:

1. direct native identity found
   - bridge can produce `characterName` from native signal alone

2. strong native narrowing found
   - native signal narrows the candidate set enough that `characterPool` confirms exactly one candidate
   - `accountHint` is not required to create the identity

3. no viable low-risk identity signal exists
   - we document that clearly and open an explicit escalation decision for the next technique

## Testing Strategy

### Bridge Unit Tests

- enriched probes normalize outputs consistently
- `HintResolver` rejects `accountHint`-only identity
- `HintResolver` emits only when native evidence is present
- version-scoped matching remains intact

### Bridge Process Tests

- repeated sync commands do not restart the process
- diagnostics still emit before stdin traffic
- identity-bearing sync does not emit without active PoE process
- identity-bearing native signal promotes to one real hint when the evidence is strong

### Desktop Tests

- `accountHint` changes re-sync even when the pool stays stable
- desktop forwards only supported high-confidence hint payloads
- diagnostics remain side-effect free

## Out of Scope

Still out of scope:

- OCR
- kernel/driver techniques
- memory reading
- packaged production hardening

Those remain explicit escalation steps, not silent fallback paths.

## Recommended Next Step

Write the implementation plan for:

1. native identity enrichment probes
2. strict native-backed hint promotion
3. diagnostics that explain why a hint was or was not emitted
4. tests that prove `accountHint` is no longer the production decision source
