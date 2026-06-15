using Application.Agents.Prompts;
using TextStack.Ai.Core;

namespace Application.Agents;

/// <summary>
/// Crew drafter (AI-041): one gateway call that writes the requested field strictly from the research notes,
/// within the brief's character bounds and language. Stays groundable — the critic scores it against the notes.
/// </summary>
public sealed class DrafterAgent(ILlmService llm) : SingleCallAgent<DraftInput, Draft>(llm)
{
    protected override string FeatureTag => "crew.drafter";
    protected override int MaxOutputTokens => 500;

    protected override (string system, string user) BuildPrompt(DraftInput input) =>
        (DrafterPrompt.BuildSystemPrompt(input.Brief),
         DrafterPrompt.BuildUserPrompt(input.Research));

    protected override Draft Parse(string text, DraftInput input) => new(text.Trim());
}
