namespace JuiceJournal.NativeBridge.Services;

public sealed class ArtifactProbe
{
    private static readonly string[] CandidateRelativePaths =
    [
        Path.Combine("logs", "Client.txt"),
        "production_Config.ini",
        "appmanifest_2694490.acf",
        "appmanifest_238960.acf"
    ];

    private readonly Func<IReadOnlyList<string>> rootsProvider;
    private readonly Func<string, IReadOnlyList<string>> entriesProvider;

    public ArtifactProbe(
        Func<IReadOnlyList<string>>? rootsProvider = null,
        Func<string, IReadOnlyList<string>>? entriesProvider = null,
        ArtifactRootResolver? rootResolver = null)
    {
        var resolvedRootResolver = rootResolver ?? new ArtifactRootResolver();
        this.rootsProvider = rootsProvider ?? resolvedRootResolver.Resolve;
        this.entriesProvider = entriesProvider ?? DefaultEntriesProvider;
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

    private static IReadOnlyList<string> DefaultEntriesProvider(string root)
    {
        return CandidateRelativePaths
            .Select(relativePath => Path.Combine(root, relativePath))
            .Where(File.Exists)
            .ToArray();
    }
}
