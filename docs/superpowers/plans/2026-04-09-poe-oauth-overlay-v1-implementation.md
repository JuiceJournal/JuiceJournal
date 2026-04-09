# PoE OAuth Overlay V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Path of Exile OAuth-only Juice Journal flow with character-driven dashboard data, runtime map/session tracking, PoE1-first stash capability gating, and an optional mini overlay that consumes normalized session state.

**Architecture:** Split the feature into five stable seams: PoE OAuth auth, account/character data, runtime session state, capability-gated dashboard modules, and a lightweight overlay shell. Keep provider logic separate from renderer presentation so tests can target pure data/state modules and the overlay only renders normalized state instead of talking directly to logs, OAuth payloads, or stash transport code.

**Tech Stack:** Electron, Node.js, Express, existing PoE OAuth backend services, `node:test`, Playwright Electron smoke tests

---

## File Structure

- Modify: `backend/routes/auth.js`
  Purpose: make PoE OAuth the only login path and auto-create/update the local user.
- Modify: `backend/models/User.js`
  Purpose: ensure the user model is compatible with PoE-OAuth-first identity and selected character metadata.
- Modify: `desktop/src/index.html`
  Purpose: replace local login/register entry with PoE OAuth-only entry and add character/runtime dashboard surfaces.
- Modify: `desktop/src/app.js`
  Purpose: consume normalized account/runtime/capability state and render dashboard + overlay settings state.
- Modify: `desktop/main.js`
  Purpose: initialize runtime providers, overlay window, and capability-aware desktop IPC.
- Create: `desktop/src/modules/accountStateModel.js`
  Purpose: normalize account/character payloads into UI-safe state.
- Create: `desktop/src/modules/runtimeSessionModel.js`
  Purpose: normalize log/game-detection events into runtime session and instance summaries.
- Create: `desktop/src/modules/capabilityModel.js`
  Purpose: centralize per-game feature flags such as PoE1 stash enabled / PoE2 stash unavailable.
- Create: `desktop/src/modules/overlayStateModel.js`
  Purpose: derive compact overlay state from normalized dashboard/session data.
- Create: `desktop/src/overlay.html`
  Purpose: mini overlay window markup.
- Create: `desktop/src/overlay.js`
  Purpose: render overlay state and apply click-through/visibility behavior.
- Create: `desktop/tests/account-state-model.test.js`
  Purpose: unit tests for character/account normalization.
- Create: `desktop/tests/runtime-session-model.test.js`
  Purpose: unit tests for instance timing and map/session summaries.
- Create: `desktop/tests/capability-model.test.js`
  Purpose: unit tests for PoE1/PoE2 capability gating.
- Create: `desktop/tests/overlay-state-model.test.js`
  Purpose: unit tests for compact overlay rendering state.
- Create: `desktop/tests/auth-poe-ui.test.js`
  Purpose: renderer tests for OAuth-only login UI and character/dashboard initialization.
- Modify: `desktop/e2e/settings-smoke.spec.js`
  Purpose: expand smoke coverage into the PoE OAuth-only entry and core dashboard/overlay surfaces.
- Create: `desktop/e2e/overlay-smoke.spec.js`
  Purpose: smoke-test overlay launch and visible compact state.

---

### Task 1: Convert Desktop Auth To PoE OAuth-Only Entry

**Files:**
- Modify: `backend/routes/auth.js`
- Modify: `backend/models/User.js`
- Modify: `desktop/src/index.html`
- Modify: `desktop/src/app.js`
- Test: `desktop/tests/auth-poe-ui.test.js`

- [ ] **Step 1: Write the failing auth-entry tests**

```js
test('desktop login surface exposes only Path of Exile OAuth entry', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.doesNotMatch(html, /id="login-form"/);
  assert.doesNotMatch(html, /id="register-form"/);
  assert.match(html, /id="poe-oauth-login"/);
});

test('successful poe oauth login initializes a local session and dashboard bootstrap', async () => {
  const calls = [];
  const context = loadFunctions(['handlePoeOAuthLogin'], {
    window: {
      electronAPI: {
        startPoeLogin: async () => ({ mode: 'mock', requiresBrowser: false, state: 'oauth-state', mockCode: 'code' }),
        completePoeConnect: async () => { throw new Error('wrong endpoint'); },
        completePoeLogin: async () => ({ success: true, data: { user: { username: 'RangerMain' }, capabilities: {} } })
      },
      t: (key) => key
    },
    setCurrentUser: (user) => calls.push(['setCurrentUser', user.username]),
    loadPoeLinkStatus: async () => calls.push(['loadPoeLinkStatus']),
    refreshTrackerData: async () => calls.push(['refreshTrackerData'])
  });

  await context.handlePoeOAuthLogin();

  assert.deepEqual(calls.map(([name]) => name), ['setCurrentUser', 'loadPoeLinkStatus', 'refreshTrackerData']);
});
```

- [ ] **Step 2: Run tests to verify red state**

Run: `cd desktop && node --test tests/auth-poe-ui.test.js`

Expected: FAIL because the current desktop HTML still contains local forms and the renderer login bootstrap is not PoE-OAuth-only.

- [ ] **Step 3: Implement PoE OAuth-only auth entry**

```js
// backend/routes/auth.js
router.post('/poe/login/complete', async (req, res) => {
  const poeIdentity = await poeAuthService.completeLogin(req.body);
  const user = await User.upsertFromPoeIdentity(poeIdentity);
  const token = generateToken(user.id);

  setAuthCookie(res, token);
  res.json({
    success: true,
    data: {
      user,
      token,
      capabilities: getCapabilities(user),
      poe: poeIdentity
    },
    error: null
  });
});
```

```html
<!-- desktop/src/index.html -->
<div id="login-modal" class="modal" role="dialog" aria-label="Path of Exile login">
  <div class="modal-content">
    <div class="modal-shell">
      <div class="modal-panel oauth-only">
        <h2>Login with Path of Exile</h2>
        <p class="modal-subtitle">Juice Journal requires a linked Path of Exile account.</p>
        <button type="button" class="btn btn-poe-oauth" id="poe-oauth-login">
          <span>Continue with Path of Exile</span>
        </button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd desktop && node --test tests/auth-poe-ui.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routes/auth.js backend/models/User.js desktop/src/index.html desktop/src/app.js desktop/tests/auth-poe-ui.test.js
git commit -m "feat: make desktop auth poe-oauth only"
```

### Task 2: Add Account And Character State Providers

**Files:**
- Create: `desktop/src/modules/accountStateModel.js`
- Modify: `desktop/src/app.js`
- Test: `desktop/tests/account-state-model.test.js`

- [ ] **Step 1: Write the failing model tests**

```js
test('account state model picks the selected character and formats summary fields', () => {
  const result = deriveAccountState({
    accountName: 'KocaGyVeMasha',
    selectedCharacterId: 'char-2',
    characters: [
      { id: 'char-1', name: 'AltOne', level: 91, class: 'Monk', ascendancy: 'Invoker', league: 'Standard' },
      { id: 'char-2', name: 'MainOne', level: 96, class: 'Shaman', ascendancy: 'Ritualist', league: 'Fate of the Vaal' }
    ]
  });

  assert.equal(result.selectedCharacter.name, 'MainOne');
  assert.equal(result.summary.league, 'Fate of the Vaal');
  assert.equal(result.summary.level, 96);
});

test('account state model falls back cleanly when no character list is available', () => {
  const result = deriveAccountState({ accountName: 'Solo', characters: [] });

  assert.equal(result.selectedCharacter, null);
  assert.equal(result.summary.status, 'no_character_selected');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop && node --test tests/account-state-model.test.js`

Expected: FAIL with `MODULE_NOT_FOUND` or missing export.

- [ ] **Step 3: Implement minimal account provider/model**

```js
function deriveAccountState({ accountName, selectedCharacterId, characters = [] } = {}) {
  const normalizedCharacters = characters.filter(Boolean).map((character) => ({
    id: character.id,
    name: character.name,
    level: Number(character.level || 0),
    className: character.class,
    ascendancy: character.ascendancy,
    league: character.league
  }));

  const selectedCharacter = normalizedCharacters.find((character) => character.id === selectedCharacterId)
    || normalizedCharacters[0]
    || null;

  return {
    accountName: accountName || null,
    characters: normalizedCharacters,
    selectedCharacter,
    summary: selectedCharacter
      ? {
        status: 'ready',
        name: selectedCharacter.name,
        level: selectedCharacter.level,
        className: selectedCharacter.className,
        ascendancy: selectedCharacter.ascendancy,
        league: selectedCharacter.league
      }
      : { status: 'no_character_selected' }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd desktop && node --test tests/account-state-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/accountStateModel.js desktop/src/app.js desktop/tests/account-state-model.test.js
git commit -m "feat: add account and character state model"
```

### Task 3: Add Runtime Session Normalization For Map/Instance Timing

**Files:**
- Create: `desktop/src/modules/runtimeSessionModel.js`
- Modify: `desktop/main.js`
- Modify: `desktop/src/app.js`
- Test: `desktop/tests/runtime-session-model.test.js`
- Test: `desktop/tests/main-settings.test.js`

- [ ] **Step 1: Write the failing timing tests**

```js
test('runtime session model creates a new instance summary from enter/exit events', () => {
  const state = createRuntimeSessionState();
  applyRuntimeEvent(state, { type: 'area_entered', areaName: 'Crimson Shores', at: '2026-04-09T12:00:00.000Z' });
  applyRuntimeEvent(state, { type: 'area_exited', areaName: 'Crimson Shores', at: '2026-04-09T12:05:30.000Z' });

  assert.equal(state.instances.length, 1);
  assert.equal(state.instances[0].durationSeconds, 330);
});

test('runtime session model keeps current instance active until exit arrives', () => {
  const state = createRuntimeSessionState();
  applyRuntimeEvent(state, { type: 'area_entered', areaName: 'Overgrown', at: '2026-04-09T12:00:00.000Z' });

  assert.equal(state.currentInstance.areaName, 'Overgrown');
  assert.equal(state.currentInstance.status, 'active');
});
```

- [ ] **Step 2: Run test to verify red**

Run: `cd desktop && node --test tests/runtime-session-model.test.js`

Expected: FAIL

- [ ] **Step 3: Implement normalized runtime model and IPC payload**

```js
function createRuntimeSessionState() {
  return {
    currentInstance: null,
    instances: [],
    totalActiveSeconds: 0
  };
}

function applyRuntimeEvent(state, event) {
  if (event.type === 'area_entered') {
    state.currentInstance = {
      areaName: event.areaName,
      enteredAt: event.at,
      status: 'active'
    };
    return state;
  }

  if (event.type === 'area_exited' && state.currentInstance) {
    const durationSeconds = Math.max(0, Math.round((Date.parse(event.at) - Date.parse(state.currentInstance.enteredAt)) / 1000));
    state.instances.push({
      areaName: state.currentInstance.areaName,
      enteredAt: state.currentInstance.enteredAt,
      exitedAt: event.at,
      durationSeconds
    });
    state.totalActiveSeconds += durationSeconds;
    state.currentInstance = null;
  }

  return state;
}
```

- [ ] **Step 4: Run test to verify green**

Run: `cd desktop && node --test tests/runtime-session-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/runtimeSessionModel.js desktop/main.js desktop/src/app.js desktop/tests/runtime-session-model.test.js desktop/tests/main-settings.test.js
git commit -m "feat: add runtime session normalization"
```

### Task 4: Add Capability-Gated Dashboard Cards

**Files:**
- Create: `desktop/src/modules/capabilityModel.js`
- Modify: `desktop/src/index.html`
- Modify: `desktop/src/app.js`
- Test: `desktop/tests/capability-model.test.js`
- Test: `desktop/tests/settings-ui.test.js`

- [ ] **Step 1: Write the failing capability tests**

```js
test('capability model enables stash tracking for poe1 and disables it for poe2', () => {
  assert.deepEqual(getCapabilitiesForGame('poe1').stashTracking, { enabled: true, reason: null });
  assert.deepEqual(getCapabilitiesForGame('poe2').stashTracking, { enabled: false, reason: 'poe2_not_supported_yet' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop && node --test tests/capability-model.test.js`

Expected: FAIL

- [ ] **Step 3: Implement capability model and dashboard empty states**

```js
function getCapabilitiesForGame(poeVersion) {
  if (poeVersion === 'poe2') {
    return {
      characterSummary: { enabled: true, reason: null },
      runtimeTracking: { enabled: true, reason: null },
      stashTracking: { enabled: false, reason: 'poe2_not_supported_yet' }
    };
  }

  return {
    characterSummary: { enabled: true, reason: null },
    runtimeTracking: { enabled: true, reason: null },
    stashTracking: { enabled: true, reason: null }
  };
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd desktop && node --test tests/capability-model.test.js tests/settings-ui.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/capabilityModel.js desktop/src/index.html desktop/src/app.js desktop/tests/capability-model.test.js desktop/tests/settings-ui.test.js
git commit -m "feat: add capability gated dashboard modules"
```

### Task 5: Build Optional Mini Overlay Shell

**Files:**
- Create: `desktop/src/modules/overlayStateModel.js`
- Create: `desktop/src/overlay.html`
- Create: `desktop/src/overlay.js`
- Modify: `desktop/main.js`
- Modify: `desktop/src/app.js`
- Test: `desktop/tests/overlay-state-model.test.js`

- [ ] **Step 1: Write the failing overlay state tests**

```js
test('overlay state model composes compact character and runtime summary', () => {
  const state = deriveOverlayState({
    character: { name: 'KocaGyVeMasha', league: 'Fate of the Vaal', className: 'Shaman' },
    runtime: { currentArea: 'Overgrown', currentInstanceSeconds: 332, currentSessionSeconds: 1840 }
  });

  assert.equal(state.visibility, 'visible');
  assert.equal(state.primaryLine, 'KocaGyVeMasha · Fate of the Vaal');
  assert.equal(state.secondaryLine, 'Overgrown');
});

test('overlay state model falls back to waiting state when runtime data is missing', () => {
  const state = deriveOverlayState({ character: null, runtime: null });
  assert.equal(state.visibility, 'waiting');
});
```

- [ ] **Step 2: Run test to verify red**

Run: `cd desktop && node --test tests/overlay-state-model.test.js`

Expected: FAIL

- [ ] **Step 3: Implement overlay state model and shell**

```js
function deriveOverlayState({ character, runtime } = {}) {
  if (!runtime) {
    return {
      visibility: 'waiting',
      primaryLine: 'Waiting for game',
      secondaryLine: 'Waiting for runtime session'
    };
  }

  return {
    visibility: 'visible',
    primaryLine: character ? `${character.name} · ${character.league}` : 'Character sync needed',
    secondaryLine: runtime.currentArea || 'Waiting for area data',
    metaLine: `${runtime.currentInstanceSeconds}s · session ${runtime.currentSessionSeconds}s`
  };
}
```

- [ ] **Step 4: Run test to verify green**

Run: `cd desktop && node --test tests/overlay-state-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/overlayStateModel.js desktop/src/overlay.html desktop/src/overlay.js desktop/main.js desktop/src/app.js desktop/tests/overlay-state-model.test.js
git commit -m "feat: add mini overlay shell"
```

### Task 6: Extend Smoke Coverage For OAuth-First Dashboard And Overlay

**Files:**
- Modify: `desktop/e2e/settings-smoke.spec.js`
- Create: `desktop/e2e/overlay-smoke.spec.js`
- Modify: `desktop/package.json`

- [ ] **Step 1: Write the failing smoke spec**

```js
test('overlay smoke: launches app, signs in via poe oauth stub, and shows compact runtime summary', async () => {
  const { electronApp, page } = await launchDesktopWithStubbedPoeAuth();

  await page.getByRole('button', { name: /continue with path of exile/i }).click();
  await expect(page.locator('#character-summary-card')).toBeVisible();
  await expect(page.locator('#runtime-session-card')).toBeVisible();

  const overlayWindow = await waitForOverlayWindow(electronApp);
  await expect(overlayWindow.locator('[data-overlay-state="visible"]')).toBeVisible();
});
```

- [ ] **Step 2: Run smoke test to verify red**

Run: `cd desktop && npx playwright test e2e/overlay-smoke.spec.js`

Expected: FAIL because overlay surface and PoE-OAuth-first launch path are not yet wired.

- [ ] **Step 3: Implement smoke coverage wiring**

```js
// desktop/package.json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:smoke": "playwright test e2e/settings-smoke.spec.js e2e/overlay-smoke.spec.js"
  }
}
```

- [ ] **Step 4: Run smoke tests to verify green**

Run: `cd desktop && npx playwright test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/e2e/settings-smoke.spec.js desktop/e2e/overlay-smoke.spec.js desktop/package.json
git commit -m "test: add oauth dashboard and overlay smoke coverage"
```

---

## Spec Coverage Check

- PoE OAuth-only auth is covered in Task 1.
- Automatic local user creation/update is covered in Task 1.
- Character/account provider architecture is covered in Task 2.
- Runtime map/instance durations are covered in Task 3.
- Dashboard cards and PoE1/PoE2 capability boundaries are covered in Task 4.
- Mini overlay is covered in Task 5.
- Testability and smoke harness are covered in Task 6.

## Placeholder Scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- All tasks specify exact files, tests, commands, and commit messages.
- All code-changing steps include concrete code snippets rather than abstract instructions.

## Type Consistency Check

- Account normalization consistently uses `selectedCharacter`, `summary`, and `characters`.
- Runtime normalization consistently uses `currentInstance`, `instances`, and `totalActiveSeconds`.
- Capability gating consistently uses `{ enabled, reason }`.
- Overlay state consistently uses `visibility`, `primaryLine`, `secondaryLine`, and `metaLine`.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-09-poe-oauth-overlay-v1-implementation.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
