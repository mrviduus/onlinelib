using System.Text.Json;
using Application.Agents;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using TextStack.Ai.Agents;
using TextStack.Ai.Core;
using TextStack.Ai.EvalSuite;
using TextStack.Ai.Tools;

namespace TextStack.AiEvals;

/// <summary>
/// AI-Agent-3 LibrarianEvalRunner — the deterministic scoring (recall@k, constraint-satisfaction, coverage
/// decision, hallucination invariant) over a small explicit golden set, driven by a scripted LLM + fake search
/// tools so the run is offline + reproducible. Proves: a relevant in-library hit scores recall 1.0; a returned
/// library book whose slug doesn't exist fails the hallucination probe; expanding externally exactly when the
/// golden expects it scores coverage 1.0.
/// </summary>
public class LibrarianEvalRunnerTests
{
    private static JsonElement Json(string json) => JsonDocument.Parse(json).RootElement;
    private const string Ed1 = "11111111-1111-1111-1111-111111111111";

    // Default name is a unique sentinel so the Application assembly tool-scan (which DI-constructs every
    // concrete ITool, including those in this test assembly) never collides; tests set Name per instance.
    private sealed class FakeTool : ITool
    {
        public string Name { get; init; } = "fake-librarian-eval-tool";
        public string Json { get; init; } = "{}";
        public string Description => "fake";
        public JsonElement ArgsSchema => JsonDocument.Parse("""{"type":"object"}""").RootElement;
        public Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct) =>
            Task.FromResult(JsonDocument.Parse(Json).RootElement);
    }

    /// <summary>Replays a fixed script of turns PER query (the runner calls the agent once per golden).</summary>
    private sealed class PerQueryLlm(Func<string, object[][]> script) : ILlmService
    {
        private object[][]? _turns;
        private int _turn;

        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            // A run always starts with exactly one (user) message — that's the boundary to (re)load the script.
            if (request.Messages.Count == 1)
            {
                _turns = script(request.Messages[0].Content);
                _turn = 0;
            }
            var entries = _turn < _turns!.Length ? _turns[_turn] : ["{}"];
            _turn++;
            var text = string.Concat(entries.OfType<string>());
            var calls = entries.OfType<ToolCall>().ToList();
            return Task.FromResult(new LlmResponse(text, calls, new LlmUsage(1, 1, 0m), "m", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private static ToolCall Call(string name, string args = "{}") => new("c1", name, Json(args));

    private static readonly string LibraryResult = $$"""
        {"found":true,"query":"q","results":[
          {"source":"library","editionId":"{{Ed1}}","slug":"dracula","title":"Dracula","authors":["Bram Stoker"],"genres":["Horror"],"language":"en","wordCount":160000,"approxPages":580,"year":null}
        ]}
        """;

    private static LibrarianAgent BuildAgent(Func<string, object[][]> script)
    {
        var registry = new ToolRegistry([
            new FakeTool { Name = "search_library", Json = LibraryResult },
            new FakeTool { Name = "search_library_semantic", Json = LibraryResult },
            new FakeTool { Name = "search_open_library", Json = """{"found":true,"results":[{"title":"External Pick"}]}""" },
            new FakeTool { Name = "get_open_library_work", Json = """{"found":false}""" },
        ]);
        var loop = new AgentLoop(new PerQueryLlm(script), registry, new ToolDispatcher(registry));
        return new LibrarianAgent(loop);
    }

    private static IServiceProvider Services() => new ServiceCollection().BuildServiceProvider();

    // A flood result: the golden slug "dracula" plus 7 real-but-irrelevant catalog books (all real editions, all
    // pass the hallucination probe) — used to prove precision/F1 punish cap-flooding even at recall 1.0 (FIX 1).
    private static string FloodResult()
    {
        var rows = new List<string>
        {
            $$"""{"source":"library","editionId":"{{Ed1}}","slug":"dracula","title":"Dracula","authors":["Bram Stoker"],"genres":["Horror"],"language":"en","wordCount":160000,"approxPages":580,"year":null}""",
        };
        for (var i = 2; i <= 8; i++)
        {
            var id = $"{i:D8}-0000-0000-0000-000000000000";
            rows.Add($$"""{"source":"library","editionId":"{{id}}","slug":"filler-{{i}}","title":"Filler {{i}}","authors":["A"],"genres":["X"],"language":"en","wordCount":1000,"approxPages":50,"year":null}""");
        }
        return $$"""{"found":true,"query":"q","results":[{{string.Join(",", rows)}}]}""";
    }

    private static LibrarianAgent BuildFloodAgent(Func<string, object[][]> script)
    {
        var registry = new ToolRegistry([
            new FakeTool { Name = "search_library", Json = FloodResult() },
            new FakeTool { Name = "search_library_semantic", Json = FloodResult() },
            new FakeTool { Name = "search_open_library", Json = """{"found":false,"results":[]}""" },
            new FakeTool { Name = "get_open_library_work", Json = """{"found":false}""" },
        ]);
        var loop = new AgentLoop(new PerQueryLlm(script), registry, new ToolDispatcher(registry));
        return new LibrarianAgent(loop);
    }

    [Fact]
    public async Task RunAsync_FloodsCapWithIrrelevantBooks_HighRecallButLowPrecisionAndF1()
    {
        // FIX 1: the agent searches once then commits ALL 8 returned books (the golden + 7 fillers). Recall is
        // 1.0 (the golden surfaced) but only 1 of 8 returned is relevant → precision 0.125, F1 ≈ 0.222. The
        // relevance gate (precision/F1) reads RED even though recall reads green, so flooding can't game the eval.
        var commit = new System.Text.StringBuilder("""{"recommendations":[""");
        commit.Append("""{"source":"library","editionId":"11111111-1111-1111-1111-111111111111","slug":"dracula","title":"Dracula","why":"x"}""");
        for (var i = 2; i <= 8; i++)
            commit.Append($$""",{"source":"library","editionId":"{{i:D8}}-0000-0000-0000-000000000000","slug":"filler-{{i}}","title":"Filler {{i}}","why":"x"}""");
        commit.Append("""],"reasoning":"all of them","usedExternal":false}""");

        var agent = BuildFloodAgent(_ =>
        [
            [Call("search_library", """{"query":"gothic"}""")],
            [commit.ToString()],
        ]);
        var goldens = new[] { new LibrarianGolden("gothic horror", ["dracula"]) };

        var runner = new LibrarianEvalRunner(NullLogger<LibrarianEvalRunner>.Instance);
        var result = await runner.RunAsync(
            agent, Services(), (_, _) => Task.FromResult(true), goldens, // every slug exists → hallucination clean
            TestContext.Current.CancellationToken);

        Assert.Equal(8, result.Cases[0].LibraryReturned);   // it flooded the cap
        Assert.Equal(1.0, result.RecallAtK, 3);             // golden surfaced → recall green
        Assert.Equal(0.125, result.PrecisionAtK, 3);        // 1 relevant / 8 returned → precision RED
        Assert.Equal(0.222, result.F1AtK, 3);               // harmonic mean RED → flood can't game the gate
        Assert.Equal(1.0, result.HallucinationFreeRate, 3); // (all real editions — the existing check can't catch this)
    }

    [Fact]
    public async Task RunAsync_RelevantLibraryHit_ScoresRecallAndNoHallucination()
    {
        var agent = BuildAgent(_ =>
        [
            [Call("search_library", """{"query":"gothic"}""")],
            [$$"""{"recommendations":[{"source":"library","editionId":"{{Ed1}}","slug":"dracula","title":"Dracula","why":"gothic"}],"reasoning":"ok","usedExternal":false}"""],
        ]);
        var goldens = new[]
        {
            new LibrarianGolden("gothic horror", ["dracula"], NeedsExternal: false, Language: "en"),
        };

        var runner = new LibrarianEvalRunner(NullLogger<LibrarianEvalRunner>.Instance);
        var result = await runner.RunAsync(
            agent, Services(), (slug, _) => Task.FromResult(slug == "dracula"), goldens,
            TestContext.Current.CancellationToken);

        Assert.Equal(1.0, result.RecallAtK, 3);
        Assert.Equal(1.0, result.PrecisionAtK, 3);  // exactly the one relevant book returned → perfect precision
        Assert.Equal(1.0, result.F1AtK, 3);
        Assert.Equal(1.0, result.ConstraintSatisfaction, 3);
        Assert.Equal(1.0, result.CoverageDecisionAccuracy, 3);
        Assert.Equal(1.0, result.HallucinationFreeRate, 3);
    }

    [Fact]
    public async Task RunAsync_ReturnedSlugNotInCatalog_FailsHallucinationProbe()
    {
        var agent = BuildAgent(_ =>
        [
            [Call("search_library", """{"query":"gothic"}""")],
            [$$"""{"recommendations":[{"source":"library","editionId":"{{Ed1}}","slug":"dracula","title":"Dracula","why":"gothic"}],"reasoning":"ok","usedExternal":false}"""],
        ]);
        var goldens = new[] { new LibrarianGolden("gothic", ["dracula"]) };

        var runner = new LibrarianEvalRunner(NullLogger<LibrarianEvalRunner>.Instance);
        // The probe says the slug does NOT exist → the end-to-end hallucination-free rate drops to 0.
        var result = await runner.RunAsync(
            agent, Services(), (_, _) => Task.FromResult(false), goldens,
            TestContext.Current.CancellationToken);

        Assert.Equal(0.0, result.HallucinationFreeRate, 3);
    }

    [Fact]
    public async Task RunAsync_ExpandsExternallyWhenExpected_ScoresCoverageDecision()
    {
        var agent = BuildAgent(_ =>
        [
            [Call("search_library", """{"query":"indie"}""")],
            [Call("search_open_library", """{"title":"indie"}""")],
            ["""{"recommendations":[{"source":"open_library","title":"External Pick","why":"matches"}],"reasoning":"thin","usedExternal":true}"""],
        ]);
        var goldens = new[] { new LibrarianGolden("a 2023 indie thriller", [], NeedsExternal: true) };

        var runner = new LibrarianEvalRunner(NullLogger<LibrarianEvalRunner>.Instance);
        var result = await runner.RunAsync(
            agent, Services(), (_, _) => Task.FromResult(true), goldens,
            TestContext.Current.CancellationToken);

        Assert.Equal(1.0, result.CoverageDecisionAccuracy, 3); // used external exactly when expected
        Assert.Equal(1.0, result.HallucinationFreeRate, 3);    // no library recs → vacuously clean
    }
}
