using System.Text.Json;
using System.Text.Json.Serialization;

namespace TextStack.Ai.Mcp.Auth;

/// <summary>
/// The persisted device-flow credentials (access + refresh token + the access
/// token's expiry). Written by <see cref="DeviceFlowTokenProvider"/> after a
/// successful device authorization or refresh; read on startup to skip re-auth.
/// </summary>
public sealed record CachedTokens(
    [property: JsonPropertyName("accessToken")] string AccessToken,
    [property: JsonPropertyName("refreshToken")] string RefreshToken,
    [property: JsonPropertyName("accessExpiresAt")] DateTimeOffset AccessExpiresAt);

/// <summary>
/// On-disk, single-user cache for the device-flow tokens. Default location:
/// <c>$XDG_CONFIG_HOME/textstack/mcp-token.json</c> (falling back to
/// <c>~/.textstack/mcp-token.json</c>); overridable via
/// <c>TEXTSTACK_MCP_TOKEN_CACHE</c> (an explicit file path).
///
/// SECURITY: tokens are secrets. On Unix the file is written with mode
/// <c>0600</c> (owner read/write only). On READ, if the file is group- or
/// world-readable on Unix it is treated as compromised and IGNORED (returns
/// null) rather than trusted — the caller simply re-runs the device flow. On
/// Windows we rely on the user-profile ACL (no explicit mode is set).
/// </summary>
public sealed class TokenCache
{
    private const UnixFileMode OwnerOnly = UnixFileMode.UserRead | UnixFileMode.UserWrite;
    private const UnixFileMode GroupOrWorld =
        UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.GroupExecute |
        UnixFileMode.OtherRead | UnixFileMode.OtherWrite | UnixFileMode.OtherExecute;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = false,
    };

    private readonly string _path;

    public TokenCache(string path) => _path = path;

    /// <summary>The absolute file path this cache reads/writes.</summary>
    public string Path => _path;

    /// <summary>
    /// Resolves the cache file path: explicit override first, then
    /// <c>$XDG_CONFIG_HOME/textstack/</c>, then <c>~/.textstack/</c>.
    /// </summary>
    public static string ResolvePath(string? overridePath)
    {
        if (!string.IsNullOrWhiteSpace(overridePath))
            return overridePath;

        var xdg = Environment.GetEnvironmentVariable("XDG_CONFIG_HOME");
        if (!string.IsNullOrWhiteSpace(xdg))
            return System.IO.Path.Combine(xdg, "textstack", "mcp-token.json");

        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        return System.IO.Path.Combine(home, ".textstack", "mcp-token.json");
    }

    /// <summary>
    /// Reads the cached tokens, or null when absent / unreadable / unsafe-perms /
    /// malformed. Never throws — a bad cache is just a cache miss (re-auth).
    /// </summary>
    public CachedTokens? Read()
    {
        try
        {
            if (!File.Exists(_path))
                return null;

            // Refuse a group/world-readable secret on Unix — treat as no cache so
            // the caller re-runs the device flow rather than trusting a leaked file.
            if (!OperatingSystem.IsWindows())
            {
                var mode = File.GetUnixFileMode(_path);
                if ((mode & GroupOrWorld) != 0)
                    return null;
            }

            var json = File.ReadAllText(_path);
            if (string.IsNullOrWhiteSpace(json))
                return null;

            return JsonSerializer.Deserialize<CachedTokens>(json, JsonOptions);
        }
        catch
        {
            // Unreadable / malformed → cache miss.
            return null;
        }
    }

    /// <summary>
    /// Writes the cached tokens with owner-only perms (0600) on Unix. Creates the
    /// parent directory if missing. Best-effort: a write failure (e.g. read-only
    /// dir) is swallowed — the in-memory tokens still work for this session.
    /// </summary>
    public void Write(CachedTokens tokens)
    {
        try
        {
            var dir = System.IO.Path.GetDirectoryName(_path);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);

            var json = JsonSerializer.Serialize(tokens, JsonOptions);

            if (OperatingSystem.IsWindows())
            {
                File.WriteAllText(_path, json);
            }
            else
            {
                // Create with 0600 BEFORE writing the secret so it is never briefly
                // world-readable. If the file pre-exists with looser perms, tighten it.
                using (var fs = new FileStream(
                    _path, FileMode.Create, FileAccess.Write, FileShare.None,
                    bufferSize: 4096, options: FileOptions.None))
                {
                    fs.Dispose();
                }
                File.SetUnixFileMode(_path, OwnerOnly);
                File.WriteAllText(_path, json);
                File.SetUnixFileMode(_path, OwnerOnly);
            }
        }
        catch
        {
            // Best-effort persistence — non-fatal.
        }
    }
}
