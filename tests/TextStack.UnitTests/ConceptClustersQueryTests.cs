using Api.Endpoints;
using Application.Common.Interfaces;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace TextStack.UnitTests;

// AI-060: VocabularyEndpoints.QueryConceptsAsync — the read-only concept-cluster projection
// behind GET /me/vocabulary/concepts. Mocks IAppDbContext's WordClusters / VocabularyWords
// DbSets over plain List<T> via the shared TestAsync* harness (the production AppDbContext
// can't load on EF InMemory). No HttpContext/auth needed — the projection is a static helper.
public class ConceptClustersQueryTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid SiteId = Guid.NewGuid();

    private sealed class Harness
    {
        public List<VocabularyWord> Words { get; } = [];
        public List<WordCluster> Clusters { get; } = [];
        public IAppDbContext Db { get; }

        public Harness()
        {
            var db = new Mock<IAppDbContext>();
            db.Setup(x => x.WordClusters).Returns(() => FakeSet(Clusters).Object);
            db.Setup(x => x.VocabularyWords).Returns(() => FakeSet(Words).Object);
            Db = db.Object;
        }
    }

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
        return set;
    }

    private static WordCluster Concept(string title, int memberCount, double cohesion = 0.5, string? theme = null)
        => new()
        {
            Id = Guid.NewGuid(),
            UserId = UserId,
            SiteId = SiteId,
            Kind = "concept",
            Title = title,
            Theme = theme,
            MemberCount = memberCount,
            CohesionScore = cohesion,
        };

    private static VocabularyWord MemberWord(Guid conceptId, string word)
        => new()
        {
            Id = Guid.NewGuid(),
            UserId = UserId,
            SiteId = SiteId,
            Word = word,
            Language = "en",
            ConceptClusterId = conceptId,
        };

    [Fact]
    public async Task QueryConceptsAsync_NoConceptClusters_ReturnsEmpty()
    {
        var h = new Harness();

        var result = await VocabularyEndpoints.QueryConceptsAsync(h.Db, UserId, SiteId, CancellationToken.None);

        Assert.Empty(result);
    }

    [Fact]
    public async Task QueryConceptsAsync_ReturnsOnlyConceptKindForUser()
    {
        var h = new Harness();
        var concept = Concept("Distributed systems", memberCount: 3, theme: "Backend");
        h.Clusters.Add(concept);
        // Book-kind cluster (default) must be excluded.
        h.Clusters.Add(new WordCluster { Id = Guid.NewGuid(), UserId = UserId, SiteId = SiteId, Kind = "book", Title = "Dracula vocab", MemberCount = 9 });
        // Concept cluster owned by another user must be excluded.
        h.Clusters.Add(new WordCluster { Id = Guid.NewGuid(), UserId = Guid.NewGuid(), SiteId = SiteId, Kind = "concept", Title = "Other user", MemberCount = 5 });
        // Concept cluster on another site must be excluded.
        h.Clusters.Add(new WordCluster { Id = Guid.NewGuid(), UserId = UserId, SiteId = Guid.NewGuid(), Kind = "concept", Title = "Other site", MemberCount = 5 });

        var result = await VocabularyEndpoints.QueryConceptsAsync(h.Db, UserId, SiteId, CancellationToken.None);

        var item = Assert.Single(result);
        Assert.Equal(concept.Id, item.Id);
        Assert.Equal("Distributed systems", item.Title);
        Assert.Equal("Backend", item.Theme);
    }

    [Fact]
    public async Task QueryConceptsAsync_OrdersByMemberCountDesc()
    {
        var h = new Harness();
        h.Clusters.Add(Concept("Small", memberCount: 2));
        h.Clusters.Add(Concept("Big", memberCount: 10));
        h.Clusters.Add(Concept("Medium", memberCount: 5));

        var result = await VocabularyEndpoints.QueryConceptsAsync(h.Db, UserId, SiteId, CancellationToken.None);

        Assert.Equal(new[] { "Big", "Medium", "Small" }, result.Select(c => c.Title).ToArray());
    }

    [Fact]
    public async Task QueryConceptsAsync_IncludesMemberWords_CappedAtSix_OrderedByWord()
    {
        var h = new Harness();
        var concept = Concept("Distributed systems", memberCount: 8);
        h.Clusters.Add(concept);
        foreach (var w in new[] { "sharding", "replication", "consensus", "quorum", "gossip", "raft", "paxos", "leader" })
            h.Words.Add(MemberWord(concept.Id, w));
        // A word belonging to a different concept must not leak in.
        h.Words.Add(MemberWord(Guid.NewGuid(), "unrelated"));

        var result = await VocabularyEndpoints.QueryConceptsAsync(h.Db, UserId, SiteId, CancellationToken.None);

        var item = Assert.Single(result);
        Assert.Equal(8, item.MemberCount);
        Assert.Equal(6, item.Words.Count);
        // First 6 alphabetically (case-insensitive): consensus, gossip, leader, paxos, quorum, raft.
        Assert.Equal(new[] { "consensus", "gossip", "leader", "paxos", "quorum", "raft" }, item.Words.ToArray());
        Assert.DoesNotContain("unrelated", item.Words);
    }

    [Fact]
    public async Task QueryConceptsAsync_ConceptWithoutWords_ReturnsEmptyWordList()
    {
        var h = new Harness();
        h.Clusters.Add(Concept("Empty concept", memberCount: 0));

        var result = await VocabularyEndpoints.QueryConceptsAsync(h.Db, UserId, SiteId, CancellationToken.None);

        var item = Assert.Single(result);
        Assert.Empty(item.Words);
    }
}
