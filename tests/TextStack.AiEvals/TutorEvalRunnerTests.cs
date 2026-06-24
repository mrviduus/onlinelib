using System.Text.Json;
using TextStack.Ai.Core;
using TextStack.Ai.EvalSuite;
using Microsoft.Extensions.Logging.Abstractions;

namespace TextStack.AiEvals;

/// <summary>
/// Deterministic coverage for <see cref="TutorEvalRunner"/> (AI-Agent-2): the runner wires the REAL TutorAgent
/// to fake tools serving each synthetic learner state, and the agent runs on a fake, offline LLM. A
/// well-behaved planner (fetch due cards → plan from them) scores perfect on the structural rubric; a
/// hallucinating planner (invents a card id) is caught by the no-hallucination metric. No key or network.
/// </summary>
public class TutorEvalRunnerTests
{
    private const string D1 = "11111111-0000-0000-0000-000000000001";
    private const string D2 = "11111111-0000-0000-0000-000000000002";
    private const string D3 = "11111111-0000-0000-0000-000000000003";

    private static readonly IReadOnlyList<TutorGolden> Goldens =
    [
        new(
            Name: "due-and-weak",
            Cards:
            [
                new(D1, "sanguine", Stage: 0, ConsecutiveCorrect: 0, Accuracy: 0.2, Due: true),
                new(D2, "ephemeral", Stage: 2, ConsecutiveCorrect: 1, Accuracy: 0.45, Due: true),
                new(D3, "ostensibly", Stage: 1, ConsecutiveCorrect: 0, Accuracy: 0.3, Due: true),
            ],
            ReadingBook: "1984",
            ReadingLanguage: "en",
            ExpectedDueWordIds: [D1, D2, D3],
            ExpectedWeakWordIds: [D1, D3]),
    ];

    /// <summary>
    /// A well-behaved planner: on the first turn it calls get_due_vocabulary; once it has seen the due cards in
    /// the transcript it plans every retrieved card (weak ones first), ending with a reading nudge.
    /// </summary>
    private sealed class OraclePlannerLlm : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            // Has a tool result already been observed? (the loop appends "tool" role messages after dispatch)
            var sawCards = request.Messages.Any(m => m.Role == "tool" && m.Content.Contains("wordId", StringComparison.Ordinal));
            if (!sawCards)
            {
                var call = new ToolCall("c1", "get_due_vocabulary", JsonDocument.Parse("""{"limit":7}""").RootElement);
                return Task.FromResult(new LlmResponse("", [call], new LlmUsage(10, 5, 0.001m), "oracle", Guid.NewGuid()));
            }

            // Re-project the ids straight out of the tool result the loop fed back, then plan weak-first.
            var ids = ExtractWordIds(request);
            var weak = new[] { D1, D3 };
            var ordered = ids.OrderBy(id => Array.IndexOf(weak, id) is var i && i >= 0 ? i : 99).ToList();
            var items = string.Join(",", ordered.Select(id =>
                $$"""{"wordId":"{{id}}","exerciseType":"recall","difficulty":"medium","why":"due"}"""));
            var json = $$"""{"plan":[{{items}}],"rationale":"weak first","readingNudge":"keep reading 1984"}""";
            return Task.FromResult(new LlmResponse(json, [], new LlmUsage(20, 10, 0.001m), "oracle", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();

        private static List<string> ExtractWordIds(LlmRequest request)
        {
            var ids = new List<string>();
            foreach (var m in request.Messages.Where(m => m.Role == "tool"))
            {
                if (!m.Content.Contains("wordId", StringComparison.Ordinal)) continue;
                try
                {
                    using var doc = JsonDocument.Parse(m.Content);
                    if (FindWords(doc.RootElement) is { } arr)
                        foreach (var w in arr.EnumerateArray())
                            if (w.TryGetProperty("wordId", out var id) && id.GetString() is { } s)
                                ids.Add(s);
                }
                catch (JsonException) { /* the tool payload may be wrapped — best-effort */ }
            }
            return ids.Distinct().ToList();
        }

        private static JsonElement? FindWords(JsonElement el)
        {
            if (el.ValueKind == JsonValueKind.Object)
            {
                if (el.TryGetProperty("words", out var w) && w.ValueKind == JsonValueKind.Array) return w;
                foreach (var p in el.EnumerateObject())
                    if (FindWords(p.Value) is { } found) return found;
            }
            return null;
        }
    }

    [Fact]
    public async Task RunAsync_WellBehavedPlanner_ScoresPerfectRubric()
    {
        var runner = new TutorEvalRunner(NullLogger<TutorEvalRunner>.Instance);

        var result = await runner.RunAsync(new OraclePlannerLlm(), Goldens, TestContext.Current.CancellationToken);

        Assert.Equal(Goldens.Count, result.N);
        Assert.Equal(1.0, result.DueCoverage, 3);                // planned all due cards
        Assert.Equal(1.0, result.NoHallucinationRate, 3);        // every wordId is real
        Assert.Equal(1.0, result.DifficultyAppropriateness, 3);  // exercise types recalibrated from stage
        Assert.Equal(1.0, result.ThesisAlignment, 3);            // bounded + reading nudge
        Assert.True(result.WeakTargeting >= 0.5);                // weak cards lead the plan
        Assert.True(result.AvgToolCalls >= 1);                   // it actually used a tool
    }

    /// <summary>A planner that invents a card id never present in any state — must fail no-hallucination.</summary>
    private sealed class HallucinatingLlm : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            var json = """
                {"plan":[{"wordId":"deadbeef-0000-0000-0000-000000000000","exerciseType":"recall","why":"made up"}],
                 "rationale":"x","readingNudge":"read"}
                """;
            return Task.FromResult(new LlmResponse(json, [], new LlmUsage(20, 10, 0.001m), "hallucinator", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    // ---- FIX 5: a golden where a WEAK card is NOT due (and a due card is not weak) makes WeakTargeting a
    // real due-vs-weak tradeoff: a planner that just returns all due cards can no longer max it. ----------

    private const string WeakNotDue = "44444444-0000-0000-0000-000000000001"; // weak, NOT due
    private const string DueNotWeak1 = "44444444-0000-0000-0000-000000000002"; // due, not weak
    private const string DueNotWeak2 = "44444444-0000-0000-0000-000000000003"; // due, not weak

    private static readonly IReadOnlyList<TutorGolden> WeakNotDueGolden =
    [
        new(
            Name: "weak-not-due-vs-due-not-weak",
            Cards:
            [
                new(WeakNotDue, "recalcitrant", Stage: 1, ConsecutiveCorrect: 0, Accuracy: 0.15, Due: false),
                new(DueNotWeak1, "perfunctory", Stage: 3, ConsecutiveCorrect: 4, Accuracy: 0.90, Due: true),
                new(DueNotWeak2, "taciturn", Stage: 4, ConsecutiveCorrect: 5, Accuracy: 0.95, Due: true),
            ],
            ReadingBook: "Crime and Punishment",
            ReadingLanguage: "en",
            ExpectedDueWordIds: [DueNotWeak1, DueNotWeak2],
            ExpectedWeakWordIds: [WeakNotDue]),
    ];

    /// <summary>Plans ONLY the due cards (ignores weakness) — the weak card is not due, so it never retrieves it.</summary>
    private sealed class DueOnlyLlm : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            var sawCards = request.Messages.Any(m => m.Role == "tool" && m.Content.Contains("wordId", StringComparison.Ordinal));
            if (!sawCards)
            {
                var call = new ToolCall("c1", "get_due_vocabulary", JsonDocument.Parse("""{"limit":7}""").RootElement);
                return Task.FromResult(new LlmResponse("", [call], new LlmUsage(10, 5, 0.001m), "due-only", Guid.NewGuid()));
            }
            var items = string.Join(",", new[] { DueNotWeak1, DueNotWeak2 }.Select(id =>
                $$"""{"wordId":"{{id}}","exerciseType":"recall","difficulty":"medium","why":"due"}"""));
            var json = $$"""{"plan":[{{items}}],"rationale":"due only","readingNudge":"keep reading"}""";
            return Task.FromResult(new LlmResponse(json, [], new LlmUsage(20, 10, 0.001m), "due-only", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    /// <summary>Fetches due AND weak, then leads the plan with the weak (not-due) card.</summary>
    private sealed class WeakAwareLlm : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            var toolMsgs = request.Messages.Count(m => m.Role == "tool" && m.Content.Contains("wordId", StringComparison.Ordinal));
            // First fetch due, then fetch weak (so the weak-not-due card enters the transcript), then plan.
            if (toolMsgs == 0)
                return Call("get_due_vocabulary");
            if (toolMsgs == 1)
                return Call("get_weak_vocabulary");

            var items = string.Join(",", new[] { WeakNotDue, DueNotWeak1, DueNotWeak2 }.Select(id =>
                $$"""{"wordId":"{{id}}","exerciseType":"recall","difficulty":"medium","why":"x"}"""));
            var json = $$"""{"plan":[{{items}}],"rationale":"weak first","readingNudge":"keep reading"}""";
            return Task.FromResult(new LlmResponse(json, [], new LlmUsage(20, 10, 0.001m), "weak-aware", Guid.NewGuid()));
        }

        private static Task<LlmResponse> Call(string tool)
        {
            var call = new ToolCall("c1", tool, JsonDocument.Parse("""{"limit":7}""").RootElement);
            return Task.FromResult(new LlmResponse("", [call], new LlmUsage(10, 5, 0.001m), "weak-aware", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    [Fact]
    public async Task RunAsync_WeakNotDueGolden_DiscriminatesDueOnlyFromWeakAwarePlanner()
    {
        var runner = new TutorEvalRunner(NullLogger<TutorEvalRunner>.Instance);

        var dueOnly = await runner.RunAsync(new DueOnlyLlm(), WeakNotDueGolden, TestContext.Current.CancellationToken);
        var weakAware = await runner.RunAsync(new WeakAwareLlm(), WeakNotDueGolden, TestContext.Current.CancellationToken);

        // Both cover the due cards perfectly — DueCoverage cannot tell them apart.
        Assert.Equal(1.0, dueOnly.DueCoverage, 3);
        Assert.Equal(1.0, weakAware.DueCoverage, 3);

        // But WeakTargeting now does: the weak card isn't due, so the due-only planner can't surface it.
        Assert.Equal(0.0, dueOnly.WeakTargeting, 3);
        Assert.True(weakAware.WeakTargeting > dueOnly.WeakTargeting,
            $"weak-aware ({weakAware.WeakTargeting}) should beat due-only ({dueOnly.WeakTargeting})");
    }

    [Fact]
    public async Task RunAsync_HallucinatingPlanner_EmptyPlan_NoInventedIdSurvives()
    {
        var result = await new TutorEvalRunner(NullLogger<TutorEvalRunner>.Instance).RunAsync(
            new HallucinatingLlm(), Goldens, TestContext.Current.CancellationToken);

        // The agent's parser drops the invented id before scoring, so the plan is empty — and an empty plan
        // contains no card that isn't in the state, so NoHallucinationRate stays 1.0 (the invariant the parser
        // GUARANTEES). Due coverage collapses to 0 because the invented plan covered none of the real due cards.
        Assert.Equal(1.0, result.NoHallucinationRate, 3);
        Assert.Equal(0.0, result.DueCoverage, 3);
        Assert.All(result.Cases, c => Assert.Equal(0, c.Planned));
    }
}
