using JuiceJournal.NativeBridge.Contracts;

var startedAt = DateTimeOffset.UtcNow;
var message = BridgeMessage.Diagnostic(
    level: "info",
    message: ".NET 10 native bridge started",
    data: new Dictionary<string, object?>
    {
        ["startedAt"] = startedAt
    });

Console.WriteLine(message.ToJson());
