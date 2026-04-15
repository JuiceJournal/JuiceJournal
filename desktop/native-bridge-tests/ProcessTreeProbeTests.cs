using JuiceJournal.NativeBridge.Services;
using Xunit;

namespace JuiceJournal.NativeBridge.Tests;

public sealed class ProcessTreeProbeTests
{
    [Fact]
    public void Capture_ReturnsNormalizedPoeProcessesAndDirectTreeRelations()
    {
        var probe = new ProcessTreeProbe(() =>
        [
            new ProcessTreeProbe.ProcessRecord(
                ProcessId: 10,
                ParentProcessId: null,
                Name: "steam.exe",
                ExecutablePath: @"C:\\Program Files (x86)\\Steam\\steam.exe",
                CommandLine: "\"steam.exe\" -applaunch 2694490"),
            new ProcessTreeProbe.ProcessRecord(
                ProcessId: 101,
                ParentProcessId: 10,
                Name: "PathOfExileSteam.exe",
                ExecutablePath: @"F:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\PathOfExileSteam.exe",
                CommandLine: "\"PathOfExileSteam.exe\" --waitforpreload"),
            new ProcessTreeProbe.ProcessRecord(
                ProcessId: 102,
                ParentProcessId: 101,
                Name: "CrashReporter.exe",
                ExecutablePath: @"F:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\CrashReporter.exe",
                CommandLine: "\"CrashReporter.exe\" --watch 101"),
            new ProcessTreeProbe.ProcessRecord(
                ProcessId: 202,
                ParentProcessId: 20,
                Name: "notepad.exe",
                ExecutablePath: @"C:\\Windows\\System32\\notepad.exe",
                CommandLine: "notepad.exe")
        ]);

        var result = probe.Capture();

        Assert.Equal(1, result["poeProcessCount"]);

        var processes = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["processes"]);
        Assert.Equal(3, processes.Count);

        var byId = processes.ToDictionary(
            process => (int)process["id"]!,
            process => process);

        Assert.Equal(10, byId[101]["parentId"]);
        Assert.Equal(@"F:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\PathOfExileSteam.exe", byId[101]["executablePath"]);
        Assert.Equal("\"PathOfExileSteam.exe\" --waitforpreload", byId[101]["commandLine"]);
        Assert.Equal(true, byId[101]["isPoeProcess"]);

        Assert.Equal("steam.exe", byId[10]["name"]);
        Assert.Equal(false, byId[10]["isPoeProcess"]);

        Assert.Equal(101, byId[102]["parentId"]);
        Assert.Equal(false, byId[102]["isPoeProcess"]);
    }

    [Fact]
    public void Capture_ReturnsEmptyPayloadWhenNoPoeProcessesExist()
    {
        var probe = new ProcessTreeProbe(() =>
        [
            new ProcessTreeProbe.ProcessRecord(
                ProcessId: 202,
                ParentProcessId: 20,
                Name: "notepad.exe",
                ExecutablePath: @"C:\\Windows\\System32\\notepad.exe",
                CommandLine: "notepad.exe")
        ]);

        var result = probe.Capture();

        Assert.Equal(0, result["poeProcessCount"]);

        var processes = Assert.IsAssignableFrom<IReadOnlyList<IReadOnlyDictionary<string, object?>>>(result["processes"]);
        Assert.Empty(processes);
    }
}
