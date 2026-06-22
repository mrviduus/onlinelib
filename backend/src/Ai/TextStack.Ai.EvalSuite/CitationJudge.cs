using Application.Rag;
using Domain.Entities;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.AI.Evaluation;
using TextStack.Ai.Core;
using TextStack.Ai.Evals;
using TextStack.Ai.Llm;
using TextStack.Ai.Rag;

namespace TextStack.Ai.EvalSuite;

/// <summary>
/// Shared citation-correctness machinery for the RAG evals (AI-027b + user-book P1). Both the catalog
/// <see cref="RagEvalRunner"/> and the <see cref="UserBookRagEvalRunner"/> call ONE copy of the judge
/// rubric + scoring + the <see cref="EvalRun"/> row factory, so the support metric never forks. The
/// "support" axis MUST stay Dim1 — SupportRate reads <see cref="JudgeScore.D1"/>.
/// </summary>
internal static class CitationJudge
{
    internal const string CitationFeature = "rag.citation";
    internal const int SupportPassThreshold = 4; // judge ≥4/5 on the support axis = a correct citation
    internal const string NoJudge = "n/a";

    internal static readonly Rubric Rubric = new(
        "support: does the cited excerpt actually contain or directly imply the specific claim it is attached to?",
        "relevance: is the excerpt genuinely on-topic for the answer, not a loosely-related passage?",
        "faithfulness: does the answer avoid asserting anything the cited excerpts do not support (no outside knowledge)?");

    private static readonly ChatMessage[] JudgePlaceholderMessages = [new ChatMessage(ChatRole.User, string.Empty)];

    /// <summary>
    /// Generates a grounded answer per question (over its already-retrieved chunks) and judges each
    /// citation against the FULL text of the excerpt it points to. Returns the mean 1–5 score and the
    /// support rate (citations scored ≥<see cref="SupportPassThreshold"/> on the support axis). Shared
    /// verbatim by both runners.
    /// </summary>
    internal static async Task<RagCitationSummary> JudgeCitationsAsync(
        IRagAskService ask,
        ILlmService judge,
        IReadOnlyList<(string Question, IReadOnlyList<RetrievedChunk> Chunks)> retrieved,
        CancellationToken ct)
    {
        var chatConfig = new ChatConfiguration(new LlmServiceChatClient(judge, defaultFeatureTag: "eval.judge"));
        var scores = new List<JudgeScore>();
        var supported = 0;
        var answersGenerated = 0;

        foreach (var (question, chunks) in retrieved)
        {
            ct.ThrowIfCancellationRequested();
            // lastReadOrd is irrelevant here — chunks are supplied directly (no user gating).
            var answer = await ask.AskFromChunksAsync(question, chunks, [], [], lastReadOrd: int.MaxValue, ct);
            if (answer.Insufficient || answer.Citations.Count == 0)
                continue;
            answersGenerated++;

            foreach (var cited in answer.Citations)
            {
                ct.ThrowIfCancellationRequested();
                var evidence =
                    $"Question: {question}\n\nAnswer:\n{answer.Answer}\n\n" +
                    $"Cited excerpt [{cited.Marker}] (the answer attributes a claim to this passage):\n{cited.Chunk.Text}";

                var evaluator = new RubricEvaluator(CitationFeature, Rubric);
                var result = await evaluator.EvaluateAsync(
                    JudgePlaceholderMessages,
                    new ChatResponse(new ChatMessage(ChatRole.Assistant, answer.Answer)),
                    chatConfig, [new RubricEvidenceContext(evidence)], ct);

                var score = new JudgeScore(
                    ReadAxis(result, Rubric.Dim1),
                    ReadAxis(result, Rubric.Dim2),
                    ReadAxis(result, Rubric.Dim3),
                    string.Empty);
                scores.Add(score);
                if (score.D1 >= SupportPassThreshold)
                    supported++;
            }
        }

        if (scores.Count == 0)
            return new RagCitationSummary(0, 0, 0, answersGenerated);

        var summary = JudgeRunner.Aggregate(scores);
        var supportRate = (double)supported / scores.Count;
        return new RagCitationSummary(summary.MeanOverall, supportRate, scores.Count, answersGenerated);
    }

    /// <summary>
    /// Lightweight faithfulness check for the user-book off-book probe: does <paramref name="answer"/>
    /// introduce facts not grounded in the book? Returns true when the answer is clean (gracefully
    /// declines or stays grounded — no invented facts), false when it hallucinates outside knowledge.
    /// One judge call; parses a leading yes/no.
    /// </summary>
    internal static async Task<bool> JudgeNoInventedFactsAsync(
        ILlmService judge, string question, string answer, CancellationToken ct)
    {
        var prompt =
            "You are grading whether an assistant answer about a book introduces facts NOT grounded in " +
            "that book. A good answer either gracefully declines (says it can't find this in the book) " +
            "or stays grounded. A bad answer asserts specific outside facts (dates, names, scores, " +
            "events) as if from the book.\n\n" +
            $"Question: {question}\n\nAnswer:\n{answer}\n\n" +
            "Does the answer introduce facts not grounded in the book? Reply with exactly YES or NO.";
        var request = new LlmRequest(
            SystemPrompt: "You are a strict faithfulness grader. Reply YES or NO only.",
            Messages: [new LlmMessage("user", prompt)],
            MaxOutputTokens: 4,
            FeatureTag: "eval.judge");
        var response = await judge.CompleteAsync(request, ct);
        var verdict = response.Text.Trim().ToLowerInvariant();
        // "yes" = invented facts present → NOT clean. Anything else (incl. "no") = clean.
        return !verdict.StartsWith("yes", StringComparison.Ordinal);
    }

    // RubricEvaluator names each axis "{feature}.{label}" (label = text before ':').
    private static int ReadAxis(EvaluationResult result, string dim) =>
        (int)Math.Round(result.Get<NumericMetric>($"{CitationFeature}.{dim.Split(':')[0].Trim()}").Value ?? 0);

    /// <summary>Shared <see cref="EvalRun"/> row factory — one copy for every RAG eval feature.</summary>
    internal static EvalRun MakeRun(
        string feature, string modelId, string judgeModelId, decimal score, int n, string? gitSha, string breakdown) => new()
        {
            Id = Guid.NewGuid(),
            Feature = feature,
            ModelId = modelId,
            JudgeModelId = judgeModelId,
            Score = Math.Round(score, 3),
            N = n,
            BreakdownJson = breakdown,
            GitSha = gitSha,
            CreatedAt = DateTimeOffset.UtcNow,
        };
}
