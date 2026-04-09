# PoE OAuth Overlay V1 Design

**Date:** 2026-04-09  
**Status:** Drafted from approved brainstorming decisions  
**Branch:** `feature/poe-oauth-overlay-v1-design`

## Goal

Extend Juice Journal from a settings/session desktop app into a Path of Exile account-centered runtime tracker with:

- Path of Exile OAuth as the only login method
- automatic local user creation after successful OAuth
- a dashboard that combines character context and runtime map/session context
- an optional compact in-game-style mini overlay
- PoE1 stash tracking as a first-class feature
- PoE2-ready data and capability boundaries, even where a feature is not yet enabled

The objective is not to clone PoE Overlay II. The objective is to build a cleaner internal architecture that supports overlay-like surfaces and future expansion without coupling the UI directly to logs, stash scraping, or OAuth implementation details.

## Product Decisions

The following decisions are already approved and define this design:

- Authentication is **PoE OAuth only**
- Users without a Path of Exile login **cannot use the app**
- Successful PoE OAuth login **automatically creates or updates** the local Juice Journal user
- V1 surface is **desktop dashboard plus optional mini overlay**
- Runtime architecture is **hybrid with strict fallback**
  - runtime/map state comes from local detection and log parsing
  - character/account identity comes from linked PoE account data
- Stash tracking is **PoE1-first**
- PoE2 must remain **forward-compatible**, but PoE2 stash is **not part of V1**

## Non-Goals

The following are explicitly outside V1:

- a full multi-page in-game overlay shell like PoE Overlay II
- in-stash item-by-item live overlay rendering
- trade assistant, build planner, passive tree tooling, or market helper surfaces
- party-aware session coordination
- cross-device session resume or cloud overlay sync
- fully enabled PoE2 stash tracking

## High-Level Experience

### Login Flow

1. User launches Juice Journal
2. Only one call to action is shown: `Login with Path of Exile`
3. OAuth completes
4. Backend creates or updates the local user record
5. App loads:
   - account identity
   - available characters
   - last selected character or default active character
   - current capability matrix for PoE1/PoE2

### Primary Surface

The main desktop dashboard remains the primary workspace. It gains:

- `Character Summary`
- `Runtime Session`
- `Mapping Insights`
- `Account Status`
- `Stash Tracking`

### Secondary Surface

The app can show a compact mini overlay:

- always optional
- lightweight, readable, runtime-driven
- visible only when supported game state is present
- not the source of truth for data, only a consumer of normalized session state

## Architecture

The architecture is intentionally provider-based and capability-aware.

### Provider Model

Three provider classes define the system:

#### 1. Runtime Provider

Responsibility:

- detect game process and active game version
- parse `Client.txt`
- detect area transitions, map entries, and instance changes
- compute runtime timers
- emit normalized runtime state

Examples of owned data:

- detected game version
- current area/map
- current instance start time
- current session duration
- last area transition timestamp

#### 2. Account Provider

Responsibility:

- manage PoE OAuth-backed identity
- fetch and normalize character/account data
- resolve selected character
- expose character summary data to the UI

Examples of owned data:

- account name / sub
- character name
- level
- class
- ascendancy
- league
- character sync timestamps

#### 3. Capability Provider

Responsibility:

- expose what is available for the current game/version
- prevent the UI from pretending unsupported features exist
- centralize feature gating

Examples:

- `poe1_stash_tracking = true`
- `poe2_stash_tracking = false`
- `character_summary = true`
- `runtime_mapping_insights = true`
- `mini_overlay = true`

### Core Rule

The UI must never consume raw parser state, raw OAuth payloads, or stash transport state directly.

All screens and overlays consume normalized state from dedicated stores/services.

That gives three stable seams for testing:

- provider tests
- state/store integration tests
- UI rendering tests against normalized data

## Data Flow

### Login / Initialization

1. Desktop app starts
2. User authenticates via PoE OAuth
3. Backend returns local user session + PoE identity
4. Desktop initializes:
   - account provider
   - runtime provider
   - capability provider
5. Dashboard renders partial-ready sections as data becomes available

### Runtime Session Flow

1. Runtime provider observes process + log changes
2. Area/map transitions are normalized into runtime events
3. Runtime events update the session store
4. Session store updates:
   - dashboard cards
   - mapping insight charts
   - mini overlay

### Character Flow

1. Account provider loads character list
2. Character selection resolves one active character context
3. Character context is attached to session state
4. Dashboard and overlay show character-specific runtime context

### Stash Flow

1. Capability provider checks current game version
2. If `PoE1`, stash tracking UI is active
3. If `PoE2`, stash module stays structurally present but capability-blocked
4. UI shows an explicit unavailable state instead of pretending the feature is broken

## Persistence Strategy

### Persisted Data

These records should survive restarts:

- `user`
- `poe_account_identity`
- `character_profile`
- `session`
- `session_instance`
- `session_metrics`
- `stash_snapshot` and `stash_report` for PoE1

### Runtime / Cache Data

These values can be reconstructed or safely refreshed:

- active detected game version
- current runtime area
- current instance timers
- overlay open/closed state
- parser offsets
- transient price caches
- transient league caches

### Important Boundary

Overlay state is not persisted as a source of truth.  
Overlay renders from the same normalized runtime/session store used by the desktop dashboard.

## UI Design

### Desktop Dashboard

#### Character Summary Card

Shows:

- character portrait or archetype badge
- character name
- class / ascendancy
- level
- league
- selected character indicator

Expected empty states:

- `Syncing character data`
- `No character selected`

#### Runtime Session Card

Shows:

- current area or map name
- instance start time
- current instance duration
- current session duration
- recent transitions / last few map instances

Expected empty states:

- `Waiting for game`
- `Waiting for area data`

#### Mapping Insights

Shows:

- recent map durations
- map completion/time charts
- map count/hour or equivalent basic throughput metrics

V1 emphasis is clarity, not heavy analytics depth.

#### Account Status

Shows:

- PoE account connected state
- active league context
- character refresh status
- last sync times

#### Stash Tracking

For `PoE1`:

- active and operational

For `PoE2`:

- visible but capability-gated
- copy explicitly explains that support is not enabled yet

### Mini Overlay

The mini overlay should be compact and stable.

Shows:

- character name
- league
- class / ascendancy
- active area/map
- current instance duration
- current session duration
- compact runtime status label

Settings:

- enable / disable
- opacity
- scale
- click-through
- drag position

Behavior:

- hidden when game is not active
- shown when game + runtime state are present
- must degrade cleanly if only partial data exists

## State Model

The system should separate selected settings context from detected runtime context.

### Settings Context

Owned by user configuration:

- selected game context for data views
- selected character
- overlay preferences
- stash presets

### Runtime Context

Owned by game detection:

- detected running game version
- live area/map
- live instance timers

### Why This Matters

The app already had bugs from mixing user-selected state with runtime-detected state.  
This design keeps them separate by default and only joins them through explicit normalization.

## Error Handling

### Auth Errors

- login screen remains blocked until PoE OAuth succeeds
- no fallback local login
- recoverable errors should offer retry only

### Account Data Errors

- dashboard can still render runtime cards if account identity exists but character refresh fails
- character card shows a clear sync error state

### Runtime Errors

- dashboard can still show character context if runtime parsing fails
- overlay should move to a neutral waiting state rather than disappearing unpredictably

### Capability Errors

- unsupported features should never appear broken
- unsupported features must render an explicit product-state message

## Testing Strategy

V1 must support correct tests, not only visual demos.

### Unit Tests

For:

- capability resolution
- character selection logic
- runtime event normalization
- session timer calculations

### Integration Tests

For:

- PoE OAuth login -> local user creation/update
- runtime event stream -> session state updates
- selected character + detected game -> normalized dashboard state
- stash capability gating across PoE1/PoE2

### UI Tests

For:

- character summary rendering
- active league and selected context rendering
- mini overlay rendering from normalized state
- unavailable stash state for PoE2

### Smoke Tests

For:

- app launch
- OAuth-required entry flow
- settings surface
- overlay enable/disable flow

## Recommended Implementation Order

1. Replace local auth entry with PoE OAuth-only entry
2. Introduce account identity and character profile model
3. Build normalized runtime session store
4. Add dashboard character/runtime cards
5. Add capability-aware stash module behavior
6. Add mini overlay shell consuming normalized session state
7. Add tests and smoke harness updates around the new flow

## Open Technical Notes

- PoE2 stash remains disabled in V1, but schema and capability infrastructure should not assume PoE1-only forever
- overlay rendering should be a consumer, not a special execution path
- account-linked identity should become the canonical user entry point throughout the desktop app
- future overlay growth should add surfaces around the same normalized stores, not invent parallel models

## Summary

This V1 design gives Juice Journal a cleaner product direction:

- PoE account is the identity source
- runtime tracking becomes first-class
- character context and map timing become visible product features
- PoE1 stash remains strong
- PoE2 remains forward-compatible without fake support
- overlay is added in a controlled, testable way

The result is a more overlay-capable app with a better internal architecture, without prematurely expanding into a full PoE Overlay clone.
