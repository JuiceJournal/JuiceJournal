namespace JuiceJournal.NativeBridge.Services;

public sealed class ProductionConfigParser
{
    public IReadOnlyDictionary<string, object?>? TryParse(IReadOnlyDictionary<string, object?> artifact)
    {
        if (!artifact.TryGetValue("path", out var pathValue)
            || pathValue is not string path
            || !path.EndsWith("poe2_production_Config.ini", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (!artifact.TryGetValue("previewText", out var previewValue)
            || previewValue is not string previewText
            || string.IsNullOrWhiteSpace(previewText))
        {
            return null;
        }

        var keys = previewText
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
            .Where(line => line.Contains('='))
            .Select(line => line.Split('=', 2))
            .Where(parts => parts.Length == 2 && !string.IsNullOrWhiteSpace(parts[0]))
            .Take(20)
            .ToDictionary(parts => parts[0].Trim(), parts => (object?)parts[1].Trim(), StringComparer.OrdinalIgnoreCase);

        return new Dictionary<string, object?>
        {
            ["kind"] = "production-config",
            ["path"] = path,
            ["keys"] = keys
        };
    }
}
