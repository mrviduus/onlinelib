using System.Text;
using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Application.Highlights;

public record HotspotTopNote(
    Guid HighlightId,
    string? NoteText,
    int LikeCount,
    string Color,
    Guid UserId,
    bool LikedByMe
);

public record HotspotDto(
    string Key,
    string AnchorJson,
    string Text,
    int Count,
    int LikeTotal,
    IReadOnlyList<HotspotTopNote> TopNotes
);

/// <summary>
/// Clusters public highlights within a chapter by normalized selected text.
/// MVP strategy: normalize text (trim, collapse whitespace, lowercase, strip edge punctuation)
/// and group. Range-overlap clustering is V2.
/// </summary>
public class HighlightClusterService
{
    private const int MaxHotspotsPerChapter = 200;
    private const int MaxTopNotesPerHotspot = 3;
    private const int NoteMinLength = 5;
    private const int NoteMaxLength = 400;

    private readonly IAppDbContext _db;

    public HighlightClusterService(IAppDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<HotspotDto>> GetHotspotsForEditionChapterAsync(
        Guid siteId,
        Guid editionId,
        Guid chapterId,
        Guid? currentUserId,
        CancellationToken ct = default)
    {
        var q = _db.Highlights
            .AsNoTracking()
            .Where(h => h.SiteId == siteId
                && h.EditionId == editionId
                && h.ChapterId == chapterId
                && h.IsPublic
                && !h.IsDeleted);

        if (currentUserId.HasValue)
            q = q.Where(h => h.UserId != currentUserId.Value);

        var rows = await q
            .Select(h => new
            {
                h.Id,
                h.UserId,
                h.AnchorJson,
                h.Color,
                h.SelectedText,
                h.NoteText,
                h.LikeCount,
                h.PublishedAt,
            })
            .ToListAsync(ct);

        HashSet<Guid>? likedByMe = null;
        if (currentUserId.HasValue && rows.Count > 0)
        {
            var ids = rows.Select(r => r.Id).ToArray();
            likedByMe = (await _db.HighlightLikes
                .AsNoTracking()
                .Where(l => l.UserId == currentUserId.Value && ids.Contains(l.HighlightId))
                .Select(l => l.HighlightId)
                .ToListAsync(ct)).ToHashSet();
        }

        var groups = rows
            .GroupBy(r => NormalizeKey(r.SelectedText))
            .Where(g => g.Key.Length > 0);

        var hotspots = new List<HotspotDto>();
        foreach (var g in groups)
        {
            var ordered = g.OrderByDescending(r => r.LikeCount)
                .ThenByDescending(r => r.PublishedAt)
                .ToList();

            var top = ordered[0];
            var topNotes = ordered
                .Where(r => !string.IsNullOrWhiteSpace(r.NoteText)
                    && r.NoteText!.Length >= NoteMinLength
                    && r.NoteText.Length <= NoteMaxLength)
                .Take(MaxTopNotesPerHotspot)
                .Select(r => new HotspotTopNote(
                    r.Id,
                    r.NoteText,
                    r.LikeCount,
                    r.Color,
                    r.UserId,
                    likedByMe?.Contains(r.Id) ?? false
                ))
                .ToList();

            hotspots.Add(new HotspotDto(
                Key: g.Key,
                AnchorJson: top.AnchorJson,
                Text: top.SelectedText,
                Count: ordered.Count,
                LikeTotal: ordered.Sum(r => r.LikeCount),
                TopNotes: topNotes
            ));
        }

        return hotspots
            .OrderByDescending(h => h.Count)
            .ThenByDescending(h => h.LikeTotal)
            .Take(MaxHotspotsPerChapter)
            .ToList();
    }

    public static string NormalizeKey(string input)
    {
        if (string.IsNullOrEmpty(input)) return string.Empty;
        var sb = new StringBuilder(input.Length);
        bool lastWasSpace = false;
        foreach (var ch in input)
        {
            if (char.IsWhiteSpace(ch))
            {
                if (!lastWasSpace && sb.Length > 0) { sb.Append(' '); lastWasSpace = true; }
                continue;
            }
            sb.Append(char.ToLowerInvariant(ch));
            lastWasSpace = false;
        }
        int start = 0, end = sb.Length - 1;
        while (start <= end && (char.IsPunctuation(sb[start]) || sb[start] == ' ')) start++;
        while (end >= start && (char.IsPunctuation(sb[end]) || sb[end] == ' ')) end--;
        if (start > end) return string.Empty;
        return sb.ToString(start, end - start + 1);
    }
}
