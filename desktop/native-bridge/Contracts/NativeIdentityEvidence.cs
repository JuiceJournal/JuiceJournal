namespace JuiceJournal.NativeBridge.Contracts;

public sealed record NativeIdentityEvidence(
    string PoeVersion,
    string CharacterName,
    string? ClassName,
    int? Level,
    string SourceField);
