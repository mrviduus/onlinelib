using System.Text.Json;
using Application.Common.Interfaces;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Seo;

/// <summary>
/// Applies generated SEO content to the target entity AND records Before/After snapshots
/// on the job. Snapshots enable revert even after a successful apply.
/// </summary>
public class SeoContentApplier(IAppDbContext db)
{
    /// <summary>Snapshot the current entity state into a JSON dictionary (only the fields we care about).</summary>
    public async Task<string> SnapshotAsync(SeoEntityType entityType, Guid entityId, IReadOnlyCollection<SeoFieldType> fields, CancellationToken ct)
    {
        var snapshot = new Dictionary<string, object?>();
        switch (entityType)
        {
            case SeoEntityType.Author:
                {
                    var a = await db.Authors.AsNoTracking().FirstOrDefaultAsync(x => x.Id == entityId, ct)
                        ?? throw new InvalidOperationException($"Author {entityId} not found");
                    foreach (var f in fields) snapshot[f.ToString()] = ReadAuthor(a, f);
                    snapshot["SeoSource"] = a.SeoSource.ToString();
                    break;
                }
            case SeoEntityType.Edition:
                {
                    var e = await db.Editions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == entityId, ct)
                        ?? throw new InvalidOperationException($"Edition {entityId} not found");
                    foreach (var f in fields) snapshot[f.ToString()] = ReadEdition(e, f);
                    snapshot["SeoSource"] = e.SeoSource.ToString();
                    break;
                }
            case SeoEntityType.Genre:
                {
                    var g = await db.Genres.AsNoTracking().FirstOrDefaultAsync(x => x.Id == entityId, ct)
                        ?? throw new InvalidOperationException($"Genre {entityId} not found");
                    foreach (var f in fields) snapshot[f.ToString()] = ReadGenre(g, f);
                    snapshot["SeoSource"] = g.SeoSource.ToString();
                    break;
                }
            case SeoEntityType.BlogPost:
                {
                    var p = await db.BlogPosts.AsNoTracking().FirstOrDefaultAsync(x => x.Id == entityId, ct)
                        ?? throw new InvalidOperationException($"BlogPost {entityId} not found");
                    foreach (var f in fields) snapshot[f.ToString()] = ReadBlogPost(p, f);
                    snapshot["SeoSource"] = p.SeoSource.ToString();
                    break;
                }
        }
        return JsonSerializer.Serialize(snapshot);
    }

    /// <summary>
    /// Applies {fieldType: value} pairs to the entity. Values come from parsed Claude output.
    /// For object/array fields (themes, faqs), stores as canonical JSON. Updates SeoSource=Auto.
    /// </summary>
    public async Task ApplyAsync(SeoEntityType entityType, Guid entityId, IReadOnlyDictionary<SeoFieldType, JsonElement> values, CancellationToken ct)
    {
        switch (entityType)
        {
            case SeoEntityType.Author:
                {
                    var a = await db.Authors.FirstOrDefaultAsync(x => x.Id == entityId, ct)
                        ?? throw new InvalidOperationException($"Author {entityId} not found");
                    foreach (var kv in values) WriteAuthor(a, kv.Key, kv.Value);
                    a.SeoSource = SeoSource.Auto;
                    a.UpdatedAt = DateTimeOffset.UtcNow;
                    break;
                }
            case SeoEntityType.Edition:
                {
                    var e = await db.Editions.FirstOrDefaultAsync(x => x.Id == entityId, ct)
                        ?? throw new InvalidOperationException($"Edition {entityId} not found");
                    foreach (var kv in values) WriteEdition(e, kv.Key, kv.Value);
                    e.SeoSource = SeoSource.Auto;
                    e.UpdatedAt = DateTimeOffset.UtcNow;
                    break;
                }
            case SeoEntityType.Genre:
                {
                    var g = await db.Genres.FirstOrDefaultAsync(x => x.Id == entityId, ct)
                        ?? throw new InvalidOperationException($"Genre {entityId} not found");
                    foreach (var kv in values) WriteGenre(g, kv.Key, kv.Value);
                    g.SeoSource = SeoSource.Auto;
                    g.UpdatedAt = DateTimeOffset.UtcNow;
                    break;
                }
            case SeoEntityType.BlogPost:
                {
                    var p = await db.BlogPosts.FirstOrDefaultAsync(x => x.Id == entityId, ct)
                        ?? throw new InvalidOperationException($"BlogPost {entityId} not found");
                    foreach (var kv in values) WriteBlogPost(p, kv.Key, kv.Value);
                    p.SeoSource = SeoSource.Auto;
                    p.UpdatedAt = DateTimeOffset.UtcNow;
                    break;
                }
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Restores a Before snapshot, flipping SeoSource back to Manual.</summary>
    public async Task RevertAsync(SeoEntityType entityType, Guid entityId, string beforeSnapshotJson, CancellationToken ct)
    {
        using var doc = JsonDocument.Parse(beforeSnapshotJson);
        var root = doc.RootElement;

        switch (entityType)
        {
            case SeoEntityType.Author:
                {
                    var a = await db.Authors.FirstOrDefaultAsync(x => x.Id == entityId, ct)
                        ?? throw new InvalidOperationException($"Author {entityId} not found");
                    foreach (var f in Enum.GetValues<SeoFieldType>())
                        if (root.TryGetProperty(f.ToString(), out var v)) WriteAuthor(a, f, v);
                    a.SeoSource = SeoSource.Manual;
                    a.UpdatedAt = DateTimeOffset.UtcNow;
                    break;
                }
            case SeoEntityType.Edition:
                {
                    var e = await db.Editions.FirstOrDefaultAsync(x => x.Id == entityId, ct)
                        ?? throw new InvalidOperationException($"Edition {entityId} not found");
                    foreach (var f in Enum.GetValues<SeoFieldType>())
                        if (root.TryGetProperty(f.ToString(), out var v)) WriteEdition(e, f, v);
                    e.SeoSource = SeoSource.Manual;
                    e.UpdatedAt = DateTimeOffset.UtcNow;
                    break;
                }
            case SeoEntityType.Genre:
                {
                    var g = await db.Genres.FirstOrDefaultAsync(x => x.Id == entityId, ct)
                        ?? throw new InvalidOperationException($"Genre {entityId} not found");
                    foreach (var f in Enum.GetValues<SeoFieldType>())
                        if (root.TryGetProperty(f.ToString(), out var v)) WriteGenre(g, f, v);
                    g.SeoSource = SeoSource.Manual;
                    g.UpdatedAt = DateTimeOffset.UtcNow;
                    break;
                }
            case SeoEntityType.BlogPost:
                {
                    var p = await db.BlogPosts.FirstOrDefaultAsync(x => x.Id == entityId, ct)
                        ?? throw new InvalidOperationException($"BlogPost {entityId} not found");
                    foreach (var f in Enum.GetValues<SeoFieldType>())
                        if (root.TryGetProperty(f.ToString(), out var v)) WriteBlogPost(p, f, v);
                    p.SeoSource = SeoSource.Manual;
                    p.UpdatedAt = DateTimeOffset.UtcNow;
                    break;
                }
        }
        await db.SaveChangesAsync(ct);
    }

    // --- Read / write helpers per entity ---

    private static string? ReadAuthor(Domain.Entities.Author a, SeoFieldType f) => f switch
    {
        SeoFieldType.Bio => a.Bio,
        SeoFieldType.Relevance => a.SeoRelevanceText,
        SeoFieldType.Themes => a.SeoThemesJson,
        SeoFieldType.Faqs => a.SeoFaqsJson,
        SeoFieldType.SeoTitle => a.SeoTitle,
        SeoFieldType.SeoDescription => a.SeoDescription,
        _ => null
    };

    private static void WriteAuthor(Domain.Entities.Author a, SeoFieldType f, JsonElement v)
    {
        switch (f)
        {
            case SeoFieldType.Bio: a.Bio = AsString(v); break;
            case SeoFieldType.Relevance: a.SeoRelevanceText = AsString(v); break;
            case SeoFieldType.Themes: a.SeoThemesJson = AsJson(v); break;
            case SeoFieldType.Faqs: a.SeoFaqsJson = AsJson(v); break;
            case SeoFieldType.SeoTitle: a.SeoTitle = AsString(v); break;
            case SeoFieldType.SeoDescription: a.SeoDescription = AsString(v); break;
        }
    }

    private static string? ReadEdition(Domain.Entities.Edition e, SeoFieldType f) => f switch
    {
        SeoFieldType.Description => e.Description,
        SeoFieldType.Relevance => e.SeoRelevanceText,
        SeoFieldType.Themes => e.SeoThemesJson,
        SeoFieldType.Faqs => e.SeoFaqsJson,
        SeoFieldType.SeoTitle => e.SeoTitle,
        SeoFieldType.SeoDescription => e.SeoDescription,
        _ => null
    };

    private static void WriteEdition(Domain.Entities.Edition e, SeoFieldType f, JsonElement v)
    {
        switch (f)
        {
            case SeoFieldType.Description: e.Description = AsString(v); break;
            case SeoFieldType.Relevance: e.SeoRelevanceText = AsString(v); break;
            case SeoFieldType.Themes: e.SeoThemesJson = AsJson(v); break;
            case SeoFieldType.Faqs: e.SeoFaqsJson = AsJson(v); break;
            case SeoFieldType.SeoTitle: e.SeoTitle = AsString(v); break;
            case SeoFieldType.SeoDescription: e.SeoDescription = AsString(v); break;
        }
    }

    private static string? ReadGenre(Domain.Entities.Genre g, SeoFieldType f) => f switch
    {
        SeoFieldType.Description => g.Description,
        SeoFieldType.SeoTitle => g.SeoTitle,
        SeoFieldType.SeoDescription => g.SeoDescription,
        _ => null
    };

    private static void WriteGenre(Domain.Entities.Genre g, SeoFieldType f, JsonElement v)
    {
        switch (f)
        {
            case SeoFieldType.Description: g.Description = AsString(v); break;
            case SeoFieldType.SeoTitle: g.SeoTitle = AsString(v); break;
            case SeoFieldType.SeoDescription: g.SeoDescription = AsString(v); break;
        }
    }

    private static string? ReadBlogPost(Domain.Entities.BlogPost p, SeoFieldType f) => f switch
    {
        SeoFieldType.SeoTitle => p.SeoTitle,
        SeoFieldType.SeoDescription => p.SeoDescription,
        _ => null
    };

    private static void WriteBlogPost(Domain.Entities.BlogPost p, SeoFieldType f, JsonElement v)
    {
        switch (f)
        {
            case SeoFieldType.SeoTitle: p.SeoTitle = AsString(v); break;
            case SeoFieldType.SeoDescription: p.SeoDescription = AsString(v); break;
        }
    }

    private static string? AsString(JsonElement v) => v.ValueKind switch
    {
        JsonValueKind.String => v.GetString(),
        JsonValueKind.Null or JsonValueKind.Undefined => null,
        _ => v.GetRawText()
    };

    private static string? AsJson(JsonElement v) => v.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined
        ? null
        : v.GetRawText();
}
