using JuiceJournal.NativeBridge.Contracts;

namespace JuiceJournal.NativeBridge.Services;

public sealed class IdentityProbeCoordinator
{
    public NativeIdentityEvidence? TryResolve(
        string poeVersion,
        IReadOnlyDictionary<string, object?> processTreePayload,
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

        if (!processTreePayload.TryGetValue("processes", out var processesValue)
            || processesValue is not IEnumerable<IReadOnlyDictionary<string, object?>> processes)
        {
            return null;
        }

        var candidates = characterPool
            .Where(character => string.Equals(character.PoeVersion, normalizedVersion, StringComparison.OrdinalIgnoreCase))
            .ToArray();

        BridgeCharacterPoolEntry? matchedCharacter = null;

        foreach (var process in processes)
        {
            var commandLine = process.TryGetValue("commandLine", out var commandLineValue)
                ? commandLineValue as string
                : null;

            if (string.IsNullOrWhiteSpace(commandLine))
            {
                continue;
            }

            var matches = candidates
                .Where(character => commandLine.Contains(character.CharacterName, StringComparison.OrdinalIgnoreCase))
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
                "process.commandLine");
    }
}
