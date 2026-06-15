using Application.Agents.Prompts;
using TextStack.Ai.Core;

namespace Application.Agents;

/// <summary>
/// Crew critic (AI-041): one gateway call that scores the draft 1-5 on four axes against the research notes
/// and lists actionable issues. Grounds factual accuracy on the notes (unsupported claims = blockers) and
/// fails closed if its JSON can't be parsed — see <see cref="CriticOutputParser"/>.
/// </summary>
public sealed class CriticAgent(ILlmService llm) : SingleCallAgent<CritiqueInput, CritiqueResult>(llm)
{
    protected override string FeatureTag => "crew.critic";
    protected override int MaxOutputTokens => 700;

    protected override (string system, string user) BuildPrompt(CritiqueInput input) =>
        (CriticPrompt.BuildSystemPrompt(input.Brief),
         CriticPrompt.BuildUserPrompt(input.Draft, input.Research));

    protected override CritiqueResult Parse(string text, CritiqueInput input) => CriticOutputParser.Parse(text);
}
