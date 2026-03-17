using System.Text.RegularExpressions;
using Application.Common.Interfaces;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using TextStack.Epub;
using TextStack.Epub.Models;

namespace Application.Export;

public class EpubExportService(IAppDbContext db, IFileStorageService storage)
{
    public async Task<(MemoryStream Stream, string FileName)?> ExportEditionAsync(
        Guid siteId, string slug, string language, CancellationToken ct)
    {
        var edition = await db.Editions
            .Include(e => e.EditionAuthors).ThenInclude(ea => ea.Author)
            .Include(e => e.Chapters)
            .Include(e => e.Assets)
            .Where(e => e.SiteId == siteId && e.Slug == slug && e.Language == language
                        && e.Status == EditionStatus.Published)
            .FirstOrDefaultAsync(ct);

        if (edition is null || !edition.Chapters.Any())
            return null;

        var author = string.Join(", ",
            edition.EditionAuthors.OrderBy(ea => ea.Order).Select(ea => ea.Author.Name));

        // Load cover
        EpubImageData? cover = null;
        if (!string.IsNullOrEmpty(edition.CoverPath))
        {
            var coverBytes = await ReadFileBytes(edition.CoverPath, ct);
            if (coverBytes is not null)
            {
                var ext = Path.GetExtension(edition.CoverPath).TrimStart('.');
                cover = new EpubImageData
                {
                    Id = "cover",
                    Data = coverBytes,
                    ContentType = ext == "png" ? "image/png" : "image/jpeg",
                    FileName = $"cover.{ext}"
                };
            }
        }

        // Load inline images
        var images = new List<EpubImageData>();
        foreach (var asset in edition.Assets.Where(a => a.Kind == AssetKind.InlineImage))
        {
            var bytes = await ReadFileBytes(asset.StoragePath, ct);
            if (bytes is null) continue;

            var ext = GetExtension(asset.ContentType);
            images.Add(new EpubImageData
            {
                Id = asset.Id.ToString(),
                Data = bytes,
                ContentType = asset.ContentType,
                FileName = $"img-{asset.Id}.{ext}"
            });
        }

        // Build chapter data with image src rewriting
        var chapters = edition.Chapters
            .OrderBy(c => c.ChapterNumber)
            .Select(c =>
            {
                var html = c.Html;
                // Rewrite asset URLs to local EPUB paths
                foreach (var asset in edition.Assets.Where(a => a.Kind == AssetKind.InlineImage))
                {
                    var ext = GetExtension(asset.ContentType);
                    html = html.Replace(
                        $"/books/{edition.Id}/assets/{asset.Id}",
                        $"images/img-{asset.Id}.{ext}");
                }
                return new EpubChapterData
                {
                    Order = c.ChapterNumber,
                    Title = c.Title,
                    Html = html
                };
            })
            .ToList();

        var bookData = new EpubBookData
        {
            Title = edition.Title,
            Language = language,
            Author = string.IsNullOrEmpty(author) ? null : author,
            Description = edition.Description,
            Cover = cover,
            Chapters = chapters,
            Images = images
        };

        var stream = EpubBuilder.Build(bookData);
        return (stream, $"{slug}.epub");
    }

    public async Task<(MemoryStream Stream, string FileName)?> ExportUserBookAsync(
        Guid userId, Guid userBookId, CancellationToken ct)
    {
        var book = await db.UserBooks
            .Include(b => b.Chapters)
            .Where(b => b.Id == userBookId && b.UserId == userId
                        && b.Status == UserBookStatus.Ready)
            .FirstOrDefaultAsync(ct);

        if (book is null || !book.Chapters.Any())
            return null;

        // Load cover
        EpubImageData? cover = null;
        if (!string.IsNullOrEmpty(book.CoverPath))
        {
            var coverBytes = await ReadFileBytes(book.CoverPath, ct);
            if (coverBytes is not null)
            {
                var ext = Path.GetExtension(book.CoverPath).TrimStart('.');
                cover = new EpubImageData
                {
                    Id = "cover",
                    Data = coverBytes,
                    ContentType = ext == "png" ? "image/png" : "image/jpeg",
                    FileName = $"cover.{ext}"
                };
            }
        }

        var chapters = book.Chapters
            .OrderBy(c => c.ChapterNumber)
            .Select(c => new EpubChapterData
            {
                Order = c.ChapterNumber,
                Title = c.Title,
                Html = c.Html
            })
            .ToList();

        var bookData = new EpubBookData
        {
            Title = book.Title,
            Language = book.Language,
            Author = book.Author,
            Description = book.Description,
            Cover = cover,
            Chapters = chapters
        };

        var stream = EpubBuilder.Build(bookData);
        return (stream, $"{book.Slug}.epub");
    }

    private async Task<byte[]?> ReadFileBytes(string path, CancellationToken ct)
    {
        var stream = await storage.GetFileAsync(path, ct);
        if (stream is null) return null;

        using (stream)
        {
            using var ms = new MemoryStream();
            await stream.CopyToAsync(ms, ct);
            return ms.ToArray();
        }
    }

    private static string GetExtension(string contentType) => contentType switch
    {
        "image/png" => "png",
        "image/gif" => "gif",
        "image/svg+xml" => "svg",
        "image/webp" => "webp",
        _ => "jpg"
    };
}
