using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;
using TextStack.Ai.Tools;

namespace TextStack.UnitTests;

public class ToolDispatcherTests
{
    private static readonly JsonElement EchoSchema = JsonDocument.Parse("""
        {
          "type": "object",
          "properties": { "text": { "type": "string" }, "count": { "type": "integer", "minimum": 1 } },
          "required": ["text"],
          "additionalProperties": false
        }
        """).RootElement;

    private sealed class EchoTool : ITool
    {
        public string Name => "echo";
        public string Description => "echoes";
        public JsonElement ArgsSchema => EchoSchema;
        public Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct) =>
            Task.FromResult(args);
    }

    private sealed class BoomTool : ITool
    {
        public string Name => "boom";
        public string Description => "always fails";
        public JsonElement ArgsSchema => JsonDocument.Parse("""{"type":"object"}""").RootElement;
        public Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct) =>
            throw new InvalidOperationException("kaput");
    }

    private static ToolDispatcher Dispatcher(params ITool[] tools) => new(new ToolRegistry(tools));

    private static ToolContext Ctx() =>
        new(UserId: null, EditionId: null, AgentRunId: Guid.NewGuid(), new ServiceCollection().BuildServiceProvider());

    private static ToolCall Call(string tool, string argsJson) =>
        new("call-1", tool, JsonDocument.Parse(argsJson).RootElement);

    [Fact]
    public async Task Dispatch_ValidArgs_InvokesAndSucceeds()
    {
        var result = await Dispatcher(new EchoTool())
            .DispatchAsync(Call("echo", """{"text":"hi","count":2}"""), Ctx(), TestContext.Current.CancellationToken);

        Assert.True(result.Ok);
        Assert.Equal("hi", result.Result!.Value.GetProperty("text").GetString());
        Assert.Null(result.Error);
    }

    [Fact]
    public async Task Dispatch_UnknownTool_FailsAndListsAvailable()
    {
        var result = await Dispatcher(new EchoTool())
            .DispatchAsync(Call("nope", "{}"), Ctx(), TestContext.Current.CancellationToken);

        Assert.False(result.Ok);
        Assert.Contains("Unknown tool 'nope'", result.Error);
        Assert.Contains("echo", result.Error); // tells the model what IS available
    }

    [Theory]
    [InlineData("{}")]                          // missing required "text"
    [InlineData("""{"text": 42}""")]            // wrong type
    [InlineData("""{"text":"hi","count":0}""")] // below minimum
    [InlineData("""{"text":"hi","extra":1}""")] // additionalProperties: false
    public async Task Dispatch_InvalidArgs_FailsWithoutInvoking(string argsJson)
    {
        var result = await Dispatcher(new EchoTool())
            .DispatchAsync(Call("echo", argsJson), Ctx(), TestContext.Current.CancellationToken);

        Assert.False(result.Ok);
        Assert.StartsWith("Invalid arguments", result.Error);
    }

    [Fact]
    public async Task Dispatch_ToolThrows_BecomesFailureResult()
    {
        var result = await Dispatcher(new BoomTool())
            .DispatchAsync(Call("boom", "{}"), Ctx(), TestContext.Current.CancellationToken);

        Assert.False(result.Ok);
        Assert.Contains("kaput", result.Error);
    }

    [Fact]
    public async Task DispatchAll_RunsEveryCall_PreservesOrder()
    {
        var dispatcher = Dispatcher(new EchoTool(), new BoomTool());
        var results = await dispatcher.DispatchAllAsync(
            [Call("echo", """{"text":"a"}"""), Call("boom", "{}"), Call("missing", "{}")],
            Ctx(), TestContext.Current.CancellationToken);

        Assert.Equal(3, results.Length);
        Assert.True(results[0].Ok);
        Assert.False(results[1].Ok);
        Assert.False(results[2].Ok);
    }

    // ---- per-invocation DI scope (parallel tools must not share scoped services, e.g. DbContext) ----

    private sealed class ScopedMarker
    {
        public Guid Id { get; } = Guid.NewGuid();
    }

    private sealed class ScopeProbeTool : ITool
    {
        public string Name => "scope-probe";
        public string Description => "returns the scoped marker's id";
        public JsonElement ArgsSchema => JsonDocument.Parse("""{"type":"object"}""").RootElement;

        public Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct)
        {
            var marker = ctx.Services.GetRequiredService<ScopedMarker>();
            return Task.FromResult(JsonDocument.Parse($"\"{marker.Id}\"").RootElement);
        }
    }

    [Fact]
    public async Task DispatchAll_ParallelCalls_GetIsolatedScopes()
    {
        var services = new ServiceCollection();
        services.AddScoped<ScopedMarker>();
        using var root = services.BuildServiceProvider();
        using var requestScope = root.CreateScope(); // simulates the HTTP request scope tools run in
        var ctx = new ToolContext(null, null, Guid.NewGuid(), requestScope.ServiceProvider);

        var dispatcher = Dispatcher(new ScopeProbeTool());
        var results = await dispatcher.DispatchAllAsync(
            [Call("scope-probe", "{}"), new ToolCall("call-2", "scope-probe", JsonDocument.Parse("{}").RootElement)],
            ctx, TestContext.Current.CancellationToken);

        Assert.All(results, r => Assert.True(r.Ok));
        // Different scope per invocation → different scoped instances (no shared DbContext hazard).
        Assert.NotEqual(results[0].Result!.Value.GetString(), results[1].Result!.Value.GetString());
    }

    [Fact]
    public void ValidateArgs_Valid_ReturnsNull()
        => Assert.Null(ToolDispatcher.ValidateArgs(EchoSchema, JsonDocument.Parse("""{"text":"x"}""").RootElement));

    [Fact]
    public void ValidateArgs_Invalid_ReturnsReadableViolations()
    {
        var error = ToolDispatcher.ValidateArgs(EchoSchema, JsonDocument.Parse("{}").RootElement);
        Assert.NotNull(error);
        Assert.Contains("text", error); // names the offending property/requirement
    }
}
