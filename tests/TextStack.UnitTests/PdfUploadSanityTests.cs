using System.Text;
using Application.UserBooks;

namespace TextStack.UnitTests;

// Structural smoke test for the truncated-PDF upload guard (PdfUploadSanity.LooksLikeCompletePdf).
public class PdfUploadSanityTests
{
    private static byte[] Bytes(string s) => Encoding.ASCII.GetBytes(s);

    [Fact]
    public void LooksLikeCompletePdf_HeaderAndTrailer_ReturnsTrue()
    {
        var pdf = Bytes("%PDF-1.7\nbody bytes here\nstartxref\n1234\n%%EOF");
        Assert.True(PdfUploadSanity.LooksLikeCompletePdf(pdf));
    }

    [Fact]
    public void LooksLikeCompletePdf_TruncatedNoTrailer_ReturnsFalse()
    {
        // Valid header but the download was cut off — no startxref/%%EOF tail.
        var pdf = Bytes("%PDF-1.7\nbody bytes but the download stopped right here");
        Assert.False(PdfUploadSanity.LooksLikeCompletePdf(pdf));
    }

    [Fact]
    public void LooksLikeCompletePdf_JunkPrefixWithin1Kb_ReturnsTrue()
    {
        // Some generators prepend a BOM / a few junk bytes before %PDF-.
        var pdf = Bytes("﻿garbage\n%PDF-1.4\nbody\nstartxref\n5\n%%EOF");
        Assert.True(PdfUploadSanity.LooksLikeCompletePdf(pdf));
    }

    [Fact]
    public void LooksLikeCompletePdf_HeaderBeyond1Kb_ReturnsFalse()
    {
        // %PDF- shoved past the 1KB header window doesn't count.
        var pdf = Bytes(new string('x', 2000) + "%PDF-1.7\nstartxref\n1\n%%EOF");
        Assert.False(PdfUploadSanity.LooksLikeCompletePdf(pdf));
    }

    [Fact]
    public void LooksLikeCompletePdf_EofButNoStartxref_ReturnsFalse()
    {
        var pdf = Bytes("%PDF-1.7\nbody\n%%EOF");
        Assert.False(PdfUploadSanity.LooksLikeCompletePdf(pdf));
    }

    [Fact]
    public void LooksLikeCompletePdf_StartxrefButNoEof_ReturnsFalse()
    {
        var pdf = Bytes("%PDF-1.7\nbody\nstartxref\n1234");
        Assert.False(PdfUploadSanity.LooksLikeCompletePdf(pdf));
    }

    [Fact]
    public void LooksLikeCompletePdf_TinyFile_ReturnsFalse()
    {
        Assert.False(PdfUploadSanity.LooksLikeCompletePdf(Bytes("%PDF-")));
    }

    [Fact]
    public void LooksLikeCompletePdf_NotAPdf_ReturnsFalse()
    {
        Assert.False(PdfUploadSanity.LooksLikeCompletePdf(Bytes("<html><body>error page</body></html>")));
    }

    [Fact]
    public void LooksLikeCompletePdf_Empty_ReturnsFalse()
    {
        Assert.False(PdfUploadSanity.LooksLikeCompletePdf(ReadOnlySpan<byte>.Empty));
    }

    [Fact]
    public void LooksLikeCompletePdf_TrailerBeyond64KbWindow_ReturnsFalse()
    {
        // A valid tail buried more than 64KB from the end (huge trailing junk) is treated
        // as truncated — the tail scan only looks at the last 64KB.
        var sb = new StringBuilder();
        sb.Append("%PDF-1.7\nstartxref\n1\n%%EOF");
        sb.Append(new string('z', 70 * 1024));
        Assert.False(PdfUploadSanity.LooksLikeCompletePdf(Bytes(sb.ToString())));
    }
}
