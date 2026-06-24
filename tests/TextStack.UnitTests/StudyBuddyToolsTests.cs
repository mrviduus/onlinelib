using System.Text.Json;
using Application.Tools;
using Microsoft.Extensions.DependencyInjection;
using TextStack.Ai.Core;
using TextStack.Ai.Tools;

namespace TextStack.UnitTests;

/// <summary>
/// AI-035 — the three Study Buddy tools, at the level testable without a DB: schema validity through
/// the same validator the dispatcher uses, and the single canonical assertion that the assembly scan
/// registers EXACTLY the expected Application tool set. DB behaviour (EF queries, RAG retrieval) is
/// exercised in AI-037 + e2e.
/// </summary>
public class StudyBuddyToolsTests
{
    /// <summary>
    /// The one place that lists every tool the Application assembly is expected to register. Adding a
    /// tool is a deliberate change to this allow-list; the set-equality assertion below then catches
    /// both a missing tool AND a stray one, with a readable diff — no magic count to drift.
    /// </summary>
    private static readonly string[] AllApplicationTools =
    [
        "get_chapter", "search_book", "lookup_dictionary", "get_user_highlights",
        "find_earlier_definition", "get_chapter_summary", "get_user_vocabulary",
        // AI-Agent-1 enrichment tools.
        "search_open_library", "get_open_library_work",
        // AI-Agent-3 librarian library-search tools.
        "search_library", "search_library_semantic",
        // AI-Agent-2 tutor tools.
        "get_due_vocabulary", "get_weak_vocabulary", "get_reading_context", "get_example_sentence",
    ];

    private static JsonElement Args(string json) => JsonDocument.Parse(json).RootElement;

    [Fact]
    public void AddAiTools_ScanningApplication_RegistersExactlyTheExpectedTools()
    {
        var services = new ServiceCollection();
        services.AddAiTools(typeof(GetChapterTool).Assembly);

        using var sp = services.BuildServiceProvider();
        var registry = sp.GetRequiredService<IToolRegistry>();

        Assert.Equal(
            AllApplicationTools.OrderBy(n => n),
            registry.Names.OrderBy(n => n)); // missing or stray tool → readable diff
    }

    [Theory]
    [InlineData(typeof(FindEarlierDefinitionTool), """{"term": "quorum"}""", """{}""")]
    [InlineData(typeof(GetChapterSummaryTool), """{"chapter_number": 5}""", """{"chapter_number": 0}""")]
    [InlineData(typeof(GetUserVocabularyTool), """{"query": "lsm", "limit": 10}""", """{"limit": 99}""")]
    [InlineData(typeof(GetDueVocabularyTool), """{"limit": 10}""", """{"limit": 99}""")]
    [InlineData(typeof(GetWeakVocabularyTool), """{"limit": 10}""", """{"limit": 0}""")]
    [InlineData(typeof(GetReadingContextTool), """{"days": 7}""", """{"days": 999}""")]
    [InlineData(typeof(GetExampleSentenceTool), """{"wordId": "abc"}""", """{}""")]
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
    [InlineData(typeof(GetDueVocabularyTool))]
    [InlineData(typeof(GetWeakVocabularyTool))]
    [InlineData(typeof(GetReadingContextTool))]
    [InlineData(typeof(GetExampleSentenceTool))]
    public void ArgsSchema_RejectsUnknownProperties(Type toolType)
    {
        var tool = (ITool)Activator.CreateInstance(toolType)!;
        Assert.NotNull(ToolDispatcher.ValidateArgs(tool.ArgsSchema, Args("""{"hallucinated_arg": true}""")));
    }
}
