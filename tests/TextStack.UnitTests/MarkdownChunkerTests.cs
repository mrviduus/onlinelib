using TextStack.Ai.Rag;

namespace TextStack.UnitTests;

/// <summary>
/// ADR-012 S3 structure-aware chunking of vision-parsed PDF Markdown. Locks the load-bearing behaviour:
/// headings start new chunks + build the section-path breadcrumb, tables never split mid-row (even when
/// oversized), each chunk carries the physical page of its first line, and offsets slice back.
/// </summary>
public class MarkdownChunkerTests
{
    private static readonly MarkdownChunker Small = new(maxTokens: 40);

    [Fact]
    public void Chunk_NoPages_ReturnsEmpty()
    {
        Assert.Empty(new MarkdownChunker().Chunk([]));
        Assert.Empty(new MarkdownChunker().Chunk([new PdfPageMarkdown(1, "   \n\n  ")]));
    }

    [Fact]
    public void Chunk_HeadingStartsNewChunk_AndCarriesSectionPath()
    {
        var pages = new[]
        {
            new PdfPageMarkdown(1,
                "# Orbit\nIntro prose about the orbit region.\n\n## Infectious\nPreseptal cellulitis notes here."),
        };

        var chunks = Small.Chunk(pages);

        // Each heading opened a distinct chunk.
        Assert.True(chunks.Count >= 2);
        var orbit = chunks.First(c => c.Text.Contains("Intro prose"));
        var infectious = chunks.First(c => c.Text.Contains("Preseptal"));

        Assert.Equal("Orbit", orbit.SectionPath);
        // Nested heading breadcrumb joins parent › child.
        Assert.Equal("Orbit › Infectious", infectious.SectionPath);
    }

    [Fact]
    public void Chunk_SiblingHeading_ReplacesDeeperLevelInPath()
    {
        var pages = new[]
        {
            new PdfPageMarkdown(1,
                "# A\n## A1\nunder a-one.\n## A2\nunder a-two."),
        };

        var chunks = Small.Chunk(pages);

        Assert.Equal("A › A1", chunks.First(c => c.Text.Contains("a-one")).SectionPath);
        // A2 replaces A1 at level 2 (not "A › A1 › A2").
        Assert.Equal("A › A2", chunks.First(c => c.Text.Contains("a-two")).SectionPath);
    }

    [Fact]
    public void Chunk_TableNeverSplitMidRow_EvenWhenOversized()
    {
        // A table whose token count alone exceeds the tiny budget must stay in ONE chunk.
        var table =
            "| Finding | Cause | Note |\n" +
            "|---|---|---|\n" +
            "| Fungal | common after trauma | debride urgently and refer immediately |\n" +
            "| Bacterial | staph or strep | intravenous antibiotics required promptly |\n" +
            "| Viral | herpes zoster | antivirals plus close ophthalmology follow up |";
        var chunks = Small.Chunk([new PdfPageMarkdown(3, table)]);

        // The whole table sits in a single chunk — the delimiter + every body row together.
        var tableChunk = Assert.Single(chunks, c => c.Text.Contains("| Finding |"));
        Assert.Contains("|---|", tableChunk.Text);
        Assert.Contains("Fungal", tableChunk.Text);
        Assert.Contains("Bacterial", tableChunk.Text);
        Assert.Contains("Viral", tableChunk.Text);
    }

    [Fact]
    public void Chunk_AssignsSourcePageOfFirstLine()
    {
        var pages = new[]
        {
            new PdfPageMarkdown(16, "# Chapter One\nContent that lives on page sixteen."),
            new PdfPageMarkdown(17, "# Chapter Two\nContent that lives on page seventeen."),
        };

        var chunks = Small.Chunk(pages);

        Assert.Equal(16, chunks.First(c => c.Text.Contains("sixteen")).SourcePage);
        Assert.Equal(17, chunks.First(c => c.Text.Contains("seventeen")).SourcePage);
    }

    [Fact]
    public void Chunk_RootContent_HasNullSectionPath()
    {
        var chunks = new MarkdownChunker().Chunk([new PdfPageMarkdown(1, "Plain paragraph, no heading at all.")]);

        var chunk = Assert.Single(chunks);
        Assert.Null(chunk.SectionPath);
        Assert.Equal(1, chunk.SourcePage);
    }

    [Fact]
    public void Chunk_OffsetsAndOrdsAreConsistent()
    {
        var pages = new[]
        {
            new PdfPageMarkdown(1, "# H1\nalpha beta gamma delta epsilon zeta eta theta iota kappa.\n" +
                                   "## H2\nlambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega."),
        };

        var chunks = Small.Chunk(pages);

        Assert.True(chunks.Count >= 2);
        for (var i = 0; i < chunks.Count; i++)
        {
            Assert.Equal(i, chunks[i].Ord);                 // 0-based, contiguous
            Assert.True(chunks[i].CharEnd > chunks[i].CharStart);
            Assert.True(chunks[i].TokenCount > 0);
        }
    }

    [Fact]
    public void Chunk_LongProseUnderOneHeading_SplitsButKeepsSectionPath()
    {
        var body = string.Join(' ', Enumerable.Repeat("word", 400));
        var chunks = Small.Chunk([new PdfPageMarkdown(2, "# Section\n" + body)]);

        Assert.True(chunks.Count >= 2, "long body must split into multiple chunks");
        Assert.All(chunks, c => Assert.Equal("Section", c.SectionPath));
    }
}
