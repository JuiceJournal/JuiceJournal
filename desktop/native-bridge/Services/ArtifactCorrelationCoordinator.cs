using JuiceJournal.NativeBridge.Contracts;

namespace JuiceJournal.NativeBridge.Services;

public sealed class ArtifactCorrelationCoordinator
{
    public NativeIdentityEvidence? TryResolve(
        string poeVersion,
        IReadOnlyList<IReadOnlyDictionary<string, object?>> parsedArtifacts,
        IReadOnlyList<BridgeCharacterPoolEntry>? characterPool)
    {
        var normalizedVersion = poeVersion?.Trim().ToLowerInvariant();
        if (normalizedVersion is not ("poe1" or "poe2") || characterPool is null || characterPool.Count == 0)
        {
            return null;
        }

        var candidates = characterPool
            .Where(character => string.Equals(character.PoeVersion, normalizedVersion, StringComparison.OrdinalIgnoreCase))
            .ToArray();

        BridgeCharacterPoolEntry? matchedCharacter = null;
        foreach (var artifact in parsedArtifacts)
        {
            var previewText = artifact.TryGetValue("previewText", out var previewValue)
                ? previewValue as string
                : null;

            if (string.IsNullOrWhiteSpace(previewText))
            {
                continue;
            }

            var matches = candidates
                .Where(character => previewText.Contains(character.CharacterName, StringComparison.OrdinalIgnoreCase))
                .ToArray();

            foreach (var match in matches)
            {
                if (matchedCharacter is null)
                {
                    matchedCharacter = match;
                }
                else if (!string.Equals(matchedCharacter.CharacterId, match.CharacterId, StringComparison.Ordinal))
                {
                    return null;
                }
            }
        }

        return matchedCharacter is null
            ? null
            : new NativeIdentityEvidence(normalizedVersion, matchedCharacter.CharacterName, matchedCharacter.ClassName, matchedCharacter.Level, "artifact.previewText");
    }
}
