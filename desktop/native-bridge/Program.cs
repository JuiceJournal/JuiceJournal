using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;

var processProbe = new ProcessProbe();
var windowProbe = new WindowProbe();

Console.WriteLine(
    BridgeMessage.Diagnostic("info", "process-probe", processProbe.Capture()).ToJson());

Console.WriteLine(
    BridgeMessage.Diagnostic("info", "window-probe", windowProbe.Capture()).ToJson());
