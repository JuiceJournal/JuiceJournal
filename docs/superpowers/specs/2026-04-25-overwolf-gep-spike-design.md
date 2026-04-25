# Overwolf GEP Spike Design

## Goal

Prepare Juice Journal to use Overwolf Game Events Provider data when it is available, without making the main Electron app dependent on Overwolf approval or runtime packaging.

The intended result is:

- the existing desktop app continues to work through Client.txt parsing, process detection, GGG OAuth, and poe.ninja pricing
- Overwolf GEP data can be normalized through the existing native game info boundary
- PoE1 and PoE2 native event payloads resolve to one internal runtime contract
- a separate spike harness can be used to verify real Overwolf payloads when the Overwolf runtime is available

## Current State

The repo already has the right integration boundary:

- `desktop/src/modules/nativeGameInfoProducer.js` starts and stops a native GEP producer when `app.overwolf.packages.gep` exists
- `desktop/src/modules/nativeGameInfoProducerModel.js` normalizes a limited PoE2 `me` payload into an active character hint
- `desktop/main.js` wires the producer into runtime game detection and emits `active-character-hint` to the renderer
- `desktop/src/app.js` uses high-confidence native hints to select the active account character

The current gaps are:

- PoE1 is not enabled in the native producer model
- the normalized payload is character-only and does not include zone/page/death/boss event context
- there is no local harness for running or documenting an Overwolf/ow-electron payload capture
- production behavior depends on optional Overwolf globals but there is no explicit spike artifact to validate them

## Recommended Approach

Keep the production app Overwolf-optional and expand the adapter contract first.

This is the best fit because:

- Overwolf approval and production movement are outside our control
- the current desktop app is already useful without Overwolf
- the existing producer abstraction lets us support GEP without tying the full app to `@overwolf/ow-electron`
- tests can lock the internal contract before real runtime payloads are captured

## Alternatives Considered

### 1. Adapter contract plus separate spike harness

Recommended.

Pros:

- preserves current Electron release path
- lets us validate PoE1 and PoE2 payload handling with tests
- creates a clear path for Overwolf runtime verification later
- avoids making normal desktop installs depend on Overwolf packaging

Cons:

- real GEP validation still needs an Overwolf runtime and supported environment
- the spike harness is not a production app by itself

### 2. Move the production app directly to `@overwolf/ow-electron`

Not recommended right now.

Pros:

- shortest path if Overwolf production access is already guaranteed

Cons:

- changes the build and release model before the platform path is confirmed
- creates user distribution risk if Overwolf review remains blocked
- makes the current standalone desktop app more complex

### 3. Stay on Client.txt and only document Overwolf

Too passive.

Pros:

- lowest implementation risk

Cons:

- does not prepare the codebase for a quick integration if Overwolf responds
- leaves existing native producer support incomplete

## Scope

### In Scope

- expand native GEP feature selection for PoE1 and PoE2
- normalize documented Overwolf PoE/PoE2 payloads into a stable internal runtime payload
- keep high-confidence character hints compatible with existing renderer behavior
- add tests for PoE1 and PoE2 normalization, producer startup, and fail-closed behavior
- add a dedicated `desktop/overwolf-spike/` harness with scripts/docs for manual runtime capture

### Out of Scope

- publishing to the Overwolf Appstore
- replacing the existing Electron build pipeline
- requiring Overwolf runtime for normal desktop app use
- scraping screen state or reading protected game memory
- logging raw chat content from Overwolf chat events

## Internal Runtime Contract

The normalized payload should be serializable and renderer-safe.

Suggested shape:

```js
{
  source: 'native-info',
  poeVersion: 'poe1' | 'poe2',
  characterName: string | null,
  className: string | null,
  level: number | null,
  experience: number | null,
  currentZone: string | null,
  openedPage: string | null,
  inTown: boolean | null,
  scene: string | null,
  eventName: string | null,
  eventData: string | null,
  confidence: 'high' | 'medium'
}
```

Compatibility rule:

- existing active-character selection still requires `confidence: 'high'` and `characterName`
- additional runtime fields are optional and must not break current renderer behavior
- chat events may only contribute derived runtime signals; raw chat lines must not be persisted

## Overwolf Feature Mapping

Use the documented PoE and PoE2 GEP feature groups:

- `gep_internal`
- `me`
- `match_info`
- `game_info`
- `death`
- `kill`

PoE1 and PoE2 should share the same internal contract even when field names differ:

- PoE1: `character_experience`
- PoE2: `character_exp`
- common: `character_name`, `character_level`, `character_class`, `current_zone`, `opened_page`
- PoE2-only documented fields such as `in_town`, `scene`, and `party_players` should be optional

## Spike Harness

Add a small manual harness under `desktop/overwolf-spike/`.

The harness should include:

- minimal `package.json` scripts for `ow-electron`
- a minimal manifest or setup notes needed for PoE/PoE2 GEP testing
- a small capture script/window that subscribes to required features
- instructions for running against DEV package URL if Overwolf requires it
- a sample sanitized payload fixture location

The harness must be clearly marked as manual verification tooling, not part of the normal desktop release.

## Data Flow

### Normal Desktop Runtime

1. `GameDetector` detects PoE1 or PoE2.
2. `desktop/main.js` calls `syncNativeGameInfoProducer`.
3. If `app.overwolf.packages.gep` is unavailable, the producer stops and emits no hint.
4. If GEP is available, the producer subscribes to the feature set for the detected game.
5. Normalized payloads are emitted as `active-character-hint`.
6. Renderer selects the matching account character only when the hint is high-confidence.

### Spike Runtime

1. The spike app runs inside Overwolf/ow-electron.
2. It subscribes to PoE1/PoE2 GEP features.
3. It prints or displays sanitized payloads.
4. Captured examples are manually converted into test fixtures for the production adapter.

## Error Handling

- no Overwolf runtime: fail closed and keep existing Client.txt flow active
- unsupported game id or empty feature set: do not start the producer
- malformed GEP payload: return `null` or a medium-confidence payload
- listener registration failure: roll back subscriptions
- stop failure: log a warning and avoid stale active hints

## Testing

Unit tests should cover:

- PoE1 feature set selection
- PoE2 feature set selection
- PoE1 `character_experience` normalization
- PoE2 `character_exp` normalization
- optional zone/page/town/scene fields
- malformed payload rejection
- event payload normalization for `death` and `boss_kill`

Integration-style tests should cover:

- producer starts with the correct feature set for PoE1 and PoE2
- producer refreshes on `new-info-update`
- producer can emit character hints without breaking existing renderer selection
- missing GEP package remains fail-closed

Manual verification should cover:

- PoE1 standalone or Steam client
- PoE2 standalone or Steam client
- feature registration success
- sample payload capture for character, zone, page, death, and boss kill where available

## Acceptance Criteria

- normal desktop tests pass without Overwolf installed
- PoE1 and PoE2 GEP payloads normalize through one internal model
- existing active character selection behavior remains compatible
- raw chat content is not persisted by the adapter or spike
- spike harness documents exactly how to capture real payloads once Overwolf runtime access is available

## Risks

- Overwolf game ids can differ by instance; production startup must use the correct base game id for feature registration
- some GEP fields may only exist in DEV until moved to PROD by Overwolf DevRel
- docs examples can lag real payloads, so captured fixtures should be treated as the final source for adapter edge cases
- PoE Epic Games client events are documented as unreliable for PoE1, so the first manual validation should focus on Steam and standalone clients

