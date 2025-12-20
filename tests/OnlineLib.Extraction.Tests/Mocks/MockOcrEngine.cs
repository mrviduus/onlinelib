using OnlineLib.Extraction.Ocr;

namespace OnlineLib.Extraction.Tests.Mocks;

/// <summary>
/// Mock OCR engine for testing.
/// </summary>
public class MockOcrEngine : IOcrEngine
{
    private readonly Func<Stream, string, CancellationToken, Task<OcrPageResult>>? _handler;
    private readonly List<(Stream Image, string Language)> _calls = new();

    public IReadOnlyList<(Stream Image, string Language)> Calls => _calls;

    public MockOcrEngine(string text = "Mock OCR text", double? confidence = 0.9)
    {
        _handler = (_, _, _) => Task.FromResult(new OcrPageResult(text, confidence));
    }

    public MockOcrEngine(Func<Stream, string, CancellationToken, Task<OcrPageResult>> handler)
    {
        _handler = handler ?? throw new ArgumentNullException(nameof(handler));
    }

    public static MockOcrEngine Throwing(Exception ex)
    {
        return new MockOcrEngine((_, _, _) => throw ex);
    }

    public Task<OcrPageResult> RecognizeAsync(Stream image, string language, CancellationToken ct = default)
    {
        _calls.Add((image, language));
        return _handler!(image, language, ct);
    }
}
