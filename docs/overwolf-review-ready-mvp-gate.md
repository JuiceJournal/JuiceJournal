# Overwolf Review-Ready MVP Gate

Status: draft checklist before first Overwolf MVP submission.

Owner: Furkan Tasci

Last updated: 2026-05-04

## Decision

Do not submit Juice Journal to Overwolf yet.

Current state is closer to a working desktop integration spike than a review-ready MVP. Overwolf does not require a final public release, but they do need a build their reviewers can install, launch, follow instructions for, and evaluate without broken core flows or unclear limitations.

Target: submit only after every Required gate below is complete or explicitly waived.

## Review-Ready Definition

Review-ready means:

- The app can be installed or launched by a reviewer without local repo setup.
- The main app flow is understandable without developer context.
- Core MVP features work deterministically in the review build.
- Compliance boundaries are explicit and defensible.
- Known external blockers are documented without making the build look broken.
- Screenshots match the exact build and review instructions.

## Required Gates

### 1. Review Build Artifact

Status: partially ready.

Required:

- Produce a Windows reviewer artifact from the desktop app. Current candidate: `desktop/dist/Juice Journal Setup 1.0.0.exe`.
- Verify the artifact on a clean-ish Windows user profile, not only through `npm run dev`.
- Record artifact filename, app version, git SHA, build timestamp, and SHA256. Current candidate SHA256: `09E2139CEBCA3B2ABA7CCBE7D6AAED37E4FDA4952C64CA39CC22C656BE232CD1`.
- Confirm DevTools does not open automatically.
- Confirm taskbar/window icon is correct in the review artifact.
- Confirm app launch, close, logout, and relaunch do not leave stale windows or broken state.

Evidence to attach:

- Build command output.
- Artifact metadata.
- Screenshot of the running packaged/review build.

Current evidence:

- `cd desktop && npm run build:win` completed on 2026-05-04.
- `desktop/dist/win-unpacked/Juice Journal.exe` launched and stayed running for an 8 second smoke window.
- Still missing: clean-profile install smoke, screenshot evidence, and manual taskbar icon confirmation.

### 2. Authentication And Demo Path

Status: needs decision.

Required:

- Decide whether reviewers use real Path of Exile OAuth, a seeded reviewer account, or a clearly labeled demo account state.
- If using real OAuth, verify the callback flow from a clean state.
- If using demo state, ensure it is not presented as fake/mock in user-facing production copy.
- Logout and account switching must clear stale character/session/stash state.
- If GGG OAuth/stash approval is pending, write that as a known limitation and keep the rest of the app reviewable.

Evidence to attach:

- Login screenshot.
- Dashboard after login.
- Logout/relogin smoke result.

### 3. Dashboard Core Flow

Status: partially ready.

Required:

- Character banner and portrait must render cleanly for PoE 1 and PoE 2 sample characters.
- Game version badge must match detected or selected game context.
- Farm type selector must persist the selected farm type.
- Start New Map must open the branded in-app modal, not a native prompt.
- End Map must save a completed result and update Last Map Result.
- Today's Summary must update after a completed map.
- Empty states must look intentional, not broken.

Evidence to attach:

- Dashboard idle screenshot.
- Active map screenshot.
- Completed map result screenshot.

### 4. Session Tracking

Status: needs full reviewer smoke.

Required:

- Starting a map creates exactly one active session.
- Ending a map persists a completed result.
- Re-entering a map/inventory-full flow must not corrupt the session model.
- Sessions page must show completed history after app restart.
- Profit fields must be clear when stash data is unavailable or zero.
- PoE 2 stash-unavailable state must be explicit and not look like a failed sync.

Evidence to attach:

- Session page screenshot with completed entry.
- App restart check showing the same completed result.

### 5. Currency Data

Status: mostly ready, needs final smoke.

Required:

- PoE 1 league selection displays sane prices after sync.
- PoE 2 selection either displays supported data or a clear unavailable/limited state.
- Search/filter works without layout breakage.
- Sync failure shows a useful error.
- The displayed Chaos/Divine conversion must match the selected game and league.

Evidence to attach:

- PoE 1 Currency screenshot.
- PoE 2 Currency screenshot or clear limitation screenshot.
- Sync success/failure smoke note.

### 6. Settings And About

Status: needs complete manual pass.

Required:

- General settings persist across restart.
- Path of Exile account state is clear.
- League/game version controls behave correctly for PoE 1 and PoE 2.
- Hotkey settings can be edited and do not allow unsafe duplicates.
- Overlay settings are clear about availability.
- About/update status does not imply production updates work before release pipeline artifacts exist.
- Any release-pipeline requirement is documented as pending.

Evidence to attach:

- Settings screenshots for General, Path of Exile, Hotkeys, Overlay, About.
- Restart persistence smoke result.

### 7. Overwolf Runtime, GEP, And Overlay

Status: not submission-blocking if clearly scoped, but must be truthful.

Required:

- Confirm the review build runs under OW-Electron when that is the submitted runtime.
- Confirm startup diagnostics report Overwolf runtime/GEP/overlay availability.
- PoE 1 and PoE 2 process detection must not misclassify Steam/standalone clients.
- If in-game overlay API is unavailable before approval, state that overlay UI is implemented but pending Overwolf review/runtime availability.
- If GEP character data is inconsistent, state the exact observed limitation and keep account/API fallback behavior clear.

Evidence to attach:

- Startup diagnostic log.
- PoE 1 detection screenshot/log.
- PoE 2 detection screenshot/log.
- Overlay screenshot only if it works in the review environment.

### 8. Compliance And Safety

Status: needs written confirmation.

Required:

- No gameplay automation.
- No input injection.
- No memory reading.
- No game-client modification.
- No hidden browser automation against the game.
- No ads in MVP.
- No collection of unnecessary personal data.
- Auth/session data must not be shown in screenshots or logs.
- API keys/secrets must not be bundled into the reviewer artifact.

Evidence to attach:

- Compliance statement in the submission instructions.
- Screenshot/log review confirming no secrets are visible.

### 9. UI Polish For Review

Status: needs screenshot pass.

Required:

- No DevTools in screenshots.
- No broken/missing taskbar icon in review artifact.
- No native prompt UI in the main app flow.
- No clipped text or unreadable cards at default window size.
- Character card should not show broken/oddly cropped art.
- Empty and unavailable states should be written in clear English.
- The app should be in English for the review path.

Evidence to attach:

- Full screenshot set listed in `docs/overwolf-first-build-submission.md`.

### 10. Automated Verification

Status: currently available, must be rerun on submission commit.

Required commands:

```powershell
cd desktop
npm test
npm audit --json

cd ..\backend
npm run build
npm audit --json

cd ..\web
npm audit --json
```

Optional if build/smoke environment is ready:

```powershell
cd desktop
npm run build:win
npm run test:smoke
```

Required result:

- All required commands pass on the exact commit used for submission.
- Any optional command that cannot run must have a specific blocker noted.

## Submission Blockers

These should block submission unless explicitly accepted:

- Reviewer cannot install or launch the app from an artifact.
- Core Dashboard map start/end flow is unreliable.
- Session results do not persist after app restart.
- DevTools opens automatically in the review build.
- Taskbar/window icon is visibly broken in the review artifact.
- PoE 1 and PoE 2 active game detection is misleading.
- The app presents unavailable GGG/Overwolf access as a runtime failure instead of a known limitation.
- Screenshots include console errors, secrets, or developer-only UI.
- `npm audit` reports unresolved vulnerabilities in submitted package scopes.

## Acceptable Known Limitations

These can be submitted if clearly disclosed:

- Developer Console access is pending Overwolf MVP approval.
- OPK/EXE distribution tooling is pending Overwolf console access.
- GGG OAuth/stash access is pending external approval or reviewer credentials.
- PoE 2 stash tracking is limited until a supported stash/account data path exists.
- Automatic updates require release pipeline artifacts and metadata.
- In-game overlay can be marked pending if Overwolf overlay API access is unavailable before approval.

## Suggested Work Order

1. Finish and commit the dependency vulnerability fixes separately.
2. Produce a packaged/reviewer build and validate icon/DevTools/launch behavior.
3. Run a clean Dashboard -> Start Map -> End Map -> Sessions persistence smoke.
4. Run PoE 1 and PoE 2 detection smoke with logs.
5. Decide reviewer auth/demo path.
6. Capture the screenshot set.
7. Update `docs/overwolf-first-build-submission.md` with final artifact metadata and remaining known limitations.
8. Fill the Overwolf form only after all Required gates are green or waived.

## Open Questions

- What Discord username should be used in the form?
- Will we provide a temporary Discord invite for reviewer communication?
- Will the submitted build use real OAuth only, or a reviewer/demo account state?
- Which exact artifact type will Overwolf accept for this OW-Electron first review path?
- Do we want overlay included in MVP scope, or clearly marked as post-approval/pending runtime validation?
