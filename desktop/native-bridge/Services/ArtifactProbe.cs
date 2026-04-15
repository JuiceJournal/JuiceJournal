namespace JuiceJournal.NativeBridge.Services;

public sealed class ArtifactProbe
{
    private readonly Func<IReadOnlyList<string>> rootsProvider;
    private readonly Func<string, IReadOnlyList<string>> entriesProvider;

    public ArtifactProbe(
        Func<IReadOnlyList<string>>? rootsProvider = null,
        Func<string, IReadOnlyList<string>>? entriesProvider = null)
    {
        this.rootsProvider = rootsProvider ?? (() => []);
        this.entriesProvider = entriesProvider ?? (_ => []);
    }

    public IReadOnlyDictionary<string, object?> Capture()
    {
        var roots = rootsProvider();
        var artifacts = roots
            .SelectMany(root => entriesProvider(root)
                .Where(path =>
                    path.Contains("Path of Exile", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("Grinding", StringComparison.OrdinalIgnoreCase)
                    || path.Contains("ggg", StringComparison.OrdinalIgnoreCase)
                    || path.EndsWith("Client.txt", StringComparison.OrdinalIgnoreCase))
                .Select(path => new Dictionary<string, object?>
                {
                    ["root"] = root,
                    ["path"] = path
                }))
            .Cast<IReadOnlyDictionary<string, object?>>()
            .ToArray();

        return new Dictionary<string, object?>
        {
            ["rootCount"] = roots.Count,
            ["artifacts"] = artifacts
        };
    }
}
