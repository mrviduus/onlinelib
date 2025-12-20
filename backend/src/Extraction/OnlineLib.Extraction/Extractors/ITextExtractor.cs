using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;

namespace OnlineLib.Extraction.Extractors;

public interface ITextExtractor
{
    SourceFormat SupportedFormat { get; }
    Task<ExtractionResult> ExtractAsync(ExtractionRequest request, CancellationToken ct = default);
}
