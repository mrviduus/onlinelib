using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;
using TextStack.Ai.Tools;

namespace TextStack.UnitTests;

public class ToolRegistryTests
{
    private static readonly JsonElement EmptySchema = JsonDocument.Parse("""{"type":"object"}""").RootElement;

    // A parameterless ctor (default name) keeps this DI-constructible, so assembly scanning can
    // instantiate it; the (name, description) ctor is for the direct-construction registry tests.
    private sealed class FakeTool(string name, string description = "desc") : ITool
    {
        public FakeTool() : this("fake-default") { }
        public string Name => name;
        public string Description => description;
        public JsonElement ArgsSchema => EmptySchema;
        public Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct) =>
            Task.FromResult(args);
    }

    // A second concrete, parameterless tool so the scan has a distinct type to discover.
    private sealed class AlphaTool : ITool
    {
        public string Name => "alpha";
        public string Description => "the alpha tool";
        public JsonElement ArgsSchema => EmptySchema;
        public Task<JsonElement> InvokeAsync(JsonElement args, ToolContext ctx, CancellationToken ct) =>
            Task.FromResult(args);
    }

    // ---- ToolRegistry ----

    [Fact]
    public void Get_ReturnsToolByName_NullWhenUnknown()
    {
        var registry = new ToolRegistry([new FakeTool("get_chapter"), new FakeTool("search_book")]);
        Assert.Equal("get_chapter", registry.Get("get_chapter")!.Name);
        Assert.Null(registry.Get("missing"));
    }

    [Fact]
    public void Get_IsCaseSensitive()
    {
        var registry = new ToolRegistry([new FakeTool("get_chapter")]);
        Assert.Null(registry.Get("Get_Chapter"));
    }

    [Fact]
    public void Ctor_DuplicateName_Throws()
    {
        var ex = Assert.Throws<InvalidOperationException>(
            () => new ToolRegistry([new FakeTool("dup"), new FakeTool("dup")]));
        Assert.Contains("dup", ex.Message);
    }

    [Fact]
    public void Ctor_BlankName_Throws()
        => Assert.Throws<InvalidOperationException>(() => new ToolRegistry([new FakeTool("  ")]));

    [Fact]
    public void SchemasFor_FiltersToKnown_DedupsAndPreservesOrder()
    {
        var registry = new ToolRegistry([new FakeTool("a"), new FakeTool("b"), new FakeTool("c")]);
        var schemas = registry.SchemasFor(["b", "missing", "a", "b"]);
        Assert.Equal(new[] { "b", "a" }, schemas.Select(s => s.Name));
    }

    [Fact]
    public void AllSchemas_And_Names_CoverEveryTool()
    {
        var registry = new ToolRegistry([new FakeTool("a", "first"), new FakeTool("b", "second")]);
        Assert.Equal(2, registry.AllSchemas().Count);
        Assert.Contains(registry.AllSchemas(), s => s is { Name: "a", Description: "first" });
        Assert.Equal(new[] { "a", "b" }, registry.Names.OrderBy(n => n));
    }

    // ---- AddAiTools (scan + register) ----

    [Fact]
    public void AddAiTools_ScansAssembly_RegistersConcreteToolsAndRegistry()
    {
        var services = new ServiceCollection();
        services.AddAiTools(typeof(AlphaTool).Assembly);

        using var sp = services.BuildServiceProvider();
        var registry = sp.GetRequiredService<IToolRegistry>();

        // Both parameterless ITool types in this assembly are discovered + DI-constructed.
        Assert.NotNull(registry.Get("alpha"));
        Assert.NotNull(registry.Get("fake-default"));
    }

    [Fact]
    public void AddAiTools_CalledTwice_IsIdempotent()
    {
        var services = new ServiceCollection();
        services.AddAiTools(typeof(AlphaTool).Assembly);
        services.AddAiTools(typeof(AlphaTool).Assembly); // must not double-register → no duplicate-name throw

        using var sp = services.BuildServiceProvider();
        var registry = sp.GetRequiredService<IToolRegistry>(); // ToolRegistry ctor would throw on a dup type/name
        Assert.NotNull(registry.Get("alpha"));
    }
}
