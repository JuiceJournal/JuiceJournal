# Artifact Content Correlation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read bounded content and freshness metadata from discovered artifact files so the bridge can determine whether any local artifact carries character-sensitive identity for `PoE2`.

**Architecture:** Keep `ArtifactRootResolver` and recursive `ArtifactProbe`, but enrich each artifact entry with file metadata and a small preview of text content for safe text-based correlation. Extend the identity coordinator so artifact evidence can come from either path names or file previews, still under strict exact-match rules. Do not change the production gating bar: diagnostics first, no hint unless native evidence is exact.

**Tech Stack:** `.NET 10`, xUnit, Node test runner, NDJSON over stdout

---

## File Structure

- Modify: `desktop/native-bridge/Services/ArtifactProbe.cs`
  - Add bounded file metadata and text preview extraction.
- Modify: `desktop/native-bridge-tests/ArtifactProbeTests.cs`
  - Cover preview extraction, modified-time metadata, and binary-safe fail-closed behavior.
- Modify: `desktop/native-bridge/Services/IdentityProbeCoordinator.cs`
  - Allow artifact correlation from file preview text in addition to artifact path names.
- Modify: `desktop/native-bridge-tests/IdentityProbeCoordinatorTests.cs`
  - Add exact-match and ambiguity tests for artifact content evidence.
- Modify: `desktop/tests/native-bridge-process.test.js`
  - Verify artifact diagnostics still stay bounded and include the new metadata shape.
- Modify: `desktop/README.md`
  - Document artifact preview correlation and current decision boundary.

## Task 1: Enrich ArtifactProbe With File Metadata and Preview Text

**Files:**
- Modify: `desktop/native-bridge/Services/ArtifactProbe.cs`
- Modify: `desktop/native-bridge-tests/ArtifactProbeTests.cs`

- [ ] **Step 1: Write the failing tests**

Append these tests to `desktop/native-bridge-tests/ArtifactProbeTests.cs`:

```csharp
[Fact]
public void Capture_IncludesModifiedTimeAndPreviewText_ForReadableArtifacts()
{
    var probe = new ArtifactProbe(
        rootsProvider: () => [@"F:\SteamLibrary\steamapps\common\Path of Exile 2"],
        entriesProvider: _ => [@"F:\SteamLibrary\steamapps\common\Path of Exile 2\logs\Client.txt"],
        fileMetadataProvider: path => new ArtifactProbe.ArtifactFileMetadata(
            Exists: true,
            LastWriteTimeUtc: new DateTimeOffset(2026, 04, 15, 18, 00, 00, TimeSpan.Zero),
            PreviewText: "ActiveCharacter=KELLEE",
            Length: 42));

    var result = probe.Capture();
    var artifacts = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["artifacts"]);

    Assert.Equal("ActiveCharacter=KELLEE", artifacts[0]["previewText"]);
    Assert.Equal(42L, artifacts[0]["length"]);
    Assert.Equal("2026-04-15T18:00:00.0000000+00:00", artifacts[0]["lastWriteTimeUtc"]);
}

[Fact]
public void Capture_FailsClosedForUnreadableArtifactPreview()
{
    var probe = new ArtifactProbe(
        rootsProvider: () => [@"F:\SteamLibrary\steamapps\common\Path of Exile 2"],
        entriesProvider: _ => [@"F:\SteamLibrary\steamapps\common\Path of Exile 2\logs\Client.txt"],
        fileMetadataProvider: _ => throw new IOException("locked"));

    var result = probe.Capture();
    var artifacts = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["artifacts"]);

    Assert.Equal(string.Empty, artifacts[0]["previewText"]);
    Assert.Equal(null, artifacts[0]["lastWriteTimeUtc"]);
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter ArtifactProbeTests`

Expected: FAIL until preview/metadata fields exist

- [ ] **Step 3: Implement the minimal enrichment**

Update `desktop/native-bridge/Services/ArtifactProbe.cs` with:

```csharp
public sealed record ArtifactFileMetadata(
    bool Exists,
    DateTimeOffset? LastWriteTimeUtc,
    string PreviewText,
    long? Length);
```

Inject a metadata provider:

```csharp
private readonly Func<string, ArtifactFileMetadata> fileMetadataProvider;
```

Extend the constructor:

```csharp
Func<string, ArtifactFileMetadata>? fileMetadataProvider = null
```

Populate each artifact entry with:

```csharp
var metadata = fileMetadataProvider(path);
["lastWriteTimeUtc"] = metadata.LastWriteTimeUtc?.ToString("O"),
["previewText"] = metadata.PreviewText,
["length"] = metadata.Length
```

Add a default provider that:

- returns empty metadata when the path is unreadable
- for text-like files (`.txt`, `.ini`, `.json`, `.mtx`, no extension) reads at most 512 UTF-8 chars
- for other files returns empty preview text

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter ArtifactProbeTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/ArtifactProbe.cs desktop/native-bridge-tests/ArtifactProbeTests.cs
git commit -m "feat: add artifact preview metadata"
```

## Task 2: Extend IdentityProbeCoordinator to Read Artifact Preview Text

**Files:**
- Modify: `desktop/native-bridge/Services/IdentityProbeCoordinator.cs`
- Modify: `desktop/native-bridge-tests/IdentityProbeCoordinatorTests.cs`

- [ ] **Step 1: Write the failing tests**

Append:

```csharp
[Fact]
public void TryResolve_ReturnsNativeEvidence_WhenExactlyOneCharacterNameAppearsInArtifactPreview()
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
                new Dictionary<string, object?>
                {
                    ["path"] = @"C:\Users\fb_52\Documents\My Games\Path of Exile 2\poe2_production_Config.ini",
                    ["previewText"] = "lastCharacter=KELLEE"
                }
            }
        },
        characterPool:
        [
            new BridgeCharacterPoolEntry("poe2", "poe2-kellee", "KELLEE", "Monk2", "Invoker", 92, "Standard")
        ]);

    Assert.NotNull(result);
    Assert.Equal("artifact.previewText", result!.SourceField);
}

[Fact]
public void TryResolve_ReturnsNull_WhenArtifactPreviewMentionsTwoCharacters()
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
                new Dictionary<string, object?>
                {
                    ["previewText"] = "Alpha then Beta"
                }
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

Expected: FAIL until preview text is considered

- [ ] **Step 3: Extend the coordinator minimally**

In `desktop/native-bridge/Services/IdentityProbeCoordinator.cs`, update `ReadArtifactValues(...)` to include both path and preview text:

```csharp
return artifacts.SelectMany(artifact =>
{
    var values = new List<string>();
    if (artifact.TryGetValue("path", out var pathValue) && pathValue is string path && !string.IsNullOrWhiteSpace(path))
    {
        values.Add(path);
    }

    if (artifact.TryGetValue("previewText", out var previewValue) && previewValue is string preview && !string.IsNullOrWhiteSpace(preview))
    {
        values.Add(preview);
    }

    return values;
});
```

Prefer artifact preview evidence over artifact path evidence by splitting sources:

1. process command line
2. pipe name
3. artifact preview text
4. artifact path

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter IdentityProbeCoordinatorTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/IdentityProbeCoordinator.cs desktop/native-bridge-tests/IdentityProbeCoordinatorTests.cs
git commit -m "feat: correlate artifact preview identity evidence"
```

## Task 3: Keep Process Diagnostics Stable and Re-Verify

**Files:**
- Modify: `desktop/tests/native-bridge-process.test.js`
- Modify: `desktop/README.md`

- [ ] **Step 1: Write the failing process-level test**

Append:

```js
test('artifact-probe diagnostics expose previewText and remain bounded after preview enrichment', async (t) => {
  const bridge = startBridgeProcess();
  t.after(async () => {
    await shutdownBridge(bridge);
  });

  const artifactDiagnostic = await waitFor(
    () => bridge.lines.find((line) => line?.message === 'artifact-probe'),
    { description: 'artifact-probe diagnostic' }
  );

  assert.equal(Array.isArray(artifactDiagnostic.data.artifacts), true);
  assert.equal(artifactDiagnostic.data.artifacts.length <= 20, true);

  if (artifactDiagnostic.data.artifacts.length > 0) {
    assert.equal(typeof artifactDiagnostic.data.artifacts[0].previewText, 'string');
  }
});
```

- [ ] **Step 2: Run the failing process tests**

Run: `cd desktop && node --test tests/native-bridge-process.test.js`

Expected: FAIL until preview fields are stable

- [ ] **Step 3: Update the README**

Add/update:

```md
Current bridge phase supports:
- `artifact-probe` with bounded recursive enumeration
- per-artifact preview text and modified-time metadata for text-like files
- diagnostics-first validation when no identity-bearing preview is found
```

- [ ] **Step 4: Run the full verification set**

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

- [ ] **Step 5: Commit**

```bash
git add desktop/tests/native-bridge-process.test.js desktop/README.md
git commit -m "docs: add artifact preview validation"
```

## Self-Review

- Spec coverage:
  - artifact preview text and modified-time metadata: Task 1
  - artifact content correlation in the coordinator: Task 2
  - process-level diagnostics and docs: Task 3
- Placeholder scan:
  - No `TODO`, `TBD`, or vague placeholders remain.
- Type consistency:
  - `previewText`, `lastWriteTimeUtc`, and `ArtifactFileMetadata` stay consistent across implementation and tests.
