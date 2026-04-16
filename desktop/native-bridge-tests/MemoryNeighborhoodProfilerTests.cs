using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class MemoryNeighborhoodProfilerTests
{
    [Fact]
    public void BuildProfiles_SummarizesNeighborhoodsAroundTextIslands()
    {
        var profiler = new MemoryNeighborhoodProfiler();
        var islands = new IReadOnlyDictionary<string, object?>[]
        {
            new Dictionary<string, object?>
            {
                ["offset"] = 16,
                ["encoding"] = "ascii",
                ["text"] = "KELLEE"
            }
        };

        var profiles = profiler.BuildProfiles((nuint)0x1000, islands);

        Assert.Single(profiles);
        Assert.Equal("0x1010", profiles[0]["address"]);
        Assert.Equal("KELLEE", profiles[0]["text"]);
    }
}
