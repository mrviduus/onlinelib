using TextStack.Extraction.Quality;

namespace TextStack.Extraction.Tests;

public class ChapterContentQualityAnalyzerTests
{
    private const string CleanChapter = """
        <h2>The Rise of AI Engineering</h2>
        <p>Foundation models emerged from large language models, which in turn originated as language models.</p>
        <p>While applications like ChatGPT may seem to have come out of nowhere, they are the culmination of decades of advancement.</p>
        <p>This section traces the key breakthroughs that enabled the evolution from language models to AI engineering.</p>
        <p>A language model encodes statistical information about one or more languages in a compact form.</p>
        <p>Intuitively, this information tells us how likely a word is to appear in a given context.</p>
        <p>The statistical nature of language was discovered centuries ago by curious mathematicians.</p>
        """;

    [Fact]
    public void Analyze_CleanChapter_ScoresHighWithNoIssues()
    {
        var report = ChapterContentQualityAnalyzer.Analyze(CleanChapter);

        Assert.Equal(100, report.Score);
        Assert.Empty(report.Issues);
    }

    [Fact]
    public void Analyze_NullOrEmpty_ReturnsClean()
    {
        Assert.Equal(100, ChapterContentQualityAnalyzer.Analyze(null).Score);
        Assert.Equal(100, ChapterContentQualityAnalyzer.Analyze("").Score);
        Assert.Equal(100, ChapterContentQualityAnalyzer.Analyze("   ").Score);
    }

    [Fact]
    public void Analyze_FragmentedParagraphs_FlagsAndScoresLow()
    {
        var html = "<p>about</p><p>new</p><p>possibilities</p><p>and</p><p>new</p>"
                 + "<p>challenges</p><p>which</p><p>are</p>"
                 + "<p>This is one genuine full sentence that ends properly.</p>"
                 + "<p>And here is a second complete sentence with real content.</p>";

        var report = ChapterContentQualityAnalyzer.Analyze(html);

        Assert.Contains(ContentQualityIssue.FragmentedParagraphs, report.Issues);
        Assert.True(report.Score < 60, $"expected low score, got {report.Score}");
    }

    [Fact]
    public void Analyze_FewParagraphs_SkipsFragmentCheck()
    {
        // Below MinParagraphsForFragmentCheck — fragment fraction is too noisy.
        var report = ChapterContentQualityAnalyzer.Analyze("<p>one</p><p>two</p>");

        Assert.DoesNotContain(ContentQualityIssue.FragmentedParagraphs, report.Issues);
    }

    [Fact]
    public void Analyze_RunningHeaderInBody_Flags()
    {
        var html = CleanChapter
                 + "<p>4 | Chapter 1: Introduction to Building AI Applications</p>"
                 + "<p>The Rise of AI Engineering | 5</p>";

        var report = ChapterContentQualityAnalyzer.Analyze(html);

        Assert.Contains(ContentQualityIssue.RunningHeaderInBody, report.Issues);
        Assert.True(report.Score < 100);
    }

    [Fact]
    public void Analyze_RepeatedShortParagraph_FlagsAsRunningHeader()
    {
        var html = CleanChapter
                 + "<p>Introduction to Building AI Applications</p>"
                 + "<p>Introduction to Building AI Applications</p>"
                 + "<p>Introduction to Building AI Applications</p>";

        var report = ChapterContentQualityAnalyzer.Analyze(html);

        Assert.Contains(ContentQualityIssue.RunningHeaderInBody, report.Issues);
    }

    [Fact]
    public void Analyze_HyphenationArtifacts_Flags()
    {
        // U+2010 hyphen + space + lowercase = unmerged line-wrap hyphen.
        var html = CleanChapter
                 + "<p>This text discusses mod‐ els and appli‐ cations and the engi‐ neering process.</p>";

        var report = ChapterContentQualityAnalyzer.Analyze(html);

        Assert.Contains(ContentQualityIssue.HyphenationArtifacts, report.Issues);
    }

    [Fact]
    public void Analyze_RealHyphenatedWords_DoNotFlag()
    {
        // ASCII hyphen with no wrap-space — "self-supervision" is a real word.
        var html = CleanChapter
                 + "<p>Self-supervision and large-scale pre-training are well-known techniques.</p>";

        var report = ChapterContentQualityAnalyzer.Analyze(html);

        Assert.DoesNotContain(ContentQualityIssue.HyphenationArtifacts, report.Issues);
    }

    [Fact]
    public void Analyze_OrphanPageNumbers_Flags()
    {
        var html = CleanChapter + "<p>2</p><p>|</p><p>405</p>";

        var report = ChapterContentQualityAnalyzer.Analyze(html);

        Assert.Contains(ContentQualityIssue.OrphanPageNumbers, report.Issues);
    }

    [Fact]
    public void Analyze_SuspectedFootnotes_Flags()
    {
        var html = CleanChapter
                 + "<p>1 In this book, I use traditional ML to refer to non-foundation models.</p>"
                 + "<p>2 For non-English languages, a character can map to multiple tokens.</p>"
                 + "<p>3 Autoregressive models are sometimes called causal language models.</p>";

        var report = ChapterContentQualityAnalyzer.Analyze(html);

        Assert.Contains(ContentQualityIssue.SuspectedFootnotes, report.Issues);
    }

    [Fact]
    public void Analyze_CombinedGarbage_ScoresVeryLowWithMultipleIssues()
    {
        var html = "<p>about</p><p>new</p><p>possibilities</p><p>and</p><p>chal‐</p>"
                 + "<p>large-scale models bring lenges which matter here today now</p>"
                 + "<p>4 | Chapter 1: Introduction</p><p>2</p><p>|</p>"
                 + "<p>1 A footnote body that leaked into the reading flow here.</p>"
                 + "<p>street</p><p>food</p><p>love</p><p>more</p>";

        var report = ChapterContentQualityAnalyzer.Analyze(html);

        Assert.True(report.Score < 40, $"expected very low score, got {report.Score}");
        Assert.Contains(ContentQualityIssue.FragmentedParagraphs, report.Issues);
        Assert.True(report.Issues.Count >= 2);
    }

    [Fact]
    public void Analyze_NoParagraphs_ReturnsClean()
    {
        var report = ChapterContentQualityAnalyzer.Analyze("<h2>Title</h2><img src=\"x.png\">");

        Assert.Equal(100, report.Score);
        Assert.Empty(report.Issues);
    }
}
