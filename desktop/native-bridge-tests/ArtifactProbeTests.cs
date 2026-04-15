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

    [Fact]
    public void Capture_UsesResolvedRootsByDefault()
    {
        var rootResolver = new ArtifactRootResolver(
            steamPathProvider: () => @"D:\steam\steam.exe",
            steamLibraryRootsProvider: () => [@"F:\SteamLibrary"],
            environmentFolderProvider: _ => string.Empty);

        var probe = new ArtifactProbe(
            entriesProvider: root => root.Contains("Path of Exile 2", StringComparison.Ordinal)
                ? [Path.Combine(root, "logs", "Client.txt")]
                : [],
            rootResolver: rootResolver);

        var result = probe.Capture();

        Assert.Equal(2, result["rootCount"]);
        var artifacts = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["artifacts"]);
        Assert.Single(artifacts);
    }
}
