using System.Text.Json;
using Application.Tools;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;
using TextStack.Ai.Tools;

namespace TextStack.UnitTests;

/// <summary>
/// AI-035 — the three Study Buddy tools, at the level testable without a DB: discovery via the
/// assembly scan (now seven Application tools), and schema validity through the same validator the
/// dispatcher uses. DB behaviour (EF queries, RAG retrieval) is exercised in AI-037 + e2e.
/// </summary>
public class StudyBuddyToolsTests
{
    private static readonly string[] AllApplicationTools =
    [
        "get_chapter", "search_book", "lookup_dictionary", "get_user_highlights",
        "find_earlier_definition", "get_chapter_summary", "get_user_vocabulary",
    ];

    private static JsonElement Args(string json) => JsonDocument.Parse(json).RootElement;

    [Fact]
    public void AddAiTools_ScanningApplication_DiscoversAllSevenTools()
    {
        var services = new ServiceCollection();
        services.AddAiTools(typeof(GetChapterTool).Assembly);

        using var sp = services.BuildServiceProvider();
        var registry = sp.GetRequiredService<IToolRegistry>();

        foreach (var name in AllApplicationTools)
            Assert.NotNull(registry.Get(name));
        Assert.Equal(AllApplicationTools.Length, registry.Names.Count);
    }

    [Theory]
    [InlineData(typeof(FindEarlierDefinitionTool), """{"term": "quorum"}""", """{}""")]
    [InlineData(typeof(GetChapterSummaryTool), """{"chapter_number": 5}""", """{"chapter_number": 0}""")]
    [InlineData(typeof(GetUserVocabularyTool), """{"query": "lsm", "limit": 10}""", """{"limit": 99}""")]
    public void ArgsSchema_AcceptsHappyPath_RejectsMalformed(Type toolType, string goodArgs, string badArgs)
    {
        var tool = (ITool)Activator.CreateInstance(toolType)!;

        Assert.Null(ToolDispatcher.ValidateArgs(tool.ArgsSchema, Args(goodArgs)));
        Assert.NotNull(ToolDispatcher.ValidateArgs(tool.ArgsSchema, Args(badArgs)));
    }

    [Theory]
    [InlineData(typeof(FindEarlierDefinitionTool))]
    [InlineData(typeof(GetChapterSummaryTool))]
    [InlineData(typeof(GetUserVocabularyTool))]
    public void ArgsSchema_RejectsUnknownProperties(Type toolType)
    {
        var tool = (ITool)Activator.CreateInstance(toolType)!;
        Assert.NotNull(ToolDispatcher.ValidateArgs(tool.ArgsSchema, Args("""{"hallucinated_arg": true}""")));
    }
}
