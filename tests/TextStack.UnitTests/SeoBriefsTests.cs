using Application.Agents;

namespace TextStack.UnitTests;

/// <summary>
/// AI-043 — pure mapping tests for <see cref="SeoBriefs.For"/>: correct character bounds per (entity, field),
/// the shared banned-phrase list, a DISTILLED style guide (never the raw DB template with {{placeholders}}),
/// and the target language threaded through. v1 supports only edition/description and author/bio.
/// </summary>
public class SeoBriefsTests
{
    [Fact]
    public void For_EditionDescription_CorrectBoundsAndMetadata()
    {
        var brief = SeoBriefs.For("edition", "description", "uk");

        Assert.Equal("edition", brief.EntityType);
        Assert.Equal("description", brief.FieldName);
        Assert.Equal(SeoBriefs.EditionDescriptionMin, brief.MinLength);
        Assert.Equal(SeoBriefs.EditionDescriptionMax, brief.MaxLength);
        Assert.Equal(800, brief.MinLength);
        Assert.Equal(1600, brief.MaxLength);
        Assert.Equal("uk", brief.TargetLanguage);
    }

    [Fact]
    public void For_AuthorBio_CorrectBoundsAndMetadata()
    {
        var brief = SeoBriefs.For("author", "bio", "en");

        Assert.Equal("author", brief.EntityType);
        Assert.Equal("bio", brief.FieldName);
        Assert.Equal(SeoBriefs.AuthorBioMin, brief.MinLength);
        Assert.Equal(SeoBriefs.AuthorBioMax, brief.MaxLength);
        Assert.Equal(600, brief.MinLength);
        Assert.Equal(1400, brief.MaxLength);
        Assert.Equal("en", brief.TargetLanguage);
    }

    [Fact]
    public void For_IsCaseInsensitiveOnEntityAndField()
    {
        var brief = SeoBriefs.For("Edition", "Description", "en");
        Assert.Equal("description", brief.FieldName);
        Assert.Equal(SeoBriefs.EditionDescriptionMin, brief.MinLength);
    }

    [Fact]
    public void For_UsesSharedBannedPhraseList()
    {
        var brief = SeoBriefs.For("edition", "description", "en");
        Assert.Same(CrewBannedPhrases.List, brief.BannedPhrases);
        Assert.Contains("masterpiece", brief.BannedPhrases);
        Assert.Contains("must-read", brief.BannedPhrases);
    }

    [Fact]
    public void For_StyleGuideIsDistilledProseGuide_NotRawTemplate()
    {
        var edition = SeoBriefs.For("edition", "description", "en");
        var author = SeoBriefs.For("author", "bio", "en");

        // Distilled prose guidance — NOT a DB template: no {{placeholders}}, no JSON-output instructions.
        foreach (var brief in new[] { edition, author })
        {
            Assert.NotNull(brief.StyleGuide);
            Assert.DoesNotContain("{{", brief.StyleGuide);
            Assert.DoesNotContain("}}", brief.StyleGuide);
            Assert.DoesNotContain("json", brief.StyleGuide!, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("encyclopedic", brief.StyleGuide!, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("third-person", brief.StyleGuide!, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void For_UnsupportedPair_Throws()
    {
        Assert.Throws<ArgumentException>(() => SeoBriefs.For("genre", "description", "en"));
        Assert.Throws<ArgumentException>(() => SeoBriefs.For("edition", "relevance", "en"));
        Assert.Throws<ArgumentException>(() => SeoBriefs.For("author", "themes", "en"));
    }
}
