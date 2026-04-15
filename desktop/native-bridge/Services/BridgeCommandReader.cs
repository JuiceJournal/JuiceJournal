using JuiceJournal.NativeBridge.Contracts;

namespace JuiceJournal.NativeBridge.Services;

public sealed class BridgeCommandReader
{
    public async Task<BridgeCommand?> ReadOneAsync(TextReader input, CancellationToken cancellationToken = default)
    {
        while (true)
        {
            var line = await input.ReadLineAsync(cancellationToken);
            if (line is null)
            {
                return null;
            }

            var command = BridgeCommand.Parse(line.TrimStart('\uFEFF'));
            if (command is not null)
            {
                return command;
            }
        }
    }
}
