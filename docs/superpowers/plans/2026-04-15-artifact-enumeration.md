# Artifact Enumeration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand `ArtifactProbe` from a handful of hardcoded files into a controlled recursive enumeration of likely PoE and Steam artifact directories so live diagnostics can reveal whether any identity-bearing artifact exists.

**Architecture:** Keep the existing `ArtifactRootResolver`, but replace `ArtifactProbe`’s fixed `CandidateRelativePaths` with a small directory/file walk that scans a few known roots and filters to PoE-relevant candidate names. The bridge remains diagnostics-first; no hint promotion logic changes in this phase. We only want artifact visibility to become real enough for the next live validation step.

**Tech Stack:** `.NET 10`, xUnit, Node test runner, NDJSON over stdout

---

## File Structure

- Modify: `desktop/native-bridge/Services/ArtifactProbe.cs`
  - Add recursive candidate enumeration and bounded filtering.
- Modify: `desktop/native-bridge-tests/ArtifactProbeTests.cs`
  - Cover recursive discovery, filter rules, and bounded results.
- Modify: `desktop/native-bridge/Program.cs`
  - Keep `artifact-probe` wiring explicit.
- Modify: `desktop/tests/native-bridge-process.test.js`
  - Keep artifact diagnostic shape stable after enumeration changes.
- Modify: `desktop/README.md`
  - Document recursive artifact enumeration and current limits.

## Task 1: Make ArtifactProbe Recursively Enumerate Candidate Paths

**Files:**
- Modify: `desktop/native-bridge/Services/ArtifactProbe.cs`
- Modify: `desktop/native-bridge-tests/ArtifactProbeTests.cs`

- [ ] **Step 1: Write the failing tests**

Append these tests to `desktop/native-bridge-tests/ArtifactProbeTests.cs`:

```csharp
[Fact]
public void Capture_RecursivelyKeepsOnlyRelevantArtifactCandidates()
{
    var probe = new ArtifactProbe(
        rootsProvider: () => [@"F:\SteamLibrary\steamapps\common\Path of Exile 2"],
        entriesProvider: root =>
        [
            Path.Combine(root, "logs", "Client.txt"),
            Path.Combine(root, "Config", "production_Config.ini"),
            Path.Combine(root, "Caches", "ShaderCacheD3D12", "state.cache"),
            Path.Combine(root, "Temp", "unrelated.tmp")
        ]);

    var result = probe.Capture();

    var artifacts = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["artifacts"]);
    Assert.Contains(artifacts, entry => (string)entry["path"]! == @"F:\SteamLibrary\steamapps\common\Path of Exile 2\logs\Client.txt");
    Assert.Contains(artifacts, entry => (string)entry["path"]! == @"F:\SteamLibrary\steamapps\common\Path of Exile 2\Config\production_Config.ini");
    Assert.DoesNotContain(artifacts, entry => (string)entry["path"]! == @"F:\SteamLibrary\steamapps\common\Path of Exile 2\Temp\unrelated.tmp");
}

[Fact]
public void Capture_BoundsTheArtifactListToAvoidProbeNoise()
{
    var entries = Enumerable.Range(0, 50)
        .Select(index => $@"F:\SteamLibrary\steamapps\common\Path of Exile 2\logs\Client-{index}.txt")
        .ToArray();

    var probe = new ArtifactProbe(
        rootsProvider: () => [@"F:\SteamLibrary\steamapps\common\Path of Exile 2"],
        entriesProvider: _ => entries);

    var result = probe.Capture();

    var artifacts = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["artifacts"]);
    Assert.True(artifacts.Count <= 20);
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter ArtifactProbeTests`

Expected: FAIL until the new filtering/bounding behavior exists

- [ ] **Step 3: Implement the minimal recursive filter**

Update `desktop/native-bridge/Services/ArtifactProbe.cs`:

```csharp
private const int MaxArtifacts = 20;

private static readonly string[] CandidateNameFragments =
[
    "client",
    "config",
    "production",
    "cache",
    "appmanifest",
    "path of exile",
    "poe"
];

public IReadOnlyDictionary<string, object?> Capture()
{
    var roots = rootsProvider();
    var artifacts = roots
        .SelectMany(root => entriesProvider(root)
            .Where(path => IsCandidateArtifact(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(MaxArtifacts)
            .Select(path => new Dictionary<string, object?>
            {
                ["root"] = root,
                ["path"] = path
            }))
        .Take(MaxArtifacts)
        .Cast<IReadOnlyDictionary<string, object?>>()
        .ToArray();

    return new Dictionary<string, object?>
    {
        ["rootCount"] = roots.Count,
        ["artifacts"] = artifacts
    };
}

private static bool IsCandidateArtifact(string path)
{
    if (string.IsNullOrWhiteSpace(path))
    {
        return false;
    }

    return CandidateNameFragments.Any(fragment =>
        path.Contains(fragment, StringComparison.OrdinalIgnoreCase));
}

private static IReadOnlyList<string> DefaultEntriesProvider(string root)
{
    try
    {
        if (!Directory.Exists(root))
        {
            return [];
        }

        return Directory.EnumerateFileSystemEntries(root, "*", SearchOption.AllDirectories)
            .Take(MaxArtifacts * 5)
            .ToArray();
    }
    catch
    {
        return [];
    }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter ArtifactProbeTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/ArtifactProbe.cs desktop/native-bridge-tests/ArtifactProbeTests.cs
git commit -m "feat: expand artifact probe enumeration"
```

## Task 2: Keep Runtime Artifact Diagnostics Stable

**Files:**
- Modify: `desktop/tests/native-bridge-process.test.js`

- [ ] **Step 1: Write the failing process-level test**

Append:

```js
test('native bridge artifact-probe diagnostics remain bounded after enumeration expansion', async (t) => {
  const bridge = startBridgeProcess();
  t.after(async () => {
    await shutdownBridge(bridge);
  });

  const artifactDiagnostic = await waitFor(
    () => bridge.lines.find((line) => line?.message === 'artifact-probe'),
    { description: 'artifact-probe diagnostic' }
  );

  assert.equal(artifactDiagnostic.type, 'bridge-diagnostic');
  assert.equal(Array.isArray(artifactDiagnostic.data.artifacts), true);
  assert.equal(artifactDiagnostic.data.artifacts.length <= 20, true);
});
```

- [ ] **Step 2: Run the failing process tests**

Run: `cd desktop && node --test tests/native-bridge-process.test.js`

Expected: FAIL only if artifact payload shape or bounds regress

- [ ] **Step 3: Keep the runtime wiring unchanged**

No new runtime behavior is needed beyond the improved `ArtifactProbe` implementation. Confirm `desktop/native-bridge/Program.cs` still uses:

```csharp
EmitDiagnostic("artifact-probe", artifactProbe.Capture);
```

- [ ] **Step 4: Run the focused process tests**

Run: `cd desktop && node --test tests/native-bridge-process.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/tests/native-bridge-process.test.js
git commit -m "test: bound artifact enumeration diagnostics"
```

## Task 3: Update README and Re-Run Full Verification

**Files:**
- Modify: `desktop/README.md`

- [ ] **Step 1: Update the docs**

Add/update:

```md
Current bridge phase supports:
- `artifact-probe` with bounded recursive enumeration under discovered Steam and PoE roots
- diagnostics-first validation when no identity-bearing artifact is found
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
- targeted Node tests pass
- full desktop suite passes

- [ ] **Step 3: Commit**

```bash
git add desktop/README.md
git commit -m "docs: add artifact enumeration validation"
```

## Self-Review

- Spec coverage:
  - expanded artifact visibility under real roots: Task 1
  - bounded process-level diagnostics: Task 2
  - docs and full verification: Task 3
- Placeholder scan:
  - No `TODO`, `TBD`, or vague placeholders remain.
- Type consistency:
  - `ArtifactProbe`, `artifact-probe`, and the `MaxArtifacts` bounded enumeration behavior stay consistent across the plan.
