using Microsoft.Extensions.AI;
using TextStack.Ai.Core;
using TextStack.Ai.Llm;

namespace TextStack.AiEvals;

/// <summary>
/// Deterministic mapping tests for the <see cref="LlmServiceChatClient"/> adapter —
/// no provider needed, so these always run (not skipped like the live evals).
/// Captures the seam contract: system messages collapse into SystemPrompt, the rest
/// keep their role, FeatureTag flows from ChatOptions, usage/model round-trip back.
/// </summary>
public class LlmServiceChatClientTests
{
    /// <summary>Records the request it was handed and replays a canned response.</summary>
    private sealed class CapturingLlmService(LlmResponse response) : ILlmService
    {
        public LlmRequest? Captured { get; private set; }

        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            Captured = request;
            return Task.FromResult(response);
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    private static LlmResponse Canned(string text = "hello") =>
        new(text, [], new LlmUsage(11, 22, 0m), "gemma4:e4b", Guid.NewGuid());

    [Fact]
    public async Task GetResponseAsync_collapses_system_and_maps_messages()
    {
        var inner = new CapturingLlmService(Canned());
        var client = new LlmServiceChatClient(inner);

        await client.GetResponseAsync([
            new ChatMessage(ChatRole.System, "sys-a"),
            new ChatMessage(ChatRole.System, "sys-b"),
            new ChatMessage(ChatRole.User, "u1"),
            new ChatMessage(ChatRole.Assistant, "a1"),
        ], cancellationToken: TestContext.Current.CancellationToken);

        var req = inner.Captured!;
        Assert.Equal("sys-a\n\nsys-b", req.SystemPrompt);
        Assert.Collection(req.Messages,
            m => { Assert.Equal("user", m.Role); Assert.Equal("u1", m.Content); },
            m => { Assert.Equal("assistant", m.Role); Assert.Equal("a1", m.Content); });
    }

    [Fact]
    public async Task GetResponseAsync_maps_response_text_model_and_usage()
    {
        var inner = new CapturingLlmService(Canned("the answer"));
        var client = new LlmServiceChatClient(inner);

        var resp = await client.GetResponseAsync(
            [new ChatMessage(ChatRole.User, "q")],
            cancellationToken: TestContext.Current.CancellationToken);

        Assert.Equal("the answer", resp.Text);
        Assert.Equal("gemma4:e4b", resp.ModelId);
        Assert.Equal(11, resp.Usage?.InputTokenCount);
        Assert.Equal(22, resp.Usage?.OutputTokenCount);
    }

    [Fact]
    public async Task FeatureTag_comes_from_options_then_falls_back_to_default()
    {
        var inner = new CapturingLlmService(Canned());
        var client = new LlmServiceChatClient(inner, defaultFeatureTag: "eval.judge", defaultMaxOutputTokens: 300);
        var ct = TestContext.Current.CancellationToken;

        // default when no override
        await client.GetResponseAsync([new ChatMessage(ChatRole.User, "x")], cancellationToken: ct);
        Assert.Equal("eval.judge", inner.Captured!.FeatureTag);
        Assert.Equal(300, inner.Captured!.MaxOutputTokens);

        // override via AdditionalProperties + explicit MaxOutputTokens
        var options = new ChatOptions
        {
            MaxOutputTokens = 600,
            AdditionalProperties = new() { [LlmServiceChatClient.FeatureTagKey] = "explain" },
        };
        await client.GetResponseAsync([new ChatMessage(ChatRole.User, "x")], options, ct);
        Assert.Equal("explain", inner.Captured!.FeatureTag);
        Assert.Equal(600, inner.Captured!.MaxOutputTokens);
    }
}
