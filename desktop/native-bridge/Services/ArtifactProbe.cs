namespace JuiceJournal.NativeBridge.Services;

public sealed class ArtifactProbe
{
    private const int MaxArtifacts = 20;

    private static readonly string[] CandidateNameFragments =
    [
        "client",
        "config",
        "production",
        "cache",
        "appmanifest",
        "path of exile",
        "poe"
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
                .Where(IsCandidateArtifact)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(MaxArtifacts)
                .Select(path => new Dictionary<string, object?>
                {
                    ["root"] = root,
                    ["path"] = path
                }))
            .DistinctBy(entry => (string)entry["path"]!, StringComparer.OrdinalIgnoreCase)
            .Take(MaxArtifacts)
            .Cast<IReadOnlyDictionary<string, object?>>()
            .ToArray();

        return new Dictionary<string, object?>
        {
            ["rootCount"] = roots.Count,
            ["artifacts"] = artifacts
        };
    }

    private static bool IsCandidateArtifact(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return false;
        }

        var candidateName = Path.GetFileName(path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        if (string.IsNullOrWhiteSpace(candidateName))
        {
            return false;
        }

        return CandidateNameFragments.Any(fragment =>
            candidateName.Contains(fragment, StringComparison.OrdinalIgnoreCase));
    }

    private static IReadOnlyList<string> DefaultEntriesProvider(string root)
    {
        try
        {
            if (!Directory.Exists(root))
            {
                return [];
            }

            return Directory.EnumerateFileSystemEntries(root, "*", SearchOption.AllDirectories)
                .Take(MaxArtifacts * 5)
                .ToArray();
        }
        catch
        {
            return [];
        }
    }
}
