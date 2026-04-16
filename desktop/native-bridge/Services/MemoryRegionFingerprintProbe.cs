using System.Security.Cryptography;

namespace JuiceJournal.NativeBridge.Services;

public sealed class MemoryRegionFingerprintProbe
{
    private const int MaxWindows = 4;
    private const int WindowSize = 128;

    public IReadOnlyDictionary<string, object?> Summarize(nuint baseAddress, byte[] buffer)
    {
        var windows = new List<IReadOnlyDictionary<string, object?>>();
        for (var windowIndex = 0; windowIndex < MaxWindows; windowIndex += 1)
        {
            var offset = windowIndex * WindowSize;
            if (offset >= buffer.Length)
            {
                break;
            }

            var slice = buffer.Skip(offset).Take(WindowSize).ToArray();
            windows.Add(new Dictionary<string, object?>
            {
                ["offset"] = offset,
                ["sha256"] = Convert.ToHexStringLower(SHA256.HashData(slice))
            });
        }

        return new Dictionary<string, object?>
        {
            ["kind"] = "memory-region-fingerprint",
            ["baseAddress"] = $"0x{baseAddress:X}",
            ["bytesRead"] = buffer.Length,
            ["windows"] = windows
        };
    }
}
