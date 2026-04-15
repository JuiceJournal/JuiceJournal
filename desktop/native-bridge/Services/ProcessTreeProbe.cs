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
        var processes = snapshotProvider()
            .Where(record => record.Name?.Contains("PathOfExile", StringComparison.OrdinalIgnoreCase) == true)
            .Select(record => new Dictionary<string, object?>
            {
                ["id"] = record.ProcessId,
                ["parentId"] = record.ParentProcessId,
                ["name"] = record.Name,
                ["executablePath"] = record.ExecutablePath,
                ["commandLine"] = record.CommandLine
            })
            .Cast<IReadOnlyDictionary<string, object?>>()
            .ToArray();

        return new Dictionary<string, object?>
        {
            ["poeProcessCount"] = processes.Length,
            ["processes"] = processes
        };
    }

    private static IReadOnlyList<ProcessRecord> CaptureFromWmi()
    {
        using var searcher = new ManagementObjectSearcher(
            "SELECT ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine FROM Win32_Process");

        return searcher.Get()
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
