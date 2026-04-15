using System.Text.Json.Serialization;

namespace JuiceJournal.NativeBridge.Contracts;

public sealed record BridgeAccountHint(
    [property: JsonPropertyName("poeVersion")] string PoeVersion,
    [property: JsonPropertyName("characterName")] string CharacterName,
    [property: JsonPropertyName("className")] string? ClassName,
    [property: JsonPropertyName("level")] int? Level)
{
    public bool IsValid()
    {
        var normalizedVersion = PoeVersion?.Trim().ToLowerInvariant();
        return (normalizedVersion == "poe1" || normalizedVersion == "poe2")
            && !string.IsNullOrWhiteSpace(CharacterName);
    }
}
