using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using TextStack.Vocabulary;

namespace Application.Vocabulary;

/// <summary>
/// AI-058: groups a user's saved vocabulary by meaning ACROSS ALL BOOKS into concept groups,
/// in-process over the OpenAI word embeddings stored on <see cref="VocabularyWord.Embedding"/>.
///
/// Coexists with the book-grouper (<see cref="ClusterCandidateService"/>): both reuse
/// <see cref="WordCluster"/> but are discriminated by <see cref="WordCluster.Kind"/>
/// (<c>"concept"</c> here, <c>"book"</c> there) and write DISJOINT FKs —
/// <see cref="VocabularyWord.ConceptClusterId"/> here, <see cref="VocabularyWord.ClusterId"/>
/// there. This service NEVER touches the book-grouper's <c>ClusterId</c>.
///
/// Rebuild semantics are FULL-REPLACE: each run deletes the user's existing concept clusters
/// (the SetNull FK nulls members' <c>ConceptClusterId</c>) and recreates fresh ones. Labels
/// are a placeholder until AI-059; the StatsPage widget is AI-060.
/// </summary>
public class ConceptClusteringService(IAppDbContext db, IConfiguration config, IClusterBuilder labeler)
{
    // AI-058 placeholder Title kept as the resilient fallback when LLM labeling fails.
    private const string PlaceholderTitle = "Concept group";

    // Gate: don't cluster until the user has enough embedded signal to form meaningful groups.
    private const int MinEmbeddedWords = 20;

    private int MinClusterSize =>
        config.GetValue<int?>("Vocabulary:ConceptCluster:MinClusterSize") ?? SemanticClusterer.DefaultMinClusterSize;

    // HDBSCAN k / "min samples". Null → SemanticClusterer defaults it to MinClusterSize.
    private int? MinPoints =>
        config.GetValue<int?>("Vocabulary:ConceptCluster:MinPoints");

    /// <summary>
    /// Rebuilds the concept clusters for one (user, site). No-op (returns 0) unless the user has
    /// at least <see cref="MinEmbeddedWords"/> non-retired words with an embedding. Returns the
    /// number of concept clusters created.
    /// </summary>
    public async Task<int> BuildForUserAsync(Guid userId, Guid siteId, CancellationToken ct)
    {
        // Load embedded, non-retired words for this user. (Filter Embedding != null in memory:
        // EF can't translate the float[] null check the same across providers, and the set is small.)
        var candidates = await db.VocabularyWords
            .Where(w => w.UserId == userId
                     && !w.IsRetired
                     && w.Embedding != null)
            .Select(w => new { w.Id, w.Embedding })
            .ToListAsync(ct);

        // Gate — too few embedded words to cluster: leave any prior concept clusters untouched.
        if (candidates.Count < MinEmbeddedWords)
            return 0;

        var points = candidates
            .Where(c => c.Embedding is { Length: > 0 })
            .Select(c => (c.Id, c.Embedding!))
            .ToList();

        var clusterer = new SemanticClusterer(MinClusterSize, MinPoints);
        var clusters = clusterer.Cluster(points);

        // FULL-REPLACE: drop this user's existing concept clusters. The ConceptClusterId FK is
        // OnDelete(SetNull), so deleting the cluster rows nulls every member's ConceptClusterId
        // (including words that drop to noise this run). The book-grouper ClusterId is untouched.
        var existing = await db.WordClusters
            .Where(c => c.UserId == userId && c.Kind == "concept")
            .ToListAsync(ct);
        if (existing.Count > 0)
        {
            db.WordClusters.RemoveRange(existing);
            await db.SaveChangesAsync(ct);
        }

        if (clusters.Count == 0)
            return 0;

        // AI-059 labels are in the user's native language (mirrors the book-grouper). Default "en".
        var user = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => new { u.NativeLanguage })
            .FirstOrDefaultAsync(ct);
        var nativeLanguage = user?.NativeLanguage ?? "en";

        var now = DateTimeOffset.UtcNow;
        // Map word id -> the new cluster id it belongs to, for a single bulk member update.
        var assignment = new Dictionary<Guid, Guid>();
        var newClusters = new List<(WordCluster Cluster, IReadOnlyList<Guid> WordIds)>();
        foreach (var c in clusters)
        {
            var cluster = new WordCluster
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                SiteId = siteId,
                Kind = "concept",
                Title = PlaceholderTitle, // labeled below; placeholder is the fallback on LLM failure.
                Theme = null,
                EditionId = null,
                UserBookId = null,
                BookTitle = null,
                MemberCount = c.WordIds.Count,
                CohesionScore = c.Cohesion,
                CreatedAt = now,
            };
            db.WordClusters.Add(cluster);
            newClusters.Add((cluster, c.WordIds));
            foreach (var wid in c.WordIds)
                assignment[wid] = cluster.Id;
        }

        // Assign ConceptClusterId on members. Noise words are simply absent from `assignment`
        // and keep ConceptClusterId == null (already nulled by the full-replace delete above).
        var memberIds = assignment.Keys.ToHashSet();
        var members = await db.VocabularyWords
            .Where(w => w.UserId == userId && memberIds.Contains(w.Id))
            .ToListAsync(ct);
        foreach (var w in members)
            w.ConceptClusterId = assignment[w.Id];

        // AI-059: one LLM label per concept cluster, in the user's native language. Membership is
        // HDBSCAN's — the labeler ONLY names the group. Resilient: a failure (Ollama down / null)
        // leaves the placeholder Title and never aborts the build or skips a cluster.
        var wordText = members.ToDictionary(w => w.Id, w => w.Word);
        foreach (var (cluster, wordIds) in newClusters)
        {
            var labelWords = wordIds
                .Where(wordText.ContainsKey)
                .Select(id => wordText[id])
                .ToList();
            if (labelWords.Count == 0)
                continue;

            try
            {
                var label = await labeler.LabelAsync(labelWords, nativeLanguage, ct);
                if (label is not null && !string.IsNullOrWhiteSpace(label.Title))
                {
                    cluster.Title = label.Title;
                    cluster.Theme = label.Theme;
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Keep the placeholder Title; labeling failure must not abort the build.
            }
        }

        await db.SaveChangesAsync(ct);
        return clusters.Count;
    }

    /// <summary>
    /// Rebuilds concept clusters for every (user, site) pair with enough embedded words.
    /// Mirrors <see cref="ClusterCandidateService.BuildAllAsync"/>.
    /// </summary>
    public async Task<int> BuildAllAsync(CancellationToken ct)
    {
        var scope = await db.VocabularyWords
            .Where(w => !w.IsRetired && w.Embedding != null)
            .GroupBy(w => new { w.UserId, w.SiteId })
            .Where(g => g.Count() >= MinEmbeddedWords)
            .Select(g => new { g.Key.UserId, g.Key.SiteId })
            .ToListAsync(ct);

        var total = 0;
        foreach (var s in scope)
            total += await BuildForUserAsync(s.UserId, s.SiteId, ct);
        return total;
    }
}
