using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;

var transitionProbe = new TransitionProbe();
var processTreeProbe = new ProcessTreeProbe();
var windowProbe = new WindowProbe();
var identityProbeCoordinator = new IdentityProbeCoordinator();
var hintResolver = new HintResolver();
var characterPool = Array.Empty<BridgeCharacterPoolEntry>();
var accountHint = (BridgeAccountHint?)null;
var commandReader = new BridgeCommandReader();

EmitTransitionDiagnostics(transitionProbe);
EmitDiagnostic("process-tree-probe", processTreeProbe.Capture);
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
        var processTreeData = processTreeProbe.Capture();
        var nativeIdentity = identityProbeCoordinator.TryResolve(
            poeVersion: accountHint.PoeVersion,
            processTreePayload: processTreeData,
            characterPool: characterPool);
        var resolvedHint = hintResolver.Resolve(
            poeVersion: accountHint.PoeVersion,
            processProbe: processTreeData,
            transitionProbe: new Dictionary<string, object?>(),
            characterPool: characterPool,
            nativeIdentity: nativeIdentity,
            accountHint: null);

        if (resolvedHint is not null)
        {
            Console.WriteLine(
                BridgeMessage.Diagnostic(
                    "info",
                    "hint-resolution-promoted",
                    new Dictionary<string, object?>
                    {
                        ["characterName"] = resolvedHint.CharacterName,
                        ["source"] = nativeIdentity?.SourceField
                    }).ToJson());
            Console.WriteLine(resolvedHint.ToJson());
            return;
        }

        Console.WriteLine(
            BridgeMessage.Diagnostic(
                "info",
                "hint-resolution-rejected",
                new Dictionary<string, object?>
                {
                    ["hasAccountHint"] = true,
                    ["hasNativeIdentity"] = nativeIdentity is not null,
                    ["characterPoolCount"] = characterPool.Length
                }).ToJson());
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
