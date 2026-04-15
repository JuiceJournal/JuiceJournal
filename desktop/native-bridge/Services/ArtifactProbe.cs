using System.Text;

namespace JuiceJournal.NativeBridge.Services;

public sealed class ArtifactProbe
{
    private const int MaxArtifacts = 20;
    private const int MaxPreviewCharacters = 512;
    private static readonly ArtifactFileMetadata EmptyFileMetadata = new(false, null, string.Empty, null);

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
        Func<string, ArtifactFileMetadata>? fileMetadataProvider = null,
        ArtifactRootResolver? rootResolver = null)
    {
        var resolvedRootResolver = rootResolver ?? new ArtifactRootResolver();
        this.rootsProvider = rootsProvider ?? resolvedRootResolver.Resolve;
        this.entriesProvider = entriesProvider ?? DefaultEntriesProvider;
        this.fileMetadataProvider = fileMetadataProvider ?? DefaultFileMetadataProvider;
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
                    var metadata = CaptureFileMetadata(path);

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

    private ArtifactFileMetadata CaptureFileMetadata(string path)
    {
        try
        {
            return fileMetadataProvider(path);
        }
        catch
        {
            return EmptyFileMetadata;
        }
    }

    private static IReadOnlyList<string> DefaultEntriesProvider(string root)
    {
        try
        {
            if (!Directory.Exists(root))
            {
                return [];
            }

            var results = new List<string>();

            void AddFilesFrom(string directoryPath)
            {
                if (!Directory.Exists(directoryPath))
                {
                    return;
                }

                results.AddRange(Directory.EnumerateFiles(directoryPath).Take(MaxArtifacts * 2));
            }

            AddFilesFrom(root);

            foreach (var directoryName in new[] { "logs", "EShop", "Config", "Caches" })
            {
                var childPath = Path.Combine(root, directoryName);
                AddFilesFrom(childPath);

                if (directoryName is "EShop" or "Caches")
                {
                    foreach (var nestedDirectory in Directory.Exists(childPath)
                        ? Directory.EnumerateDirectories(childPath).Take(5)
                        : [])
                    {
                        AddFilesFrom(nestedDirectory);
                    }
                }
            }

            return results
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(MaxArtifacts * 5)
                .ToArray();
        }
        catch
        {
            return [];
        }
    }

    private static ArtifactFileMetadata DefaultFileMetadataProvider(string path)
    {
        try
        {
            if (!File.Exists(path))
            {
                return EmptyFileMetadata;
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
            return EmptyFileMetadata;
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
        using var reader = new StreamReader(
            stream,
            encoding: new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true),
            detectEncodingFromByteOrderMarks: true);
        var buffer = new char[MaxPreviewCharacters];
        var readCount = reader.ReadBlock(buffer, 0, buffer.Length);
        return new string(buffer, 0, readCount);
    }
}
