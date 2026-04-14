# Local Native Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `.NET 10` Windows-native companion bridge that Juice Journal can launch locally to emit active-character diagnostics and high-confidence hints without depending on Overwolf as a product platform.

**Architecture:** Add a new `desktop/native-bridge/` .NET 10 console app that emits NDJSON over stdout, plus a desktop-side bridge supervisor in Electron main that spawns the bridge, parses lines, and forwards supported payloads into the existing `emitActiveCharacterHint(...)` path. Deliver it in phases: bridge bootstrap, process/runtime diagnostics, Electron supervision, and then synthetic end-to-end hint plumbing before any real native signal probe is attempted.

**Tech Stack:** `.NET 10`, Electron main process, Node test runner, Playwright smoke coverage, NDJSON over stdout

---

## File Structure

- Create: `desktop/native-bridge/JuiceJournal.NativeBridge.csproj`
  - New .NET 10 console app project file.
- Create: `desktop/native-bridge/Program.cs`
  - Bridge entry point and stdout NDJSON emitter.
- Create: `desktop/native-bridge/Contracts/BridgeMessage.cs`
  - Shared bridge-side DTOs for diagnostics and hints.
- Create: `desktop/native-bridge/Services/ProcessProbe.cs`
  - Detect running PoE1/PoE2 process context on Windows.
- Create: `desktop/native-bridge/Services/BridgeEmitter.cs`
  - Serialize bridge messages to stdout safely.
- Create: `desktop/src/modules/nativeBridgeModel.js`
  - Desktop-side parse/normalize logic for NDJSON bridge payloads.
- Create: `desktop/src/modules/nativeBridgeSupervisor.js`
  - Spawn/stop the bridge process and parse stdout/stderr.
- Create: `desktop/tests/native-bridge-model.test.js`
  - Unit tests for desktop-side bridge payload parsing.
- Create: `desktop/tests/native-bridge-supervisor.test.js`
  - Unit tests for spawn, stdout parsing, stderr handling, and fail-closed behavior.
- Modify: `desktop/main.js`
  - Start/stop bridge supervisor, forward bridge hints to `emitActiveCharacterHint(...)`, and keep desktop behavior fail-closed.
- Modify: `desktop/package.json`
  - Add bridge build/test scripts.
- Modify: `desktop/README.md`
  - Add bridge development and validation commands.

## Task 1: Scaffold the .NET 10 Native Bridge

**Files:**
- Create: `desktop/native-bridge/JuiceJournal.NativeBridge.csproj`
- Create: `desktop/native-bridge/Program.cs`
- Create: `desktop/native-bridge/Contracts/BridgeMessage.cs`

- [ ] **Step 1: Write the failing scaffold verification command**

Run: `dotnet build desktop/native-bridge/JuiceJournal.NativeBridge.csproj`

Expected: FAIL with `project file does not exist`

- [ ] **Step 2: Create the .NET 10 project file**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0-windows</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>
</Project>
```

- [ ] **Step 3: Add the minimal bridge entry point**

```csharp
using JuiceJournal.NativeBridge.Contracts;

var startedAt = DateTimeOffset.UtcNow;
var message = BridgeMessage.Diagnostic(
    level: "info",
    message: ".NET 10 native bridge started",
    data: new Dictionary<string, object?>
    {
        ["startedAt"] = startedAt
    });

Console.WriteLine(message.ToJson());
```

- [ ] **Step 4: Add the bridge message contract**

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

namespace JuiceJournal.NativeBridge.Contracts;

public sealed record BridgeMessage(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("level")] string? Level,
    [property: JsonPropertyName("message")] string? Message,
    [property: JsonPropertyName("detectedAt")] DateTimeOffset DetectedAt,
    [property: JsonPropertyName("data")] IReadOnlyDictionary<string, object?>? Data)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public static BridgeMessage Diagnostic(
        string level,
        string message,
        IReadOnlyDictionary<string, object?>? data = null) =>
        new("bridge-diagnostic", level, message, DateTimeOffset.UtcNow, data);

    public string ToJson() => JsonSerializer.Serialize(this, JsonOptions);
}
```

- [ ] **Step 5: Run build to verify it passes**

Run: `dotnet build desktop/native-bridge/JuiceJournal.NativeBridge.csproj`

Expected: BUILD SUCCEEDED

- [ ] **Step 6: Commit**

```bash
git add desktop/native-bridge/JuiceJournal.NativeBridge.csproj desktop/native-bridge/Program.cs desktop/native-bridge/Contracts/BridgeMessage.cs
git commit -m "feat: scaffold dotnet native bridge"
```

## Task 2: Add Windows Process Probe Diagnostics

**Files:**
- Create: `desktop/native-bridge/Services/ProcessProbe.cs`
- Modify: `desktop/native-bridge/Program.cs`

- [ ] **Step 1: Write the failing process-probe build target**

Add this usage in `Program.cs` first:

```csharp
var probe = new ProcessProbe();
var snapshot = probe.Capture();
Console.WriteLine(BridgeMessage.Diagnostic("info", "process-probe", snapshot).ToJson());
```

Run: `dotnet build desktop/native-bridge/JuiceJournal.NativeBridge.csproj`

Expected: FAIL because `ProcessProbe` does not exist

- [ ] **Step 2: Create a minimal process probe**

```csharp
using System.Diagnostics;

namespace JuiceJournal.NativeBridge.Services;

public sealed class ProcessProbe
{
    public IReadOnlyDictionary<string, object?> Capture()
    {
        var poeProcesses = Process
            .GetProcesses()
            .Where(process => process.ProcessName.Contains("PathOfExile", StringComparison.OrdinalIgnoreCase))
            .Select(process => new Dictionary<string, object?>
            {
                ["name"] = process.ProcessName,
                ["id"] = process.Id
            })
            .Cast<IReadOnlyDictionary<string, object?>>()
            .ToArray();

        return new Dictionary<string, object?>
        {
            ["poeProcessCount"] = poeProcesses.Length,
            ["processes"] = poeProcesses
        };
    }
}
```

- [ ] **Step 3: Update `Program.cs` to emit probe diagnostics**

```csharp
using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;

var probe = new ProcessProbe();
var snapshot = probe.Capture();

Console.WriteLine(
    BridgeMessage.Diagnostic(
        level: "info",
        message: "process-probe",
        data: snapshot).ToJson());
```

- [ ] **Step 4: Run the bridge directly**

Run: `dotnet run --project desktop/native-bridge/JuiceJournal.NativeBridge.csproj`

Expected: one NDJSON line with `"type":"bridge-diagnostic"` and process probe fields

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Program.cs desktop/native-bridge/Services/ProcessProbe.cs
git commit -m "feat: add native bridge process probe diagnostics"
```

## Task 3: Add Desktop-Side Bridge Payload Parsing

**Files:**
- Create: `desktop/src/modules/nativeBridgeModel.js`
- Create: `desktop/tests/native-bridge-model.test.js`

- [ ] **Step 1: Write the failing parser tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseNativeBridgeLine
} = require('../src/modules/nativeBridgeModel');

test('parseNativeBridgeLine returns null for malformed json', () => {
  assert.equal(parseNativeBridgeLine('not-json'), null);
});

test('parseNativeBridgeLine returns a diagnostic payload', () => {
  const payload = parseNativeBridgeLine('{"type":"bridge-diagnostic","level":"info","message":"ready","detectedAt":"2026-04-14T12:00:00.000Z"}');
  assert.deepEqual(payload, {
    type: 'bridge-diagnostic',
    level: 'info',
    message: 'ready',
    detectedAt: '2026-04-14T12:00:00.000Z'
  });
});

test('parseNativeBridgeLine rejects arrays and contract-invalid payloads', () => {
  assert.equal(parseNativeBridgeLine('[]'), null);
  assert.equal(parseNativeBridgeLine('{}'), null);
  assert.equal(parseNativeBridgeLine('{"type":"bridge-diagnostic"}'), null);
});
```

- [ ] **Step 2: Run the parser tests to verify they fail**

Run: `cd desktop && node --test tests/native-bridge-model.test.js`

Expected: FAIL with missing module

- [ ] **Step 3: Implement the minimal parser**

```js
function isBridgePayload(payload) {
  return Boolean(payload)
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && typeof payload.type === 'string'
    && payload.type.trim().length > 0
    && typeof payload.detectedAt === 'string'
    && payload.detectedAt.trim().length > 0;
}

function parseNativeBridgeLine(line) {
  if (typeof line !== 'string' || !line.trim()) {
    return null;
  }

  try {
    const payload = JSON.parse(line);
    return isBridgePayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

module.exports = {
  parseNativeBridgeLine
};
```

- [ ] **Step 4: Run the parser tests to verify they pass**

Run: `cd desktop && node --test tests/native-bridge-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/nativeBridgeModel.js desktop/tests/native-bridge-model.test.js
git commit -m "feat: add desktop native bridge payload parser"
```

## Task 4: Add Bridge Supervisor in Electron Main

**Files:**
- Create: `desktop/src/modules/nativeBridgeSupervisor.js`
- Create: `desktop/tests/native-bridge-supervisor.test.js`

- [ ] **Step 1: Write the failing supervisor tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { createNativeBridgeSupervisor } = require('../src/modules/nativeBridgeSupervisor');

test('supervisor spawns the bridge and parses stdout lines', async () => {
  const lines = [];
  const supervisor = createNativeBridgeSupervisor({
    spawnBridge() {
      return {
        stdout: {
          on(eventName, handler) {
            if (eventName === 'data') {
              handler(Buffer.from('{"type":"bridge-diagnostic","message":"ready"}\\n'));
            }
          }
        },
        stderr: { on() {} },
        on() {},
        kill() {}
      };
    },
    onMessage(message) {
      lines.push(message);
    }
  });

  supervisor.start();

  assert.equal(lines[0].type, 'bridge-diagnostic');
});
```

- [ ] **Step 2: Run the supervisor tests to verify they fail**

Run: `cd desktop && node --test tests/native-bridge-supervisor.test.js`

Expected: FAIL with missing module

- [ ] **Step 3: Implement the minimal supervisor**

```js
const { parseNativeBridgeLine } = require('./nativeBridgeModel');

function createNativeBridgeSupervisor({ spawnBridge, onMessage, onError = () => {} } = {}) {
  let child = null;

  function start() {
    if (child || typeof spawnBridge !== 'function') {
      return false;
    }

    child = spawnBridge();

    child.stdout?.on('data', (chunk) => {
      const lines = String(chunk || '').split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const payload = parseNativeBridgeLine(line);
        if (payload) {
          onMessage?.(payload);
        }
      }
    });

    child.stderr?.on('data', (chunk) => {
      onError?.(String(chunk || ''));
    });

    child.on?.('exit', () => {
      child = null;
    });

    return true;
  }

  function stop() {
    if (!child) {
      return false;
    }

    child.kill?.();
    child = null;
    return true;
  }

  return { start, stop };
}

module.exports = {
  createNativeBridgeSupervisor
};
```

- [ ] **Step 4: Run the supervisor tests to verify they pass**

Run: `cd desktop && node --test tests/native-bridge-supervisor.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/nativeBridgeSupervisor.js desktop/tests/native-bridge-supervisor.test.js
git commit -m "feat: add native bridge supervisor"
```

## Task 5: Wire the Bridge Supervisor Into `desktop/main.js`

**Files:**
- Modify: `desktop/main.js`
- Modify: `desktop/tests/main-settings.test.js`

- [ ] **Step 1: Write the failing main-process bridge wiring tests**

```js
test('main starts the native bridge supervisor on app startup', () => {
  const starts = [];
  const context = loadFunctions(['startNativeBridgeSupervisor'], {
    nativeBridgeSupervisor: {
      start() {
        starts.push(true);
        return true;
      }
    }
  });

  context.startNativeBridgeSupervisor();

  assert.equal(starts.length, 1);
});
```

- [ ] **Step 2: Run the targeted main-process tests**

Run: `cd desktop && node --test tests/main-settings.test.js --test-name-pattern "native bridge"`

Expected: FAIL until wiring exists

- [ ] **Step 3: Add bridge supervisor wiring in `main.js`**

Implement:

- lazy `getNativeBridgeSupervisor()`
- `startNativeBridgeSupervisor()`
- `stopNativeBridgeSupervisor()`
- bridge `onMessage` -> `emitActiveCharacterHint(...)` only for supported hint payloads
- startup invocation from `app.whenReady()`
- stop on `handleAppWillQuit()`

Keep it separate from the current `nativeGameInfoProducer` so the bridge can coexist with or replace that layer later.

- [ ] **Step 4: Run the targeted main-process tests**

Run: `cd desktop && node --test tests/main-settings.test.js --test-name-pattern "native bridge"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/main.js desktop/tests/main-settings.test.js
git commit -m "feat: wire native bridge supervisor into desktop main"
```

## Task 6: Add Bridge Build Scripts and Documentation

**Files:**
- Modify: `desktop/package.json`
- Modify: `desktop/README.md`

- [ ] **Step 1: Add bridge scripts**

```json
{
  "scripts": {
    "bridge:build": "dotnet build native-bridge/JuiceJournal.NativeBridge.csproj",
    "bridge:run": "dotnet run --project native-bridge/JuiceJournal.NativeBridge.csproj"
  }
}
```

- [ ] **Step 2: Document local bridge commands**

```md
## Native Bridge

- `npm run bridge:build`
- `npm run bridge:run`

Expected:
- stdout emits NDJSON diagnostics
- desktop can remain fail-closed if the bridge is absent
```

- [ ] **Step 3: Run combined verification**

Run:

```bash
cd desktop && npm run bridge:build
cd desktop && node --test tests/native-bridge-model.test.js tests/native-bridge-supervisor.test.js tests/main-settings.test.js
cd desktop && node --test tests/*.test.js
```

Expected:

- bridge builds successfully
- targeted bridge tests pass
- full desktop suite passes

- [ ] **Step 4: Commit**

```bash
git add desktop/package.json desktop/README.md
git commit -m "docs: add local native bridge commands"
```

## Self-Review

- Spec coverage:
  - `.NET 10` bridge scaffold: Task 1
  - process/runtime diagnostics spike: Task 2
  - stdout NDJSON contract: Tasks 1, 3, 4
  - Electron supervisor: Tasks 4 and 5
  - optional/fail-closed behavior: Tasks 3, 4, 5, 6
- Placeholder scan:
  - No `TODO`, `TBD`, or vague “handle appropriately” steps remain.
- Type consistency:
  - `BridgeMessage`, `ProcessProbe`, `createNativeBridgeSupervisor`, `startNativeBridgeSupervisor`, and `stopNativeBridgeSupervisor` are named consistently across tasks.
