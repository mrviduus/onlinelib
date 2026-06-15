using Application.Ai;
using TextStack.Ai.EvalSuite;

namespace TextStack.UnitTests;

/// <summary>
/// AI-039 — the shared deterministic detector behind both the Explain pre-router and the Study Buddy
/// per-run tool gate. Every Study Buddy golden passage is self-contained, so it must detect nothing
/// (the floor that stops the agent over-calling on them by construction); positive wordings must light
/// up exactly their flag, and a combined sentence ORs them.
/// </summary>
public class BookToolTriggersTests
{
    [Fact]
    public void Detect_EveryStudyBuddyGolden_IsNone()
    {
        var goldens = StudyBuddyGoldenSet.Load();
        Assert.NotEmpty(goldens);
        Assert.All(goldens, g => Assert.Equal(BookToolSignal.None, BookToolTriggers.Detect(g.Passage)));
    }

    [Theory]
    [InlineData("As we saw in Chapter 5, this builds on earlier ideas.")]
    [InlineData("Chapter 9 examines linearizability in depth.")]
    public void Detect_ChapterNumberWording_FlagsChapterNumber(string text) =>
        Assert.True(BookToolTriggers.Detect(text).HasFlag(BookToolSignal.ChapterNumber));

    [Theory]
    [InlineData("As we discussed earlier, quorums overlap.")]
    [InlineData("This was mentioned before in the context of replication.")]
    public void Detect_EarlierReferenceWording_FlagsEarlierReference(string text) =>
        Assert.True(BookToolTriggers.Detect(text).HasFlag(BookToolSignal.EarlierReference));

    [Theory]
    [InlineData("Compare this with my highlights from the last chapter.")]
    [InlineData("I marked a similar passage about this earlier.")]
    [InlineData("Connect it to my notes on storage engines.")]
    public void Detect_HighlightsWording_FlagsUserHighlights(string text) =>
        Assert.True(BookToolTriggers.Detect(text).HasFlag(BookToolSignal.UserHighlights));

    [Fact]
    public void Detect_CombinedWording_OrsEveryMatchedFlag()
    {
        const string text =
            "In Chapter 5 we discussed this earlier; compare it to my highlights on the topic.";
        var signal = BookToolTriggers.Detect(text);
        Assert.True(signal.HasFlag(BookToolSignal.ChapterNumber));
        Assert.True(signal.HasFlag(BookToolSignal.EarlierReference));
        Assert.True(signal.HasFlag(BookToolSignal.UserHighlights));
    }

    [Theory]
    [InlineData("Serializable snapshot isolation is an optimistic concurrency control technique.")]
    [InlineData("This was a long chapter about many things.")] // "chapter" without a number
    [InlineData("Earlier adopters of NoSQL hit this problem.")] // "earlier" without discussed/mentioned
    public void Detect_PlainTechnicalSentence_IsNone(string text) =>
        Assert.Equal(BookToolSignal.None, BookToolTriggers.Detect(text));

    // AI-039 QA P3 — "earlier"/"previously" co-occurring with a high-frequency verb in a SELF-CONTAINED
    // sentence (no cross-reference intent) must NOT light up EarlierReference. The discuss-verb and the
    // temporal token are too far apart, or separated by a noun phrase, to be a real "discussed earlier".
    [Theory]
    [InlineData("Earlier adopters of NoSQL covered their bets.")] // temporal → verb across a noun phrase
    [InlineData("The earlier benchmark mentioned a slow node.")] // temporal → noun → verb
    [InlineData("I covered the topic earlier today.")] // bare "covered" not adjacent to the temporal token
    public void Detect_SelfContainedSentenceWithEarlierAndVerb_IsNone(string text) =>
        Assert.Equal(BookToolSignal.None, BookToolTriggers.Detect(text));
}
