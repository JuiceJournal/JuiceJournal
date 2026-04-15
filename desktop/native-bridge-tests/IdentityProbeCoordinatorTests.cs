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

        var result = coordinator.TryResolve(
            poeVersion: "poe2",
            processTreePayload: new Dictionary<string, object?>
            {
                ["processes"] = new IReadOnlyDictionary<string, object?>[]
                {
                    new Dictionary<string, object?>
                    {
                        ["id"] = 101,
                        ["commandLine"] = "\"PathOfExileSteam.exe\" --character-name KELLEE --realm poe2"
                    },
                    new Dictionary<string, object?>
                    {
                        ["id"] = 102,
                        ["commandLine"] = "\"CrashReporter.exe\" --watch 101"
                    }
                }
            },
            namedPipePayload: null,
            artifactPayload: null,
            characterPool:
            [
                new BridgeCharacterPoolEntry(
                    PoeVersion: "poe2",
                    CharacterId: "poe2-kellee",
                    CharacterName: "KELLEE",
                    ClassName: "Monk2",
                    Ascendancy: "Invoker",
                    Level: 92,
                    League: "Standard"),
                new BridgeCharacterPoolEntry(
                    PoeVersion: "poe1",
                    CharacterId: "poe1-kellee",
                    CharacterName: "KELLEE",
                    ClassName: "Monk",
                    Ascendancy: null,
                    Level: 90,
                    League: "Mercenaries")
            ]);

        Assert.NotNull(result);
        Assert.Equal("poe2", result!.PoeVersion);
        Assert.Equal("KELLEE", result.CharacterName);
        Assert.Equal("Monk2", result.ClassName);
        Assert.Equal(92, result.Level);
        Assert.Equal("process.commandLine", result.SourceField);
    }

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
}
