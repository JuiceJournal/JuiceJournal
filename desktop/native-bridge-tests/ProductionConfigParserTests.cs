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
