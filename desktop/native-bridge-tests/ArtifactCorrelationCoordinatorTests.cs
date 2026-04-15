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
