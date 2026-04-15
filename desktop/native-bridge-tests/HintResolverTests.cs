using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class HintResolverTests
{
    [Fact]
    public void Resolve_ReturnsHint_WhenNativeIdentityMatchesSingleCharacterInCurrentPool()
    {
        var resolver = new HintResolver();

        var hint = resolver.Resolve(
            poeVersion: "poe2",
            processProbe: new Dictionary<string, object?>
            {
                ["poeProcessCount"] = 1
            },
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
            nativeIdentity: new NativeIdentityEvidence(
                PoeVersion: "poe2",
                CharacterName: "KELLEE",
                ClassName: "Monk2",
                Level: 92,
                SourceField: "process.commandLine"),
            accountHint: null);

        Assert.NotNull(hint);
        Assert.Equal("poe2", hint!.PoeVersion);
        Assert.Equal("KELLEE", hint.CharacterName);
        Assert.Equal("Monk2", hint.ClassName);
        Assert.Equal(92, hint.Level);
    }

    [Fact]
    public void Resolve_ReturnsNull_WhenOnlyDifferentGamePoolMatchesTheNativeIdentity()
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
            nativeIdentity: new NativeIdentityEvidence(
                PoeVersion: "poe2",
                CharacterName: "KELLEE",
                ClassName: null,
                Level: null,
                SourceField: "process.commandLine"),
            accountHint: null);

        Assert.Null(hint);
    }

    [Fact]
    public void Resolve_ReturnsNull_WhenNoActivePoeProcessIsPresent()
    {
        var resolver = new HintResolver();

        var hint = resolver.Resolve(
            poeVersion: "poe2",
            processProbe: new Dictionary<string, object?>
            {
                ["poeProcessCount"] = 0
            },
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
            nativeIdentity: new NativeIdentityEvidence(
                PoeVersion: "poe2",
                CharacterName: "KELLEE",
                ClassName: null,
                Level: null,
                SourceField: "process.commandLine"),
            accountHint: null);

        Assert.Null(hint);
    }

    [Fact]
    public void Resolve_ReturnsNull_WhenOnlyAccountHintIsPresent()
    {
        var resolver = new HintResolver();

        var hint = resolver.Resolve(
            poeVersion: "poe2",
            processProbe: new Dictionary<string, object?>
            {
                ["poeProcessCount"] = 1
            },
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
            nativeIdentity: null,
            accountHint: new Dictionary<string, object?>
            {
                ["characterName"] = "KELLEE",
                ["className"] = "Monk2",
                ["level"] = 92
            });

        Assert.Null(hint);
    }
}
