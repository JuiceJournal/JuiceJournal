# Process Tree Native Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real low-risk native identity path by enriching the bridge with process command line and ancestry data, then let the resolver emit `active-character-hint` only when that native evidence matches exactly one synced character.

**Architecture:** Extend the `.NET 10` bridge with a dedicated `ProcessTreeProbe` that captures `PathOfExile` process metadata through an injectable Windows query layer. Feed that data into a small `IdentityProbeCoordinator` which searches for exact character-name evidence inside native strings and returns a native-backed candidate. Keep `accountHint` out of the production decision path; it may remain synchronized, but hint promotion must come from native evidence plus version-scoped pool confirmation.

**Tech Stack:** `.NET 10`, Electron main process, Node test runner, xUnit, NDJSON over stdin/stdout

---

## File Structure

- Create: `desktop/native-bridge/Services/ProcessTreeProbe.cs`
  - Captures process id, parent id, executable path, process name, and command line for PoE-related processes.
- Create: `desktop/native-bridge/Contracts/NativeIdentityEvidence.cs`
  - Bridge-side DTO describing a native-backed identity candidate and the source field that produced it.
- Create: `desktop/native-bridge/Services/IdentityProbeCoordinator.cs`
  - Scans process-tree diagnostics against the synced `characterPool` and returns a single exact native-backed candidate or null.
- Modify: `desktop/native-bridge/Services/HintResolver.cs`
  - Accepts `NativeIdentityEvidence` rather than `accountHint` as the production identity source.
- Modify: `desktop/native-bridge/Program.cs`
  - Emits `process-tree-probe` diagnostics and promotes a real hint only from native-backed evidence.
- Create: `desktop/native-bridge-tests/ProcessTreeProbeTests.cs`
  - Unit tests for process-tree filtering and normalization.
- Create: `desktop/native-bridge-tests/IdentityProbeCoordinatorTests.cs`
  - Unit tests for exact-match, ambiguous-match, and cross-game rejection.
- Modify: `desktop/native-bridge-tests/HintResolverTests.cs`
  - Verifies the resolver emits only when native evidence is present.
- Modify: `desktop/tests/native-bridge-process.test.js`
  - Process-level integration coverage for `process-tree-probe` diagnostics and native-backed hint gating.
- Modify: `desktop/README.md`
  - Documents the process-tree probe and native-backed hint validation path.

## Task 1: Add the Process Tree Probe

**Files:**
- Create: `desktop/native-bridge/Services/ProcessTreeProbe.cs`

- [ ] **Step 1: Write the failing bridge test first**

Create this test skeleton in `desktop/native-bridge-tests/ProcessTreeProbeTests.cs`:

```csharp
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class ProcessTreeProbeTests
{
    [Fact]
    public void Capture_ReturnsNormalizedPoeProcesses()
    {
        var probe = new ProcessTreeProbe(() =>
        [
            new ProcessTreeProbe.ProcessRecord(
                ProcessId: 101,
                ParentProcessId: 10,
                Name: "PathOfExileSteam",
                ExecutablePath: @"F:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\PathOfExileSteam.exe",
                CommandLine: "\"PathOfExileSteam.exe\" --waitforpreload"),
            new ProcessTreeProbe.ProcessRecord(
                ProcessId: 202,
                ParentProcessId: 20,
                Name: "notepad",
                ExecutablePath: @"C:\\Windows\\System32\\notepad.exe",
                CommandLine: "notepad.exe")
        ]);

        var result = probe.Capture();

        var processes = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["processes"]);
        Assert.Single(processes);
        Assert.Equal(101, processes[0]["id"]);
        Assert.Equal(10, processes[0]["parentId"]);
        Assert.Equal("PathOfExileSteam", processes[0]["name"]);
    }
}
```

- [ ] **Step 2: Run the failing test**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter ProcessTreeProbeTests`

Expected: FAIL because `ProcessTreeProbe` does not exist

- [ ] **Step 3: Implement the minimal probe**

Create `desktop/native-bridge/Services/ProcessTreeProbe.cs`:

```csharp
using System.Management;

namespace JuiceJournal.NativeBridge.Services;

public sealed class ProcessTreeProbe
{
    public sealed record ProcessRecord(
        int ProcessId,
        int? ParentProcessId,
        string? Name,
        string? ExecutablePath,
        string? CommandLine);

    private readonly Func<IReadOnlyList<ProcessRecord>> snapshotProvider;

    public ProcessTreeProbe(Func<IReadOnlyList<ProcessRecord>>? snapshotProvider = null)
    {
        this.snapshotProvider = snapshotProvider ?? CaptureFromWmi;
    }

    public IReadOnlyDictionary<string, object?> Capture()
    {
        var processes = snapshotProvider()
            .Where(record => record.Name?.Contains("PathOfExile", StringComparison.OrdinalIgnoreCase) == true)
            .Select(record => new Dictionary<string, object?>
            {
                ["id"] = record.ProcessId,
                ["parentId"] = record.ParentProcessId,
                ["name"] = record.Name,
                ["executablePath"] = record.ExecutablePath,
                ["commandLine"] = record.CommandLine
            })
            .Cast<IReadOnlyDictionary<string, object?>>()
            .ToArray();

        return new Dictionary<string, object?>
        {
            ["poeProcessCount"] = processes.Length,
            ["processes"] = processes
        };
    }

    private static IReadOnlyList<ProcessRecord> CaptureFromWmi()
    {
        using var searcher = new ManagementObjectSearcher(
            "SELECT ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine FROM Win32_Process");

        return searcher.Get()
            .Cast<ManagementBaseObject>()
            .Select(process => new ProcessRecord(
                ProcessId: Convert.ToInt32(process["ProcessId"]),
                ParentProcessId: process["ParentProcessId"] is null ? null : Convert.ToInt32(process["ParentProcessId"]),
                Name: process["Name"]?.ToString(),
                ExecutablePath: process["ExecutablePath"]?.ToString(),
                CommandLine: process["CommandLine"]?.ToString()))
            .ToArray();
    }
}
```

Also update `desktop/native-bridge/JuiceJournal.NativeBridge.csproj`:

```xml
<ItemGroup>
  <PackageReference Include="System.Management" Version="9.0.0" />
</ItemGroup>
```

- [ ] **Step 4: Run the focused test to make it pass**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter ProcessTreeProbeTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/JuiceJournal.NativeBridge.csproj desktop/native-bridge/Services/ProcessTreeProbe.cs desktop/native-bridge-tests/ProcessTreeProbeTests.cs
git commit -m "feat: add process tree probe"
```

## Task 2: Add Native Identity Evidence Coordination

**Files:**
- Create: `desktop/native-bridge/Contracts/NativeIdentityEvidence.cs`
- Create: `desktop/native-bridge/Services/IdentityProbeCoordinator.cs`
- Create: `desktop/native-bridge-tests/IdentityProbeCoordinatorTests.cs`

- [ ] **Step 1: Write the failing coordinator tests**

Create `desktop/native-bridge-tests/IdentityProbeCoordinatorTests.cs`:

```csharp
using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class IdentityProbeCoordinatorTests
{
    [Fact]
    public void TryResolve_ReturnsNativeEvidence_WhenExactlyOneCharacterNameAppearsInCommandLine()
    {
        var coordinator = new IdentityProbeCoordinator();

        var evidence = coordinator.TryResolve(
            "poe2",
            new Dictionary<string, object?>
            {
                ["processes"] = new[]
                {
                    new Dictionary<string, object?>
                    {
                        ["commandLine"] = "\"PathOfExileSteam.exe\" --character=KELLEE"
                    }
                }
            },
            [
                new BridgeCharacterPoolEntry("poe2", "poe2-kellee", "KELLEE", "Monk2", "Invoker", 92, "Standard"),
                new BridgeCharacterPoolEntry("poe2", "poe2-koca", "KocaAyVeMasha", "Druid2", "Shaman", 96, "Fate of the Vaal")
            ]);

        Assert.NotNull(evidence);
        Assert.Equal("KELLEE", evidence!.CharacterName);
        Assert.Equal("process.commandLine", evidence.SourceField);
    }
}
```

- [ ] **Step 2: Run the failing test**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter IdentityProbeCoordinatorTests`

Expected: FAIL because the coordinator does not exist

- [ ] **Step 3: Implement the minimal native evidence path**

Create `desktop/native-bridge/Contracts/NativeIdentityEvidence.cs`:

```csharp
namespace JuiceJournal.NativeBridge.Contracts;

public sealed record NativeIdentityEvidence(
    string PoeVersion,
    string CharacterName,
    string? ClassName,
    int? Level,
    string SourceField);
```

Create `desktop/native-bridge/Services/IdentityProbeCoordinator.cs`:

```csharp
using JuiceJournal.NativeBridge.Contracts;

namespace JuiceJournal.NativeBridge.Services;

public sealed class IdentityProbeCoordinator
{
    public NativeIdentityEvidence? TryResolve(
        string poeVersion,
        IReadOnlyDictionary<string, object?> processTreeProbe,
        IReadOnlyList<BridgeCharacterPoolEntry> characterPool)
    {
        var normalizedVersion = poeVersion?.Trim().ToLowerInvariant();
        if (normalizedVersion is not ("poe1" or "poe2"))
        {
            return null;
        }

        if (!processTreeProbe.TryGetValue("processes", out var processesValue)
            || processesValue is not IEnumerable<IReadOnlyDictionary<string, object?>> processes)
        {
            return null;
        }

        var candidates = characterPool
            .Where(character => string.Equals(character.PoeVersion, normalizedVersion, StringComparison.OrdinalIgnoreCase))
            .ToArray();

        foreach (var process in processes)
        {
            var commandLine = process.TryGetValue("commandLine", out var commandLineValue)
                ? commandLineValue as string
                : null;

            if (string.IsNullOrWhiteSpace(commandLine))
            {
                continue;
            }

            var matches = candidates
                .Where(character => commandLine.Contains(character.CharacterName, StringComparison.OrdinalIgnoreCase))
                .ToArray();

            if (matches.Length == 1)
            {
                return new NativeIdentityEvidence(
                    normalizedVersion,
                    matches[0].CharacterName,
                    matches[0].ClassName,
                    matches[0].Level,
                    "process.commandLine");
            }
        }

        return null;
    }
}
```

- [ ] **Step 4: Run the focused coordinator tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter IdentityProbeCoordinatorTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Contracts/NativeIdentityEvidence.cs desktop/native-bridge/Services/IdentityProbeCoordinator.cs desktop/native-bridge-tests/IdentityProbeCoordinatorTests.cs
git commit -m "feat: add native identity coordinator"
```

## Task 3: Make the Resolver Native-Backed

**Files:**
- Modify: `desktop/native-bridge/Services/HintResolver.cs`
- Modify: `desktop/native-bridge-tests/HintResolverTests.cs`

- [ ] **Step 1: Write the failing resolver test**

Add this test:

```csharp
[Fact]
public void Resolve_ReturnsHint_WhenNativeIdentityEvidenceMatchesExactlyOneCharacter()
{
    var resolver = new HintResolver();

    var hint = resolver.Resolve(
        poeVersion: "poe2",
        processProbe: new Dictionary<string, object?> { ["poeProcessCount"] = 1 },
        transitionProbe: new Dictionary<string, object?>(),
        characterPool:
        [
            new BridgeCharacterPoolEntry("poe2", "poe2-kellee", "KELLEE", "Monk2", "Invoker", 92, "Standard")
        ],
        nativeIdentity: new NativeIdentityEvidence("poe2", "KELLEE", "Monk2", 92, "process.commandLine"),
        accountHint: null);

    Assert.NotNull(hint);
    Assert.Equal("KELLEE", hint!.CharacterName);
}
```

- [ ] **Step 2: Run the failing resolver tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter HintResolverTests`

Expected: FAIL until `nativeIdentity` is supported

- [ ] **Step 3: Rework the resolver**

Update `desktop/native-bridge/Services/HintResolver.cs`:

```csharp
public ActiveCharacterHint? Resolve(
    string poeVersion,
    IReadOnlyDictionary<string, object?> processProbe,
    IReadOnlyDictionary<string, object?> transitionProbe,
    IReadOnlyList<BridgeCharacterPoolEntry>? characterPool = null,
    NativeIdentityEvidence? nativeIdentity = null,
    IReadOnlyDictionary<string, object?>? accountHint = null)
{
    var normalizedVersion = poeVersion?.Trim().ToLowerInvariant();
    if (normalizedVersion is not ("poe1" or "poe2"))
    {
        return null;
    }

    if (!processProbe.TryGetValue("poeProcessCount", out var poeProcessCountValue)
        || poeProcessCountValue is not int poeProcessCount
        || poeProcessCount <= 0)
    {
        return null;
    }

    if (nativeIdentity is null || characterPool is null || characterPool.Count == 0)
    {
        return null;
    }

    var matches = characterPool
        .Where(character =>
            string.Equals(character.PoeVersion, normalizedVersion, StringComparison.OrdinalIgnoreCase)
            && string.Equals(character.CharacterName, nativeIdentity.CharacterName, StringComparison.OrdinalIgnoreCase))
        .ToArray();

    if (matches.Length != 1)
    {
        return null;
    }

    return ActiveCharacterHint.Create(
        normalizedVersion,
        matches[0].CharacterName,
        matches[0].ClassName,
        matches[0].Level);
}
```

- [ ] **Step 4: Run the focused resolver tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter HintResolverTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/HintResolver.cs desktop/native-bridge-tests/HintResolverTests.cs
git commit -m "feat: make hint resolver native-backed"
```

## Task 4: Wire the Process Tree Probe Into the Bridge Runtime

**Files:**
- Modify: `desktop/native-bridge/Program.cs`
- Modify: `desktop/tests/native-bridge-process.test.js`

- [ ] **Step 1: Write the failing process-level integration test**

Add this test:

```js
test('native bridge emits process-tree-probe diagnostics before stdin commands', async (t) => {
  const bridge = startBridgeProcess();
  t.after(async () => {
    await shutdownBridge(bridge);
  });

  const processTreeDiagnostic = await waitFor(
    () => bridge.lines.find((line) => line?.message === 'process-tree-probe'),
    { description: 'process-tree-probe diagnostic' }
  );

  assert.equal(processTreeDiagnostic.type, 'bridge-diagnostic');
});
```

- [ ] **Step 2: Run the failing process tests**

Run: `cd desktop && node --test tests/native-bridge-process.test.js`

Expected: FAIL because `process-tree-probe` is not yet emitted

- [ ] **Step 3: Wire the probe and native-backed resolution**

Update `desktop/native-bridge/Program.cs`:

```csharp
var processTreeProbe = new ProcessTreeProbe();
var identityProbeCoordinator = new IdentityProbeCoordinator();
```

Inside startup diagnostics:

```csharp
var processTreeData = processTreeProbe.Capture();
Console.WriteLine(
    BridgeMessage.Diagnostic("info", "process-tree-probe", processTreeData).ToJson());
```

Inside command processing:

```csharp
var processTreeData = processTreeProbe.Capture();
var nativeIdentity = identityProbeCoordinator.TryResolve(
    accountHint?.PoeVersion ?? "poe2",
    processTreeData,
    characterPool);

var resolvedHint = hintResolver.Resolve(
    poeVersion: accountHint?.PoeVersion ?? "poe2",
    processProbe: processTreeData,
    transitionProbe: new Dictionary<string, object?>(),
    characterPool: characterPool,
    nativeIdentity: nativeIdentity,
    accountHint: null);
```

Emit:

- `process-tree-probe`
- `hint-resolution-promoted` when a hint is emitted
- `hint-resolution-rejected` when native identity is absent or ambiguous

- [ ] **Step 4: Run the process tests**

Run: `cd desktop && node --test tests/native-bridge-process.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Program.cs desktop/tests/native-bridge-process.test.js
git commit -m "feat: wire process tree native identity path"
```

## Task 5: Document and Verify the Process-Tree Path

**Files:**
- Modify: `desktop/README.md`

- [ ] **Step 1: Update the README**

Add/update these points:

```md
Current bridge phase supports:
- startup diagnostics
- `process-tree-probe`
- native-backed `active-character-hint` only when a process-tree field yields one exact character match
- no `accountHint`-only production emission
```

- [ ] **Step 2: Run the full verification set**

Run:

```bash
cd desktop && npm run bridge:build
cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj
cd desktop && node --test tests/native-bridge-command-model.test.js tests/native-bridge-process.test.js tests/main-settings.test.js
cd desktop && node --test tests/*.test.js
```

Expected:

- bridge build passes
- `.NET` tests pass
- targeted desktop tests pass
- full desktop suite passes

- [ ] **Step 3: Commit**

```bash
git add desktop/README.md
git commit -m "docs: add process tree identity validation"
```

## Self-Review

- Spec coverage:
  - process command line and ancestry enrichment: Tasks 1 and 4
  - native-backed evidence contract: Task 2
  - resolver no longer trusting `accountHint` as production source: Task 3
  - diagnostics explaining promotion/rejection: Task 4
  - docs and validation flow: Task 5
- Placeholder scan:
  - No `TODO`, `TBD`, or vague placeholders remain.
- Type consistency:
  - `ProcessTreeProbe`, `NativeIdentityEvidence`, `IdentityProbeCoordinator`, and `HintResolver.Resolve(... nativeIdentity ...)` are named consistently across tasks.
