using Api.Endpoints;

namespace TextStack.UnitTests;

/// <summary>
/// AI-Agent-3 LibrarianEndpoints request validation (FIX 3): a too-short query is rejected BEFORE the agent runs,
/// mirroring the RAG / hybrid-search ≥2-char guard so a 1-char query never burns a multi-call agent run.
/// </summary>
public class LibrarianEndpointsTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ValidateQuery_BlankOrWhitespace_Rejected(string? query) =>
        Assert.Equal("Query is required.", LibrarianEndpoints.ValidateQuery(query));

    [Theory]
    [InlineData("a")]
    [InlineData(" b ")]   // 1 char after trim
    public void ValidateQuery_BelowMinLength_Rejected(string query)
    {
        var error = LibrarianEndpoints.ValidateQuery(query);
        Assert.Contains("at least 2", error);
    }

    [Theory]
    [InlineData("ab")]
    [InlineData("books like 1984")]
    public void ValidateQuery_AtOrAboveMinLength_Accepted(string query) =>
        Assert.Null(LibrarianEndpoints.ValidateQuery(query));

    [Fact]
    public void ValidateQuery_ExceedsMaxLength_Rejected()
    {
        var error = LibrarianEndpoints.ValidateQuery(new string('x', LibrarianEndpoints.MaxQueryLength + 1));
        Assert.Contains("exceeds", error);
    }
}
