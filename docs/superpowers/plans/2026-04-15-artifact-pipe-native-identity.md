# Artifact Pipe Native Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Probe Windows named pipes and local artifact surfaces for `PoE1 + PoE2` identity-bearing signals, then promote a real `active-character-hint` only if one of those low-risk native sources yields exact character evidence.

**Architecture:** Keep the existing bridge lifecycle, `characterPool`, `process-tree-probe`, and strict native-backed resolver. Add two new narrow probes: `NamedPipeProbe` for low-risk IPC name discovery and `ArtifactProbe` for local file/directory snapshots around known PoE roots. Extend the existing `IdentityProbeCoordinator` to look for exact character-name matches in those probe payloads. If they still do not produce identity, the bridge must emit diagnostics and reject promotion rather than guessing.

**Tech Stack:** `.NET 10`, Electron main process, xUnit, Node test runner, NDJSON over stdin/stdout

---

## File Structure

- Create: `desktop/native-bridge/Services/NamedPipeProbe.cs`
  - Enumerate Windows named pipes through an injectable provider and normalize candidate pipe names.
- Create: `desktop/native-bridge/Services/ArtifactProbe.cs`
  - Snapshot local files/directories through injectable root resolvers and normalize candidate artifact paths.
- Create: `desktop/native-bridge-tests/NamedPipeProbeTests.cs`
  - Focused unit tests for pipe filtering and normalization.
- Create: `desktop/native-bridge-tests/ArtifactProbeTests.cs`
  - Focused unit tests for artifact filtering and normalization.
- Modify: `desktop/native-bridge/Services/IdentityProbeCoordinator.cs`
  - Accept named-pipe and artifact payloads in addition to process-tree payloads.
- Modify: `desktop/native-bridge-tests/IdentityProbeCoordinatorTests.cs`
  - Add exact-match, ambiguity, and version-scoped tests for pipe/artifact evidence.
- Modify: `desktop/native-bridge/Program.cs`
  - Emit `named-pipe-probe` and `artifact-probe` diagnostics and wire them into hint promotion/rejection.
- Modify: `desktop/tests/native-bridge-process.test.js`
  - Verify the new diagnostics exist and unsupported evidence does not emit hints.
- Modify: `desktop/README.md`
  - Document the named-pipe/artifact validation flow and current decision boundary.

## Task 1: Add the Named Pipe Probe

**Files:**
- Create: `desktop/native-bridge/Services/NamedPipeProbe.cs`
- Create: `desktop/native-bridge-tests/NamedPipeProbeTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `desktop/native-bridge-tests/NamedPipeProbeTests.cs`:

```csharp
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class NamedPipeProbeTests
{
    [Fact]
    public void Capture_FiltersAndNormalizesCandidatePipeNames()
    {
        var probe = new NamedPipeProbe(() =>
        [
            @"\\.\pipe\steam-1245",
            @"\\.\pipe\poe2-rpc",
            @"\\.\pipe\GGGControl",
            @"\\.\pipe\unrelated"
        ]);

        var result = probe.Capture();

        Assert.Equal(2, result["candidateCount"]);
        var pipes = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["pipes"]);
        Assert.Collection(
            pipes,
            first => Assert.Equal(@"\\.\pipe\poe2-rpc", first["name"]),
            second => Assert.Equal(@"\\.\pipe\GGGControl", second["name"]));
    }

    [Fact]
    public void Capture_ReturnsEmptyPayloadWhenNoCandidatePipesExist()
    {
        var probe = new NamedPipeProbe(() => [@"\\.\pipe\steam-1245"]);

        var result = probe.Capture();

        Assert.Equal(0, result["candidateCount"]);
        var pipes = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["pipes"]);
        Assert.Empty(pipes);
    }
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter NamedPipeProbeTests`

Expected: FAIL because `NamedPipeProbe` does not exist

- [ ] **Step 3: Implement the minimal probe**

Create `desktop/native-bridge/Services/NamedPipeProbe.cs`:

```csharp
namespace JuiceJournal.NativeBridge.Services;

public sealed class NamedPipeProbe
{
    private readonly Func<IReadOnlyList<string>> listPipes;

    public NamedPipeProbe(Func<IReadOnlyList<string>>? listPipes = null)
    {
        this.listPipes = listPipes ?? ListPipesFromFilesystem;
    }

    public IReadOnlyDictionary<string, object?> Capture()
    {
        var pipes = listPipes()
            .Where(name =>
                name.Contains("poe", StringComparison.OrdinalIgnoreCase)
                || name.Contains("grinding", StringComparison.OrdinalIgnoreCase)
                || name.Contains("ggg", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(name => new Dictionary<string, object?>
            {
                ["name"] = name
            })
            .Cast<IReadOnlyDictionary<string, object?>>()
            .ToArray();

        return new Dictionary<string, object?>
        {
            ["candidateCount"] = pipes.Length,
            ["pipes"] = pipes
        };
    }

    private static IReadOnlyList<string> ListPipesFromFilesystem()
    {
        try
        {
            return Directory.GetFiles(@"\\.\pipe\").ToArray();
        }
        catch
        {
            return [];
        }
    }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter NamedPipeProbeTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/NamedPipeProbe.cs desktop/native-bridge-tests/NamedPipeProbeTests.cs
git commit -m "feat: add named pipe probe"
```

## Task 2: Add the Artifact Probe

**Files:**
- Create: `desktop/native-bridge/Services/ArtifactProbe.cs`
- Create: `desktop/native-bridge-tests/ArtifactProbeTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `desktop/native-bridge-tests/ArtifactProbeTests.cs`:

```csharp
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class ArtifactProbeTests
{
    [Fact]
    public void Capture_ReturnsCandidateArtifactsUnderConfiguredRoots()
    {
        var probe = new ArtifactProbe(
            rootsProvider: () => [@"F:\SteamLibrary\steamapps\common\Path of Exile 2", @"D:\steam"],
            entriesProvider: root => root.Contains("Path of Exile 2", StringComparison.Ordinal)
                ? [Path.Combine(root, "logs", "Client.txt"), Path.Combine(root, "production_Config.ini")]
                : [Path.Combine(root, "steamapps", "appmanifest_2694490.acf")]);

        var result = probe.Capture();

        Assert.Equal(2, result["rootCount"]);
        var artifacts = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["artifacts"]);
        Assert.Contains(artifacts, entry => (string)entry["path"]! == @"F:\SteamLibrary\steamapps\common\Path of Exile 2\logs\Client.txt");
    }
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter ArtifactProbeTests`

Expected: FAIL because `ArtifactProbe` does not exist

- [ ] **Step 3: Implement the minimal probe**

Create `desktop/native-bridge/Services/ArtifactProbe.cs`:

```csharp
namespace JuiceJournal.NativeBridge.Services;

public sealed class ArtifactProbe
{
    private readonly Func<IReadOnlyList<string>> rootsProvider;
    private readonly Func<string, IReadOnlyList<string>> entriesProvider;

    public ArtifactProbe(
        Func<IReadOnlyList<string>>? rootsProvider = null,
        Func<string, IReadOnlyList<string>>? entriesProvider = null)
    {
        this.rootsProvider = rootsProvider ?? (() => []);
        this.entriesProvider = entriesProvider ?? (_ => []);
    }

    public IReadOnlyDictionary<string, object?> Capture()
    {
        var roots = rootsProvider();
        var artifacts = roots
            .SelectMany(root => entriesProvider(root)
                .Where(path =>
                    path.Contains("Path of Exile", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("Grinding", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("ggg", StringComparison.OrdinalIgnoreCase)
                    || path.EndsWith("Client.txt", StringComparison.OrdinalIgnoreCase))
                .Select(path => new Dictionary<string, object?>
                {
                    ["root"] = root,
                    ["path"] = path
                }))
            .Cast<IReadOnlyDictionary<string, object?>>()
            .ToArray();

        return new Dictionary<string, object?>
        {
            ["rootCount"] = roots.Count,
            ["artifacts"] = artifacts
        };
    }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter ArtifactProbeTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/ArtifactProbe.cs desktop/native-bridge-tests/ArtifactProbeTests.cs
git commit -m "feat: add artifact probe"
```

## Task 3: Extend the Identity Coordinator for Pipe and Artifact Evidence

**Files:**
- Modify: `desktop/native-bridge/Services/IdentityProbeCoordinator.cs`
- Modify: `desktop/native-bridge-tests/IdentityProbeCoordinatorTests.cs`

- [ ] **Step 1: Write the failing tests first**

Append these tests:

```csharp
[Fact]
public void TryResolve_ReturnsNativeEvidence_WhenExactlyOneCharacterNameAppearsInPipeName()
{
    var coordinator = new IdentityProbeCoordinator();

    var result = coordinator.TryResolve(
        poeVersion: "poe2",
        processTreePayload: new Dictionary<string, object?>(),
        namedPipePayload: new Dictionary<string, object?>
        {
            ["pipes"] = new IReadOnlyDictionary<string, object?>[]
            {
                new Dictionary<string, object?> { ["name"] = @"\\.\pipe\ggg-KELLEE" }
            }
        },
        artifactPayload: new Dictionary<string, object?>(),
        characterPool:
        [
            new BridgeCharacterPoolEntry("poe2", "poe2-kellee", "KELLEE", "Monk2", "Invoker", 92, "Standard")
        ]);

    Assert.NotNull(result);
    Assert.Equal("pipe.name", result!.SourceField);
}

[Fact]
public void TryResolve_ReturnsNull_WhenArtifactMatchesTwoCharacters()
{
    var coordinator = new IdentityProbeCoordinator();

    var result = coordinator.TryResolve(
        poeVersion: "poe2",
        processTreePayload: new Dictionary<string, object?>(),
        namedPipePayload: new Dictionary<string, object?>(),
        artifactPayload: new Dictionary<string, object?>
        {
            ["artifacts"] = new IReadOnlyDictionary<string, object?>[]
            {
                new Dictionary<string, object?> { ["path"] = @"D:\temp\Alpha-Beta.txt" }
            }
        },
        characterPool:
        [
            new BridgeCharacterPoolEntry("poe2", "alpha", "Alpha", null, null, null, null),
            new BridgeCharacterPoolEntry("poe2", "beta", "Beta", null, null, null, null)
        ]);

    Assert.Null(result);
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter IdentityProbeCoordinatorTests`

Expected: FAIL until the coordinator accepts the new payloads

- [ ] **Step 3: Extend the coordinator minimally**

Update `desktop/native-bridge/Services/IdentityProbeCoordinator.cs`:

```csharp
public NativeIdentityEvidence? TryResolve(
    string poeVersion,
    IReadOnlyDictionary<string, object?> processTreePayload,
    IReadOnlyDictionary<string, object?>? namedPipePayload,
    IReadOnlyDictionary<string, object?>? artifactPayload,
    IReadOnlyList<BridgeCharacterPoolEntry>? characterPool)
```

Add a helper that scans arbitrary strings:

```csharp
private static NativeIdentityEvidence? TryResolveFromText(
    string normalizedVersion,
    IEnumerable<string> values,
    IReadOnlyList<BridgeCharacterPoolEntry> candidates,
    string sourceField)
{
    BridgeCharacterPoolEntry? matchedCharacter = null;

    foreach (var value in values.Where(value => !string.IsNullOrWhiteSpace(value)))
    {
        var matches = candidates
            .Where(character => value.Contains(character.CharacterName, StringComparison.OrdinalIgnoreCase))
            .ToArray();

        foreach (var match in matches)
        {
            if (matchedCharacter is null)
            {
                matchedCharacter = match;
                continue;
            }

            if (!string.Equals(matchedCharacter.CharacterId, match.CharacterId, StringComparison.Ordinal))
            {
                return null;
            }
        }
    }

    return matchedCharacter is null
        ? null
        : new NativeIdentityEvidence(normalizedVersion, matchedCharacter.CharacterName, matchedCharacter.ClassName, matchedCharacter.Level, sourceField);
}
```

Apply it in priority order:

1. process command lines
2. pipe names
3. artifact paths

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter IdentityProbeCoordinatorTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/IdentityProbeCoordinator.cs desktop/native-bridge-tests/IdentityProbeCoordinatorTests.cs
git commit -m "feat: extend native identity coordination to pipes and artifacts"
```

## Task 4: Wire the New Probe Diagnostics Into the Bridge Runtime

**Files:**
- Modify: `desktop/native-bridge/Program.cs`
- Modify: `desktop/tests/native-bridge-process.test.js`

- [ ] **Step 1: Write the failing process-level test**

Append this test:

```js
test('native bridge emits named-pipe-probe and artifact-probe diagnostics before stdin commands', async (t) => {
  const bridge = startBridgeProcess();
  t.after(async () => {
    await shutdownBridge(bridge);
  });

  const messages = await waitFor(() => {
    const seen = new Set(
      bridge.lines
        .filter((line) => line?.type === 'bridge-diagnostic')
        .map((line) => line.message)
    );

    return seen.has('named-pipe-probe') && seen.has('artifact-probe')
      ? Array.from(seen)
      : null;
  }, {
    description: 'named-pipe/artifact diagnostics'
  });

  assert.ok(messages.includes('named-pipe-probe'));
  assert.ok(messages.includes('artifact-probe'));
});
```

- [ ] **Step 2: Run the failing process tests**

Run: `cd desktop && node --test tests/native-bridge-process.test.js`

Expected: FAIL because the bridge does not yet emit these diagnostics

- [ ] **Step 3: Wire the probes minimally**

Update `desktop/native-bridge/Program.cs`:

```csharp
var namedPipeProbe = new NamedPipeProbe();
var artifactProbe = new ArtifactProbe();
```

Emit startup diagnostics:

```csharp
EmitDiagnostic("named-pipe-probe", namedPipeProbe.Capture);
EmitDiagnostic("artifact-probe", artifactProbe.Capture);
```

Use them during hint resolution:

```csharp
var namedPipeData = namedPipeProbe.Capture();
var artifactData = artifactProbe.Capture();
var nativeIdentity = identityProbeCoordinator.TryResolve(
    poeVersion: accountHint.PoeVersion,
    processTreePayload: processTreeData,
    namedPipePayload: namedPipeData,
    artifactPayload: artifactData,
    characterPool: characterPool);
```

Keep:

- `hint-resolution-promoted`
- `hint-resolution-rejected`
- no hint when native evidence is still absent

- [ ] **Step 4: Run the process-level tests**

Run: `cd desktop && node --test tests/native-bridge-process.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Program.cs desktop/tests/native-bridge-process.test.js
git commit -m "feat: wire artifact and pipe identity probes"
```

## Task 5: Update README and Re-Run Full Verification

**Files:**
- Modify: `desktop/README.md`

- [ ] **Step 1: Update the docs**

Add/update these bullets:

```md
Current bridge phase supports:
- `process-tree-probe`
- `named-pipe-probe`
- `artifact-probe`
- native-backed hint promotion only when one exact low-risk native source matches the synced pool
- no `accountHint`-only promotion
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
- all `.NET` tests pass
- targeted Node tests pass
- full desktop suite passes

- [ ] **Step 3: Commit**

```bash
git add desktop/README.md
git commit -m "docs: add artifact and pipe identity validation"
```

## Self-Review

- Spec coverage:
  - named pipe and artifact low-risk enrichment: Tasks 1 and 2
  - coordinator promotion path across the new sources: Task 3
  - runtime diagnostics and promotion/rejection wiring: Task 4
  - docs and full verification: Task 5
- Placeholder scan:
  - No `TODO`, `TBD`, or vague placeholders remain.
- Type consistency:
  - `NamedPipeProbe`, `ArtifactProbe`, `NativeIdentityEvidence`, and `IdentityProbeCoordinator.TryResolve(...)` are named consistently across the plan.
