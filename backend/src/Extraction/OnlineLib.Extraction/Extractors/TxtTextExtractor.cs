using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;
using OnlineLib.Extraction.Utilities;

namespace OnlineLib.Extraction.Extractors;

public sealed class TxtTextExtractor : ITextExtractor
{
    public SourceFormat SupportedFormat => SourceFormat.Txt;

    public Task<ExtractionResult> ExtractAsync(ExtractionRequest request, CancellationToken ct = default)
    {
        return PlainTextReader.ExtractAsync(request, SourceFormat.Txt, ct);
    }
}
