using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class MemoryProbeTests
{
    [Fact]
    public void CaptureReadableRegions_FiltersToCommittedReadablePrivateMemory()
    {
        var probe = new MemoryProbe(
            regionProvider: _ =>
            [
                new MemoryProbe.MemoryRegion(0x1000, 4096, "MEM_COMMIT", "PAGE_READWRITE", "MEM_PRIVATE"),
                new MemoryProbe.MemoryRegion(0x2000, 4096, "MEM_RESERVE", "PAGE_READWRITE", "MEM_PRIVATE"),
                new MemoryProbe.MemoryRegion(0x3000, 4096, "MEM_COMMIT", "PAGE_NOACCESS", "MEM_PRIVATE")
            ],
            readProvider: (_, _) => Array.Empty<byte>());

        var regions = probe.CaptureReadableRegions(processId: 1234);

        Assert.Single(regions);
        Assert.Equal((nuint)0x1000, regions[0].BaseAddress);
        Assert.Equal((nuint)4096, regions[0].Size);
    }

    [Fact]
    public void CaptureReadableRegions_BoundsTotalBytesAcrossRegions()
    {
        var probe = new MemoryProbe(
            regionProvider: _ =>
            [
                new MemoryProbe.MemoryRegion(0x1000, 65536, "MEM_COMMIT", "PAGE_READWRITE", "MEM_PRIVATE"),
                new MemoryProbe.MemoryRegion(0x2000, 65536, "MEM_COMMIT", "PAGE_READWRITE", "MEM_PRIVATE")
            ],
            readProvider: (_, _) => Array.Empty<byte>());

        var regions = probe.CaptureReadableRegions(processId: 1234, maxTotalBytes: 65536);

        Assert.Single(regions);
    }
}
