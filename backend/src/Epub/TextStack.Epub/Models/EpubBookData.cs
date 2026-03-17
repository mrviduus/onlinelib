namespace TextStack.Epub.Models;

public class EpubBookData
{
    public required string Title { get; init; }
    public required string Language { get; init; }
    public string? Author { get; init; }
    public string? Description { get; init; }
    public EpubImageData? Cover { get; init; }
    public required IReadOnlyList<EpubChapterData> Chapters { get; init; }
    public IReadOnlyList<EpubImageData> Images { get; init; } = [];
}

public class EpubChapterData
{
    public required int Order { get; init; }
    public required string Title { get; init; }
    public required string Html { get; init; }
}

public class EpubImageData
{
    public required string Id { get; init; }
    public required byte[] Data { get; init; }
    public required string ContentType { get; init; }
    public required string FileName { get; init; }
}
