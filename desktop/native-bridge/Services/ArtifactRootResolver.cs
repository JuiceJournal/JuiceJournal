namespace JuiceJournal.NativeBridge.Services;

public sealed class ArtifactRootResolver
{
    private readonly Func<string?> steamPathProvider;
    private readonly Func<IReadOnlyList<string>> steamLibraryRootsProvider;
    private readonly Func<Environment.SpecialFolder, string> environmentFolderProvider;

    public ArtifactRootResolver(
        Func<string?>? steamPathProvider = null,
        Func<IReadOnlyList<string>>? steamLibraryRootsProvider = null,
        Func<Environment.SpecialFolder, string>? environmentFolderProvider = null)
    {
        this.steamPathProvider = steamPathProvider ?? (() => null);
        this.steamLibraryRootsProvider = steamLibraryRootsProvider ?? (() => []);
        this.environmentFolderProvider = environmentFolderProvider ?? Environment.GetFolderPath;
    }

    public IReadOnlyList<string> Resolve()
    {
        var roots = new List<string>();
        var steamPath = steamPathProvider();

        if (!string.IsNullOrWhiteSpace(steamPath))
        {
            var steamDirectory = Path.GetDirectoryName(steamPath);
            if (!string.IsNullOrWhiteSpace(steamDirectory))
            {
                roots.Add(steamDirectory);
            }
        }

        foreach (var libraryRoot in steamLibraryRootsProvider())
        {
            if (string.IsNullOrWhiteSpace(libraryRoot))
            {
                continue;
            }

            roots.Add(Path.Combine(libraryRoot, "steamapps", "common", "Path of Exile 2"));
        }

        var documents = environmentFolderProvider(Environment.SpecialFolder.MyDocuments);
        if (!string.IsNullOrWhiteSpace(documents))
        {
            roots.Add(Path.Combine(documents, "My Games", "Path of Exile 2"));
        }

        var localAppData = environmentFolderProvider(Environment.SpecialFolder.LocalApplicationData);
        if (!string.IsNullOrWhiteSpace(localAppData))
        {
            roots.Add(Path.Combine(localAppData, "Path of Exile 2"));
        }

        return roots
            .Where(root => !string.IsNullOrWhiteSpace(root))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }
}
