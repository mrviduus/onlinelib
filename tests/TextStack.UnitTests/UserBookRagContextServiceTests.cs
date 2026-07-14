using Application.Common.Interfaces;
using Application.Rag;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Moq;
using TextStack.Ai.Rag;

namespace TextStack.UnitTests;

/// <summary>
/// Persistent Book Chat (feat/book-chat-history) scope-addition — the user's OWN highlights on a user book
/// become guaranteed RAG context (so "what did I highlight about X?" works). Locks the ownership filter
/// (another user's highlights never leak), the PDF page prefix, and the inline-note rendering.
/// </summary>
public class UserBookRagContextServiceTests
{
    private static readonly Guid User = Guid.NewGuid();
    private static readonly Guid Other = Guid.NewGuid();
    private static readonly Guid Book = Guid.NewGuid();

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

    private static Highlight Hl(Guid userId, Guid bookId, string text, string? note = null,
        string anchor = "{}", int minutesAgo = 0) =>
        new()
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            SiteId = Guid.NewGuid(),
            UserBookId = bookId,
            AnchorJson = anchor,
            Color = "yellow",
            SelectedText = text,
            NoteText = note,
            CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-minutesAgo),
        };

    private static UserBookRagContextService BuildService(List<Highlight> highlights)
    {
        var db = new Mock<IAppDbContext>();
        db.Setup(x => x.Highlights).Returns(() => FakeSet(highlights).Object);
        // rag is unused by GetPrivateNotesAsync — a bare mock suffices.
        return new UserBookRagContextService(db.Object, Mock.Of<IRagService>());
    }

    [Fact]
    public async Task GetPrivateNotesAsync_IncludesOwnHighlightText()
    {
        var svc = BuildService([Hl(User, Book, "the hero doubts himself")]);

        var notes = await svc.GetPrivateNotesAsync(User, Book, TestContext.Current.CancellationToken);

        var note = Assert.Single(notes);
        Assert.Contains("the hero doubts himself", note.Text);
        Assert.Equal("highlight", note.Kind);
    }

    [Fact]
    public async Task GetPrivateNotesAsync_AnotherUsersHighlights_NeverLeak()
    {
        var svc = BuildService(
        [
            Hl(User, Book, "mine"),
            Hl(Other, Book, "SECRET not mine"),
        ]);

        var notes = await svc.GetPrivateNotesAsync(User, Book, TestContext.Current.CancellationToken);

        var note = Assert.Single(notes);
        Assert.Contains("mine", note.Text);
        Assert.DoesNotContain(notes, n => n.Text.Contains("SECRET"));
    }

    [Fact]
    public async Task GetPrivateNotesAsync_OtherBooksHighlights_Excluded()
    {
        var svc = BuildService(
        [
            Hl(User, Book, "this book"),
            Hl(User, Guid.NewGuid(), "different book"),
        ]);

        var notes = await svc.GetPrivateNotesAsync(User, Book, TestContext.Current.CancellationToken);

        Assert.Contains("this book", Assert.Single(notes).Text);
    }

    [Fact]
    public async Task GetPrivateNotesAsync_CapsAtPrivateNoteCap()
    {
        var many = Enumerable.Range(0, RagContextService.PrivateNoteCap + 10)
            .Select(i => Hl(User, Book, $"h{i}", minutesAgo: i))
            .ToList();
        var svc = BuildService(many);

        var notes = await svc.GetPrivateNotesAsync(User, Book, TestContext.Current.CancellationToken);

        Assert.Equal(RagContextService.PrivateNoteCap, notes.Count);
    }

    // ---- pure text rendering ----

    [Fact]
    public void BuildHighlightText_PlainAnchor_NoPagePrefix()
        => Assert.Equal("passage", UserBookRagContextService.BuildHighlightText("passage", null, "{}"));

    [Fact]
    public void BuildHighlightText_WithInlineNote_AppendsNote()
        => Assert.Equal(
            "passage — note: my thought",
            UserBookRagContextService.BuildHighlightText("passage", "my thought", "{}"));

    [Fact]
    public void BuildHighlightText_PdfAnchor_PrefixesPage()
        => Assert.Equal(
            "p.12: passage",
            UserBookRagContextService.BuildHighlightText("passage", null, "{\"v\":1,\"kind\":\"pdf\",\"page\":12}"));

    [Fact]
    public void ExtractPdfPage_PdfAnchor_ReturnsPage()
        => Assert.Equal(7, UserBookRagContextService.ExtractPdfPage("{\"kind\":\"pdf\",\"page\":7}"));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not json")]
    [InlineData("{\"kind\":\"cfi\",\"page\":3}")] // non-pdf anchor → no page
    [InlineData("{\"kind\":\"pdf\"}")]             // pdf but no page
    [InlineData("{\"kind\":\"pdf\",\"page\":0}")]  // non-positive page ignored
    public void ExtractPdfPage_NoUsablePage_ReturnsNull(string? anchor)
        => Assert.Null(UserBookRagContextService.ExtractPdfPage(anchor));
}
