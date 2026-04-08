# Dynamic Active League Settings Design

Date: 2026-04-08
Topic: Dynamic active league behavior in desktop settings
Status: Approved for planning

## Goal

Make the desktop settings `Active League` field dynamic based on the currently active Path of Exile game version.

The field should no longer behave like a single static league setting shared across all game contexts.

## Approved Behavior

The `Active League` field should behave as follows:

1. If **Path of Exile 1** is currently active/running, the field targets the stored PoE 1 league.
2. If **Path of Exile 2** is currently active/running, the field targets the stored PoE 2 league.
3. If no game is currently running, the field should fall back to the **last active/detected game version**.
4. If the app has never detected either game yet, the field should show an initial empty/default state with guidance that indicates separate PoE 1 and PoE 2 league context.

## Why

Users may play both PoE 1 and PoE 2.

A single static league setting creates ambiguity and makes the settings page inaccurate when the user switches games. The league should follow actual game context automatically.

## Data Model Requirements

The desktop app should maintain:
- one stored active league value for `poe1`
- one stored active league value for `poe2`
- current detected game version when available
- last known game version when no game is currently active

The active settings field should resolve against that context instead of reading from one shared league value.

## UI Requirements

The settings page should:
- keep a single `Active League` field in the current layout
- bind that field to the currently resolved game context
- make it clear which game the field is currently editing

The field should not:
- force the user to manually toggle between PoE 1 and PoE 2 when detection already provides context
- duplicate into two permanently visible league inputs in this iteration

## Default / First-Run Behavior

If no game has ever been detected yet:
- do not silently assume one stored shared league
- show an empty or placeholder state that makes both contexts visible to the user
- use wording equivalent to `PoE 1 league / PoE 2 league`

## Success Criteria

This change is successful if:
- the `Active League` field changes with the active game version
- users who switch between PoE 1 and PoE 2 keep distinct league values
- when no game is open, the last active game determines which league is shown
- first-run behavior is understandable and does not misrepresent the target game context
