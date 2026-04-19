using System.Security.Cryptography;
using System.Text;

namespace Application.Rooms;

public static class RoomTokens
{
    public static string GenerateRaw()
    {
        var bytes = new byte[48];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }

    public static string Hash(string raw)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexStringLower(bytes);
    }
}
