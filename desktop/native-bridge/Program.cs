using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;

var windowProbe = new WindowProbe();
var transitionProbe = new TransitionProbe();
var transitionSnapshot = transitionProbe.CaptureProcessSnapshots();

EmitDiagnostic("process-probe", () => TransitionProbe.CreateProcessProbeData(transitionSnapshot));
EmitDiagnostic("window-probe", windowProbe.Capture);
EmitDiagnostic("transition-probe", () => TransitionProbe.CreateTransitionProbeData(transitionSnapshot));

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
