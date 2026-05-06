# PoE2 Profit Source Strategy

Status: active decision record.

Last updated: 2026-05-06

## Decision

Decision: runtime-only zero-profit tracking remains the production-safe PoE2 behavior until a reliable loot source exists.

Juice Journal should not calculate trusted PoE2 profit from incomplete or experimental signals. For PoE2 map sessions, the app can track map name, farm type, elapsed time, game version, league, and result history. Profit should remain `0` unless a future source is explicitly promoted to trusted status with tests and reviewer-ready evidence.

## Source Priority

| Priority | Source | Current Use | Promotion Requirement |
| --- | --- | --- | --- |
| 1 | Official stash/account route | Preferred future source for trusted PoE2 profit. | Must provide reliable item deltas for the active account/league and pass real-account smoke tests. |
| 2 | OCR fallback | Manual experimental scan path only. | Needs deterministic item recognition, false-positive controls, and clear user confirmation before it can affect profit. |
| 3 | Client.txt / runtime logs | Map lifecycle only. | Not a loot source; must not be used to infer profit. |
| 4 | Overwolf GEP | Character/runtime context only. | Not enough for profit unless a supported loot/inventory signal is available and validated. |

## Product Behavior

- PoE2 map tracking is enabled for runtime/session history.
- PoE2 stash tracking remains disabled through the capability model.
- PoE2 completed map results can persist with zero profit.
- OCR fallback remains experimental and must not silently overwrite trusted profit.
- UI copy should avoid implying PoE2 profit is production-ready.

## Implementation Guardrails

- Do not calculate trusted PoE2 profit until a source has explicit tests, screenshots, and live-smoke evidence.
- Keep PoE1 stash-diff profit separate from PoE2 runtime-only tracking.
- Preserve adaptive profit formatting for PoE2 zero or future trusted values, but do not treat formatting support as profit-source readiness.
- If a future source is added, document its lifecycle, failure modes, and account/league binding before enabling it by default.
