using Application.Admin;
using Application.Common.Interfaces;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using OnlineLib.UnitTests.TestData;

namespace OnlineLib.UnitTests;

public class IngestionJobRetryTests
{
    [Fact]
    public async Task RetryJobAsync_FailedJob_TransitionsToQueued()
    {
        var (db, job) = await SetupJobAsync(JobStatus.Failed);
        var service = new AdminService(db, new MockFileStorage());

        var (success, error, result) = await service.RetryJobAsync(job.Id, CancellationToken.None);

        Assert.True(success);
        Assert.Null(error);
        Assert.Equal(JobStatus.Queued, result!.Status);
        Assert.Null(result.Error);
    }

    [Fact]
    public async Task RetryJobAsync_QueuedJob_IsIdempotent()
    {
        var (db, job) = await SetupJobAsync(JobStatus.Queued);
        var service = new AdminService(db, new MockFileStorage());

        var (success, _, result) = await service.RetryJobAsync(job.Id, CancellationToken.None);

        Assert.True(success);
        Assert.Equal(JobStatus.Queued, result!.Status);
    }

    [Fact]
    public async Task RetryJobAsync_SucceededJob_ReturnsError()
    {
        var (db, job) = await SetupJobAsync(JobStatus.Succeeded);
        var service = new AdminService(db, new MockFileStorage());

        var (success, error, _) = await service.RetryJobAsync(job.Id, CancellationToken.None);

        Assert.False(success);
        Assert.Contains("failed", error, StringComparison.OrdinalIgnoreCase);
    }

    #region Setup

    private static TestDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<TestDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TestDbContext(options);
    }

    private static async Task<(TestDbContext db, IngestionJob job)> SetupJobAsync(JobStatus status)
    {
        var db = CreateInMemoryDb();

        var site = new Site { Id = Guid.NewGuid(), Code = "test", PrimaryDomain = "test.local", DefaultLanguage = "en", CreatedAt = DateTimeOffset.UtcNow };
        var work = new Work { Id = Guid.NewGuid(), SiteId = site.Id, Slug = "test-work", CreatedAt = DateTimeOffset.UtcNow };
        var edition = new Edition
        {
            Id = Guid.NewGuid(), WorkId = work.Id, SiteId = site.Id, Language = "en",
            Slug = "test-edition", Title = "Test Edition", Status = EditionStatus.Draft,
            CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow
        };
        var bookFile = new BookFile
        {
            Id = Guid.NewGuid(), EditionId = edition.Id, OriginalFileName = "test.epub",
            StoragePath = "/storage/test.epub", Format = BookFormat.Epub,
            Sha256 = "abc123", UploadedAt = DateTimeOffset.UtcNow
        };
        var job = new IngestionJob
        {
            Id = Guid.NewGuid(), EditionId = edition.Id, BookFileId = bookFile.Id,
            TargetLanguage = "en", Status = status,
            AttemptCount = status == JobStatus.Failed ? 1 : 0,
            Error = status == JobStatus.Failed ? "Previous error" : null,
            CreatedAt = DateTimeOffset.UtcNow
        };

        db.Sites.Add(site);
        db.Works.Add(work);
        db.Editions.Add(edition);
        db.BookFiles.Add(bookFile);
        db.IngestionJobs.Add(job);
        await db.SaveChangesAsync();

        return (db, job);
    }

    private class MockFileStorage : IFileStorageService
    {
        public Task<string> SaveFileAsync(Guid editionId, string fileName, Stream content, CancellationToken ct)
            => Task.FromResult($"/storage/{editionId}/{fileName}");
        public Task<Stream?> GetFileAsync(string path, CancellationToken ct) => Task.FromResult<Stream?>(null);
        public Task DeleteFileAsync(string path, CancellationToken ct) => Task.CompletedTask;
        public string GetFullPath(string storagePath) => storagePath;
    }

    #endregion
}
