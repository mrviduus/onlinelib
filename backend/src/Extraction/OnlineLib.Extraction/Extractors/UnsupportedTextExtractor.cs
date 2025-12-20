using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;

namespace OnlineLib.Extraction.Extractors;

public sealed class UnsupportedTextExtractor : ITextExtractor
{
    public SourceFormat SupportedFormat => SourceFormat.Unknown;

    public Task<ExtractionResult> ExtractAsync(ExtractionRequest request, CancellationToken ct = default)
    {
        return Task.FromResult(ExtractionResult.Unsupported(request.FileName));
    }
}
