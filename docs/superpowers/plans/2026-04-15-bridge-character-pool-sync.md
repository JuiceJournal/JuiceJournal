# Bridge Character Pool Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full-snapshot character-pool synchronization from Electron main into the `.NET 10` local native bridge so bridge-side hint resolution can match native signals against the current `PoE1 + PoE2` account character pool.

**Architecture:** Extend the bridge from a pure stdout diagnostic emitter into a bidirectional local process: Electron main keeps reading stdout, while writing full `set-character-pool` snapshots over stdin as NDJSON commands. The bridge keeps an in-memory pool, validates and replaces it atomically, and lets the existing `HintResolver` use that pool for future high-confidence matching without changing current diagnostics-only behavior until routing is explicitly enabled.

**Tech Stack:** `.NET 10`, Electron main process, Node test runner, NDJSON over stdin/stdout

---

## File Structure

- Create: `desktop/native-bridge/Contracts/BridgeCommand.cs`
  - Bridge-side stdin command DTOs for `set-character-pool`.
- Create: `desktop/native-bridge/Contracts/BridgeCharacterPoolEntry.cs`
  - Bridge-side model for synchronized character entries.
- Create: `desktop/native-bridge/Services/BridgeCommandReader.cs`
  - Read stdin NDJSON and parse supported commands.
- Modify: `desktop/native-bridge/Services/HintResolver.cs`
  - Accept synchronized pool context and stay version-scoped.
- Modify: `desktop/native-bridge/Program.cs`
  - Read stdin commands, replace the in-memory pool, and keep diagnostics/hints fail-closed.
- Create: `desktop/src/modules/nativeBridgeCommandModel.js`
  - Build and validate `set-character-pool` NDJSON payloads on the desktop side.
- Create: `desktop/tests/native-bridge-command-model.test.js`
  - Focused tests for snapshot serialization and validation.
- Modify: `desktop/src/modules/nativeBridgeSupervisor.js`
  - Add stdin write support for commands while keeping stdout parsing intact.
- Modify: `desktop/tests/native-bridge-supervisor.test.js`
  - Add tests for stdin writes and unsupported command handling.
- Modify: `desktop/main.js`
  - Build character-pool snapshots from account state and send them to the bridge after login/current-user refresh.
- Modify: `desktop/tests/main-settings.test.js`
  - Verify pool sync points and no duplicate stdin writes on unchanged state.
- Modify: `desktop/README.md`
  - Document the character-pool sync workflow and validation commands.

## Task 1: Add Bridge-Side Stdin Command Contracts

**Files:**
- Create: `desktop/native-bridge/Contracts/BridgeCommand.cs`
- Create: `desktop/native-bridge/Contracts/BridgeCharacterPoolEntry.cs`

- [ ] **Step 1: Write the failing build step**

Reference the missing types from `Program.cs` first:

```csharp
BridgeCommand.Parse(...);
```

Run: `dotnet build desktop/native-bridge/JuiceJournal.NativeBridge.csproj`

Expected: FAIL because the contract types do not exist

- [ ] **Step 2: Create the bridge character entry contract**

```csharp
using System.Text.Json.Serialization;

namespace JuiceJournal.NativeBridge.Contracts;

public sealed record BridgeCharacterPoolEntry(
    [property: JsonPropertyName("poeVersion")] string PoeVersion,
    [property: JsonPropertyName("characterId")] string CharacterId,
    [property: JsonPropertyName("characterName")] string CharacterName,
    [property: JsonPropertyName("className")] string? ClassName,
    [property: JsonPropertyName("ascendancy")] string? Ascendancy,
    [property: JsonPropertyName("level")] int? Level,
    [property: JsonPropertyName("league")] string? League);
```

- [ ] **Step 3: Create the bridge command contract**

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

namespace JuiceJournal.NativeBridge.Contracts;

public sealed record BridgeCommand(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("detectedAt")] DateTimeOffset? DetectedAt,
    [property: JsonPropertyName("characters")] IReadOnlyList<BridgeCharacterPoolEntry>? Characters)
{
    public static BridgeCommand? Parse(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return null;
        }

        try
        {
          var command = JsonSerializer.Deserialize<BridgeCommand>(line);
          return command?.Type == "set-character-pool" ? command : null;
        }
        catch
        {
          return null;
        }
    }
}
```

- [ ] **Step 4: Run build to verify it passes**

Run: `dotnet build desktop/native-bridge/JuiceJournal.NativeBridge.csproj`

Expected: BUILD SUCCEEDED

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Contracts/BridgeCommand.cs desktop/native-bridge/Contracts/BridgeCharacterPoolEntry.cs
git commit -m "feat: add native bridge stdin command contracts"
```

## Task 2: Add Bridge-Side Stdin Reader and Pool Replace

**Files:**
- Create: `desktop/native-bridge/Services/BridgeCommandReader.cs`
- Modify: `desktop/native-bridge/Program.cs`

- [ ] **Step 1: Write the failing build step**

Reference the missing reader in `Program.cs`:

```csharp
var commandReader = new BridgeCommandReader();
```

Run: `dotnet build desktop/native-bridge/JuiceJournal.NativeBridge.csproj`

Expected: FAIL because `BridgeCommandReader` does not exist

- [ ] **Step 2: Create the minimal stdin reader**

```csharp
using JuiceJournal.NativeBridge.Contracts;

namespace JuiceJournal.NativeBridge.Services;

public sealed class BridgeCommandReader
{
    public async Task<BridgeCommand?> ReadOneAsync(TextReader input, CancellationToken cancellationToken = default)
    {
        var line = await input.ReadLineAsync(cancellationToken);
        return line is null ? null : BridgeCommand.Parse(line);
    }
}
```

- [ ] **Step 3: Update `Program.cs` with full-snapshot replace**

Add minimal in-memory pool:

```csharp
var characterPool = Array.Empty<BridgeCharacterPoolEntry>();
var commandReader = new BridgeCommandReader();
var command = await commandReader.ReadOneAsync(Console.In);

if (command?.Characters is not null)
{
    characterPool = command.Characters.ToArray();
    Console.WriteLine(
        BridgeMessage.Diagnostic(
            "info",
            "character-pool-replaced",
            new Dictionary<string, object?>
            {
                ["characterCount"] = characterPool.Length
            }).ToJson());
}
```

For this step, keep the command read one-shot and diagnostics-only.

- [ ] **Step 4: Run build and bridge manually with one stdin command**

Run:

```bash
dotnet build desktop/native-bridge/JuiceJournal.NativeBridge.csproj
echo {"type":"set-character-pool","characters":[]} | dotnet run --project desktop/native-bridge/JuiceJournal.NativeBridge.csproj
```

Expected:

- build succeeds
- stdout includes `character-pool-replaced`

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/BridgeCommandReader.cs desktop/native-bridge/Program.cs
git commit -m "feat: add native bridge character pool replace flow"
```

## Task 3: Add Desktop Character Pool Command Model

**Files:**
- Create: `desktop/src/modules/nativeBridgeCommandModel.js`
- Create: `desktop/tests/native-bridge-command-model.test.js`

- [ ] **Step 1: Write the failing command-model tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCharacterPoolCommand
} = require('../src/modules/nativeBridgeCommandModel');

test('buildCharacterPoolCommand serializes a full snapshot replace command', () => {
  const command = buildCharacterPoolCommand([
    {
      poeVersion: 'poe2',
      characterId: 'poe2-kellee',
      characterName: 'KELLEE',
      className: 'Monk2',
      ascendancy: 'Invoker',
      level: 92,
      league: 'Standard'
    }
  ]);

  assert.equal(command.type, 'set-character-pool');
  assert.equal(command.characters.length, 1);
});
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `cd desktop && node --test tests/native-bridge-command-model.test.js`

Expected: FAIL with missing module

- [ ] **Step 3: Implement the minimal builder**

```js
function buildCharacterPoolCommand(characters = []) {
  return {
    type: 'set-character-pool',
    detectedAt: new Date().toISOString(),
    characters: Array.isArray(characters) ? characters : []
  };
}

module.exports = {
  buildCharacterPoolCommand
};
```

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `cd desktop && node --test tests/native-bridge-command-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/nativeBridgeCommandModel.js desktop/tests/native-bridge-command-model.test.js
git commit -m "feat: add native bridge command model"
```

## Task 4: Add Stdin Command Writes in the Supervisor

**Files:**
- Modify: `desktop/src/modules/nativeBridgeSupervisor.js`
- Modify: `desktop/tests/native-bridge-supervisor.test.js`

- [ ] **Step 1: Write the failing supervisor command-write tests**

```js
test('supervisor writes set-character-pool commands to stdin', () => {
  const writes = [];
  const child = createFakeBridgeProcess();
  child.stdin = {
    write(value) {
      writes.push(value);
      return true;
    }
  };

  const supervisor = createNativeBridgeSupervisor({
    spawnBridge() {
      return child;
    }
  });

  supervisor.start();
  supervisor.send({ type: 'set-character-pool', characters: [] });

  assert.equal(writes.length, 1);
});
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `cd desktop && node --test tests/native-bridge-supervisor.test.js`

Expected: FAIL until `send()` exists

- [ ] **Step 3: Implement the minimal `send()` path**

```js
function send(command) {
  if (!activeBridge || !activeBridge.child?.stdin || typeof command !== 'object' || !command) {
    return false;
  }

  const line = `${JSON.stringify(command)}\n`;
  try {
    return activeBridge.child.stdin.write(line) !== false;
  } catch (error) {
    emitError(error);
    return false;
  }
}
```

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `cd desktop && node --test tests/native-bridge-supervisor.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/nativeBridgeSupervisor.js desktop/tests/native-bridge-supervisor.test.js
git commit -m "feat: add native bridge stdin command writes"
```

## Task 5: Sync Character Pool From `main.js`

**Files:**
- Modify: `desktop/main.js`
- Modify: `desktop/tests/main-settings.test.js`

- [ ] **Step 1: Write the failing main-process sync tests**

```js
test('main sends a full character pool snapshot to the bridge after get-current-user', async () => {
  const commands = [];
  const context = loadFunctions([
    'buildNativeBridgeCharacterPool',
    'syncNativeBridgeCharacterPool'
  ], {
    nativeBridgeSupervisor: {
      send(command) {
        commands.push(command);
        return true;
      }
    }
  });

  context.syncNativeBridgeCharacterPool({
    user: {
      characters: [
        {
          poeVersion: 'poe2',
          id: 'poe2-kellee',
          name: 'KELLEE',
          class: 'Monk2',
          ascendancy: 'Invoker',
          level: 92,
          league: 'Standard'
        }
      ]
    }
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0].type, 'set-character-pool');
});
```

- [ ] **Step 2: Run targeted main tests to verify they fail**

Run: `cd desktop && node --test tests/main-settings.test.js --test-name-pattern "character pool|native bridge"`

Expected: FAIL until sync wiring exists

- [ ] **Step 3: Implement the minimal pool sync**

In `main.js`:

- add `buildNativeBridgeCharacterPool(user)`
- add `syncNativeBridgeCharacterPool(currentUserPayload)`
- call it after successful `get-current-user`
- call it after login/bootstrap points where user payload already exists
- keep full snapshot replace only

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `cd desktop && node --test tests/main-settings.test.js --test-name-pattern "character pool|native bridge"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/main.js desktop/tests/main-settings.test.js
git commit -m "feat: sync character pool into native bridge"
```

## Self-Review

- Spec coverage:
  - stdin command contract: Tasks 1 and 2
  - full snapshot replace: Tasks 2 and 5
  - desktop command builder: Task 3
  - supervisor stdin writes: Task 4
  - version-scoped pool sync: Task 5
- Placeholder scan:
  - No `TODO`, `TBD`, or vague placeholders remain.
- Type consistency:
  - `BridgeCommand`, `BridgeCharacterPoolEntry`, `BridgeCommandReader`, `buildCharacterPoolCommand`, and `syncNativeBridgeCharacterPool` are named consistently across tasks.
