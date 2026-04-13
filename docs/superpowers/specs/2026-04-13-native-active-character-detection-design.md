# Native Active Character Detection Design

Date: 2026-04-13
Status: Draft for review
Scope: Desktop native/game-event based active character detection for PoE1 and PoE2

## Goal

Update the character summary card to the actual character the user entered the game with, within roughly `1-3 seconds` of loading in, without using OCR.

This design treats the current API-refresh approach as a fallback only. The primary path should come from a native or game-event source comparable to the mechanism used by PoE Overlay II.

## Problem Statement

The current desktop app can:

- detect whether `PoE1` or `PoE2` is running
- load the user’s character list from the Path of Exile account API
- choose a default character per game

But it cannot reliably answer:

- which character the user actually loaded into the game with right now

The GGG character API appears too stale or too coarse for this requirement, and current `Client.txt` parsing does not expose a reliable active-character selection signal.

## Product Requirement

Expected behavior:

1. User selects a character in the Path of Exile character select screen.
2. User presses `Play`.
3. Once the character loads into the game, Juice Journal updates the character card to that active character within `1-3 seconds`.

Fallback behavior:

- if the native detection path is unavailable or fails, keep the current API-refresh path as a secondary fallback
- do not blank the card on failure
- preserve the last known character until a better signal is available

## Technical Direction

### Primary Path

Use a native or injected game-event source to observe active-game information after launch.

The reference signal model is inspired by PoE Overlay II:

- `game detected`
- `required features set`
- `info updates`
- `game events`

The core question is not “what events do they name publicly?” but:

- what payload is available from the provider after the game loads
- whether it includes active-character identity directly
- or whether it includes enough data to map to a character deterministically

### Secondary Path

Retain the existing delayed API refresh path as fallback.

This remains valuable when:

- native integration is temporarily unavailable
- a required feature is unsupported on a given install
- access permissions or platform packaging differ

## Architecture

### 1. Native Game Info Adapter

Purpose:

- subscribe to game launch/info/event updates from the native provider
- normalize provider payloads into desktop-safe events

Responsibilities:

- handle launch, close, and info-update lifecycle
- emit normalized `activeCharacterDetected` or `activeCharacterHint` events
- expose diagnostics for unavailable/missing features

### 2. Active Character Resolver

Purpose:

- turn native payloads into a concrete active character selection

Resolution order:

1. direct active-character identity from provider payload, if available
2. provider hint matched against current character pool
3. fallback delayed API refresh
4. last known character

Responsibilities:

- compare provider payload against known account characters
- support PoE1 and PoE2 pools independently
- avoid random character jumps

### 3. Renderer Character Refresh Orchestrator

Purpose:

- coordinate native signals and fallback refreshes without duplicating logic

Responsibilities:

- consume normalized native events
- call `setCurrentUser()` or a lighter selection update path when enough data exists
- trigger fallback API refresh when native payload is incomplete
- keep stale timers or requests from overwriting newer state

### 4. Fallback API Refresh

Purpose:

- backstop native detection with the existing account refresh path

Responsibilities:

- remain opt-in from the orchestrator
- preserve current retry and last-known-character behavior
- not become the primary path again

## Detection Model

### Best Case

Native provider returns active character identity directly.

Example normalized payload:

```json
{
  "poeVersion": "poe2",
  "characterName": "KELLEE",
  "className": "Monk2",
  "league": "Standard"
}
```

In this case:

- match against the known `poe2` character pool
- set active character immediately

### Acceptable Case

Native provider does not return full identity, but returns enough game info to trigger a very narrow refresh.

Example:

- area entered
- process/game info update
- instance loaded
- player state initialized

In this case:

- schedule a short fallback refresh
- compare refreshed selection to current selection

### Failure Case

No usable native signal.

In this case:

- keep last known character
- allow delayed API fallback
- surface debug diagnostics only, not user-facing failure chrome

## Data Model Impact

No large schema change is required for the first implementation.

Expected additions are local/runtime only:

- `state.activeCharacterDetection`
- `state.nativeCharacterHint`
- `state.activeCharacterRefreshSource`

Possible normalized runtime payload:

```json
{
  "source": "native-game-info",
  "poeVersion": "poe2",
  "characterName": "KELLEE",
  "className": "Monk2",
  "league": "Standard",
  "confidence": "high"
}
```

## Testing Strategy

### Unit Tests

- provider payload normalization
- resolver matching native payload to known characters
- fallback ordering
- stale native events do not override newer state

### Integration Tests

- `game launch -> native info update -> active character card update`
- `native hint incomplete -> fallback API refresh -> character update`
- `native detection failure -> last known character preserved`

### Manual Validation Matrix

- `PoE1 native`
- `PoE1 Steam`
- `PoE2 native`
- `PoE2 Steam`

Check:

- correct game version badge
- correct character card update after load
- no stale overwrite after switching characters
- fallback path does not blank the card

## Risks

### Native Provider Availability

The biggest technical risk is not UI complexity but whether the local desktop stack can access equivalent native game events without the full PoE Overlay II platform layer.

### Payload Uncertainty

We do not yet know whether the provider exposes:

- direct character identity
- indirect but useful hints
- or only generic game/window info

That uncertainty is the core reason this work starts as investigation-first.

### Permissions / Packaging

Native provider behavior may vary between:

- Steam
- native launcher
- elevated/non-elevated launches

## Out of Scope

Not part of this design:

- OCR fallback for character selection
- memory reading
- immediate pre-load character selection tracking on the menu screen
- visual redesign work
- stash/result/history features

## Recommended Next Step

Investigation phase:

1. isolate what the native/game-event provider actually returns after load
2. document whether active-character identity exists directly
3. if yes, implement a thin adapter
4. if no, document the best available native hints and pair them with fallback API refresh

This should become the basis for the implementation plan, not be mixed into unrelated UI work.
