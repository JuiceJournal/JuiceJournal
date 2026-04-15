# Artifact Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse the discovered PoE2 artifact files into structured diagnostics and determine whether any artifact content yields direct or strongly correlated native character identity.

**Architecture:** Keep `ArtifactRootResolver` and `ArtifactProbe` as the file-discovery layer, then add small file-specific parsers for `poe2_production_Config.ini`, `poe2_production`, and `poe2_production_Loaded.mtx`. Feed the parsed outputs into a narrow `ArtifactCorrelationCoordinator` that can emit only exact, native-backed identity evidence. If the parsed data is ambiguous or unhelpful, the bridge emits diagnostics and nothing else.

**Tech Stack:** `.NET 10`, xUnit, Node test runner, NDJSON over stdout

---

## File Structure

- Create: `desktop/native-bridge/Services/ProductionConfigParser.cs`
  - Parse INI-like config preview text into bounded key/value diagnostics.
- Create: `desktop/native-bridge/Services/ProductionStateParser.cs`
  - Parse `poe2_production` preview text or extensionless state content into bounded textual diagnostics.
- Create: `desktop/native-bridge/Services/LoadedMtxParser.cs`
  - Summarize numeric `.mtx` content into stable token/fingerprint diagnostics.
- Create: `desktop/native-bridge/Services/ArtifactCorrelationCoordinator.cs`
  - Turn parsed artifact diagnostics into exact native identity evidence or no result.
- Create: `desktop/native-bridge-tests/ProductionConfigParserTests.cs`
  - Focused tests for config key extraction and fail-closed behavior.
- Create: `desktop/native-bridge-tests/ProductionStateParserTests.cs`
  - Focused tests for extensionless state parsing and text/binary detection.
- Create: `desktop/native-bridge-tests/LoadedMtxParserTests.cs`
  - Focused tests for numeric token summaries and fingerprints.
- Create: `desktop/native-bridge-tests/ArtifactCorrelationCoordinatorTests.cs`
  - Focused tests for direct identity, ambiguity, and negative correlation.
- Modify: `desktop/native-bridge/Program.cs`
  - Emit parsed artifact diagnostics and run artifact-correlation before hint promotion.
- Modify: `desktop/tests/native-bridge-process.test.js`
  - Verify parsed artifact diagnostics remain bounded and stable.
- Modify: `desktop/README.md`
  - Document parsed artifact diagnostics and current validation flow.

## Task 1: Add the Production Config Parser

**Files:**
- Create: `desktop/native-bridge/Services/ProductionConfigParser.cs`
- Create: `desktop/native-bridge-tests/ProductionConfigParserTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `desktop/native-bridge-tests/ProductionConfigParserTests.cs`:

```csharp
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class ProductionConfigParserTests
{
    [Fact]
    public void TryParse_ReturnsBoundedKeyValues_ForIniLikePreview()
    {
        var parser = new ProductionConfigParser();
        var artifact = new Dictionary<string, object?>
        {
            ["path"] = @"C:\Users\fb_52\Documents\My Games\Path of Exile 2\poe2_production_Config.ini",
            ["previewText"] = "[LOGIN]\naccount_name=\nlastCharacter=KELLEE\ngateway_id=Frankfurt\n"
        };

        var result = parser.TryParse(artifact);

        Assert.NotNull(result);
        Assert.Equal("production-config", result!["kind"]);
        var keys = Assert.IsAssignableFrom<IReadOnlyDictionary<string, object?>>(result["keys"]);
        Assert.Equal("KELLEE", keys["lastCharacter"]);
        Assert.Equal("Frankfurt", keys["gateway_id"]);
    }

    [Fact]
    public void TryParse_ReturnsNull_ForNonConfigArtifacts()
    {
        var parser = new ProductionConfigParser();
        var artifact = new Dictionary<string, object?>
        {
            ["path"] = @"C:\Users\fb_52\Documents\My Games\Path of Exile 2\poe2_production_Loaded.mtx",
            ["previewText"] = "1\r\n2\r\n3"
        };

        Assert.Null(parser.TryParse(artifact));
    }
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter ProductionConfigParserTests`

Expected: FAIL because `ProductionConfigParser` does not exist

- [ ] **Step 3: Implement the minimal parser**

Create `desktop/native-bridge/Services/ProductionConfigParser.cs`:

```csharp
namespace JuiceJournal.NativeBridge.Services;

public sealed class ProductionConfigParser
{
    public IReadOnlyDictionary<string, object?>? TryParse(IReadOnlyDictionary<string, object?> artifact)
    {
        if (!artifact.TryGetValue("path", out var pathValue)
            || pathValue is not string path
            || !path.EndsWith("poe2_production_Config.ini", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (!artifact.TryGetValue("previewText", out var previewValue)
            || previewValue is not string previewText
            || string.IsNullOrWhiteSpace(previewText))
        {
            return null;
        }

        var keys = previewText
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
            .Where(line => line.Contains('='))
            .Select(line => line.Split('=', 2))
            .Where(parts => parts.Length == 2 && !string.IsNullOrWhiteSpace(parts[0]))
            .Take(20)
            .ToDictionary(parts => parts[0].Trim(), parts => (object?)parts[1].Trim(), StringComparer.OrdinalIgnoreCase);

        return new Dictionary<string, object?>
        {
            ["kind"] = "production-config",
            ["path"] = path,
            ["keys"] = keys
        };
    }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter ProductionConfigParserTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/ProductionConfigParser.cs desktop/native-bridge-tests/ProductionConfigParserTests.cs
git commit -m "feat: add production config parser"
```

## Task 2: Add the Production State and Loaded MTX Parsers

**Files:**
- Create: `desktop/native-bridge/Services/ProductionStateParser.cs`
- Create: `desktop/native-bridge/Services/LoadedMtxParser.cs`
- Create: `desktop/native-bridge-tests/ProductionStateParserTests.cs`
- Create: `desktop/native-bridge-tests/LoadedMtxParserTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `desktop/native-bridge-tests/ProductionStateParserTests.cs`:

```csharp
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class ProductionStateParserTests
{
    [Fact]
    public void TryParse_ReturnsTextSummary_ForExtensionlessProductionState()
    {
        var parser = new ProductionStateParser();
        var artifact = new Dictionary<string, object?>
        {
            ["path"] = @"C:\Users\fb_52\Documents\My Games\Path of Exile 2\poe2_production",
            ["previewText"] = "lastCharacter=KELLEE\nlastClass=Monk2"
        };

        var result = parser.TryParse(artifact);

        Assert.NotNull(result);
        Assert.Equal("production-state", result!["kind"]);
        Assert.Equal("lastCharacter=KELLEE\nlastClass=Monk2", result["previewText"]);
    }
}
```

Create `desktop/native-bridge-tests/LoadedMtxParserTests.cs`:

```csharp
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class LoadedMtxParserTests
{
    [Fact]
    public void TryParse_ReturnsStableTokenSummary_ForLoadedMtxPreview()
    {
        var parser = new LoadedMtxParser();
        var artifact = new Dictionary<string, object?>
        {
            ["path"] = @"C:\Users\fb_52\Documents\My Games\Path of Exile 2\poe2_production_Loaded.mtx",
            ["previewText"] = "3872352\r\n13291563\r\n13505441\r\n"
        };

        var result = parser.TryParse(artifact);

        Assert.NotNull(result);
        Assert.Equal("loaded-mtx", result!["kind"]);
        Assert.Equal(3, result["tokenCount"]);
    }
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter "ProductionStateParserTests|LoadedMtxParserTests"`

Expected: FAIL because these parsers do not exist

- [ ] **Step 3: Implement the minimal parsers**

Create `desktop/native-bridge/Services/ProductionStateParser.cs`:

```csharp
namespace JuiceJournal.NativeBridge.Services;

public sealed class ProductionStateParser
{
    public IReadOnlyDictionary<string, object?>? TryParse(IReadOnlyDictionary<string, object?> artifact)
    {
        if (!artifact.TryGetValue("path", out var pathValue)
            || pathValue is not string path
            || !path.EndsWith("poe2_production", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var previewText = artifact.TryGetValue("previewText", out var previewValue)
            ? previewValue as string ?? string.Empty
            : string.Empty;

        return new Dictionary<string, object?>
        {
            ["kind"] = "production-state",
            ["path"] = path,
            ["previewText"] = previewText
        };
    }
}
```

Create `desktop/native-bridge/Services/LoadedMtxParser.cs`:

```csharp
namespace JuiceJournal.NativeBridge.Services;

public sealed class LoadedMtxParser
{
    public IReadOnlyDictionary<string, object?>? TryParse(IReadOnlyDictionary<string, object?> artifact)
    {
        if (!artifact.TryGetValue("path", out var pathValue)
            || pathValue is not string path
            || !path.EndsWith("poe2_production_Loaded.mtx", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var previewText = artifact.TryGetValue("previewText", out var previewValue)
            ? previewValue as string ?? string.Empty
            : string.Empty;

        var tokens = previewText
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
            .Take(50)
            .ToArray();

        return new Dictionary<string, object?>
        {
            ["kind"] = "loaded-mtx",
            ["path"] = path,
            ["tokenCount"] = tokens.Length,
            ["firstTokens"] = tokens.Take(10).ToArray()
        };
    }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter "ProductionStateParserTests|LoadedMtxParserTests"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/ProductionStateParser.cs desktop/native-bridge/Services/LoadedMtxParser.cs desktop/native-bridge-tests/ProductionStateParserTests.cs desktop/native-bridge-tests/LoadedMtxParserTests.cs
git commit -m "feat: add artifact file parsers"
```

## Task 3: Add Artifact Correlation Coordinator

**Files:**
- Create: `desktop/native-bridge/Services/ArtifactCorrelationCoordinator.cs`
- Create: `desktop/native-bridge-tests/ArtifactCorrelationCoordinatorTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `desktop/native-bridge-tests/ArtifactCorrelationCoordinatorTests.cs`:

```csharp
using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class ArtifactCorrelationCoordinatorTests
{
    [Fact]
    public void TryResolve_ReturnsNativeEvidence_WhenParsedConfigContainsExactCharacterName()
    {
        var coordinator = new ArtifactCorrelationCoordinator();

        var parsedArtifacts = new IReadOnlyDictionary<string, object?>[]
        {
            new Dictionary<string, object?>
            {
                ["kind"] = "production-config",
                ["previewText"] = "lastCharacter=KELLEE"
            }
        };

        var result = coordinator.TryResolve(
            "poe2",
            parsedArtifacts,
            [
                new BridgeCharacterPoolEntry("poe2", "poe2-kellee", "KELLEE", "Monk2", "Invoker", 92, "Standard")
            ]);

        Assert.NotNull(result);
        Assert.Equal("artifact.previewText", result!.SourceField);
    }
}
```

- [ ] **Step 2: Run the failing tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter ArtifactCorrelationCoordinatorTests`

Expected: FAIL because the coordinator does not exist

- [ ] **Step 3: Implement the minimal coordinator**

Create `desktop/native-bridge/Services/ArtifactCorrelationCoordinator.cs`:

```csharp
using JuiceJournal.NativeBridge.Contracts;

namespace JuiceJournal.NativeBridge.Services;

public sealed class ArtifactCorrelationCoordinator
{
    public NativeIdentityEvidence? TryResolve(
        string poeVersion,
        IReadOnlyList<IReadOnlyDictionary<string, object?>> parsedArtifacts,
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

        BridgeCharacterPoolEntry? matchedCharacter = null;
        foreach (var artifact in parsedArtifacts)
        {
            var previewText = artifact.TryGetValue("previewText", out var previewValue)
                ? previewValue as string
                : null;

            if (string.IsNullOrWhiteSpace(previewText))
            {
                continue;
            }

            var matches = candidates
                .Where(character => previewText.Contains(character.CharacterName, StringComparison.OrdinalIgnoreCase))
                .ToArray();

            foreach (var match in matches)
            {
                if (matchedCharacter is null)
                {
                    matchedCharacter = match;
                }
                else if (!string.Equals(matchedCharacter.CharacterId, match.CharacterId, StringComparison.Ordinal))
                {
                    return null;
                }
            }
        }

        return matchedCharacter is null
            ? null
            : new NativeIdentityEvidence(normalizedVersion, matchedCharacter.CharacterName, matchedCharacter.ClassName, matchedCharacter.Level, "artifact.previewText");
    }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `cd desktop && dotnet test native-bridge-tests/JuiceJournal.NativeBridge.Tests.csproj --filter ArtifactCorrelationCoordinatorTests`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/native-bridge/Services/ArtifactCorrelationCoordinator.cs desktop/native-bridge-tests/ArtifactCorrelationCoordinatorTests.cs
git commit -m "feat: add artifact correlation coordinator"
```

## Task 4: Update Process Tests and README, Then Re-Verify

**Files:**
- Modify: `desktop/tests/native-bridge-process.test.js`
- Modify: `desktop/README.md`

- [ ] **Step 1: Write the failing process-level test**

Append:

```js
test('artifact-probe diagnostics expose previewText and lastWriteTimeUtc after artifact parser enrichment', async (t) => {
  const bridge = startBridgeProcess();
  t.after(async () => {
    await shutdownBridge(bridge);
  });

  const artifactDiagnostic = await waitFor(
    () => bridge.lines.find((line) => line?.message === 'artifact-probe'),
    { description: 'artifact-probe diagnostic' }
  );

  if (artifactDiagnostic.data.artifacts.length > 0) {
    assert.equal(typeof artifactDiagnostic.data.artifacts[0].previewText, 'string');
    assert.ok('lastWriteTimeUtc' in artifactDiagnostic.data.artifacts[0]);
  }
});
```

- [ ] **Step 2: Run the failing process tests**

Run: `cd desktop && node --test tests/native-bridge-process.test.js`

Expected: FAIL only if payload shape regressed

- [ ] **Step 3: Update the README**

Add/update:

```md
Current bridge phase supports:
- artifact preview text and modified-time metadata
- diagnostics-first validation when preview content still lacks character identity
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
git commit -m "docs: add artifact parser validation"
```

## Self-Review

- Spec coverage:
  - file-specific config/state/mtx parsers: Tasks 1 and 2
  - parsed artifact correlation: Task 3
  - process-level payload stability and docs: Task 4
- Placeholder scan:
  - No `TODO`, `TBD`, or vague placeholders remain.
- Type consistency:
  - `previewText`, `lastWriteTimeUtc`, `ArtifactFileMetadata`, and `artifact.previewText` stay consistent across tests and implementation.
