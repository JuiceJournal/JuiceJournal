# Local Native Bridge Signal Probe Design

Date: 2026-04-14
Status: Draft for review
Scope: Phase B signal-probing strategy for the `.NET 10` local native bridge

## Goal

Determine which Windows-local signal can identify the active Path of Exile character within `1-3 seconds` after `Play`, without OCR and without relying on the stale GGG account API as the primary source.

This phase does not try to ship the final solution in one step. It narrows the signal source with instrumentation-first delivery.

## Current State

Phase A is now in place:

- `.NET 10` bridge scaffold exists
- process probe diagnostics exist
- desktop-side parser exists
- bridge supervisor exists
- `main.js` can launch and supervise the bridge

But the bridge currently emits only diagnostics. It does not yet emit a real `active-character-hint`.

## Problem Statement

We have already ruled out the obvious cheap paths:

- `GGG character API` is too stale/coarse
- `PoE2 Client.txt` contains useful area/level-up information but not a reliable active-character selection signal at load time

So the next question is not “can we parse more logs?” It is:

- which local native signal changes when the user presses `Play` and enters the world
- and whether that signal contains character identity or enough evidence to derive it

## Recommended Direction

Use the local native bridge to probe multiple candidate signal sources in parallel, but keep emission diagnostic-only until a high-confidence signal is identified.

Recommended probe order:

1. foreground window metadata
2. process launch/child-process transitions
3. module/handle snapshots around the game process
4. local file or IPC side channels created during load
5. area-entered correlation with current bridge diagnostics and existing desktop runtime state

## Why This Order

### 1. Foreground Window Metadata

Cheapest and safest.

Questions:

- does the game expose a meaningful title/class during character select vs in-world load
- does the title or owning window tree reference character identity

Why first:

- easy to probe from `.NET 10`
- low risk
- no invasive behavior

### 2. Process Launch / Child-Process Transitions

Questions:

- does the launcher or runtime spawn a distinct child when the selected character is committed
- do process command lines or transient children carry useful data

Why second:

- still low-risk
- likely available with standard Windows APIs

### 3. Module / Handle Snapshots

Questions:

- do loaded modules, named pipes, mutexes, or handles change in a useful way when the in-world session is established

Why third:

- more advanced than window/process metadata
- still userland and local

### 4. Local Files / IPC Side Channels

Questions:

- does the game create or update any local artifacts near load time that include selected character context

Why fourth:

- lower probability
- still worth checking before considering anything more invasive

### 5. Correlation Layer

Questions:

- if no single direct signal contains character identity, can we combine:
  - active game version
  - process/window load transition
  - `Client.txt` area load
  - account character pool
  into a high-confidence character guess

Why last:

- more heuristic
- should only be used if direct identity is unavailable

## Non-Goals

Still out of scope:

- OCR
- memory reading
- driver/kernel techniques
- anti-cheat-adjacent instrumentation

## Probe Payload Strategy

The bridge should add new diagnostic payload types first.

Examples:

```json
{
  "type": "bridge-diagnostic",
  "level": "info",
  "message": "window-probe",
  "detectedAt": "2026-04-14T12:00:00.000Z",
  "data": {
    "poeVersion": "poe2",
    "windowTitle": "Path of Exile 2",
    "windowClass": "POEWindowClass",
    "isForeground": true
  }
}
```

```json
{
  "type": "bridge-diagnostic",
  "level": "info",
  "message": "process-transition",
  "detectedAt": "2026-04-14T12:00:00.000Z",
  "data": {
    "poeVersion": "poe2",
    "parentPid": 1234,
    "childPid": 5678,
    "commandLine": "..."
  }
}
```

The bridge should not emit `active-character-hint` during this phase unless the signal is clearly direct and stable.

## Architecture Changes

### Native Bridge

Add separate probe services rather than one monolithic detector.

Recommended split:

- `ProcessProbe`
- `WindowProbe`
- `TransitionProbe`
- `ProbeCoordinator`

Each should answer one question and emit diagnostics independently.

Important implementation detail:

- within a single bridge run, `process-probe` and `transition-probe` may share one underlying process snapshot
- this is preferred when both diagnostics would otherwise enumerate live processes separately
- the logical diagnostics stay separate, but the data capture can be shared to avoid transition-race drift

### Electron Main

No major architectural change.

Desktop main should:

- continue parsing bridge messages
- continue ignoring unsupported payloads
- optionally log bridge diagnostics for manual validation

### Desktop Renderer

No new renderer work in this phase.

We should not couple UI changes to probe discovery.

## Success Criteria

This phase succeeds if we can answer one of these with evidence:

1. `direct signal found`
   - a native source directly exposes character identity

2. `usable correlated signal found`
   - a native source does not expose identity directly, but it gives a stable event that can be paired with existing account/runtime state

3. `no viable low-risk signal`
   - we document that the remaining options become too invasive or unreliable

Even outcome `3` is useful because it prevents wasted engineering time.

## Testing Strategy

### Unit Tests

For each probe service:

- probe returns empty diagnostic when no candidate context exists
- probe normalizes raw native output
- probe failures are swallowed into diagnostics, not crashes

### Integration Tests

- bridge emits diagnostics for the selected probe type
- desktop main consumes diagnostics without crashing
- unsupported diagnostic messages do not mutate active character state

### Manual Validation

For each candidate probe:

1. launch Juice Journal
2. launch PoE2
3. choose character A
4. press `Play`
5. record emitted diagnostics
6. repeat with character B
7. compare the before/after probe output

The signal is only interesting if the outputs differ in a stable, character-sensitive way.

## Risks

### Too Much Probe Noise

If we emit every possible low-level event, the data becomes noisy and impossible to reason about.

Mitigation:

- keep each probe narrow
- name diagnostics explicitly
- log only stable snapshots at important moments

### False Confidence

A signal may appear correlated in one run but fail across characters, launches, or launcher types.

Mitigation:

- require repeated validation across at least two characters and both relaunch/reselect flows

### Premature Hint Emission

If we start emitting character hints before confidence is real, we will regress the UI with wrong character switches.

Mitigation:

- diagnostics-first phase
- no hint emission without explicit promotion

## Recommended Next Step

Implement Phase B as:

1. add `WindowProbe`
2. add `TransitionProbe`
3. emit diagnostics only
4. run live `character A` vs `character B` comparisons
5. decide whether we have a direct identity source or only a correlation source

Only after that should we write the next implementation plan for actual hint emission.
