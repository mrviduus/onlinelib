using Worker.Services;

namespace TextStack.UnitTests;

/// <summary>
/// Enrichment-reliability Part 1: the success-with-gaps merge in <see cref="EnrichmentAgentMetadataGenerator"/>.
/// When the agent SUCCEEDS but returns empty (confidence 0.00, null fields — niche books absent from Open
/// Library) the Ollama single-shot must fill the still-null gaps. Covers agent-wins, Ollama-fills-gaps,
/// no-fallback-when-complete, confidence-null-when-hybrid, and fallback-null-safe.
/// </summary>
public class EnrichmentFallbackMergeTests
{
    private static BookMetadataResult Agent(
        string? genre = null, int? year = null, string? description = null,
        double? confidence = 0.0, string? provenance = "{\"agent\":true}") =>
        new(genre, year, description, confidence, provenance);

    private static BookMetadataResult Ollama(
        string? genre = null, int? year = null, string? description = null) =>
        new(genre, year, description);

    // ---- MergeWithFallback (pure) ----

    [Fact]
    public void MergeWithFallback_AgentValueNonNull_AgentWins()
    {
        var agent = Agent(genre: "Horror", year: 1897, description: "Agent desc", confidence: 0.9);
        var fallback = Ollama(genre: "Fiction", year: 2000, description: "Ollama desc");

        var merged = EnrichmentAgentMetadataGenerator.MergeWithFallback(agent, fallback, needsDescription: true);

        Assert.Equal("Horror", merged.Genre);
        Assert.Equal(1897, merged.PublishedYear);
        Assert.Equal("Agent desc", merged.Description);
        // Nothing sourced from Ollama → keep the agent's confidence + provenance.
        Assert.Equal(0.9, merged.Confidence);
        Assert.Equal("{\"agent\":true}", merged.ProvenanceJson);
    }

    [Fact]
    public void MergeWithFallback_AgentNullFields_OllamaFillsGaps()
    {
        var agent = Agent(genre: null, year: null, description: null, confidence: 0.0);
        var fallback = Ollama(genre: "Science", year: 1988, description: "A book about time.");

        var merged = EnrichmentAgentMetadataGenerator.MergeWithFallback(agent, fallback, needsDescription: true);

        Assert.Equal("Science", merged.Genre);
        Assert.Equal(1988, merged.PublishedYear);
        Assert.Equal("A book about time.", merged.Description);
        // A field came from Ollama → confidence nulled; provenance stays the agent's (v1).
        Assert.Null(merged.Confidence);
        Assert.Equal("{\"agent\":true}", merged.ProvenanceJson);
    }

    [Fact]
    public void MergeWithFallback_HybridFill_ConfidenceNull()
    {
        // Agent nailed genre + year but no description → Ollama fills only the description.
        var agent = Agent(genre: "History", year: 1776, description: null, confidence: 0.8);
        var fallback = Ollama(genre: "Fiction", year: 2020, description: "A founding narrative.");

        var merged = EnrichmentAgentMetadataGenerator.MergeWithFallback(agent, fallback, needsDescription: true);

        Assert.Equal("History", merged.Genre);          // agent wins
        Assert.Equal(1776, merged.PublishedYear);        // agent wins
        Assert.Equal("A founding narrative.", merged.Description); // Ollama fills gap
        Assert.Null(merged.Confidence);                  // any Ollama-sourced field → null
    }

    [Fact]
    public void MergeWithFallback_DescriptionNotNeeded_NotFilledFromOllama()
    {
        // needsDescription=false: even though the agent has no description, Ollama must not fill it,
        // and the fill-check must not null the confidence for a description the caller didn't want.
        var agent = Agent(genre: "Fantasy", year: 1954, description: null, confidence: 0.7);
        var fallback = Ollama(description: "Unwanted description");

        var merged = EnrichmentAgentMetadataGenerator.MergeWithFallback(agent, fallback, needsDescription: false);

        Assert.Null(merged.Description);
        Assert.Equal(0.7, merged.Confidence);
    }

    // ---- ApplyFallbackAsync (gate + null-safe seam) ----

    [Fact]
    public async Task ApplyFallbackAsync_AgentComplete_DoesNotInvokeFallback()
    {
        var agent = Agent(genre: "Horror", year: 1897, description: "Complete.", confidence: 0.9);
        var invoked = false;

        var result = await EnrichmentAgentMetadataGenerator.ApplyFallbackAsync(
            agent, needsDescription: true,
            _ => { invoked = true; return Task.FromResult<BookMetadataResult?>(Ollama(genre: "Fiction")); },
            CancellationToken.None);

        Assert.False(invoked); // no gaps → no (network) Ollama round-trip
        Assert.Same(agent, result);
    }

    [Fact]
    public async Task ApplyFallbackAsync_FallbackReturnsNull_ReturnsAgentUnchanged()
    {
        // Ollama down → factory yields null. Must return the agent's (empty) result, no crash.
        var agent = Agent(genre: null, year: null, description: null, confidence: 0.0);

        var result = await EnrichmentAgentMetadataGenerator.ApplyFallbackAsync(
            agent, needsDescription: true,
            _ => Task.FromResult<BookMetadataResult?>(null),
            CancellationToken.None);

        Assert.Same(agent, result);
        Assert.Null(result.Genre);
        Assert.Equal(0.0, result.Confidence);
    }

    [Fact]
    public async Task ApplyFallbackAsync_GapsPresent_MergesFromFallback()
    {
        var agent = Agent(genre: null, year: null, description: null, confidence: 0.0);

        var result = await EnrichmentAgentMetadataGenerator.ApplyFallbackAsync(
            agent, needsDescription: true,
            _ => Task.FromResult<BookMetadataResult?>(Ollama(genre: "Science", year: 1988, description: "Filled.")),
            CancellationToken.None);

        Assert.Equal("Science", result.Genre);
        Assert.Equal(1988, result.PublishedYear);
        Assert.Equal("Filled.", result.Description);
        Assert.Null(result.Confidence);
    }

    // ---- HasGaps (gate predicate) ----

    [Theory]
    [InlineData("Horror", 1897, "desc", true, false)]  // complete → no gap
    [InlineData(null, 1897, "desc", true, true)]        // missing genre
    [InlineData("Horror", null, "desc", true, true)]    // missing year
    [InlineData("Horror", 1897, null, true, true)]      // missing needed description
    [InlineData("Horror", 1897, null, false, false)]    // description not needed → no gap
    public void HasGaps_Cases(string? genre, int? year, string? description, bool needsDescription, bool expected)
    {
        var agent = Agent(genre, year, description, confidence: 0.5);
        Assert.Equal(expected, EnrichmentAgentMetadataGenerator.HasGaps(agent, needsDescription));
    }
}
