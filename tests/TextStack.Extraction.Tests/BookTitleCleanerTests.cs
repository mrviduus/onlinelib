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
    // Word→PDF (Quartz) export titles: strip "Microsoft Word - " prefix,
    // file extension, and the "copy" / version tail.
    [InlineData("Microsoft Word - OSCE Tables 23+24 FINAL copy 5.3.23.docx", "OSCE Tables 23+24 FINAL")]
    [InlineData("Microsoft Word - Report.docx", "Report")]
    [InlineData("Microsoft Word - Report.doc", "Report")]
    [InlineData("Notes.pdf", "Notes")]
    [InlineData("Draft copy", "Draft")]
    [InlineData("Draft copy 2", "Draft")]
    [InlineData("Microsoft Word - Draft copy.docx", "Draft")]
    // En-dash separator variant of the Word prefix.
    [InlineData("Microsoft Word – Chapter Notes.docx", "Chapter Notes")]
    // Preserve normal titles that merely contain the word "copy" mid-string.
    [InlineData("The Copywriter Handbook", "The Copywriter Handbook")]
    public void Clean_VariousInputs_ReturnsExpected(string input, string expected)
    {
        Assert.Equal(expected, BookTitleCleaner.Clean(input));
    }

    // Invisible / format-only chars that EPUB metadata pipelines leave behind.
    [Theory]
    [InlineData("Title (for ​)")]   // zero-width space
    [InlineData("Title (for ‌)")]   // zero-width non-joiner
    [InlineData("Title (for ‍)")]   // zero-width joiner
    [InlineData("Title (for ﻿)")]   // byte-order mark
    [InlineData("Title (for  )")]   // non-breaking space
    [InlineData("Title (for ­)")]   // soft hyphen
    [InlineData("Title (for ​ ​)")] // mix
    [InlineData("Title (for​)")] // NBSP outside parens too
    public void Clean_InvisibleChars_StripsForParens(string input)
    {
        Assert.Equal("Title", BookTitleCleaner.Clean(input));
    }
}
