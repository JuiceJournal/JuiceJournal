# Desktop Settings Functional Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop settings surface fully functional, remove misleading auth/reset behavior, and add enough automated coverage to safely test league, hotkey, and session-related flows.

**Architecture:** Keep the Electron shell, but pull settings and auth presentation rules out of the current large renderer file into small pure modules that can be tested with `node:test`. Use existing backend/IPC league data instead of free-text league entry, move global shortcut registration to persisted settings instead of hardcoded values, and add one Electron smoke test layer for end-to-end confidence.

**Tech Stack:** Electron, Node.js `node:test`, `jsdom`, Playwright for Electron smoke tests, existing backend price/auth APIs

---

## File Structure

- Modify: `desktop/src/index.html`
  Purpose: replace non-functional settings fields with real controls and remove dynamic text from `data-i18n` slots that should not be blindly translated.
- Modify: `desktop/src/app.js`
  Purpose: stop owning all settings logic inline; delegate to testable helpers, load active leagues, capture/edit hotkeys, and separate reset from auth state.
- Modify: `desktop/src/modules/translations.js`
  Purpose: avoid overwriting runtime user data during `applyTranslations()`.
- Modify: `desktop/main.js`
  Purpose: persist both hotkeys, validate them, and register/unregister shortcuts from settings instead of hardcoded accelerators.
- Modify: `desktop/preload.js`
  Purpose: expose any new IPC needed for settings reset or hotkey validation.
- Modify: `desktop/package.json`
  Purpose: add `test:*` scripts and test dependencies.
- Create: `desktop/src/modules/settingsModel.js`
  Purpose: pure settings state helpers for league selection, reset defaults, and payload generation.
- Create: `desktop/src/modules/hotkeyModel.js`
  Purpose: accelerator normalization and collision validation helpers shared by renderer and main process.
- Create: `desktop/tests/settings-model.test.js`
  Purpose: regression tests for active league, reset defaults, and current-user-safe translation behavior.
- Create: `desktop/tests/hotkey-model.test.js`
  Purpose: regression tests for accelerator parsing, duplicate prevention, and save payloads.
- Create: `desktop/tests/main-hotkeys.test.js`
  Purpose: main-process level tests that prove stored accelerators drive shortcut registration.
- Create: `desktop/playwright.config.js`
  Purpose: desktop smoke test configuration.
- Create: `desktop/e2e/settings-smoke.spec.js`
  Purpose: verify league control, hotkey editing UI, and reset behavior in a launched Electron app.

---

### Task 1: Freeze The Current Regressions In Tests

**Files:**
- Modify: `desktop/package.json`
- Create: `desktop/tests/settings-model.test.js`
- Create: `desktop/tests/hotkey-model.test.js`

- [ ] **Step 1: Add test dependencies and scripts**

```json
{
  "scripts": {
    "test": "node --test tests/*.test.js",
    "test:desktop": "node --test tests/*.test.js",
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.54.0",
    "electron": "^35.7.5",
    "electron-builder": "^26.8.2",
    "jsdom": "^26.1.0"
  }
}
```

- [ ] **Step 2: Write failing regression tests for the three reported behaviors**

```js
test('settings model prefers active leagues over free text when options are available', () => {
  const result = deriveLeagueFieldState({
    settingsVersion: 'poe1',
    storedLeague: 'Standard',
    activeLeagues: ['Mercenaries', 'Hardcore Mercenaries']
  });

  assert.equal(result.controlType, 'select');
  assert.equal(result.value, 'Mercenaries');
});

test('reset defaults does not mutate authenticated header state', () => {
  const result = buildResetSettingsDraft({
    settings: { language: 'tr', apiUrl: 'http://localhost:3001' },
    currentUser: { username: 'Esquetta4179' }
  });

  assert.equal(result.headerUsername, 'Esquetta4179');
});

test('hotkey model rejects duplicate accelerators', () => {
  assert.throws(() => validateHotkeys({
    scanHotkey: 'F9',
    stashScanHotkey: 'F9'
  }), /must be unique/i);
});
```

- [ ] **Step 3: Run the tests to verify they fail against the current implementation**

Run: `cd desktop && node --test tests/settings-model.test.js tests/hotkey-model.test.js`

Expected: failures proving that there is no extracted model yet and current UI rules are not implemented.

- [ ] **Step 4: Commit the red tests**

```bash
git add desktop/package.json desktop/tests/settings-model.test.js desktop/tests/hotkey-model.test.js
git commit -m "test: capture desktop settings regressions"
```

### Task 2: Extract A Testable Settings Model

**Files:**
- Create: `desktop/src/modules/settingsModel.js`
- Modify: `desktop/src/app.js`
- Test: `desktop/tests/settings-model.test.js`

- [ ] **Step 1: Create pure helpers for league and reset state**

```js
function deriveLeagueFieldState({ settingsVersion, storedLeague, activeLeagues, apiReachable }) {
  const options = Array.isArray(activeLeagues) ? activeLeagues.filter(Boolean) : [];
  if (apiReachable && options.length > 0) {
    return {
      controlType: 'select',
      options,
      value: options.includes(storedLeague) ? storedLeague : options[0]
    };
  }

  return {
    controlType: 'input',
    options: [],
    value: storedLeague || 'Standard'
  };
}

function buildResetSettingsDraft({ settings, currentUser }) {
  return {
    settings: {
      apiUrl: 'http://localhost:3001',
      poePath: '',
      autoStartSession: true,
      notifications: true,
      soundNotifications: false,
      language: 'en'
    },
    headerUsername: currentUser?.username || 'Guest'
  };
}
```

- [ ] **Step 2: Refactor renderer code to consume these helpers instead of mutating DOM ad hoc**

```js
const leagueFieldState = deriveLeagueFieldState({
  settingsVersion: getSettingsLeagueVersion(),
  storedLeague: getStoredLeagueValueForVersion(getSettingsLeagueVersion()),
  activeLeagues: state.activeLeagueOptions?.[getSettingsLeagueVersion()] || [],
  apiReachable: state.leagueOptionsLoaded === true
});
```

- [ ] **Step 3: Run model tests**

Run: `cd desktop && node --test tests/settings-model.test.js`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add desktop/src/modules/settingsModel.js desktop/src/app.js desktop/tests/settings-model.test.js
git commit -m "refactor: extract desktop settings state model"
```

### Task 3: Replace Free-Text Active League With A Real Active-League Control

**Files:**
- Modify: `desktop/src/index.html`
- Modify: `desktop/src/app.js`
- Modify: `desktop/src/modules/translations.js`
- Test: `desktop/tests/settings-model.test.js`
- Test: `desktop/e2e/settings-smoke.spec.js`

- [ ] **Step 1: Replace the plain text input with a progressive control**

```html
<div class="form-group" id="active-league-field">
  <select id="default-league-select" class="hidden"></select>
  <input type="text" id="default-league-input" class="hidden" placeholder="Standard">
  <p id="default-league-status" class="settings-desc"></p>
</div>
```

- [ ] **Step 2: Load active leagues through existing IPC and bind them to the selected PoE version**

```js
async function loadSettingsLeagueOptions(version) {
  const response = await window.electronAPI.getCurrencyLeagues(version);
  const leagueData = response?.data || response || {};
  return (leagueData.activeLeagues || [])
    .filter((entry) => entry?.active)
    .map((entry) => entry.displayName || entry.name)
    .filter(Boolean);
}
```

- [ ] **Step 3: Preserve manual fallback only when the API has no usable active leagues**

```js
const fieldState = deriveLeagueFieldState({
  settingsVersion: version,
  storedLeague,
  activeLeagues,
  apiReachable: true
});
renderLeagueControl(fieldState);
```

- [ ] **Step 4: Add end-to-end smoke coverage**

```js
test('active league control renders a selectable active league list', async () => {
  await page.getByRole('tab', { name: /settings/i }).click();
  await page.getByRole('button', { name: /path of exile/i }).click();
  await expect(page.locator('#default-league-select')).toBeVisible();
});
```

- [ ] **Step 5: Run verification**

Run: `cd desktop && node --test tests/settings-model.test.js`

Run: `cd desktop && npx playwright test e2e/settings-smoke.spec.js --grep "active league"`

Expected: both pass

- [ ] **Step 6: Commit**

```bash
git add desktop/src/index.html desktop/src/app.js desktop/src/modules/translations.js desktop/tests/settings-model.test.js desktop/e2e/settings-smoke.spec.js
git commit -m "feat: load active league options into settings"
```

### Task 4: Make Hotkeys Editable And Actually Drive Main-Process Registration

**Files:**
- Create: `desktop/src/modules/hotkeyModel.js`
- Modify: `desktop/src/index.html`
- Modify: `desktop/src/app.js`
- Modify: `desktop/main.js`
- Test: `desktop/tests/hotkey-model.test.js`
- Test: `desktop/tests/main-hotkeys.test.js`

- [ ] **Step 1: Persist both accelerators instead of only `scanHotkey`**

```js
const SETTINGS_ALLOWLIST = new Set([
  'apiUrl',
  'poePath',
  'autoStartSession',
  'notifications',
  'soundNotifications',
  'language',
  'poeVersion',
  'defaultLeaguePoe1',
  'defaultLeaguePoe2',
  'scanHotkey',
  'stashScanHotkey'
]);
```

- [ ] **Step 2: Normalize and validate accelerators in one shared helper**

```js
function validateHotkeys({ scanHotkey, stashScanHotkey }) {
  const normalized = [scanHotkey, stashScanHotkey].map(normalizeAccelerator);
  if (normalized[0] === normalized[1]) {
    throw new Error('Hotkeys must be unique');
  }
  return {
    scanHotkey: normalized[0],
    stashScanHotkey: normalized[1]
  };
}
```

- [ ] **Step 3: Replace hardcoded global shortcut registration**

```js
function registerGlobalShortcuts() {
  globalShortcut.unregisterAll();
  const scanHotkey = store.get('scanHotkey') || 'F9';
  const stashScanHotkey = store.get('stashScanHotkey') || 'CommandOrControl+Shift+L';
  globalShortcut.register(scanHotkey, () => captureAndScan());
  globalShortcut.register(stashScanHotkey, () => captureAndScan());
}
```

- [ ] **Step 4: Make the renderer fields enter capture mode instead of being readonly dead inputs**

```html
<input type="text" id="scan-hotkey" class="hotkey-field" readonly data-capture-hotkey="scan">
<input type="text" id="stash-scan-hotkey" class="hotkey-field" readonly data-capture-hotkey="stash">
```

```js
field.addEventListener('keydown', (event) => {
  event.preventDefault();
  field.value = formatKeyboardEventToAccelerator(event);
});
```

- [ ] **Step 5: Run verification**

Run: `cd desktop && node --test tests/hotkey-model.test.js tests/main-hotkeys.test.js`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add desktop/src/modules/hotkeyModel.js desktop/src/index.html desktop/src/app.js desktop/main.js desktop/tests/hotkey-model.test.js desktop/tests/main-hotkeys.test.js
git commit -m "feat: make desktop hotkeys configurable"
```

### Task 5: Separate Reset Defaults From Auth And Dynamic User Chrome

**Files:**
- Modify: `desktop/src/index.html`
- Modify: `desktop/src/app.js`
- Modify: `desktop/src/modules/translations.js`
- Modify: `desktop/main.js`
- Test: `desktop/tests/settings-model.test.js`
- Test: `desktop/e2e/settings-smoke.spec.js`

- [ ] **Step 1: Stop translating live user identity as static copy**

```html
<span id="username" data-auth-placeholder="user.guest">Misafir</span>
```

```js
window.applyTranslations = function() {
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    if (el.hasAttribute('data-auth-placeholder') && el.dataset.dynamicValue === 'true') {
      return;
    }
    el.textContent = window.t(el.getAttribute('data-i18n'));
  });
};
```

- [ ] **Step 2: Ensure reset only affects settings keys, never token or current user**

```js
async function handleResetSettings() {
  const resetDraft = buildResetSettingsDraft({
    settings: state.settings,
    currentUser: state.currentUser
  });
  applySettingsDraftToDom(resetDraft.settings);
  await handleSaveSettings();
  if (state.currentUser) {
    setCurrentUser(state.currentUser);
  }
}
```

- [ ] **Step 3: Fix signed-out PoE account copy so it does not imply a mock-authenticated state**

```js
if (!state.currentUser) {
  elements.poeLinkStatus.textContent = window.t('settings.poeSignInRequired');
  elements.poeAccountName.textContent = window.t('settings.poeSignInHint');
  elements.poeLinkMode.textContent = window.t('settings.poeLinkUnavailableSignedOut');
}
```

- [ ] **Step 4: Run verification**

Run: `cd desktop && node --test tests/settings-model.test.js`

Run: `cd desktop && npx playwright test e2e/settings-smoke.spec.js --grep "reset"`

Expected: username remains authenticated after reset, no logout modal opens, and signed-out text no longer says mock-linked.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/index.html desktop/src/app.js desktop/src/modules/translations.js desktop/main.js desktop/tests/settings-model.test.js desktop/e2e/settings-smoke.spec.js
git commit -m "fix: decouple desktop settings reset from auth chrome"
```

### Task 6: Add A Minimal Electron Smoke Test Lane

**Files:**
- Create: `desktop/playwright.config.js`
- Create: `desktop/e2e/settings-smoke.spec.js`
- Modify: `desktop/package.json`

- [ ] **Step 1: Add Playwright config for Electron**

```js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    trace: 'on-first-retry'
  }
});
```

- [ ] **Step 2: Cover the user-visible settings workflows**

```js
test('settings smoke', async ({ playwright }) => {
  const electronApp = await playwright._electron.launch({ args: ['.'] });
  const page = await electronApp.firstWindow();

  await page.getByRole('tab', { name: /settings/i }).click();
  await expect(page.locator('#default-league-select, #default-league-input')).toBeVisible();
  await expect(page.locator('#scan-hotkey')).toHaveValue(/F9|Key/);
});
```

- [ ] **Step 3: Run the smoke lane**

Run: `cd desktop && npx playwright test`

Expected: PASS with at least one settings smoke spec

- [ ] **Step 4: Commit**

```bash
git add desktop/playwright.config.js desktop/e2e/settings-smoke.spec.js desktop/package.json
git commit -m "test: add electron settings smoke coverage"
```

---

## Spec Coverage Check

- Active league is currently a free-text field in `desktop/src/index.html`, but the app already has an active-league data path via `getCurrencyLeagues()`. Tasks 2 and 3 close that gap.
- Hotkeys are currently visual-only settings while the main process still registers `F9` and `CommandOrControl+Shift+L` directly. Task 4 closes that mismatch.
- Reset defaults currently reruns translation and settings save logic in a way that can overwrite user chrome and mislead the operator about auth state. Task 5 isolates auth from settings reset and removes misleading signed-out copy.
- The desktop app currently has almost no functional coverage around settings. Tasks 1 and 6 add regression and smoke coverage.

## Placeholder Scan

- No `TODO`, `TBD`, or “handle appropriately” placeholders remain.
- Every task names exact files and concrete commands.
- Every verification step includes a runnable command and expected result.

## Type Consistency Check

- Renderer and main process both use `scanHotkey` and `stashScanHotkey`.
- League settings remain versioned as `defaultLeaguePoe1` and `defaultLeaguePoe2`.
- Reset logic is modeled through `buildResetSettingsDraft()` and rendered through `applySettingsDraftToDom()`.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-09-desktop-settings-functional-readiness.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
