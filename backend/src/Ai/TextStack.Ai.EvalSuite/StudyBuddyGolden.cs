namespace TextStack.Ai.EvalSuite;

/// <summary>
/// One Study Buddy golden case (AI-039): a confusing passage (with its chapter for context) plus a
/// reference explanation the judge scores the agent's answer against. The passages target the eval
/// edition (DDIA); align <see cref="ChapterNumber"/> to that edition's numbering.
/// </summary>
public record StudyBuddyGolden(string Passage, int? ChapterNumber, string RubricAnswer);

/// <summary>Loads the embedded Study Buddy golden set (<c>studybuddy.json</c>).</summary>
public static class StudyBuddyGoldenSet
{
    public static IReadOnlyList<StudyBuddyGolden> Load() => GoldenLoader.Load<StudyBuddyGolden>("studybuddy.json");
}
