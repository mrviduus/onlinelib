using TextStack.Extraction.Utilities;

namespace TextStack.Extraction.Tests;

public class BookTitleCleanerTests
{
    [Theory]
    [InlineData(null, null)]
    [InlineData("", "")]
    [InlineData("   ", "   ")]
    public void Clean_NullOrEmpty_ReturnsInput(string? input, string? expected)
    {
        Assert.Equal(expected, BookTitleCleaner.Clean(input));
    }

    [Theory]
    // Plain titles untouched.
    [InlineData("Designing Data-Intensive Applications", "Designing Data-Intensive Applications")]
    [InlineData("Crime and Punishment", "Crime and Punishment")]
    // Real-content parens preserved.
    [InlineData("The C Programming Language (2nd Edition)", "The C Programming Language (2nd Edition)")]
    [InlineData("Refactoring (for beginners)", "Refactoring (for beginners)")]
    // Empty "(for )" — the actual reported bug.
    [InlineData("Designing Data-Intensive Applications (for )", "Designing Data-Intensive Applications")]
    [InlineData("Designing Data-Intensive Applications (for  )", "Designing Data-Intensive Applications")]
    [InlineData("DDIA (for   )", "DDIA")]
    // Leftover Atlas template variables.
    [InlineData("Designing Data-Intensive Applications (for ${atlas.author_email})", "Designing Data-Intensive Applications")]
    [InlineData("DDIA (for ${reader.name})", "DDIA")]
    [InlineData("DDIA (for $reader)", "DDIA")]
    [InlineData("DDIA (for {{name}})", "DDIA")]
    [InlineData("DDIA (for %name)", "DDIA")]
    // Trailing empty parens of any kind.
    [InlineData("Some Book ()", "Some Book")]
    [InlineData("Some Book (   )", "Some Book")]
    // Trailing whitespace cleaned.
    [InlineData("Title (for )   ", "Title")]
    public void Clean_VariousInputs_ReturnsExpected(string input, string expected)
    {
        Assert.Equal(expected, BookTitleCleaner.Clean(input));
    }
}
