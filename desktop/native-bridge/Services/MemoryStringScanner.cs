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

        var hits = new List<MemoryFeasibilityHit>();
        var utf8Text = Encoding.UTF8.GetString(buffer);
        var utf16Text = Encoding.Unicode.GetString(buffer);

        foreach (var target in targets.Where(target => !string.IsNullOrWhiteSpace(target)))
        {
            var utf8Index = utf8Text.IndexOf(target, StringComparison.OrdinalIgnoreCase);
            if (utf8Index >= 0)
            {
                hits.Add(new MemoryFeasibilityHit(
                    Target: target,
                    BaseAddress: baseAddress,
                    Offset: utf8Index,
                    Encoding: "utf8",
                    Snippet: target));
            }

            var utf16Index = utf16Text.IndexOf(target, StringComparison.OrdinalIgnoreCase);
            if (utf16Index >= 0)
            {
                hits.Add(new MemoryFeasibilityHit(
                    Target: target,
                    BaseAddress: baseAddress,
                    Offset: utf16Index * 2,
                    Encoding: "utf16le",
                    Snippet: target));
            }
        }

        return hits;
    }
}
