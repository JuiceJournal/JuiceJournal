using JuiceJournal.NativeBridge.Contracts;
using JuiceJournal.NativeBridge.Services;

var transitionProbe = new TransitionProbe();
var processTreeProbe = new ProcessTreeProbe();
var namedPipeProbe = new NamedPipeProbe();
var artifactProbe = new ArtifactProbe();
var windowProbe = new WindowProbe();
var identityProbeCoordinator = new IdentityProbeCoordinator();
var artifactCorrelationCoordinator = new ArtifactCorrelationCoordinator();
var hintResolver = new HintResolver();
var productionConfigParser = new ProductionConfigParser();
var productionStateParser = new ProductionStateParser();
var loadedMtxParser = new LoadedMtxParser();
var memoryProbe = new MemoryProbe();
var memoryStringScanner = new MemoryStringScanner();
var memoryFeasibilityCoordinator = new MemoryFeasibilityCoordinator();
var memoryRegionFingerprintProbe = new MemoryRegionFingerprintProbe();
var memoryTextIslandExtractor = new MemoryTextIslandExtractor();
var memoryNeighborhoodProfiler = new MemoryNeighborhoodProfiler();
var characterPool = Array.Empty<BridgeCharacterPoolEntry>();
var accountHint = (BridgeAccountHint?)null;
var commandReader = new BridgeCommandReader();

EmitTransitionDiagnostics(transitionProbe);
EmitDiagnostic("process-tree-probe", processTreeProbe.Capture);
EmitDiagnostic("named-pipe-probe", namedPipeProbe.Capture);
var startupArtifactData = artifactProbe.Capture();
Console.WriteLine(BridgeMessage.Diagnostic("info", "artifact-probe", startupArtifactData).ToJson());
EmitParsedArtifactDiagnostics(startupArtifactData);
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

        if (command.Type == "run-memory-feasibility")
        {
            RunMemoryFeasibility(command);
            continue;
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

void RunMemoryFeasibility(BridgeCommand command)
{
    var poeVersion = command.PoeVersion?.Trim().ToLowerInvariant();
    var targets = (command.Targets ?? [])
        .Where(target => !string.IsNullOrWhiteSpace(target))
        .Select(target => target.Trim())
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();

    if ((targets.Length == 0) && !string.IsNullOrWhiteSpace(poeVersion))
    {
        targets = characterPool
            .Where(character => string.Equals(character.PoeVersion, poeVersion, StringComparison.OrdinalIgnoreCase))
            .Select(character => character.CharacterName)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    if (poeVersion is not ("poe1" or "poe2"))
    {
        Console.WriteLine(
            BridgeMessage.Diagnostic(
                "info",
                "memory-feasibility-probe",
                new Dictionary<string, object?>
                {
                    ["status"] = "invalid-version",
                    ["poeVersion"] = command.PoeVersion,
                    ["targetCount"] = targets.Length,
                    ["regionCount"] = 0,
                    ["scannedBytes"] = 0UL,
                    ["hitCount"] = 0,
                    ["classification"] = null,
                    ["characterName"] = null,
                    ["source"] = null,
                    ["fingerprints"] = Array.Empty<IReadOnlyDictionary<string, object?>>(),
                    ["hits"] = Array.Empty<IReadOnlyDictionary<string, object?>>(),
                    ["neighborhoods"] = Array.Empty<IReadOnlyDictionary<string, object?>>()
                }).ToJson());
        return;
    }

    var processId = FindPoeProcessId(poeVersion);
    if (processId is null)
    {
        Console.WriteLine(
            BridgeMessage.Diagnostic(
                "info",
                "memory-feasibility-probe",
                new Dictionary<string, object?>
                {
                    ["status"] = "no-process",
                    ["poeVersion"] = poeVersion,
                    ["targetCount"] = targets.Length,
                    ["regionCount"] = 0,
                    ["scannedBytes"] = 0UL,
                    ["hitCount"] = 0,
                    ["classification"] = null,
                    ["characterName"] = null,
                    ["source"] = null,
                    ["fingerprints"] = Array.Empty<IReadOnlyDictionary<string, object?>>(),
                    ["hits"] = Array.Empty<IReadOnlyDictionary<string, object?>>(),
                    ["neighborhoods"] = Array.Empty<IReadOnlyDictionary<string, object?>>()
                }).ToJson());
        return;
    }

    var regions = memoryProbe.CaptureReadableRegions(processId.Value);
    var hits = new List<MemoryFeasibilityHit>();
    var fingerprints = new List<IReadOnlyDictionary<string, object?>>();
    var neighborhoods = new List<IReadOnlyDictionary<string, object?>>();
    ulong scannedBytes = 0;

    foreach (var region in regions.Take(64))
    {
        var buffer = memoryProbe.ReadRegion(processId.Value, region);
        scannedBytes += (ulong)buffer.Length;
        hits.AddRange(memoryStringScanner.Scan(region.BaseAddress, buffer, targets));
        fingerprints.Add(memoryRegionFingerprintProbe.Summarize(region.BaseAddress, buffer));
        var islands = memoryTextIslandExtractor.Extract(buffer);
        neighborhoods.AddRange(memoryNeighborhoodProfiler.BuildProfiles(region.BaseAddress, islands));

        if (hits.Count >= 20 || neighborhoods.Count >= 8 || fingerprints.Count >= 8)
        {
            break;
        }
    }

    var classification = memoryFeasibilityCoordinator.Classify(
        poeVersion,
        hits,
        characterPool);
    var classificationType = classification is not null && classification.TryGetValue("classification", out var classificationValue)
        ? classificationValue as string
        : null;
    var classificationCharacterName = classification is not null && classification.TryGetValue("characterName", out var classificationCharacterValue)
        ? classificationCharacterValue as string
        : null;
    var classificationSource = classification is not null && classification.TryGetValue("source", out var classificationSourceValue)
        ? classificationSourceValue as string
        : null;

    Console.WriteLine(
        BridgeMessage.Diagnostic(
            "info",
            "memory-feasibility-probe",
            new Dictionary<string, object?>
            {
                ["status"] = "completed",
                ["poeVersion"] = poeVersion,
                ["processId"] = processId.Value,
                ["targetCount"] = targets.Length,
                ["regionCount"] = regions.Count,
                ["scannedBytes"] = scannedBytes,
                ["hitCount"] = hits.Count,
                ["classification"] = classificationType,
                ["characterName"] = classificationCharacterName,
                ["source"] = classificationSource,
                ["fingerprints"] = fingerprints.Take(8).ToArray(),
                ["hits"] = hits
                    .Take(10)
                    .Select(hit => new Dictionary<string, object?>
                    {
                        ["target"] = hit.Target,
                        ["baseAddress"] = $"0x{hit.BaseAddress:X}",
                        ["offset"] = hit.Offset,
                        ["encoding"] = hit.Encoding,
                        ["snippet"] = hit.Snippet
                    })
                    .ToArray(),
                ["neighborhoods"] = neighborhoods.Take(8).ToArray()
            }).ToJson());
}

int? FindPoeProcessId(string poeVersion)
{
    var processTreeData = processTreeProbe.Capture();
    if (!processTreeData.TryGetValue("processes", out var processesValue)
        || processesValue is not IEnumerable<IReadOnlyDictionary<string, object?>> processes)
    {
        return null;
    }

    foreach (var process in processes)
    {
        if (!process.TryGetValue("isPoeProcess", out var isPoeProcessValue)
            || isPoeProcessValue is not true)
        {
            continue;
        }

        var executablePath = process.TryGetValue("executablePath", out var executablePathValue)
            ? executablePathValue as string
            : null;

        if (string.IsNullOrWhiteSpace(executablePath))
        {
            continue;
        }

        var isRequestedVersion = poeVersion == "poe2"
            ? executablePath.Contains("Path of Exile 2", StringComparison.OrdinalIgnoreCase)
            : executablePath.Contains("Path of Exile", StringComparison.OrdinalIgnoreCase)
                && !executablePath.Contains("Path of Exile 2", StringComparison.OrdinalIgnoreCase);

        if (!isRequestedVersion)
        {
            continue;
        }

        if (process.TryGetValue("id", out var idValue) && idValue is int processId)
        {
            return processId;
        }
    }

    return null;
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
        var namedPipeData = namedPipeProbe.Capture();
        var artifactData = artifactProbe.Capture();
        EmitParsedArtifactDiagnostics(artifactData);
        var parsedArtifacts = ParseArtifacts(artifactData);
        var nativeIdentity = identityProbeCoordinator.TryResolve(
            poeVersion: accountHint.PoeVersion,
            processTreePayload: processTreeData,
            namedPipePayload: namedPipeData,
            artifactPayload: artifactData,
            characterPool: characterPool);
        nativeIdentity ??= artifactCorrelationCoordinator.TryResolve(
            poeVersion: accountHint.PoeVersion,
            parsedArtifacts: parsedArtifacts,
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

IReadOnlyList<IReadOnlyDictionary<string, object?>> ParseArtifacts(IReadOnlyDictionary<string, object?> artifactPayload)
{
    if (!artifactPayload.TryGetValue("artifacts", out var artifactsValue)
        || artifactsValue is not IEnumerable<IReadOnlyDictionary<string, object?>> artifacts)
    {
        return [];
    }

    var parsedArtifacts = new List<IReadOnlyDictionary<string, object?>>();
    foreach (var artifact in artifacts)
    {
        var parsed =
            productionConfigParser.TryParse(artifact)
            ?? productionStateParser.TryParse(artifact)
            ?? loadedMtxParser.TryParse(artifact);

        if (parsed is not null)
        {
            parsedArtifacts.Add(parsed);
        }
    }

    return parsedArtifacts;
}

void EmitParsedArtifactDiagnostics(IReadOnlyDictionary<string, object?> artifactPayload)
{
    foreach (var parsed in ParseArtifacts(artifactPayload))
    {
        var kind = parsed.TryGetValue("kind", out var kindValue) ? kindValue as string : null;
        var message = kind switch
        {
            "production-config" => "artifact-config-parse",
            "production-state" => "artifact-state-parse",
            "loaded-mtx" => "artifact-loaded-mtx-parse",
            _ => null
        };

        if (string.IsNullOrWhiteSpace(message))
        {
            continue;
        }

        Console.WriteLine(BridgeMessage.Diagnostic("info", message, parsed).ToJson());
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
