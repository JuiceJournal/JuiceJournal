using System.Text;
using JuiceJournal.NativeBridge.Contracts;

namespace JuiceJournal.NativeBridge.Services;

public sealed class MemoryStringScanner
{
    public IReadOnlyList<MemoryFeasibilityHit> Scan(
        nuint baseAddress,
        byte[] buffer,
        IReadOnlyList<string> targets)
    {
        if (buffer.Length == 0 || targets.Count == 0)
        {
            return [];
        }

        var text = Encoding.UTF8.GetString(buffer);
        var hits = new List<MemoryFeasibilityHit>();

        foreach (var target in targets.Where(target => !string.IsNullOrWhiteSpace(target)))
        {
            var index = text.IndexOf(target, StringComparison.OrdinalIgnoreCase);
            if (index >= 0)
            {
                hits.Add(new MemoryFeasibilityHit(
                    Target: target,
                    BaseAddress: baseAddress,
                    Offset: index,
                    Encoding: "utf8",
                    Snippet: target));
            }
        }

        return hits;
    }
}
