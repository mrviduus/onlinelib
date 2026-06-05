using Microsoft.Extensions.Logging;
using TextStack.Ai.Core;

namespace TextStack.Ai.Evals;

/// <summary>
/// Runs a golden dataset against the feature under test: for each case it builds
/// an <see cref="LlmRequest"/> (caller supplies the mapping, so the same prompt
/// the production endpoint uses can be reused) and calls <see cref="ILlmService"/>,
/// collecting the model output. Feature-agnostic via <typeparamref name="TCase"/>.
///
/// Sequential on purpose: golden runs are small (~30 cases), and serial keeps the
/// output ordered and avoids hammering provider rate limits. The judging step is
/// a separate pass (<see cref="JudgeRunner"/>).
/// </summary>
public sealed class GoldenRunner(ILlmService llm, ILogger<GoldenRunner>? logger = null)
{
    public async Task<IReadOnlyList<GoldenResult<TCase>>> RunAsync<TCase>(
        IEnumerable<TCase> cases,
        Func<TCase, LlmRequest> toRequest,
        CancellationToken ct)
    {
        var results = new List<GoldenResult<TCase>>();
        foreach (var c in cases)
        {
            ct.ThrowIfCancellationRequested();
            var response = await llm.CompleteAsync(toRequest(c), ct);
            logger?.LogDebug("Golden case produced {Chars} chars", response.Text.Length);
            results.Add(new GoldenResult<TCase>(c, response.Text));
        }
        return results;
    }
}
