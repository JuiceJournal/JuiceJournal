using System.Management;

namespace JuiceJournal.NativeBridge.Services;

public sealed class ProcessTreeProbe
{
    public sealed record ProcessRecord(
        int ProcessId,
        int? ParentProcessId,
        string? Name,
        string? ExecutablePath,
        string? CommandLine);

    private readonly Func<IReadOnlyList<ProcessRecord>> snapshotProvider;

    public ProcessTreeProbe(Func<IReadOnlyList<ProcessRecord>>? snapshotProvider = null)
    {
        this.snapshotProvider = snapshotProvider ?? CaptureFromWmi;
    }

    public IReadOnlyDictionary<string, object?> Capture()
    {
        var snapshot = snapshotProvider();
        var recordsById = snapshot.ToDictionary(record => record.ProcessId);
        var poeProcessIds = snapshot
            .Where(record => record.Name?.Contains("PathOfExile", StringComparison.OrdinalIgnoreCase) == true)
            .Select(record => record.ProcessId)
            .ToHashSet();
        var relatedProcessIds = new HashSet<int>(poeProcessIds);

        foreach (var record in snapshot)
        {
            if (!poeProcessIds.Contains(record.ProcessId))
            {
                continue;
            }

            if (record.ParentProcessId is int parentId && recordsById.ContainsKey(parentId))
            {
                relatedProcessIds.Add(parentId);
            }
        }

        foreach (var record in snapshot)
        {
            if (record.ParentProcessId is int parentId && poeProcessIds.Contains(parentId))
            {
                relatedProcessIds.Add(record.ProcessId);
            }
        }

        var processes = snapshot
            .Where(record => relatedProcessIds.Contains(record.ProcessId))
            .Select(record => new Dictionary<string, object?>
            {
                ["id"] = record.ProcessId,
                ["parentId"] = record.ParentProcessId,
                ["name"] = record.Name,
                ["executablePath"] = record.ExecutablePath,
                ["commandLine"] = record.CommandLine,
                ["isPoeProcess"] = poeProcessIds.Contains(record.ProcessId)
            })
            .Cast<IReadOnlyDictionary<string, object?>>()
            .ToArray();

        return new Dictionary<string, object?>
        {
            ["poeProcessCount"] = poeProcessIds.Count,
            ["processes"] = processes
        };
    }

    private static IReadOnlyList<ProcessRecord> CaptureFromWmi()
    {
        using var searcher = new ManagementObjectSearcher(
            "SELECT ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine FROM Win32_Process");

        using var results = searcher.Get();

        return results
            .Cast<ManagementBaseObject>()
            .Select(process => new ProcessRecord(
                ProcessId: Convert.ToInt32(process["ProcessId"]),
                ParentProcessId: process["ParentProcessId"] is null ? null : Convert.ToInt32(process["ParentProcessId"]),
                Name: process["Name"]?.ToString(),
                ExecutablePath: process["ExecutablePath"]?.ToString(),
                CommandLine: process["CommandLine"]?.ToString()))
            .ToArray();
    }
}
