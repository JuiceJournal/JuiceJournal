# Native Active Character Producer Design

Date: 2026-04-13
Status: Draft for review
Scope: Desktop main-process producer that emits native active-character hints for PoE1 and PoE2

## Goal

Add the missing producer side for native active-character detection so Juice Journal can update the character card within roughly `1-3 seconds` after the user loads into the game.

This design does not replace the existing renderer-side native hint consumer. It supplies the producer that the current consumer is waiting for.

## Why This Exists

The current branch already has:

- native hint normalization
- main/preload transport
- renderer hint resolution
- delayed API refresh fallback

But it still cannot update the card from a real native signal because no main-process source emits `activeCharacterHint`.

PoE Overlay II provided the missing reference model.

## Research Findings

### Runtime Feature Registration

In the PoE Overlay II standalone runtime bundle, the live game config for PoE2 requests:

- `gep_internal`
- `me`
- `match_info`

Those features are passed into the game event listener and registered through the native game-event provider.

### Active Character Source

PoE Overlay II does not appear to derive active character from a dedicated `selected-character` event.

Instead, it treats `info` as the canonical active-character signal. The decisive fields are:

- `me.character_name`
- `me.character_level`
- `me.character_exp`

That `info` payload updates the character slice and sets the active character name. `player-level-up` is a secondary refresh path, not the primary one.

### Consequence For Juice Journal

The producer should aim to emit a high-confidence hint when an `info`-equivalent payload becomes available, not wait for a more specialized event that may not exist.

## Product Requirement

Expected behavior:

1. User selects a character.
2. User presses `Play`.
3. After the character actually loads into the game, Juice Journal receives a native hint and updates the character card within `1-3 seconds`.

Fallback behavior:

- if no native hint arrives, keep the current delayed API refresh path
- if both fail, keep the last known character
- never blank the card during transition

## Producer Responsibilities

### 1. Register Native Features Per Game

The producer must start only when a supported game is launched and register the required native features for that game.

Initial target:

- `PoE2`: `gep_internal`, `me`, `match_info`

Planned extension:

- `PoE1`: same producer shape, but feature registration must be validated separately before enabling

### 2. Listen To Native Info Updates

The producer must subscribe to:

- native `info` update notifications
- native game events, when available

But `info` is the primary path. Game events are supplemental only.

### 3. Normalize To A Juice Journal Hint

The producer must translate raw native payloads into the existing Juice Journal hint contract.

Minimum normalized payload:

```json
{
  "source": "native-info",
  "poeVersion": "poe2",
  "characterName": "KELLEE",
  "className": "Monk2",
  "level": 92,
  "confidence": "high"
}
```

Optional fields when available:

- `league`
- `experience`
- `requiredExperience`

### 4. Emit Through Existing Main/Preload Channel

The producer must call the existing main-process emission path:

- `emitActiveCharacterHint(...)`

No new renderer contract is required for the first implementation.

## Main-Process Architecture

### Native Active Character Producer

Add a focused main-process module with one responsibility:

- consume native game info
- emit normalized active-character hints

Suggested boundaries:

- `start(gameVersion, gameId, executionPath)`
- `stop()`
- `handleInfoUpdate(payload)`
- `handleGameEvent(payload)`

The producer should remain game-scoped and be restarted on launch/switch/termination.

### Producer Lifecycle

On game launch:

1. Resolve current game version and runtime game id.
2. Register supported features for that game.
3. Subscribe to native `info` updates.
4. Attempt an immediate `getInfo()` read after registration.

On `info` update:

1. Read raw payload.
2. Extract `me.character_name`.
3. Extract `me.character_level` and `me.character_exp` if present.
4. Build a normalized hint.
5. Emit it only if it is valid and game-scoped.

On game termination:

1. Unsubscribe native listeners.
2. Drop producer-local temporary state.
3. Do not emit a blank character hint.

## Resolution Rules

The producer should emit only when all of the following are true:

- `poeVersion` is known
- `characterName` is a non-empty string
- payload belongs to the active game

Confidence rules:

- `high`: `characterName` present from native `info`
- `medium`: `characterName` inferred from secondary game event plus matching account state
- `low`: do not emit; let API fallback handle it

The first implementation should target only `high`.

## Error Handling

If feature registration fails:

- log a structured warning
- leave API fallback enabled
- do not crash startup

If native payload is malformed:

- ignore that payload
- keep the last valid hint intact

If producer initialization races with launch/switch:

- only the latest active game may emit
- stale producer callbacks must be ignored

## Testing Strategy

### Unit Tests

- producer ignores missing `characterName`
- producer emits high-confidence hint for valid `info` payload
- stale producer callback cannot emit after game switch
- producer does not emit for wrong game scope

### Integration Tests

- `game launched -> register features -> immediate getInfo -> emit native hint`
- `new-info-update -> getInfo -> emit native hint`
- `producer unavailable -> API fallback still runs`

### Manual Validation

For PoE2:

1. Launch game.
2. Pick a different character.
3. Press `Play`.
4. Confirm the character card switches within `1-3 seconds`.

Check:

- `PoE2` badge remains correct
- character portrait/banner updates with the new class mapping
- no temporary blank state
- no stale overwrite from the previous character

## Out of Scope

Not part of this design:

- OCR on the character select screen
- memory reading
- replacing the existing renderer hint consumer
- removing API fallback
- PoE1 feature enablement without validating its native payloads first

## Recommended Implementation Order

1. Build the producer around PoE2 only.
2. Wire it into the existing main/preload hint channel.
3. Validate the `info` payload shape on live PoE2 loads.
4. Keep delayed API refresh as fallback.
5. Extend the same producer to PoE1 after validating feature support and payload shape.
