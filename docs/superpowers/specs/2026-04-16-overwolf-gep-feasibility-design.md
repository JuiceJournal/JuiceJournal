# Overwolf GEP Feasibility Design

Date: 2026-04-16
Status: Approved for spike implementation
Scope: Feasibility and integration direction for using Overwolf GEP as the active-character identity source

## Goal

Evaluate whether Overwolf's Game Events Provider can replace the current native-bridge identity experiments and provide a production-grade active-character signal for `PoE1 + PoE2`.

This phase is about:

- technical feasibility
- platform constraints
- open-source implications
- rollout requirements

It is not yet about full migration.

## Why This Path Is Back On The Table

The local bridge work already proved a lot:

- process tree
- window tree
- named pipes
- artifact names
- artifact previews
- parsed artifact content
- read-only memory scans
- neighborhood diagnostics

Result:

- none of those paths produced a reliable active-character identity signal

So the remaining realistic product path may be:

- use the platform that already exposes supported game events/info

## Official Overwolf State

According to official Overwolf docs:

- GEP exists for Overwolf Electron:
  - [Game Events Provider (Electron docs)](https://dev.overwolf.com/ow-electron/live-game-data-gep/live-game-data-gep-intro/)
- `Path of Exile 2` is listed as a supported game with these relevant features:
  - `me.character_name`
  - `me.character_level`
  - `me.character_exp`
  - `me.character_class`
  - `match_info.current_zone`
  - [Path of Exile 2 GEP page](https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/path-of-exile-2/)

Important platform constraints from the docs:

- Electron GEP rolls out per game
- not all games are in `PROD`
- `DEV` environment may be required first
- moving a game to `PROD` requires notifying Overwolf DevRel

So this is not a pure local dependency-free path.

## Product Decision

If the product bar remains:

- overlay-grade certainty
- fast character switching
- low engineering uncertainty

then Overwolf/GEP is currently the strongest realistic option.

Compared to continued reverse-engineering:

- lower technical uncertainty
- lower maintenance cost
- higher platform dependency

## Open Source Implications

Open source is still possible, but it becomes:

- platform-dependent open source

Important interpretation of Overwolf terms:

- our app code remains ours
- Overwolf platform access is licensed and revocable
- production deployment remains subject to their platform policies

Practical meaning:

- we can open-source the application code
- but users still need the Overwolf platform/runtime and any related approvals/availability on Overwolf's side
- this is not a standalone, fully self-sufficient OSS distribution in the same sense as a plain Electron app

That is acceptable if we document it clearly.

## Recommended Technical Direction

### Phase 1: Feasibility Spike

Build the smallest possible Overwolf-based PoE2 spike that proves:

- can we subscribe to GEP from our app environment
- can we read `me.character_name`
- how quickly does it update after `Play`
- what does `DEV` vs `PROD` access look like for us

### Phase 2: Adapter Layer

If the spike works, add a narrow adapter that converts Overwolf GEP payloads into the same internal hint model we already built for the native bridge.

That lets us preserve:

- renderer contract
- active-character precedence rules
- fallback behavior

### Phase 3: Product Rollout Decision

Only after the spike:

- decide whether we fully pivot
- or keep native bridge as a fallback/instrumentation path

## Architecture

### Keep the Existing Hint Contract

Do not rewrite the renderer again.

Keep using the current internal payload shape:

```json
{
  "source": "overwolf-gep",
  "poeVersion": "poe2",
  "characterName": "KELLEE",
  "className": "Monk2",
  "confidence": "high"
}
```

### Add an Overwolf Adapter, Not a New Product Model

Recommended units:

- `OverwolfGepAdapter`
- `OverwolfCapabilityDetector`
- `OverwolfHintNormalizer`

The adapter should:

- subscribe to required features early
- map Overwolf payloads into our internal hint model
- remain fail-closed if GEP is unavailable

## What We Need From the User Later

Not yet, but likely soon:

1. Overwolf developer account / console access
2. app registration if required by the workflow
3. `DEV` environment setup confirmation
4. if the spike succeeds, DevRel contact once we approach `PROD`

We should not ask for all of that up front.

We only ask when the implementation actually reaches those steps.

## Immediate User Action Policy

During the spike we only ask the user for Overwolf-side actions when the code path actually reaches them.

Current order:

1. local capability spike in code
2. verify whether `app.overwolf.packages.gep` is present at runtime
3. only then ask for:
   - developer console access
   - app registration visibility
   - DEV package feed confirmation
4. only near rollout ask for DevRel / PROD movement

## Risks

### Platform Dependency

If Overwolf changes support or policy, we depend on them.

### Environment Gating

PoE2 support may work in `DEV` before `PROD`, which slows rollout.

### Open Source Perception

Users may assume “open source” means standalone. We will need to document clearly that Overwolf runtime/platform access is still required.

## Success Criteria

This phase succeeds if we can prove one of these:

1. `PoE2 GEP works for us in DEV`
   - `me.character_name` arrives correctly and fast enough

2. `PoE2 GEP is blocked for our environment`
   - we document exactly what is missing: console access, env flag, DevRel, unsupported game state, etc.

3. `PoE2 GEP is technically available but product-risky`
   - then we decide whether platform dependency is acceptable

## Recommended Next Step

Write the implementation plan for a minimal Overwolf GEP spike:

1. capability check
2. required feature subscription
3. `me.character_name` read path
4. mapping into our existing hint contract
5. explicit notes for the user when Overwolf console / DevRel action is needed
