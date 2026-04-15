# Artifact Root Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ArtifactProbe` discover real PoE and Steam roots on Windows so artifact diagnostics stop returning `rootCount = 0` and become meaningful for native identity validation.

**Architecture:** Add a dedicated root resolver in the `.NET 10` bridge that finds likely Steam, PoE install, and PoE log/config roots from the local machine without requiring Electron-fed paths. Keep `ArtifactProbe` simple: it receives resolved roots, snapshots a small set of candidate files/directories, and emits diagnostics only. Do not change hint promotion rules in this phase.

**Tech Stack:** `.NET 10`, xUnit, Node test runner, NDJSON over stdout

---

## File Structure

- Create: `desktop/native-bridge/Services/ArtifactRootResolver.cs`
  - Resolve likely Steam, PoE install, and config/log roots from Windows-local sources.
- Create: `desktop/native-bridge-tests/ArtifactRootResolverTests.cs`
  - Focused tests for Steam and PoE root discovery behavior.
- Modify: `desktop/native-bridge/Services/ArtifactProbe.cs`
  - Use the resolver by default and snapshot real candidate artifact paths under the resolved roots.
- Modify: `desktop/native-bridge-tests/ArtifactProbeTests.cs`
  - Cover real root resolution flow and filtered artifact output.
- Modify: `desktop/native-bridge/Program.cs`
  - Keep emitting `artifact-probe`, but now with real root counts and candidate artifacts.
- Modify: `desktop/tests/native-bridge-process.test.js`
  - Verify startup diagnostics include `artifact-probe` and that the payload structure remains stable.
- Modify: `desktop/README.md`
  - Document the new artifact root discovery behavior and validation commands.

## Task 1: Add the Artifact Root Resolver

**Files:**
- Create: `desktop/native-bridge/Services/ArtifactRootResolver.cs`
- Create: `desktop/native-bridge-tests/ArtifactRootResolverTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `desktop/native-bridge-tests/ArtifactRootResolverTests.cs`:

```csharp
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class ArtifactRootResolverTests
{
    [Fact]
    public void Resolve_ReturnsDistinctLikelyRoots_FromKnownSteamAndPoeInputs()
    {
        var resolver = new ArtifactRootResolver(
            steamPathProvider: () => @"D:\steam\steam.exe",
            steamLibraryRootsProvider: () => [@"F:\SteamLibrary", @"D:\steam"],
            environmentFolderProvider: folder => folder switch
            {
                Environment.SpecialFolder.MyDocuments => @"C:\Users\fb_52\Documents",
                Environment.SpecialFolder.LocalApplicationData => @"C:\Users\fb_52\AppData\Local",
                _ => string.Empty
            });

        var roots = resolver.Resolve();

        Assert.Contains(@"F:\SteamLibrary\steamapps\common\Path of Exile 2", roots);
        Assert.Contains(@"C:\Users\fb_52\Documents\My Games\Path of Exile 2", roots);
        Assert.Contains(@"C:\Users\fb_52\AppData\Local\Path of Exile 2", roots);
    }

    [Fact]
    public void Resolve_FiltersBlankAndDuplicateRoots()
    {
        var resolver = new ArtifactRootResolver(
            steamPathProvider: () => @"D:\steam\steam.exe",
            steamLibraryRootsProvider: () => [@"D:\steam", @"D:\steam", ""],
            environmentFolderProvider: _ => @" ");

        var roots = resolver.Resolve();

        Assert.Equal(2, roots.Count);
        Assert.Equal(@"D:\steam", roots[0]);
        Assert.Equal(@"D:\steam\steamapps\common\Path of Exile 2", roots[1]);
    }
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter ArtifactRootResolverTests`

Expected: FAIL because `ArtifactRootResolver` does not exist

- [ ] **Step 3: Implement the minimal resolver**

Create `desktop/native-bridge/Services/ArtifactRootResolver.cs`:

```csharp
namespace JuiceJournal.NativeBridge.Services;

public sealed class ArtifactRootResolver
{
    private readonly Func<string?> steamPathProvider;
    private readonly Func<IReadOnlyList<string>> steamLibraryRootsProvider;
    private readonly Func<Environment.SpecialFolder, string> environmentFolderProvider;

    public ArtifactRootResolver(
        Func<string?>? steamPathProvider = null,
        Func<IReadOnlyList<string>>? steamLibraryRootsProvider = null,
        Func<Environment.SpecialFolder, string>? environmentFolderProvider = null)
    {
        this.steamPathProvider = steamPathProvider ?? (() => null);
        this.steamLibraryRootsProvider = steamLibraryRootsProvider ?? (() => []);
        this.environmentFolderProvider = environmentFolderProvider ?? Environment.GetFolderPath;
    }

    public IReadOnlyList<string> Resolve()
    {
        var roots = new List<string>();
        var steamPath = steamPathProvider();

        if (!string.IsNullOrWhiteSpace(steamPath))
        {
            var steamDirectory = Path.GetDirectoryName(steamPath);
            if (!string.IsNullOrWhiteSpace(steamDirectory))
            {
                roots.Add(steamDirectory);
            }
        }

        foreach (var libraryRoot in steamLibraryRootsProvider())
        {
            if (string.IsNullOrWhiteSpace(libraryRoot))
            {
                continue;
            }

            roots.Add(libraryRoot);
            roots.Add(Path.Combine(libraryRoot, "steamapps", "common", "Path of Exile 2"));
            roots.Add(Path.Combine(libraryRoot, "steamapps", "common", "Path of Exile"));
        }

        var documents = environmentFolderProvider(Environment.SpecialFolder.MyDocuments);
        if (!string.IsNullOrWhiteSpace(documents))
        {
            roots.Add(Path.Combine(documents, "My Games", "Path of Exile 2"));
            roots.Add(Path.Combine(documents, "My Games", "Path of Exile"));
        }

        var localAppData = environmentFolderProvider(Environment.SpecialFolder.LocalApplicationData);
        if (!string.IsNullOrWhiteSpace(localAppData))
        {
            roots.Add(Path.Combine(localAppData, "Path of Exile 2"));
            roots.Add(Path.Combine(localAppData, "Path of Exile"));
        }

        return roots
            .Where(root => !string.IsNullOrWhiteSpace(root))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter ArtifactRootResolverTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/ArtifactRootResolver.cs desktop/native-bridge-tests/ArtifactRootResolverTests.cs
git commit -m "feat: add artifact root resolver"
```

## Task 2: Make ArtifactProbe Use Real Root Discovery

**Files:**
- Modify: `desktop/native-bridge/Services/ArtifactProbe.cs`
- Modify: `desktop/native-bridge-tests/ArtifactProbeTests.cs`

- [ ] **Step 1: Write the failing tests**

Append this test:

```csharp
[Fact]
public void Capture_UsesResolvedRootsByDefault()
{
    var probe = new ArtifactProbe(
        rootsProvider: () => [@"F:\SteamLibrary\steamapps\common\Path of Exile 2"],
        entriesProvider: root => [Path.Combine(root, "logs", "Client.txt")]);

    var result = probe.Capture();

    Assert.Equal(1, result["rootCount"]);
    var artifacts = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["artifacts"]);
    Assert.Single(artifacts);
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter ArtifactProbeTests`

Expected: FAIL until the default constructor path is updated

- [ ] **Step 3: Update the probe**

Modify `desktop/native-bridge/Services/ArtifactProbe.cs`:

```csharp
public sealed class ArtifactProbe
{
    private static readonly string[] CandidateRelativePaths =
    [
        Path.Combine("logs", "Client.txt"),
        "production_Config.ini",
        "appmanifest_2694490.acf",
        "appmanifest_238960.acf"
    ];

    private readonly Func<IReadOnlyList<string>> rootsProvider;
    private readonly Func<string, IReadOnlyList<string>> entriesProvider;

    public ArtifactProbe(
        Func<IReadOnlyList<string>>? rootsProvider = null,
        Func<string, IReadOnlyList<string>>? entriesProvider = null)
    {
        var rootResolver = new ArtifactRootResolver();
        this.rootsProvider = rootsProvider ?? rootResolver.Resolve;
        this.entriesProvider = entriesProvider ?? DefaultEntriesProvider;
    }

    private static IReadOnlyList<string> DefaultEntriesProvider(string root)
    {
        return CandidateRelativePaths
            .Select(relativePath => Path.Combine(root, relativePath))
            .Where(File.Exists)
            .ToArray();
    }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter ArtifactProbeTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/ArtifactProbe.cs desktop/native-bridge-tests/ArtifactProbeTests.cs
git commit -m "feat: connect artifact probe to root discovery"
```

## Task 3: Keep Program Diagnostics Stable With Real Root Discovery

**Files:**
- Modify: `desktop/native-bridge/Program.cs`
- Modify: `desktop/tests/native-bridge-process.test.js`

- [ ] **Step 1: Write the failing process test**

Add this test:

```js
test('native bridge startup diagnostics still include artifact-probe after root discovery wiring', async (t) => {
  const bridge = startBridgeProcess();
  t.after(async () => {
    await shutdownBridge(bridge);
  });

  const artifactDiagnostic = await waitFor(
    () => bridge.lines.find((line) => line?.message === 'artifact-probe'),
    { description: 'artifact-probe diagnostic' }
  );

  assert.equal(artifactDiagnostic.type, 'bridge-diagnostic');
  assert.equal(typeof artifactDiagnostic.data.rootCount, 'number');
});
```

- [ ] **Step 2: Run the failing process tests**

Run: `cd desktop && node --test tests/native-bridge-process.test.js`

Expected: FAIL only if startup diagnostics regressed

- [ ] **Step 3: Keep the wiring explicit**

In `desktop/native-bridge/Program.cs`, keep:

```csharp
var artifactProbe = new ArtifactProbe();
EmitDiagnostic("artifact-probe", artifactProbe.Capture);
```

No behavior change beyond using the improved default root discovery.

- [ ] **Step 4: Run the focused process tests**

Run: `cd desktop && node --test tests/native-bridge-process.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Program.cs desktop/tests/native-bridge-process.test.js
git commit -m "test: lock artifact root discovery diagnostics"
```

## Task 4: Update README and Re-Run Full Verification

**Files:**
- Modify: `desktop/README.md`

- [ ] **Step 1: Update the docs**

Add/update:

```md
Current bridge phase supports:
- `artifact-probe` with Windows-local root discovery for Steam install, Steam library, and PoE config/log roots
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
git commit -m "docs: add artifact root discovery validation"
```

## Self-Review

- Spec coverage:
  - real root discovery for artifact probe: Tasks 1 and 2
  - stable runtime diagnostics after the new default behavior: Task 3
  - docs and full verification: Task 4
- Placeholder scan:
  - No `TODO`, `TBD`, or vague placeholders remain.
- Type consistency:
  - `ArtifactRootResolver`, `ArtifactProbe`, and the `artifact-probe` diagnostic naming stay consistent across the plan.
