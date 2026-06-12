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
        if (withTools)
        {
            prompt +=
                "\n\nYou have access to tools. Use them when:\n" +
                "- The sentence references \"see chapter X\" or \"earlier we discussed\" -> call get_chapter or search_book\n" +
                "- The word may be defined elsewhere in the user's saved highlights -> call get_user_highlights\n" +
                "- The word has a precise dictionary meaning relevant to the explanation -> call lookup_dictionary\n" +
                "Most words need NO tools - answer directly. " +
                "After using tools, give the same 2-3 sentence explanation, citing tool results when used.";
        }

        return prompt;
    }

    public static string BuildUserPrompt(string word, string sentence) =>
        $"Word: {word}\nSentence: {sentence}";
}
