# Memory Neighborhood Spelunking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the diagnostics-only memory spike so one explicit `run-memory-feasibility` command emits bounded region fingerprints, extracted text islands, and neighborhood summaries that can later be compared across A/A/B samples.

**Architecture:** Keep the existing `MemoryProbe`, `MemoryStringScanner`, and `MemoryFeasibilityCoordinator`, then add three narrow profilers on top of the already-read buffers: a fingerprint probe, a text-island extractor, and a neighborhood profiler. Reuse the existing explicit `run-memory-feasibility` command, but widen its diagnostics payload rather than changing any production hint path.

**Tech Stack:** `.NET 10`, xUnit, Node test runner, NDJSON over stdin/stdout

---

## File Structure

- Create: `desktop/native-bridge/Services/MemoryRegionFingerprintProbe.cs`
  - Computes stable bounded hashes for readable memory regions.
- Create: `desktop/native-bridge/Services/MemoryTextIslandExtractor.cs`
  - Extracts ASCII and UTF-16LE text islands from bounded buffers.
- Create: `desktop/native-bridge/Services/MemoryNeighborhoodProfiler.cs`
  - Builds bounded neighborhood summaries around found text islands.
- Create: `desktop/native-bridge-tests/MemoryRegionFingerprintProbeTests.cs`
  - Focused tests for stable hashes and bounded output.
- Create: `desktop/native-bridge-tests/MemoryTextIslandExtractorTests.cs`
  - Focused tests for ASCII/UTF-16 extraction and noise rejection.
- Create: `desktop/native-bridge-tests/MemoryNeighborhoodProfilerTests.cs`
  - Focused tests for neighborhood summaries around extracted islands.
- Modify: `desktop/native-bridge/Program.cs`
  - Extend `run-memory-feasibility` diagnostics with fingerprints, text islands, and neighborhoods.
- Modify: `desktop/tests/native-bridge-process.test.js`
  - Verify the expanded memory-feasibility diagnostics remain bounded and JSON-safe.
- Modify: `desktop/README.md`
  - Document the neighborhood spelunking diagnostics and validation workflow.

## Task 1: Add the Memory Region Fingerprint Probe

**Files:**
- Create: `desktop/native-bridge/Services/MemoryRegionFingerprintProbe.cs`
- Create: `desktop/native-bridge-tests/MemoryRegionFingerprintProbeTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `desktop/native-bridge-tests/MemoryRegionFingerprintProbeTests.cs`:

```csharp
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class MemoryRegionFingerprintProbeTests
{
    [Fact]
    public void Summarize_ReturnsStableSha256Fingerprints_ForBoundedWindows()
    {
        var probe = new MemoryRegionFingerprintProbe();
        var buffer = Enumerable.Repeat((byte)0x41, 256).ToArray();

        var result = probe.Summarize((nuint)0x1000, buffer);

        Assert.Equal("memory-region-fingerprint", result["kind"]);
        Assert.Equal("0x1000", result["baseAddress"]);
        Assert.Equal(256, result["bytesRead"]);
        var windows = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["windows"]);
        Assert.NotEmpty(windows);
    }

    [Fact]
    public void Summarize_BoundsTheNumberOfReportedWindows()
    {
        var probe = new MemoryRegionFingerprintProbe();
        var buffer = Enumerable.Range(0, 4096).Select(index => (byte)(index % 251)).ToArray();

        var result = probe.Summarize((nuint)0x2000, buffer);

        var windows = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["windows"]);
        Assert.True(windows.Count <= 4);
    }
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter MemoryRegionFingerprintProbeTests`

Expected: FAIL because `MemoryRegionFingerprintProbe` does not exist

- [ ] **Step 3: Implement the minimal fingerprint probe**

Create `desktop/native-bridge/Services/MemoryRegionFingerprintProbe.cs`:

```csharp
using System.Security.Cryptography;

namespace JuiceJournal.NativeBridge.Services;

public sealed class MemoryRegionFingerprintProbe
{
    private const int MaxWindows = 4;
    private const int WindowSize = 128;

    public IReadOnlyDictionary<string, object?> Summarize(nuint baseAddress, byte[] buffer)
    {
        var windows = new List<IReadOnlyDictionary<string, object?>>();
        for (var windowIndex = 0; windowIndex < MaxWindows; windowIndex += 1)
        {
            var offset = windowIndex * WindowSize;
            if (offset >= buffer.Length)
            {
                break;
            }

            var slice = buffer.Skip(offset).Take(WindowSize).ToArray();
            windows.Add(new Dictionary<string, object?>
            {
                ["offset"] = offset,
                ["sha256"] = Convert.ToHexStringLower(SHA256.HashData(slice))
            });
        }

        return new Dictionary<string, object?>
        {
            ["kind"] = "memory-region-fingerprint",
            ["baseAddress"] = $"0x{baseAddress:X}",
            ["bytesRead"] = buffer.Length,
            ["windows"] = windows
        };
    }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter MemoryRegionFingerprintProbeTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/MemoryRegionFingerprintProbe.cs desktop/native-bridge-tests/MemoryRegionFingerprintProbeTests.cs
git commit -m "feat: add memory region fingerprint probe"
```

## Task 2: Add the Memory Text Island Extractor

**Files:**
- Create: `desktop/native-bridge/Services/MemoryTextIslandExtractor.cs`
- Create: `desktop/native-bridge-tests/MemoryTextIslandExtractorTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `desktop/native-bridge-tests/MemoryTextIslandExtractorTests.cs`:

```csharp
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class MemoryTextIslandExtractorTests
{
    [Fact]
    public void Extract_ReturnsAsciiAndUtf16Islands_AboveMinimumLength()
    {
        var extractor = new MemoryTextIslandExtractor();
        var ascii = System.Text.Encoding.ASCII.GetBytes("xxxxKELLEEyyyy");
        var utf16 = System.Text.Encoding.Unicode.GetBytes("zzzzInvoker");
        var buffer = ascii.Concat([0, 0]).Concat(utf16).ToArray();

        var islands = extractor.Extract(buffer);

        Assert.Contains(islands, island => (string)island["text"]! == "KELLEE" && (string)island["encoding"]! == "ascii");
        Assert.Contains(islands, island => (string)island["text"]! == "Invoker" && (string)island["encoding"]! == "utf16le");
    }

    [Fact]
    public void Extract_IgnoresShortOrBinaryNoise()
    {
        var extractor = new MemoryTextIslandExtractor();
        var buffer = new byte[] { 0, 1, 2, 3, 4, 5, 65, 0, 66 };

        var islands = extractor.Extract(buffer);

        Assert.Empty(islands);
    }
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter MemoryTextIslandExtractorTests`

Expected: FAIL because `MemoryTextIslandExtractor` does not exist

- [ ] **Step 3: Implement the minimal extractor**

Create `desktop/native-bridge/Services/MemoryTextIslandExtractor.cs`:

```csharp
using System.Text;

namespace JuiceJournal.NativeBridge.Services;

public sealed class MemoryTextIslandExtractor
{
    private const int MinimumLength = 5;
    private const int MaxIslands = 12;

    public IReadOnlyList<IReadOnlyDictionary<string, object?>> Extract(byte[] buffer)
    {
        var islands = new List<IReadOnlyDictionary<string, object?>>();
        islands.AddRange(ExtractAscii(buffer));
        islands.AddRange(ExtractUtf16(buffer));

        return islands
            .GroupBy(island => $"{island["encoding"]}:{island["text"]}", StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .Take(MaxIslands)
            .ToArray();
    }

    private static IEnumerable<IReadOnlyDictionary<string, object?>> ExtractAscii(byte[] buffer)
    {
        var current = new List<byte>();
        var start = 0;

        for (var index = 0; index < buffer.Length; index += 1)
        {
            var value = buffer[index];
            if (value >= 32 && value <= 126)
            {
                if (current.Count == 0)
                {
                    start = index;
                }

                current.Add(value);
                continue;
            }

            if (current.Count >= MinimumLength)
            {
                yield return new Dictionary<string, object?>
                {
                    ["offset"] = start,
                    ["encoding"] = "ascii",
                    ["text"] = Encoding.ASCII.GetString(current.ToArray())
                };
            }

            current.Clear();
        }

        if (current.Count >= MinimumLength)
        {
            yield return new Dictionary<string, object?>
            {
                ["offset"] = start,
                ["encoding"] = "ascii",
                ["text"] = Encoding.ASCII.GetString(current.ToArray())
            };
        }
    }

    private static IEnumerable<IReadOnlyDictionary<string, object?>> ExtractUtf16(byte[] buffer)
    {
        for (var index = 0; index + (MinimumLength * 2) <= buffer.Length; index += 2)
        {
            var chars = new List<char>();
            var offset = index;

            while (index + 1 < buffer.Length)
            {
                var value = BitConverter.ToUInt16(buffer, index);
                if (value >= 32 && value <= 126)
                {
                    chars.Add((char)value);
                    index += 2;
                    continue;
                }

                break;
            }

            if (chars.Count >= MinimumLength)
            {
                yield return new Dictionary<string, object?>
                {
                    ["offset"] = offset,
                    ["encoding"] = "utf16le",
                    ["text"] = new string(chars.ToArray())
                };
            }
        }
    }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter MemoryTextIslandExtractorTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/MemoryTextIslandExtractor.cs desktop/native-bridge-tests/MemoryTextIslandExtractorTests.cs
git commit -m "feat: add memory text island extractor"
```

## Task 3: Add the Memory Neighborhood Profiler

**Files:**
- Create: `desktop/native-bridge/Services/MemoryNeighborhoodProfiler.cs`
- Create: `desktop/native-bridge-tests/MemoryNeighborhoodProfilerTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `desktop/native-bridge-tests/MemoryNeighborhoodProfilerTests.cs`:

```csharp
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class MemoryNeighborhoodProfilerTests
{
    [Fact]
    public void BuildProfiles_SummarizesNeighborhoodsAroundTextIslands()
    {
        var profiler = new MemoryNeighborhoodProfiler();
        var islands = new IReadOnlyDictionary<string, object?>[]
        {
            new Dictionary<string, object?>
            {
                ["offset"] = 16,
                ["encoding"] = "ascii",
                ["text"] = "KELLEE"
            }
        };

        var profiles = profiler.BuildProfiles((nuint)0x1000, islands);

        Assert.Single(profiles);
        Assert.Equal("0x1010", profiles[0]["address"]);
        Assert.Equal("KELLEE", profiles[0]["text"]);
    }
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter MemoryNeighborhoodProfilerTests`

Expected: FAIL because `MemoryNeighborhoodProfiler` does not exist

- [ ] **Step 3: Implement the minimal profiler**

Create `desktop/native-bridge/Services/MemoryNeighborhoodProfiler.cs`:

```csharp
namespace JuiceJournal.NativeBridge.Services;

public sealed class MemoryNeighborhoodProfiler
{
    public IReadOnlyList<IReadOnlyDictionary<string, object?>> BuildProfiles(
        nuint baseAddress,
        IReadOnlyList<IReadOnlyDictionary<string, object?>> islands)
    {
        return islands
            .Take(8)
            .Select(island => new Dictionary<string, object?>
            {
                ["address"] = $"0x{baseAddress + Convert.ToUInt64(island["offset"]):X}",
                ["encoding"] = island["encoding"],
                ["text"] = island["text"]
            })
            .Cast<IReadOnlyDictionary<string, object?>>()
            .ToArray();
    }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter MemoryNeighborhoodProfilerTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/MemoryNeighborhoodProfiler.cs desktop/native-bridge-tests/MemoryNeighborhoodProfilerTests.cs
git commit -m "feat: add memory neighborhood profiler"
```

## Task 4: Wire Neighborhood Diagnostics Into `run-memory-feasibility`

**Files:**
- Modify: `desktop/native-bridge/Program.cs`
- Modify: `desktop/tests/native-bridge-process.test.js`
- Modify: `desktop/README.md`

- [ ] **Step 1: Write the failing process-level test**

Append to `desktop/tests/native-bridge-process.test.js`:

```js
test('memory-feasibility diagnostics expose regions, hits, and neighborhoods when commanded', async (t) => {
  const bridge = startBridgeProcess();
  t.after(async () => {
    await shutdownBridge(bridge);
  });

  await waitFor(() => bridge.lines.some((line) => line?.message === 'window-probe'), {
    description: 'initial diagnostics'
  });

  bridge.child.stdin.write('{"type":"run-memory-feasibility","poeVersion":"poe2","targets":["KELLEE"]}\n');

  const memoryDiagnostic = await waitFor(
    () => bridge.lines.find((line) => line?.message === 'memory-feasibility-probe'),
    { description: 'memory-feasibility-probe diagnostic' }
  );

  assert.equal(Array.isArray(memoryDiagnostic.data.hits), true);
  assert.equal(Array.isArray(memoryDiagnostic.data.neighborhoods), true);
  assert.equal(typeof memoryDiagnostic.data.regionCount, 'number');
});
```

- [ ] **Step 2: Run the failing targeted tests**

Run: `cd desktop && node --test tests/native-bridge-process.test.js`

Expected: FAIL until the richer payload exists

- [ ] **Step 3: Implement the minimal wiring**

Update `desktop/native-bridge/Program.cs`:

- instantiate:
  - `MemoryRegionFingerprintProbe`
  - `MemoryTextIslandExtractor`
  - `MemoryNeighborhoodProfiler`
- inside `RunMemoryFeasibility(...)`:
  - for each scanned region, build:
    - region fingerprint summaries
    - extracted text islands
    - neighborhood profiles
  - keep them bounded:
    - max 10 hits
    - max 8 neighborhoods
    - max 8 fingerprint summaries
- extend the final diagnostic payload with:

```csharp
["fingerprints"] = fingerprints,
["neighborhoods"] = neighborhoods
```

- [ ] **Step 4: Update the README**

Add/update:

```md
Current memory feasibility spike now reports:
- readable region count
- scanned byte count
- direct string hits
- neighborhood summaries around extracted text islands
- diagnostics only, no production hint promotion
```

- [ ] **Step 5: Run the full verification set**

Run:

```bash
cd desktop && npm run bridge:build
cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj
cd desktop && node --test tests/native-bridge-command-model.test.js tests/native-bridge-process.test.js
cd desktop && node --test tests/*.test.js
```

Expected:

- bridge build passes
- `.NET` tests pass
- targeted tests pass
- full suite passes

- [ ] **Step 6: Commit**

```bash
git add desktop/native-bridge/Program.cs desktop/tests/native-bridge-process.test.js desktop/README.md
git commit -m "feat: add memory neighborhood diagnostics"
```

## Self-Review

- Spec coverage:
  - region fingerprints: Task 1
  - text island extraction: Task 2
  - neighborhood profiling: Task 3
  - diagnostics wiring and verification: Task 4
- Placeholder scan:
  - No `TODO`, `TBD`, or vague placeholders remain.
- Type consistency:
  - `MemoryRegionFingerprintProbe`, `MemoryTextIslandExtractor`, `MemoryNeighborhoodProfiler`, `fingerprints`, and `neighborhoods` stay consistent across code and tests.
