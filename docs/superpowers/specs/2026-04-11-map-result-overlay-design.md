# Map Result Overlay Design

Date: 2026-04-11
Status: Draft for review
Scope: Desktop dashboard, in-game mini overlay, stash-diff result persistence

## Goal

After a user finishes a map and takes the `After Map Snapshot`, the app should show a compact in-game result panel that explains what farm was run, how long it took, what was consumed, what was gained, and whether the run was profitable.

The same result must also be stored for later viewing in the desktop app, so the user does not lose the run summary if the overlay is missed.

This design also keeps the persistence model ready for a future history screen and a later community-sharing hub without shipping those community features now.

## Product Behavior

### V1 User Flow

1. User chooses a `farm type` before starting a map.
2. User takes `Before Map Snapshot`.
3. User runs the map.
4. User takes `After Map Snapshot`.
5. System computes stash diff and derives:
   - input value
   - output value
   - net profit
   - top inputs
   - top gains
   - duration
6. System shows an in-game `Map Result Overlay` on the right side of the screen.
7. Overlay stays visible for `8-10 seconds` by default.
8. User can `pin` the overlay to keep it open until manually dismissed.
9. Result is persisted and becomes visible in:
   - desktop dashboard `Last Map Result` card
   - future history list

### Overlay Content

The overlay should show:

- `Farm Type`
- `Duration`
- `Input Value`
- `Output Value`
- `Net Profit`
- `Top Inputs`
- `Top Gains`

Color rules:

- positive profit: green
- negative profit: red
- neutral / near-zero: gold or neutral accent

### Farm Type Handling

`V1` uses manual farm type selection. The app does not attempt automatic farm detection from logs or game state in this version.

This is intentional. Incorrect automatic classification would undermine trust in the profit summary.

## Data Rules

### Input / Output / Profit Definitions

`Input`
- total value of tracked items that decreased between `Before Map Snapshot` and `After Map Snapshot`

`Output`
- total value of tracked items that increased between `Before Map Snapshot` and `After Map Snapshot`

`Net Profit`
- `outputValue - inputValue`

### Result Confidence

The overlay should only appear when the stash diff is complete enough to produce a usable result.

If the diff is incomplete or stash tracking is unavailable:

- do not show a misleading profit result
- show a clear capability or incomplete-data state in the desktop app
- allow future fallback messaging, but do not fabricate numbers

## Architecture

### Core Units

#### 1. Farm Selection State

Tracks the user-selected farm type for the current map session.

Responsibilities:

- expose current farm type to the active session
- clear or reset farm type when a map session is completed or abandoned
- persist enough state to survive routine renderer refreshes during an active run

#### 2. Result Derivation Model

Consumes:

- `before snapshot`
- `after snapshot`
- active map session metadata
- active farm type
- runtime session timing

Produces a normalized `map result` object for UI and persistence.

Responsibilities:

- compute input/output/profit
- compute duration
- select top inputs and top gains
- classify profit state for UI tone

#### 3. Result Persistence Store

Stores completed map results for later use.

Responsibilities:

- save the latest completed map result
- expose latest result to dashboard
- expose a list for future history
- preserve forward-compatible fields for future community sharing

#### 4. Overlay Presentation Model

Transforms a normalized map result into a compact overlay view model.

Responsibilities:

- visibility timing
- pin state
- dismiss state
- positive/negative/neutral styling
- compact item row formatting

#### 5. Dashboard Result Card

Shows the most recent completed result inside the desktop app.

Responsibilities:

- show latest result even if overlay was missed
- show empty state when no completed result exists
- link naturally to future history browsing

## Data Model

### `map_result`

Required fields:

- `id`
- `sessionId`
- `characterId`
- `characterName`
- `accountName`
- `poeVersion`
- `league`
- `farmType`
- `durationSeconds`
- `inputValue`
- `outputValue`
- `netProfit`
- `profitState`
- `topInputs[]`
- `topOutputs[]`
- `createdAt`

Forward-compatible fields for later phases:

- `notes`
- `tags`
- `isShared`
- `shareVisibility`
- `sharedAt`

### `topInputs[]` and `topOutputs[]`

Each entry should carry:

- `itemKey`
- `label`
- `quantityDelta`
- `valueDelta`
- `currencyCode`

## UI Surfaces

### In-Game Mini Overlay

Placement:

- right side of the game screen

Behavior:

- appears automatically after `After Map Snapshot`
- auto-dismisses after `8-10 seconds`
- can be pinned
- can be manually dismissed

Constraints:

- compact enough not to block gameplay
- readable at a glance
- uses strong profit color feedback

### Desktop Dashboard

Add a `Last Map Result` card that mirrors the latest stored result.

This card should show:

- farm type
- duration
- input
- output
- profit
- short top gain summary
- timestamp

### History

`V1` history should be simple:

- list view
- default sort: `most recent`
- basic `farm type` filter

No advanced analytics or community UI is included in this version.

## Error Handling

### Incomplete Snapshot Pair

If `Before` or `After` snapshot is missing:

- do not compute a final result
- show a clear incomplete state in the desktop app if needed
- do not show the map-result overlay

### Stash Tracking Unavailable

If stash tracking is unavailable for the active context:

- do not compute fake input/output/profit
- preserve the session, but mark the result as unavailable
- keep UI language explicit about why result data is missing

### Missing Farm Type

If no farm type is selected:

- user should be prompted to select one before the run is treated as result-eligible
- no result overlay should appear without a farm type in `V1`

## Testing Strategy

### Unit Tests

- result derivation from stash diff
- profit state classification
- top input / top output extraction
- farm type session binding
- overlay visibility timing and pin behavior

### Integration Tests

- `Before Snapshot -> After Snapshot -> result persisted`
- dashboard latest-result card shows persisted result
- overlay model receives completed result and opens automatically

### Smoke / E2E Tests

- complete a mocked run and verify:
  - farm type carried through
  - result appears in overlay
  - result appears in dashboard latest-result card

## Out of Scope

The following are intentionally excluded from this spec:

- automatic farm type detection
- community hub UI
- publishing or sharing runs
- item-filter custom sounds
- advanced result analytics
- farm comparison dashboards

These remain future-compatible goals, but not part of this implementation slice.

## Recommended Implementation Slice

Implement in this order:

1. farm type state for active runs
2. normalized result derivation model
3. result persistence
4. dashboard `Last Map Result` card
5. in-game result overlay
6. simple history list with farm type filter

This order keeps the data path stable before adding new presentation surfaces.
