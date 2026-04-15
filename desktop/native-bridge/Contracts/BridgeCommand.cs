using System.Text.Json;
using System.Text.Json.Serialization;

namespace JuiceJournal.NativeBridge.Contracts;

public sealed record BridgeCommand(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("detectedAt")] DateTimeOffset? DetectedAt,
    [property: JsonPropertyName("characters")] IReadOnlyList<BridgeCharacterPoolEntry>? Characters)
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

            return command.Characters.All(character => character is not null && character.IsValid())
                ? command
                : null;
        }
        catch
        {
            return null;
        }
    }
}
