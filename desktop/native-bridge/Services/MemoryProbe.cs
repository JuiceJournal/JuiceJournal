namespace JuiceJournal.NativeBridge.Services;

public sealed class MemoryProbe
{
    public sealed record MemoryRegion(
        nuint BaseAddress,
        nuint Size,
        string State,
        string Protect,
        string Type);

    private readonly Func<int, IReadOnlyList<MemoryRegion>> regionProvider;
    private readonly Func<nuint, int, byte[]> readProvider;

    public MemoryProbe(
        Func<int, IReadOnlyList<MemoryRegion>>? regionProvider = null,
        Func<nuint, int, byte[]>? readProvider = null)
    {
        this.regionProvider = regionProvider ?? (_ => []);
        this.readProvider = readProvider ?? ((_, _) => Array.Empty<byte>());
    }

    public IReadOnlyList<MemoryRegion> CaptureReadableRegions(int processId, nuint maxTotalBytes = 1024 * 1024)
    {
        nuint totalBytes = 0;
        var accepted = new List<MemoryRegion>();

        foreach (var region in regionProvider(processId))
        {
            if (!string.Equals(region.State, "MEM_COMMIT", StringComparison.Ordinal)
                || !string.Equals(region.Type, "MEM_PRIVATE", StringComparison.Ordinal)
                || region.Protect.Contains("NOACCESS", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (totalBytes + region.Size > maxTotalBytes)
            {
                break;
            }

            accepted.Add(region);
            totalBytes += region.Size;
        }

        return accepted;
    }
}
