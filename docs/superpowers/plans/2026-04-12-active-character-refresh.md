# Active Character Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the character summary card shortly after a PoE1/PoE2 game launch so the card follows the active in-game character without OCR.

**Architecture:** Reuse the existing auth/account normalization pipeline instead of inventing a second character-resolution path. Main process continues to emit game detection events, while the renderer owns delayed account refresh scheduling, retry behavior, and safe fallback to the last known character when refresh fails.

**Tech Stack:** Electron, existing desktop main/renderer IPC, existing `getCurrentUser()` / accountStateModel flow, `node:test`

---

## File Structure

- Modify: `desktop/src/app.js`
  Purpose: schedule delayed character refresh after game launch/switch, retry once on failure, and preserve existing card state on refresh errors.
- Modify: `desktop/src/modules/accountStateModel.js`
  Purpose: keep selection logic deterministic when refreshed character payloads arrive for the active game.
- Modify: `desktop/main.js`
  Purpose: include an explicit `characterRefreshHint` in game-version change events if needed by renderer.
- Modify: `desktop/preload.js`
  Purpose: expose any missing current-user refresh bridge only if the existing `getCurrentUser` bridge is insufficient.
- Create: `desktop/tests/active-character-refresh.test.js`
  Purpose: renderer integration tests for delayed refresh, retry behavior, deduped timers, and fallback to last known character.
- Modify: `desktop/tests/account-state-model.test.js`
  Purpose: add coverage for refreshed game-aware character selection when the backend sends updated `selectedCharacterByGame`.

---

### Task 1: Add Delayed Character Refresh Scheduling In The Renderer

**Files:**
- Modify: `desktop/src/app.js`
- Create: `desktop/tests/active-character-refresh.test.js`

- [ ] **Step 1: Write the failing refresh scheduling tests**

```js
test('game version change schedules a delayed current-user refresh', async () => {
  const timers = [];
  const calls = [];
  const context = loadFunctions(['scheduleActiveCharacterRefresh'], {
    state: {
      currentUser: { id: 'user-1' }
    },
    window: {
      electronAPI: {
        getCurrentUser: async () => {
          calls.push(['getCurrentUser']);
          return { user: { username: 'Esquetta4179' }, capabilities: {} };
        }
      }
    },
    setTimeout(fn, delay) {
      timers.push({ fn, delay });
      return timers.length;
    },
    clearTimeout() {},
    setCurrentUser: (user) => calls.push(['setCurrentUser', user.username])
  });

  context.scheduleActiveCharacterRefresh({ version: 'poe2' });

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 3000);
  await timers[0].fn();
  assert.deepEqual(calls.map(([name]) => name), ['getCurrentUser', 'setCurrentUser']);
});

test('refresh scheduler does not stack duplicate timers across repeated game-change events', () => {
  const cleared = [];
  const timers = [];
  const context = loadFunctions(['scheduleActiveCharacterRefresh'], {
    state: {
      currentUser: { id: 'user-1' }
    },
    window: {
      electronAPI: {
        getCurrentUser: async () => ({ user: { username: 'Esquetta4179' }, capabilities: {} })
      }
    },
    setTimeout(fn, delay) {
      timers.push({ fn, delay });
      return `timer-${timers.length}`;
    },
    clearTimeout(timerId) {
      cleared.push(timerId);
    },
    setCurrentUser() {}
  });

  context.scheduleActiveCharacterRefresh({ version: 'poe2' });
  context.scheduleActiveCharacterRefresh({ version: 'poe2' });

  assert.deepEqual(cleared, ['timer-1']);
  assert.equal(timers.length, 2);
});
```

- [ ] **Step 2: Run tests to verify red state**

Run: `cd desktop && node --test tests/active-character-refresh.test.js`

Expected: FAIL because the scheduling helpers do not exist yet.

- [ ] **Step 3: Implement the minimal delayed refresh scheduler**

```js
// desktop/src/app.js
let activeCharacterRefreshTimer = null;
let activeCharacterRefreshRetryTimer = null;

function clearActiveCharacterRefreshTimers() {
  if (activeCharacterRefreshTimer) {
    clearTimeout(activeCharacterRefreshTimer);
    activeCharacterRefreshTimer = null;
  }
  if (activeCharacterRefreshRetryTimer) {
    clearTimeout(activeCharacterRefreshRetryTimer);
    activeCharacterRefreshRetryTimer = null;
  }
}

async function runActiveCharacterRefresh() {
  const result = await window.electronAPI.getCurrentUser();
  if (result?.user) {
    setCurrentUser({
      ...result.user,
      capabilities: result.capabilities || {}
    });
  }
}

function scheduleActiveCharacterRefresh({ version } = {}) {
  if (!state.currentUser || !version) {
    return;
  }

  clearActiveCharacterRefreshTimers();
  activeCharacterRefreshTimer = setTimeout(async () => {
    activeCharacterRefreshTimer = null;
    try {
      await runActiveCharacterRefresh();
    } catch {
      activeCharacterRefreshRetryTimer = setTimeout(() => {
        activeCharacterRefreshRetryTimer = null;
        void runActiveCharacterRefresh().catch(() => {});
      }, 5000);
    }
  }, 3000);
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd desktop && node --test tests/active-character-refresh.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/app.js desktop/tests/active-character-refresh.test.js
git commit -m "feat: schedule delayed active character refresh"
```

### Task 2: Trigger The Refresh From Game Detection Events

**Files:**
- Modify: `desktop/src/app.js`
- Modify: `desktop/main.js`
- Modify: `desktop/tests/active-character-refresh.test.js`

- [ ] **Step 1: Write the failing event-trigger tests**

```js
test('game-version change triggers active character refresh scheduling for poe2', () => {
  const calls = [];
  const context = loadFunctions(['setupIPCListeners'], {
    window: {
      electronAPI: {
        onGameVersionChanged(handler) {
          this._handler = handler;
        }
      }
    },
    showToast() {},
    setRuntimeSessionState() {},
    syncRendererGameContext() {},
    refreshAccountStateFromCurrentUser() {},
    renderCharacterSummaryCard() {},
    scheduleActiveCharacterRefresh: (payload) => calls.push(payload),
    stashState: { pricesSynced: false },
    elements: { priceItemCount: { textContent: '' } },
    currencyState: { poeVersion: 'poe1' },
    document: { querySelectorAll: () => [] },
    updateTypeFilterDropdown() {},
    loadCurrencyLeagues() {},
    loadCurrencyPrices() {},
    state: {}
  });

  context.setupIPCListeners();
  context.window.electronAPI._handler({ version: 'poe2', logPath: 'F:/SteamLibrary/.../Client.txt' });

  assert.deepEqual(calls, [{ version: 'poe2' }]);
});
```

- [ ] **Step 2: Run tests to verify red state**

Run: `cd desktop && node --test tests/active-character-refresh.test.js`

Expected: FAIL because game-change listeners do not yet schedule refresh.

- [ ] **Step 3: Wire game-change events into the scheduler**

```js
// desktop/src/app.js inside onGameVersionChanged listener
syncRendererGameContext(version, { logPath });
refreshAccountStateFromCurrentUser();
renderCharacterSummaryCard();
scheduleActiveCharacterRefresh({ version });
```

```js
// desktop/main.js if needed
mainWindow.webContents.send('game-version-changed', {
  version,
  settingsVersion: selectedSettingsVersion,
  lastDetectedVersion: version,
  characterRefreshHint: true,
  logPath: detectedLogPath || store.get('poePath'),
  ...(runtimeSession ? { runtimeSession } : {})
});
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd desktop && node --test tests/active-character-refresh.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/app.js desktop/main.js desktop/tests/active-character-refresh.test.js
git commit -m "feat: refresh active character after game detection"
```

### Task 3: Preserve The Last Known Character On Refresh Failure

**Files:**
- Modify: `desktop/src/app.js`
- Modify: `desktop/tests/active-character-refresh.test.js`

- [ ] **Step 1: Write the failing fallback test**

```js
test('failed character refresh keeps the previous character visible', async () => {
  const calls = [];
  const existingUser = { username: 'Esquetta4179' };
  const context = loadFunctions(['runActiveCharacterRefresh'], {
    state: {
      currentUser: existingUser
    },
    window: {
      electronAPI: {
        getCurrentUser: async () => {
          throw new Error('backend unavailable');
        }
      }
    },
    setCurrentUser: () => calls.push(['setCurrentUser'])
  });

  await context.runActiveCharacterRefresh();

  assert.equal(context.state.currentUser, existingUser);
  assert.deepEqual(calls, []);
});
```

- [ ] **Step 2: Run test to verify red state**

Run: `cd desktop && node --test tests/active-character-refresh.test.js`

Expected: FAIL because the refresh helper currently throws through.

- [ ] **Step 3: Implement failure-safe refresh behavior**

```js
async function runActiveCharacterRefresh() {
  try {
    const result = await window.electronAPI.getCurrentUser();
    if (result?.user) {
      setCurrentUser({
        ...result.user,
        capabilities: result.capabilities || {}
      });
      return true;
    }
  } catch {
    // Keep the current card and last-known account state unchanged.
  }

  return false;
}
```

- [ ] **Step 4: Run test to verify green**

Run: `cd desktop && node --test tests/active-character-refresh.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/app.js desktop/tests/active-character-refresh.test.js
git commit -m "fix: preserve last known character on refresh failure"
```

### Task 4: Re-Verify Game-Aware Character Selection With Refreshed Payloads

**Files:**
- Modify: `desktop/src/modules/accountStateModel.js`
- Modify: `desktop/tests/account-state-model.test.js`

- [ ] **Step 1: Write the failing selection test**

```js
test('refreshed poe2 payload switches the selected character when selectedCharacterByGame changes', () => {
  const result = deriveAccountState({
    accountName: 'Esquetta#4179',
    activePoeVersion: 'poe2',
    selectedCharacterByGame: {
      poe2: 'char-kellee'
    },
    characters: [
      { id: 'char-koca', name: 'KocaAyVeMasha', level: 96, class: 'Druid2', league: 'Fate of the Vaal', poeVersion: 'poe2' },
      { id: 'char-kellee', name: 'KELLEE', level: 92, class: 'Monk2', league: 'Standard', poeVersion: 'poe2' }
    ]
  });

  assert.equal(result.selectedCharacter.id, 'char-kellee');
  assert.equal(result.summary.name, 'KELLEE');
});
```

- [ ] **Step 2: Run test to verify red state**

Run: `cd desktop && node --test tests/account-state-model.test.js`

Expected: FAIL if refreshed selection is not preferred correctly.

- [ ] **Step 3: Tighten account selection precedence if needed**

```js
const normalizedSelectedCharacterId = normalizeString(
  (normalizedActivePoeVersion ? selectedCharacterByGame[normalizedActivePoeVersion] : null)
    ?? selectedCharacterId
    ?? selectedCharacterPayload?.id
);
```

- [ ] **Step 4: Run test to verify green**

Run: `cd desktop && node --test tests/account-state-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/accountStateModel.js desktop/tests/account-state-model.test.js
git commit -m "fix: prefer refreshed active-game character selection"
```

## Self-Review

### Spec coverage

- delayed refresh after game launch: Task 1 and Task 2
- one retry after first failure: Task 1 and Task 3
- preserve last known character on failure: Task 3
- reuse existing account normalization pipeline: Task 2 and Task 4
- avoid OCR and avoid continuous polling: maintained across all tasks

### Placeholder scan

- No `TODO`, `TBD`, or deferred behavior markers remain.
- Every task lists exact files and exact verification commands.
- All behavior-changing steps include concrete code snippets or exact assertions.

### Type consistency

- `scheduleActiveCharacterRefresh`, `runActiveCharacterRefresh`, and `clearActiveCharacterRefreshTimers` are named consistently across tasks.
- `selectedCharacterByGame` stays the same data contract used by the current account model.
- `getCurrentUser()` remains the existing refresh bridge instead of inventing a second API.
