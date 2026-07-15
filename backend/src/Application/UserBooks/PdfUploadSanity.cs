namespace Application.UserBooks;

/// <summary>
/// Cheap O(header+tail) structural sanity check for uploaded PDFs. Guards against
/// truncated/interrupted downloads (valid <c>%PDF-</c> header but no <c>startxref</c>/<c>%%EOF</c>
/// tail — e.g. a file uploaded while the browser was still downloading it) being accepted
/// and only failing later at ingestion with a scary "corrupted or password-protected" message.
/// This is a structural smoke test, NOT a real parse — no PdfPig, no full-file scan.
/// </summary>
public static class PdfUploadSanity
{
    // Some generators prepend a UTF-8 BOM or a few junk bytes before %PDF-, so scan the
    // first ~1KB for the header rather than requiring it at offset 0.
    private const int HeaderScanBytes = 1024;

    // The spec puts the trailer in the last 1024 bytes, but real-world files carry trailing
    // junk (extra newlines, appended data). A generous 64KB window keeps false-rejects near
    // zero while still catching a truncated tail.
    private const int TrailerScanBytes = 64 * 1024;

    private static ReadOnlySpan<byte> HeaderMarker => "%PDF-"u8;
    private static ReadOnlySpan<byte> StartXref => "startxref"u8;
    private static ReadOnlySpan<byte> Eof => "%%EOF"u8;

    /// <summary>
    /// True when <paramref name="bytes"/> has a <c>%PDF-</c> header in its first ~1KB AND both
    /// <c>startxref</c> and <c>%%EOF</c> in its last 64KB. False for empty/tiny/truncated input.
    /// </summary>
    public static bool LooksLikeCompletePdf(ReadOnlySpan<byte> bytes)
    {
        var head = bytes.Length <= HeaderScanBytes ? bytes : bytes[..HeaderScanBytes];
        if (head.IndexOf(HeaderMarker) < 0)
            return false;

        var tail = bytes.Length <= TrailerScanBytes ? bytes : bytes[^TrailerScanBytes..];
        return tail.IndexOf(StartXref) >= 0 && tail.IndexOf(Eof) >= 0;
    }
}
