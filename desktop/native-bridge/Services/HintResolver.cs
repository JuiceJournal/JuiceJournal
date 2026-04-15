using JuiceJournal.NativeBridge.Contracts;

namespace JuiceJournal.NativeBridge.Services;

public sealed class HintResolver
{
    public ActiveCharacterHint? Resolve(
        string poeVersion,
        IReadOnlyDictionary<string, object?> processProbe,
        IReadOnlyDictionary<string, object?> transitionProbe,
        IReadOnlyList<BridgeCharacterPoolEntry>? characterPool = null,
        NativeIdentityEvidence? nativeIdentity = null,
        IReadOnlyDictionary<string, object?>? accountHint = null)
    {
        var normalizedVersion = poeVersion?.Trim().ToLowerInvariant();
        if (normalizedVersion is not ("poe1" or "poe2"))
        {
            return null;
        }

        if (nativeIdentity is null || characterPool is null || characterPool.Count == 0)
        {
            return null;
        }

        if (!processProbe.TryGetValue("poeProcessCount", out var poeProcessCountValue)
            || poeProcessCountValue is not int poeProcessCount
            || poeProcessCount <= 0)
        {
            return null;
        }

        if (!string.Equals(nativeIdentity.PoeVersion, normalizedVersion, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var matches = characterPool
            .Where((character) =>
                string.Equals(character.PoeVersion?.Trim(), normalizedVersion, StringComparison.OrdinalIgnoreCase)
                && string.Equals(character.CharacterName?.Trim(), nativeIdentity.CharacterName?.Trim(), StringComparison.OrdinalIgnoreCase))
            .ToArray();

        if (matches.Length != 1)
        {
            return null;
        }

        var matchedCharacter = matches[0];
        return ActiveCharacterHint.Create(
            normalizedVersion,
            matchedCharacter.CharacterName.Trim(),
            matchedCharacter.ClassName,
            matchedCharacter.Level);
    }
}
