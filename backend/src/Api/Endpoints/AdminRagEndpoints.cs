using Contracts.Admin;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Rag;

namespace Api.Endpoints;

/// <summary>
/// Admin debug surface for Phase 4 RAG retrieval (AI-022). Lets an admin inspect which chunks a
/// query retrieves for an edition, before the public Ask + SSE endpoint (AI-025) is built.
/// Vector-only, no spoiler gate yet — admin-only, so returning chunks from any chapter is fine.
/// </summary>
public static class AdminRagEndpoints
{
    private const int MaxK = 50;
    private const int PreviewChars = 160;

    public static void MapAdminRagEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/admin/rag").WithTags("RAG");
        group.MapGet("/{editionId:guid}/search", Search);
    }

    private static async Task<IResult> Search(
        Guid editionId,
        [FromQuery] string? q,
        [FromQuery] int? k,
        IServiceProvider services,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q))
            return Results.BadRequest(new { error = "Query parameter 'q' is required." });

        // Resolved lazily: RagService construction pulls in IEmbeddingService, which throws
        // without an OpenAI key. Surface that as a clean 503 instead of a generic 500.
        IRagService rag;
        try
        {
            rag = services.GetRequiredService<IRagService>();
        }
        catch (InvalidOperationException)
        {
            return Results.Problem("Embeddings are not configured (no OpenAI key).", statusCode: 503);
        }

        var limit = Math.Clamp(k ?? IRagService.DefaultK, 1, MaxK);
        var chunks = await rag.RetrieveAsync(editionId, q, limit, ct);

        var dtos = chunks.Select(c => new RagChunkDto(
            c.ChunkId,
            c.ChapterId,
            c.ChapterOrd,
            c.Ord,
            Math.Round(c.Score, 4),
            c.CharStart,
            c.CharEnd,
            c.Text.Length <= PreviewChars ? c.Text : c.Text[..PreviewChars] + "…")).ToList();

        return Results.Ok(dtos);
    }
}
