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
}
