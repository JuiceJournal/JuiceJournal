# Active Hint Emission Design

Date: 2026-04-15
Status: Draft for review
Scope: Promote local native bridge diagnostics into real `active-character-hint` emission for PoE1 and PoE2

## Goal

Turn the local native bridge from a diagnostics-only probe into a real active-character hint source that can update the Juice Journal character card within `1-3 seconds` after `Play`.

This phase is where the bridge starts emitting a production-meaningful hint, but only after a signal is proven strong enough.

## Current State

Current branch now has:

- `.NET 10` bridge scaffold
- `ProcessProbe`
- `WindowProbe`
- `TransitionProbe`
- desktop-side bridge parser
- desktop-side bridge supervisor
- `main.js` bridge lifecycle wiring

But all emitted bridge data is still diagnostics-only.

## Product Requirement

For both `PoE1` and `PoE2`:

1. user selects a character
2. user presses `Play`
3. within `1-3 seconds`, Juice Journal switches the character card to the actually loaded character

Fallback remains:

- do not blank the card
- preserve last known character
- use API refresh only as a secondary path

## Decision Boundary

This phase still avoids:

- OCR
- driver/kernel work
- memory reading

Those remain escalation options only if the low-risk bridge path fails.

## Emission Strategy

### Diagnostics First, Promotion Second

The bridge should not emit `active-character-hint` just because a probe exists.

It should emit a hint only when:

- the signal is character-sensitive
- the signal is stable across repeated runs
- the signal works for both `PoE1` and `PoE2`
- confidence is high enough to beat API fallback safely

### Candidate Promotion Paths

#### 1. Direct Identity Signal

Best case:

- one of the bridge probes observes `characterName` directly
- optional `className`, `level`, or `league` come with it

Then the bridge can emit:

```json
{
  "type": "active-character-hint",
  "poeVersion": "poe2",
  "characterName": "KELLEE",
  "className": "Monk2",
  "level": 92,
  "confidence": "high",
  "source": "local-native-bridge",
  "detectedAt": "2026-04-15T12:00:00.000Z"
}
```

#### 2. Correlated Identity Signal

If no direct identity exists:

- a stable native transition event may still identify a single candidate from the current account character pool

Example inputs:

- current game version
- process transition timing
- foreground window transition
- area-entered timing from existing desktop runtime
- selected character pool from current account state

If exactly one candidate is plausible, emit a high-confidence hint.

#### 3. No Sufficient Signal

If confidence is not high:

- emit diagnostics only
- do not emit `active-character-hint`
- let delayed API refresh remain secondary fallback

## Architecture

### Bridge Side

Add a narrow `HintResolver` layer in the `.NET 10` bridge:

- consumes current probe outputs
- decides whether a high-confidence hint can be emitted
- otherwise emits only diagnostics

Recommended responsibilities:

- `ProbeCoordinator`
- `HintResolver`
- `HintEmitter`

### Electron Main

No major design shift.

Desktop main should:

- continue consuming bridge payloads
- forward only supported `active-character-hint` payloads
- ignore diagnostics except optional logging

### Renderer

No architectural rewrite.

Current native-hint consumption path already exists and should remain the only renderer integration point.

## Confidence Policy

Only two outcomes matter:

- `high` → emit real hint
- `none` → emit no hint

For this phase we should avoid introducing a `medium` hint path into the UI.

Reason:

- medium-confidence hints are likely to create wrong character switches
- wrong switches are worse than slower fallback

## Emission Rules

The bridge may emit `active-character-hint` only if:

- `poeVersion` is known
- `characterName` is non-empty
- the hint belongs to the currently active process context
- the source signal has passed repeated validation

The bridge must not emit:

- duplicate hints every poll
- stale hints from previous process/session
- a hint on partial or ambiguous evidence

## Testing Strategy

### Unit Tests

Bridge side:

- direct identity payload becomes a high-confidence hint
- ambiguous correlated signal emits no hint
- stale session/process data is ignored

Desktop side:

- supported hint payload reaches `emitActiveCharacterHint(...)`
- unsupported payload still remains diagnostics-only

### Integration Tests

- bridge emits synthetic `active-character-hint`
- main process forwards it
- renderer switches character without waiting for delayed API refresh

### Manual Validation

For each game:

- `PoE1 native`
- `PoE1 Steam`
- `PoE2 native`
- `PoE2 Steam`

Flow:

1. character A selected, press `Play`
2. record card update timing
3. character B selected, press `Play`
4. verify card changes again

Success means:

- correct character
- correct class/portrait/banner
- no stale overwrite
- no blank state
- `1-3 second` timing

## Risks

### False Positive Correlation

Heuristic resolution may appear correct in one run and fail on the next.

Mitigation:

- require repeated validation before promotion
- keep high-confidence threshold strict

### Cross-Game Drift

PoE1 and PoE2 may need different promotion rules.

Mitigation:

- model the resolver per `poeVersion`
- do not force one signal path across both games

### Over-Promotion

If we rush from diagnostics to hint emission, we risk regressing the UI.

Mitigation:

- explicit promotion criteria
- bridge emits diagnostics until criteria are met

## Out of Scope

Still out of scope:

- OCR
- memory reading
- anti-cheat-adjacent instrumentation
- packaged production distribution hardening

## Recommended Next Step

Before writing the implementation plan for this phase, we should answer one question with live evidence:

- among `WindowProbe`, `TransitionProbe`, existing runtime area events, and account character pool, do we now have a signal that is strong enough to promote into a high-confidence hint?

If yes:

- write the implementation plan for `HintResolver + active-character-hint emission`

If no:

- continue signal probes rather than emitting guesses.
