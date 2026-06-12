using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;
using TextStack.Ai.Tools;

namespace TextStack.UnitTests;

/// <summary>
/// AI-031b — the one-round function-calling session: passthrough when the model answers directly,
/// dispatch + follow-up round when it requests tools, tool failures fed back as data.
/// </summary>
public class ToolCallingSessionTests
{
    private static readonly JsonElement AnySchema = JsonDocument.Parse("""{"type":"object"}""").RootElement;

    private static JsonElement Json(string json) => JsonDocument.Parse(json).RootElement;

    private sealed class EchoTool : ITool
    {
        public string Name => "session-echo";
        public string Description => "echoes";
        public JsonElement ArgsSchema => AnySchema;
        public Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct) =>
            Task.FromResult(Json("""{"echoed":true}"""));
    }

    /// <summary>Scripted LLM: each call (stream or complete) consumes the next script entry; requests are recorded.</summary>
    private sealed class ScriptedLlm(params object[][] script) : ILlmService
    {
        private int _call;
        public List<LlmRequest> Requests { get; } = [];

        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            Requests.Add(request);
            var entries = script[_call++];
            var text = string.Concat(entries.OfType<string>());
            var calls = entries.OfType<ToolCall>().ToList();
            return Task.FromResult(new LlmResponse(text, calls, new LlmUsage(1, 1, 0m), "m", Guid.NewGuid()));
        }

        public async IAsyncEnumerable<LlmDelta> StreamAsync(
            LlmRequest request, [EnumeratorCancellation] CancellationToken ct)
        {
            Requests.Add(request);
            foreach (var entry in script[_call++])
            {
                await Task.Yield();
                yield return entry switch
                {
                    string s => new LlmDelta(TextDelta: s),
                    ToolCall c => new LlmDelta(ToolCallDelta: c),
                    _ => throw new InvalidOperationException(),
                };
            }
            yield return new LlmDelta(FinalUsage: new LlmUsage(1, 1, 0m), ModelId: "m");
        }
    }

    private static ToolCallingSession Session(params ITool[] tools) =>
        new(new ToolDispatcher(new ToolRegistry(tools)));

    private static ToolContext Ctx() =>
        new(null, null, Guid.NewGuid(), new ServiceCollection().BuildServiceProvider());

    private static ToolCall Call(string name, string args = "{}") => new("call-1", name, Json(args));

    private static async Task<List<LlmDelta>> Drain(IAsyncEnumerable<LlmDelta> stream)
    {
        var list = new List<LlmDelta>();
        await foreach (var d in stream) list.Add(d);
        return list;
    }

    [Fact]
    public async Task Stream_NoToolCalls_PassesThroughSingleRound()
    {
        var llm = new ScriptedLlm(["Hello ", "world"]);
        var fired = false;

        var deltas = await Drain(Session(new EchoTool()).StreamAsync(
            llm, Req(tools: true), Ctx(), () => fired = true, TestContext.Current.CancellationToken));

        Assert.Single(llm.Requests); // no second round
        Assert.False(fired);
        Assert.Equal("Hello world", string.Concat(deltas.Where(d => d.TextDelta != null).Select(d => d.TextDelta)));
    }

    [Fact]
    public async Task Stream_ToolCalls_DispatchesAndStreamsFollowUp()
    {
        var llm = new ScriptedLlm(
            [Call("session-echo", """{"x":1}""")],   // round 1: model requests a tool
            ["Grounded ", "answer"]);        // round 2: final answer
        var fired = false;

        var deltas = await Drain(Session(new EchoTool()).StreamAsync(
            llm, Req(tools: true), Ctx(), () => fired = true, TestContext.Current.CancellationToken));

        Assert.True(fired);
        Assert.Equal(2, llm.Requests.Count);
        // Tool plumbing is not client-visible — only text (+usage) deltas flow out.
        Assert.DoesNotContain(deltas, d => d.ToolCallDelta is not null);
        Assert.Equal("Grounded answer", string.Concat(deltas.Where(d => d.TextDelta != null).Select(d => d.TextDelta)));

        // Round 2 carries the assistant tool-call turn + the tool result, and NO tool schemas.
        var followUp = llm.Requests[1];
        Assert.Null(followUp.Tools);
        Assert.Equal("assistant", followUp.Messages[^2].Role);
        Assert.Equal("tool", followUp.Messages[^1].Role);
        Assert.Contains("echoed", followUp.Messages[^1].Content);
        Assert.Equal("call-1", followUp.Messages[^1].ToolCalls![0].Id);
    }

    [Fact]
    public async Task Stream_UnknownTool_FeedsErrorBackAsData()
    {
        var llm = new ScriptedLlm(
            [Call("nope")],
            ["Recovered"]);

        await Drain(Session(new EchoTool()).StreamAsync(
            llm, Req(tools: true), Ctx(), null, TestContext.Current.CancellationToken));

        var toolMsg = llm.Requests[1].Messages[^1];
        Assert.Equal("tool", toolMsg.Role);
        Assert.Contains("error", toolMsg.Content);
        Assert.Contains("Unknown tool", toolMsg.Content);
    }

    [Fact]
    public async Task Complete_NoToolCalls_ReturnsDirectAnswer()
    {
        var llm = new ScriptedLlm(["Direct answer"]);

        var (response, usedTools) = await Session(new EchoTool()).CompleteAsync(
            llm, Req(tools: true), Ctx(), TestContext.Current.CancellationToken);

        Assert.False(usedTools);
        Assert.Equal("Direct answer", response.Text);
        Assert.Single(llm.Requests);
    }

    [Fact]
    public async Task Complete_ToolCalls_RunsFollowUpAndFlagsUsedTools()
    {
        var llm = new ScriptedLlm(
            [Call("session-echo")],
            ["Grounded answer"]);

        var (response, usedTools) = await Session(new EchoTool()).CompleteAsync(
            llm, Req(tools: true), Ctx(), TestContext.Current.CancellationToken);

        Assert.True(usedTools);
        Assert.Equal("Grounded answer", response.Text);
        Assert.Null(llm.Requests[1].Tools);
    }

    [Fact]
    public void SerializeResult_OkRawJson_FailureErrorEnvelope()
    {
        var call = Call("session-echo");
        Assert.Equal("""{"a":1}""", ToolCallingSession.SerializeResult(
            ToolResult.Success(call, Json("""{"a":1}"""))));
        Assert.Contains("\"error\"", ToolCallingSession.SerializeResult(
            ToolResult.Failure(call, "boom")));
    }

    private static LlmRequest Req(bool tools) =>
        new("system", [new LlmMessage("user", "explain quorum")], 500,
            Tools: tools ? [new ToolSchema("session-echo", "echoes", AnySchema)] : null,
            FeatureTag: "explain");
}
