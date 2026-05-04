# Overwolf First Build Submission Pack

Status: ready-to-fill worksheet for the first Juice Journal MVP review submission.

Owner: Furkan Tasci

Account email: esquetta@gmail.com

Last updated: 2026-05-04

## Current Overwolf Position

Overwolf confirmed by email on 2026-05-03 that Developer Console access is created only after the app MVP is submitted and approved. Their stated reason is that the console is used for OPK/EXE distribution.

Practical conclusion: we should not wait for Developer Console/API key access before the first MVP submission. The next path is to prepare a reviewable build package, screenshots, and written QA instructions, then submit the first build form.

Earlier Overwolf notes from the same thread:

- 2026-04-26: submit once we have a working MVP, with clear instructions, details, and screenshots.
- 2026-04-28: there is no separate GEP enablement process; PoE 1 and PoE 2 events should be set up against the documented game event support pages.
- 2026-05-03: console access comes after MVP approval.

## Required Form Answers

| Field | Answer |
| --- | --- |
| App's Name | Juice Journal |
| Full Name | Furkan Tasci |
| Short summary of app purpose | Juice Journal is a Path of Exile 1 and Path of Exile 2 desktop farming journal for tracking map sessions, stash snapshots, currency pricing, profit analytics, character context, and in-game session summaries. It does not automate gameplay, inject inputs, read memory directly, or modify the game client. |
| Private/public use | Public |
| Framework | OW-Electron |
| Supported games | Path of Exile, Path of Exile 2 |
| Riot games | No |
| Discord username | TODO: required before submit |
| Discord channel invite | TODO: optional, but useful if we want a dedicated review/support channel |
| Overwolf account email | esquetta@gmail.com |
| Contains ads | No for the current MVP |
| QA completed | Check only after the validation checklist below passes and screenshots are attached |

## Short Summary

Use this in the form's summary field:

```text
Juice Journal is a Path of Exile 1/2 desktop farming journal for tracking map sessions, stash snapshots, currency pricing, profit analytics, character context, and in-game session summaries. It does not automate gameplay, inject inputs, read memory directly, or modify the game client.
```

## Review Instructions

Use this in the form's written instructions field:

```text
Juice Journal is an OW-Electron desktop farming journal for Path of Exile 1 and Path of Exile 2.

Review flow:
1. Launch the supplied Windows build.
2. Sign in with Path of Exile using reviewer credentials/API access when available. If official GGG OAuth access is still pending, use the clearly labeled reviewer/demo state only for app navigation and screenshot review.
3. Open Dashboard and verify the character summary, selected game version, farm type selector, active map session card, today's summary, OCR fallback area, and last map result card.
4. Start a new map session from Dashboard, select/confirm a map name, then end the map and verify that the completed result appears in Last Map Result and Sessions history.
5. Open Sessions and verify recorded farming sessions and session details.
6. Open Currency and verify league/game version selection, price list display, search, and sync state.
7. Open Settings and verify game version, league, hotkeys, overlay settings, API URL, Path of Exile account state, and About/update status.
8. Optional runtime check: launch Path of Exile or Path of Exile 2 and verify that the app detects the active game through Overwolf runtime/GEP diagnostics. The app uses supported Overwolf runtime signals only.

Compliance notes:
- No gameplay automation.
- No input injection.
- No memory reading.
- No game-client modification.
- No ads in the MVP build.
- Path of Exile account/stash features depend on official GGG OAuth/API access.
```

## Screenshot Set

Attach screenshots that match the instructions. Capture the app fully opened without DevTools visible.

- Login screen with Path of Exile sign-in.
- Dashboard with character summary, farm type selector, and no active map.
- Dashboard with an active map session.
- Dashboard after ending a map, showing Last Map Result.
- Sessions page with at least one completed session.
- Currency page with PoE 1 league prices.
- Currency page with PoE 2 selected or the current PoE 2 state.
- Settings > General / Path of Exile account state.
- Settings > Hotkeys / Overlay settings.
- Settings > About / update status.
- Optional in-game overlay screenshot if Overwolf overlay API is available during local validation.

## Pre-Submission Validation Checklist

Run these before checking the form's QA checkbox:

- `cd desktop && npm test`
- `cd desktop && npm audit --json`
- `cd backend && npm run build`
- `cd backend && npm audit --json`
- `cd web && npm audit --json`
- Launch the desktop app through OW-Electron dev runtime and confirm the startup log reports Overwolf runtime/GEP availability when available.
- Confirm DevTools does not open automatically in the build used for screenshots.
- Confirm taskbar icon behavior on the packaged/review build, not only `npm run dev`.
- Confirm the app closes cleanly with no orphaned app windows.
- Confirm hotkey settings can be changed and persisted.
- Confirm PoE 1 and PoE 2 process detection does not misclassify standalone or Steam clients.
- Confirm the map session flow creates and persists a completed session.
- Confirm offline or backend-unavailable state shows a clear error instead of a blank/broken UI.

## Build Artifact Checklist

- Candidate Windows review build produced from `desktop` on 2026-05-04.
- Artifact: `desktop/dist/Juice Journal Setup 1.0.0.exe`
- Version: `1.0.0`
- Git SHA: `666ffbed98bdd39bc9b66009b2c1752ac0c0eeac`
- SHA256: `09E2139CEBCA3B2ABA7CCBE7D6AAED37E4FDA4952C64CA39CC22C656BE232CD1`
- Build command: `cd desktop && npm run build:win`
- Packaged launch smoke: `desktop/dist/win-unpacked/Juice Journal.exe` launched on 2026-05-04 and stayed running for the 8 second smoke window.
- Installer smoke: `desktop/dist/Juice Journal Setup 1.0.0.exe` installed silently to a custom repo-local review directory on 2026-05-04 with exit code `0`; the installed `Juice Journal.exe` launched, showed the `Juice Journal` main window title, stayed running for the 10 second smoke window, and uninstalled silently with exit code `0`.
- Keep Product Name/Name and Author stable across versions; Overwolf's testing guidance calls out UID consistency.
- If submitting an OW-Electron executable/installer, include exact launch instructions and note whether remote debugging is enabled only for review diagnostics.
- If Overwolf asks for an OPK specifically, clarify whether they expect OW-Native OPK or OW-Electron installer/upload handling for this first MVP path.
- Before final submission, rerun the build from the final submission commit and update this metadata if it changes.

## Known MVP Limitations To State Clearly

- Developer Console access is not available before MVP approval, based on Overwolf's 2026-05-03 reply.
- GEP has no separate enablement process according to Overwolf's 2026-04-28 reply, but live game data availability still depends on correct supported-game event setup and the installed Overwolf runtime.
- Path of Exile stash/account data depends on official GGG OAuth/API access.
- Ads are disabled/not included in the current MVP.
- Automatic update distribution requires the final release pipeline to publish installer artifacts and update metadata.

## Links

- First build review form from Overwolf email: https://forms.monday.com/forms/6cba29808d4f0e70aaf4517ee7e4e82b?r=use1
- Alternate short form link from Overwolf email: https://wkf.ms/3KL8b1m
- Submit app guide from Overwolf email: https://dev.overwolf.com/ow-native/getting-started/submit-your-app/
- OW-Electron develop phase: https://dev.overwolf.com/ow-electron/getting-started/develop-your-idea/
- OW-Electron testing guidance: https://dev.overwolf.com/ow-electron/guides/test-your-app/how-to-test-your-app/
- OW-Electron technical overview: https://dev.overwolf.com/ow-electron/getting-started/onboarding-resources/ow-electron-technical-overview/
- OW-Electron release management: https://dev.overwolf.com/ow-electron/developers-console/releases-management/release-management/
