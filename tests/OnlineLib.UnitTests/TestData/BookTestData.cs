using Domain.Entities;
using Domain.Enums;

namespace OnlineLib.UnitTests.TestData;

public static class BookTestData
{
    public static readonly Guid GeneralSiteId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    public static readonly Guid Book1EditionId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    public static readonly Guid Book2EditionId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    public static Site CreateGeneralSite() => new()
    {
        Id = GeneralSiteId,
        Code = "general",
        PrimaryDomain = "general.localhost",
        DefaultLanguage = "en",
        Theme = "default",
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow
    };

    public static (Work work, Edition edition, List<Chapter> chapters) CreateBook1()
    {
        var workId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        var work = new Work
        {
            Id = workId,
            SiteId = GeneralSiteId,
            Slug = "great-gatsby",
            CreatedAt = DateTimeOffset.UtcNow
        };

        var edition = new Edition
        {
            Id = Book1EditionId,
            WorkId = workId,
            SiteId = GeneralSiteId,
            Language = "en",
            Slug = "great-gatsby",
            Title = "The Great Gatsby",
            Description = "A novel about the mysterious millionaire Jay Gatsby",
            AuthorsJson = "[\"F. Scott Fitzgerald\"]",
            Status = EditionStatus.Published,
            PublishedAt = DateTimeOffset.UtcNow.AddDays(-30),
            IsPublicDomain = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        var chapters = new List<Chapter>
        {
            new()
            {
                Id = Guid.NewGuid(),
                EditionId = Book1EditionId,
                ChapterNumber = 1,
                Slug = "chapter-1",
                Title = "Chapter 1",
                Html = "<p>In my younger and more vulnerable years my father gave me some advice.</p>",
                PlainText = "In my younger and more vulnerable years my father gave me some advice.",
                WordCount = 13,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            },
            new()
            {
                Id = Guid.NewGuid(),
                EditionId = Book1EditionId,
                ChapterNumber = 2,
                Slug = "chapter-2",
                Title = "Chapter 2",
                Html = "<p>About half way between West Egg and New York.</p>",
                PlainText = "About half way between West Egg and New York.",
                WordCount = 9,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            }
        };

        return (work, edition, chapters);
    }

    public static (Work work, Edition edition, List<Chapter> chapters) CreateBook2()
    {
        var workId = Guid.Parse("55555555-5555-5555-5555-555555555555");
        var work = new Work
        {
            Id = workId,
            SiteId = GeneralSiteId,
            Slug = "frankenstein",
            CreatedAt = DateTimeOffset.UtcNow
        };

        var edition = new Edition
        {
            Id = Book2EditionId,
            WorkId = workId,
            SiteId = GeneralSiteId,
            Language = "en",
            Slug = "frankenstein",
            Title = "Frankenstein",
            Description = "The story of Victor Frankenstein and his creature",
            AuthorsJson = "[\"Mary Shelley\"]",
            Status = EditionStatus.Published,
            PublishedAt = DateTimeOffset.UtcNow.AddDays(-60),
            IsPublicDomain = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        var chapters = new List<Chapter>
        {
            new()
            {
                Id = Guid.NewGuid(),
                EditionId = Book2EditionId,
                ChapterNumber = 1,
                Slug = "letter-1",
                Title = "Letter 1",
                Html = "<p>You will rejoice to hear that no disaster has accompanied the commencement of an enterprise.</p>",
                PlainText = "You will rejoice to hear that no disaster has accompanied the commencement of an enterprise.",
                WordCount = 15,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            },
            new()
            {
                Id = Guid.NewGuid(),
                EditionId = Book2EditionId,
                ChapterNumber = 2,
                Slug = "letter-2",
                Title = "Letter 2",
                Html = "<p>How slowly the time passes here, encompassed as I am by frost and snow.</p>",
                PlainText = "How slowly the time passes here, encompassed as I am by frost and snow.",
                WordCount = 14,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            },
            new()
            {
                Id = Guid.NewGuid(),
                EditionId = Book2EditionId,
                ChapterNumber = 3,
                Slug = "chapter-1",
                Title = "Chapter 1",
                Html = "<p>I am by birth a Genevese, and my family is one of the most distinguished.</p>",
                PlainText = "I am by birth a Genevese, and my family is one of the most distinguished.",
                WordCount = 15,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            }
        };

        return (work, edition, chapters);
    }
}
