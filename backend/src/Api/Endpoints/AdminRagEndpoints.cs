using Api.Sites;
using Application.Common.Interfaces;
using Application.Rag;
using Contracts.Admin;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;
using TextStack.Ai.EvalSuite;
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
        group.MapPost("/{editionId:guid}/eval", RunEval);
        group.MapPost("/userbook/{id:guid}/eval", RunUserBookEval);
    }

    // User-book RAG eval (P1): live grounding validation for ANY user-uploaded book — no goldens, so it
    // synthesises probes from the book's own chunks (generated grounding + greeting + off-book). Reads
    // PRIVATE user content under admin auth, so it logs the target userId. `judge` = openai (default,
    // Eval:JudgeModel) | ollama. Persists rag.userbook.citation / .behavior / .retrieval EvalRun rows.
    private static async Task<IResult> RunUserBookEval(
        Guid id,
        [FromQuery] int? k,
        [FromQuery] string? judge,
        IServiceProvider services,
        IConfiguration config,
        UserBookRagEvalRunner runner,
        IAppDbContext db,
        ILogger<UserBookRagEvalRunner> logger,
        CancellationToken ct)
    {
        var userId = await db.UserBooks
            .Where(b => b.Id == id)
            .Select(b => (Guid?)b.UserId)
            .FirstOrDefaultAsync(ct);
        if (userId is null)
            return Results.NotFound("Book not found");

        // Privacy note: admin-triggered eval reads this user's private uploaded content.
        logger.LogInformation("admin RAG eval reads private user content for userId {UserId}", userId.Value);

        if (!TryResolve<IRagService>(services, out var rag, out var unavailable))
            return unavailable;

        IRagAskService ask;
        ILlmService generator;
        try
        {
            ask = services.GetRequiredService<IRagAskService>();
            generator = services.GetRequiredService<ILlmService>();
        }
        catch (InvalidOperationException)
        {
            return Results.Problem("Embeddings are not configured (no OpenAI key).", statusCode: 503);
        }

        var useOllama = (judge ?? "openai").Trim().ToLowerInvariant() == "ollama";
        var judgeKey = useOllama ? "ollama" : "openai-judge";
        var judgeModelId = useOllama
            ? config["Ollama:Model"] ?? "gemma4:e2b"
            : config["Eval:JudgeModel"] ?? "gpt-4.1";
        var judgeClient = services.GetRequiredKeyedService<ILlmService>(judgeKey);

        var limit = Math.Clamp(k ?? IRagService.DefaultK, 1, MaxK);
        var gitSha = Environment.GetEnvironmentVariable("GIT_SHA");

        var result = await runner.RunAsync(
            rag, ask, generator, judgeClient, judgeModelId, userId.Value, id,
            probeCount: 6, limit, persist: true, db, gitSha, ct);

        var citation = result.Citation is null
            ? null
            : new RagCitationDto(
                Math.Round(result.Citation.Score, 3),
                Math.Round(result.Citation.SupportRate, 4),
                result.Citation.CitationsJudged,
                result.Citation.AnswersGenerated);

        return Results.Ok(new UserBookRagEvalDto(
            citation,
            Math.Round(result.Retrieval, 4),
            result.ProbeN,
            Math.Round(result.BehaviorPass, 4),
            result.ProbeCases.Select(c => new UserBookProbeDto(c.Question, c.Citations, c.Insufficient)).ToList(),
            result.BehaviorCases.Select(c => new UserBookBehaviorDto(c.Kind, c.Question, c.Pass, c.Note)).ToList(),
            result.Note));
    }

    // Phase 4 DoD gate (AI-027): runs the RAG eval against a real, embedded edition. Retrieval
    // (recall@k + spoiler-leak) is deterministic (no LLM); citation-correctness (AI-027b) generates a
    // grounded answer per question and judges each citation. `judge` selects the LLM judge —
    // openai (default, stronger + independent of the nano generator) | ollama (free) | none
    // (retrieval-only). Persists rag.retrieval / rag.spoiler / rag.citation EvalRun rows.
    private static async Task<IResult> RunEval(
        Guid editionId,
        [FromQuery] int? k,
        [FromQuery] string? judge,
        IServiceProvider services,
        IConfiguration config,
        RagEvalRunner runner,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryResolve<IRagService>(services, out var rag, out var unavailable))
            return unavailable;

        var limit = Math.Clamp(k ?? IRagService.DefaultK, 1, MaxK);
        var gitSha = Environment.GetEnvironmentVariable("GIT_SHA");

        // Resolve the judge unless explicitly disabled. openai-judge runs the stronger Eval:JudgeModel.
        IRagAskService? ask = null;
        ILlmService? judgeClient = null;
        string? judgeModelId = null;
        var judgeChoice = (judge ?? "openai").Trim().ToLowerInvariant();
        if (judgeChoice != "none")
        {
            var useOllama = judgeChoice == "ollama";
            var judgeKey = useOllama ? "ollama" : "openai-judge";
            judgeModelId = useOllama
                ? config["Ollama:Model"] ?? "gemma4:e2b"
                : config["Eval:JudgeModel"] ?? "gpt-4.1";
            ask = services.GetRequiredService<IRagAskService>();
            judgeClient = services.GetRequiredKeyedService<ILlmService>(judgeKey);
        }

        var result = await runner.RunAsync(
            rag, ask, judgeClient, judgeModelId, editionId, limit, persist: true, db, gitSha, ct);

        var citation = result.Citation is null
            ? null
            : new RagCitationDto(
                Math.Round(result.Citation.Score, 3),
                Math.Round(result.Citation.SupportRate, 4),
                result.Citation.CitationsJudged,
                result.Citation.AnswersGenerated);

        return Results.Ok(new RagEvalDto(
            limit,
            Math.Round(result.Recall, 4),
            result.RecallN,
            Math.Round(result.SpoilerLeakRate, 4),
            result.SpoilerN,
            citation,
            result.RecallCases.Select(c => new RagRecallCaseDto(c.Question, c.ExpectedChapterOrd, c.Hit)).ToList(),
            result.SpoilerCases.Select(c => new RagSpoilerCaseDto(c.Question, c.GateChapterOrd, c.LeakCount)).ToList()));
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
        var ctx = await ctxService.BuildAsync(userId, siteId, editionId, q, limit, currentChapterId: null, ct);

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
        // Admin debug runs over catalog editions where chapter_id is always present; Guid.Empty guards
        // the (unreachable here) nullable vision-PDF case rather than widening the debug DTO.
        c.ChunkId, c.ChapterId ?? Guid.Empty, c.ChapterOrd, c.Ord, Math.Round(c.Score, 4),
        c.CharStart, c.CharEnd, Preview(c.Text));

    private static string Preview(string text) =>
        text.Length <= PreviewChars ? text : text[..PreviewChars] + "…";
}
