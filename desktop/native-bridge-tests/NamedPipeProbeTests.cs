using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class NamedPipeProbeTests
{
    [Fact]
    public void Capture_FiltersAndNormalizesCandidatePipeNames()
    {
        var probe = new NamedPipeProbe(() =>
        [
            @"\\.\pipe\steam-1245",
            @"\\.\pipe\poe2-rpc",
            @"\\.\pipe\GGGControl",
            @"\\.\pipe\unrelated"
        ]);

        var result = probe.Capture();

        Assert.Equal(2, result["candidateCount"]);
        var pipes = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["pipes"]);
        Assert.Collection(
            pipes,
            first => Assert.Equal(@"\\.\pipe\poe2-rpc", first["name"]),
            second => Assert.Equal(@"\\.\pipe\GGGControl", second["name"]));
    }

    [Fact]
    public void Capture_ReturnsEmptyPayloadWhenNoCandidatePipesExist()
    {
        var probe = new NamedPipeProbe(() => [@"\\.\pipe\steam-1245"]);

        var result = probe.Capture();

        Assert.Equal(0, result["candidateCount"]);
        var pipes = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["pipes"]);
        Assert.Empty(pipes);
    }
}
