# Active Hint Emission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the local native bridge from diagnostics-only output to real `active-character-hint` emission for `PoE1 + PoE2`, with strict high-confidence gating and no OCR or memory reading.

**Architecture:** Add a `.NET 10` bridge-side `HintResolver` that consumes current probe snapshots plus minimal desktop-fed account/runtime context and emits `active-character-hint` only when confidence is unambiguously high. On the Electron side, extend bridge payload handling to accept the new hint type while preserving diagnostics-only behavior for everything else. Keep delayed API refresh as a secondary fallback and never emit guesses.

**Tech Stack:** `.NET 10`, Electron main process, Node test runner, NDJSON over stdout

---

## File Structure

- Create: `desktop/native-bridge/Services/HintResolver.cs`
  - Resolve probe outputs into high-confidence character hints or no hint.
- Create: `desktop/native-bridge/Contracts/ActiveCharacterHint.cs`
  - Bridge-side DTO for emitted hints.
- Modify: `desktop/native-bridge/Program.cs`
  - Wire probes into the resolver and emit either diagnostics or a real hint.
- Modify: `desktop/src/modules/nativeBridgeModel.js`
  - Parse and normalize `active-character-hint` payloads in addition to diagnostics.
- Modify: `desktop/tests/native-bridge-model.test.js`
  - Add coverage for supported hint payloads and reject malformed hints.
- Modify: `desktop/main.js`
  - Route supported bridge hints into `emitActiveCharacterHint(...)` while keeping diagnostics-only messages side-effect free.
- Modify: `desktop/tests/main-settings.test.js`
  - Verify hint payloads flow through the bridge path and unsupported payloads do not mutate state.
- Modify: `desktop/README.md`
  - Document the active-hint validation flow for `PoE1 + PoE2`.

## Task 1: Add the Bridge-Side Hint Contract

**Files:**
- Create: `desktop/native-bridge/Contracts/ActiveCharacterHint.cs`

- [ ] **Step 1: Write the failing build step**

Reference the missing contract from `Program.cs` first:

```csharp
ActiveCharacterHint.Create(...);
```

Run: `dotnet build desktop/native-bridge/JuiceJournal.NativeBridge.csproj`

Expected: FAIL because `ActiveCharacterHint` does not exist

- [ ] **Step 2: Create the minimal hint contract**

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

namespace JuiceJournal.NativeBridge.Contracts;

public sealed record ActiveCharacterHint(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("poeVersion")] string PoeVersion,
    [property: JsonPropertyName("characterName")] string CharacterName,
    [property: JsonPropertyName("className")] string? ClassName,
    [property: JsonPropertyName("level")] int? Level,
    [property: JsonPropertyName("confidence")] string Confidence,
    [property: JsonPropertyName("source")] string Source,
    [property: JsonPropertyName("detectedAt")] DateTimeOffset DetectedAt)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public static ActiveCharacterHint Create(
        string poeVersion,
        string characterName,
        string? className = null,
        int? level = null) =>
        new(
            "active-character-hint",
            poeVersion,
            characterName,
            className,
            level,
            "high",
            "local-native-bridge",
            DateTimeOffset.UtcNow);

    public string ToJson() => JsonSerializer.Serialize(this, JsonOptions);
}
```

- [ ] **Step 3: Run build to verify it passes**

Run: `dotnet build desktop/native-bridge/JuiceJournal.NativeBridge.csproj`

Expected: BUILD SUCCEEDED

- [ ] **Step 4: Commit**

```bash
git add desktop/native-bridge/Contracts/ActiveCharacterHint.cs
git commit -m "feat: add native bridge active hint contract"
```

## Task 2: Add a High-Confidence Hint Resolver

**Files:**
- Create: `desktop/native-bridge/Services/HintResolver.cs`
- Modify: `desktop/native-bridge/Program.cs`

- [ ] **Step 1: Write the failing build step by referencing `HintResolver`**

Add this temporary usage in `Program.cs`:

```csharp
var resolver = new HintResolver();
var hint = resolver.Resolve(...);
```

Run: `dotnet build desktop/native-bridge/JuiceJournal.NativeBridge.csproj`

Expected: FAIL because `HintResolver` does not exist

- [ ] **Step 2: Create the minimal resolver**

```csharp
using JuiceJournal.NativeBridge.Contracts;

namespace JuiceJournal.NativeBridge.Services;

public sealed class HintResolver
{
    public ActiveCharacterHint? Resolve(
        string poeVersion,
        IReadOnlyDictionary<string, object?> processProbe,
        IReadOnlyDictionary<string, object?> transitionProbe,
        IReadOnlyDictionary<string, object?>? accountHint = null)
    {
        if (string.IsNullOrWhiteSpace(poeVersion))
        {
            return null;
        }

        if (accountHint is null)
        {
            return null;
        }

        if (accountHint.TryGetValue("characterName", out var characterName)
            && characterName is string name
            && !string.IsNullOrWhiteSpace(name))
        {
            accountHint.TryGetValue("className", out var className);
            accountHint.TryGetValue("level", out var level);

            return ActiveCharacterHint.Create(
                poeVersion,
                name.Trim(),
                className as string,
                level as int?);
        }

        return null;
    }
}
```

- [ ] **Step 3: Update `Program.cs` to emit a synthetic hint only when the resolver returns one**

```csharp
var hintResolver = new HintResolver();

var hint = hintResolver.Resolve(
    poeVersion: "poe2",
    processProbe: TransitionProbe.CreateProcessProbeData(transitionSnapshot),
    transitionProbe: TransitionProbe.CreateTransitionProbeData(transitionSnapshot),
    accountHint: null);

if (hint is not null)
{
    Console.WriteLine(hint.ToJson());
}
```

Keep this first pass conservative:

- no account hint yet
- resolver should therefore emit nothing in live runs

- [ ] **Step 4: Run build and bridge**

Run:

```bash
dotnet build desktop/native-bridge/JuiceJournal.NativeBridge.csproj
dotnet run --project desktop/native-bridge/JuiceJournal.NativeBridge.csproj
```

Expected:

- build succeeds
- bridge still emits diagnostics only
- no `active-character-hint` yet

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/HintResolver.cs desktop/native-bridge/Program.cs
git commit -m "feat: add native bridge hint resolver"
```

## Task 3: Extend Desktop Parsing for Hint Payloads

**Files:**
- Modify: `desktop/src/modules/nativeBridgeModel.js`
- Modify: `desktop/tests/native-bridge-model.test.js`

- [ ] **Step 1: Write the failing hint parsing test**

```js
test('parseNativeBridgeLine returns a supported active-character-hint payload', () => {
  const payload = parseNativeBridgeLine(
    '{"type":"active-character-hint","poeVersion":"poe2","characterName":"KELLEE","confidence":"high","source":"local-native-bridge","detectedAt":"2026-04-15T12:00:00.000Z"}'
  );

  assert.deepEqual(payload, {
    type: 'active-character-hint',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    confidence: 'high',
    source: 'local-native-bridge',
    detectedAt: '2026-04-15T12:00:00.000Z'
  });
});
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `cd desktop && node --test tests/native-bridge-model.test.js`

Expected: FAIL because hints are not yet recognized

- [ ] **Step 3: Extend the parser minimally**

```js
function isHintPayload(payload) {
  return Boolean(payload)
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && payload.type === 'active-character-hint'
    && typeof payload.poeVersion === 'string'
    && payload.poeVersion.trim().length > 0
    && typeof payload.characterName === 'string'
    && payload.characterName.trim().length > 0
    && payload.confidence === 'high'
    && typeof payload.source === 'string'
    && payload.source.trim().length > 0
    && typeof payload.detectedAt === 'string'
    && payload.detectedAt.trim().length > 0;
}
```

Return normalized hint payloads and continue returning diagnostics unchanged.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `cd desktop && node --test tests/native-bridge-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/nativeBridgeModel.js desktop/tests/native-bridge-model.test.js
git commit -m "feat: add native bridge hint parsing"
```

## Task 4: Route Bridge Hints Through `main.js`

**Files:**
- Modify: `desktop/main.js`
- Modify: `desktop/tests/main-settings.test.js`

- [ ] **Step 1: Write the failing main-process hint routing tests**

```js
test('native bridge forwards supported active-character-hint payloads to emitActiveCharacterHint', () => {
  const hints = [];
  const context = loadFunctions([
    'emitActiveCharacterHint',
    'handleNativeBridgeSupervisorMessage'
  ], {
    deriveNativeCharacterHint(payload) {
      return payload.type === 'active-character-hint' ? payload : null;
    },
    emitActiveCharacterHint(payload) {
      hints.push(payload);
    }
  });

  const result = context.handleNativeBridgeSupervisorMessage({
    type: 'active-character-hint',
    poeVersion: 'poe2',
    characterName: 'KELLEE',
    confidence: 'high',
    source: 'local-native-bridge',
    detectedAt: '2026-04-15T12:00:00.000Z'
  });

  assert.equal(result, true);
  assert.equal(hints.length, 1);
});
```

- [ ] **Step 2: Run targeted tests to verify they fail**

Run: `cd desktop && node --test tests/main-settings.test.js --test-name-pattern "active-character-hint|native bridge"`

Expected: FAIL until hint routing is added

- [ ] **Step 3: Implement the minimal routing**

In `main.js`:

- keep diagnostics-only payloads side-effect free
- allow supported `active-character-hint` payloads through `deriveNativeCharacterHint(...)`
- call `emitActiveCharacterHint(...)` only for valid high-confidence hints

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `cd desktop && node --test tests/main-settings.test.js --test-name-pattern "active-character-hint|native bridge"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/main.js desktop/tests/main-settings.test.js
git commit -m "feat: route native bridge hints through main process"
```

## Task 5: Document Active-Hint Validation

**Files:**
- Modify: `desktop/README.md`

- [ ] **Step 1: Add the active-hint validation section**

```md
## Active Hint Validation

Current bridge phase supports:
- diagnostics
- high-confidence hint transport

Validation flow:
1. start desktop app
2. start PoE1 or PoE2
3. verify diagnostics still appear
4. verify only supported `active-character-hint` payloads mutate the card
5. verify unsupported diagnostics do not change the card
```

- [ ] **Step 2: Run bridge and desktop verification commands**

Run:

```bash
cd desktop && npm run bridge:build
cd desktop && node --test tests/native-bridge-model.test.js tests/native-bridge-supervisor.test.js tests/main-settings.test.js
cd desktop && node --test tests/*.test.js
```

Expected:

- bridge builds
- targeted tests pass
- full desktop suite passes

- [ ] **Step 3: Commit**

```bash
git add desktop/README.md
git commit -m "docs: add active hint validation notes"
```

## Self-Review

- Spec coverage:
  - bridge-side hint contract: Task 1
  - conservative hint resolver: Task 2
  - desktop hint parsing: Task 3
  - main-process hint routing: Task 4
  - validation docs: Task 5
- Placeholder scan:
  - No `TODO`, `TBD`, or vague placeholders remain.
- Type consistency:
  - `ActiveCharacterHint`, `HintResolver`, `parseNativeBridgeLine`, and `handleNativeBridgeSupervisorMessage` are named consistently across tasks.
