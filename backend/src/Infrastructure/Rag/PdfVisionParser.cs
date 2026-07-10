using Application.Common.Interfaces;
using Application.Rag;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using PDFtoImage;
using TextStack.Ai.Core;
using TextStack.Ai.Rag;

namespace Infrastructure.Rag;

/// <summary>
/// Infrastructure implementation of <see cref="IPdfVisionParser"/> (ADR-012 S3). Lives here because it
/// needs <see cref="IFileStorageService"/> (stored PDF bytes) and <c>PDFtoImage</c> (page render). Each
/// page is rendered to a JPEG at 150 DPI (same lib/DPI as the cover render) then transcribed to Markdown
/// by the vision LLM via the <see cref="ILlmService"/> gateway (FeatureTag <c>pdf.parse</c> → gpt-4.1).
///
/// Rendering (PDFium) is NOT thread-safe, so all pages are rendered sequentially first; the vision calls
/// — the slow, I/O-bound part — then run with bounded parallelism (<see cref="Parallelism"/> = 6). Every
/// failure mode (missing file, render error, per-page vision error, budget hard-stop) degrades to fewer/no
/// pages rather than throwing, so the caller can fall back to deterministic chunking.
/// </summary>
public sealed class PdfVisionParser(
    IFileStorageService storage,
    ILlmService llm,
    IConfiguration config,
    ILogger<PdfVisionParser> logger) : IPdfVisionParser
{
    public const string FeatureTag = "pdf.parse";

    /// <summary>Concurrent vision calls (ADR-012 locked decision).</summary>
    private const int Parallelism = 6;

    private const int RenderDpi = 150;

    /// <summary>A dense page of Markdown is well under this; padded by the client's reasoning reserve.</summary>
    private const int MaxOutputTokens = 4096;

    private const string SystemPrompt =
        "You transcribe a single scanned book/document page to clean GitHub-flavored Markdown. " +
        "Render tables as Markdown tables, preserve headings (with #), lists and reading order. " +
        "Output ONLY the page's Markdown — no commentary, no explanation, and do NOT wrap the whole " +
        "output in a ``` code fence.";

    private const string UserPrompt =
        "Transcribe this page to clean GitHub-flavored Markdown.";

    public async Task<IReadOnlyList<PdfPageMarkdown>> ParseAsync(string storagePath, CancellationToken ct)
    {
        var pdfBytes = await LoadAsync(storagePath, ct);
        if (pdfBytes is null)
            return [];

        var maxPages = config.GetValue("Ai:Pdf:MaxParsePages", 300);
        var jpegs = RenderPages(pdfBytes, maxPages);
        if (jpegs.Count == 0)
            return [];

        // Vision calls with bounded parallelism. Distinct array indices → thread-safe writes.
        var results = new PdfPageMarkdown[jpegs.Count];
        using var gate = new SemaphoreSlim(Parallelism);

        var tasks = jpegs.Select(async pair =>
        {
            var (index, jpeg) = pair;
            await gate.WaitAsync(ct);
            try
            {
                var markdown = await TranscribeAsync(jpeg, ct);
                if (!string.IsNullOrWhiteSpace(markdown))
                    results[index] = new PdfPageMarkdown(index + 1, markdown); // 1-based page
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                // Per-page failure (vision error, budget hard-stop) → skip this page, keep the rest.
                logger.LogWarning(ex, "PDF vision parse failed for page {Page}", index + 1);
            }
            finally
            {
                gate.Release();
            }
        });

        await Task.WhenAll(tasks);

        var pages = results
            .Where(r => !string.IsNullOrWhiteSpace(r.Markdown))
            .OrderBy(r => r.Page)
            .ToList();

        if (pages.Count == 0)
            logger.LogWarning("PDF vision parse produced no pages for {Path}; caller will fall back", storagePath);

        return pages;
    }

    private async Task<byte[]?> LoadAsync(string storagePath, CancellationToken ct)
    {
        try
        {
            await using var stream = await storage.GetFileAsync(storagePath, ct);
            if (stream is null)
            {
                logger.LogWarning("PDF vision parse: stored file not found at {Path}", storagePath);
                return null;
            }
            using var ms = new MemoryStream();
            await stream.CopyToAsync(ms, ct);
            return ms.ToArray();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "PDF vision parse: failed to load stored file {Path}", storagePath);
            return null;
        }
    }

    /// <summary>
    /// Renders each page (up to the cap) to a JPEG, sequentially (PDFium is not thread-safe). Returns
    /// (0-based index, jpeg-bytes) pairs. A whole-document render failure returns an empty list; a single
    /// page's render failure skips that page.
    /// </summary>
    private List<(int Index, byte[] Jpeg)> RenderPages(byte[] pdfBytes, int maxPages)
    {
        int pageCount;
        try
        {
#pragma warning disable CA1416 // Platform compatibility — worker/API run on Linux
            using var countStream = new MemoryStream(pdfBytes);
            pageCount = Conversion.GetPageCount(countStream);
#pragma warning restore CA1416
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "PDF vision parse: could not read page count; falling back");
            return [];
        }

        var cap = Math.Min(pageCount, maxPages);
        if (pageCount > maxPages)
            logger.LogWarning(
                "PDF has {Total} pages; parsing only the first {Cap} (Ai:Pdf:MaxParsePages) — partial index",
                pageCount, maxPages);

        var jpegs = new List<(int, byte[])>(cap);
        for (var i = 0; i < cap; i++)
        {
            try
            {
                using var pdfStream = new MemoryStream(pdfBytes);
                using var imageStream = new MemoryStream();
#pragma warning disable CA1416
                Conversion.SaveJpeg(imageStream, pdfStream, Index.FromStart(i),
                    options: new RenderOptions(Dpi: RenderDpi));
#pragma warning restore CA1416
                var bytes = imageStream.ToArray();
                if (bytes.Length > 0)
                    jpegs.Add((i, bytes));
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "PDF vision parse: render failed for page {Page}", i + 1);
            }
        }

        return jpegs;
    }

    private async Task<string> TranscribeAsync(byte[] jpeg, CancellationToken ct)
    {
        var request = new LlmRequest(
            SystemPrompt: SystemPrompt,
            Messages: [new LlmMessage("user", UserPrompt, Images: [new LlmImage(jpeg, "image/jpeg")])],
            MaxOutputTokens: MaxOutputTokens,
            FeatureTag: FeatureTag);

        var response = await llm.CompleteAsync(request, ct);
        return StripCodeFence(response.Text);
    }

    /// <summary>
    /// Defensive: if the model wraps the whole page in a ```/```markdown fence despite the instruction,
    /// strip the outer fence so the fence markers don't pollute chunk text / heading detection.
    /// </summary>
    private static string StripCodeFence(string text)
    {
        var t = text.Trim();
        if (!t.StartsWith("```", StringComparison.Ordinal))
            return t;

        var firstNewline = t.IndexOf('\n');
        if (firstNewline < 0)
            return t;

        var body = t[(firstNewline + 1)..];
        if (body.EndsWith("```", StringComparison.Ordinal))
            body = body[..^3];

        return body.Trim();
    }
}
