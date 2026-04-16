using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class MemoryFeasibilityCoordinatorTests
{
    [Fact]
    public void Classify_ReturnsDirectIdentity_WhenOneHitMatchesOneCharacter()
    {
        var coordinator = new MemoryFeasibilityCoordinator();

        var result = coordinator.Classify(
            "poe2",
            [
                new MemoryFeasibilityHit("KELLEE", (nuint)0x1000, 10, "utf8", "KELLEE")
            ],
            [
                new BridgeCharacterPoolEntry("poe2", "poe2-kellee", "KELLEE", "Monk2", "Invoker", 92, "Standard")
            ]);

        Assert.NotNull(result);
        Assert.Equal("direct", result!["classification"]);
    }

    [Fact]
    public void Classify_ReturnsNull_WhenHitsMatchMultipleCharacters()
    {
        var coordinator = new MemoryFeasibilityCoordinator();

        var result = coordinator.Classify(
            "poe2",
            [
                new MemoryFeasibilityHit("Alpha", (nuint)0x1000, 10, "utf8", "Alpha"),
                new MemoryFeasibilityHit("Beta", (nuint)0x2000, 10, "utf8", "Beta")
            ],
            [
                new BridgeCharacterPoolEntry("poe2", "alpha", "Alpha", null, null, null, null),
                new BridgeCharacterPoolEntry("poe2", "beta", "Beta", null, null, null, null)
            ]);

        Assert.Null(result);
    }
}
