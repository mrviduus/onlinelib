using System.Security.Cryptography;
using System.Text.Json;
using Application.Common.Interfaces;
using Contracts.UserBooks;
using Domain.Entities;
using Domain.Enums;
using Domain.Utilities;
using Microsoft.EntityFrameworkCore;

namespace Application.UserBooks;

public class UserBookService(IAppDbContext db, IFileStorageService storage)
{
    public async Task<(UploadUserBookResponse? Response, string? Error)> UploadAsync(
        Guid userId, Stream fileStream, string fileName, string? title, string? language, CancellationToken ct)
    {
        // Detect format
        var format = DetectFormat(fileName);
        if (format == BookFormat.Other)
            return (null, "Unsupported file format. Only EPUB and PDF are supported.");

        using var ms = new MemoryStream();
        await fileStream.CopyToAsync(ms, ct);

        return await CreateBookAsync(
            userId,
            content: ms,
            originalFileName: fileName,
            storedFileName: $"original{Path.GetExtension(fileName)}",
            format: format,
            title: title ?? Path.GetFileNameWithoutExtension(fileName),
            author: null,
            language: language ?? "en",
            sourceUrl: null,
            isClip: false,
            ct);
    }

    /// <summary>
    /// "Send to TextStack" receiver: persists already-clean article HTML as a private clip
    /// (UserBook with <c>IsClip=true</c>, <see cref="BookFormat.Html"/>) reusing the same
    /// upload plumbing. NEVER creates Work/Edition/Chapter rows or touches the SSG path.
    /// </summary>
    public async Task<(UploadUserBookResponse? Response, string? Error)> ClipAsync(
        Guid userId, ClipRequest req, CancellationToken ct)
    {
        using var ms = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(req.Html));

        return await CreateBookAsync(
            userId,
            content: ms,
            // Worker uses OriginalFileName as the extraction request FileName, so it must
            // carry .html for the registry to resolve HtmlTextExtractor.
            originalFileName: "original.html",
            storedFileName: "original.html",
            format: BookFormat.Html,
            title: req.Title,
            author: req.Author,
            language: req.Language ?? "en",
            sourceUrl: req.SourceUrl,
            isClip: true,
            ct);
    }

    /// <summary>
    /// Shared body for <see cref="UploadAsync"/> and <see cref="ClipAsync"/>: quota check,
    /// slug gen + collision, create UserBook + UserBookFile + UserIngestionJob, storage save,
    /// SHA256, quota update. <paramref name="content"/> position is reset internally.
    /// </summary>
    private async Task<(UploadUserBookResponse? Response, string? Error)> CreateBookAsync(
        Guid userId, MemoryStream content, string originalFileName, string storedFileName,
        BookFormat format, string title, string? author, string language, string? sourceUrl,
        bool isClip, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
            return (null, "User not found");

        var fileSize = content.Length;

        var storageLimit = user.IsGuest ? User.GuestStorageLimitBytes : User.StorageLimitBytes;
        if (user.StorageUsedBytes + fileSize > storageLimit)
            return (null, $"Storage limit exceeded. Used: {user.StorageUsedBytes}, Limit: {storageLimit}");

        if (user.IsGuest)
        {
            var guestBookCount = await db.UserBooks.CountAsync(b => b.UserId == userId, ct);
            if (guestBookCount >= 1)
                return (null, "Guest accounts can upload 1 book. Sign up for more.");
        }

        content.Position = 0;
        var sha256 = await ComputeSha256Async(content, ct);

        var userBookId = Guid.NewGuid();
        var slug = SlugGenerator.GenerateSlug(title);

        var existingSlug = await db.UserBooks
            .Where(b => b.UserId == userId && b.Slug == slug)
            .Select(b => b.Slug)
            .FirstOrDefaultAsync(ct);
        if (existingSlug is not null)
            // Suffix with the (globally unique) book id, NOT a second-resolution
            // timestamp: two same-title saves within the same second would otherwise
            // collide on the (UserId, Slug) unique index and 500 on SaveChangesAsync.
            slug = $"{slug}-{userBookId.ToString("N")[..8]}";

        var userBook = new UserBook
        {
            Id = userBookId,
            UserId = userId,
            Title = title,
            Slug = slug,
            Language = language,
            Author = author,
            Status = UserBookStatus.Processing,
            SourceUrl = sourceUrl,
            IsClip = isClip,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        content.Position = 0;
        var storagePath = await storage.SaveUserFileAsync(userId, userBookId, storedFileName, content, ct);

        var userBookFile = new UserBookFile
        {
            Id = Guid.NewGuid(),
            UserBookId = userBookId,
            OriginalFileName = originalFileName,
            StoragePath = storagePath,
            Format = format,
            Sha256 = sha256,
            FileSize = fileSize,
            UploadedAt = DateTimeOffset.UtcNow
        };

        var job = new UserIngestionJob
        {
            Id = Guid.NewGuid(),
            UserBookId = userBookId,
            UserBookFileId = userBookFile.Id,
            Status = JobStatus.Queued,
            CreatedAt = DateTimeOffset.UtcNow
        };

        user.StorageUsedBytes += fileSize;

        db.UserBooks.Add(userBook);
        db.UserBookFiles.Add(userBookFile);
        db.UserIngestionJobs.Add(job);
        await db.SaveChangesAsync(ct);

        return (new UploadUserBookResponse(userBookId, job.Id, UserBookStatus.Processing.ToString()), null);
    }

    /// <summary>
    /// Lists the user's books. <paramref name="shelf"/>="readlater" returns only clips
    /// (the Read later shelf); absent/other returns only non-clips (the Books tab) so clips
    /// never pollute the normal library. <paramref name="status"/>="unread" filters IsRead==false.
    /// </summary>
    public async Task<IReadOnlyList<UserBookListDto>> GetBooksAsync(
        Guid userId, CancellationToken ct, string? shelf = null, string? status = null)
    {
        var readLater = string.Equals(shelf, "readlater", StringComparison.OrdinalIgnoreCase);

        var query = db.UserBooks
            .Where(b => b.UserId == userId && b.TakedownAt == null)
            .Where(b => b.IsClip == readLater);

        if (string.Equals(status, "unread", StringComparison.OrdinalIgnoreCase))
            query = query.Where(b => !b.IsRead);

        var books = await query
            .OrderByDescending(b => b.CreatedAt)
            .Select(b => new
            {
                b.Id,
                b.Title,
                b.Slug,
                b.Language,
                b.Author,
                b.Description,
                b.CoverPath,
                b.Genre,
                b.Status,
                b.ErrorMessage,
                ChapterCount = b.Chapters.Count,
                b.TotalWordCount,
                b.CreatedAt,
                b.CompletedAt,
                b.ProgressPercent,
                b.ProgressUpdatedAt,
                b.ProgressChapterSlug,
                b.Tags,
                b.SuggestedTags,
                b.SourceUrl,
                b.IsClip,
                b.IsRead,
                b.ReadAt
            })
            .ToListAsync(ct);

        return books.Select(b => new UserBookListDto(
            b.Id,
            b.Title,
            b.Slug,
            b.Language,
            b.Author,
            b.Description,
            b.CoverPath,
            b.Genre,
            b.Status.ToString(),
            b.ErrorMessage,
            b.ChapterCount,
            b.TotalWordCount,
            b.CreatedAt,
            b.CompletedAt,
            b.ProgressPercent,
            b.ProgressUpdatedAt,
            b.ProgressChapterSlug,
            b.Tags ?? [],
            b.SuggestedTags ?? [],
            b.SourceUrl,
            b.IsClip,
            b.IsRead,
            b.ReadAt
        )).ToList();
    }

    /// <summary>Manually flip a book's read state (Read later shelf). Owner-scoped.</summary>
    public async Task<(bool Success, string? Error)> SetReadAsync(
        Guid userId, Guid bookId, bool isRead, CancellationToken ct)
    {
        var book = await db.UserBooks.FirstOrDefaultAsync(
            b => b.UserId == userId && b.Id == bookId && b.TakedownAt == null, ct);
        if (book is null)
            return (false, "Book not found");

        book.IsRead = isRead;
        book.ReadAt = isRead ? DateTimeOffset.UtcNow : null;
        book.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    public async Task<UserBookDetailDto?> GetBookAsync(Guid userId, Guid bookId, CancellationToken ct)
    {
        var book = await db.UserBooks
            .Where(b => b.UserId == userId && b.Id == bookId && b.TakedownAt == null)
            .Select(b => new
            {
                b.Id,
                b.Title,
                b.Slug,
                b.Language,
                b.Author,
                b.Description,
                b.CoverPath,
                b.Genre,
                b.PublishedYear,
                b.TotalWordCount,
                b.Status,
                b.ErrorMessage,
                b.TocJson,
                b.CreatedAt,
                b.UpdatedAt,
                b.CompletedAt,
                b.RagStatus,
                b.RagChunkCount,
                b.RagEmbeddedCount,
                HasOriginalPdf = b.BookFiles.Any(f => f.Format == BookFormat.Pdf),
                Chapters = b.Chapters
                    .OrderBy(c => c.ChapterNumber)
                    .Select(c => new UserChapterSummaryDto(
                        c.Id, c.ChapterNumber, c.Slug, c.Title, c.WordCount, c.SourceStartPage))
                    .ToList()
            })
            .FirstOrDefaultAsync(ct);

        if (book is null)
            return null;

        IReadOnlyList<TocEntryDto>? toc = null;
        if (!string.IsNullOrEmpty(book.TocJson))
        {
            try
            {
                toc = JsonSerializer.Deserialize<List<TocEntryDto>>(book.TocJson, Common.JsonDefaults.Options);
            }
            catch (JsonException)
            {
                // Malformed ToC JSON — return null toc
            }
        }

        return new UserBookDetailDto(
            book.Id,
            book.Title,
            book.Slug,
            book.Language,
            book.Author,
            book.Description,
            book.CoverPath,
            book.Genre,
            book.PublishedYear,
            book.TotalWordCount,
            book.Status.ToString(),
            book.ErrorMessage,
            book.Chapters,
            toc,
            book.CreatedAt,
            book.UpdatedAt,
            book.CompletedAt,
            book.RagStatus.ToString(),
            book.RagChunkCount,
            book.RagEmbeddedCount,
            book.HasOriginalPdf
        );
    }

    public async Task<UserChapterDto?> GetChapterBySlugAsync(Guid userId, Guid bookId, string slug, CancellationToken ct)
    {
        var chapter = await db.UserChapters
            .Where(c => c.UserBook.UserId == userId && c.UserBookId == bookId && c.Slug == slug && c.UserBook.TakedownAt == null)
            .Select(c => new
            {
                c.Id,
                c.ChapterNumber,
                c.Slug,
                c.Title,
                c.Html,
                c.WordCount,
                c.UserBookId
            })
            .FirstOrDefaultAsync(ct);

        if (chapter is null)
            return null;

        var prev = await db.UserChapters
            .Where(c => c.UserBookId == chapter.UserBookId && c.ChapterNumber == chapter.ChapterNumber - 1)
            .Select(c => new UserChapterNavDto(c.ChapterNumber, c.Slug, c.Title))
            .FirstOrDefaultAsync(ct);

        var next = await db.UserChapters
            .Where(c => c.UserBookId == chapter.UserBookId && c.ChapterNumber == chapter.ChapterNumber + 1)
            .Select(c => new UserChapterNavDto(c.ChapterNumber, c.Slug, c.Title))
            .FirstOrDefaultAsync(ct);

        return new UserChapterDto(
            chapter.Id,
            chapter.ChapterNumber,
            chapter.Slug,
            chapter.Title,
            chapter.Html,
            chapter.WordCount,
            prev,
            next
        );
    }

    public async Task<(bool Success, string? Error)> DeleteAsync(Guid userId, Guid bookId, CancellationToken ct)
    {
        var book = await db.UserBooks
            .Include(b => b.BookFiles)
            .FirstOrDefaultAsync(b => b.UserId == userId && b.Id == bookId, ct);

        if (book is null)
            return (false, "Book not found");

        // Calculate total file size to deduct from user quota
        var totalFileSize = book.BookFiles.Sum(f => f.FileSize);

        // Delete files from storage
        await storage.DeleteUserBookDirectoryAsync(userId, bookId, ct);

        // Update user storage quota
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is not null)
            user.StorageUsedBytes = Math.Max(0, user.StorageUsedBytes - totalFileSize);

        // Delete from database (cascade will handle related entities)
        db.UserBooks.Remove(book);
        await db.SaveChangesAsync(ct);

        return (true, null);
    }

    public async Task<(bool Success, string? Error)> CancelAsync(Guid userId, Guid bookId, CancellationToken ct)
    {
        var book = await db.UserBooks.FirstOrDefaultAsync(b => b.UserId == userId && b.Id == bookId, ct);
        if (book is null)
            return (false, "Book not found");

        if (book.Status != UserBookStatus.Processing)
            return (false, "Only processing books can be cancelled");

        // Cancel any active job
        var job = await db.UserIngestionJobs
            .Where(j => j.UserBookId == bookId && (j.Status == JobStatus.Queued || j.Status == JobStatus.Processing))
            .FirstOrDefaultAsync(ct);
        if (job is not null)
        {
            job.Status = JobStatus.Failed;
            job.Error = "Cancelled by user";
            job.FinishedAt = DateTimeOffset.UtcNow;
        }

        book.Status = UserBookStatus.Failed;
        book.ErrorMessage = "Cancelled by user";
        book.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    public async Task<(bool Success, string? Error)> RetryAsync(Guid userId, Guid bookId, CancellationToken ct)
    {
        var book = await db.UserBooks
            .Include(b => b.BookFiles)
            .FirstOrDefaultAsync(b => b.UserId == userId && b.Id == bookId && b.TakedownAt == null, ct);

        if (book is null)
            return (false, "Book not found");

        // Allow retrying Failed (original behaviour) AND re-extracting Ready
        // books — extractor improvements (e.g. bullet paragraph split, TOC
        // drop) should be reachable without a delete+reupload roundtrip.
        // Processing is excluded so we don't queue duplicate jobs.
        if (book.Status != UserBookStatus.Failed && book.Status != UserBookStatus.Ready)
            return (false, $"Cannot reprocess book in status {book.Status}");

        var bookFile = book.BookFiles.FirstOrDefault();
        if (bookFile is null)
            return (false, "No source file found");

        // Verify the backing file is actually still on disk. Without this
        // guard the worker would happily queue a job that's destined to
        // fail at extraction time and leave the book stuck in Processing.
        if (!await storage.ExistsAsync(bookFile.StoragePath, ct))
            return (false, "Source file is missing from storage");

        // Create new ingestion job
        var job = new UserIngestionJob
        {
            Id = Guid.NewGuid(),
            UserBookId = bookId,
            UserBookFileId = bookFile.Id,
            Status = JobStatus.Queued,
            CreatedAt = DateTimeOffset.UtcNow
        };

        // Reset book status
        book.Status = UserBookStatus.Processing;
        book.ErrorMessage = null;
        book.UpdatedAt = DateTimeOffset.UtcNow;

        db.UserIngestionJobs.Add(job);
        await db.SaveChangesAsync(ct);

        return (true, null);
    }

    public async Task<StorageQuotaDto> GetStorageQuotaAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => new { u.StorageUsedBytes, u.IsGuest })
            .FirstOrDefaultAsync(ct);

        var usedBytes = user?.StorageUsedBytes ?? 0;
        var limit = user?.IsGuest == true ? User.GuestStorageLimitBytes : User.StorageLimitBytes;

        var percent = limit > 0
            ? (double)usedBytes / limit * 100
            : 0;

        return new StorageQuotaDto(usedBytes, limit, Math.Round(percent, 2));
    }

    public async Task<UserBookProgressDto?> GetProgressAsync(Guid userId, Guid bookId, CancellationToken ct)
    {
        var book = await db.UserBooks
            .Where(b => b.UserId == userId && b.Id == bookId && b.TakedownAt == null)
            .Select(b => new { b.ProgressChapterSlug, b.ProgressLocator, b.ProgressPercent, b.ProgressUpdatedAt })
            .FirstOrDefaultAsync(ct);

        if (book is null || book.ProgressChapterSlug is null)
            return null;

        return new UserBookProgressDto(
            book.ProgressChapterSlug,
            book.ProgressLocator,
            book.ProgressPercent,
            book.ProgressUpdatedAt
        );
    }

    public async Task<(bool Success, string? Error)> UpsertProgressAsync(
        Guid userId, Guid bookId, UpsertUserBookProgressRequest request, CancellationToken ct)
    {
        var book = await db.UserBooks.FirstOrDefaultAsync(b => b.UserId == userId && b.Id == bookId && b.TakedownAt == null, ct);
        if (book is null)
            return (false, "Book not found");

        // Conflict resolution: client timestamp must be newer
        if (request.UpdatedAt.HasValue && book.ProgressUpdatedAt.HasValue &&
            request.UpdatedAt.Value <= book.ProgressUpdatedAt.Value)
        {
            // Client data is stale, return success but don't update
            return (true, null);
        }

        book.ProgressChapterSlug = request.ChapterSlug;
        book.ProgressLocator = request.Locator;
        book.ProgressPercent = request.Percent;
        book.ProgressUpdatedAt = request.UpdatedAt ?? DateTimeOffset.UtcNow;

        if (request.Percent is >= 0.99)
        {
            book.CompletedAt ??= DateTimeOffset.UtcNow;
            // Auto-mark clips read once finished so they leave the Unread shelf.
            if (!book.IsRead)
            {
                book.IsRead = true;
                book.ReadAt = DateTimeOffset.UtcNow;
            }
        }

        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    public async Task<IReadOnlyList<UserBookBookmarkDto>> GetBookmarksAsync(Guid userId, Guid bookId, CancellationToken ct)
    {
        return await db.UserBookBookmarks
            .Where(b => b.UserBook.UserId == userId && b.UserBookId == bookId && b.UserBook.TakedownAt == null)
            .OrderByDescending(b => b.CreatedAt)
            .Select(b => new UserBookBookmarkDto(
                b.Id,
                b.ChapterId,
                b.Chapter.Slug,
                b.Locator,
                b.Title,
                b.CreatedAt
            ))
            .ToListAsync(ct);
    }

    public async Task<(UserBookBookmarkDto? Bookmark, string? Error)> CreateBookmarkAsync(
        Guid userId, Guid bookId, CreateUserBookBookmarkRequest request, CancellationToken ct)
    {
        var book = await db.UserBooks.FirstOrDefaultAsync(b => b.UserId == userId && b.Id == bookId && b.TakedownAt == null, ct);
        if (book is null)
            return (null, "Book not found");

        var chapter = await db.UserChapters.FirstOrDefaultAsync(c => c.UserBookId == bookId && c.Id == request.ChapterId, ct);
        if (chapter is null)
            return (null, "Chapter not found");

        var bookmark = new UserBookBookmark
        {
            Id = Guid.NewGuid(),
            UserBookId = bookId,
            ChapterId = request.ChapterId,
            Locator = request.Locator,
            Title = request.Title,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        db.UserBookBookmarks.Add(bookmark);
        await db.SaveChangesAsync(ct);

        return (new UserBookBookmarkDto(
            bookmark.Id,
            bookmark.ChapterId,
            chapter.Slug,
            bookmark.Locator,
            bookmark.Title,
            bookmark.CreatedAt
        ), null);
    }

    public async Task<(bool Success, string? Error)> DeleteBookmarkAsync(
        Guid userId, Guid bookId, Guid bookmarkId, CancellationToken ct)
    {
        var bookmark = await db.UserBookBookmarks
            .FirstOrDefaultAsync(b => b.UserBook.UserId == userId && b.UserBookId == bookId && b.Id == bookmarkId, ct);

        if (bookmark is null)
            return (false, "Bookmark not found");

        db.UserBookBookmarks.Remove(bookmark);
        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    private static BookFormat DetectFormat(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext switch
        {
            ".epub" => BookFormat.Epub,
            ".pdf" => BookFormat.Pdf,
            _ => BookFormat.Other
        };
    }

    private static async Task<string> ComputeSha256Async(Stream stream, CancellationToken ct)
    {
        using var sha256 = SHA256.Create();
        var hash = await sha256.ComputeHashAsync(stream, ct);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
