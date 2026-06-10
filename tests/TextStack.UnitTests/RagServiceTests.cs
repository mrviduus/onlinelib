using System.Globalization;
using TextStack.Ai.Rag;

namespace TextStack.UnitTests;

public class RagServiceTests
{
    [Fact]
    public void FormatVector_Integers_BracketedCommaJoined()
        => Assert.Equal("[1,2,3]", RagService.FormatVector(new[] { 1f, 2f, 3f }));

    [Fact]
    public void FormatVector_Decimals_PreservesValues()
        => Assert.Equal("[0.5,-0.25,1.5]", RagService.FormatVector(new[] { 0.5f, -0.25f, 1.5f }));

    [Fact]
    public void FormatVector_Empty_EmptyBrackets()
        => Assert.Equal("[]", RagService.FormatVector(Array.Empty<float>()));

    [Fact]
    public void FormatVector_Single_NoTrailingComma()
        => Assert.Equal("[42]", RagService.FormatVector(new[] { 42f }));

    [Fact]
    public void FormatVector_CommaDecimalCulture_StillUsesDot()
    {
        // A locale that writes decimals with a comma must NOT corrupt the pgvector literal.
        var original = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = new CultureInfo("de-DE");
            Assert.Equal("[0.5,1.25]", RagService.FormatVector(new[] { 0.5f, 1.25f }));
        }
        finally
        {
            CultureInfo.CurrentCulture = original;
        }
    }
}
