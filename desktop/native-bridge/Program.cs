using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;

var processProbe = new ProcessProbe();
var windowProbe = new WindowProbe();

EmitDiagnostic("process-probe", processProbe.Capture);
EmitDiagnostic("window-probe", windowProbe.Capture);

void EmitDiagnostic(
    string message,
    Func<IReadOnlyDictionary<string, object?>> capture)
{
    try
    {
        Console.WriteLine(
            BridgeMessage.Diagnostic("info", message, capture()).ToJson());
    }
    catch (Exception error)
    {
        Console.WriteLine(
            BridgeMessage.Diagnostic(
                "error",
                $"{message}-failed",
                new Dictionary<string, object?>
                {
                    ["error"] = error.Message
                }).ToJson());
    }
}
