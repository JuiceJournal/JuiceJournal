using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class MemoryRegionFingerprintProbeTests
{
    [Fact]
    public void Summarize_ReturnsStableSha256Fingerprints_ForBoundedWindows()
    {
        var probe = new MemoryRegionFingerprintProbe();
        var buffer = Enumerable.Repeat((byte)0x41, 256).ToArray();

        var result = probe.Summarize((nuint)0x1000, buffer);

        Assert.Equal("memory-region-fingerprint", result["kind"]);
        Assert.Equal("0x1000", result["baseAddress"]);
        Assert.Equal(256, result["bytesRead"]);
        var windows = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["windows"]);
        Assert.NotEmpty(windows);
    }

    [Fact]
    public void Summarize_BoundsTheNumberOfReportedWindows()
    {
        var probe = new MemoryRegionFingerprintProbe();
        var buffer = Enumerable.Range(0, 4096).Select(index => (byte)(index % 251)).ToArray();

        var result = probe.Summarize((nuint)0x2000, buffer);

        var windows = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["windows"]);
        Assert.True(windows.Count <= 4);
    }
}
