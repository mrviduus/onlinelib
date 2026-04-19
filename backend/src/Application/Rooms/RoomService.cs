using Application.Common.Interfaces;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Rooms;

public class RoomService
{
    public const int MaxMembers = 20;
    public static readonly TimeSpan DefaultInviteTtl = TimeSpan.FromHours(24);
    public static readonly TimeSpan MaxInviteTtl = TimeSpan.FromDays(30);

    private readonly IAppDbContext _db;

    public RoomService(IAppDbContext db) => _db = db;

    public async Task<RoomResult<CreateRoomResult>> CreateAsync(
        Guid userId, Guid siteId, ReadingRoomTargetType targetType, Guid targetId, string? name,
        CancellationToken ct)
    {
        if (targetType == ReadingRoomTargetType.UserBook)
            return RoomResult<CreateRoomResult>.Fail(RoomError.TargetUnsupported);

        var editionExists = await _db.Editions
            .AnyAsync(e => e.Id == targetId && e.SiteId == siteId, ct);
        if (!editionExists)
            return RoomResult<CreateRoomResult>.Fail(RoomError.TargetNotFound);

        var now = DateTimeOffset.UtcNow;
        var trimmedName = name?.Trim();
        var room = new ReadingRoom
        {
            Id = Guid.NewGuid(),
            SiteId = siteId,
            TargetType = targetType,
            TargetId = targetId,
            OwnerUserId = userId,
            Name = string.IsNullOrEmpty(trimmedName) ? null : trimmedName[..Math.Min(trimmedName.Length, 120)],
            CreatedAt = now,
            LastActivityAt = now
        };
        _db.ReadingRooms.Add(room);

        _db.ReadingRoomMembers.Add(new ReadingRoomMember
        {
            Id = Guid.NewGuid(),
            RoomId = room.Id,
            UserId = userId,
            Role = ReadingRoomMemberRole.Owner,
            Color = MemberColor.ForUser(userId),
            ShowProgress = false,
            JoinedAt = now,
            LastSeenAt = now
        });

        var rawToken = RoomTokens.GenerateRaw();
        var invite = new ReadingRoomInvite
        {
            Id = Guid.NewGuid(),
            RoomId = room.Id,
            TokenHash = RoomTokens.Hash(rawToken),
            MaxUses = null,
            UsesCount = 0,
            ExpiresAt = now + DefaultInviteTtl,
            CreatedByUserId = userId,
            CreatedAt = now
        };
        _db.ReadingRoomInvites.Add(invite);

        await _db.SaveChangesAsync(ct);

        return RoomResult<CreateRoomResult>.Ok(new CreateRoomResult(room.Id, rawToken, invite.ExpiresAt));
    }

    public async Task<RoomError> CloseAsync(Guid userId, Guid roomId, CancellationToken ct)
    {
        var room = await _db.ReadingRooms.FirstOrDefaultAsync(r => r.Id == roomId, ct);
        if (room == null) return RoomError.NotFound;
        if (room.OwnerUserId != userId) return RoomError.Forbidden;
        if (room.ClosedAt != null) return RoomError.RoomClosed;

        var now = DateTimeOffset.UtcNow;
        room.ClosedAt = now;
        room.LastActivityAt = now;
        await _db.SaveChangesAsync(ct);
        return RoomError.None;
    }

    public async Task<List<RoomSummary>> ListMineAsync(Guid userId, int limit, bool activeOnly, CancellationToken ct)
    {
        var q = _db.ReadingRoomMembers
            .Where(m => m.UserId == userId && m.LeftAt == null);

        if (activeOnly)
            q = q.Where(m => m.Room.ClosedAt == null);

        var rows = await q
            .OrderByDescending(m => m.Room.LastActivityAt)
            .Take(Math.Clamp(limit, 1, 50))
            .Select(m => new
            {
                RoomId = m.Room.Id,
                m.Room.TargetType,
                m.Room.TargetId,
                m.Room.Name,
                MemberCount = m.Room.Members.Count(x => x.LeftAt == null),
                m.Room.LastActivityAt,
                IsOwner = m.Room.OwnerUserId == userId
            })
            .ToListAsync(ct);

        var editionIds = rows
            .Where(r => r.TargetType == ReadingRoomTargetType.Edition)
            .Select(r => r.TargetId)
            .Distinct()
            .ToList();

        var editions = editionIds.Count == 0
            ? new Dictionary<Guid, (string? Title, string? Slug, string? Language, string? CoverPath, string? FirstChapterSlug)>()
            : await _db.Editions
                .Where(e => editionIds.Contains(e.Id))
                .Select(e => new
                {
                    e.Id,
                    e.Title,
                    e.Slug,
                    e.Language,
                    e.CoverPath,
                    FirstChapterSlug = e.Chapters
                        .OrderBy(c => c.ChapterNumber)
                        .Select(c => c.Slug)
                        .FirstOrDefault()
                })
                .ToDictionaryAsync(
                    x => x.Id,
                    x => (Title: (string?)x.Title, Slug: (string?)x.Slug, Language: (string?)x.Language, CoverPath: x.CoverPath, FirstChapterSlug: x.FirstChapterSlug),
                    ct);

        return rows.Select(r =>
        {
            editions.TryGetValue(r.TargetId, out var ed);
            return new RoomSummary(
                r.RoomId, r.TargetType, r.TargetId, r.Name, r.MemberCount,
                r.LastActivityAt, r.IsOwner,
                ed.Title, ed.Slug, ed.Language, ed.CoverPath, ed.FirstChapterSlug);
        }).ToList();
    }

    public async Task<RoomResult<RoomView>> GetAsync(Guid userId, Guid roomId, CancellationToken ct)
    {
        var room = await _db.ReadingRooms
            .FirstOrDefaultAsync(r => r.Id == roomId, ct);
        if (room == null) return RoomResult<RoomView>.Fail(RoomError.NotFound);

        var isMember = await _db.ReadingRoomMembers
            .AnyAsync(m => m.RoomId == roomId && m.UserId == userId && m.LeftAt == null, ct);
        if (!isMember) return RoomResult<RoomView>.Fail(RoomError.Forbidden);

        var members = await LoadMemberViewsAsync(roomId, includeHiddenProgress: false, forUserId: userId, ct);

        string? bookTitle = null, bookSlug = null, bookLanguage = null, bookCoverPath = null, firstChapterSlug = null;
        if (room.TargetType == ReadingRoomTargetType.Edition)
        {
            var ed = await _db.Editions
                .Where(e => e.Id == room.TargetId)
                .Select(e => new
                {
                    e.Title,
                    e.Slug,
                    e.Language,
                    e.CoverPath,
                    FirstChapterSlug = e.Chapters
                        .OrderBy(c => c.ChapterNumber)
                        .Select(c => c.Slug)
                        .FirstOrDefault()
                })
                .FirstOrDefaultAsync(ct);
            if (ed != null)
            {
                bookTitle = ed.Title;
                bookSlug = ed.Slug;
                bookLanguage = ed.Language;
                bookCoverPath = ed.CoverPath;
                firstChapterSlug = ed.FirstChapterSlug;
            }
        }

        return RoomResult<RoomView>.Ok(new RoomView(
            room.Id, room.TargetType, room.TargetId, room.OwnerUserId,
            room.Name, room.CreatedAt, room.ClosedAt, members,
            bookTitle, bookSlug, bookLanguage, bookCoverPath, firstChapterSlug));
    }

    public async Task<RoomResult<CreateInviteResult>> CreateInviteAsync(
        Guid userId, Guid roomId, TimeSpan? expiresIn, int? maxUses, CancellationToken ct)
    {
        var room = await _db.ReadingRooms.FirstOrDefaultAsync(r => r.Id == roomId, ct);
        if (room == null) return RoomResult<CreateInviteResult>.Fail(RoomError.NotFound);
        if (room.ClosedAt != null) return RoomResult<CreateInviteResult>.Fail(RoomError.RoomClosed);

        var isMember = await _db.ReadingRoomMembers
            .AnyAsync(m => m.RoomId == roomId && m.UserId == userId && m.LeftAt == null, ct);
        if (!isMember) return RoomResult<CreateInviteResult>.Fail(RoomError.Forbidden);

        var ttl = expiresIn ?? DefaultInviteTtl;
        if (ttl <= TimeSpan.Zero || ttl > MaxInviteTtl)
            return RoomResult<CreateInviteResult>.Fail(RoomError.InvalidInput);
        if (maxUses.HasValue && maxUses.Value <= 0)
            return RoomResult<CreateInviteResult>.Fail(RoomError.InvalidInput);

        var now = DateTimeOffset.UtcNow;
        var rawToken = RoomTokens.GenerateRaw();
        var invite = new ReadingRoomInvite
        {
            Id = Guid.NewGuid(),
            RoomId = roomId,
            TokenHash = RoomTokens.Hash(rawToken),
            MaxUses = maxUses,
            UsesCount = 0,
            ExpiresAt = now + ttl,
            CreatedByUserId = userId,
            CreatedAt = now
        };
        _db.ReadingRoomInvites.Add(invite);
        room.LastActivityAt = now;
        await _db.SaveChangesAsync(ct);

        return RoomResult<CreateInviteResult>.Ok(new CreateInviteResult(invite.Id, rawToken, invite.ExpiresAt));
    }

    public async Task<RoomError> RevokeInviteAsync(Guid userId, Guid inviteId, CancellationToken ct)
    {
        var invite = await _db.ReadingRoomInvites
            .Include(i => i.Room)
            .FirstOrDefaultAsync(i => i.Id == inviteId, ct);
        if (invite == null) return RoomError.NotFound;

        var isMember = await _db.ReadingRoomMembers
            .AnyAsync(m => m.RoomId == invite.RoomId && m.UserId == userId && m.LeftAt == null, ct);
        if (!isMember) return RoomError.Forbidden;

        if (invite.RevokedAt != null) return RoomError.None;
        var now = DateTimeOffset.UtcNow;
        invite.RevokedAt = now;
        invite.Room.LastActivityAt = now;
        await _db.SaveChangesAsync(ct);
        return RoomError.None;
    }

    public async Task<RoomResult<Guid>> JoinAsync(Guid userId, string rawToken, CancellationToken ct)
    {
        var hash = RoomTokens.Hash(rawToken);
        var invite = await _db.ReadingRoomInvites
            .Include(i => i.Room)
            .FirstOrDefaultAsync(i => i.TokenHash == hash, ct);
        if (invite == null) return RoomResult<Guid>.Fail(RoomError.InviteInvalid);
        if (invite.RevokedAt != null) return RoomResult<Guid>.Fail(RoomError.InviteRevoked);
        if (invite.ExpiresAt <= DateTimeOffset.UtcNow) return RoomResult<Guid>.Fail(RoomError.InviteExpired);
        if (invite.MaxUses.HasValue && invite.UsesCount >= invite.MaxUses.Value)
            return RoomResult<Guid>.Fail(RoomError.InviteExhausted);
        if (invite.Room.ClosedAt != null) return RoomResult<Guid>.Fail(RoomError.RoomClosed);

        var existing = await _db.ReadingRoomMembers
            .FirstOrDefaultAsync(m => m.RoomId == invite.RoomId && m.UserId == userId && m.LeftAt == null, ct);
        if (existing != null)
        {
            existing.LastSeenAt = DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync(ct);
            return RoomResult<Guid>.Ok(invite.RoomId);
        }

        var activeCount = await _db.ReadingRoomMembers
            .CountAsync(m => m.RoomId == invite.RoomId && m.LeftAt == null, ct);
        if (activeCount >= MaxMembers)
            return RoomResult<Guid>.Fail(RoomError.MemberLimitReached);

        var now = DateTimeOffset.UtcNow;
        _db.ReadingRoomMembers.Add(new ReadingRoomMember
        {
            Id = Guid.NewGuid(),
            RoomId = invite.RoomId,
            UserId = userId,
            Role = ReadingRoomMemberRole.Member,
            Color = MemberColor.ForUser(userId),
            ShowProgress = false,
            JoinedAt = now,
            LastSeenAt = now
        });

        invite.UsesCount++;
        invite.Room.LastActivityAt = now;

        await _db.SaveChangesAsync(ct);
        return RoomResult<Guid>.Ok(invite.RoomId);
    }

    public async Task<RoomError> LeaveAsync(Guid userId, Guid roomId, CancellationToken ct)
    {
        var member = await _db.ReadingRoomMembers
            .Include(m => m.Room)
            .FirstOrDefaultAsync(m => m.RoomId == roomId && m.UserId == userId && m.LeftAt == null, ct);
        if (member == null) return RoomError.NotMember;

        var now = DateTimeOffset.UtcNow;
        member.LeftAt = now;
        member.Room.LastActivityAt = now;

        // Owner leaves → close room.
        if (member.Role == ReadingRoomMemberRole.Owner && member.Room.ClosedAt == null)
            member.Room.ClosedAt = now;

        await _db.SaveChangesAsync(ct);
        return RoomError.None;
    }

    public async Task<RoomError> HeartbeatAsync(
        Guid userId, Guid roomId, Guid? chapterId, double? percent, bool? showProgress,
        CancellationToken ct)
    {
        var member = await _db.ReadingRoomMembers
            .Include(m => m.Room)
            .FirstOrDefaultAsync(m => m.RoomId == roomId && m.UserId == userId && m.LeftAt == null, ct);
        if (member == null) return RoomError.NotMember;
        if (member.Room.ClosedAt != null) return RoomError.RoomClosed;

        var now = DateTimeOffset.UtcNow;
        member.LastSeenAt = now;
        if (chapterId.HasValue) member.CurrentChapterId = chapterId;
        if (percent.HasValue) member.CurrentPercent = Math.Clamp(percent.Value, 0.0, 1.0);
        if (showProgress.HasValue) member.ShowProgress = showProgress.Value;
        member.Room.LastActivityAt = now;

        await _db.SaveChangesAsync(ct);
        return RoomError.None;
    }

    public async Task<RoomResult<RoomStateView>> GetStateAsync(
        Guid userId, Guid roomId, DateTimeOffset? since, CancellationToken ct)
    {
        var room = await _db.ReadingRooms.FirstOrDefaultAsync(r => r.Id == roomId, ct);
        if (room == null) return RoomResult<RoomStateView>.Fail(RoomError.NotFound);
        if (room.ClosedAt != null) return RoomResult<RoomStateView>.Fail(RoomError.RoomClosed);

        var isMember = await _db.ReadingRoomMembers
            .AnyAsync(m => m.RoomId == roomId && m.UserId == userId && m.LeftAt == null, ct);
        if (!isMember) return RoomResult<RoomStateView>.Fail(RoomError.Forbidden);

        var members = await LoadMemberViewsAsync(roomId, includeHiddenProgress: false, forUserId: userId, ct);

        var highlights = new List<SharedHighlightView>();
        if (room.TargetType == ReadingRoomTargetType.Edition)
        {
            // Derive user ids + color map from already-loaded members — avoid 2 extra round-trips.
            var memberUserIds = members.Select(m => m.UserId).ToList();
            var colorByUser = members.ToDictionary(m => m.UserId, m => m.Color);

            var hq = _db.Highlights
                .Where(h => h.EditionId == room.TargetId
                    && memberUserIds.Contains(h.UserId));
            if (since.HasValue)
                hq = hq.Where(h => h.UpdatedAt >= since.Value);

            const int pageSize = 500;
            var rows = await hq
                .OrderBy(h => h.UpdatedAt)
                .Take(pageSize)
                .Select(h => new
                {
                    h.Id,
                    h.UserId,
                    h.ChapterId,
                    h.AnchorJson,
                    h.Color,
                    h.SelectedText,
                    h.NoteText,
                    h.UpdatedAt
                })
                .ToListAsync(ct);

            foreach (var r in rows)
            {
                highlights.Add(new SharedHighlightView(
                    r.Id, r.UserId,
                    colorByUser.TryGetValue(r.UserId, out var c) ? c : MemberColor.ForUser(r.UserId),
                    r.ChapterId, r.AnchorJson, r.Color, r.SelectedText, r.NoteText, r.UpdatedAt));
            }

            // Truncated page: advance cursor to max loaded UpdatedAt so next poll (filter >= since)
            // picks up orphaned rows 501+. Client dedupes by id.
            if (rows.Count == pageSize)
            {
                var cursor = rows[^1].UpdatedAt;
                return RoomResult<RoomStateView>.Ok(new RoomStateView(members, highlights, [], cursor));
            }
        }

        // Delete propagation: out of scope for MVP (clients can reconcile on full refresh).
        return RoomResult<RoomStateView>.Ok(new RoomStateView(
            members, highlights, [], DateTimeOffset.UtcNow));
    }

    private async Task<List<RoomMemberView>> LoadMemberViewsAsync(
        Guid roomId, bool includeHiddenProgress, Guid forUserId, CancellationToken ct)
    {
        return await _db.ReadingRoomMembers
            .Where(m => m.RoomId == roomId && m.LeftAt == null)
            .OrderBy(m => m.JoinedAt)
            .Select(m => new RoomMemberView(
                m.UserId,
                m.User.Name,
                m.User.Picture,
                m.Color,
                m.Role,
                m.ShowProgress,
                m.JoinedAt,
                m.LastSeenAt,
                (m.ShowProgress || m.UserId == forUserId) ? m.CurrentChapterId : null,
                (m.ShowProgress || m.UserId == forUserId) ? m.CurrentPercent : null))
            .ToListAsync(ct);
    }
}
