using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using TextStack.Vocabulary;

namespace Application.Vocabulary;

// Anti-spiral F3: scans recently-activated SRS words per user, groups by book
// context, and asks the LLM whether any group forms a cohesive theme. Creates
// WordCluster rows for the post-session bonus card.
public class ClusterCandidateService(IAppDbContext db, IClusterBuilder builder)
{
    private const int MinWordsPerBook = 5;
    private static readonly TimeSpan RecencyWindow = TimeSpan.FromHours(24);

    // Returns count of clusters created for this user.
    public async Task<int> BuildForUserAsync(Guid userId, Guid siteId, CancellationToken ct)
    {
        var settings = await db.UserVocabularySettings
            .FirstOrDefaultAsync(s => s.UserId == userId && s.SiteId == siteId, ct);
        if (settings is { ClusteringEnabled: false }) return 0;

        var user = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => new { u.NativeLanguage })
            .FirstOrDefaultAsync(ct);
        var nativeLanguage = user?.NativeLanguage ?? "en";

        var since = DateTimeOffset.UtcNow - RecencyWindow;

        var recent = await db.VocabularyWords
            .Where(w => w.UserId == userId
                     && w.SiteId == siteId
                     && !w.IsRetired
                     && w.ClusterId == null
                     && w.ActivatedAt != null
                     && w.ActivatedAt >= since
                     && (w.EditionId != null || w.UserBookId != null))
            .Select(w => new
            {
                w.Id,
                w.Word,
                w.EditionId,
                w.UserBookId,
                w.BookTitle,
            })
            .ToListAsync(ct);

        if (recent.Count < MinWordsPerBook) return 0;

        var groups = recent
            .GroupBy(w => new { w.EditionId, w.UserBookId })
            .Where(g => g.Count() >= MinWordsPerBook)
            .ToList();

        if (groups.Count == 0) return 0;

        var created = 0;
        foreach (var group in groups)
        {
            // Skip if an active (undismissed, uncompleted) cluster already exists for this book.
            var existing = await db.WordClusters.AnyAsync(c =>
                c.UserId == userId
                && c.SiteId == siteId
                && c.EditionId == group.Key.EditionId
                && c.UserBookId == group.Key.UserBookId
                && !c.IsDismissed
                && c.CompletedAt == null, ct);
            if (existing) continue;

            var members = group.Select(w => (w.Id, w.Word)).ToList();
            var bookTitle = group.First().BookTitle;

            var candidate = await builder.BuildAsync(members, bookTitle, nativeLanguage, ct);
            if (candidate is null) continue;

            var cluster = new WordCluster
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                SiteId = siteId,
                Title = candidate.Title,
                Theme = candidate.Theme,
                EditionId = group.Key.EditionId,
                UserBookId = group.Key.UserBookId,
                BookTitle = bookTitle,
                MemberCount = candidate.MemberWordIds.Count,
                CohesionScore = candidate.CohesionScore,
                CreatedAt = DateTimeOffset.UtcNow,
            };
            db.WordClusters.Add(cluster);

            // Assign cluster id to each matched word.
            var matched = members.Where(m => candidate.MemberWordIds.Contains(m.Id)).Select(m => m.Id).ToHashSet();
            var words = await db.VocabularyWords
                .Where(w => matched.Contains(w.Id) && w.UserId == userId && w.SiteId == siteId)
                .ToListAsync(ct);
            foreach (var w in words)
                w.ClusterId = cluster.Id;

            await db.SaveChangesAsync(ct);
            created++;
        }

        return created;
    }

    public async Task<int> BuildAllAsync(CancellationToken ct)
    {
        var since = DateTimeOffset.UtcNow - RecencyWindow;

        // Scope to (user, site) pairs with enough recent activations to be worth scanning.
        var scope = await db.VocabularyWords
            .Where(w => !w.IsRetired
                     && w.ClusterId == null
                     && w.ActivatedAt != null
                     && w.ActivatedAt >= since
                     && (w.EditionId != null || w.UserBookId != null))
            .GroupBy(w => new { w.UserId, w.SiteId })
            .Where(g => g.Count() >= MinWordsPerBook)
            .Select(g => new { g.Key.UserId, g.Key.SiteId })
            .ToListAsync(ct);

        var total = 0;
        foreach (var s in scope)
            total += await BuildForUserAsync(s.UserId, s.SiteId, ct);
        return total;
    }
}
