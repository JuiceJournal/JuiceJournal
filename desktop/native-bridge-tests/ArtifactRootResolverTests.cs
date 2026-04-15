using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class ArtifactRootResolverTests
{
    [Fact]
    public void Resolve_ReturnsDistinctLikelyRoots_FromKnownSteamAndPoeInputs()
    {
        var resolver = new ArtifactRootResolver(
            steamPathProvider: () => @"D:\steam\steam.exe",
            steamLibraryRootsProvider: () => [@"F:\SteamLibrary", @"D:\steam"],
            environmentFolderProvider: folder => folder switch
            {
                Environment.SpecialFolder.MyDocuments => @"C:\Users\fb_52\Documents",
                Environment.SpecialFolder.LocalApplicationData => @"C:\Users\fb_52\AppData\Local",
                _ => string.Empty
            });

        var roots = resolver.Resolve();

        Assert.Contains(@"F:\SteamLibrary\steamapps\common\Path of Exile 2", roots);
        Assert.Contains(@"C:\Users\fb_52\Documents\My Games\Path of Exile 2", roots);
        Assert.Contains(@"C:\Users\fb_52\AppData\Local\Path of Exile 2", roots);
    }

    [Fact]
    public void Resolve_FiltersBlankAndDuplicateRoots()
    {
        var resolver = new ArtifactRootResolver(
            steamPathProvider: () => @"D:\steam\steam.exe",
            steamLibraryRootsProvider: () => [@"D:\steam", @"D:\steam", ""],
            environmentFolderProvider: _ => @" ");

        var roots = resolver.Resolve();

        Assert.Equal(2, roots.Count);
        Assert.Equal(@"D:\steam", roots[0]);
        Assert.Equal(@"D:\steam\steamapps\common\Path of Exile 2", roots[1]);
    }
}
