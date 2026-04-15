using System.Text.Json.Serialization;

namespace JuiceJournal.NativeBridge.Contracts;

public sealed record BridgeCharacterPoolEntry(
    [property: JsonPropertyName("poeVersion")] string PoeVersion,
    [property: JsonPropertyName("characterId")] string CharacterId,
    [property: JsonPropertyName("characterName")] string CharacterName,
    [property: JsonPropertyName("className")] string? ClassName,
    [property: JsonPropertyName("ascendancy")] string? Ascendancy,
    [property: JsonPropertyName("level")] int? Level,
    [property: JsonPropertyName("league")] string? League);
