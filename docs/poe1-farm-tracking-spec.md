# PoE1 Farm Tracking Spec

## Goal

Track a farm as a full player loop, not as a single map portal visit. PoE1 profit is only reliable after the player deposits loot into stash and the app compares stash state before and after the farm.

## Lifecycle

1. `Start Farm`
   - Capture the selected league, farm type, account, character, and runtime context.
   - Take or require a `before` stash snapshot before profit can be calculated.
   - Do not treat map entry as the only farm start signal; it is runtime activity inside the farm.
2. `Runtime Activity`
   - Client.txt `area_entered` and `area_exited` events build active play intervals.
   - Multiple entries/exits can belong to one farm because the player can leave to empty inventory and re-enter the same map.
   - Intermediate stash deposits do not finish the farm.
3. `Finish Farm`
   - Take the `after` stash snapshot when the user is done with the farm.
   - Calculate profit from the canonical stash diff between `before` and `after`.
   - Derive map result duration from total active runtime inside the snapshot window, not just the last completed map instance.
4. `Result`
   - Persist result history and show overlay only after profit is calculated.
   - Result duration represents total active farm time across all entries/exits for that farm.

## Non-Goals

- Inventory-only profit tracking is not reliable without a source for inventory deltas.
- Stash deposit detection alone must not auto-finish a farm because deposits can be intermediate inventory dumps.

## Acceptance Criteria

- A farm with two completed map entries reports the sum of both active durations.
- Profit remains derived from stash snapshot diff, not runtime events.
- Snapshot-captured context wins over later mutable UI/account state.
- Existing single-entry farms continue to produce the same profit values.
