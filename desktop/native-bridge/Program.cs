using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;

var transitionProbe = new TransitionProbe();
var windowProbe = new WindowProbe();
var hintResolver = new HintResolver();
var characterPool = Array.Empty<BridgeCharacterPoolEntry>();
var accountHint = (BridgeAccountHint?)null;
var commandReader = new BridgeCommandReader();

EmitTransitionDiagnostics(transitionProbe);
EmitDiagnostic("window-probe", windowProbe.Capture);

if (Console.IsInputRedirected)
{
    await ProcessBridgeCommandsAsync();
}

async Task ProcessBridgeCommandsAsync()
{
    while (true)
    {
        var command = await commandReader.ReadOneAsync(Console.In);
        if (command is null)
        {
            return;
        }

        if (command.Characters is null)
        {
            continue;
        }

        characterPool = command.Characters.ToArray();
        accountHint = command.AccountHint;
        Console.WriteLine(
            BridgeMessage.Diagnostic(
                "info",
                "character-pool-replaced",
                new Dictionary<string, object?>
                {
                    ["characterCount"] = characterPool.Length
                }).ToJson());

        EmitHintIfAvailable();
    }
}

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

void EmitHintIfAvailable()
{
    if (accountHint is null)
    {
        return;
    }

    try
    {
        var transitionSnapshot = transitionProbe.CaptureProcessSnapshots();
        var processProbeData = TransitionProbe.CreateProcessProbeData(transitionSnapshot);
        var transitionProbeData = TransitionProbe.CreateTransitionProbeData(transitionSnapshot);
        var resolvedHint = hintResolver.Resolve(
            poeVersion: accountHint.PoeVersion,
            processProbe: processProbeData,
            transitionProbe: transitionProbeData,
            characterPool: characterPool,
            accountHint: new Dictionary<string, object?>
            {
                ["characterName"] = accountHint.CharacterName,
                ["className"] = accountHint.ClassName,
                ["level"] = accountHint.Level
            });

        if (resolvedHint is not null)
        {
            Console.WriteLine(resolvedHint.ToJson());
        }
    }
    catch (Exception error)
    {
        Console.WriteLine(
            BridgeMessage.Diagnostic(
                "error",
                "active-character-hint-failed",
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
