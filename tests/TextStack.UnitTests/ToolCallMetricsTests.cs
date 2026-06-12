using System.Text.Json;
using TextStack.Ai.Core;
using TextStack.Ai.Tools;

namespace TextStack.UnitTests;

public class ToolCallMetricsTests
{
    private static ToolCall Call(string name, string argsJson = "{}") =>
        new("c1", name, JsonDocument.Parse(argsJson).RootElement);

    private static Dictionary<string, string> Frag(string arg, string fragment) => new() { [arg] = fragment };

    [Fact]
    public void IsHit_NoToolExpected_NoCalls_True()
        => Assert.True(ToolCallMetrics.IsHit([], expectedTool: null, expectedArgFragments: null));

    [Fact]
    public void IsHit_NoToolExpected_ButCalled_False()
        => Assert.False(ToolCallMetrics.IsHit([Call("lookup_dictionary")], null, null));

    [Fact]
    public void IsHit_ExpectedTool_Called_True()
        => Assert.True(ToolCallMetrics.IsHit([Call("get_chapter")], "get_chapter", null));

    [Fact]
    public void IsHit_ExpectedTool_NotCalled_False()
        => Assert.False(ToolCallMetrics.IsHit([], "get_chapter", null));

    [Fact]
    public void IsHit_WrongTool_False()
        => Assert.False(ToolCallMetrics.IsHit([Call("search_book")], "get_chapter", null));

    [Fact]
    public void IsHit_ExtraParallelCall_StillHits()
        => Assert.True(ToolCallMetrics.IsHit(
            [Call("lookup_dictionary"), Call("get_chapter", """{"chapter_number":5}""")],
            "get_chapter", Frag("chapter_number", "5")));

    [Fact]
    public void IsHit_ArgFragment_StringContains_CaseInsensitive()
        => Assert.True(ToolCallMetrics.IsHit(
            [Call("search_book", """{"query":"the Write Amplification effect"}""")],
            "search_book", Frag("query", "write amplification")));

    [Fact]
    public void IsHit_ArgFragment_NumberMatchedViaRawText()
        => Assert.True(ToolCallMetrics.IsHit(
            [Call("get_chapter", """{"chapter_number":7}""")],
            "get_chapter", Frag("chapter_number", "7")));

    [Fact]
    public void IsHit_ArgFragment_Missing_False()
        => Assert.False(ToolCallMetrics.IsHit(
            [Call("search_book", """{"query":"something else"}""")],
            "search_book", Frag("query", "read repair")));

    [Fact]
    public void IsHit_ArgProperty_Absent_False()
        => Assert.False(ToolCallMetrics.IsHit(
            [Call("get_chapter", "{}")],
            "get_chapter", Frag("chapter_number", "5")));

    [Fact]
    public void Accuracy_Fraction_And_EmptyVacuouslyOne()
    {
        Assert.Equal(0.75, ToolCallMetrics.Accuracy([true, true, true, false]), 12);
        Assert.Equal(1.0, ToolCallMetrics.Accuracy([]));
    }
}
