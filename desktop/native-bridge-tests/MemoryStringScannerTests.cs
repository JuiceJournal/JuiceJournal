using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class MemoryStringScannerTests
{
    [Fact]
    public void Scan_ReturnsExactUtf8HitsForTargetNames()
    {
        var scanner = new MemoryStringScanner();
        var buffer = System.Text.Encoding.UTF8.GetBytes("xxxxKELLEEyyyy");

        var hits = scanner.Scan(
            baseAddress: (nuint)0x1000,
            buffer: buffer,
            targets: ["KELLEE"]);

        Assert.Single(hits);
        Assert.Equal("KELLEE", hits[0].Target);
    }

    [Fact]
    public void Scan_ReturnsEmptyWhenNoTargetExists()
    {
        var scanner = new MemoryStringScanner();
        var buffer = System.Text.Encoding.UTF8.GetBytes("xxxxAlpha");

        var hits = scanner.Scan(
            baseAddress: (nuint)0x1000,
            buffer: buffer,
            targets: ["KELLEE"]);

        Assert.Empty(hits);
    }
}
