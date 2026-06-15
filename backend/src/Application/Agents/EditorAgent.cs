using Application.Agents.Prompts;
using TextStack.Ai.Core;

namespace Application.Agents;

/// <summary>
/// Crew editor (AI-041): one gateway call that rewrites the draft fixing each critique issue (blockers first),
/// keeping the supported facts and staying within the brief's character bounds. Last link in the content crew.
/// </summary>
public sealed class EditorAgent(ILlmService llm) : SingleCallAgent<EditInput, Draft>(llm)
{
    protected override string FeatureTag => "crew.editor";
    protected override int MaxOutputTokens => 500;

    protected override (string system, string user) BuildPrompt(EditInput input) =>
        (EditorPrompt.BuildSystemPrompt(input.Brief),
         EditorPrompt.BuildUserPrompt(input.Draft, input.Critique));

    protected override Draft Parse(string text, EditInput input) => new(text.Trim());
}
