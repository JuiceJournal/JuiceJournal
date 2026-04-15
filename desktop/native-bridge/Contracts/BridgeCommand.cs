using System.Text.Json;
using System.Text.Json.Serialization;

namespace JuiceJournal.NativeBridge.Contracts;

public sealed record BridgeCommand(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("detectedAt")] DateTimeOffset? DetectedAt,
    [property: JsonPropertyName("characters")] IReadOnlyList<BridgeCharacterPoolEntry>? Characters,
    [property: JsonPropertyName("accountHint")] BridgeAccountHint? AccountHint)
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
            if (command?.Type != "set-character-pool" || command.Characters is null)
            {
                return null;
            }

            if (!command.Characters.All(character => character is not null && character.IsValid()))
            {
                return null;
            }

            if (command.AccountHint is not null && !command.AccountHint.IsValid())
            {
                return null;
            }

            return command;
        }
        catch
        {
            return null;
        }
    }
}
