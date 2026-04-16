using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class MemoryTextIslandExtractorTests
{
    [Fact]
    public void Extract_ReturnsAsciiAndUtf16Islands_AboveMinimumLength()
    {
        var extractor = new MemoryTextIslandExtractor();
        var ascii = System.Text.Encoding.ASCII.GetBytes("xxxxKELLEEyyyy");
        var utf16 = System.Text.Encoding.Unicode.GetBytes("zzzzInvoker");
        var buffer = ascii.Concat(new byte[] { 0, 0 }).Concat(utf16).ToArray();

        var islands = extractor.Extract(buffer);

        Assert.Contains(islands, island => (string)island["text"]! == "xxxxKELLEEyyyy" && (string)island["encoding"]! == "ascii");
        Assert.Contains(islands, island => (string)island["text"]! == "zzzzInvoker" && (string)island["encoding"]! == "utf16le");
    }

    [Fact]
    public void Extract_IgnoresShortOrBinaryNoise()
    {
        var extractor = new MemoryTextIslandExtractor();
        var buffer = new byte[] { 0, 1, 2, 3, 4, 5, 65, 0, 66 };

        var islands = extractor.Extract(buffer);

        Assert.Empty(islands);
    }
}
