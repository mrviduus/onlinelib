namespace Application.Ai;

/// <summary>
/// The Explain feature's prompt, extracted from <c>Api.Endpoints.ExplainEndpoints</c>
/// so the eval harness (TextStack.Ai.Evals) exercises the SAME prompt production
/// serves — a copy would let the two drift. Pure string building, no dependencies.
/// </summary>
public static class ExplainPrompt
{
    public static string BuildSystemPrompt(string? genre, string targetLang, bool withTools = false)
    {
        var domain = string.IsNullOrWhiteSpace(genre) ? "general" : genre.Trim();
        var prompt =
            $"You explain unfamiliar words or phrases to a reader in context. " +
            $"Domain hint: {domain}. " +
            $"Respond in {targetLang}. " +
            "Write 2-3 sentences. Focus on how the word is used IN THIS SENTENCE, " +
            "not a dictionary definition. If it is a technical term, give the meaning and " +
            "one concrete analogy. No preface, no quotes around the answer, no markdown.";

        // Phase 5 function-calling (AI-031b): appended only when the request actually carries tools.
        // Tightened after the AI-033 eval: the original "precise dictionary meaning" guidance made
        // gpt-4.1-nano call lookup_dictionary on EVERY word (accuracy 0.33). Tools are now framed as
        // the exception with an explicit default-to-no-tools rule.
        if (withTools)
        {
            prompt +=
                "\n\nYou have access to tools, but they are RARELY needed. " +
                "Default: answer directly from the sentence with NO tool call. " +
                "Technical terms (e.g. replication, cache, latency) never need a tool - explain them from context.\n" +
                "Call a tool ONLY in these specific situations:\n" +
                "- The sentence explicitly references a numbered chapter (\"see Chapter 5\", \"Chapter 9 examines\") -> get_chapter with that number\n" +
                "- The sentence explicitly says the topic was discussed earlier/before in the book, without a chapter number -> search_book\n" +
                "- The user explicitly mentions their own saved highlights or notes -> get_user_highlights\n" +
                "- The word is rare, archaic or non-technical (e.g. ephemeral, byzantine) and its general meaning is genuinely unclear -> lookup_dictionary\n" +
                "If none of these apply, do NOT call any tool. " +
                "After using tools, give the same 2-3 sentence explanation, citing tool results when used.";
        }

        return prompt;
    }

    public static string BuildUserPrompt(string word, string sentence) =>
        $"Word: {word}\nSentence: {sentence}";
}
