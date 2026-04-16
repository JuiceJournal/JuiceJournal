using JuiceJournal.NativeBridge.Contracts;

namespace JuiceJournal.NativeBridge.Services;

public sealed class MemoryFeasibilityCoordinator
{
    public IReadOnlyDictionary<string, object?>? Classify(
        string poeVersion,
        IReadOnlyList<MemoryFeasibilityHit> hits,
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

        BridgeCharacterPoolEntry? matched = null;
        foreach (var hit in hits)
        {
            var candidate = candidates.FirstOrDefault(character =>
                string.Equals(character.CharacterName, hit.Target, StringComparison.OrdinalIgnoreCase));

            if (candidate is null)
            {
                continue;
            }

            if (matched is null)
            {
                matched = candidate;
            }
            else if (!string.Equals(matched.CharacterId, candidate.CharacterId, StringComparison.Ordinal))
            {
                return null;
            }
        }

        return matched is null
            ? null
            : new Dictionary<string, object?>
            {
                ["classification"] = "direct",
                ["characterName"] = matched.CharacterName,
                ["source"] = "memory"
            };
    }
}
