using System.Text.Json;
using System.Text.Json.Serialization;

namespace JuiceJournal.NativeBridge.Contracts;

public sealed record BridgeCommand(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("detectedAt")] DateTimeOffset? DetectedAt,
    [property: JsonPropertyName("characters")] IReadOnlyList<BridgeCharacterPoolEntry>? Characters,
    [property: JsonPropertyName("accountHint")] BridgeAccountHint? AccountHint,
    [property: JsonPropertyName("poeVersion")] string? PoeVersion,
    [property: JsonPropertyName("targets")] IReadOnlyList<string>? Targets)
{
    public static BridgeCommand? Parse(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return null;
        }

        try
        {
            var command = JsonSerializer.Deserialize<BridgeCommand>(line);
            if (command is null)
            {
                return null;
            }

            if (command.Type == "set-character-pool")
            {
                if (command.Characters is null || !command.Characters.All(character => character is not null && character.IsValid()))
                {
                    return null;
                }

                if (command.AccountHint is not null && !command.AccountHint.IsValid())
                {
                    return null;
                }

                return command;
            }

            if (command.Type == "run-memory-feasibility")
            {
                var normalizedVersion = command.PoeVersion?.Trim().ToLowerInvariant();
                if (normalizedVersion is not ("poe1" or "poe2") || command.Targets is null)
                {
                    return null;
                }

                return command with
                {
                    PoeVersion = normalizedVersion,
                    Targets = command.Targets
                        .Where(target => !string.IsNullOrWhiteSpace(target))
                        .Select(target => target.Trim())
                        .ToArray()
                };
            }

            return null;
        }
        catch
        {
            return null;
        }
    }
}
