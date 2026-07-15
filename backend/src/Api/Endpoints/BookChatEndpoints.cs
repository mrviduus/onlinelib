using System.Text;
using System.Text.Json;
using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.BookChat;
using Application.Common.Interfaces;
using Application.Rag;
using Contracts.Books;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Rag;

namespace Api.Endpoints;

/// <summary>
/// Persistent Book Chat (NotebookLM-style): ONE chat per user + book, with server-owned history + RAG.
/// The client no longer sends history — the server loads it from <see cref="ConversationMessage"/> rows,
/// threads the rolling <see cref="BookConversation.Summary"/> plus the last few turns into the existing
/// ask seam (<c>RagAskService</c>), streams via the shared <see cref="AskSse"/> wire format (identical to
/// the legacy <c>/books/{id}/ask</c>), and persists the assistant turn server-side on completion. Context
/// is spoiler-gated for catalog editions (toggle-able) and full-book for user uploads; the user's own
/// highlights/notes are always guaranteed context. The legacy ask endpoints are untouched.
/// </summary>
public static class BookChatEndpoints
{
    // Same camelCase JSON as Results.Ok / the SSE done payload, so stored citations round-trip identically.
    private static readonly JsonSerializerOptions CitationJson = new(JsonSerializerDefaults.Web);

    public static void MapBookChatEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/me/chat").WithTags("Book Chat");
        // GET is upsert-on-read (it can INSERT a conversation row), so it carries the chat's own per-IP
        // limiter ("rag.ask", 30/min) rather than staying unthrottled — same family as the POST below.
        group.MapGet("", GetConversation).RequireRateLimiting("rag.ask");
        group.MapPost("/{conversationId:guid}/messages", PostMessage).RequireRateLimiting("rag.ask");
        group.MapPatch("/{conversationId:guid}", ToggleGate);
        group.MapDelete("/{conversationId:guid}/messages", ClearMessages);
    }

    // GET /me/chat?editionId=|userBookId= — the user's conversation for that book, auto-creating an
    // empty one if absent (upsert-on-read). Owner-scoped: a user book must be owned, an edition must exist.
    private static async Task<IResult> GetConversation(
        Guid? editionId,
        Guid? userBookId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId is null) return Results.Unauthorized();

        if (!BookChatHistory.IsValidTarget(editionId, userBookId))
            return Results.BadRequest(new { error = "Provide exactly one of editionId or userBookId." });

        var notFound = await ResolveTargetAsync(db, userId.Value, editionId, userBookId, ct);
        if (notFound is not null) return notFound;

        var conversation = await LoadConversationAsync(db, userId.Value, editionId, userBookId, ct);
        if (conversation is null)
        {
            conversation = NewConversation(userId.Value, httpContext.GetSiteId(), editionId, userBookId);
            db.BookConversations.Add(conversation);
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            {
                // Two simultaneous first-GETs both tried to create the (one-per-user+book) conversation;
                // the filtered-unique index rejected the loser. Drop our pending insert (Remove on an
                // Added entity detaches it) and re-read the row the winner committed, instead of 500ing.
                db.BookConversations.Remove(conversation);
                var existing = await LoadConversationAsync(db, userId.Value, editionId, userBookId, ct);
                if (existing is null) throw;
                conversation = existing;
            }
        }

        var messages = await db.ConversationMessages
            .Where(m => m.ConversationId == conversation.Id)
            .OrderBy(m => m.Ord)
            .Select(m => new { m.Ord, m.Role, m.Content, m.CitationsJson })
            .ToListAsync(ct);

        var dtos = messages
            .Select(m => new ChatMessageDto(m.Ord, m.Role, m.Content, DeserializeCitations(m.CitationsJson)))
            .ToList();

        return Results.Ok(new ChatConversationResponse(
            conversation.Id, conversation.SpoilerGateEnabled, dtos));
    }

    // POST /me/chat/{conversationId}/messages — the ask. Server owns history; persists both turns.
    private static async Task<IResult> PostMessage(
        Guid conversationId,
        ChatAskRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        IServiceProvider services,
        IServiceScopeFactory scopeFactory,
        ILogger<Program> logger,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId is null) return Results.Unauthorized();

        if (string.IsNullOrWhiteSpace(request.Question))
            return Results.BadRequest(new { error = "Question is required." });

        var conversation = await db.BookConversations
            .FirstOrDefaultAsync(c => c.Id == conversationId && c.UserId == userId.Value, ct);
        if (conversation is null) return Results.NotFound("Conversation not found");

        // Both context builders + the ask service pull in the embedder, which throws without an OpenAI key.
        RagAskService ask;
        RagContextService? catalogContext = null;
        UserBookRagContextService? userBookContext = null;
        try
        {
            ask = services.GetRequiredService<RagAskService>();
            if (conversation.EditionId is not null)
                catalogContext = services.GetRequiredService<RagContextService>();
            else
                userBookContext = services.GetRequiredService<UserBookRagContextService>();
        }
        catch (InvalidOperationException)
        {
            return Results.Problem("Chat is not configured (no OpenAI key).", statusCode: 503);
        }

        var siteId = httpContext.GetSiteId();
        // Overview-class questions ("summarize this chapter", "main idea") need broad section coverage,
        // so widen retrieval AND guarantee the precomputed chapter summaries in; pinpoint questions keep k.
        var isOverview = Application.Ai.RagAskPrompt.IsOverviewQuestion(request.Question);
        var k = isOverview ? IRagService.OverviewK : IRagService.DefaultK;

        // Resolve the RAG context exactly like the legacy ask endpoints, honoring the spoiler-gate toggle.
        IReadOnlyList<RetrievedChunk> chunks;
        IReadOnlyList<string> noteTexts;
        int lastReadOrd;
        try
        {
            if (conversation.EditionId is { } editionId)
            {
                var ctx = conversation.SpoilerGateEnabled
                    ? await catalogContext!.BuildAsync(userId.Value, siteId, editionId, request.Question, k, request.CurrentChapterId, isOverview, ct)
                    : await catalogContext!.BuildUngatedAsync(userId.Value, siteId, editionId, request.Question, k, isOverview, ct);
                chunks = ctx.Chunks;
                noteTexts = ctx.Notes.Select(n => n.Text).ToList();
                lastReadOrd = ctx.LastReadOrd;
            }
            else
            {
                // User book: full-book retrieval (no gate — it's the user's own document) + their highlights.
                var ctx = await userBookContext!.BuildAsync(userId.Value, conversation.UserBookId!.Value, request.Question, k, isOverview, ct);
                if (ctx is null) return Results.NotFound("Book not found");
                chunks = ctx.Chunks;
                noteTexts = ctx.Notes.Select(n => n.Text).ToList();
                lastReadOrd = 0;
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return Results.StatusCode(StatusCodes.Status504GatewayTimeout);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Book Chat context build failed");
            return Results.Problem("Chat is temporarily unavailable.", statusCode: 503);
        }

        // No readable context → "insufficient" (no LLM call). Return it live only — persist NOTHING (neither
        // the question nor a canned answer), so a keep-reading nudge never pollutes the saved history.
        if (chunks.Count == 0)
            return InsufficientResult(httpContext, ask, request.Question, noteTexts, lastReadOrd, logger);

        // Assemble server-owned history from PRIOR turns before persisting this question (so the new
        // question isn't double-counted — the ask seam appends it separately).
        var recentTurns = await LoadRecentTurnsAsync(db, conversation.Id, ct);

        var now = DateTimeOffset.UtcNow;
        var userMessage = new ConversationMessage
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            Role = ConversationMessage.RoleUser,
            Content = request.Question,
            CreatedAt = now,
        };
        db.ConversationMessages.Add(userMessage);
        conversation.UpdatedAt = now;

        // Persist the user turn at the next ord. Two concurrent POSTs can compute the same next ord; the
        // UNIQUE (conversation_id, ord) index then rejects the loser with 23505 instead of silently
        // duplicating the ord — recompute maxOrd + retry (bounded) so both turns land at distinct ords.
        int userOrd;
        const int maxOrdAttempts = 3;
        for (var attempt = 1; ; attempt++)
        {
            var maxOrd = await db.ConversationMessages
                .Where(m => m.ConversationId == conversation.Id)
                .Select(m => (int?)m.Ord)
                .MaxAsync(ct);
            userOrd = BookChatHistory.NextOrd(maxOrd);
            userMessage.Ord = userOrd;
            try
            {
                await db.SaveChangesAsync(ct);
                break;
            }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex) && attempt < maxOrdAttempts)
            {
                logger.LogDebug(
                    "Book Chat user-turn ord {Ord} collided (attempt {Attempt}); recomputing", userOrd, attempt);
            }
        }
        var assistantOrd = userOrd + 1;

        var history = BookChatHistory.BuildHistory(conversation.Summary, recentTurns);

        if (AskSse.WantsSse(httpContext))
        {
            // Tee the stream: relay it verbatim to the client (unchanged wire format) while accumulating the
            // answer + citations, then best-effort persist the assistant turn on completion/disconnect.
            return AskSse.Stream(
                httpContext,
                ct2 => TeeAndPersistAsync(
                    ask.StreamAsync(request.Question, chunks, noteTexts, history, lastReadOrd, ct2),
                    scopeFactory, logger, conversation.Id, userOrd, assistantOrd, ct2),
                logger);
        }

        try
        {
            var answer = await ask.AskFromChunksAsync(request.Question, chunks, noteTexts, history, lastReadOrd, ct);
            var citationsJson = SerializeCitations(AskSse.ToCitations(answer.Citations));
            await PersistAssistantAsync(db, conversation, assistantOrd, answer.Answer, citationsJson, ct);
            QueueSummary(scopeFactory, logger, conversation.Id);
            return Results.Ok(AskSse.ToResponse(answer));
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return Results.StatusCode(StatusCodes.Status504GatewayTimeout);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Book Chat answer failed");
            return Results.Problem("Chat is temporarily unavailable.", statusCode: 503);
        }
    }

    // PATCH /me/chat/{conversationId} — flip the spoiler-gate toggle.
    private static async Task<IResult> ToggleGate(
        Guid conversationId,
        ChatToggleRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId is null) return Results.Unauthorized();

        var conversation = await db.BookConversations
            .FirstOrDefaultAsync(c => c.Id == conversationId && c.UserId == userId.Value, ct);
        if (conversation is null) return Results.NotFound("Conversation not found");

        // Turning the gate back ON (false→true): while it was off the user could ask ahead of their
        // reading, and those spoiler turns get folded into the rolling Summary. Re-gating would otherwise
        // re-inject that distilled spoiler into gated history — so drop the summary + watermark here. The
        // raw messages stay; the summarizer rebuilds memory from the (now-gated) turns later.
        if (BookChatHistory.ShouldClearSummaryOnGateChange(
                conversation.SpoilerGateEnabled, request.SpoilerGateEnabled))
        {
            conversation.Summary = null;
            conversation.SummarizedThroughOrd = 0;
        }

        conversation.SpoilerGateEnabled = request.SpoilerGateEnabled;
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { conversation.Id, conversation.SpoilerGateEnabled });
    }

    // DELETE /me/chat/{conversationId}/messages — clear the chat: drop turns, reset summary + watermark,
    // keep the conversation row + its toggle.
    private static async Task<IResult> ClearMessages(
        Guid conversationId,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId is null) return Results.Unauthorized();

        var conversation = await db.BookConversations
            .FirstOrDefaultAsync(c => c.Id == conversationId && c.UserId == userId.Value, ct);
        if (conversation is null) return Results.NotFound("Conversation not found");

        await db.ConversationMessages
            .Where(m => m.ConversationId == conversation.Id)
            .ExecuteDeleteAsync(ct);

        conversation.Summary = null;
        conversation.SummarizedThroughOrd = 0;
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    // ---- context / target resolution ----

    /// <summary>Existence/ownership check for the chat target; returns a problem result to short-circuit, else null.</summary>
    private static async Task<IResult?> ResolveTargetAsync(
        IAppDbContext db, Guid userId, Guid? editionId, Guid? userBookId, CancellationToken ct)
    {
        if (editionId is { } eid)
        {
            var exists = await db.Editions.AnyAsync(e => e.Id == eid, ct);
            return exists ? null : Results.NotFound("Edition not found");
        }

        var owns = await db.UserBooks
            .AnyAsync(b => b.Id == userBookId!.Value && b.UserId == userId && b.TakedownAt == null, ct);
        return owns ? null : Results.NotFound("Book not found");
    }

    private static Task<BookConversation?> LoadConversationAsync(
        IAppDbContext db, Guid userId, Guid? editionId, Guid? userBookId, CancellationToken ct)
        => editionId is { } eid
            ? db.BookConversations.FirstOrDefaultAsync(c => c.UserId == userId && c.EditionId == eid, ct)
            : db.BookConversations.FirstOrDefaultAsync(c => c.UserId == userId && c.UserBookId == userBookId, ct);

    private static BookConversation NewConversation(Guid userId, Guid siteId, Guid? editionId, Guid? userBookId)
    {
        var now = DateTimeOffset.UtcNow;
        return new BookConversation
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            SiteId = siteId,
            EditionId = editionId,
            UserBookId = userBookId,
            SpoilerGateEnabled = BookChatHistory.DefaultSpoilerGate(isEdition: editionId is not null),
            SummarizedThroughOrd = 0,
            CreatedAt = now,
            UpdatedAt = now,
        };
    }

    /// <summary>The last <see cref="RagAskHistory.MaxTurns"/> persisted turns, oldest-first, as history DTOs.</summary>
    private static async Task<IReadOnlyList<AskTurnDto>> LoadRecentTurnsAsync(
        IAppDbContext db, Guid conversationId, CancellationToken ct)
    {
        var rows = await db.ConversationMessages
            .Where(m => m.ConversationId == conversationId)
            .OrderByDescending(m => m.Ord)
            .Take(Application.Ai.RagAskHistory.MaxTurns)
            .Select(m => new { m.Ord, m.Role, m.Content })
            .ToListAsync(ct);

        return rows
            .OrderBy(r => r.Ord)
            .Select(r => new AskTurnDto(r.Role, r.Content))
            .ToList();
    }

    // ---- insufficient (no-LLM) live response, no persistence ----

    private static IResult InsufficientResult(
        HttpContext httpContext, RagAskService ask, string question,
        IReadOnlyList<string> noteTexts, int lastReadOrd, ILogger logger)
    {
        if (AskSse.WantsSse(httpContext))
            return AskSse.Stream(
                httpContext,
                ct2 => ask.StreamAsync(question, [], noteTexts, [], lastReadOrd, ct2),
                logger);

        // JSON: empty chunks → the service returns the insufficient answer without an LLM call.
        return Results.Ok(AskSse.ToResponse(
            new Application.Rag.AskAnswer(InsufficientJsonAnswer, [], lastReadOrd, Insufficient: true)));
    }

    // The service's InsufficientMessage is private; the JSON path mirrors its text (SSE reuses the service).
    private const string InsufficientJsonAnswer =
        "I don't see enough of this book in what you've read so far to answer that yet. " +
        "Keep reading and ask me again — I'll be here.";

    // ---- assistant persistence + rolling summary ----

    private static async Task PersistAssistantAsync(
        IAppDbContext db, BookConversation conversation, int assistantOrd,
        string content, string? citationsJson, CancellationToken ct)
    {
        db.ConversationMessages.Add(new ConversationMessage
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            Ord = assistantOrd,
            Role = ConversationMessage.RoleAssistant,
            Content = content,
            CitationsJson = citationsJson,
            CreatedAt = DateTimeOffset.UtcNow,
        });
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Relays the ask stream verbatim (unchanged SSE wire format) while accumulating the answer text +
    /// terminal citations, then decides the persist action from what streamed (see
    /// <see cref="BookChatHistory.ResolvePersistAction"/>) in a fresh DI scope (the request scope may be
    /// gone): a clean answer is persisted verbatim; a fault after some text is persisted with a truncation
    /// marker; nothing streamed deletes the already-persisted user turn so it doesn't render blank + poison
    /// the next ask's history. Never persists the insufficient case (that path short-circuits earlier and
    /// never records the user turn).
    /// </summary>
    private static async IAsyncEnumerable<Application.Rag.AskStreamItem> TeeAndPersistAsync(
        IAsyncEnumerable<Application.Rag.AskStreamItem> inner,
        IServiceScopeFactory scopeFactory,
        ILogger logger,
        Guid conversationId,
        int userOrd,
        int assistantOrd,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        var text = new StringBuilder();
        string? citationsJson = null;
        var faulted = false;
        var completed = false;
        try
        {
            await foreach (var item in inner.WithCancellation(ct))
            {
                if (item.Error is { Length: > 0 })
                    faulted = true; // upstream surfaced an LLM/provider failure as a terminal error item
                if (item.TextDelta is { Length: > 0 } fragment)
                    text.Append(fragment);
                if (item.Terminal is { } terminal && !terminal.Insufficient)
                    citationsJson = SerializeCitations(AskSse.ToCitations(terminal.Citations));
                yield return item;
            }
            completed = true;
        }
        finally
        {
            // Faulted if the upstream reported an error item OR the enumerator threw before a clean drain
            // (e.g. client disconnect mid-stream cancels the LLM → the answer is genuinely partial). A
            // completed drain with no error item is a normal finish.
            faulted |= !completed;
            DispatchPersist(
                BookChatHistory.ResolvePersistAction(text.Length, faulted),
                scopeFactory, logger, conversationId, userOrd, assistantOrd, text.ToString(), citationsJson);
        }
    }

    /// <summary>Routes the resolved persist action to the right fresh-scope background task.</summary>
    private static void DispatchPersist(
        ChatPersistAction action, IServiceScopeFactory scopeFactory, ILogger logger,
        Guid conversationId, int userOrd, int assistantOrd, string text, string? citationsJson)
    {
        switch (action)
        {
            case ChatPersistAction.Persist:
                QueueAssistantPersist(scopeFactory, logger, conversationId, assistantOrd, text, citationsJson);
                break;
            case ChatPersistAction.PersistTruncated:
                QueueAssistantPersist(
                    scopeFactory, logger, conversationId, assistantOrd,
                    text + BookChatHistory.TruncationMarker, citationsJson);
                break;
            case ChatPersistAction.DeleteUserTurn:
                QueueDeleteUserTurn(scopeFactory, logger, conversationId, userOrd);
                break;
        }
    }

    /// <summary>Fire-and-forget: delete the orphaned user turn (fresh scope, best-effort) when the stream
    /// produced no answer at all, so a lone user row doesn't render blank + pollute the next ask's history.</summary>
    private static void QueueDeleteUserTurn(
        IServiceScopeFactory scopeFactory, ILogger logger, Guid conversationId, int userOrd)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();
                await db.ConversationMessages
                    .Where(m => m.ConversationId == conversationId
                                && m.Ord == userOrd && m.Role == ConversationMessage.RoleUser)
                    .ExecuteDeleteAsync(CancellationToken.None);
            }
            catch (Exception ex)
            {
                logger.LogWarning(
                    ex, "Book Chat orphan user-turn delete failed for {ConversationId} ord {Ord}",
                    conversationId, userOrd);
            }
        });
    }

    /// <summary>Fire-and-forget: persist a streamed assistant turn (fresh scope) + run the summary trigger.</summary>
    private static void QueueAssistantPersist(
        IServiceScopeFactory scopeFactory, ILogger logger,
        Guid conversationId, int assistantOrd, string content, string? citationsJson)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();
                var conversation = await db.BookConversations
                    .FirstOrDefaultAsync(c => c.Id == conversationId, CancellationToken.None);
                if (conversation is null) return;

                // Idempotency guard against a rare double-dispose: skip if this ord already landed.
                var exists = await db.ConversationMessages
                    .AnyAsync(m => m.ConversationId == conversationId && m.Ord == assistantOrd, CancellationToken.None);
                if (!exists)
                {
                    try
                    {
                        await PersistAssistantAsync(db, conversation, assistantOrd, content, citationsJson, CancellationToken.None);
                    }
                    catch (DbUpdateException ex) when (IsUniqueViolation(ex))
                    {
                        // A concurrent writer claimed this assistant ord between the check and our insert
                        // (the UNIQUE ord index caught it). The other turn is authoritative — lose cleanly
                        // and let that winner run the summary trigger (bail rather than re-save our stale
                        // still-Added entity, which would just 23505 again).
                        logger.LogDebug("Book Chat assistant ord {Ord} already persisted concurrently", assistantOrd);
                        return;
                    }
                }

                await SummarizeIfDueAsync(scope.ServiceProvider, db, conversation, logger);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Book Chat streamed-assistant persist failed for {ConversationId}", conversationId);
            }
        });
    }

    /// <summary>Fire-and-forget summary trigger for the JSON path (assistant already persisted synchronously).</summary>
    private static void QueueSummary(IServiceScopeFactory scopeFactory, ILogger logger, Guid conversationId)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();
                var conversation = await db.BookConversations
                    .FirstOrDefaultAsync(c => c.Id == conversationId, CancellationToken.None);
                if (conversation is not null)
                    await SummarizeIfDueAsync(scope.ServiceProvider, db, conversation, logger);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Book Chat summary trigger failed for {ConversationId}", conversationId);
            }
        });
    }

    /// <summary>
    /// Rolling-summary upkeep: when the conversation has accrued <see cref="BookChatHistory.SummaryTriggerGap"/>
    /// ords past the watermark, fold the turns now leaving the live window into the summary via the nano route,
    /// cap it, and advance the watermark. Any failure logs a warning and leaves the summary as-was — chat memory
    /// upkeep never fails the chat.
    /// </summary>
    private static async Task SummarizeIfDueAsync(
        IServiceProvider services, IAppDbContext db, BookConversation conversation, ILogger logger)
    {
        var maxOrd = await db.ConversationMessages
            .Where(m => m.ConversationId == conversation.Id)
            .Select(m => (int?)m.Ord)
            .MaxAsync(CancellationToken.None) ?? 0;

        if (!BookChatHistory.ShouldSummarize(maxOrd, conversation.SummarizedThroughOrd))
            return;

        var watermark = BookChatHistory.NextWatermark(maxOrd);
        var agedOut = await db.ConversationMessages
            .Where(m => m.ConversationId == conversation.Id
                        && m.Ord > conversation.SummarizedThroughOrd && m.Ord <= watermark)
            .OrderBy(m => m.Ord)
            .Select(m => new AskTurnDto(m.Role, m.Content))
            .ToListAsync(CancellationToken.None);

        if (agedOut.Count == 0)
            return;

        try
        {
            var summarizer = services.GetRequiredService<ConversationSummarizer>();
            var merged = await summarizer.SummarizeAsync(conversation.Summary, agedOut, CancellationToken.None);
            if (string.IsNullOrWhiteSpace(merged))
                return;

            conversation.Summary = BookChatHistory.CapSummary(merged);
            conversation.SummarizedThroughOrd = watermark;
            conversation.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(CancellationToken.None);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Book Chat summarize failed for {ConversationId}", conversation.Id);
        }
    }

    // ---- helpers ----

    /// <summary>True iff the update failed on a Postgres UNIQUE violation (SQLSTATE 23505).</summary>
    private static bool IsUniqueViolation(DbUpdateException ex)
        => ex.InnerException is Npgsql.PostgresException { SqlState: "23505" };

    // ---- citation (de)serialization ----

    private static string? SerializeCitations(IReadOnlyList<AskCitation> citations)
        => citations.Count == 0 ? null : JsonSerializer.Serialize(citations, CitationJson);

    private static IReadOnlyList<AskCitation> DeserializeCitations(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return [];
        try
        {
            return JsonSerializer.Deserialize<List<AskCitation>>(json, CitationJson) ?? [];
        }
        catch
        {
            return [];
        }
    }
}
