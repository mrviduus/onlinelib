using Application.Common.Interfaces;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Seo;

/// <summary>
/// Collects entity data needed as prompt placeholders.
/// Keys are the placeholder names (case-insensitive): e.g. {name}, {title}, {author}, {language}, {books}, {excerpt}.
/// </summary>
public class SeoContextBuilder(IAppDbContext db)
{
    public async Task<Dictionary<string, string?>> BuildAsync(SeoEntityType entityType, Guid entityId, CancellationToken ct)
    {
        return entityType switch
        {
            SeoEntityType.Author => await BuildAuthorAsync(entityId, ct),
            SeoEntityType.Edition => await BuildEditionAsync(entityId, ct),
            SeoEntityType.Genre => await BuildGenreAsync(entityId, ct),
            SeoEntityType.BlogPost => await BuildBlogPostAsync(entityId, ct),
            _ => throw new ArgumentOutOfRangeException(nameof(entityType))
        };
    }

    private async Task<Dictionary<string, string?>> BuildAuthorAsync(Guid id, CancellationToken ct)
    {
        var author = await db.Authors.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, ct)
            ?? throw new InvalidOperationException($"Author {id} not found");

        // Published books by this author (used in {books} placeholder)
        var books = await db.EditionAuthors.AsNoTracking()
            .Where(ea => ea.AuthorId == id)
            .Join(db.Editions, ea => ea.EditionId, e => e.Id, (ea, e) => e)
            .Where(e => e.Status == EditionStatus.Published)
            .OrderBy(e => e.Title)
            .Select(e => new { e.Title, e.Language })
            .ToListAsync(ct);

        var language = books.FirstOrDefault()?.Language ?? "en";
        var titles = string.Join(", ", books.Select(b => b.Title));

        return new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
        {
            ["name"] = author.Name,
            ["slug"] = author.Slug,
            ["books"] = titles,
            ["language"] = language,
            ["existing_bio"] = author.Bio,
        };
    }

    private async Task<Dictionary<string, string?>> BuildEditionAsync(Guid id, CancellationToken ct)
    {
        var edition = await db.Editions.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id, ct)
            ?? throw new InvalidOperationException($"Edition {id} not found");

        var authorName = await db.EditionAuthors.AsNoTracking()
            .Where(ea => ea.EditionId == id)
            .Join(db.Authors, ea => ea.AuthorId, a => a.Id, (ea, a) => a.Name)
            .FirstOrDefaultAsync(ct) ?? "";

        var excerpt = await db.Chapters.AsNoTracking()
            .Where(c => c.EditionId == id)
            .OrderBy(c => c.ChapterNumber)
            .Select(c => c.PlainText)
            .FirstOrDefaultAsync(ct) ?? "";
        if (excerpt.Length > 1000) excerpt = excerpt[..1000];

        return new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
        {
            ["title"] = edition.Title,
            ["slug"] = edition.Slug,
            ["author"] = authorName,
            ["language"] = edition.Language,
            ["excerpt"] = excerpt,
            ["existing_description"] = edition.Description,
        };
    }

    private async Task<Dictionary<string, string?>> BuildGenreAsync(Guid id, CancellationToken ct)
    {
        var genre = await db.Genres.AsNoTracking().FirstOrDefaultAsync(g => g.Id == id, ct)
            ?? throw new InvalidOperationException($"Genre {id} not found");

        // Edition ↔ Genre is many-to-many via Edition.Genres
        var titles = await db.Editions.AsNoTracking()
            .Where(e => e.Status == EditionStatus.Published && e.Genres.Any(gg => gg.Id == id))
            .OrderBy(e => e.Title)
            .Take(20)
            .Select(e => e.Title)
            .ToListAsync(ct);

        return new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
        {
            ["name"] = genre.Name,
            ["slug"] = genre.Slug,
            ["books"] = string.Join(", ", titles),
            ["language"] = "en",
            ["existing_description"] = genre.Description,
        };
    }

    private async Task<Dictionary<string, string?>> BuildBlogPostAsync(Guid id, CancellationToken ct)
    {
        var post = await db.BlogPosts.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, ct)
            ?? throw new InvalidOperationException($"BlogPost {id} not found");

        var plain = post.Content;
        if (plain.Length > 1500) plain = plain[..1500];

        return new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
        {
            ["title"] = post.Title,
            ["slug"] = post.Slug,
            ["content"] = plain,
            ["excerpt"] = post.Excerpt,
            ["language"] = post.Language,
            ["author"] = post.AuthorName,
            ["tags"] = post.Tags,
        };
    }
}
