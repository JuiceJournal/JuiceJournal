# Local Native Bridge Signal Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the `.NET 10` local native bridge from a simple process diagnostic spike into a diagnostics-first signal probe that can compare candidate native signals during `character select -> Play -> load`.

**Architecture:** Keep the bridge diagnostic-only in this phase. Add separate probe services for windows and process transitions, coordinate them in the bridge entry point, and let the existing Electron bridge supervisor consume diagnostics without mutating active character state. This phase is about evidence collection, not final hint emission.

**Tech Stack:** `.NET 10`, Electron main process, Node test runner, NDJSON over stdout

---

## File Structure

- Create: `desktop/native-bridge/Services/WindowProbe.cs`
  - Capture foreground window title/class/process context.
- Create: `desktop/native-bridge/Services/TransitionProbe.cs`
  - Capture lightweight process transition snapshots around PoE processes.
- Modify: `desktop/native-bridge/Program.cs`
  - Coordinate process, window, and transition diagnostics.
- Modify: `desktop/native-bridge/Contracts/BridgeMessage.cs`
  - Add helper factory methods for probe diagnostics when needed.
- Create: `desktop/src/modules/nativeBridgeDiagnosticModel.js`
  - Parse and normalize bridge diagnostics for desktop-side consumption.
- Create: `desktop/tests/native-bridge-diagnostic-model.test.js`
  - Focused tests for supported diagnostics vs unsupported noise.
- Modify: `desktop/main.js`
  - Consume diagnostics without turning them into character hints yet.
- Modify: `desktop/tests/main-settings.test.js`
  - Assert diagnostics are fail-closed and do not mutate active character state.
- Modify: `desktop/README.md`
  - Document the new probe phase commands and manual comparison workflow.

## Task 1: Add Foreground Window Probe

**Files:**
- Create: `desktop/native-bridge/Services/WindowProbe.cs`
- Modify: `desktop/native-bridge/Program.cs`

- [ ] **Step 1: Write the failing build step by referencing `WindowProbe`**

Add this temporary usage to `Program.cs` first:

```csharp
var windowProbe = new WindowProbe();
var windowSnapshot = windowProbe.Capture();
Console.WriteLine(BridgeMessage.Diagnostic("info", "window-probe", windowSnapshot).ToJson());
```

Run: `dotnet build desktop/native-bridge/JuiceJournal.NativeBridge.csproj`

Expected: FAIL because `WindowProbe` does not exist

- [ ] **Step 2: Create the minimal window probe**

```csharp
using System.Runtime.InteropServices;
using System.Text;

namespace JuiceJournal.NativeBridge.Services;

public sealed class WindowProbe
{
    public IReadOnlyDictionary<string, object?> Capture()
    {
        var foregroundWindow = GetForegroundWindow();
        if (foregroundWindow == IntPtr.Zero)
        {
            return new Dictionary<string, object?>
            {
                ["hasForegroundWindow"] = false
            };
        }

        var titleBuilder = new StringBuilder(512);
        _ = GetWindowText(foregroundWindow, titleBuilder, titleBuilder.Capacity);

        var classBuilder = new StringBuilder(256);
        _ = GetClassName(foregroundWindow, classBuilder, classBuilder.Capacity);

        _ = GetWindowThreadProcessId(foregroundWindow, out var processId);

        return new Dictionary<string, object?>
        {
            ["hasForegroundWindow"] = true,
            ["windowTitle"] = titleBuilder.ToString(),
            ["windowClass"] = classBuilder.ToString(),
            ["processId"] = processId
        };
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder className, int maxCount);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
```

- [ ] **Step 3: Update `Program.cs` to emit the new diagnostic**

```csharp
var processProbe = new ProcessProbe();
var windowProbe = new WindowProbe();

Console.WriteLine(
    BridgeMessage.Diagnostic("info", "process-probe", processProbe.Capture()).ToJson());

Console.WriteLine(
    BridgeMessage.Diagnostic("info", "window-probe", windowProbe.Capture()).ToJson());
```

- [ ] **Step 4: Run build and bridge**

Run:

```bash
dotnet build desktop/native-bridge/JuiceJournal.NativeBridge.csproj
dotnet run --project desktop/native-bridge/JuiceJournal.NativeBridge.csproj
```

Expected:

- build succeeds
- stdout includes both `process-probe` and `window-probe`

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/WindowProbe.cs desktop/native-bridge/Program.cs
git commit -m "feat: add native bridge window probe"
```

## Task 2: Add Process Transition Probe

**Files:**
- Create: `desktop/native-bridge/Services/TransitionProbe.cs`
- Modify: `desktop/native-bridge/Program.cs`

- [ ] **Step 1: Write the failing build step by referencing `TransitionProbe`**

Add this temporary usage in `Program.cs`:

```csharp
var transitionProbe = new TransitionProbe();
var transitionSnapshot = transitionProbe.Capture();
Console.WriteLine(BridgeMessage.Diagnostic("info", "transition-probe", transitionSnapshot).ToJson());
```

Run: `dotnet build desktop/native-bridge/JuiceJournal.NativeBridge.csproj`

Expected: FAIL because `TransitionProbe` does not exist

- [ ] **Step 2: Create the minimal transition probe**

```csharp
using System.Diagnostics;

namespace JuiceJournal.NativeBridge.Services;

public sealed class TransitionProbe
{
    public IReadOnlyDictionary<string, object?> Capture()
    {
        var poeProcesses = Process
            .GetProcesses()
            .Where(process => process.ProcessName.Contains("PathOfExile", StringComparison.OrdinalIgnoreCase))
            .Select(process => new Dictionary<string, object?>
            {
                ["name"] = process.ProcessName,
                ["id"] = process.Id,
                ["startTimeUtc"] = TryGetStartTime(process)
            })
            .Cast<IReadOnlyDictionary<string, object?>>()
            .ToArray();

        return new Dictionary<string, object?>
        {
            ["processes"] = poeProcesses
        };
    }

    private static DateTimeOffset? TryGetStartTime(Process process)
    {
        try
        {
            return process.StartTime.ToUniversalTime();
        }
        catch
        {
            return null;
        }
    }
}
```

- [ ] **Step 3: Update `Program.cs` to emit transition diagnostics**

```csharp
var transitionProbe = new TransitionProbe();

Console.WriteLine(
    BridgeMessage.Diagnostic("info", "transition-probe", transitionProbe.Capture()).ToJson());
```

- [ ] **Step 4: Run build and bridge**

Run:

```bash
dotnet build desktop/native-bridge/JuiceJournal.NativeBridge.csproj
dotnet run --project desktop/native-bridge/JuiceJournal.NativeBridge.csproj
```

Expected:

- build succeeds
- stdout includes `transition-probe`

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/TransitionProbe.cs desktop/native-bridge/Program.cs
git commit -m "feat: add native bridge transition probe"
```

## Task 3: Add Desktop Diagnostic Model

**Files:**
- Create: `desktop/src/modules/nativeBridgeDiagnosticModel.js`
- Create: `desktop/tests/native-bridge-diagnostic-model.test.js`

- [ ] **Step 1: Write the failing diagnostic model tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeNativeBridgeDiagnostic
} = require('../src/modules/nativeBridgeDiagnosticModel');

test('normalizeNativeBridgeDiagnostic accepts supported bridge diagnostics', () => {
  const payload = normalizeNativeBridgeDiagnostic({
    type: 'bridge-diagnostic',
    message: 'window-probe',
    detectedAt: '2026-04-14T12:00:00.000Z',
    data: { processId: 1234 }
  });

  assert.deepEqual(payload, {
    type: 'bridge-diagnostic',
    message: 'window-probe',
    detectedAt: '2026-04-14T12:00:00.000Z',
    data: { processId: 1234 }
  });
});

test('normalizeNativeBridgeDiagnostic rejects non-diagnostic payloads', () => {
  assert.equal(
    normalizeNativeBridgeDiagnostic({
      type: 'active-character-hint',
      detectedAt: '2026-04-14T12:00:00.000Z'
    }),
    null
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd desktop && node --test tests/native-bridge-diagnostic-model.test.js`

Expected: FAIL with missing module

- [ ] **Step 3: Implement the minimal diagnostic normalizer**

```js
function normalizeNativeBridgeDiagnostic(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  if (payload.type !== 'bridge-diagnostic' || typeof payload.detectedAt !== 'string') {
    return null;
  }

  return {
    type: payload.type,
    message: typeof payload.message === 'string' ? payload.message : '',
    detectedAt: payload.detectedAt,
    data: payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? payload.data
      : {}
  };
}

module.exports = {
  normalizeNativeBridgeDiagnostic
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd desktop && node --test tests/native-bridge-diagnostic-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/modules/nativeBridgeDiagnosticModel.js desktop/tests/native-bridge-diagnostic-model.test.js
git commit -m "feat: add native bridge diagnostic model"
```

## Task 4: Wire Diagnostics Into `desktop/main.js` Without Character Mutation

**Files:**
- Modify: `desktop/main.js`
- Modify: `desktop/tests/main-settings.test.js`

- [ ] **Step 1: Write the failing bridge-diagnostic tests**

```js
test('native bridge diagnostics do not mutate active character state', () => {
  const hints = [];
  const diagnostics = [];
  const context = loadFunctions([
    'emitActiveCharacterHint',
    'handleNativeBridgeSupervisorMessage'
  ], {
    emitActiveCharacterHint(payload) {
      hints.push(payload);
    },
    console: {
      log(...args) {
        diagnostics.push(args.join(' '));
      }
    }
  });

  context.handleNativeBridgeSupervisorMessage({
    type: 'bridge-diagnostic',
    message: 'window-probe',
    detectedAt: '2026-04-14T12:00:00.000Z',
    data: { processId: 1234 }
  });

  assert.deepEqual(hints, []);
  assert.equal(diagnostics.length > 0, true);
});
```

- [ ] **Step 2: Run targeted tests to verify they fail**

Run: `cd desktop && node --test tests/main-settings.test.js --test-name-pattern "bridge-diagnostic"`

Expected: FAIL until diagnostic handling exists

- [ ] **Step 3: Implement diagnostic-only handling**

Add in `main.js`:

- parse supported bridge diagnostics
- log them or keep them in a bounded in-memory buffer
- do not emit `active-character-hint` from diagnostic payloads

Suggested shape:

```js
const { normalizeNativeBridgeDiagnostic } = require('./src/modules/nativeBridgeDiagnosticModel');

function handleNativeBridgeSupervisorMessage(payload) {
  const diagnostic = normalizeNativeBridgeDiagnostic(payload);
  if (diagnostic) {
    console.log('[NativeBridgeDiagnostic]', JSON.stringify(diagnostic));
    return false;
  }

  const hint = deriveNativeCharacterHint(payload);
  if (!hint) {
    return false;
  }

  emitActiveCharacterHint(hint);
  return true;
}
```

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `cd desktop && node --test tests/main-settings.test.js --test-name-pattern "native bridge|bridge-diagnostic"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/main.js desktop/tests/main-settings.test.js
git commit -m "feat: add native bridge diagnostics handling"
```

## Task 5: Document Probe Workflow

**Files:**
- Modify: `desktop/README.md`

- [ ] **Step 1: Add probe workflow documentation**

```md
## Native Bridge Probe Workflow

1. `npm run bridge:build`
2. `npm run bridge:run`
3. Launch PoE2
4. Compare diagnostics for character A vs character B after pressing Play

Current expectation:
- diagnostics only
- no active-character-hint emission yet
```

- [ ] **Step 2: Run the bridge commands once**

Run:

```bash
cd desktop && npm run bridge:build
cd desktop && npm run bridge:run
```

Expected:

- build succeeds
- stdout prints `process-probe`, `window-probe`, and `transition-probe`

- [ ] **Step 3: Commit**

```bash
git add desktop/README.md
git commit -m "docs: add native bridge probe workflow"
```

## Self-Review

- Spec coverage:
  - `WindowProbe`: Task 1
  - `TransitionProbe`: Task 2
  - diagnostics-only desktop consumption: Tasks 3 and 4
  - no premature active-character emission: Task 4
  - probe workflow docs: Task 5
- Placeholder scan:
  - No `TODO`, `TBD`, or vague “handle later” steps remain.
- Type consistency:
  - `WindowProbe`, `TransitionProbe`, `normalizeNativeBridgeDiagnostic`, and `handleNativeBridgeSupervisorMessage` are named consistently across tasks.
