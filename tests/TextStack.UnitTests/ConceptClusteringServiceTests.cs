using Application.Common.Interfaces;
using Application.Vocabulary;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Moq;

namespace TextStack.UnitTests;

// AI-058: ConceptClusteringService over a Moq IAppDbContext whose VocabularyWords / WordClusters
// DbSets are backed by plain List<T> (async LINQ enabled via TestAsyncQueryable). The production
// AppDbContext can't load on the EF InMemory provider (NpgsqlTsVector on Chapter), so we fake just
// the two sets the service touches. Vectors are hand-set so the real SemanticClusterer is
// deterministic — no embedding calls.
public class ConceptClusteringServiceTests
{
    private const int Dim = 1536;

    private sealed class Harness
    {
        public List<VocabularyWord> Words { get; } = [];
        public List<WordCluster> Clusters { get; } = [];
        public ConceptClusteringService Service { get; }

        public Harness()
        {
            var db = new Mock<IAppDbContext>();
            db.Setup(x => x.VocabularyWords).Returns(() => FakeSet(Words).Object);
            db.Setup(x => x.WordClusters).Returns(() => FakeSet(Clusters).Object);
            db.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0);
            Service = new ConceptClusteringService(db.Object, new ConfigurationBuilder().Build());
        }
    }

    // Builds a DbSet<T> mock backed by `data`: queryable (sync + async) + Add/AddRange/RemoveRange.
    private static Mock<DbSet<T>> FakeSet<T>(List<T> data) where T : class
    {
        var q = new TestAsyncEnumerable<T>(data);
        var set = new Mock<DbSet<T>>();
        var iq = set.As<IQueryable<T>>();
        iq.Setup(m => m.Provider).Returns(((IQueryable<T>)q).Provider);
        iq.Setup(m => m.Expression).Returns(((IQueryable<T>)q).Expression);
        iq.Setup(m => m.ElementType).Returns(((IQueryable<T>)q).ElementType);
        iq.Setup(m => m.GetEnumerator()).Returns(() => data.GetEnumerator());
        set.As<IAsyncEnumerable<T>>()
            .Setup(m => m.GetAsyncEnumerator(It.IsAny<CancellationToken>()))
            .Returns(() => new TestAsyncEnumerator<T>(data.GetEnumerator()));
        set.Setup(m => m.Add(It.IsAny<T>())).Callback<T>(e => data.Add(e));
        set.Setup(m => m.AddRange(It.IsAny<IEnumerable<T>>())).Callback<IEnumerable<T>>(data.AddRange);
        set.Setup(m => m.RemoveRange(It.IsAny<IEnumerable<T>>()))
            .Callback<IEnumerable<T>>(es => { foreach (var e in es.ToList()) data.Remove(e); });
        return set;
    }

    private static float[] Vec(params float[] head)
    {
        var v = new float[Dim];
        for (var i = 0; i < head.Length; i++)
            v[i] = head[i];
        return v;
    }

    private static VocabularyWord Word(Guid userId, Guid siteId, float[]? embedding, bool retired = false) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        SiteId = siteId,
        Word = "w" + Guid.NewGuid().ToString("N")[..6],
        Language = "en",
        Embedding = embedding,
        IsRetired = retired,
        NextReviewAt = DateTimeOffset.UtcNow,
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow,
    };

    // Seeds words split into two tight semantic groups (axis 0 / axis 1) so the clusterer forms
    // exactly two concept clusters. Returns the seeded words.
    private static List<VocabularyWord> SeedTwoGroups(Harness h, Guid userId, Guid siteId, int perGroup)
    {
        var words = new List<VocabularyWord>();
        for (var i = 0; i < perGroup; i++)
        {
            words.Add(Word(userId, siteId, Vec(1.0f, 0.01f * i)));   // group A
            words.Add(Word(userId, siteId, Vec(0.01f * i, 1.0f)));   // group B
        }
        h.Words.AddRange(words);
        return words;
    }

    [Fact]
    public async Task BuildForUser_FewerThanTwentyEmbedded_NoOp()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        var siteId = Guid.NewGuid();
        SeedTwoGroups(h, userId, siteId, perGroup: 5); // 10 embedded — below the 20-word gate.

        var created = await h.Service.BuildForUserAsync(userId, siteId, CancellationToken.None);

        Assert.Equal(0, created);
        Assert.Empty(h.Clusters);
        Assert.All(h.Words, w => Assert.Null(w.ConceptClusterId));
    }

    [Fact]
    public async Task BuildForUser_EnoughEmbedded_CreatesConceptClustersAndAssignsMembers()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        var siteId = Guid.NewGuid();
        SeedTwoGroups(h, userId, siteId, perGroup: 12); // 24 embedded, two groups.

        var created = await h.Service.BuildForUserAsync(userId, siteId, CancellationToken.None);

        Assert.Equal(2, created);
        Assert.Equal(2, h.Clusters.Count);
        Assert.All(h.Clusters, c => Assert.Equal("concept", c.Kind));
        Assert.All(h.Clusters, c => Assert.Equal("Concept group", c.Title));
        Assert.All(h.Words, w => Assert.NotNull(w.ConceptClusterId));
    }

    [Fact]
    public async Task BuildForUser_FullReplace_DeletesPriorConceptClustersAndRecreates()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        var siteId = Guid.NewGuid();
        SeedTwoGroups(h, userId, siteId, perGroup: 12);

        await h.Service.BuildForUserAsync(userId, siteId, CancellationToken.None);
        var firstIds = h.Clusters.Select(c => c.Id).ToHashSet();
        Assert.Equal(2, firstIds.Count);

        var created = await h.Service.BuildForUserAsync(userId, siteId, CancellationToken.None);
        Assert.Equal(2, created);

        var secondIds = h.Clusters.Select(c => c.Id).ToHashSet();
        Assert.Equal(2, secondIds.Count);
        Assert.Empty(firstIds.Intersect(secondIds)); // brand-new ids — full replace.
    }

    [Fact]
    public async Task BuildForUser_NoiseWord_LeavesConceptClusterIdNull()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        var siteId = Guid.NewGuid();
        SeedTwoGroups(h, userId, siteId, perGroup: 12);
        var outlier = Word(userId, siteId, Vec(0f, 0f, 1.0f)); // orthogonal → noise.
        h.Words.Add(outlier);

        await h.Service.BuildForUserAsync(userId, siteId, CancellationToken.None);

        Assert.Null(outlier.ConceptClusterId);
    }

    [Fact]
    public async Task BuildForUser_LeavesBookClusterIdUntouched()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        var siteId = Guid.NewGuid();
        var words = SeedTwoGroups(h, userId, siteId, perGroup: 12);
        var bookClusterId = Guid.NewGuid();
        words[0].ClusterId = bookClusterId; // pre-existing book-grouper assignment.

        await h.Service.BuildForUserAsync(userId, siteId, CancellationToken.None);

        Assert.Equal(bookClusterId, words[0].ClusterId);   // book FK preserved.
        Assert.NotNull(words[0].ConceptClusterId);         // concept FK set independently.
    }

    [Fact]
    public async Task BuildForUser_BelowGateAfterPriorBuild_LeavesExistingConceptClustersIntact()
    {
        // Attack surface 3c: a user who drops below the 20-word gate must NOT have their existing
        // concept clusters wiped — the gate short-circuits before the full-replace delete. Seed a
        // pre-existing concept cluster + only a few embedded words.
        var h = new Harness();
        var userId = Guid.NewGuid();
        var siteId = Guid.NewGuid();
        var prior = new WordCluster
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            SiteId = siteId,
            Kind = "concept",
            Title = "Concept group",
            MemberCount = 3,
            CohesionScore = 0.9,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        h.Clusters.Add(prior);
        SeedTwoGroups(h, userId, siteId, perGroup: 5); // 10 embedded — below the 20-word gate.

        var created = await h.Service.BuildForUserAsync(userId, siteId, CancellationToken.None);

        Assert.Equal(0, created);
        Assert.Contains(prior, h.Clusters); // prior concept cluster survives the no-op.
    }

    [Fact]
    public async Task BuildForUser_FullReplace_DoesNotTouchOtherUsersConceptClusters()
    {
        // Full-replace must be scoped to (this user, this site). Another user's concept cluster
        // must survive a rebuild of the first user.
        var h = new Harness();
        var userA = Guid.NewGuid();
        var userB = Guid.NewGuid();
        var siteId = Guid.NewGuid();
        var otherUserCluster = new WordCluster
        {
            Id = Guid.NewGuid(),
            UserId = userB,
            SiteId = siteId,
            Kind = "concept",
            Title = "Other user concept",
            MemberCount = 4,
            CohesionScore = 0.8,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        h.Clusters.Add(otherUserCluster);
        SeedTwoGroups(h, userA, siteId, perGroup: 12); // userA has enough to cluster.

        await h.Service.BuildForUserAsync(userA, siteId, CancellationToken.None);

        Assert.Contains(otherUserCluster, h.Clusters); // userB's cluster untouched.
    }

    [Fact]
    public async Task BuildForUser_FullReplace_DoesNotDeleteBookKindClusters()
    {
        // The full-replace delete is filtered to Kind=="concept". A book-grouper cluster (Kind
        // default "book") for the same user+site must NEVER be deleted by the concept rebuild.
        var h = new Harness();
        var userId = Guid.NewGuid();
        var siteId = Guid.NewGuid();
        var bookCluster = new WordCluster
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            SiteId = siteId,
            Kind = "book", // book-grouper row.
            Title = "Themes from Dracula",
            MemberCount = 5,
            CohesionScore = 0.7,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        h.Clusters.Add(bookCluster);
        SeedTwoGroups(h, userId, siteId, perGroup: 12);

        await h.Service.BuildForUserAsync(userId, siteId, CancellationToken.None);

        Assert.Contains(bookCluster, h.Clusters); // book cluster survives a concept rebuild.
    }

    [Fact]
    public async Task BuildForUser_RetiredWordsExcludedFromGate()
    {
        var h = new Harness();
        var userId = Guid.NewGuid();
        var siteId = Guid.NewGuid();
        SeedTwoGroups(h, userId, siteId, perGroup: 9); // 18 active embedded.
        for (var i = 0; i < 10; i++)
            h.Words.Add(Word(userId, siteId, Vec(1.0f, 0.01f * i), retired: true));

        var created = await h.Service.BuildForUserAsync(userId, siteId, CancellationToken.None);

        Assert.Equal(0, created); // gate counts only non-retired embedded → 18 < 20.
    }
}
