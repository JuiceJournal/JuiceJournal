using JuiceJournal.NativeBridge.Contracts;

namespace JuiceJournal.NativeBridge.Services;

public sealed class HintResolver
{
    public ActiveCharacterHint? Resolve(
        string poeVersion,
        IReadOnlyDictionary<string, object?> processProbe,
        IReadOnlyDictionary<string, object?> transitionProbe,
        IReadOnlyList<BridgeCharacterPoolEntry>? characterPool = null,
        IReadOnlyDictionary<string, object?>? accountHint = null)
    {
        var normalizedVersion = poeVersion?.Trim().ToLowerInvariant();
        if (normalizedVersion is not ("poe1" or "poe2"))
        {
            return null;
        }

        if (accountHint is null || characterPool is null || characterPool.Count == 0)
        {
            return null;
        }

        if (!processProbe.TryGetValue("poeProcessCount", out var poeProcessCountValue)
            || poeProcessCountValue is not int poeProcessCount
            || poeProcessCount <= 0)
        {
            return null;
        }

        if (accountHint.TryGetValue("characterName", out var characterName)
            && characterName is string name
            && !string.IsNullOrWhiteSpace(name))
        {
            var normalizedName = name.Trim();
            var matches = characterPool
                .Where((character) =>
                    string.Equals(character.PoeVersion?.Trim(), normalizedVersion, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(character.CharacterName?.Trim(), normalizedName, StringComparison.OrdinalIgnoreCase))
                .ToArray();

            if (matches.Length != 1)
            {
                return null;
            }

            var matchedCharacter = matches[0];
            accountHint.TryGetValue("className", out var className);
            accountHint.TryGetValue("level", out var level);

            if (className is string expectedClassName
                && !string.IsNullOrWhiteSpace(expectedClassName)
                && !string.Equals(
                    matchedCharacter.ClassName?.Trim(),
                    expectedClassName.Trim(),
                    StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            int? hintLevel = level is int accountLevel ? accountLevel : null;
            if (hintLevel is not null
                && matchedCharacter.Level is not null
                && matchedCharacter.Level != hintLevel)
            {
                return null;
            }

            return ActiveCharacterHint.Create(
                normalizedVersion,
                matchedCharacter.CharacterName.Trim(),
                matchedCharacter.ClassName,
                matchedCharacter.Level ?? hintLevel);
        }

        return null;
    }
}
