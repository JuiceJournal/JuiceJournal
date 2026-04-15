using JuiceJournal.NativeBridge.Contracts;

namespace JuiceJournal.NativeBridge.Services;

public sealed class BridgeCommandReader
{
    public async Task<BridgeCommand?> ReadOneAsync(TextReader input, CancellationToken cancellationToken = default)
    {
        var line = await input.ReadLineAsync(cancellationToken);
        return line is null ? null : BridgeCommand.Parse(line.TrimStart('\uFEFF'));
    }
}
