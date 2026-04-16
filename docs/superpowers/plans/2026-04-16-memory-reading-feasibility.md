# Memory Reading Feasibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only, diagnostics-only memory-reading feasibility spike that can scan bounded readable PoE memory regions for synced character names without changing production hint behavior.

**Architecture:** Add a narrow bridge-side memory stack: a safe region enumerator, a bounded string scanner, and a feasibility coordinator that compares string hits against the synced character pool. Trigger the spike only through an explicit stdin command, emit diagnostics only, and keep `active-character-hint` production behavior unchanged. No drivers, no injection, no writes, no background automation.

**Tech Stack:** `.NET 10`, xUnit, Node test runner, NDJSON over stdin/stdout

---

## File Structure

- Create: `desktop/native-bridge/Contracts/MemoryFeasibilityHit.cs`
  - DTO for normalized read-only memory hits.
- Create: `desktop/native-bridge/Services/MemoryProbe.cs`
  - Enumerate committed readable memory regions through an injectable process/memory provider.
- Create: `desktop/native-bridge/Services/MemoryStringScanner.cs`
  - Scan bounded memory buffers for exact target-name hits.
- Create: `desktop/native-bridge/Services/MemoryFeasibilityCoordinator.cs`
  - Classify raw string hits into direct/correlated/negative diagnostics.
- Create: `desktop/native-bridge-tests/MemoryProbeTests.cs`
  - Focused unit tests for readable-region filtering and byte caps.
- Create: `desktop/native-bridge-tests/MemoryStringScannerTests.cs`
  - Focused unit tests for string-hit scanning and noise rejection.
- Create: `desktop/native-bridge-tests/MemoryFeasibilityCoordinatorTests.cs`
  - Focused unit tests for exact-match, ambiguity, and empty-hit behavior.
- Modify: `desktop/native-bridge/Contracts/BridgeCommand.cs`
  - Accept a new `run-memory-feasibility` command with target names and `poeVersion`.
- Modify: `desktop/native-bridge/Contracts/BridgeAccountHint.cs`
  - No shape change expected; leave untouched unless required by the command parser.
- Modify: `desktop/native-bridge/Services/BridgeCommandReader.cs`
  - Continue skipping invalid lines while supporting the new command type.
- Modify: `desktop/native-bridge/Program.cs`
  - Handle the new command, run the read-only spike, and emit diagnostics only.
- Modify: `desktop/src/modules/nativeBridgeCommandModel.js`
  - Build a `run-memory-feasibility` command on the desktop side.
- Modify: `desktop/tests/native-bridge-command-model.test.js`
  - Cover the new command serialization and validation.
- Modify: `desktop/tests/native-bridge-process.test.js`
  - Verify the bridge emits memory feasibility diagnostics when explicitly commanded.
- Modify: `desktop/README.md`
  - Document the memory feasibility spike, the safety limits, and validation commands.

## Task 1: Add the Readable Memory Region Probe

**Files:**
- Create: `desktop/native-bridge/Services/MemoryProbe.cs`
- Create: `desktop/native-bridge-tests/MemoryProbeTests.cs`
- Create: `desktop/native-bridge/Contracts/MemoryFeasibilityHit.cs`

- [ ] **Step 1: Write the failing tests**

Create `desktop/native-bridge-tests/MemoryProbeTests.cs`:

```csharp
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class MemoryProbeTests
{
    [Fact]
    public void CaptureReadableRegions_FiltersToCommittedReadablePrivateMemory()
    {
        var probe = new MemoryProbe(
            regionProvider: _ =>
            [
                new MemoryProbe.MemoryRegion(0x1000, 4096, "MEM_COMMIT", "PAGE_READWRITE", "MEM_PRIVATE"),
                new MemoryProbe.MemoryRegion(0x2000, 4096, "MEM_RESERVE", "PAGE_READWRITE", "MEM_PRIVATE"),
                new MemoryProbe.MemoryRegion(0x3000, 4096, "MEM_COMMIT", "PAGE_NOACCESS", "MEM_PRIVATE")
            ],
            readProvider: (_, _) => Array.Empty<byte>());

        var regions = probe.CaptureReadableRegions(processId: 1234);

        Assert.Single(regions);
        Assert.Equal((nuint)0x1000, regions[0].BaseAddress);
        Assert.Equal((nuint)4096, regions[0].Size);
    }

    [Fact]
    public void CaptureReadableRegions_BoundsTotalBytesAcrossRegions()
    {
        var probe = new MemoryProbe(
            regionProvider: _ =>
            [
                new MemoryProbe.MemoryRegion(0x1000, 65536, "MEM_COMMIT", "PAGE_READWRITE", "MEM_PRIVATE"),
                new MemoryProbe.MemoryRegion(0x2000, 65536, "MEM_COMMIT", "PAGE_READWRITE", "MEM_PRIVATE")
            ],
            readProvider: (_, _) => Array.Empty<byte>());

        var regions = probe.CaptureReadableRegions(processId: 1234, maxTotalBytes: 65536);

        Assert.Single(regions);
    }
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter MemoryProbeTests`

Expected: FAIL because `MemoryProbe` does not exist

- [ ] **Step 3: Implement the minimal probe**

Create `desktop/native-bridge/Services/MemoryProbe.cs`:

```csharp
namespace JuiceJournal.NativeBridge.Services;

public sealed class MemoryProbe
{
    public sealed record MemoryRegion(
        nuint BaseAddress,
        nuint Size,
        string State,
        string Protect,
        string Type);

    private readonly Func<int, IReadOnlyList<MemoryRegion>> regionProvider;
    private readonly Func<nuint, int, byte[]> readProvider;

    public MemoryProbe(
        Func<int, IReadOnlyList<MemoryRegion>>? regionProvider = null,
        Func<nuint, int, byte[]>? readProvider = null)
    {
        this.regionProvider = regionProvider ?? (_ => []);
        this.readProvider = readProvider ?? ((_, _) => Array.Empty<byte>());
    }

    public IReadOnlyList<MemoryRegion> CaptureReadableRegions(int processId, nuint maxTotalBytes = 1024 * 1024)
    {
        nuint totalBytes = 0;
        var accepted = new List<MemoryRegion>();

        foreach (var region in regionProvider(processId))
        {
            if (!string.Equals(region.State, "MEM_COMMIT", StringComparison.Ordinal)
                || !string.Equals(region.Type, "MEM_PRIVATE", StringComparison.Ordinal)
                || region.Protect.Contains("NOACCESS", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (totalBytes + region.Size > maxTotalBytes)
            {
                break;
            }

            accepted.Add(region);
            totalBytes += region.Size;
        }

        return accepted;
    }
}
```

Create `desktop/native-bridge/Contracts/MemoryFeasibilityHit.cs`:

```csharp
namespace JuiceJournal.NativeBridge.Contracts;

public sealed record MemoryFeasibilityHit(
    string Target,
    nuint BaseAddress,
    int Offset,
    string Encoding,
    string Snippet);
```

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter MemoryProbeTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/MemoryProbe.cs desktop/native-bridge-tests/MemoryProbeTests.cs desktop/native-bridge/Contracts/MemoryFeasibilityHit.cs
git commit -m "feat: add memory region probe"
```

## Task 2: Add the Memory String Scanner

**Files:**
- Create: `desktop/native-bridge/Services/MemoryStringScanner.cs`
- Create: `desktop/native-bridge-tests/MemoryStringScannerTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `desktop/native-bridge-tests/MemoryStringScannerTests.cs`:

```csharp
using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class MemoryStringScannerTests
{
    [Fact]
    public void Scan_ReturnsExactUtf8HitsForTargetNames()
    {
        var scanner = new MemoryStringScanner();
        var buffer = System.Text.Encoding.UTF8.GetBytes("xxxxKELLEEyyyy");

        var hits = scanner.Scan(
            baseAddress: (nuint)0x1000,
            buffer: buffer,
            targets: ["KELLEE"]);

        Assert.Single(hits);
        Assert.Equal("KELLEE", hits[0].Target);
    }

    [Fact]
    public void Scan_ReturnsEmptyWhenNoTargetExists()
    {
        var scanner = new MemoryStringScanner();
        var buffer = System.Text.Encoding.UTF8.GetBytes("xxxxAlpha");

        var hits = scanner.Scan(
            baseAddress: (nuint)0x1000,
            buffer: buffer,
            targets: ["KELLEE"]);

        Assert.Empty(hits);
    }
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter MemoryStringScannerTests`

Expected: FAIL because `MemoryStringScanner` does not exist

- [ ] **Step 3: Implement the minimal scanner**

Create `desktop/native-bridge/Services/MemoryStringScanner.cs`:

```csharp
using System.Text;
using JuiceJournal.NativeBridge.Contracts;

namespace JuiceJournal.NativeBridge.Services;

public sealed class MemoryStringScanner
{
    public IReadOnlyList<MemoryFeasibilityHit> Scan(
        nuint baseAddress,
        byte[] buffer,
        IReadOnlyList<string> targets)
    {
        if (buffer.Length == 0 || targets.Count == 0)
        {
            return [];
        }

        var text = Encoding.UTF8.GetString(buffer);
        var hits = new List<MemoryFeasibilityHit>();

        foreach (var target in targets.Where(target => !string.IsNullOrWhiteSpace(target)))
        {
            var index = text.IndexOf(target, StringComparison.OrdinalIgnoreCase);
            if (index >= 0)
            {
                hits.Add(new MemoryFeasibilityHit(
                    Target: target,
                    BaseAddress: baseAddress,
                    Offset: index,
                    Encoding: "utf8",
                    Snippet: target));
            }
        }

        return hits;
    }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter MemoryStringScannerTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/MemoryStringScanner.cs desktop/native-bridge-tests/MemoryStringScannerTests.cs
git commit -m "feat: add memory string scanner"
```

## Task 3: Add the Memory Feasibility Coordinator

**Files:**
- Create: `desktop/native-bridge/Services/MemoryFeasibilityCoordinator.cs`
- Create: `desktop/native-bridge-tests/MemoryFeasibilityCoordinatorTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `desktop/native-bridge-tests/MemoryFeasibilityCoordinatorTests.cs`:

```csharp
using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class MemoryFeasibilityCoordinatorTests
{
    [Fact]
    public void Classify_ReturnsDirectIdentity_WhenOneHitMatchesOneCharacter()
    {
        var coordinator = new MemoryFeasibilityCoordinator();

        var result = coordinator.Classify(
            "poe2",
            [
                new MemoryFeasibilityHit("KELLEE", (nuint)0x1000, 10, "utf8", "KELLEE")
            ],
            [
                new BridgeCharacterPoolEntry("poe2", "poe2-kellee", "KELLEE", "Monk2", "Invoker", 92, "Standard")
            ]);

        Assert.NotNull(result);
        Assert.Equal("direct", result!["classification"]);
    }

    [Fact]
    public void Classify_ReturnsNull_WhenHitsMatchMultipleCharacters()
    {
        var coordinator = new MemoryFeasibilityCoordinator();

        var result = coordinator.Classify(
            "poe2",
            [
                new MemoryFeasibilityHit("Alpha", (nuint)0x1000, 10, "utf8", "Alpha"),
                new MemoryFeasibilityHit("Beta", (nuint)0x2000, 10, "utf8", "Beta")
            ],
            [
                new BridgeCharacterPoolEntry("poe2", "alpha", "Alpha", null, null, null, null),
                new BridgeCharacterPoolEntry("poe2", "beta", "Beta", null, null, null, null)
            ]);

        Assert.Null(result);
    }
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter MemoryFeasibilityCoordinatorTests`

Expected: FAIL because `MemoryFeasibilityCoordinator` does not exist

- [ ] **Step 3: Implement the minimal coordinator**

Create `desktop/native-bridge/Services/MemoryFeasibilityCoordinator.cs`:

```csharp
using JuiceJournal.NativeBridge.Contracts;

namespace JuiceJournal.NativeBridge.Services;

public sealed class MemoryFeasibilityCoordinator
{
    public IReadOnlyDictionary<string, object?>? Classify(
        string poeVersion,
        IReadOnlyList<MemoryFeasibilityHit> hits,
        IReadOnlyList<BridgeCharacterPoolEntry>? characterPool)
    {
        var normalizedVersion = poeVersion?.Trim().ToLowerInvariant();
        if (normalizedVersion is not ("poe1" or "poe2") || characterPool is null || characterPool.Count == 0)
        {
            return null;
        }

        var candidates = characterPool
            .Where(character => string.Equals(character.PoeVersion, normalizedVersion, StringComparison.OrdinalIgnoreCase))
            .ToArray();

        BridgeCharacterPoolEntry? matched = null;
        foreach (var hit in hits)
        {
            var candidate = candidates.FirstOrDefault(character =>
                string.Equals(character.CharacterName, hit.Target, StringComparison.OrdinalIgnoreCase));

            if (candidate is null)
            {
                continue;
            }

            if (matched is null)
            {
                matched = candidate;
            }
            else if (!string.Equals(matched.CharacterId, candidate.CharacterId, StringComparison.Ordinal))
            {
                return null;
            }
        }

        return matched is null
            ? null
            : new Dictionary<string, object?>
            {
                ["classification"] = "direct",
                ["characterName"] = matched.CharacterName,
                ["source"] = "memory"
            };
    }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter MemoryFeasibilityCoordinatorTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/MemoryFeasibilityCoordinator.cs desktop/native-bridge-tests/MemoryFeasibilityCoordinatorTests.cs
git commit -m "feat: add memory feasibility coordinator"
```

## Task 4: Add Explicit Memory Feasibility Command and Diagnostics

**Files:**
- Modify: `desktop/native-bridge/Contracts/BridgeCommand.cs`
- Modify: `desktop/src/modules/nativeBridgeCommandModel.js`
- Modify: `desktop/tests/native-bridge-command-model.test.js`
- Modify: `desktop/native-bridge/Program.cs`
- Modify: `desktop/tests/native-bridge-process.test.js`
- Modify: `desktop/README.md`

- [ ] **Step 1: Write the failing JS command-model test**

Append to `desktop/tests/native-bridge-command-model.test.js`:

```js
test('buildMemoryFeasibilityCommand serializes a read-only spike command', () => {
  const { buildMemoryFeasibilityCommand } = require('../src/modules/nativeBridgeCommandModel');

  const command = buildMemoryFeasibilityCommand({
    poeVersion: 'poe2',
    targets: ['KELLEE']
  });

  assert.equal(command.type, 'run-memory-feasibility');
  assert.deepEqual(command.targets, ['KELLEE']);
});
```

- [ ] **Step 2: Run the failing targeted tests**

Run:

```bash
cd desktop && node --test tests/native-bridge-command-model.test.js
```

Expected: FAIL until the command exists

- [ ] **Step 3: Implement the minimal command + runtime wiring**

Update `desktop/native-bridge/Contracts/BridgeCommand.cs` to accept:

- `type = "run-memory-feasibility"`
- `poeVersion`
- `targets`

Update `desktop/src/modules/nativeBridgeCommandModel.js`:

```js
function buildMemoryFeasibilityCommand({ poeVersion, targets = [] } = {}) {
  return {
    type: 'run-memory-feasibility',
    detectedAt: new Date().toISOString(),
    poeVersion,
    targets: Array.isArray(targets) ? targets.filter((value) => typeof value === 'string' && value.trim()) : []
  };
}
```

Update `desktop/native-bridge/Program.cs` minimally:

- accept the new command type
- do **not** emit hints
- emit a bounded `memory-feasibility-probe` diagnostic placeholder for now:

```csharp
BridgeMessage.Diagnostic(
    "info",
    "memory-feasibility-probe",
    new Dictionary<string, object?>
    {
        ["poeVersion"] = command.PoeVersion,
        ["targetCount"] = command.Targets?.Count ?? 0
    }).ToJson()
```

Update `desktop/tests/native-bridge-process.test.js` to verify the new diagnostic appears when commanded.

- [ ] **Step 4: Run the focused tests**

Run:

```bash
cd desktop && node --test tests/native-bridge-command-model.test.js tests/native-bridge-process.test.js
```

Expected: PASS

- [ ] **Step 5: Run the full verification set**

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
- targeted tests pass
- full suite passes

- [ ] **Step 6: Commit**

```bash
git add desktop/native-bridge/Contracts/BridgeCommand.cs desktop/src/modules/nativeBridgeCommandModel.js desktop/tests/native-bridge-command-model.test.js desktop/native-bridge/Program.cs desktop/tests/native-bridge-process.test.js desktop/README.md
git commit -m "feat: add memory feasibility spike command"
```

## Self-Review

- Spec coverage:
  - read-only memory region probe: Task 1
  - bounded string scanner: Task 2
  - feasibility classification: Task 3
  - explicit diagnostics-only command path: Task 4
- Placeholder scan:
  - No `TODO`, `TBD`, or vague placeholders remain.
- Type consistency:
  - `MemoryFeasibilityHit`, `MemoryProbe`, `MemoryStringScanner`, `MemoryFeasibilityCoordinator`, and `buildMemoryFeasibilityCommand` are named consistently across the plan.
