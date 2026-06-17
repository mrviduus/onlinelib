using System.Globalization;
using Application.Recommendations;
using Domain.Enums;

namespace TextStack.UnitTests;

/// <summary>
/// Pure-logic unit tests for AI-055 <see cref="SimilarBooksService"/> — limit clamping, the
/// copied pgvector literal formatter, and the load-bearing enum-ordinal contract baked into the
/// raw SQL (<c>status = 1</c>). The actual cosine NN behavior is covered by the pgvector
/// integration test (SimilarBooksTests).
/// </summary>
public class SimilarBooksServiceTests
{
    [Theory]
    [InlineData(0, 8)]      // <= 0 → default
    [InlineData(-1, 8)]     // negative → default
    [InlineData(-9999, 8)]  // very negative → default
    [InlineData(1, 1)]      // min in-range
    [InlineData(8, 8)]      // default in-range
    [InlineData(24, 24)]    // max in-range
    [InlineData(25, 24)]    // over max → clamp
    [InlineData(9999, 24)]  // way over max → clamp
    public void ClampLimit_VariousInputs_ClampsToOneToTwentyFour(int input, int expected)
    {
        Assert.Equal(expected, SimilarBooksService.ClampLimit(input));
    }

    [Fact]
    public void FormatVector_EmptyVector_ProducesBracketPair()
    {
        Assert.Equal("[]", SimilarBooksService.FormatVector([]));
    }

    [Fact]
    public void FormatVector_KnownValues_ProducesCommaSeparatedBracketLiteral()
    {
        var literal = SimilarBooksService.FormatVector([1.0f, 0.0f, -2.5f]);

        Assert.StartsWith("[", literal);
        Assert.EndsWith("]", literal);
        Assert.Equal("[1,0,-2.5]", literal);
    }

    [Fact]
    public void FormatVector_UsesInvariantCulture_NoCommaDecimalCorruption()
    {
        // Even under a comma-decimal locale the literal must stay dot-decimal / comma-separated,
        // or the pgvector CAST corrupts (e.g. "1,5" would parse as two dims).
        var prev = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = new CultureInfo("de-DE"); // comma decimal separator
            var literal = SimilarBooksService.FormatVector([1.5f, 2.25f]);
            Assert.Equal("[1.5,2.25]", literal);
        }
        finally
        {
            CultureInfo.CurrentCulture = prev;
        }
    }

    [Fact]
    public void FormatVector_RoundTrips_ViaG9ShortestForm()
    {
        float[] original = [0.123456789f, 3.4028235e38f, -1.401298e-45f];
        var literal = SimilarBooksService.FormatVector(original);

        var parsed = literal.Trim('[', ']')
            .Split(',')
            .Select(s => float.Parse(s, CultureInfo.InvariantCulture))
            .ToArray();

        Assert.Equal(original.Length, parsed.Length);
        for (var i = 0; i < original.Length; i++)
            Assert.Equal(original[i], parsed[i]);
    }

    [Fact]
    public void EditionStatusPublished_OrdinalIsOne_MatchesRawSqlStatusFilter()
    {
        // The raw SQL in SimilarBooksService filters `status = 1`. If a future enum reorder moves
        // Published off ordinal 1, this assertion fails loudly so the SQL gets updated in lockstep.
        Assert.Equal(1, (int)EditionStatus.Published);
    }

    [Fact]
    public void EditionStatusOrdinals_DraftAndHiddenAreNotOne_GuardsAgainstLeakOnReorder()
    {
        // The `status = 1` filter is meant to admit ONLY Published. If a reorder moved Draft or
        // Hidden onto ordinal 1, unpublished editions would leak into public similar-results.
        Assert.NotEqual(1, (int)EditionStatus.Draft);
        Assert.NotEqual(1, (int)EditionStatus.Hidden);
    }
}
