# Bridge Character Pool Sync Design

Date: 2026-04-15
Status: Draft for review
Scope: Character-pool synchronization from Electron main into the local native bridge for `PoE1 + PoE2`

## Goal

Give the local native bridge enough account context to turn native probe signals into high-confidence active-character hints for both `PoE1` and `PoE2`.

This phase does not replace the bridge’s native probes. It supplies the missing account-side context needed for high-confidence matching.

## Product Direction

The active-character solution stays:

- no OCR
- no memory reading
- no Overwolf product dependency
- same `1-3 second` target for `PoE1` and `PoE2`

The bridge will now combine:

- native signals
- current account character pool from Electron main

## Core Decision

### Synchronization Model

Use:

- `full snapshot replace`

Not:

- incremental character diffs

Why:

- simpler first implementation
- easier drift/debug story
- fewer partial-state bugs

### Transport

Use:

- `stdin` NDJSON commands from Electron main to bridge

Keep:

- `stdout` NDJSON messages from bridge back to Electron

Why:

- lowest integration cost
- fits current bridge model
- avoids named-pipe framing complexity for the first pass

## Data Contract

Electron main will send a character pool snapshot containing at least:

- `poeVersion`
- `characterId`
- `characterName`
- `className`
- `ascendancy`
- `level`
- `league`

Example command:

```json
{
  "type": "set-character-pool",
  "detectedAt": "2026-04-15T12:00:00.000Z",
  "characters": [
    {
      "poeVersion": "poe2",
      "characterId": "poe2-kellee",
      "characterName": "KELLEE",
      "className": "Monk2",
      "ascendancy": "Invoker",
      "level": 92,
      "league": "Standard"
    },
    {
      "poeVersion": "poe2",
      "characterId": "poe2-koca",
      "characterName": "KocaAyVeMasha",
      "className": "Druid2",
      "ascendancy": "Shaman",
      "level": 96,
      "league": "Fate of the Vaal"
    }
  ]
}
```

The bridge should replace its full in-memory pool on each valid command.

## Architecture

### Electron Main Responsibilities

Electron main should:

1. build the current normalized character pool from existing account state
2. launch the bridge supervisor
3. send full pool snapshots over bridge stdin:
   - after login
   - after `get-current-user`
   - after any character/account refresh that changes the pool
4. continue reading bridge stdout for diagnostics and hints

### Bridge Responsibilities

The bridge should:

1. accept `stdin` lines as NDJSON commands
2. parse `set-character-pool`
3. replace its in-memory character pool
4. use that pool during hint resolution
5. remain safe if no pool is present

### Hint Resolver Responsibilities

The bridge-side resolver should:

- never emit a hint without a native signal
- never emit a hint without a matching candidate from the current pool
- prefer exact name matches when present
- stay version-scoped (`poe1` pool cannot satisfy `poe2` signals)

## Matching Policy

### High-Confidence Cases

Emit `active-character-hint` only when:

- native signal carries or strongly implies one character
- exactly one candidate in the matching `poeVersion` pool fits
- ambiguity is zero

### Ambiguous Cases

Do not emit a hint when:

- multiple candidates fit equally
- native signal is too weak
- bridge has no synchronized pool

In those cases:

- emit diagnostics only
- leave desktop fallback behavior intact

## Error Handling

If stdin receives malformed JSON:

- ignore that line
- emit optional diagnostic
- keep the last known pool

If stdin receives an unsupported command:

- ignore it
- optionally emit diagnostic

If `set-character-pool` payload is structurally invalid:

- reject the update
- keep the previous pool

If the pool is empty:

- clear the in-memory pool
- do not emit stale hints

## Testing Strategy

### Bridge Unit Tests

- `set-character-pool` replaces the full pool
- malformed pool command is ignored
- unsupported command is ignored
- resolver uses only the current pool
- resolver stays version-scoped

### Desktop Unit Tests

- account state is normalized into bridge snapshot format
- full snapshot is sent on sync points
- desktop does not emit duplicate stdin writes unnecessarily

### Integration Tests

- bridge receives a snapshot over stdin
- bridge resolves a synthetic native signal into one exact hint
- desktop main forwards that hint to existing `emitActiveCharacterHint(...)`

## Out of Scope

Not part of this phase:

- named pipes
- bidirectional control protocol beyond simple stdin/stdout
- memory reading
- OCR fallback
- packaged production hardening

## Recommended Next Step

Write the implementation plan for:

1. bridge stdin command parser
2. full-snapshot character pool sync from Electron main
3. bridge-side pool-backed hint resolution
4. tests for sync, replace, and version-scoped matching
