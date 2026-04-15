using System.Text.Json;
using System.Text.Json.Serialization;

namespace JuiceJournal.NativeBridge.Contracts;

public sealed record ActiveCharacterHint(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("poeVersion")] string PoeVersion,
    [property: JsonPropertyName("characterName")] string CharacterName,
    [property: JsonPropertyName("className")] string? ClassName,
    [property: JsonPropertyName("level")] int? Level,
    [property: JsonPropertyName("confidence")] string Confidence,
    [property: JsonPropertyName("source")] string Source,
    [property: JsonPropertyName("detectedAt")] DateTimeOffset DetectedAt)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public static ActiveCharacterHint Create(
        string poeVersion,
        string characterName,
        string? className = null,
        int? level = null) =>
        new(
            "active-character-hint",
            poeVersion,
            characterName,
            className,
            level,
            "high",
            "local-native-bridge",
            DateTimeOffset.UtcNow);

    public string ToJson() => JsonSerializer.Serialize(this, JsonOptions);
}
