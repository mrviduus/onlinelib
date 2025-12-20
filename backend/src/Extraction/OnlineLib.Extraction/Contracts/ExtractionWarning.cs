using OnlineLib.Extraction.Enums;

namespace OnlineLib.Extraction.Contracts;

public sealed record ExtractionWarning(
    ExtractionWarningCode Code,
    string Message
);
