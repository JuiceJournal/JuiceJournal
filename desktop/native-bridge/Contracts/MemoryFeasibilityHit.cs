namespace JuiceJournal.NativeBridge.Contracts;

public sealed record MemoryFeasibilityHit(
    string Target,
    nuint BaseAddress,
    int Offset,
    string Encoding,
    string Snippet);
