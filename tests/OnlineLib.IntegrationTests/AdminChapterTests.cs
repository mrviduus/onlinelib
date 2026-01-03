using System.Net;
using System.Net.Http.Json;

namespace OnlineLib.IntegrationTests;

/// <summary>
/// Integration tests for admin chapter CRUD API.
/// Uses seeded data from docker-compose.
/// </summary>
public class AdminChapterTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly HttpClient _client;

    // Seeded edition ID from docker seed (Kobzar)
    private static readonly Guid SeededEditionId = Guid.Parse("bbbbbbbb-0001-0001-0001-000000000001");

    public AdminChapterTests(TestWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    /// <summary>
    /// Gets first chapter ID from seeded edition via API.
    /// Chapter IDs are generated at runtime, not hardcoded.
    /// </summary>
    private async Task<Guid?> GetFirstChapterIdAsync()
    {
        var response = await _client.GetAsync($"/admin/editions/{SeededEditionId}");
        if (!response.IsSuccessStatusCode) return null;
        var edition = await response.Content.ReadFromJsonAsync<EditionDetailResponse>();
        return edition?.Chapters?.FirstOrDefault()?.Id;
    }

    [Fact]
    public async Task GetChapter_ExistingId_ReturnsChapterWithHtml()
    {
        // Arrange - get actual chapter ID from API
        var chapterId = await GetFirstChapterIdAsync();
        if (chapterId is null)
        {
            // Skip if no seeded data
            return;
        }

        // Act
        var response = await _client.GetAsync($"/admin/chapters/{chapterId}");

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var chapter = await response.Content.ReadFromJsonAsync<ChapterDetailResponse>();
        Assert.NotNull(chapter);
        Assert.Equal(chapterId, chapter.Id);
        Assert.Equal(SeededEditionId, chapter.EditionId);
        Assert.NotEmpty(chapter.Title);
        Assert.NotEmpty(chapter.Html);
        Assert.Contains("<", chapter.Html); // Should contain HTML tags
    }

    [Fact]
    public async Task GetChapter_NonExistingId_ReturnsNotFound()
    {
        // Act
        var response = await _client.GetAsync($"/admin/chapters/{Guid.NewGuid()}");

        // Assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task UpdateChapter_ValidData_ReturnsOkAndUpdatesContent()
    {
        // Arrange - get actual chapter ID from API
        var chapterId = await GetFirstChapterIdAsync();
        if (chapterId is null) return;

        // Get current state
        var getResponse = await _client.GetAsync($"/admin/chapters/{chapterId}");
        var original = await getResponse.Content.ReadFromJsonAsync<ChapterDetailResponse>();
        Assert.NotNull(original);

        var newTitle = $"Updated Title {Guid.NewGuid():N}";
        var newHtml = "<p>Updated content for testing</p>";

        // Act
        var updateResponse = await _client.PutAsJsonAsync(
            $"/admin/chapters/{chapterId}",
            new { title = newTitle, html = newHtml });

        // Assert
        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);

        // Verify update
        var verifyResponse = await _client.GetAsync($"/admin/chapters/{chapterId}");
        var updated = await verifyResponse.Content.ReadFromJsonAsync<ChapterDetailResponse>();
        Assert.NotNull(updated);
        Assert.Equal(newTitle, updated.Title);
        Assert.Equal(newHtml, updated.Html);
        Assert.True(updated.WordCount > 0); // PlainText should be recalculated

        // Restore original
        await _client.PutAsJsonAsync(
            $"/admin/chapters/{chapterId}",
            new { title = original.Title, html = original.Html });
    }

    [Fact]
    public async Task UpdateChapter_EmptyTitle_ReturnsBadRequest()
    {
        var chapterId = await GetFirstChapterIdAsync();
        if (chapterId is null) return;

        // Act
        var response = await _client.PutAsJsonAsync(
            $"/admin/chapters/{chapterId}",
            new { title = "", html = "<p>Content</p>" });

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpdateChapter_EmptyHtml_ReturnsBadRequest()
    {
        var chapterId = await GetFirstChapterIdAsync();
        if (chapterId is null) return;

        // Act
        var response = await _client.PutAsJsonAsync(
            $"/admin/chapters/{chapterId}",
            new { title = "Title", html = "" });

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpdateChapter_NonExistingId_ReturnsBadRequest()
    {
        // Act
        var response = await _client.PutAsJsonAsync(
            $"/admin/chapters/{Guid.NewGuid()}",
            new { title = "Title", html = "<p>Content</p>" });

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task DeleteChapter_NonExistingId_ReturnsBadRequest()
    {
        // Act
        var response = await _client.DeleteAsync($"/admin/chapters/{Guid.NewGuid()}");

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private record ChapterDetailResponse(
        Guid Id,
        Guid EditionId,
        int ChapterNumber,
        string? Slug,
        string Title,
        string Html,
        int? WordCount,
        DateTimeOffset CreatedAt,
        DateTimeOffset UpdatedAt);

    private record EditionDetailResponse(
        Guid Id,
        List<ChapterSummary>? Chapters);

    private record ChapterSummary(Guid Id);
}
