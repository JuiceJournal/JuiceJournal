namespace JuiceJournal.NativeBridge.Services;

public sealed class ProductionStateParser
{
    public IReadOnlyDictionary<string, object?>? TryParse(IReadOnlyDictionary<string, object?> artifact)
    {
        if (!artifact.TryGetValue("path", out var pathValue)
            || pathValue is not string path
            || !path.EndsWith("poe2_production", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var previewText = artifact.TryGetValue("previewText", out var previewValue)
            ? previewValue as string ?? string.Empty
            : string.Empty;

        return new Dictionary<string, object?>
        {
            ["kind"] = "production-state",
            ["path"] = path,
            ["previewText"] = previewText
        };
    }
}
