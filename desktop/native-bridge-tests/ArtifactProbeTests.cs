using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class ArtifactProbeTests
{
    [Fact]
    public void Capture_ReturnsCandidateArtifactsUnderConfiguredRoots()
    {
        var probe = new ArtifactProbe(
            rootsProvider: () => [@"F:\SteamLibrary\steamapps\common\Path of Exile 2", @"D:\steam"],
            entriesProvider: root => root.Contains("Path of Exile 2", StringComparison.Ordinal)
                ? [Path.Combine(root, "logs", "Client.txt"), Path.Combine(root, "production_Config.ini")]
                : [Path.Combine(root, "steamapps", "appmanifest_2694490.acf")]);

        var result = probe.Capture();

        Assert.Equal(2, result["rootCount"]);
        var artifacts = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["artifacts"]);
        Assert.Contains(artifacts, entry => (string)entry["path"]! == @"F:\SteamLibrary\steamapps\common\Path of Exile 2\logs\Client.txt");
    }
}
