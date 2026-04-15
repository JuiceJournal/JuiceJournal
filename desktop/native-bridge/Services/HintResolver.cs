using JuiceJournal.NativeBridge.Contracts;

namespace JuiceJournal.NativeBridge.Services;

public sealed class HintResolver
{
    public ActiveCharacterHint? Resolve(
        string poeVersion,
        IReadOnlyDictionary<string, object?> processProbe,
        IReadOnlyDictionary<string, object?> transitionProbe,
        IReadOnlyDictionary<string, object?>? accountHint = null)
    {
        if (string.IsNullOrWhiteSpace(poeVersion))
        {
            return null;
        }

        if (accountHint is null)
        {
            return null;
        }

        if (accountHint.TryGetValue("characterName", out var characterName)
            && characterName is string name
            && !string.IsNullOrWhiteSpace(name))
        {
            accountHint.TryGetValue("className", out var className);
            accountHint.TryGetValue("level", out var level);

            return ActiveCharacterHint.Create(
                poeVersion,
                name.Trim(),
                className as string,
                level is int accountLevel ? accountLevel : null);
        }

        return null;
    }
}
