using System.Text;

namespace JuiceJournal.NativeBridge.Services;

public sealed class ArtifactProbe
{
    private const int MaxArtifacts = 20;
    private const int MaxPreviewCharacters = 512;

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
    private readonly Func<string, ArtifactFileMetadata> fileMetadataProvider;

    public sealed record ArtifactFileMetadata(
        bool Exists,
        DateTimeOffset? LastWriteTimeUtc,
        string PreviewText,
        long? Length);

    public ArtifactProbe(
        Func<IReadOnlyList<string>>? rootsProvider = null,
        Func<string, IReadOnlyList<string>>? entriesProvider = null,
        ArtifactRootResolver? rootResolver = null,
        Func<string, ArtifactFileMetadata>? fileMetadataProvider = null)
    {
        var resolvedRootResolver = rootResolver ?? new ArtifactRootResolver();
        this.rootsProvider = rootsProvider ?? resolvedRootResolver.Resolve;
        this.entriesProvider = entriesProvider ?? DefaultEntriesProvider;
        this.fileMetadataProvider = fileMetadataProvider ?? ReadArtifactFileMetadata;
    }

    public IReadOnlyDictionary<string, object?> Capture()
    {
        var roots = rootsProvider();
        var artifacts = roots
            .SelectMany(root => entriesProvider(root)
                .Where(IsCandidateArtifact)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(MaxArtifacts)
                .Select(path =>
                {
                    ArtifactFileMetadata metadata;
                    try
                    {
                        metadata = this.fileMetadataProvider(path);
                    }
                    catch
                    {
                        metadata = new ArtifactFileMetadata(
                            Exists: false,
                            LastWriteTimeUtc: null,
                            PreviewText: string.Empty,
                            Length: null);
                    }

                    return new Dictionary<string, object?>
                    {
                        ["root"] = root,
                        ["path"] = path,
                        ["lastWriteTimeUtc"] = metadata.LastWriteTimeUtc?.ToString("O"),
                        ["previewText"] = metadata.PreviewText,
                        ["length"] = metadata.Length
                    };
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

    private static ArtifactFileMetadata ReadArtifactFileMetadata(string path)
    {
        try
        {
            if (!File.Exists(path))
            {
                return new ArtifactFileMetadata(false, null, string.Empty, null);
            }

            var info = new FileInfo(path);
            var previewText = IsTextLikeArtifact(path)
                ? ReadPreviewText(path)
                : string.Empty;

            return new ArtifactFileMetadata(
                Exists: true,
                LastWriteTimeUtc: info.LastWriteTimeUtc,
                PreviewText: previewText,
                Length: info.Length);
        }
        catch
        {
            return new ArtifactFileMetadata(false, null, string.Empty, null);
        }
    }

    private static bool IsTextLikeArtifact(string path)
    {
        var extension = Path.GetExtension(path);
        return string.IsNullOrWhiteSpace(extension)
            || extension.Equals(".txt", StringComparison.OrdinalIgnoreCase)
            || extension.Equals(".ini", StringComparison.OrdinalIgnoreCase)
            || extension.Equals(".json", StringComparison.OrdinalIgnoreCase)
            || extension.Equals(".mtx", StringComparison.OrdinalIgnoreCase);
    }

    private static string ReadPreviewText(string path)
    {
        using var stream = File.OpenRead(path);
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        var buffer = new char[MaxPreviewCharacters];
        var readCount = reader.ReadBlock(buffer, 0, buffer.Length);
        return new string(buffer, 0, readCount);
    }
}
