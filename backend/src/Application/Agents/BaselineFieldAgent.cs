using Application.Agents.Prompts;
using TextStack.Ai.Core;

namespace Application.Agents;

/// <summary>
/// The single-call A/B baseline (AI-046): ONE <see cref="ILlmService"/> gateway call that writes the requested
/// field directly from the source, with the brief's FULL contract folded into the system prompt. It is the "A"
/// arm of the crew-vs-single-call eval — the "B" arm is the full <see cref="FieldCrew"/>. Both run the SAME
/// generator model (nano) and are judged by the SAME rubric, so the eval measures only what orchestration buys.
///
/// FeatureTag <c>crew.baseline</c> (distinct from the crew's <c>crew.drafter</c>/<c>crew.editor</c> tags so the
/// A and B calls route + trace separately). Token budget mirrors the drafter's (500): one prose field of the
/// same size. Parse is the same trim the drafter/editor use — fail-closed via <see cref="Draft"/>.
/// </summary>
public sealed class BaselineFieldAgent(ILlmService llm) : SingleCallAgent<BaselineInput, Draft>(llm)
{
    protected override string FeatureTag => "crew.baseline";
    protected override int MaxOutputTokens => 500;

    protected override (string system, string user) BuildPrompt(BaselineInput input) =>
        (BaselineFieldPrompt.BuildSystemPrompt(input.Brief),
         BaselineFieldPrompt.BuildUserPrompt(input.SourceMaterial));

    protected override Draft Parse(string text, BaselineInput input) => new(text.Trim());
}
