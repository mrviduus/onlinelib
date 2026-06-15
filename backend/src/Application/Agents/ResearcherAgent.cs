using Application.Agents.Prompts;
using TextStack.Ai.Core;

namespace Application.Agents;

/// <summary>
/// Crew researcher (AI-041): one gateway call that condenses the source material into grounded bullet facts.
/// First link in the content crew — its notes are what every later specialist writes from and is scored against.
/// </summary>
public sealed class ResearcherAgent(ILlmService llm) : SingleCallAgent<ResearchInput, ResearchNotes>(llm)
{
    protected override string FeatureTag => "crew.researcher";
    protected override int MaxOutputTokens => 600;

    protected override (string system, string user) BuildPrompt(ResearchInput input) =>
        (ResearcherPrompt.BuildSystemPrompt(input.Brief),
         ResearcherPrompt.BuildUserPrompt(input.SourceMaterial));

    protected override ResearchNotes Parse(string text, ResearchInput input) => new(text.Trim());
}
