using System.Text.Json;
using System.Text.Json.Serialization;

namespace JuiceJournal.NativeBridge.Contracts;

public sealed record BridgeMessage(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("level")] string? Level,
    [property: JsonPropertyName("message")] string? Message,
    [property: JsonPropertyName("detectedAt")] DateTimeOffset DetectedAt,
    [property: JsonPropertyName("data")] IReadOnlyDictionary<string, object?>? Data)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public static BridgeMessage Diagnostic(
        string level,
        string message,
        IReadOnlyDictionary<string, object?>? data = null) =>
        new("bridge-diagnostic", level, message, DateTimeOffset.UtcNow, data);

    public string ToJson() => JsonSerializer.Serialize(this, JsonOptions);
}
