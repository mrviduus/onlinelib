using Worker.Services;

namespace TextStack.UnitTests;

public class PodcastScriptParseTests
{
    [Fact]
    public void ParseScript_ValidArray_ReturnsTurns()
    {
        var raw = """[{"speaker":"Aria","line":"Hi there!"},{"speaker":"Guy","line":"Hello."}]""";
        var r = PodcastScriptBuilder.ParseScript(raw);
        Assert.NotNull(r);
        Assert.Equal(2, r!.Count);
        Assert.Equal("Aria", r[0].Speaker);
        Assert.Equal("Hi there!", r[0].Line);
        Assert.Equal("Guy", r[1].Speaker);
    }

    [Fact]
    public void ParseScript_FencedAndProseWrapped_StillParses()
    {
        var raw = "Sure! Here is the script:\n```json\n" +
                  "[{\"speaker\":\"Aria\",\"line\":\"A\"},{\"speaker\":\"Guy\",\"line\":\"B\"}]\n```\nEnjoy.";
        var r = PodcastScriptBuilder.ParseScript(raw);
        Assert.NotNull(r);
        Assert.Equal(2, r!.Count);
    }

    [Fact]
    public void ParseScript_CanonicalizesSpeakerCasing()
    {
        var raw = """[{"speaker":"aria","line":"x"},{"speaker":"GUY","line":"y"}]""";
        var r = PodcastScriptBuilder.ParseScript(raw)!;
        Assert.Equal("Aria", r[0].Speaker);
        Assert.Equal("Guy", r[1].Speaker);
    }

    [Fact]
    public void ParseScript_FiltersEmptyLinesAndForeignSpeakers()
    {
        var raw = """[{"speaker":"Aria","line":"keep"},{"speaker":"Narrator","line":"drop"},{"speaker":"Guy","line":"  "}]""";
        var r = PodcastScriptBuilder.ParseScript(raw)!;
        Assert.Single(r);
        Assert.Equal("keep", r[0].Line);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("no json at all")]
    [InlineData("{\"speaker\":\"Aria\",\"line\":\"x\"}")]      // object, not an array
    [InlineData("[{\"speaker\":\"Narrator\",\"line\":\"x\"}]")] // all foreign speakers → nothing usable
    [InlineData("[broken json")]
    public void ParseScript_Unusable_ReturnsNull(string raw)
    {
        Assert.Null(PodcastScriptBuilder.ParseScript(raw));
    }
}
