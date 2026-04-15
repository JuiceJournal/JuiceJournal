using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class HintResolverTests
{
    [Fact]
    public void Resolve_ReturnsHint_WhenAccountHintMatchesSingleCharacterInCurrentPool()
    {
        var resolver = new HintResolver();

        var hint = resolver.Resolve(
            poeVersion: "poe2",
            processProbe: new Dictionary<string, object?>(),
            transitionProbe: new Dictionary<string, object?>(),
            characterPool:
            [
                new BridgeCharacterPoolEntry(
                    PoeVersion: "poe2",
                    CharacterId: "poe2-kellee",
                    CharacterName: "KELLEE",
                    ClassName: "Monk2",
                    Ascendancy: "Invoker",
                    Level: 92,
                    League: "Standard")
            ],
            accountHint: new Dictionary<string, object?>
            {
                ["characterName"] = "KELLEE",
                ["className"] = "Monk2",
                ["level"] = 92
            });

        Assert.NotNull(hint);
        Assert.Equal("poe2", hint!.PoeVersion);
        Assert.Equal("KELLEE", hint.CharacterName);
        Assert.Equal("Monk2", hint.ClassName);
        Assert.Equal(92, hint.Level);
    }

    [Fact]
    public void Resolve_ReturnsNull_WhenOnlyDifferentGamePoolMatchesTheAccountHint()
    {
        var resolver = new HintResolver();

        var hint = resolver.Resolve(
            poeVersion: "poe2",
            processProbe: new Dictionary<string, object?>(),
            transitionProbe: new Dictionary<string, object?>(),
            characterPool:
            [
                new BridgeCharacterPoolEntry(
                    PoeVersion: "poe1",
                    CharacterId: "poe1-kellee",
                    CharacterName: "KELLEE",
                    ClassName: "Monk",
                    Ascendancy: null,
                    Level: 90,
                    League: "Mercenaries")
            ],
            accountHint: new Dictionary<string, object?>
            {
                ["characterName"] = "KELLEE"
            });

        Assert.Null(hint);
    }
}
