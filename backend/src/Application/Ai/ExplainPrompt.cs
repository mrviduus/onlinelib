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
        // Tightened after the AI-033 eval (tools as the exception, explicit no-tool default);
        // lookup_dictionary was dropped from the Explain set entirely — nano reached for it on
        // every word, and a dictionary inside an explainer is circular for this audience.
        if (withTools)
        {
            prompt +=
                "\n\nYou have access to tools, but they are RARELY needed. " +
                "Default: answer directly from the sentence with NO tool call. " +
                "Words and terms never need a tool by themselves - explain them from context.\n" +
                "Call a tool ONLY in these specific situations:\n" +
                "- The sentence explicitly references a numbered chapter (\"see Chapter 5\", \"Chapter 9 examines\") -> get_chapter with that number\n" +
                "- The sentence explicitly says the topic was discussed earlier/before in the book, without a chapter number -> search_book\n" +
                "- The user explicitly mentions their own saved highlights or notes -> get_user_highlights\n" +
                "If none of these apply, do NOT call any tool. " +
                "After using tools, give the same 2-3 sentence explanation, citing tool results when used.";
        }

        return prompt;
    }

    public static string BuildUserPrompt(string word, string sentence) =>
        $"Word: {word}\nSentence: {sentence}";
}
