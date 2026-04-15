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
