using System.Net.ServerSentEvents;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Api.Endpoints;
using Application.Agents;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Agents;
using TextStack.Ai.Core;
using TextStack.Ai.Tools;

namespace TextStack.UnitTests;

/// <summary>
/// AI-037b — the Study Buddy SSE stream generator (<see cref="StudyBuddyEndpoints.StreamRunAsync"/>),
/// driven through the real agent + loop with a scripted LLM and a capturing writer: step events then
/// done + a persisted "completed" run; a budget-exhausted run streams partial steps then an error
/// event and persists "budget_exhausted" with its transcript.
/// </summary>
public class StudyBuddyEndpointTests
{
    private sealed class ScriptedLlm(params object[][] turns) : ILlmService
    {
        private int _turn;

        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            var entries = _turn < turns.Length ? turns[_turn] : ["fallback"];
            _turn++;
            var text = string.Concat(entries.OfType<string>());
            var calls = entries.OfType<ToolCall>().ToList();
            return Task.FromResult(new LlmResponse(text, calls, new LlmUsage(5, 2, 0.001m), "m", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private sealed class CapturingWriter : IAgentRunWriter
    {
        public AgentRunRecord? Captured { get; private set; }
        public Task WriteAsync(AgentRunRecord run, CancellationToken ct)
        {
            Captured = run;
            return Task.CompletedTask;
        }
    }

    private static StudyBuddyAgent Agent(ILlmService llm)
    {
        var registry = new ToolRegistry([]); // no tools → SchemasFor returns empty
        return new StudyBuddyAgent(new AgentLoop(llm, registry, new ToolDispatcher(registry)));
    }

    private static ToolCall Call() => new("c1", "missing", JsonDocument.Parse("{}").RootElement);

    private static async Task<List<SseItem<string>>> Collect(
        StudyBuddyAgent agent, IAgentRunWriter writer, Guid editionId)
    {
        var input = new StudyBuddyInput("A confusing passage.", editionId, ChapterNumber: 2);
        var items = new List<SseItem<string>>();
        await foreach (var item in StudyBuddyEndpoints.StreamRunAsync(
            agent, writer, Guid.NewGuid(), Guid.NewGuid(), editionId, input,
            new ServiceCollection().BuildServiceProvider(), TestContext.Current.CancellationToken))
        {
            items.Add(item);
        }
        return items;
    }

    [Fact]
    public async Task Stream_DirectAnswer_EmitsStepThenDone_PersistsCompleted()
    {
        var writer = new CapturingWriter();
        var events = await Collect(Agent(new ScriptedLlm(["The explanation."])), writer, Guid.NewGuid());

        Assert.Equal(["step", "done"], events.Select(e => e.EventType));
        Assert.Contains("The explanation.", events[^1].Data); // done carries the answer

        Assert.NotNull(writer.Captured);
        Assert.Equal("completed", writer.Captured!.Status);
        Assert.Equal("The explanation.", writer.Captured.Output);
    }

    [Fact]
    public async Task Stream_BudgetExhausted_EmitsStepsThenError_PersistsWithTranscript()
    {
        // Always "calls" a (missing) tool → never answers → hits MaxSteps (6) → budget exhausted.
        var turns = Enumerable.Range(0, 6).Select(_ => new object[] { Call() }).ToArray();
        var writer = new CapturingWriter();

        var events = await Collect(Agent(new ScriptedLlm(turns)), writer, Guid.NewGuid());

        Assert.Equal("error", events[^1].EventType);            // terminal error event
        Assert.Contains(events, e => e.EventType == "step");    // partial steps streamed first
        Assert.DoesNotContain(events, e => e.EventType == "done");

        Assert.NotNull(writer.Captured);
        Assert.Equal("budget_exhausted", writer.Captured!.Status);
        Assert.NotEmpty(writer.Captured.Steps); // transcript preserved (AI-036)
    }
}
