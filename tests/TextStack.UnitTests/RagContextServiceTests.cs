using Application.Common.Interfaces;
using Application.Rag;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Moq;
using TextStack.Ai.Rag;

namespace TextStack.UnitTests;

public class RagContextServiceTests
{
    // ---- BuildAsync spoiler-gate contract (the leak-critical path) -------------------------------
    // These lock down the single most dangerous regression: that the AUTHENTICATED ask path must
    // NEVER hand a `null` gate to IRagService.RetrieveAsync (null = ungated full-book). No progress
    // must short-circuit to an empty context WITHOUT calling retrieve; ord 0 must call retrieve with
    // maxChapterOrd: 0 (a real read first chapter), not null.

    private static readonly Guid User = Guid.NewGuid();
    private static readonly Guid Site = Guid.NewGuid();
    private static readonly Guid Edition = Guid.NewGuid();

    private sealed class RagSpy : IRagService
    {
        public int Calls { get; private set; }
        public int? LastGate { get; private set; }
        public bool GateWasNullOnAnyCall { get; private set; }

        public Task<IReadOnlyList<RetrievedChunk>> RetrieveAsync(
            Guid editionId, string query, int k, int? maxChapterOrd, bool includeSummaries, CancellationToken ct)
        {
            Calls++;
            LastGate = maxChapterOrd;
            if (maxChapterOrd is null) GateWasNullOnAnyCall = true;
            return Task.FromResult<IReadOnlyList<RetrievedChunk>>([]);
        }

        public Task<IReadOnlyList<RetrievedChunk>> RetrieveUserBookAsync(
            Guid userId, Guid userBookId, string query, int k, int? maxChapterOrd, bool includeSummaries, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<RetrievedChunk>>([]);
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

    private static Chapter Chap(Guid id, Guid editionId, int ord) =>
        new() { Id = id, EditionId = editionId, ChapterNumber = ord, Title = "t", Html = "<p/>", PlainText = "t" };

    private static ReadingProgress Progress(Guid chapterId, int maxOrd) =>
        new()
        {
            UserId = User,
            SiteId = Site,
            EditionId = Edition,
            ChapterId = chapterId,
            MaxChapterNumber = maxOrd,
            Locator = string.Empty,
        };

    private static RagContextService BuildService(
        RagSpy rag,
        List<ReadingProgress> progress,
        List<Chapter> chapters,
        List<Highlight>? highlights = null,
        List<Note>? notes = null)
    {
        var db = new Mock<IAppDbContext>();
        db.Setup(x => x.ReadingProgresses).Returns(() => FakeSet(progress).Object);
        db.Setup(x => x.Chapters).Returns(() => FakeSet(chapters).Object);
        db.Setup(x => x.Highlights).Returns(() => FakeSet(highlights ?? []).Object);
        db.Setup(x => x.Notes).Returns(() => FakeSet(notes ?? []).Object);
        return new RagContextService(db.Object, rag);
    }

    [Fact]
    public async Task BuildAsync_NoProgress_ReturnsEmpty_NeverCallsRetrieve()
    {
        var rag = new RagSpy();
        var svc = BuildService(rag, progress: [], chapters: []);

        var ctx = await svc.BuildAsync(
            User, Site, Edition, "what happens?", 8, currentChapterId: null, includeSummaries: false, TestContext.Current.CancellationToken);

        Assert.Empty(ctx.Chunks);
        Assert.Empty(ctx.Notes);
        // The leak guard: retrieve must NOT run on the no-progress path. If it did with a null gate,
        // the SQL would surface the WHOLE book to a non-reader.
        Assert.Equal(0, rag.Calls);
    }

    [Fact]
    public async Task BuildAsync_ProgressAtOrdZero_CallsRetrieveWithGateZero_NotNull()
    {
        var chapterId = Guid.NewGuid();
        var rag = new RagSpy();
        var svc = BuildService(
            rag,
            progress: [Progress(chapterId, maxOrd: 0)],
            chapters: [Chap(chapterId, Edition, ord: 0)]);

        await svc.BuildAsync(
            User, Site, Edition, "what happens?", 8, currentChapterId: null, includeSummaries: false, TestContext.Current.CancellationToken);

        Assert.Equal(1, rag.Calls);
        Assert.False(rag.GateWasNullOnAnyCall);
        Assert.Equal(0, rag.LastGate);
    }

    [Fact]
    public async Task BuildAsync_ForeignCurrentChapterId_Ignored_GateStaysAtPersisted()
    {
        var readChapter = Guid.NewGuid();
        var foreignChapter = Guid.NewGuid();
        var rag = new RagSpy();
        var svc = BuildService(
            rag,
            progress: [Progress(readChapter, maxOrd: 2)],
            // The "foreign" chapter has a high ord but belongs to a DIFFERENT edition.
            chapters:
            [
                Chap(readChapter, Edition, ord: 2),
                Chap(foreignChapter, Guid.NewGuid(), ord: 99),
            ]);

        await svc.BuildAsync(
            User, Site, Edition, "spoil me", 8, currentChapterId: foreignChapter, includeSummaries: false, TestContext.Current.CancellationToken);

        Assert.Equal(1, rag.Calls);
        // Peek-ahead defense: a chapter id from another edition must resolve to null and NOT push the gate.
        Assert.Equal(2, rag.LastGate);
    }

    [Fact]
    public async Task BuildAsync_CurrentChapterAheadOfPersisted_GateRisesToCurrent()
    {
        var readChapter = Guid.NewGuid();
        var openChapter = Guid.NewGuid();
        var rag = new RagSpy();
        var svc = BuildService(
            rag,
            progress: [Progress(readChapter, maxOrd: 1)],
            chapters:
            [
                Chap(readChapter, Edition, ord: 1),
                Chap(openChapter, Edition, ord: 3),
            ]);

        await svc.BuildAsync(
            User, Site, Edition, "current chapter", 8, currentChapterId: openChapter, includeSummaries: false, TestContext.Current.CancellationToken);

        Assert.Equal(3, rag.LastGate);
    }

    [Fact]
    public void HighlightToText_NoNote_ReturnsSelectionOnly()
        => Assert.Equal("the selected passage", RagContextService.HighlightToText("the selected passage", null));

    [Fact]
    public void HighlightToText_WithNote_AppendsNote()
        => Assert.Equal(
            "the selected passage — note: my thought",
            RagContextService.HighlightToText("the selected passage", "my thought"));

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void HighlightToText_BlankNote_ReturnsSelectionOnly(string note)
        => Assert.Equal("passage", RagContextService.HighlightToText("passage", note));

    // Gate ordinal = max(persisted high-water mark, currently-open chapter ord), each null when absent.
    // null = "no progress at all" (gate empty/insufficient); a present 0 is a real read first (0-based)
    // chapter and must NOT be treated as "nothing read". currentOrd is null when the open chapter isn't
    // part of this edition (resolved server-side), so it can't push the gate up.

    [Fact]
    public void EffectiveLastReadOrd_NoPersistedProgressOpenChapter4_Uses4()
        => Assert.Equal(4, RagContextService.EffectiveLastReadOrd(persistedLastRead: null, currentOrd: 4));

    [Fact]
    public void EffectiveLastReadOrd_NoPersistedOpenChapter0_Uses0_NotTreatedAsEmpty()
        => Assert.Equal(0, RagContextService.EffectiveLastReadOrd(persistedLastRead: null, currentOrd: 0));

    [Fact]
    public void EffectiveLastReadOrd_NothingRead_ReturnsNull()
        => Assert.Null(RagContextService.EffectiveLastReadOrd(persistedLastRead: null, currentOrd: null));

    [Fact]
    public void EffectiveLastReadOrd_ForeignOrBogusChapter_Ignored_KeepsPersisted()
        => Assert.Equal(6, RagContextService.EffectiveLastReadOrd(persistedLastRead: 6, currentOrd: null));

    [Fact]
    public void EffectiveLastReadOrd_PersistedAheadOfOpenChapter_KeepsPersisted()
        => Assert.Equal(6, RagContextService.EffectiveLastReadOrd(persistedLastRead: 6, currentOrd: 2));

    [Fact]
    public void EffectiveLastReadOrd_PersistedZeroOpenChapter3_Uses3()
        => Assert.Equal(3, RagContextService.EffectiveLastReadOrd(persistedLastRead: 0, currentOrd: 3));

    [Fact]
    public void EffectiveLastReadOrd_OpenChapterAheadOfPersisted_UsesCurrent()
        => Assert.Equal(5, RagContextService.EffectiveLastReadOrd(persistedLastRead: 3, currentOrd: 5));
}
