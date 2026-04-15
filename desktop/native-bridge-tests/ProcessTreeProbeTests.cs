using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class ProcessTreeProbeTests
{
    [Fact]
    public void Capture_ReturnsNormalizedPoeProcesses()
    {
        var probe = new ProcessTreeProbe(() =>
        [
            new ProcessTreeProbe.ProcessRecord(
                ProcessId: 101,
                ParentProcessId: 10,
                Name: "PathOfExileSteam",
                ExecutablePath: @"F:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\PathOfExileSteam.exe",
                CommandLine: "\"PathOfExileSteam.exe\" --waitforpreload"),
            new ProcessTreeProbe.ProcessRecord(
                ProcessId: 202,
                ParentProcessId: 20,
                Name: "notepad",
                ExecutablePath: @"C:\\Windows\\System32\\notepad.exe",
                CommandLine: "notepad.exe")
        ]);

        var result = probe.Capture();

        var processes = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["processes"]);
        Assert.Single(processes);
        Assert.Equal(101, processes[0]["id"]);
        Assert.Equal(10, processes[0]["parentId"]);
        Assert.Equal("PathOfExileSteam", processes[0]["name"]);
    }
}
