namespace Application.Rooms;

/// <summary>Deterministic HSL color from userId — same user = same color across rooms.</summary>
public static class MemberColor
{
    public static string ForUser(Guid userId)
    {
        var hash = 0;
        foreach (var b in userId.ToByteArray())
            hash = unchecked(hash * 31 + b);
        var hue = (hash & int.MaxValue) % 360;
        return $"hsl({hue}, 65%, 55%)";
    }
}
