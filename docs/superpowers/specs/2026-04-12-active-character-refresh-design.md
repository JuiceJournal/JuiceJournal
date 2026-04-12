# Active Character Refresh Design

Date: 2026-04-12
Status: Draft for review
Scope: Desktop character summary refresh after Path of Exile game launch and character entry

## Goal

When the user clicks `Play` and the selected character finishes loading into the game, the desktop app should refresh the character summary card so it reflects the active in-game character without requiring OCR.

This first version should prefer the simplest reliable approach: use the existing Path of Exile account payload and refresh it shortly after the game is detected.

## Product Behavior

### Target User Experience

1. User selects a different character in the Path of Exile character select screen.
2. User presses `Play`.
3. Juice Journal detects that the selected game has launched.
4. After a short delay, the app refreshes the current user payload.
5. The character summary card updates to the correct active character for that game.

This applies first to `PoE2`, but the mechanism should be general enough to support the same behavior for `PoE1`.

## Constraints

- Do not use OCR for this feature.
- Prefer existing API-backed account/character data.
- Preserve the current account/character state pipeline rather than creating a second rendering path.
- If refresh fails, keep showing the last known character instead of replacing it with an error state.

## Approach

### Recommended V1

Use `API refresh on game launch`.

Flow:

1. Main process detects `poe1` or `poe2` launch/switch.
2. Renderer receives the game-version change event.
3. Renderer schedules a delayed account refresh.
4. Renderer calls the existing `getCurrentUser()` flow again.
5. Refreshed character payload is passed through the existing `accountStateModel`.
6. The character summary card and overlay state re-render from normalized state.

This is intentionally conservative:

- it reuses the existing auth/account pipeline
- it avoids OCR
- it does not require reverse engineering game memory or native bindings
- it can be replaced later by a faster signal if needed

## Selection Logic

After the refreshed payload is received, active character selection should resolve in this order:

1. `selectedCharacterByGame[activePoeVersion]`
2. previously selected character for the same game, if it still exists
3. highest-confidence changed character for the same game
4. highest-level character for the same game
5. first character in that game pool

The purpose is to avoid random character jumps while still preferring explicit server-provided selection when available.

## Timing

### Debounce

Use a `3 second` delay after game launch/switch before the first refresh.

Reasoning:

- faster than 5 seconds without being too eager
- gives the game enough time to establish session/account state
- reduces pointless early refreshes while the user is still transitioning

### Retry Policy

Retry at most once.

Policy:

- first refresh at `+3s`
- if it fails, one retry at `+5s`
- if that also fails, stop and keep the last known character

No aggressive polling is included in this version.

## Failure Behavior

If the refresh fails:

- keep the current character card unchanged
- do not blank the card
- do not force a generic sync-needed state
- allow a lightweight console/debug log entry

This is acceptable because the previous character is still more useful than an empty state, and failure should be rare.

## Architecture

### Main Process

No new character-detection engine is needed.

Main process responsibility:

- continue emitting game launch/switch events
- include enough signal for the renderer to know a character refresh should be attempted

### Renderer

Renderer should own the delayed refresh scheduling.

Responsibilities:

- debounce refresh attempts
- avoid stacking duplicate timers
- request fresh `currentUser`
- reuse `setCurrentUser()` / `refreshAccountStateFromCurrentUser()`
- preserve current card if refresh fails

### Account Model

The current `accountStateModel` remains the source of truth for selecting the character shown in the UI.

The only required behavior change is that refreshed payloads should be re-applied when the game context changes.

## Testing Strategy

### Unit Tests

- launch-triggered refresh waits for the configured debounce
- failed refresh preserves the previous character
- one retry occurs after the first failed refresh
- repeated game-change events do not stack multiple concurrent refresh loops

### Renderer Integration Tests

- `game-version-changed -> delayed getCurrentUser -> setCurrentUser`
- refreshed payload updates the card for `poe2`
- failure path leaves the previous character visible

### Manual Validation Matrix

- `PoE1 native`
- `PoE1 Steam`
- `PoE2 native`
- `PoE2 Steam`

For each:

- game version badge updates correctly
- character summary updates after launch delay
- portrait and class label remain correct

## Out of Scope

- OCR-based character detection
- memory reading / native process inspection
- continuous polling while the character select screen remains open
- instant update before the game finishes loading
- automatic inference from undocumented internal state

## Next-Step Compatibility

This design leaves room for a later upgrade:

- replace delayed API refresh with a stronger native/log signal
- keep the current account normalization and rendering pipeline intact
- preserve the current cache fallback behavior
