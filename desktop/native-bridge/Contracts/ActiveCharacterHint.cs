using System.Text.Json;
using System.Text.Json.Serialization;

namespace JuiceJournal.NativeBridge.Contracts;

public sealed record ActiveCharacterHint
{
    private static readonly JsonSerializerOptions JsonOptions = new();

    [JsonPropertyName("type")]
    public string Type { get; } = "active-character-hint";

    [JsonPropertyName("poeVersion")]
    public string PoeVersion { get; }

    [JsonPropertyName("characterName")]
    public string CharacterName { get; }

    [JsonPropertyName("className")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ClassName { get; }

    [JsonPropertyName("level")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? Level { get; }

    [JsonPropertyName("confidence")]
    public string Confidence { get; } = "high";

    [JsonPropertyName("source")]
    public string Source { get; } = "local-native-bridge";

    [JsonPropertyName("detectedAt")]
    public DateTimeOffset DetectedAt { get; }

    private ActiveCharacterHint(
        string poeVersion,
        string characterName,
        string? className,
        int? level,
        DateTimeOffset detectedAt)
    {
        PoeVersion = poeVersion;
        CharacterName = characterName;
        ClassName = className;
        Level = level;
        DetectedAt = detectedAt;
    }

    public static ActiveCharacterHint Create(
        string poeVersion,
        string characterName,
        string? className = null,
        int? level = null)
    {
        if (string.IsNullOrWhiteSpace(poeVersion))
        {
            throw new ArgumentException("poeVersion is required.", nameof(poeVersion));
        }

        if (string.IsNullOrWhiteSpace(characterName))
        {
            throw new ArgumentException("characterName is required.", nameof(characterName));
        }

        return new(
            poeVersion.Trim(),
            characterName.Trim(),
            className,
            level,
            DateTimeOffset.UtcNow);
    }

    public string ToJson() => JsonSerializer.Serialize(this, JsonOptions);
}
