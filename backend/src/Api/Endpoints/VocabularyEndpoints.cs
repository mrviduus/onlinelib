using System.Text.Json;
using Api.Extensions;
using Api.Sites;
using Application.Auth;
using Application.Common.Interfaces;
using Application.Vocabulary;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

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
        group.MapPatch("/words/{id:guid}", UpdateWord).WithName("UpdateVocabularyWord");
        group.MapGet("/review", GetReviewQueue).WithName("GetVocabularyReview");
        group.MapPost("/review", SubmitReview).WithName("SubmitVocabularyReview");
        group.MapGet("/stats", GetStats).WithName("GetVocabularyStats");
    }

    // --- Save Word ---

    private static async Task<IResult> SaveWord(
        [FromBody] SaveWordRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        IServiceScopeFactory scopeFactory,
        ILogger<IAppDbContext> logger,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        if (string.IsNullOrWhiteSpace(request.Word) || request.Word.Length > 200)
            return Results.BadRequest("Word is required (max 200 chars)");
        if (string.IsNullOrWhiteSpace(request.Language) || request.Language.Length > 8)
            return Results.BadRequest("Language is required");

        var word = request.Word.Trim().ToLowerInvariant();

        var existing = await db.VocabularyWords
            .FirstOrDefaultAsync(w => w.UserId == userId.Value && w.SiteId == siteId
                && w.Word == word && w.Language == request.Language, ct);

        if (existing != null)
            return Results.Ok(ToDto(existing));

        var count = await db.VocabularyWords
            .CountAsync(w => w.UserId == userId.Value && w.SiteId == siteId, ct);
        if (count >= MaxWordsPerUser)
            return Results.Problem("Vocabulary limit reached (5000 words)", statusCode: 429);

        var now = DateTimeOffset.UtcNow;
        var entry = new VocabularyWord
        {
            Id = Guid.NewGuid(),
            UserId = userId.Value,
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

        // Fire-and-forget: generate distractors in background (own DI scope)
        var wordId = entry.Id;
        var wordText = word;
        var lang = request.Language;
        var def = request.Definition;
        var sent = request.Sentence;
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var bgDb = scope.ServiceProvider.GetRequiredService<IAppDbContext>();
                var bgHttp = scope.ServiceProvider.GetRequiredService<IHttpClientFactory>();
                var bgConfig = scope.ServiceProvider.GetRequiredService<IConfiguration>();

                var (distractors, hint) = await DistractorGenerator.GenerateAsync(
                    wordText, lang, def, sent, bgHttp, bgConfig, CancellationToken.None);
                if (distractors?.Count > 0 || hint != null)
                {
                    var w = await bgDb.VocabularyWords.FirstOrDefaultAsync(
                        x => x.Id == wordId, CancellationToken.None);
                    if (w != null)
                    {
                        if (distractors?.Count > 0)
                            w.Distractors = JsonSerializer.Serialize(distractors);
                        if (hint != null)
                            w.Hint = hint;
                        await bgDb.SaveChangesAsync(CancellationToken.None);
                    }
                }
            }
            catch (HttpRequestException ex)
            {
                logger.LogWarning(ex, "Ollama unavailable for word {Word}", wordText);
            }
            catch (TaskCanceledException)
            {
                logger.LogWarning("Ollama timeout for word {WordText}", wordText);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to generate distractors for word {Word}", wordText);
            }
        });

        return Results.Ok(ToDto(entry));
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
        [FromQuery] int? limit,
        [FromQuery] int? offset,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var query = db.VocabularyWords
            .Where(w => w.UserId == userId.Value && w.SiteId == siteId);

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

        var total = await query.CountAsync(ct);

        query = sort switch
        {
            "alphabetical" => query.OrderBy(w => w.Word),
            "due" => query.OrderBy(w => w.NextReviewAt),
            "stage" => query.OrderByDescending(w => w.Stage).ThenByDescending(w => w.UpdatedAt),
            _ => query.OrderByDescending(w => w.CreatedAt),
        };

        var items = await query
            .Skip(offset ?? 0)
            .Take(Math.Min(limit ?? 50, 100))
            .Select(w => new VocabWordDto(
                w.Id, w.Word, w.Language, w.Translation, w.Definition,
                w.EditionId, w.ChapterId, w.UserBookId,
                w.Sentence, w.BookTitle,
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
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var word = await db.VocabularyWords
            .FirstOrDefaultAsync(w => w.Id == id && w.UserId == userId.Value && w.SiteId == siteId, ct);
        if (word == null) return Results.NotFound();

        db.VocabularyWords.Remove(word);
        await db.SaveChangesAsync(ct);

        return Results.NoContent();
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
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var word = await db.VocabularyWords
            .FirstOrDefaultAsync(w => w.Id == id && w.UserId == userId.Value && w.SiteId == siteId, ct);
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
        [FromQuery] int? limit,
        [FromQuery] string? mode,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var now = DateTimeOffset.UtcNow;
        var batchSize = Math.Min(limit ?? 20, 50);
        var isPractice = string.Equals(mode, "practice", StringComparison.OrdinalIgnoreCase);

        var totalDue = await db.VocabularyWords
            .CountAsync(w => w.UserId == userId.Value && w.SiteId == siteId && w.NextReviewAt <= now, ct);

        List<VocabularyWord> dueWords;
        if (isPractice)
        {
            dueWords = await db.VocabularyWords
                .Where(w => w.UserId == userId.Value && w.SiteId == siteId)
                .OrderBy(w => w.TotalReviews == 0 ? 0.0 : (double)w.CorrectReviews / w.TotalReviews)
                .ThenBy(w => w.Stage)
                .ThenBy(_ => EF.Functions.Random())
                .Take(batchSize)
                .ToListAsync(ct);
        }
        else
        {
            dueWords = await db.VocabularyWords
                .Where(w => w.UserId == userId.Value && w.SiteId == siteId && w.NextReviewAt <= now)
                .OrderBy(w => w.NextReviewAt)
                .Take(batchSize)
                .ToListAsync(ct);
        }

        if (dueWords.Count == 0)
            return Results.Ok(new ReviewQueueResponse([], totalDue));

        // Distractor pool: other user words (capped to prevent OOM)
        var languages = dueWords.Select(w => w.Language).Distinct().ToList();
        var dueWordIds = dueWords.Select(w => w.Id).ToHashSet();

        var distractorPool = await db.VocabularyWords
            .Where(w => w.UserId == userId.Value && w.SiteId == siteId
                && !dueWordIds.Contains(w.Id)
                && languages.Contains(w.Language))
            .OrderBy(_ => EF.Functions.Random())
            .Take(MaxDistractorPoolSize)
            .Select(w => new { w.Word, w.Language })
            .ToListAsync(ct);

        var distractorsByLang = distractorPool
            .GroupBy(d => d.Language)
            .ToDictionary(g => g.Key, g => g.ToList());

        var cards = new List<ReviewCardDto>();
        foreach (var w in dueWords)
        {
            var reviewMode = SrsEngine.GetReviewMode(w.Stage, w.Sentence != null);
            List<string>? options = null;
            int? correctIndex = null;
            string? blankSentence = null;

            if (reviewMode == "multiple_choice")
            {
                var llmDistractors = ParseDistractors(w.Distractors);
                var hasPrompt = !string.IsNullOrWhiteSpace(w.Definition) || !string.IsNullOrWhiteSpace(w.Translation);

                if (!hasPrompt && w.Sentence == null)
                {
                    reviewMode = "typed_recall";
                }
                else
                {
                    if (!hasPrompt && w.Sentence != null)
                        blankSentence = ReplaceWordInSentence(w.Sentence, w.Word);

                    var correct = w.Word;
                    List<string> distractors;

                    if (llmDistractors?.Count >= 3)
                    {
                        distractors = llmDistractors
                            .Where(d => !d.Equals(w.Word, StringComparison.OrdinalIgnoreCase))
                            .OrderBy(_ => Random.Shared.Next())
                            .Take(3)
                            .ToList();
                    }
                    else
                    {
                        var pool = distractorsByLang.GetValueOrDefault(w.Language, []);
                        distractors = pool
                            .Where(d => d.Word != w.Word)
                            .OrderBy(_ => Random.Shared.Next())
                            .Take(3)
                            .Select(d => d.Word)
                            .ToList();
                    }

                    if (distractors.Count < 3)
                    {
                        foreach (var fb in DistractorWords.English.OrderBy(_ => Random.Shared.Next()))
                        {
                            if (distractors.Count >= 3) break;
                            if (fb != correct && !distractors.Contains(fb))
                                distractors.Add(fb);
                        }
                    }

                    options = distractors.Take(3).Append(correct).OrderBy(_ => Random.Shared.Next()).ToList();
                    correctIndex = options.IndexOf(correct);
                }
            }

            if (reviewMode == "context" && w.Sentence != null)
                blankSentence = ReplaceWordInSentence(w.Sentence, w.Word);

            cards.Add(new ReviewCardDto(
                w.Id, w.Word, w.Translation, w.Definition,
                reviewMode, blankSentence, w.Sentence, w.BookTitle,
                w.Hint, options, correctIndex));
        }

        return Results.Ok(new ReviewQueueResponse(cards, totalDue));
    }

    // --- Submit Review ---

    private static async Task<IResult> SubmitReview(
        [FromBody] SubmitReviewRequest request,
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var word = await db.VocabularyWords
            .FirstOrDefaultAsync(w => w.Id == request.WordId && w.UserId == userId.Value && w.SiteId == siteId, ct);
        if (word == null) return Results.NotFound();

        var isPractice = string.Equals(request.Mode, "practice", StringComparison.OrdinalIgnoreCase);
        var prevStage = word.Stage;
        var now = DateTimeOffset.UtcNow;
        int newStage;
        double newInterval;
        int newConsecutive;

        if (isPractice && request.IsCorrect)
        {
            // Practice correct: don't change SRS schedule
            newStage = prevStage;
            newInterval = word.IntervalDays;
            newConsecutive = word.ConsecutiveCorrect;
        }
        else
        {
            // SRS review OR practice incorrect: full SRS calculation
            (newStage, newInterval, newConsecutive) = SrsEngine.Calculate(
                word.Stage, word.ConsecutiveCorrect, word.IntervalDays, request.IsCorrect);
            word.Stage = newStage;
            word.IntervalDays = newInterval;
            word.ConsecutiveCorrect = newConsecutive;
            word.NextReviewAt = now.AddDays(newInterval);
        }

        word.LastReviewedAt = now;
        word.TotalReviews++;
        if (request.IsCorrect) word.CorrectReviews++;
        word.UpdatedAt = now;

        var reviewMode = SrsEngine.GetReviewMode(prevStage, word.Sentence != null);
        var review = new VocabularyReview
        {
            Id = Guid.NewGuid(),
            VocabularyWordId = word.Id,
            UserId = userId.Value,
            SiteId = siteId,
            ReviewMode = isPractice ? $"practice_{reviewMode}" : reviewMode,
            IsCorrect = request.IsCorrect,
            ResponseTimeMs = request.ResponseTimeMs,
            StageBefore = prevStage,
            StageAfter = newStage,
            CreatedAt = now,
        };

        db.VocabularyReviews.Add(review);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new SubmitReviewResponse(
            word.Id, prevStage, newStage, prevStage != newStage,
            newInterval, word.NextReviewAt, word.TotalReviews, word.CorrectReviews));
    }

    // --- Stats ---

    private static async Task<IResult> GetStats(
        HttpContext httpContext,
        AuthService authService,
        IAppDbContext db,
        CancellationToken ct)
    {
        var userId = httpContext.GetUserId(authService);
        if (userId == null) return Results.Unauthorized();
        var siteId = httpContext.GetSiteId();

        var now = DateTimeOffset.UtcNow;
        var todayStart = new DateTimeOffset(now.Date, TimeSpan.Zero);

        var words = db.VocabularyWords
            .Where(w => w.UserId == userId.Value && w.SiteId == siteId);

        var totalWords = await words.CountAsync(ct);

        var byStage = await words
            .GroupBy(w => w.Stage)
            .Select(g => new { Stage = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        var stageDict = byStage.ToDictionary(s => s.Stage, s => s.Count);
        var dueNow = await words.CountAsync(w => w.NextReviewAt <= now, ct);

        // Combine today's review stats into one query
        var todayReviews = db.VocabularyReviews
            .Where(r => r.UserId == userId.Value && r.SiteId == siteId && r.CreatedAt >= todayStart);
        var reviewedToday = await todayReviews.CountAsync(ct);
        var correctToday = await todayReviews.CountAsync(r => r.IsCorrect, ct);
        var practiceToday = await todayReviews.CountAsync(r => r.ReviewMode.StartsWith("practice_"), ct);
        var practiceCorrectToday = await todayReviews.CountAsync(r => r.ReviewMode.StartsWith("practice_") && r.IsCorrect, ct);
        var srsReviewedToday = reviewedToday - practiceToday;
        var srsCorrectToday = correctToday - practiceCorrectToday;

        var allReviews = db.VocabularyReviews
            .Where(r => r.UserId == userId.Value && r.SiteId == siteId);
        var totalReviews = await allReviews.CountAsync(ct);
        var totalCorrect = await allReviews.CountAsync(r => r.IsCorrect, ct);

        // Streak: consecutive days with reviews (HashSet for O(1) lookup)
        var reviewDays = (await allReviews
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

    // --- Helpers ---

    private static List<string>? ParseDistractors(string? json)
    {
        if (string.IsNullOrEmpty(json)) return null;
        try { return JsonSerializer.Deserialize<List<string>>(json); }
        catch { return null; }
    }

    private static string ReplaceWordInSentence(string sentence, string word)
    {
        var idx = sentence.IndexOf(word, StringComparison.OrdinalIgnoreCase);
        if (idx >= 0)
            return string.Concat(sentence.AsSpan(0, idx), "___", sentence.AsSpan(idx + word.Length));
        return sentence + " [___]";
    }

    private static VocabWordDto ToDto(VocabularyWord w) => new(
        w.Id, w.Word, w.Language, w.Translation, w.Definition,
        w.EditionId, w.ChapterId, w.UserBookId,
        w.Sentence, w.BookTitle,
        w.Stage, w.IntervalDays, w.ConsecutiveCorrect,
        w.NextReviewAt, w.LastReviewedAt,
        w.TotalReviews, w.CorrectReviews,
        w.CreatedAt, w.UpdatedAt);
}

// --- DTOs ---

public record SaveWordRequest(
    string Word, string Language,
    string? Translation, string? Definition,
    Guid? EditionId, Guid? ChapterId, Guid? UserBookId,
    string? Sentence, string? BookTitle);

public record UpdateWordRequest(string? Translation, string? Definition);

public record VocabWordDto(
    Guid Id, string Word, string Language, string? Translation, string? Definition,
    Guid? EditionId, Guid? ChapterId, Guid? UserBookId,
    string? Sentence, string? BookTitle,
    int Stage, double IntervalDays, int ConsecutiveCorrect,
    DateTimeOffset NextReviewAt, DateTimeOffset? LastReviewedAt,
    int TotalReviews, int CorrectReviews,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public record ReviewQueueResponse(List<ReviewCardDto> Cards, int TotalDue);

public record ReviewCardDto(
    Guid WordId, string Word, string? Translation, string? Definition,
    string ReviewMode,
    string? BlankSentence, string? OriginalSentence, string? BookTitle,
    string? Hint,
    List<string>? Options, int? CorrectOptionIndex);

public record SubmitReviewRequest(Guid WordId, bool IsCorrect, int ResponseTimeMs, string? Mode = null);

public record SubmitReviewResponse(
    Guid WordId, int PreviousStage, int NewStage, bool StageChanged,
    double NextIntervalDays, DateTimeOffset NextReviewAt,
    int TotalReviews, int CorrectReviews);
