using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;

var transitionProbe = new TransitionProbe();
var windowProbe = new WindowProbe();
var hintResolver = new HintResolver();

EmitTransitionDiagnostics(transitionProbe);
EmitDiagnostic("window-probe", windowProbe.Capture);

void EmitTransitionDiagnostics(TransitionProbe probe)
{
    try
    {
        var detectedAt = DateTimeOffset.UtcNow;
        var transitionSnapshot = probe.CaptureProcessSnapshots();
        var processProbeData = TransitionProbe.CreateProcessProbeData(transitionSnapshot);
        var transitionProbeData = TransitionProbe.CreateTransitionProbeData(transitionSnapshot);

        Console.WriteLine(
            new BridgeMessage(
                "bridge-diagnostic",
                "info",
                "process-probe",
                detectedAt,
                processProbeData).ToJson());

        Console.WriteLine(
            new BridgeMessage(
                "bridge-diagnostic",
                "info",
                "transition-probe",
                detectedAt,
                transitionProbeData).ToJson());

        var hint = hintResolver.Resolve(
            poeVersion: "poe2",
            processProbe: processProbeData,
            transitionProbe: transitionProbeData,
            accountHint: null);

        if (hint is not null)
        {
            Console.WriteLine(hint.ToJson());
        }
    }
    catch (Exception error)
    {
        Console.WriteLine(
            BridgeMessage.Diagnostic(
                "error",
                "transition-probe-failed",
                new Dictionary<string, object?>
                {
                    ["error"] = error.Message
                }).ToJson());
    }
}

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
