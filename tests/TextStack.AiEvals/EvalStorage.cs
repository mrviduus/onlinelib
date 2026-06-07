namespace TextStack.AiEvals;

/// <summary>
/// Resolves a stable on-disk location for the MEAI report/response-cache store.
/// Prefers <c>EVAL_STORAGE_DIR</c>, else <c>&lt;repo&gt;/data/eval-meai</c> (the repo's
/// <c>/data/</c> is gitignored), else a temp dir. Walks up from the test binary to find
/// the repo root (the dir holding <c>textstack.sln</c>).
/// </summary>
internal static class EvalStorage
{
    public static string Root(string subdir)
    {
        var env = Environment.GetEnvironmentVariable("EVAL_STORAGE_DIR");
        var baseDir = !string.IsNullOrWhiteSpace(env)
            ? env
            : RepoRoot() is { } repo
                ? Path.Combine(repo, "data", "eval-meai")
                : Path.Combine(Path.GetTempPath(), "textstack-eval-meai");

        var path = Path.Combine(baseDir, subdir);
        Directory.CreateDirectory(path);
        return path;
    }

    private static string? RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "textstack.sln")))
                return dir.FullName;
            dir = dir.Parent;
        }
        return null;
    }
}
