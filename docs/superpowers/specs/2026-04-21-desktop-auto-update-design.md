# Desktop Auto Update Design

## Goal

Add a production-safe desktop auto-update flow that checks GitHub Releases for newer packaged builds, downloads updates in the background, and lets the user install them from the desktop app UI.

The intended result is:

- packaged desktop builds can detect newer releases from GitHub
- updates download without blocking normal app usage
- the user can see update status in Settings > About
- once an update is downloaded, the user can restart the app to install it
- development mode stays unaffected

## Current Problem

The desktop application already knows its local version, but it does not currently implement any update channel or release polling:

- `desktop/package.json` declares the app version and build metadata
- `desktop/main.js` uses `app.getVersion()` for diagnostics
- the About tab shows a static version string in the renderer
- there is no `electron-updater`, `autoUpdater`, GitHub provider, `checkForUpdates`, or `quitAndInstall` flow

This means every desktop upgrade must be handled manually outside the app.

## Recommended Approach

Use `electron-updater` with the `electron-builder` GitHub provider.

This is the best fit for the current codebase because:

- the project already packages the desktop app with `electron-builder`
- the Windows target is already `nsis`, which is compatible with `electron-updater`
- GitHub Releases is already the intended release surface
- `electron-updater` gives download progress, downloaded state, install action, and error events without building a custom updater stack

## Alternatives Considered

### 1. `electron-updater` + GitHub Releases

Recommended.

Pros:

- aligns with the current build toolchain
- supports release metadata such as `latest.yml`
- manages version comparison and artifact resolution for us
- provides a small, well-known integration surface in the main process

Cons:

- release publishing must be configured correctly in CI or local release flow
- update behavior depends on packaged builds, not development runs

### 2. Manual GitHub Releases API polling

Not recommended.

Pros:

- one less dependency
- full control over UX

Cons:

- we would need to reimplement version comparison, asset selection, download state, and installation handoff
- higher risk of partial or brittle behavior

### 3. Notification-only release checker

Possible but weaker than the requested outcome.

Pros:

- simpler implementation

Cons:

- does not satisfy the “download and install if available” requirement
- leaves too much manual work to the user

## Functional Scope

### In Scope

- packaged desktop app checks for updates on startup
- renderer can manually trigger “Check for updates”
- renderer can show update status and progress
- downloaded update can be installed via “Restart to install”
- update flow is disabled in development

### Out of Scope

- delta/channel management beyond the default stable GitHub release flow
- Linux or macOS update packaging changes
- custom update server
- silent forced installation without user action

## Update Flow

### Startup

When the app starts in a packaged environment:

1. main process initializes the updater
2. updater publishes initial state to the renderer
3. updater checks GitHub for a newer version
4. if a newer version exists, it downloads automatically
5. progress and final status are mirrored to the renderer

### Manual Action

From Settings > About the user can:

- check for updates manually
- see whether the app is up to date
- see download progress if an update is downloading
- restart to install once the update is ready

### Install

When the update is downloaded:

- the app shows a “Restart to install” action
- user confirms installation through the UI
- main process calls the install action provided by `electron-updater`

## Architecture

### Main Process

Add a dedicated update manager in the desktop main process.

Recommended shape:

- new module: `desktop/src/modules/updateModel.js` or `desktop/src/modules/desktopUpdater.js`

Responsibilities:

- configure `autoUpdater`
- normalize updater events into a serializable state object
- expose imperative actions:
  - initialize
  - checkForUpdates
  - quitAndInstall
  - getSnapshot

The manager should be the only place that talks to `electron-updater`.

### IPC Surface

Expose the update system through preload and main-process handlers.

Required IPC methods:

- `get-app-update-state`
- `check-for-app-update`
- `install-app-update`

Required renderer events:

- `app-update-state-changed`

### Renderer

The renderer should treat update state like any other desktop state surface.

Responsibilities:

- fetch initial update snapshot on boot
- subscribe to update state changes
- render update state in the About tab
- trigger manual actions through `window.electronAPI`

## State Model

The update state should be renderer-safe and UI-oriented.

Suggested fields:

```js
{
  enabled: true,
  supported: true,
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  progressPercent: 0,
  currentVersion: '1.0.0',
  nextVersion: null,
  releaseName: null,
  releaseNotes: null,
  error: null,
  lastCheckedAt: null
}
```

### State Semantics

- `enabled`: updater is allowed in this environment
- `supported`: updater can run for the packaged target
- `checking`: network check in progress
- `available`: newer version found
- `downloading`: update payload is being downloaded
- `downloaded`: ready to install
- `error`: user-facing error string or null

## Build / Release Configuration

The desktop package must declare a GitHub publish target so update metadata gets produced and published with releases.

Required `electron-builder` configuration additions:

- GitHub provider
- repository owner: `JuiceJournal`
- repository name: `JuiceJournal`

The release process must produce and publish:

- installer artifact(s)
- `latest.yml`

Without published update metadata, the runtime updater cannot work.

## Environment Guardrails

### Development

In development:

- updater must not check remote releases
- updater should return a disabled or unsupported state
- no noisy update errors should appear in dev logs or UI

### Packaged Runtime

In packaged builds:

- updater initializes only once
- duplicate concurrent checks are ignored or coalesced
- updater errors are logged and surfaced cleanly in the UI

## Error Handling

Potential failures:

- no network connectivity
- GitHub rate limiting
- malformed or missing release metadata
- unsupported build target
- install request before a download completes

Handling strategy:

- normalize errors into a safe string for renderer state
- do not crash app startup if update initialization fails
- allow retry via manual “Check for updates”
- keep the rest of the app functional when updater fails

## UI Changes

Settings > About should display:

- current version
- update status line
- optional progress text
- “Check for updates” button
- “Restart to install” button when appropriate

Suggested user-facing states:

- Up to date
- Checking for updates...
- Update available: `x.y.z`
- Downloading update... `NN%`
- Update ready to install
- Update check failed

## Testing Strategy

### Main Process Tests

Add tests for:

- packaged vs development guard behavior
- update state transitions from updater events
- IPC handlers returning normalized state
- install action only when `downloaded === true`

### Preload Tests

Add tests for:

- exposed update methods
- subscription to update-state events

### Renderer Tests

Add tests for:

- About tab shows current version from update state instead of static text
- “Check for updates” button triggers the correct IPC call
- “Restart to install” button appears only when downloaded
- progress and error states render correctly

## Risks

### Risk 1: Release Pipeline Not Ready

If GitHub Releases does not publish update metadata, runtime code will be correct but updates will still fail.

Mitigation:

- include publish config in the desktop package
- document required release artifacts

### Risk 2: Dev Mode Noise

Updater code often fails loudly in development if not guarded.

Mitigation:

- gate initialization behind `app.isPackaged`

### Risk 3: UI / Main Process Drift

If the renderer hardcodes about-state assumptions, it can drift from the real updater state.

Mitigation:

- use a single normalized state payload from the main process

## Recommendation

Implement the update flow with `electron-updater` and GitHub Releases, using:

- one dedicated updater module in the main process
- one renderer-safe update snapshot model
- one update section in Settings > About

This keeps the implementation aligned with the current Electron builder setup and avoids creating a custom version polling system.

## Source Notes

Primary docs used:

- Electron updates tutorial: `https://www.electronjs.org/docs/latest/tutorial/updates`
- Electron publishing and updating tutorial: `https://www.electronjs.org/docs/latest/tutorial/tutorial-publishing-updating`
- electron-builder auto update docs: `https://www.electron.build/auto-update.html`
- electron-builder publish docs: `https://www.electron.build/publish.html`
