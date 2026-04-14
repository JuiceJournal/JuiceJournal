# Native Active Character Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native/game-event based active-character detection path so the desktop character card can follow the actual in-game PoE1/PoE2 character within roughly 1-3 seconds after load, using API refresh only as fallback.

**Architecture:** Split the work into four seams: an investigation adapter for native game-event payloads, a normalized active-character hint model, a renderer orchestration layer that prefers native hints and falls back to delayed API refresh, and test coverage that proves stale events and fallback paths cannot corrupt the character card. Keep the first implementation investigation-first: discover the available native payload shape before committing the app to a brittle contract.

**Tech Stack:** Electron desktop app, current main/renderer IPC, existing `accountStateModel`, existing delayed `getCurrentUser()` refresh path, `node:test`

---

## File Structure

- Create: `desktop/src/modules/nativeCharacterHintModel.js`
  Purpose: normalize native/game-event payloads into a minimal active-character hint shape.
- Modify: `desktop/main.js`
  Purpose: add a native character detection experiment/adapter path and forward normalized hints to the renderer.
- Modify: `desktop/preload.js`
  Purpose: expose the new native active-character hint event channel to the renderer if needed.
- Modify: `desktop/src/app.js`
  Purpose: consume native hints, resolve them against known account characters, and use API refresh only as fallback.
- Modify: `desktop/src/modules/accountStateModel.js`
  Purpose: support selecting a refreshed active-game character using a native hint when available.
- Create: `desktop/tests/native-character-hint-model.test.js`
  Purpose: unit tests for native hint normalization and confidence levels.
- Create: `desktop/tests/active-character-native-detection.test.js`
  Purpose: renderer integration tests for native hint -> card update and fallback sequencing.

---

### Task 1: Build A Native Character Hint Normalization Model

**Files:**
- Create: `desktop/src/modules/nativeCharacterHintModel.js`
- Create: `desktop/tests/native-character-hint-model.test.js`

- [ ] **Step 1: Write the failing normalization tests**

```js
test('native character hint model keeps direct character identity fields when present', () => {
  const { deriveNativeCharacterHint } = require('../src/modules/nativeCharacterHintModel');

  const result = deriveNativeCharacterHint({
    source: 'native-game-info',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    className: 'Monk2',
    league: 'Standard'
  });

  assert.deepEqual(result, {
    source: 'native-game-info',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    className: 'Monk2',
    league: 'Standard',
    confidence: 'high'
  });
});

test('native character hint model rejects empty payloads', () => {
  const { deriveNativeCharacterHint } = require('../src/modules/nativeCharacterHintModel');

  assert.equal(deriveNativeCharacterHint({}), null);
});
```

- [ ] **Step 2: Run tests to verify red state**

Run: `cd desktop && node --test tests/native-character-hint-model.test.js`

Expected: FAIL because the native hint model does not exist yet.

- [ ] **Step 3: Implement the minimal native hint model**

```js
function deriveNativeCharacterHint(payload = {}) {
  const poeVersion = normalizePoeVersion(payload.poeVersion || payload.gameVersion || payload.game);
  const characterName = normalizeString(payload.characterName || payload.name);
  const className = normalizeString(payload.className || payload.class);
  const league = normalizeString(payload.league);

  if (!poeVersion || (!characterName && !className && !league)) {
    return null;
  }

  return {
    source: normalizeString(payload.source, 'native-game-info'),
    poeVersion,
    characterName,
    className,
    league,
    confidence: characterName ? 'high' : 'medium'
  };
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd desktop && node --test tests/native-character-hint-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/nativeCharacterHintModel.js desktop/tests/native-character-hint-model.test.js
git commit -m "feat: add native character hint model"
```

### Task 2: Add A Main-Process Native Hint Channel

**Files:**
- Modify: `desktop/main.js`
- Modify: `desktop/preload.js`
- Modify: `desktop/tests/main-settings.test.js`

- [ ] **Step 1: Write the failing IPC exposure tests**

```js
test('desktop preload exposes native character hint listener', () => {
  const source = fs.readFileSync(preloadJsPath, 'utf8');

  assert.match(source, /onActiveCharacterHint:\s*\(callback\)\s*=>/);
});

test('main process forwards native active-character hints to the renderer', () => {
  const source = fs.readFileSync(mainJsPath, 'utf8');

  assert.match(source, /active-character-hint/);
});
```

- [ ] **Step 2: Run tests to verify red state**

Run: `cd desktop && node --test tests/main-settings.test.js`

Expected: FAIL because the IPC exposure and event channel do not exist yet.

- [ ] **Step 3: Implement the minimal hint forwarding channel**

```js
// desktop/preload.js
onActiveCharacterHint: (callback) => {
  ipcRenderer.on('active-character-hint', (_event, data) => callback(data));
},
```

```js
// desktop/main.js
function emitActiveCharacterHint(payload) {
  if (mainWindow) {
    mainWindow.webContents.send('active-character-hint', payload);
  }
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd desktop && node --test tests/main-settings.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/main.js desktop/preload.js desktop/tests/main-settings.test.js
git commit -m "feat: expose native active character hint channel"
```

### Task 3: Resolve Native Hints Against Known Characters In The Renderer

**Files:**
- Modify: `desktop/src/app.js`
- Modify: `desktop/src/modules/accountStateModel.js`
- Create: `desktop/tests/active-character-native-detection.test.js`

- [ ] **Step 1: Write the failing native-hint integration tests**

```js
test('renderer applies a high-confidence native poe2 character hint without waiting for api refresh', () => {
  const calls = [];
  const context = loadFunctions(['applyNativeCharacterHint'], {
    state: {
      account: {
        charactersByGame: {
          poe2: [
            { id: 'char-koca', name: 'KocaAyVeMasha', className: 'Druid2', league: 'Fate of the Vaal', poeVersion: 'poe2' },
            { id: 'char-kellee', name: 'KELLEE', className: 'Monk2', league: 'Standard', poeVersion: 'poe2' }
          ]
        }
      }
    },
    setCurrentUser: (user) => calls.push(user)
  });

  const result = context.applyNativeCharacterHint({
    source: 'native-game-info',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    className: 'Monk2',
    league: 'Standard',
    confidence: 'high'
  });

  assert.equal(result, true);
});
```

- [ ] **Step 2: Run tests to verify red state**

Run: `cd desktop && node --test tests/active-character-native-detection.test.js`

Expected: FAIL because the native hint integration path does not exist yet.

- [ ] **Step 3: Implement minimal native hint resolution**

```js
function applyNativeCharacterHint(hint) {
  const characters = state.account?.charactersByGame?.[hint?.poeVersion] || [];
  const match = characters.find((character) => character.name === hint.characterName)
    || null;

  if (!match) {
    return false;
  }

  state.account = {
    ...state.account,
    selectedCharacter: match,
    summary: {
      ...state.account.summary,
      status: 'ready',
      id: match.id,
      name: match.name,
      level: match.level,
      className: match.className,
      league: match.league,
      poeVersion: match.poeVersion
    }
  };

  renderCharacterSummaryCard();
  refreshRendererOverlayState();
  return true;
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd desktop && node --test tests/active-character-native-detection.test.js tests/account-state-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/app.js desktop/src/modules/accountStateModel.js desktop/tests/active-character-native-detection.test.js desktop/tests/account-state-model.test.js
git commit -m "feat: resolve native active character hints"
```

### Task 4: Add Fallback Sequencing Between Native Hints And API Refresh

**Files:**
- Modify: `desktop/src/app.js`
- Modify: `desktop/tests/active-character-refresh.test.js`
- Modify: `desktop/tests/active-character-native-detection.test.js`

- [ ] **Step 1: Write the failing fallback-order tests**

```js
test('renderer skips delayed api refresh when a high-confidence native hint already updated the character', () => {
  const calls = [];
  const context = loadFunctions(['scheduleActiveCharacterRefresh'], {
    activeCharacterRefreshTimer: null,
    activeCharacterRefreshRetryTimer: null,
    activeCharacterRefreshRequestId: 0,
    state: {
      currentUser: { id: 'user-1' },
      activeCharacterRefreshSource: 'native-high-confidence'
    },
    setTimeout() {
      calls.push('setTimeout');
    }
  });

  context.scheduleActiveCharacterRefresh({ version: 'poe2' });

  assert.deepEqual(calls, []);
});
```

- [ ] **Step 2: Run tests to verify red state**

Run: `cd desktop && node --test tests/active-character-refresh.test.js tests/active-character-native-detection.test.js`

Expected: FAIL because fallback ordering does not yet account for native success.

- [ ] **Step 3: Implement the minimal fallback gate**

```js
function scheduleActiveCharacterRefresh({ version } = {}) {
  if (!version) {
    clearActiveCharacterRefreshTimers();
    return;
  }

  if (!state.currentUser || state.activeCharacterRefreshSource === 'native-high-confidence') {
    return;
  }

  // existing timer logic
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `cd desktop && node --test tests/active-character-refresh.test.js tests/active-character-native-detection.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/app.js desktop/tests/active-character-refresh.test.js desktop/tests/active-character-native-detection.test.js
git commit -m "fix: prefer native active character hints over api fallback"
```

## Self-Review

### Spec coverage

- native hint model: Task 1
- main/renderer hint transport: Task 2
- matching hint to known characters: Task 3
- API fallback only as secondary path: Task 4
- avoid OCR and preserve last known character on failure: Tasks 3-4 build on the existing fallback behavior

### Placeholder scan

- No `TODO`, `TBD`, or vague “handle edge cases later” placeholders remain.
- Every task lists exact files and exact commands.
- Every behavior-changing step includes explicit code or assertions.

### Type consistency

- `deriveNativeCharacterHint`, `applyNativeCharacterHint`, and `activeCharacterRefreshSource` are named consistently across tasks.
- The hint payload uses the same `poeVersion`, `characterName`, `className`, and `league` fields throughout.
- The fallback path remains the existing `getCurrentUser()` refresh rather than introducing a second remote account API.
