using OnlineLib.Extraction.Contracts;
using OnlineLib.Extraction.Enums;
using OnlineLib.Extraction.Extractors;

namespace OnlineLib.Extraction.Registry;

public interface IExtractorRegistry
{
    SourceFormat DetectFormat(ExtractionRequest request);
    ITextExtractor Resolve(ExtractionRequest request);
}
