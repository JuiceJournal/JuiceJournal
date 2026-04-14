using System.Diagnostics;

namespace JuiceJournal.NativeBridge.Services;

public sealed class ProcessProbe
{
    public IReadOnlyDictionary<string, object?> Capture()
    {
        var poeProcesses = Process
            .GetProcesses()
            .Where(process => process.ProcessName.Contains("PathOfExile", StringComparison.OrdinalIgnoreCase))
            .Select(process => new Dictionary<string, object?>
            {
                ["name"] = process.ProcessName,
                ["id"] = process.Id
            })
            .Cast<IReadOnlyDictionary<string, object?>>()
            .ToArray();

        return new Dictionary<string, object?>
        {
            ["poeProcessCount"] = poeProcesses.Length,
            ["processes"] = poeProcesses
        };
    }
}
