namespace JuiceJournal.NativeBridge.Services;

public sealed class NamedPipeProbe
{
    private readonly Func<IReadOnlyList<string>> listPipes;

    public NamedPipeProbe(Func<IReadOnlyList<string>>? listPipes = null)
    {
        this.listPipes = listPipes ?? ListPipesFromFilesystem;
    }

    public IReadOnlyDictionary<string, object?> Capture()
    {
        var pipes = listPipes()
            .Where(name =>
                name.Contains("poe", StringComparison.OrdinalIgnoreCase)
                || name.Contains("grinding", StringComparison.OrdinalIgnoreCase)
                || name.Contains("ggg", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(name => new Dictionary<string, object?>
            {
                ["name"] = name
            })
            .Cast<IReadOnlyDictionary<string, object?>>()
            .ToArray();

        return new Dictionary<string, object?>
        {
            ["candidateCount"] = pipes.Length,
            ["pipes"] = pipes
        };
    }

    private static IReadOnlyList<string> ListPipesFromFilesystem()
    {
        try
        {
            return Directory.GetFiles(@"\\.\pipe\").ToArray();
        }
        catch
        {
            return [];
        }
    }
}
