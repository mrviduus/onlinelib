using OnlineLib.Search.Enums;

namespace OnlineLib.Search.Abstractions;

public interface ITextAnalyzer
{
    string Normalize(string text);

    IReadOnlyList<string> Tokenize(string text);

    string GetFtsConfig(SearchLanguage language);

    string StripHtml(string html);
}
