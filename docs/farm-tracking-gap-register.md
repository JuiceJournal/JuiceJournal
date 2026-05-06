# Farm Tracking Gap Register

Status: active tracking document for PoE1, PoE2, and in-game overlay readiness.

Last updated: 2026-05-06

## Goal

Keep the remaining farm tracking work visible and testable. This file separates shipped behavior, known gaps, and the next implementation slices so PoE1, PoE2, and Overwolf overlay work do not get mixed into ad-hoc bug lists.

## Status Legend

- `Ready`: Implemented and covered by automated or manual smoke evidence.
- `Partial`: Works for a narrow path, but needs more cases or production hardening.
- `Planned`: Product behavior is agreed, but implementation has not started.
- `Blocked`: Requires external access, API availability, or reviewer credentials.

## Current Tracking Model

| Area | Status | Current Behavior | Gap |
| --- | --- | --- | --- |
| PoE1 map log detection | Partial | Client.txt map enter and exit events can drive map activity. | Needs full farm lifecycle validation across portal re-entry, inventory dump, and stash snapshot windows. |
| PoE1 profit | Partial | Profit is stash-diff based after before/after snapshots. | Needs stronger UX around snapshot requirements and multi-map farm duration aggregation. |
| PoE2 map log detection | Partial | Generated map-area logs and side-area transitions are parsed. Abyssal Depths stays inside the parent map lifecycle, known trial side areas are ignored as map starts, and named hideouts close the active map. | Needs more real Client.txt samples from Steam and standalone clients for league-specific side areas. |
| PoE2 profit | Partial | PoE2 runtime sessions and zero-profit result persistence are production-safe. The trusted profit source decision is documented in `docs/poe2-profit-source-strategy.md`: runtime-only zero-profit tracking stays active until a reliable loot source is promoted. | Need a reliable official stash/account route or explicitly promoted OCR workflow before trusted profit can be enabled. |
| Farm type selection | Partial | User can choose a game-version-aware trackable farm type at map start. PoE1 and PoE2 selectors are filtered by supported map-session farms. | Needs mechanic-specific result fields and separate lifecycle support for non-map farms. |
| Adaptive profit display | Ready | Profit display can convert chaos into Divine or Mirror using synced per-game rates, with reproducible visual QA coverage across dashboard, sessions, stash result, and overlay. | Needs periodic screenshot refresh after major UI changes or live price-model changes. |
| In-game overlay | Partial | Runtime, map-result, and detected Start Map prompt overlay plumbing exists through Overwolf overlay when available, with Electron fallback. | Needs real fullscreen-borderless smoke, drag in/out polish, interactive prompt validation, and reviewer evidence. |

## PoE1 Farm Type Coverage

| Farm Type | Status | Notes |
| --- | --- | --- |
| Abyss | Partial | Exists in selector. Needs depth/abyssal event notes and result categorization. |
| Breach | Partial | Exists in selector. Needs breachstone-specific future support only if tracked as a separate farm. |
| Expedition | Partial | Exists in selector. Needs log/session smoke and vendor reroll handling documented as out of scope. |
| Ritual | Partial | Exists in selector. Needs result examples and cost model if vessels are tracked later. |
| Harbinger | Partial | Exists in selector. Needs shard/currency-heavy display validation. |
| Essence | Partial | Exists in selector. Needs essence-specific run review fields if we add strategy templates. |
| Delirium | Partial | Exists in selector. Needs distinction between mirror, orb, and simulacrum farming. |
| Blight | Partial | Exists in PoE1 selector. Needs map versus blighted map labeling. |
| Legion | Partial | Exists in PoE1 selector. Needs emblem/splinter output grouping. |
| Harvest | Partial | Exists in PoE1 selector. Needs lifeforce highlighted output decision. |
| Betrayal | Partial | Exists in PoE1 selector. Safehouse farming remains separate from regular maps. |
| Incursion | Partial | Exists in PoE1 selector. Needs temple-run result handling. |
| Heist | Planned | Not shown in the map farm selector. Likely separate from map tracking because the lifecycle is contract/blueprint based. |
| Bossing | Planned | Not shown in the map farm selector. Needs boss/invitation taxonomy instead of map-only naming. |
| Scarab / Atlas Strategy | Planned | Not shown in the map farm selector. Needs strategy template support before this is useful as a generic farm type. |

## PoE2 Farm Type Coverage

| Farm Type | Status | Notes |
| --- | --- | --- |
| Abyss | Partial | Exists in selector. Abyssal Depths remains part of the active map instead of starting a new map. |
| Breach | Partial | Exists in selector. Needs real map smoke and result examples. |
| Expedition | Partial | Exists in selector. Needs real map smoke and overlay copy validation. |
| Ritual | Partial | Exists in selector. Needs real map smoke and result examples. |
| Delirium | Partial | Exists in selector. Needs mirror versus delirium-specific map support if PoE2 exposes separate signals. |
| Essence | Partial | Exists in shared selector, but PoE2 mechanic support should be verified against current league content. |
| Bossing | Planned | Not shown in the map farm selector. Needs separate run lifecycle from map farming if the user tracks pinnacle attempts. |
| Towers / Atlas Setup | Planned | Not shown in the map farm selector. Probably metadata or strategy context, not a farm result by itself. |
| League-specific mechanics | Planned | Needs a per-season audit when a new PoE2 league launches. |

## Overlay Readiness

| Capability | Status | Required Next Step |
| --- | --- | --- |
| Runtime session card | Partial | Confirm it appears in-game through Overwolf overlay in fullscreen-borderless mode. |
| Completed map result card | Partial | Confirm result card receives farm type, map name, elapsed time, and adaptive profit formatting. |
| Drag in/out motion | Partial | Current map-result animation is right-side slide in/out. Needs gameplay UX tuning. |
| Pin/dismiss controls | Partial | Controls exist; pointer passthrough behavior needs real in-game validation. |
| PoE2 auto-start prompt | Partial | Map entry now sends a Start Map prompt to the in-game overlay before opening the authoritative desktop Start Map modal. | Needs true in-game farm-type selection and confirm/cancel once Overwolf input behavior is validated. |
| Review evidence | Planned | Capture screenshots/video from a packaged or reviewer-equivalent build. |

## Data Sources

| Source | Usage | Risk |
| --- | --- | --- |
| Client.txt | Map entry/exit lifecycle for PoE1 and PoE2. | Log formats and side-area naming can change by season. |
| Overwolf GEP | Character/runtime context when available. | Requires package/API availability and review-path stability. |
| Path of Exile account API | Character/account context and stash snapshots. | Requires valid OAuth session and GGG-side access. |
| Backend price sync / poe.ninja | Current chaos, Divine, and Mirror rates per game/league. | Values are only reliable after sync; UI falls back to chaos when rates are unavailable. |
| OCR fallback | Experimental loot scan path. | Not production-ready for PoE2 profit attribution. |

## Next Implementation Slices

1. Upgrade the Start Map prompt from an in-game notice to a true in-game farm-type selector and confirm/cancel flow after Overwolf input behavior is validated.

## Completed Implementation Slices

| Slice | Status | Evidence |
| --- | --- | --- |
| Game-version-aware farm taxonomy | Ready | `farmTypeModel` filters trackable farms by PoE1/PoE2, dashboard and Start Map selectors use active game context, and unsupported selections are cleared on game-version sync. |
| PoE2 side-area parser fixtures | Ready | `logParser` keeps Abyssal Depths inside the active map and ignores Trial of the Sekhemas / Trial of Chaos entries when no map is active. |
| Start-map overlay prompt shell | Ready | `overlayStateModel`, renderer map-entry handling, and main overlay state now surface detected map/farm context in the in-game overlay while the desktop modal remains the authoritative input path. |
| PoE2 result smoke scenario | Ready | Automated smoke covers PoE2 map entry, Abyssal Depths side-area stability, named-hideout exit, zero-profit local completion metadata, persistence, and Last Map Result projection. |
| Adaptive profit visual QA | Ready | `desktop/e2e/adaptive-profit-visual-qa.spec.js` signs in with a deterministic stub backend, validates Divine/Mirror formatting, and captures screenshots for dashboard, sessions, stash result, and overlay via `npm run test:visual-qa`. |
| PoE2 profit source strategy | Ready | `docs/poe2-profit-source-strategy.md` records runtime-only zero-profit tracking as the safe production path until an official stash/account route or promoted OCR workflow is validated. |
