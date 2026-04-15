namespace JuiceJournal.NativeBridge.Services;

public sealed class LoadedMtxParser
{
    public IReadOnlyDictionary<string, object?>? TryParse(IReadOnlyDictionary<string, object?> artifact)
    {
        if (!artifact.TryGetValue("path", out var pathValue)
            || pathValue is not string path
            || !path.EndsWith("poe2_production_Loaded.mtx", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var previewText = artifact.TryGetValue("previewText", out var previewValue)
            ? previewValue as string ?? string.Empty
            : string.Empty;

        var tokens = previewText
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
            .Take(50)
            .ToArray();

        return new Dictionary<string, object?>
        {
            ["kind"] = "loaded-mtx",
            ["path"] = path,
            ["tokenCount"] = tokens.Length,
            ["firstTokens"] = tokens.Take(10).ToArray()
        };
    }
}
