using JuiceJournal.NativeBridge.Contracts;

namespace JuiceJournal.NativeBridge.Services;

public sealed class IdentityProbeCoordinator
{
    public NativeIdentityEvidence? TryResolve(
        string poeVersion,
        IReadOnlyDictionary<string, object?> processTreePayload,
        IReadOnlyDictionary<string, object?>? namedPipePayload,
        IReadOnlyDictionary<string, object?>? artifactPayload,
        IReadOnlyList<BridgeCharacterPoolEntry>? characterPool)
    {
        var normalizedVersion = poeVersion?.Trim().ToLowerInvariant();
        if (normalizedVersion is not ("poe1" or "poe2"))
        {
            return null;
        }

        if (characterPool is null || characterPool.Count == 0)
        {
            return null;
        }

        var candidates = characterPool
            .Where(character => string.Equals(character.PoeVersion, normalizedVersion, StringComparison.OrdinalIgnoreCase))
            .ToArray();

        var processes = processTreePayload.TryGetValue("processes", out var processesValue)
            && processesValue is IEnumerable<IReadOnlyDictionary<string, object?>> processEntries
            ? processEntries
            : [];

        return TryResolveFromText(
            normalizedVersion,
            processes.Select(process => process.TryGetValue("commandLine", out var value) ? value as string : null)
                .Where(value => !string.IsNullOrWhiteSpace(value))!
                .Cast<string>(),
            candidates,
            "process.commandLine")
            ?? TryResolveFromText(
                normalizedVersion,
                ReadNamedPipeValues(namedPipePayload),
                candidates,
                "pipe.name")
            ?? TryResolveFromText(
                normalizedVersion,
                ReadArtifactValues(artifactPayload),
                candidates,
                "artifact.path");
    }

    private static IEnumerable<string> ReadNamedPipeValues(IReadOnlyDictionary<string, object?>? namedPipePayload)
    {
        if (namedPipePayload is null
            || !namedPipePayload.TryGetValue("pipes", out var pipesValue)
            || pipesValue is not IEnumerable<IReadOnlyDictionary<string, object?>> pipes)
        {
            return [];
        }

        return pipes
            .Select(pipe => pipe.TryGetValue("name", out var value) ? value as string : null)
            .Where(value => !string.IsNullOrWhiteSpace(value))!
            .Cast<string>();
    }

    private static IEnumerable<string> ReadArtifactValues(IReadOnlyDictionary<string, object?>? artifactPayload)
    {
        if (artifactPayload is null
            || !artifactPayload.TryGetValue("artifacts", out var artifactsValue)
            || artifactsValue is not IEnumerable<IReadOnlyDictionary<string, object?>> artifacts)
        {
            return [];
        }

        return artifacts
            .Select(artifact => artifact.TryGetValue("path", out var value) ? value as string : null)
            .Where(value => !string.IsNullOrWhiteSpace(value))!
            .Cast<string>();
    }

    private static NativeIdentityEvidence? TryResolveFromText(
        string normalizedVersion,
        IEnumerable<string> values,
        IReadOnlyList<BridgeCharacterPoolEntry> candidates,
        string sourceField)
    {
        BridgeCharacterPoolEntry? matchedCharacter = null;

        foreach (var value in values.Where(value => !string.IsNullOrWhiteSpace(value)))
        {
            var matches = candidates
                .Where(character => value.Contains(character.CharacterName, StringComparison.OrdinalIgnoreCase))
                .ToArray();

            foreach (var match in matches)
            {
                if (matchedCharacter is null)
                {
                    matchedCharacter = match;
                    continue;
                }

                if (!string.Equals(matchedCharacter.CharacterId, match.CharacterId, StringComparison.Ordinal))
                {
                    return null;
                }
            }
        }

        return matchedCharacter is null
            ? null
            : new NativeIdentityEvidence(
                normalizedVersion,
                matchedCharacter.CharacterName,
                matchedCharacter.ClassName,
                matchedCharacter.Level,
                sourceField);
    }
}
