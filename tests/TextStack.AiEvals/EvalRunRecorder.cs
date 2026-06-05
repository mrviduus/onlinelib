using System.Text.Json;
using Npgsql;
using TextStack.Ai.Evals;

namespace TextStack.AiEvals;

/// <summary>
/// Best-effort persistence of an eval run into <c>eval_runs</c> so the /ai-quality
/// Evals tab has history. No-op unless <c>EVAL_DB_CONNECTION</c> is set, so normal
/// opt-in eval runs don't require a database. Uses Npgsql directly (no EF) to keep
/// the test project light.
/// </summary>
internal static class EvalRunRecorder
{
    public static async Task RecordAsync(string feature, bool ollamaGen, Rubric rubric, EvalSummary summary, CancellationToken ct)
    {
        var conn = Environment.GetEnvironmentVariable("EVAL_DB_CONNECTION");
        if (string.IsNullOrWhiteSpace(conn))
            return;

        var breakdown = JsonSerializer.Serialize(new Dictionary<string, double>
        {
            [Label(rubric.Dim1)] = Math.Round(summary.Mean1, 2),
            [Label(rubric.Dim2)] = Math.Round(summary.Mean2, 2),
            [Label(rubric.Dim3)] = Math.Round(summary.Mean3, 2),
        });

        await using var db = new NpgsqlConnection(conn);
        await db.OpenAsync(ct);
        await using var cmd = db.CreateCommand();
        cmd.CommandText = """
            INSERT INTO eval_runs (id, feature, model_id, judge_model_id, score, n, breakdown_json, git_sha, created_at)
            VALUES (@id, @feature, @model, @judge, @score, @n, @breakdown::jsonb, @sha, now())
            """;
        cmd.Parameters.AddWithValue("id", Guid.NewGuid());
        cmd.Parameters.AddWithValue("feature", feature);
        cmd.Parameters.AddWithValue("model", GenModelId(ollamaGen));
        cmd.Parameters.AddWithValue("judge", JudgeModelId());
        cmd.Parameters.AddWithValue("score", Math.Round((decimal)summary.MeanOverall, 3));
        cmd.Parameters.AddWithValue("n", summary.N);
        cmd.Parameters.AddWithValue("breakdown", breakdown);
        cmd.Parameters.AddWithValue("sha", (object?)Environment.GetEnvironmentVariable("GIT_SHA") ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static string Label(string dim) => dim.Split(':')[0].Trim();

    private static string GenModelId(bool ollama) => ollama
        ? Environment.GetEnvironmentVariable("OLLAMA_MODEL") ?? "gemma4:e4b"
        : Environment.GetEnvironmentVariable("OPENAI_MODEL") ?? "gpt-4.1-nano";

    private static string JudgeModelId() =>
        (Environment.GetEnvironmentVariable("EVAL_JUDGE") ?? "openai").Trim().ToLowerInvariant() == "ollama"
            ? Environment.GetEnvironmentVariable("OLLAMA_MODEL") ?? "gemma4:e4b"
            : Environment.GetEnvironmentVariable("OPENAI_MODEL") ?? "gpt-4.1-nano";
}
