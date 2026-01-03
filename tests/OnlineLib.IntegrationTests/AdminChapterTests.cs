using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace OnlineLib.IntegrationTests;

/// <summary>
/// Integration tests for admin chapter CRUD API.
/// Uses seeded data from docker-compose.
/// </summary>
public class AdminChapterTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly HttpClient _client;

    // Seeded chapter ID from docker seed data (Kobzar, Chapter 1)
    private static readonly Guid SeededChapterId = Guid.Parse("f1ce3268-a7ef-444c-b04a-2a6d84e736f5");
    private static readonly Guid SeededEditionId = Guid.Parse("bbbbbbbb-0001-0001-0001-000000000001");

    public AdminChapterTests(TestWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetChapter_ExistingId_ReturnsChapterWithHtml()
    {
        // Act
        var response = await _client.GetAsync($"/admin/chapters/{SeededChapterId}");

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var chapter = await response.Content.ReadFromJsonAsync<ChapterDetailResponse>();
        Assert.NotNull(chapter);
        Assert.Equal(SeededChapterId, chapter.Id);
        Assert.Equal(SeededEditionId, chapter.EditionId);
        Assert.Equal(1, chapter.ChapterNumber);
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
        // Arrange - First get current state
        var getResponse = await _client.GetAsync($"/admin/chapters/{SeededChapterId}");
        var original = await getResponse.Content.ReadFromJsonAsync<ChapterDetailResponse>();
        Assert.NotNull(original);

        var newTitle = $"Updated Title {Guid.NewGuid():N}";
        var newHtml = "<p>Updated content for testing</p>";

        // Act
        var updateResponse = await _client.PutAsJsonAsync(
            $"/admin/chapters/{SeededChapterId}",
            new { title = newTitle, html = newHtml });

        // Assert
        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);

        // Verify update
        var verifyResponse = await _client.GetAsync($"/admin/chapters/{SeededChapterId}");
        var updated = await verifyResponse.Content.ReadFromJsonAsync<ChapterDetailResponse>();
        Assert.NotNull(updated);
        Assert.Equal(newTitle, updated.Title);
        Assert.Equal(newHtml, updated.Html);
        Assert.True(updated.WordCount > 0); // PlainText should be recalculated

        // Restore original
        await _client.PutAsJsonAsync(
            $"/admin/chapters/{SeededChapterId}",
            new { title = original.Title, html = original.Html });
    }

    [Fact]
    public async Task UpdateChapter_EmptyTitle_ReturnsBadRequest()
    {
        // Act
        var response = await _client.PutAsJsonAsync(
            $"/admin/chapters/{SeededChapterId}",
            new { title = "", html = "<p>Content</p>" });

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpdateChapter_EmptyHtml_ReturnsBadRequest()
    {
        // Act
        var response = await _client.PutAsJsonAsync(
            $"/admin/chapters/{SeededChapterId}",
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
}
