using Api.Sites;
using Application.Rag;
using Contracts.Admin;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Rag;

namespace Api.Endpoints;

/// <summary>
/// Admin debug surface for Phase 4 RAG retrieval. <c>/search</c> (AI-022) inspects raw vector
/// retrieval, optionally with a synthetic spoiler ceiling; <c>/context</c> (AI-024) runs the full
/// spoiler-safe path for a given user (admin impersonation) — gated chunks + their private corpus.
/// Admin-only. The public Ask + SSE endpoint (AI-025) builds on the same <see cref="RagContextService"/>.
/// </summary>
public static class AdminRagEndpoints
{
    private const int MaxK = 50;
    private const int PreviewChars = 160;

    public static void MapAdminRagEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/admin/rag").WithTags("RAG");
        group.MapGet("/{editionId:guid}/search", Search);
        group.MapGet("/{editionId:guid}/context", Context);
    }

    private static async Task<IResult> Search(
        Guid editionId,
        [FromQuery] string? q,
        [FromQuery] int? k,
        [FromQuery] int? maxChapterOrd,
        IServiceProvider services,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q))
            return Results.BadRequest(new { error = "Query parameter 'q' is required." });

        if (!TryResolve<IRagService>(services, out var rag, out var unavailable))
            return unavailable;

        var limit = Math.Clamp(k ?? IRagService.DefaultK, 1, MaxK);
        var chunks = await rag.RetrieveAsync(editionId, q, limit, maxChapterOrd, ct);

        return Results.Ok(chunks.Select(ToDto).ToList());
    }

    private static async Task<IResult> Context(
        Guid editionId,
        [FromQuery] Guid userId,
        [FromQuery] string? q,
        [FromQuery] int? k,
        HttpContext httpContext,
        IServiceProvider services,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q))
            return Results.BadRequest(new { error = "Query parameter 'q' is required." });
        if (userId == Guid.Empty)
            return Results.BadRequest(new { error = "Query parameter 'userId' is required." });

        if (!TryResolve<RagContextService>(services, out var ctxService, out var unavailable))
            return unavailable;

        var siteId = httpContext.GetSiteId();
        var limit = Math.Clamp(k ?? IRagService.DefaultK, 1, MaxK);
        var ctx = await ctxService.BuildAsync(userId, siteId, editionId, q, limit, ct);

        return Results.Ok(new RagContextDto(
            ctx.LastReadOrd,
            ctx.Chunks.Select(ToDto).ToList(),
            ctx.Notes.Select(n => new PrivateNoteDto(n.ChapterId, n.ChapterOrd, n.Kind, Preview(n.Text))).ToList()));
    }

    // RagService construction pulls in IEmbeddingService, which throws without an OpenAI key —
    // surface that as a clean 503 instead of a generic 500.
    private static bool TryResolve<T>(IServiceProvider services, out T service, out IResult unavailable)
        where T : notnull
    {
        try
        {
            service = services.GetRequiredService<T>();
            unavailable = Results.Empty;
            return true;
        }
        catch (InvalidOperationException)
        {
            service = default!;
            unavailable = Results.Problem("Embeddings are not configured (no OpenAI key).", statusCode: 503);
            return false;
        }
    }

    private static RagChunkDto ToDto(RetrievedChunk c) => new(
        c.ChunkId, c.ChapterId, c.ChapterOrd, c.Ord, Math.Round(c.Score, 4), c.CharStart, c.CharEnd, Preview(c.Text));

    private static string Preview(string text) =>
        text.Length <= PreviewChars ? text : text[..PreviewChars] + "…";
}
