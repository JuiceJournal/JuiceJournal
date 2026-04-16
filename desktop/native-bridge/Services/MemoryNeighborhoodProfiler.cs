namespace JuiceJournal.NativeBridge.Services;

public sealed class MemoryNeighborhoodProfiler
{
    public IReadOnlyList<IReadOnlyDictionary<string, object?>> BuildProfiles(
        nuint baseAddress,
        IReadOnlyList<IReadOnlyDictionary<string, object?>> islands)
    {
        return islands
            .Take(8)
            .Select(island => new Dictionary<string, object?>
            {
                ["address"] = $"0x{baseAddress + Convert.ToUInt64(island["offset"]):X}",
                ["encoding"] = island["encoding"],
                ["text"] = island["text"]
            })
            .Cast<IReadOnlyDictionary<string, object?>>()
            .ToArray();
    }
}
