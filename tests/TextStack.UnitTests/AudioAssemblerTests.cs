using Worker.Services;

namespace TextStack.UnitTests;

public class AudioAssemblerTests
{
    [Theory]
    [InlineData("Aria", "en-US-AriaNeural")]
    [InlineData("aria", "en-US-AriaNeural")]
    [InlineData("Guy", "en-US-GuyNeural")]
    [InlineData("Narrator", "en-US-GuyNeural")] // anyone else → Guy
    public void VoiceFor_MapsSpeakerToEdgeVoice(string speaker, string expected)
        => Assert.Equal(expected, AudioAssembler.VoiceFor(speaker));

    [Fact]
    public void BuildConcatFileContent_FormatsAndEscapesQuotes()
    {
        var content = AudioAssembler.BuildConcatFileContent(["/tmp/a.mp3", "/tmp/o'brien.mp3"]);
        Assert.Equal("file '/tmp/a.mp3'\nfile '/tmp/o'\\''brien.mp3'", content);
    }

    [Theory]
    [InlineData(48000, 8)] // 48 kbit/s → 48000 bytes = 8 s
    [InlineData(0, 0)]
    [InlineData(6000, 1)]
    public void EstimateDurationSeconds_FromBitrate(long bytes, int expected)
        => Assert.Equal(expected, AudioAssembler.EstimateDurationSeconds(bytes));
}
