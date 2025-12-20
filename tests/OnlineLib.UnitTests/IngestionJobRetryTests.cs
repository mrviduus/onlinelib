using Application.Admin;
using Application.Common.Interfaces;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using OnlineLib.UnitTests.TestData;

namespace OnlineLib.UnitTests;

public class IngestionJobRetryTests
{
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
            Id = Guid.NewGuid(),
            WorkId = work.Id,
            SiteId = site.Id,
            Language = "en",
            Slug = "test-edition",
            Title = "Test Edition",
            Status = EditionStatus.Draft,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        var bookFile = new BookFile
        {
            Id = Guid.NewGuid(),
            EditionId = edition.Id,
            OriginalFileName = "test.epub",
            StoragePath = "/storage/test.epub",
            Format = BookFormat.Epub,
            Sha256 = "abc123",
            UploadedAt = DateTimeOffset.UtcNow
        };
        var job = new IngestionJob
        {
            Id = Guid.NewGuid(),
            EditionId = edition.Id,
            BookFileId = bookFile.Id,
            TargetLanguage = "en",
            Status = status,
            AttemptCount = status == JobStatus.Failed ? 1 : 0,
            Error = status == JobStatus.Failed ? "Previous error" : null,
            CreatedAt = DateTimeOffset.UtcNow,
            StartedAt = status != JobStatus.Queued ? DateTimeOffset.UtcNow.AddMinutes(-5) : null,
            FinishedAt = status == JobStatus.Failed || status == JobStatus.Succeeded ? DateTimeOffset.UtcNow : null,
            SourceFormat = status != JobStatus.Queued ? "Epub" : null,
            UnitsCount = status != JobStatus.Queued ? 10 : null,
            TextSource = status != JobStatus.Queued ? "NativeText" : null
        };

        db.Sites.Add(site);
        db.Works.Add(work);
        db.Editions.Add(edition);
        db.BookFiles.Add(bookFile);
        db.IngestionJobs.Add(job);
        await db.SaveChangesAsync();

        return (db, job);
    }

    #region Retry State Transitions

    [Fact]
    public async Task RetryJobAsync_FailedJob_TransitionsToQueued()
    {
        // Arrange
        var (db, job) = await SetupJobAsync(JobStatus.Failed);
        var service = new AdminService(db, new MockFileStorage());

        // Act
        var (success, error, result) = await service.RetryJobAsync(job.Id, CancellationToken.None);

        // Assert
        Assert.True(success);
        Assert.Null(error);
        Assert.NotNull(result);
        Assert.Equal(JobStatus.Queued, result!.Status);
    }

    [Fact]
    public async Task RetryJobAsync_FailedJob_ClearsError()
    {
        // Arrange
        var (db, job) = await SetupJobAsync(JobStatus.Failed);
        var service = new AdminService(db, new MockFileStorage());

        // Act
        var (success, _, result) = await service.RetryJobAsync(job.Id, CancellationToken.None);

        // Assert
        Assert.True(success);
        Assert.Null(result!.Error);
    }

    [Fact]
    public async Task RetryJobAsync_FailedJob_ClearsTimestamps()
    {
        // Arrange
        var (db, job) = await SetupJobAsync(JobStatus.Failed);
        var service = new AdminService(db, new MockFileStorage());

        // Act
        var (success, _, result) = await service.RetryJobAsync(job.Id, CancellationToken.None);

        // Assert
        Assert.True(success);
        Assert.Null(result!.StartedAt);
        Assert.Null(result.FinishedAt);
    }

    [Fact]
    public async Task RetryJobAsync_FailedJob_PreservesDiagnostics()
    {
        // Arrange
        var (db, job) = await SetupJobAsync(JobStatus.Failed);
        var service = new AdminService(db, new MockFileStorage());

        // Act
        var (success, _, result) = await service.RetryJobAsync(job.Id, CancellationToken.None);

        // Assert
        Assert.True(success);
        Assert.NotNull(result!.Diagnostics);
        Assert.Equal("Epub", result.Diagnostics!.SourceFormat);
        Assert.Equal(10, result.Diagnostics.UnitsCount);
    }

    #endregion

    #region Idempotency

    [Fact]
    public async Task RetryJobAsync_QueuedJob_IsIdempotent()
    {
        // Arrange
        var (db, job) = await SetupJobAsync(JobStatus.Queued);
        var service = new AdminService(db, new MockFileStorage());

        // Act
        var (success, error, result) = await service.RetryJobAsync(job.Id, CancellationToken.None);

        // Assert
        Assert.True(success);
        Assert.Null(error);
        Assert.NotNull(result);
        Assert.Equal(JobStatus.Queued, result!.Status);
    }

    [Fact]
    public async Task RetryJobAsync_ProcessingJob_IsIdempotent()
    {
        // Arrange
        var (db, job) = await SetupJobAsync(JobStatus.Processing);
        var service = new AdminService(db, new MockFileStorage());

        // Act
        var (success, error, result) = await service.RetryJobAsync(job.Id, CancellationToken.None);

        // Assert
        Assert.True(success);
        Assert.Null(error);
        Assert.NotNull(result);
        Assert.Equal(JobStatus.Processing, result!.Status);
    }

    #endregion

    #region Error Cases

    [Fact]
    public async Task RetryJobAsync_SucceededJob_ReturnsError()
    {
        // Arrange
        var (db, job) = await SetupJobAsync(JobStatus.Succeeded);
        var service = new AdminService(db, new MockFileStorage());

        // Act
        var (success, error, _) = await service.RetryJobAsync(job.Id, CancellationToken.None);

        // Assert
        Assert.False(success);
        Assert.Contains("failed", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task RetryJobAsync_NonExistentJob_ReturnsError()
    {
        // Arrange
        var db = CreateInMemoryDb();
        var service = new AdminService(db, new MockFileStorage());

        // Act
        var (success, error, _) = await service.RetryJobAsync(Guid.NewGuid(), CancellationToken.None);

        // Assert
        Assert.False(success);
        Assert.Contains("not found", error, StringComparison.OrdinalIgnoreCase);
    }

    #endregion

    private class MockFileStorage : IFileStorageService
    {
        public Task<string> SaveFileAsync(Guid editionId, string fileName, Stream content, CancellationToken ct)
            => Task.FromResult($"/storage/{editionId}/{fileName}");

        public Task<Stream?> GetFileAsync(string path, CancellationToken ct)
            => Task.FromResult<Stream?>(null);

        public Task DeleteFileAsync(string path, CancellationToken ct)
            => Task.CompletedTask;

        public string GetFullPath(string storagePath) => storagePath;
    }
}
