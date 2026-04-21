using System.Text.Json;
using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Application.ReadingTracking;
using Application.Vocabulary;
using TextStack.Vocabulary;
using TextStack.Vocabulary.Contracts;

namespace Api.Endpoints;

public static class VocabularyEndpoints
{
    private const int MaxWordsPerUser = 5000;
    private const int MaxDistractorPoolSize = 200;

    public static void MapVocabularyEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/me/vocabulary").WithTags("Vocabulary");

        group.MapPost("/words", SaveWord).WithName("SaveVocabularyWord");
        group.MapGet("/words", GetWords).WithName("GetVocabularyWords");
        group.MapDelete("/words/{id:guid}", DeleteWord).WithName("DeleteVocabularyWord");
        group.MapDelete("/words", DeleteAllWords).WithName("DeleteAllVocabularyWords");
        group.MapPatch("/words/{id:guid}", UpdateWord).WithName("UpdateVocabularyWord");
        group.MapGet("/review", GetReviewQueue).WithName("GetVocabularyReview");
        group.MapPost("/review", SubmitReview).WithName("SubmitVocabularyReview");
        group.MapGet("/stats", GetStats).WithName("GetVocabularyStats");
        group.MapGet("/stats/daily", GetDailyStats).WithName("GetDailyVocabularyStats");
        group.MapGet("/words/reader", GetReaderVocab).WithName("GetReaderVocabulary");
        group.MapPut("/words/{id:guid}/known", MarkAsKnown).WithName("MarkVocabularyWordKnown");

        // Anti-spiral settings + unretire (Phase 1)
        group.MapGet("/settings", GetSettings).WithName("GetVocabularySettings");
        group.MapPut("/settings", UpdateSettings).WithName("UpdateVocabularySettings");
        group.MapPost("/words/{id:guid}/unretire", UnretireWord).WithName("UnretireVocabularyWord");

        // Anti-spiral pending buffer (Phase 2)
        group.MapGet("/pending", GetPending).WithName("GetPendingVocabularyWords");
        group.MapPost("/pending/{id:guid}/promote", PromotePending).WithName("PromotePendingVocabularyWord");
        group.MapDelete("/pending/{id:guid}", DismissPending).WithName("DismissPendingVocabularyWord");

        // Anti-spiral lookups bucket (Phase 3 F1)
        group.MapGet("/lookups", GetLookups).WithName("GetWordLookups");
        group.MapPost("/lookups/{id:guid}/promote", PromoteLookup).WithName("PromoteWordLookup");
        group.MapDelete("/lookups/{id:guid}", DismissLookup).WithName("DismissWordLookup");

        // Admin: backfill definitions for words missing them
        app.MapPost("/admin/vocabulary/backfill-definitions", BackfillDefinitions)
            .WithTags("Admin").WithName("BackfillVocabularyDefinitions");
    }

    // --- Save Word ---

    private static async Task<IResult> SaveWord(
        [FromBody] SaveWordRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        DailyCapService dailyCap,
        IFrequencyFilter frequencyFilter,
        IServiceScopeFactory scopeFactory,
        ILogger<IAppDbContext> logger,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        if (string.IsNullOrWhiteSpace(request.Word) || request.Word.Length > 200)
            return Results.BadRequest("Word is required (max 200 chars)");
        if (string.IsNullOrWhiteSpace(request.Language) || request.Language.Length > 8)
            return Results.BadRequest("Language is required");
        // Reject saves without a native language — enrichment (LLM distractors,
        // hint, explanation) silently falls back to book language when native is
        // null, producing explanations in the wrong language. Frontend gates
        // this at WordPopup; this check defends against direct API calls and
        // older clients still sending `undefined`.
        if (string.IsNullOrWhiteSpace(request.NativeLanguage))
            return Results.BadRequest(new { error = "native_language_required" });

        var word = request.Word.Trim().ToLowerInvariant();

        // Dedup: SRS table first, then pending buffer. A word in either bucket
        // is "already saved" from the user's perspective — don't double-insert.
        var existing = await db.VocabularyWords
            .FirstOrDefaultAsync(w => w.UserId == userId && w.SiteId == siteId
                && w.Word == word && w.Language == request.Language, ct);
        if (existing != null)
            return Results.Ok(SaveWordResponse.AlreadySaved(ToDto(existing)));

        var existingPending = await db.PendingVocabularyWords
            .FirstOrDefaultAsync(p => p.UserId == userId && p.SiteId == siteId
                && p.Word == word && p.Language == request.Language, ct);
        if (existingPending != null)
            return Results.Ok(SaveWordResponse.AlreadyPending(existingPending.Id));

        // Hard ceiling — counts both active + pending. Keeps one user from
        // bloating the pending bucket past the vocabulary cap.
        var count = await db.VocabularyWords.CountAsync(
            w => w.UserId == userId && w.SiteId == siteId, ct);
        count += await db.PendingVocabularyWords.CountAsync(
            p => p.UserId == userId && p.SiteId == siteId, ct);
        if (count >= MaxWordsPerUser)
            return Results.Problem("Vocabulary limit reached (5000 words)", statusCode: 429);

        var now = DateTimeOffset.UtcNow;

        // Anti-spiral F1: frequency gate. Rare/OOV words go to WordLookup and
        // never touch SRS. Mid-tier words need 2 taps before joining SRS. The
        // user's FrequencyFilterEnabled setting lets them opt out entirely.
        var filterEnabled = await db.UserVocabularySettings
            .Where(s => s.UserId == userId && s.SiteId == siteId)
            .Select(s => (bool?)s.FrequencyFilterEnabled)
            .FirstOrDefaultAsync(ct) ?? true;

        // Query unconditionally so a user who flips the filter off doesn't leave
        // orphan lookups behind when the same word is next saved to SRS.
        var existingLookup = await db.WordLookups
            .FirstOrDefaultAsync(l => l.UserId == userId && l.SiteId == siteId
                && l.Word == word && l.Language == request.Language, ct);

        int? zipfRank = null;
        double? zipfScore = null;

        if (filterEnabled)
        {
            var currentTaps = existingLookup?.TapCount ?? 0;
            var classification = await frequencyFilter.ClassifyAsync(word, request.Language, currentTaps, ct);
            zipfRank = classification.ZipfRank;
            zipfScore = classification.ZipfScore;

            if (classification.Kind == FrequencyClassKind.LookupOnly)
            {
                var lookup = await UpsertLookupAsync(db, userId, siteId, word, request, zipfRank, now, existingLookup, ct);
                await db.SaveChangesAsync(ct);
                return Results.Ok(SaveWordResponse.Lookup(lookup.Id, classification.Reason ?? "rare_word"));
            }

            if (classification.Kind == FrequencyClassKind.RequiresRetap)
            {
                var lookup = await UpsertLookupAsync(db, userId, siteId, word, request, zipfRank, now, existingLookup, ct);
                await db.SaveChangesAsync(ct);
                var tapsRemaining = Math.Max(0, classification.RequiredTaps - lookup.TapCount);
                return Results.Ok(SaveWordResponse.LookupPending(lookup.Id, tapsRemaining));
            }
            // SrsEligible falls through — lookup cleanup below covers the "was
            // mid-tier, now being promoted to SRS" case.
        }

        // Any path that creates a SRS or Pending row also drops any lingering
        // Lookup — the word isn't reference-only anymore.
        if (existingLookup != null)
            db.WordLookups.Remove(existingLookup);

        // Anti-spiral F2: daily cap on *new* SRS activations. Over-cap goes
        // to pending; reconciler promotes the highest-Priority rows tomorrow.
        var capStatus = await dailyCap.GetStatusAsync(userId, siteId, ct);
        if (capStatus.Remaining <= 0)
        {
            var pending = new PendingVocabularyWord
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                SiteId = siteId,
                Word = word,
                Language = request.Language,
                Translation = request.Translation?.Trim(),
                Definition = request.Definition?.Trim(),
                EditionId = request.EditionId,
                ChapterId = request.ChapterId,
                UserBookId = request.UserBookId,
                Sentence = request.Sentence?.Trim(),
                BookTitle = request.BookTitle?.Trim(),
                ZipfRank = zipfRank,
                ZipfScore = zipfScore,
                Source = "tap",
                CreatedAt = now,
            };
            db.PendingVocabularyWords.Add(pending);
            await db.SaveChangesAsync(ct);
            return Results.Ok(SaveWordResponse.Pending(pending.Id, reason: "daily_cap"));
        }

        var entry = new VocabularyWord
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            SiteId = siteId,
            Word = word,
            Language = request.Language,
            Translation = request.Translation?.Trim(),
            Definition = request.Definition?.Trim(),
            EditionId = request.EditionId,
            ChapterId = request.ChapterId,
            UserBookId = request.UserBookId,
            Sentence = request.Sentence?.Trim(),
            BookTitle = request.BookTitle?.Trim(),
            ZipfRank = zipfRank,
            ZipfScore = zipfScore,
            ActivatedAt = now,  // F2: marks this row as counting toward today's cap.
            Stage = 0,
            IntervalDays = 0,
            ConsecutiveCorrect = 0,
            NextReviewAt = now,
            TotalReviews = 0,
            CorrectReviews = 0,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.VocabularyWords.Add(entry);
        await db.SaveChangesAsync(ct);

        QueueEnrichment(scopeFactory, logger, entry.Id, word, request.Language,
            request.Definition, request.Sentence, request.NativeLanguage!);

        return Results.Ok(SaveWordResponse.Srs(ToDto(entry)));
    }

    // Fire-and-forget enrichment for a just-inserted VocabularyWord. Runs in
    // its own DI scope so it outlives the request scope. Failures log but
    // don't surface — the user already got a success response.
    private static void QueueEnrichment(
        IServiceScopeFactory scopeFactory,
        ILogger logger,
        Guid wordId,
        string wordText,
        string lang,
        string? def,
        string? sent,
        string nativeLang)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var bgDb = scope.ServiceProvider.GetRequiredService<IAppDbContext>();
                var enricher = scope.ServiceProvider.GetRequiredService<IDefinitionEnricher>();
                var generator = scope.ServiceProvider.GetRequiredService<IDistractorGenerator>();

                // Enrich definition from Free Dictionary API if not provided.
                string? enrichedDef = null;
                if (string.IsNullOrWhiteSpace(def))
                {
                    enrichedDef = await enricher.FetchDefinitionAsync(
                        wordText, lang, CancellationToken.None);
                    if (enrichedDef != null)
                    {
                        var w = await bgDb.VocabularyWords.FirstOrDefaultAsync(
                            x => x.Id == wordId, CancellationToken.None);
                        if (w != null)
                        {
                            w.Definition = enrichedDef;
                            await bgDb.SaveChangesAsync(CancellationToken.None);
                        }
                    }
                }

                // Generate distractors + hint + explanation via Ollama.
                var (distractors, hint, explanation) = await generator.GenerateAsync(
                    wordText, lang, enrichedDef ?? def, sent, nativeLang, CancellationToken.None);
                if (distractors?.Count > 0 || hint != null || explanation != null)
                {
                    var w = await bgDb.VocabularyWords.FirstOrDefaultAsync(
                        x => x.Id == wordId, CancellationToken.None);
                    if (w != null)
                    {
                        if (distractors?.Count > 0)
                            w.Distractors = JsonSerializer.Serialize(distractors);
                        if (hint != null)
                            w.Hint = hint;
                        if (explanation != null)
                            w.Explanation = explanation;
                        await bgDb.SaveChangesAsync(CancellationToken.None);
                    }
                }
            }
            catch (HttpRequestException ex)
            {
                logger.LogWarning(ex, "Enrichment failed for word {Word}", wordText);
            }
            catch (TaskCanceledException)
            {
                logger.LogWarning("Enrichment timeout for word {WordText}", wordText);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to enrich word {Word}", wordText);
            }
        });
    }

    // --- List Words ---

    private static async Task<IResult> GetWords(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        [FromQuery] string? stage,
        [FromQuery] string? language,
        [FromQuery] Guid? editionId,
        [FromQuery] string? search,
        [FromQuery] string? sort,
        [FromQuery] DateTimeOffset? reviewedSince,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var query = db.VocabularyWords
            .Where(w => w.UserId == userId && w.SiteId == siteId);

        if (!string.IsNullOrEmpty(stage))
        {
            var stages = stage.Split(',')
                .Select(s => int.TryParse(s.Trim(), out var v) ? v : -1)
                .Where(v => v >= 0)
                .ToList();
            if (stages.Count > 0)
                query = query.Where(w => stages.Contains(w.Stage));
        }

        if (!string.IsNullOrEmpty(language))
            query = query.Where(w => w.Language == language);

        if (editionId.HasValue)
            query = query.Where(w => w.EditionId == editionId.Value);

        if (!string.IsNullOrEmpty(search))
        {
            var s = search.Trim().ToLowerInvariant();
            query = query.Where(w => w.Word.Contains(s) || (w.Translation != null && w.Translation.Contains(s)));
        }

        if (reviewedSince.HasValue)
            query = query.Where(w => w.LastReviewedAt != null && w.LastReviewedAt >= reviewedSince.Value);

        var total = await query.CountAsync(ct);

        query = sort switch
        {
            "alphabetical" => query.OrderBy(w => w.Word),
            "due" => query.OrderBy(w => w.NextReviewAt),
            "stage" => query.OrderByDescending(w => w.Stage).ThenByDescending(w => w.UpdatedAt),
            "lastReviewed" => query.OrderByDescending(w => w.LastReviewedAt),
            _ => query.OrderByDescending(w => w.CreatedAt),
        };

        var items = await query
            .Skip(offset ?? 0)
            .Take(Math.Min(limit ?? 50, 100))
            .Select(w => new VocabWordDto(
                w.Id, w.Word, w.Language, w.Translation, w.Definition,
                w.EditionId, w.ChapterId, w.UserBookId,
                w.Sentence, w.BookTitle, w.Hint,
                w.Stage, w.IntervalDays, w.ConsecutiveCorrect,
                w.NextReviewAt, w.LastReviewedAt,
                w.TotalReviews, w.CorrectReviews,
                w.CreatedAt, w.UpdatedAt))
            .ToListAsync(ct);

        return Results.Ok(new { total, items });
    }

    // --- Delete Word ---

    private static async Task<IResult> DeleteWord(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var word = await FindUserWordAsync(db, id, userId, siteId, ct);
        if (word == null) return Results.NotFound();

        db.VocabularyWords.Remove(word);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    // --- Delete All Words ---

    private static async Task<IResult> DeleteAllWords(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var words = await db.VocabularyWords
            .Where(w => w.UserId == userId && w.SiteId == siteId)
            .ToListAsync(ct);

        db.VocabularyWords.RemoveRange(words);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { deleted = words.Count });
    }

    // --- Update Word ---

    private static async Task<IResult> UpdateWord(
        Guid id,
        [FromBody] UpdateWordRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var word = await FindUserWordAsync(db, id, userId, siteId, ct);
        if (word == null) return Results.NotFound();

        if (request.Translation != null) word.Translation = request.Translation.Trim();
        if (request.Definition != null) word.Definition = request.Definition.Trim();
        word.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        return Results.Ok(ToDto(word));
    }

    // --- Review Queue ---

    private static async Task<IResult> GetReviewQueue(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        IReviewCardBuilder cardBuilder,
        WeeklyBudgetService weeklyBudget,
        [FromQuery] int? limit,
        [FromQuery] string? mode,
        [FromQuery] bool? includeAll,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var now = DateTimeOffset.UtcNow;
        var batchSize = Math.Min(limit ?? 10, 50);

        // Anti-spiral F5: clamp the batch by remaining weekly budget so a user
        // who already reviewed 70 this week sees an empty queue instead of a
        // bottomless backlog. ResetAt is when the oldest review in the 7d
        // window rolls off — frontend shows "back tomorrow at X" messaging.
        var weeklyProgress = await weeklyBudget.GetProgressAsync(userId, siteId, ct);
        var fetchLimit = Math.Min(batchSize, weeklyProgress.Remaining);

        // Retired rows (F4) are hidden from the queue — they already graduated.
        var baseQuery = db.VocabularyWords
            .Where(w => w.UserId == userId && w.SiteId == siteId && !w.IsRetired);

        var totalDue = await baseQuery
            .CountAsync(w => w.NextReviewAt <= now, ct);

        var weeklyProgressDto = ToDto(weeklyProgress);

        if (fetchLimit == 0)
            return Results.Ok(new ReviewQueueResponse([], totalDue, weeklyProgressDto));

        // SRS: return due words first. Tie-break by Priority (F5) — over-
        // budgeted days surface the highest-value words first.
        var dueWords = await baseQuery
            .Where(w => w.NextReviewAt <= now)
            .OrderBy(w => w.NextReviewAt)
            .ThenByDescending(w => w.Priority)
            .Take(fetchLimit)
            .ToListAsync(ct);

        // When no due words and includeAll requested, return non-due words (closest to due first)
        if (dueWords.Count == 0 && includeAll == true)
        {
            dueWords = await baseQuery
                .OrderBy(w => w.NextReviewAt)
                .ThenByDescending(w => w.Priority)
                .Take(fetchLimit)
                .ToListAsync(ct);
        }

        if (dueWords.Count == 0)
            return Results.Ok(new ReviewQueueResponse([], totalDue, weeklyProgressDto));

        // Distractor pool: other user words (capped to prevent OOM). Retired
        // words are fine as distractors — they still belong to the same pool.
        var languages = dueWords.Select(w => w.Language).Distinct().ToList();
        var dueWordIds = dueWords.Select(w => w.Id).ToHashSet();

        var distractorPool = await db.VocabularyWords
            .Where(w => w.UserId == userId && w.SiteId == siteId
                && !dueWordIds.Contains(w.Id)
                && languages.Contains(w.Language))
            .OrderBy(_ => EF.Functions.Random())
            .Take(MaxDistractorPoolSize)
            .Select(w => new DistractorPoolEntry(w.Word, w.Language))
            .ToListAsync(ct);

        var wordsForReview = dueWords.Select(w => new WordForReview(
            w.Id, w.Word, w.Language,
            w.Translation, w.Definition,
            w.Sentence, w.BookTitle, w.Hint,
            w.Explanation, w.Distractors,
            w.Stage, w.TotalReviews)).ToList();

        var cards = cardBuilder.BuildCards(wordsForReview, distractorPool);

        // Map to endpoint DTO
        var cardDtos = cards.Select(c => new ReviewCardDto(
            c.WordId, c.Word, c.Translation, c.Definition,
            c.ReviewMode, c.BlankSentence, c.OriginalSentence, c.BookTitle,
            c.Hint, c.Explanation, c.IsNew, c.Options, c.CorrectOptionIndex)).ToList();

        return Results.Ok(new ReviewQueueResponse(cardDtos, totalDue, weeklyProgressDto));
    }

    // --- Submit Review ---

    private static async Task<IResult> SubmitReview(
        [FromBody] SubmitReviewRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        ISrsEngine srsEngine,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var word = await FindUserWordAsync(db, request.WordId, userId, siteId, ct);
        if (word == null) return Results.NotFound();

        var prevStage = word.Stage;
        var now = DateTimeOffset.UtcNow;

        // Always full SRS calculation
        var (newStage, newInterval, newConsecutive) = srsEngine.Calculate(
            word.Stage, word.ConsecutiveCorrect, word.IntervalDays, request.IsCorrect);
        word.Stage = newStage;
        word.IntervalDays = newInterval;
        word.ConsecutiveCorrect = newConsecutive;
        word.NextReviewAt = now.AddDays(newInterval);

        word.LastReviewedAt = now;
        word.TotalReviews++;
        if (request.IsCorrect) word.CorrectReviews++;
        word.UpdatedAt = now;

        // Anti-spiral F4: retire immediately on threshold cross. Waiting for
        // the 6h sweeper would re-surface the word in the next queue fetch,
        // negating the "Mastered" graduation UX. Respect AutoRetireEnabled —
        // users who disabled it should keep Mastered words reviewable.
        if (!word.IsRetired && srsEngine.ShouldAutoRetire(word.Stage, word.ConsecutiveCorrect, word.IntervalDays))
        {
            var autoRetireEnabled = await db.UserVocabularySettings
                .Where(s => s.UserId == userId && s.SiteId == siteId)
                .Select(s => (bool?)s.AutoRetireEnabled)
                .FirstOrDefaultAsync(ct) ?? true;
            if (autoRetireEnabled)
            {
                word.IsRetired = true;
                word.RetiredAt = now;
                word.RetiredReason = "auto_3_correct_long_interval";
            }
        }

        var reviewMode = srsEngine.GetReviewMode(prevStage, word.Sentence != null);
        var review = new VocabularyReview
        {
            Id = Guid.NewGuid(),
            VocabularyWordId = word.Id,
            UserId = userId,
            SiteId = siteId,
            ReviewMode = reviewMode,
            IsCorrect = request.IsCorrect,
            ResponseTimeMs = request.ResponseTimeMs,
            StageBefore = prevStage,
            StageAfter = newStage,
            CreatedAt = now,
        };

        db.VocabularyReviews.Add(review);
        await db.SaveChangesAsync(ct);

        // Check streak achievements (vocab reviews now count toward streak)
        var streakMinMinutes = await ReadingTrackingEndpoints.GetStreakMinMinutes(db, userId, siteId, ct);
        var currentStreak = await ReadingTrackingEndpoints.CalculateStreak(db, userId, siteId, streakMinMinutes, now, ct);
        await new AchievementChecker(db).CheckAfterReview(userId, siteId, currentStreak, ct);

        return Results.Ok(new SubmitReviewResponse(
            word.Id, prevStage, newStage, prevStage != newStage,
            newInterval, word.NextReviewAt, word.TotalReviews, word.CorrectReviews));
    }

    // --- Stats ---

    private static async Task<IResult> GetStats(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        WeeklyBudgetService weeklyBudget,
        DailyCapService dailyCap,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var now = DateTimeOffset.UtcNow;
        var todayStart = new DateTimeOffset(now.Date, TimeSpan.Zero);

        // Base scope: everything the user owns. Stage breakdown + totalWords
        // keep retired rows (user still wants to see "2000 mastered" even if
        // they no longer appear in the queue).
        var words = db.VocabularyWords
            .Where(w => w.UserId == userId && w.SiteId == siteId);

        var totalWords = await words.CountAsync(ct);

        var byStage = await words
            .GroupBy(w => w.Stage)
            .Select(g => new { Stage = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        var stageDict = byStage.ToDictionary(s => s.Stage, s => s.Count);
        // dueNow intentionally excludes retired rows — matches what the review
        // queue actually returns, so the banner never over-promises work.
        var dueNow = await words.CountAsync(w => !w.IsRetired && w.NextReviewAt <= now, ct);
        var retiredCount = await words.CountAsync(w => w.IsRetired, ct);

        // Single query for today's review stats
        var todayStats = await db.VocabularyReviews
            .Where(r => r.UserId == userId && r.SiteId == siteId && r.CreatedAt >= todayStart)
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Total = g.Count(),
                Correct = g.Count(r => r.IsCorrect),
                Practice = g.Count(r => r.ReviewMode.StartsWith("practice_")),
                PracticeCorrect = g.Count(r => r.ReviewMode.StartsWith("practice_") && r.IsCorrect),
            })
            .FirstOrDefaultAsync(ct);

        var reviewedToday = todayStats?.Total ?? 0;
        var correctToday = todayStats?.Correct ?? 0;
        var practiceToday = todayStats?.Practice ?? 0;
        var practiceCorrectToday = todayStats?.PracticeCorrect ?? 0;
        var srsReviewedToday = reviewedToday - practiceToday;
        var srsCorrectToday = correctToday - practiceCorrectToday;

        // Single query for all-time review stats
        var allStats = await db.VocabularyReviews
            .Where(r => r.UserId == userId && r.SiteId == siteId)
            .GroupBy(_ => 1)
            .Select(g => new { Total = g.Count(), Correct = g.Count(r => r.IsCorrect) })
            .FirstOrDefaultAsync(ct);

        var totalReviews = allStats?.Total ?? 0;
        var totalCorrect = allStats?.Correct ?? 0;

        // Streak: consecutive days with reviews (HashSet for O(1) lookup)
        var reviewDays = (await db.VocabularyReviews
            .Where(r => r.UserId == userId && r.SiteId == siteId)
            .Select(r => r.CreatedAt.Date)
            .Distinct()
            .OrderByDescending(d => d)
            .Take(365)
            .ToListAsync(ct))
            .ToHashSet();

        var streak = 0;
        var checkDate = now.Date;
        if (!reviewDays.Contains(checkDate))
            checkDate = checkDate.AddDays(-1);
        while (reviewDays.Contains(checkDate))
        {
            streak++;
            checkDate = checkDate.AddDays(-1);
        }

        var wordsByBook = await words
            .Where(w => w.BookTitle != null)
            .GroupBy(w => new { w.EditionId, w.UserBookId, w.BookTitle })
            .Select(g => new { g.Key.EditionId, g.Key.UserBookId, g.Key.BookTitle, Count = g.Count() })
            .OrderByDescending(b => b.Count)
            .Take(20)
            .ToListAsync(ct);

        var weeklyProgress = ToDto(await weeklyBudget.GetProgressAsync(userId, siteId, ct));
        var capStatus = await dailyCap.GetStatusAsync(userId, siteId, ct);
        var pendingCount = await db.PendingVocabularyWords
            .CountAsync(p => p.UserId == userId && p.SiteId == siteId, ct);
        var lookupCount = await db.WordLookups
            .CountAsync(l => l.UserId == userId && l.SiteId == siteId, ct);

        return Results.Ok(new
        {
            totalWords,
            byStage = new
            {
                @new = stageDict.GetValueOrDefault(0),
                recognition = stageDict.GetValueOrDefault(1),
                recall = stageDict.GetValueOrDefault(2),
                context = stageDict.GetValueOrDefault(3),
                mastered = stageDict.GetValueOrDefault(4),
            },
            dueNow,
            retiredCount,
            pendingCount,
            lookupCount,
            weeklyProgress,
            dailyCap = new { used = capStatus.Used, cap = capStatus.Cap, remaining = capStatus.Remaining },
            reviewedToday,
            correctRateToday = reviewedToday > 0 ? Math.Round((double)correctToday / reviewedToday * 100, 1) : 0,
            srsReviewedToday,
            srsCorrectRateToday = srsReviewedToday > 0 ? Math.Round((double)srsCorrectToday / srsReviewedToday * 100, 1) : 0,
            practicedToday = practiceToday,
            practiceCorrectRateToday = practiceToday > 0 ? Math.Round((double)practiceCorrectToday / practiceToday * 100, 1) : 0,
            totalReviews,
            overallCorrectRate = totalReviews > 0 ? Math.Round((double)totalCorrect / totalReviews * 100, 1) : 0,
            streak,
            wordsByBook,
        });
    }

    // --- Daily Stats ---

    private static TimeSpan ParseTzOffset(string? tz)
    {
        if (string.IsNullOrEmpty(tz)) return TimeSpan.Zero;
        if (int.TryParse(tz, out var minutes))
            return TimeSpan.FromMinutes(minutes);
        return TimeSpan.Zero;
    }

    private static async Task<IResult> GetDailyStats(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        [FromQuery] string? tz,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var tzOffset = ParseTzOffset(tz);
        var now = DateTimeOffset.UtcNow;
        var start = from ?? now.AddDays(-365);
        var end = to ?? now;

        // Reviews per day
        var reviews = await db.VocabularyReviews
            .Where(r => r.UserId == userId && r.SiteId == siteId
                && r.CreatedAt >= start && r.CreatedAt <= end)
            .Select(r => new { r.CreatedAt, r.IsCorrect, r.ReviewMode })
            .ToListAsync(ct);

        var reviewsByDay = reviews
            .GroupBy(r => r.CreatedAt.ToOffset(tzOffset).Date)
            .ToDictionary(
                g => g.Key,
                g => new
                {
                    ReviewCount = g.Count(),
                    CorrectCount = g.Count(r => r.IsCorrect),
                    PracticeCount = g.Count(r => r.ReviewMode.StartsWith("practice_")),
                    SrsCount = g.Count(r => !r.ReviewMode.StartsWith("practice_")),
                });

        // Words added per day
        var words = await db.VocabularyWords
            .Where(w => w.UserId == userId && w.SiteId == siteId
                && w.CreatedAt >= start && w.CreatedAt <= end)
            .Select(w => w.CreatedAt)
            .ToListAsync(ct);

        var wordsByDay = words
            .GroupBy(d => d.ToOffset(tzOffset).Date)
            .ToDictionary(g => g.Key, g => g.Count());

        // Merge all dates
        var allDates = reviewsByDay.Keys.Union(wordsByDay.Keys).OrderBy(d => d);

        var result = allDates.Select(date =>
        {
            reviewsByDay.TryGetValue(date, out var r);
            return new
            {
                date,
                wordsAdded = wordsByDay.GetValueOrDefault(date, 0),
                reviewCount = r?.ReviewCount ?? 0,
                correctCount = r?.CorrectCount ?? 0,
                practiceCount = r?.PracticeCount ?? 0,
                srsCount = r?.SrsCount ?? 0,
            };
        }).ToList();

        return Results.Ok(result);
    }

    // --- Admin: Backfill Definitions ---

    private static async Task<IResult> BackfillDefinitions(
        IAppDbContext db,
        IDefinitionEnricher enricher,
        ILogger<IAppDbContext> logger,
        CancellationToken ct)
    {
        var words = await db.VocabularyWords
            .Where(w => w.Definition == null || w.Definition == "")
            .OrderBy(w => w.CreatedAt)
            .Take(500)
            .ToListAsync(ct);

        var enriched = 0;
        var failed = 0;

        foreach (var w in words)
        {
            try
            {
                var def = await enricher.FetchDefinitionAsync(w.Word, w.Language, ct);
                if (def != null)
                {
                    w.Definition = def;
                    enriched++;
                }
                else
                {
                    failed++;
                }
                // Rate limit: Free Dictionary API
                await Task.Delay(200, ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Backfill failed for word {Word}", w.Word);
                failed++;
            }
        }

        await db.SaveChangesAsync(ct);

        return Results.Ok(new { total = words.Count, enriched, failed });
    }

    // --- Reader Vocab (lightweight word+stage list) ---

    private static async Task<IResult> GetReaderVocab(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var words = await db.VocabularyWords
            .Where(w => w.UserId == userId && w.SiteId == siteId)
            .OrderBy(w => w.Word)
            .Take(MaxWordsPerUser)
            .Select(w => new ReaderVocabWordDto(w.Id, w.Word, w.Stage, w.Translation))
            .ToListAsync(ct);

        return Results.Ok(words);
    }

    // --- Mark word as Known (stage 4) ---

    private static async Task<IResult> MarkAsKnown(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var word = await FindUserWordAsync(db, id, userId, siteId, ct);

        if (word == null) return Results.NotFound();

        word.Stage = 4;
        word.IntervalDays = 30;
        word.NextReviewAt = DateTimeOffset.UtcNow.AddDays(30);
        word.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        return Results.Ok(ToDto(word));
    }

    // --- Shared helpers ---

    // Resolves userId + siteId from the request. Returns false when the caller
    // is unauthenticated (caller should return Results.Unauthorized). Collapses
    // the 3-line auth preamble that otherwise repeats at every endpoint.
    private static bool TryGetAuth(HttpContext ctx, AuthService authService, out Guid userId, out Guid siteId)
    {
        var uid = ctx.GetUserId(authService);
        if (uid is null) { userId = Guid.Empty; siteId = Guid.Empty; return false; }
        userId = uid.Value;
        siteId = ctx.GetSiteId();
        return true;
    }

    // Ownership-scoped lookup used by every per-word mutation endpoint.
    private static Task<VocabularyWord?> FindUserWordAsync(
        IAppDbContext db, Guid id, Guid userId, Guid siteId, CancellationToken ct)
        => db.VocabularyWords.FirstOrDefaultAsync(
            w => w.Id == id && w.UserId == userId && w.SiteId == siteId, ct);

    private static VocabWordDto ToDto(VocabularyWord w) => new(
        w.Id, w.Word, w.Language, w.Translation, w.Definition,
        w.EditionId, w.ChapterId, w.UserBookId,
        w.Sentence, w.BookTitle, w.Hint,
        w.Stage, w.IntervalDays, w.ConsecutiveCorrect,
        w.NextReviewAt, w.LastReviewedAt,
        w.TotalReviews, w.CorrectReviews,
        w.CreatedAt, w.UpdatedAt);

    // Anti-spiral F1. Create-or-bump the WordLookup row for this tap. Sentence /
    // book context is overwritten on each tap so we always show the *latest*
    // context when the user opens the Lookups list.
    private static async Task<WordLookup> UpsertLookupAsync(
        IAppDbContext db, Guid userId, Guid siteId, string word, SaveWordRequest request,
        int? zipfRank, DateTimeOffset now, WordLookup? existing, CancellationToken ct)
    {
        if (existing != null)
        {
            existing.TapCount += 1;
            existing.LastTappedAt = now;
            existing.Sentence = request.Sentence?.Trim() ?? existing.Sentence;
            existing.BookTitle = request.BookTitle?.Trim() ?? existing.BookTitle;
            existing.EditionId = request.EditionId ?? existing.EditionId;
            existing.ChapterId = request.ChapterId ?? existing.ChapterId;
            existing.UserBookId = request.UserBookId ?? existing.UserBookId;
            existing.LastTranslation = request.Translation?.Trim() ?? existing.LastTranslation;
            existing.ZipfRank = zipfRank ?? existing.ZipfRank;
            return existing;
        }

        var lookup = new WordLookup
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            SiteId = siteId,
            Word = word,
            Language = request.Language,
            ZipfRank = zipfRank,
            TapCount = 1,
            Sentence = request.Sentence?.Trim(),
            BookTitle = request.BookTitle?.Trim(),
            EditionId = request.EditionId,
            ChapterId = request.ChapterId,
            UserBookId = request.UserBookId,
            LastTranslation = request.Translation?.Trim(),
            FirstTappedAt = now,
            LastTappedAt = now,
        };
        db.WordLookups.Add(lookup);
        return await Task.FromResult(lookup);
    }

    private static WeeklyProgressDto ToDto(WeeklyProgress p) =>
        new(p.Used, p.Budget, p.Remaining, p.ResetAt);

    // --- Settings (Phase 1 anti-spiral) ---

    private static async Task<IResult> GetSettings(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var settings = await db.UserVocabularySettings
            .FirstOrDefaultAsync(s => s.UserId == userId && s.SiteId == siteId, ct);

        // First-time read: return defaults without persisting — settings row is
        // created lazily on first PUT to avoid a write on every new user.
        return Results.Ok(new VocabSettingsDto(
            DailyNewCap: settings?.DailyNewCap ?? 15,
            WeeklyReviewBudget: settings?.WeeklyReviewBudget ?? 70,
            FrequencyFilterEnabled: settings?.FrequencyFilterEnabled ?? true,
            ClusteringEnabled: settings?.ClusteringEnabled ?? true,
            AutoRetireEnabled: settings?.AutoRetireEnabled ?? true));
    }

    private static async Task<IResult> UpdateSettings(
        [FromBody] VocabSettingsDto request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        if (request.DailyNewCap is < 5 or > 100)
            return Results.BadRequest("DailyNewCap must be 5–100");
        if (request.WeeklyReviewBudget is < 10 or > 500)
            return Results.BadRequest("WeeklyReviewBudget must be 10–500");

        var settings = await db.UserVocabularySettings
            .FirstOrDefaultAsync(s => s.UserId == userId && s.SiteId == siteId, ct);
        var now = DateTimeOffset.UtcNow;

        if (settings is null)
        {
            settings = new UserVocabularySettings
            {
                UserId = userId,
                SiteId = siteId,
                CreatedAt = now,
            };
            db.UserVocabularySettings.Add(settings);
        }

        settings.DailyNewCap = request.DailyNewCap;
        settings.WeeklyReviewBudget = request.WeeklyReviewBudget;
        settings.FrequencyFilterEnabled = request.FrequencyFilterEnabled;
        settings.ClusteringEnabled = request.ClusteringEnabled;
        settings.AutoRetireEnabled = request.AutoRetireEnabled;
        settings.UpdatedAt = now;

        await db.SaveChangesAsync(ct);
        return Results.Ok(request);
    }

    // --- Unretire (Phase 1) ---

    private static async Task<IResult> UnretireWord(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var word = await FindUserWordAsync(db, id, userId, siteId, ct);
        if (word == null) return Results.NotFound();

        if (!word.IsRetired) return Results.Ok(ToDto(word));

        // Drop back to Stage 3 (Context), not Stage 0 — the user once mastered
        // this word, so we're only asking for one resurfacing review, not
        // starting from scratch. ConsecutiveCorrect resets so the 3/14d
        // retirement rule has to be re-earned.
        var now = DateTimeOffset.UtcNow;
        word.IsRetired = false;
        word.RetiredAt = null;
        word.RetiredReason = null;
        word.Stage = 3;
        word.ConsecutiveCorrect = 0;
        word.IntervalDays = 1;
        word.NextReviewAt = now;
        word.UpdatedAt = now;

        await db.SaveChangesAsync(ct);
        return Results.Ok(ToDto(word));
    }

    // --- Pending Buffer (Phase 2) ---

    private static async Task<IResult> GetPending(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        DailyCapService dailyCap,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var items = await db.PendingVocabularyWords
            .Where(p => p.UserId == userId && p.SiteId == siteId)
            .OrderByDescending(p => p.Priority)
            .ThenBy(p => p.CreatedAt)
            .Select(p => new PendingVocabWordDto(
                p.Id, p.Word, p.Language, p.Translation, p.Definition,
                p.EditionId, p.ChapterId, p.UserBookId,
                p.Sentence, p.BookTitle, p.Priority, p.Source, p.CreatedAt))
            .ToListAsync(ct);

        var cap = await dailyCap.GetStatusAsync(userId, siteId, ct);
        return Results.Ok(new PendingListResponse(items, cap.Used, cap.Cap, cap.Remaining));
    }

    // Manual promote — bypasses the daily cap. User explicitly asked for this
    // word to skip the queue; respect it even if today is "full".
    private static async Task<IResult> PromotePending(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        DailyCapService dailyCap,
        IServiceScopeFactory scopeFactory,
        ILogger<IAppDbContext> logger,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var pending = await db.PendingVocabularyWords
            .FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId && p.SiteId == siteId, ct);
        if (pending == null) return Results.NotFound();

        // Capture enrichment inputs before PromoteAsync disposes the pending row.
        var wordText = pending.Word;
        var lang = pending.Language;
        var def = pending.Definition;
        var sent = pending.Sentence;

        var now = DateTimeOffset.UtcNow;
        var promoted = await dailyCap.PromoteAsync(pending, now, ct);

        var nativeLang = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => u.NativeLanguage)
            .FirstOrDefaultAsync(ct);
        if (!string.IsNullOrWhiteSpace(nativeLang))
        {
            QueueEnrichment(scopeFactory, logger, promoted.Id, wordText, lang, def, sent, nativeLang);
        }

        return Results.Ok(ToDto(promoted));
    }

    private static async Task<IResult> DismissPending(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var pending = await db.PendingVocabularyWords
            .FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId && p.SiteId == siteId, ct);
        if (pending == null) return Results.NotFound();

        db.PendingVocabularyWords.Remove(pending);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    // --- Lookups (Phase 3 F1) ---

    private static async Task<IResult> GetLookups(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var take = Math.Clamp(limit ?? 50, 1, 200);
        var skip = Math.Max(0, offset ?? 0);

        var baseQuery = db.WordLookups
            .Where(l => l.UserId == userId && l.SiteId == siteId);

        var total = await baseQuery.CountAsync(ct);
        var items = await baseQuery
            .OrderByDescending(l => l.LastTappedAt)
            .Skip(skip)
            .Take(take)
            .Select(l => new WordLookupDto(
                l.Id, l.Word, l.Language, l.ZipfRank, l.TapCount,
                l.Sentence, l.BookTitle, l.EditionId, l.ChapterId, l.UserBookId,
                l.LastTranslation, l.FirstTappedAt, l.LastTappedAt))
            .ToListAsync(ct);

        return Results.Ok(new WordLookupListResponse(items, total));
    }

    // "Add anyway" — user overrides the frequency filter. Creates a VocabularyWord
    // directly and drops the Lookup. Bypasses the daily cap on purpose: the user
    // explicitly asked for this word.
    private static async Task<IResult> PromoteLookup(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        IServiceScopeFactory scopeFactory,
        ILogger<IAppDbContext> logger,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var lookup = await db.WordLookups
            .FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId && l.SiteId == siteId, ct);
        if (lookup == null) return Results.NotFound();

        // Guard against a race where the word was saved via another path between
        // the list render and the promote click.
        var already = await db.VocabularyWords
            .FirstOrDefaultAsync(w => w.UserId == userId && w.SiteId == siteId
                && w.Word == lookup.Word && w.Language == lookup.Language, ct);
        if (already != null)
        {
            db.WordLookups.Remove(lookup);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(already));
        }

        // Hard ceiling still applies — Add Anyway bypasses the daily cap, not
        // the 5000-word vocabulary limit. Counts both active SRS + pending
        // so a user can't exceed the cap via the lookup bypass.
        var count = await db.VocabularyWords.CountAsync(
            w => w.UserId == userId && w.SiteId == siteId, ct);
        count += await db.PendingVocabularyWords.CountAsync(
            p => p.UserId == userId && p.SiteId == siteId, ct);
        if (count >= MaxWordsPerUser)
            return Results.Problem("Vocabulary limit reached (5000 words)", statusCode: 429);

        var now = DateTimeOffset.UtcNow;
        var entry = new VocabularyWord
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            SiteId = siteId,
            Word = lookup.Word,
            Language = lookup.Language,
            Translation = lookup.LastTranslation,
            EditionId = lookup.EditionId,
            ChapterId = lookup.ChapterId,
            UserBookId = lookup.UserBookId,
            Sentence = lookup.Sentence,
            BookTitle = lookup.BookTitle,
            ZipfRank = lookup.ZipfRank,
            Source = "manual_add_anyway",
            ActivatedAt = now,
            Stage = 0,
            IntervalDays = 0,
            ConsecutiveCorrect = 0,
            NextReviewAt = now,
            TotalReviews = 0,
            CorrectReviews = 0,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.VocabularyWords.Add(entry);
        db.WordLookups.Remove(lookup);
        await db.SaveChangesAsync(ct);

        var nativeLang = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => u.NativeLanguage)
            .FirstOrDefaultAsync(ct);
        if (!string.IsNullOrWhiteSpace(nativeLang))
        {
            QueueEnrichment(scopeFactory, logger, entry.Id, entry.Word, entry.Language,
                entry.Definition, entry.Sentence, nativeLang);
        }

        return Results.Ok(ToDto(entry));
    }

    private static async Task<IResult> DismissLookup(
        Guid id,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        if (!TryGetAuth(httpContext, authService, out var userId, out var siteId))
            return Results.Unauthorized();

        var lookup = await db.WordLookups
            .FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId && l.SiteId == siteId, ct);
        if (lookup == null) return Results.NotFound();

        db.WordLookups.Remove(lookup);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

// --- DTOs ---

public record SaveWordRequest(
    string Word, string Language,
    string? Translation, string? Definition,
    Guid? EditionId, Guid? ChapterId, Guid? UserBookId,
    string? Sentence, string? BookTitle,
    string? NativeLanguage = null);

public record UpdateWordRequest(string? Translation, string? Definition);

public record VocabWordDto(
    Guid Id, string Word, string Language, string? Translation, string? Definition,
    Guid? EditionId, Guid? ChapterId, Guid? UserBookId,
    string? Sentence, string? BookTitle, string? Hint,
    int Stage, double IntervalDays, int ConsecutiveCorrect,
    DateTimeOffset NextReviewAt, DateTimeOffset? LastReviewedAt,
    int TotalReviews, int CorrectReviews,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public record ReviewQueueResponse(List<ReviewCardDto> Cards, int TotalDue, WeeklyProgressDto WeeklyProgress);

public record WeeklyProgressDto(int Used, int Budget, int Remaining, DateTimeOffset ResetAt);

public record ReviewCardDto(
    Guid WordId, string Word, string? Translation, string? Definition,
    string ReviewMode,
    string? BlankSentence, string? OriginalSentence, string? BookTitle,
    string? Hint, string? Explanation, bool IsNew,
    List<string>? Options, int? CorrectOptionIndex);

public record SubmitReviewRequest(Guid WordId, bool IsCorrect, int ResponseTimeMs, string? Mode = null, string? SelfAssessment = null);

public record SubmitReviewResponse(
    Guid WordId, int PreviousStage, int NewStage, bool StageChanged,
    double NextIntervalDays, DateTimeOffset NextReviewAt,
    int TotalReviews, int CorrectReviews);

public record ReaderVocabWordDto(Guid Id, string Word, int Stage, string? Translation);

public record VocabSettingsDto(
    int DailyNewCap,
    int WeeklyReviewBudget,
    bool FrequencyFilterEnabled,
    bool ClusteringEnabled,
    bool AutoRetireEnabled);

// Anti-spiral F2. Outcome is discriminated-union-style; frontend branches on it
// to show the right toast/banner.
//   srs            — word landed in the active SRS queue (common/Zipf top-5k or 2x-tap)
//   pending        — daily cap reached, queued for tomorrow
//   lookup         — rare/OOV word → WordLookup, not SRS
//   lookup_pending — mid-tier word, needs one more tap before SRS (with tapsRemaining)
//   already_saved  — idempotent hit on existing VocabularyWord
public record SaveWordResponse(
    string Outcome,
    VocabWordDto? Word,
    Guid? PendingId,
    Guid? LookupId,
    int? TapsRemaining,
    string? Reason)
{
    public static SaveWordResponse Srs(VocabWordDto word) => new("srs", word, null, null, null, null);
    public static SaveWordResponse Pending(Guid pendingId, string reason) => new("pending", null, pendingId, null, null, reason);
    public static SaveWordResponse AlreadySaved(VocabWordDto word) => new("already_saved", word, null, null, null, null);
    // Re-tap of a word already in the pending bucket: surface as "pending" so
    // the client re-shows the "queued for tomorrow" toast instead of going silent.
    public static SaveWordResponse AlreadyPending(Guid pendingId) => new("pending", null, pendingId, null, null, "already_pending");
    public static SaveWordResponse Lookup(Guid lookupId, string reason) => new("lookup", null, null, lookupId, null, reason);
    public static SaveWordResponse LookupPending(Guid lookupId, int tapsRemaining) => new("lookup_pending", null, null, lookupId, tapsRemaining, "mid_tier");
}

public record PendingVocabWordDto(
    Guid Id, string Word, string Language, string? Translation, string? Definition,
    Guid? EditionId, Guid? ChapterId, Guid? UserBookId,
    string? Sentence, string? BookTitle,
    double Priority, string Source, DateTimeOffset CreatedAt);

public record PendingListResponse(List<PendingVocabWordDto> Items, int DailyUsed, int DailyCap, int DailyRemaining);

public record WordLookupDto(
    Guid Id, string Word, string Language, int? ZipfRank, int TapCount,
    string? Sentence, string? BookTitle,
    Guid? EditionId, Guid? ChapterId, Guid? UserBookId,
    string? LastTranslation, DateTimeOffset FirstTappedAt, DateTimeOffset LastTappedAt);

public record WordLookupListResponse(List<WordLookupDto> Items, int Total);
