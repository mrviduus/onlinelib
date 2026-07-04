using System.Linq.Expressions;
using Api.Endpoints;
using Domain.Entities;

namespace Api.Mapping;

// R4: single source of truth for Bookmark -> BookmarkDto. Used both as an EF projection
// (.Select(BookmarkMappings.Project)) and in-memory (bookmark.ToDto()).
public static class BookmarkMappings
{
    public static readonly Expression<Func<Bookmark, BookmarkDto>> Project = b => new BookmarkDto(
        b.Id, b.EditionId, b.ChapterId, b.Locator, b.Title, b.CreatedAt);

    private static readonly Func<Bookmark, BookmarkDto> _compiled = Project.Compile();

    public static BookmarkDto ToDto(this Bookmark b) => _compiled(b);
}
