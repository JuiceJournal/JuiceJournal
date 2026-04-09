# Dynamic Active League Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop settings `Active League` field resolve dynamically by active game version, falling back to the last detected game version and supporting separate PoE 1 / PoE 2 league values.

**Architecture:** Keep the current single visible settings field, but split the stored league state into `poe1` and `poe2` values. Use game detection plus a persisted last-known game version to resolve which league the UI should display/edit, and update tracker/session defaults to read from the resolved context rather than from one shared `defaultLeague`.

**Tech Stack:** Electron main process, renderer JavaScript, DOM-based desktop UI

---

### File Structure

**Files:**
- Modify: `desktop/main.js`
- Modify: `desktop/src/app.js`
- Modify: `desktop/src/index.html`
- Modify: `desktop/src/modules/translations.js`

**Responsibilities:**
- `desktop/main.js`: persist per-game league settings and last active game context; expose normalized settings to renderer
- `desktop/src/app.js`: resolve dynamic active-league field behavior based on active or last-active game version
- `desktop/src/index.html`: support helper copy for dynamic active-league context if needed
- `desktop/src/modules/translations.js`: add any new labels/placeholders/hints for dynamic league targeting

---

### Task 1: Split stored league state by game version in the main process

**Files:**
- Modify: `desktop/main.js`
- Test: `desktop/main.js`

- [ ] **Step 1: Confirm the current main-process defaults still use one shared league**

Run: `Select-String -Path desktop/main.js -Pattern 'defaultLeague|poeVersion|getTrackerContextDefaults|store.get\\('`

Expected:
- finds shared `defaultLeague`
- finds logic in `getTrackerContextDefaults` and session start paths that reads only one stored league

- [ ] **Step 2: Replace the shared league default with per-version league storage**

Update the default settings object in `desktop/main.js` from:

```js
    poeVersion: 'poe1',
    defaultLeague: 'Standard',
```

to:

```js
    poeVersion: 'poe1',
    lastDetectedPoeVersion: 'poe1',
    defaultLeaguePoe1: 'Standard',
    defaultLeaguePoe2: 'Standard',
```

- [ ] **Step 3: Add a helper that resolves the effective league context**

Add a helper in `desktop/main.js` near `getTrackerContextDefaults`:

```js
function resolveLeagueContext(overrides = {}) {
  const activeVersion =
    overrides.poeVersion ||
    gameDetector?.getDetectedGame() ||
    store.get('lastDetectedPoeVersion') ||
    store.get('poeVersion') ||
    'poe1';

  const leagueKey = activeVersion === 'poe2' ? 'defaultLeaguePoe2' : 'defaultLeaguePoe1';
  const fallbackLeague = (store.get(leagueKey) || 'Standard').trim() || 'Standard';
  const league = (overrides.league || fallbackLeague).trim() || fallbackLeague;

  return {
    poeVersion: activeVersion,
    league,
    leagueKey
  };
}
```

Then update `getTrackerContextDefaults` to use it:

```js
function getTrackerContextDefaults(overrides = {}) {
  const resolved = resolveLeagueContext(overrides);

  return {
    poeVersion: resolved.poeVersion,
    league: resolved.league
  };
}
```

- [ ] **Step 4: Persist the last detected game version when detection changes**

Inside `applyGameVersion(version)`, add:

```js
  store.set('lastDetectedPoeVersion', version);
```

Keep the existing `poeVersion` update as-is so the current settings version still tracks the current active game.

- [ ] **Step 5: Update session/tracker default reads to use the resolved context**

Replace the direct `store.get('defaultLeague')` session-start and auto-session reads with `resolveLeagueContext(...)` or `getTrackerContextDefaults(...)` so the following paths no longer read one shared league:
- `getTrackerContextDefaults`
- `startSession`
- auto-start session in log parser flow
- stash tabs / stash snapshot fallbacks where a league is pulled from settings

- [ ] **Step 6: Commit the main-process storage/context changes**

```bash
git add desktop/main.js
git commit -m "feat(desktop): store leagues per game version"
```

---

### Task 2: Make the renderer `Active League` field dynamic

**Files:**
- Modify: `desktop/src/app.js`
- Modify: `desktop/src/index.html`
- Modify: `desktop/src/modules/translations.js`
- Test: `desktop/src/app.js`

- [ ] **Step 1: Add renderer helpers for dynamic league resolution**

Add these helpers in `desktop/src/app.js` near settings helpers:

```js
function getResolvedLeagueVersion() {
  return state.detectedGameVersion || state.settings.lastDetectedPoeVersion || state.settings.poeVersion || 'poe1';
}

function getLeagueSettingKey(version = getResolvedLeagueVersion()) {
  return version === 'poe2' ? 'defaultLeaguePoe2' : 'defaultLeaguePoe1';
}

function getResolvedActiveLeague() {
  const version = getResolvedLeagueVersion();
  const key = getLeagueSettingKey(version);
  const value = (state.settings[key] || '').trim();

  return {
    version,
    key,
    value
  };
}
```

- [ ] **Step 2: Update initial state handling to track detected/last-active version**

Extend the renderer state shape near the top of `desktop/src/app.js`:

```js
  auditTrail: [],
  detectedGameVersion: null
```

When the IPC game-status or game-version events arrive, keep `state.detectedGameVersion` updated and use it in league resolution.

- [ ] **Step 3: Change settings form population to use the resolved league**

Replace:

```js
if (elements.defaultLeague) elements.defaultLeague.value = state.settings.defaultLeague || '';
```

with:

```js
if (elements.defaultLeague) {
  const resolvedLeague = getResolvedActiveLeague();
  elements.defaultLeague.value = resolvedLeague.value;
  elements.defaultLeague.placeholder = resolvedLeague.version === 'poe2'
    ? (window.t ? window.t('settings.leaguePlaceholderPoe2') : 'PoE 2 league')
    : (window.t ? window.t('settings.leaguePlaceholderPoe1') : 'PoE 1 league');
}
```

- [ ] **Step 4: Save the visible league field back into the correct per-version key**

In the settings save flow, replace:

```js
defaultLeague: elements.defaultLeague ? (elements.defaultLeague.value.trim() || 'Standard') : 'Standard',
```

with:

```js
const resolvedLeague = getResolvedActiveLeague();
const nextLeagueValue = elements.defaultLeague ? (elements.defaultLeague.value.trim() || 'Standard') : 'Standard';

const settings = {
  ...
  [resolvedLeague.key]: nextLeagueValue,
  ...
};
```

Do not overwrite the other game’s stored league value when saving this field.

- [ ] **Step 5: Update tracker/session context reads in the renderer**

Replace shared `defaultLeague` reads in these renderer flows with the resolved per-version league:
- `getSelectedTrackerContext`
- dashboard summary / refresh context where league is implied
- currency preferred league fallback where settings currently read `defaultLeague`

Use `getResolvedActiveLeague().value || 'Standard'`.

- [ ] **Step 6: Add first-run placeholder copy and optional helper text**

In `desktop/src/index.html`, keep one visible `Active League` input but add a small helper element below it:

```html
<p id="active-league-context" class="settings-desc" data-i18n="settings.leagueContextHint">
  PoE 1 league / PoE 2 league
</p>
```

Then in `desktop/src/app.js`, update it based on resolved context:

```js
const activeLeagueContext = document.getElementById('active-league-context');
if (activeLeagueContext) {
  const version = getResolvedLeagueVersion();
  activeLeagueContext.textContent = version === 'poe2'
    ? window.t('settings.leagueContextPoe2')
    : window.t('settings.leagueContextPoe1');
}
```

Also add translation keys in `desktop/src/modules/translations.js` for:
- `settings.leaguePlaceholderPoe1`
- `settings.leaguePlaceholderPoe2`
- `settings.leagueContextHint`
- `settings.leagueContextPoe1`
- `settings.leagueContextPoe2`

- [ ] **Step 7: Commit the renderer/settings-field behavior**

```bash
git add desktop/src/app.js desktop/src/index.html desktop/src/modules/translations.js
git commit -m "feat(desktop): make active league follow game context"
```

---

### Task 3: Wire dynamic updates to live game detection and verify behavior

**Files:**
- Modify: `desktop/src/app.js`
- Test: `desktop/main.js`
- Test: `desktop/src/app.js`

- [ ] **Step 1: Update league field when the active game changes at runtime**

Inside the existing game version change IPC listener in `desktop/src/app.js`, after updating `state.settings.poeVersion`, also:

```js
      state.detectedGameVersion = version;
      state.settings.lastDetectedPoeVersion = version;
      populateSettings();
```

This ensures the visible `Active League` field follows live game switches.

- [ ] **Step 2: Add a fallback for first-run with no detection history**

If neither `state.detectedGameVersion` nor `state.settings.lastDetectedPoeVersion` exists, `getResolvedLeagueVersion()` should return `'poe1'`, but the input placeholder/helper text should still communicate both contexts by using:
- placeholder: `PoE 1 league`
- helper text: `PoE 1 league / PoE 2 league`

- [ ] **Step 3: Verify main runtime wiring still exposes the same icon/settings startup path**

Run: `Select-String -Path desktop/main.js,desktop/src/app.js -Pattern 'lastDetectedPoeVersion|defaultLeaguePoe1|defaultLeaguePoe2|getTrackerContextDefaults|applyGameVersion'`

Expected:
- finds the new per-version league keys
- finds `lastDetectedPoeVersion`
- finds the updated context resolution path in both main and renderer

- [ ] **Step 4: Run the desktop app and verify the settings behavior**

Run: `cd desktop; npm run dev`

Expected:
- desktop app starts
- settings page still renders
- `Active League` updates by detected game version when a game is active
- if no game is active, the field uses the last detected game version
- first-run fallback presents understandable placeholder/helper copy

- [ ] **Step 5: Commit only if this task required cleanup beyond the earlier tasks**

If cleanup is needed here:

```bash
git add desktop/main.js desktop/src/app.js
git commit -m "chore(desktop): finalize dynamic league settings flow"
```

---

## Self-Review

### Spec Coverage

- dynamic field follows active running game: covered by Tasks 1 and 3
- separate PoE 1 / PoE 2 stored leagues: covered by Task 1
- last active game fallback: covered by Tasks 1 and 2
- first-run hint state: covered by Task 2 and Task 3
- single visible field preserved: covered by Task 2

### Placeholder Scan

- no `TODO`, `TBD`, or deferred implementation language remains
- all file paths and commands are explicit
- verification steps include expected outcomes

### Type Consistency

- `defaultLeaguePoe1` and `defaultLeaguePoe2` are used consistently as the new storage keys
- `lastDetectedPoeVersion` is the persisted fallback key in both main and renderer flows
- `getResolvedLeagueVersion`, `getLeagueSettingKey`, and `getResolvedActiveLeague` are the same helper names used throughout the plan
