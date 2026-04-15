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
