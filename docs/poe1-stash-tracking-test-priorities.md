# PoE1 Stash Tracking Test Priorities

Status: active manual test plan for the PoE1-first validation pass.

Last updated: 2026-05-06

## Goal

Validate the PoE1 farm tracking path end to end now that trusted profit is based on stash snapshots. PoE2 runtime tracking remains useful for overlay and lifecycle work, but profit validation should focus on PoE1 until PoE2 has a trusted loot source.

## Test Rules

- Use a real PoE1 account and the active league selected in the desktop app.
- Run tests after price sync has completed for the selected league.
- Take a before stash snapshot before farming and an after stash snapshot only after loot is deposited.
- Do not treat leaving the map as farm completion for PoE1 unless stash profit has already been calculated.
- Record each test with date, account, league, farm type, map name, result, and screenshots when a UI issue is found.

## P0: Must Pass Before Review Evidence

| Area | Scenario | Expected Result | Evidence |
| --- | --- | --- | --- |
| Profit calculation | Start a PoE1 map, pick a farm type, loot items, leave the map, deposit loot into stash, then calculate profit. | Profit uses the stash before/after diff, the active session ends after profit is persisted, Last Map Result shows the run, and Sessions/history contain the completed run. | Dashboard screenshot, Sessions screenshot, backend session row with completed status and non-zero value when loot was deposited. |
| Zero-profit guard | Start a PoE1 map and leave without calculating stash profit. | The app does not persist a misleading zero-profit completed result as the final farm result. | Last Map Result should remain empty or show the last real stash result, not the lifecycle-only zero result. |
| Map entry modal | Enter a PoE1 map from hideout. | Start Map modal opens automatically with detected map name, current PoE1 league, and a PoE1-supported farm type selector. | Screenshot of modal and selected farm type. |
| Start session persistence | Confirm the Start Map modal. | Active Map Session shows the selected farm type, map name, league, elapsed time, and an active state; backend session start succeeds. | Dashboard screenshot and backend sessions row. |
| Daily summary | Complete one profitable PoE1 stash-tracked run. | Today's Summary updates Maps, Profit, and Avg/Map from completed persisted results. | Dashboard screenshot before and after completion. |

## P1: Stability And Real Gameplay Cases

| Area | Scenario | Expected Result | Evidence |
| --- | --- | --- | --- |
| Mirage side instance | Enter a Mirage side area during a PoE1 map and return to the parent map. | The app keeps the same active map session and does not end or duplicate the run. | Runtime log lines and dashboard active session screenshot. |
| Portal re-entry | Leave the map to empty inventory, do not stash loot, then re-enter the same map. | The app keeps the active session open and elapsed time continues from the original run. | Dashboard screenshot before and after re-entry. |
| Inventory dump before finish | Leave the map, stash loot, then calculate profit. | Session completes only after profit calculation, not at the first hideout transition. | Last Map Result and Sessions screenshot. |
| Duplicate start protection | Enter the same map while an active session already exists. | No duplicate session is created; the user should only see one active run. | Backend sessions query and dashboard active state. |
| Adaptive profit display | Complete a high-value run whose profit crosses Divine or Mirror thresholds. | Profit displays in the largest useful currency using the current synced league prices. | Dashboard, Sessions, and overlay screenshots if overlay is available. |
| League correctness | Use a non-Standard PoE1 league such as Mirage. | Modal, active session, result history, price lookups, and backend session all use the selected/current league. | Modal screenshot and backend session row. |

## P2: Nice To Have Before Submission

| Area | Scenario | Expected Result | Evidence |
| --- | --- | --- | --- |
| In-game overlay card | Start and complete a PoE1 run while the game is fullscreen-borderless. | Overlay card appears in-game with map name, farm type, elapsed time, and final result when available. | Screenshot or short video. |
| OCR fallback | Run the F9 scan on PoE1 after loot is visible. | OCR failure is non-blocking, and successful scans do not overwrite stash-tracked truth unless explicitly promoted. | OCR result screenshot and app log excerpt. |
| Standalone client detection | Repeat map entry with the standalone Path of Exile client if available. | Game detection and Client.txt parsing behave the same as the Steam path. | App log and dashboard screenshot. |
| Error recovery | Temporarily break backend connectivity during an active session, then restore it. | Queued session/profit actions recover without losing the active farm context. | App log and backend session row after recovery. |

## Known Risk Areas

- PoE1 profit is only trustworthy after stash deposit and after the user triggers the stash diff calculation.
- Side instances can share the same Client.txt transition shape as true map exits, so Mirage and other league mechanics need real log samples.
- Daily summary can only be correct if map result persistence and session completion use the same user, PoE version, league, and timestamp boundaries.
- Overwolf in-game overlay behavior must be validated in fullscreen-borderless mode; desktop window behavior is not enough evidence.
- Existing local history can contain old zero-profit lifecycle records from before the guard. The UI should ignore them, but manual verification should use at least one fresh run.

## Manual Test Log Template

```text
Date:
Tester:
PoE client: Steam / Standalone
League:
Character:
Farm type:
Map:
Before snapshot taken: yes / no
Loot deposited before profit calculation: yes / no
Profit result:
Daily maps/profit/avg updated: yes / no
Last Map Result updated: yes / no
Sessions entry created: yes / no
Overlay visible: yes / no / not tested
Notes:
```
