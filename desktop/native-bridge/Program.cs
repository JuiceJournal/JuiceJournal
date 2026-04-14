using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;

var probe = new ProcessProbe();
var snapshot = probe.Capture();

Console.WriteLine(BridgeMessage.Diagnostic("info", "process-probe", snapshot).ToJson());
