using System.Text.RegularExpressions;
using Application.Rag;
using Microsoft.Extensions.Logging.Abstractions;
using TextStack.Ai.Core;
using TextStack.Ai.EvalSuite;
using TextStack.Ai.Rag;

namespace TextStack.AiEvals;

/// <summary>
/// Deterministic coverage for <see cref="PdfVisionEvalRunner"/> (ADR-012 S3 vision-RAG gate) with fakes —
/// no live vision call, no embeddings key, no DB. A <see cref="FakeVision"/> returns canned golden
/// Markdown for each embedded fixture image (mapped by exact bytes), a bag-of-words
/// <see cref="BagEmbedder"/> drives cosine retrieval, a first-chunk <see cref="FirstChunkAsk"/> echoes a
/// <c>[1]</c> citation over the top chunk, and a <see cref="FixedJudge"/> returns fixed 1–5 rubric scores.
/// Proves: the REAL <see cref="MarkdownChunker"/> keeps each golden table whole (tablestructure = 1.0),
/// the page-citation fraction math, the 4-row persistence, and the empty-transcription short-circuit (no
/// judge call). The live-scored half runs on prod (real key) via the admin endpoint.
/// </summary>
public class PdfVisionEvalRunnerTests
{
    private static readonly PdfVisionGolden Golden = PdfVisionGoldenSet.Load();

    private static PdfVisionEvalRunner Runner() => new(NullLogger<PdfVisionEvalRunner>.Instance);

    // Canned Markdown per fixture page — real GFM tables carrying the golden facts, so the production
    // MarkdownChunker keeps each table whole and retrieval can tell the pages apart.
    private static readonly IReadOnlyDictionary<int, string> CannedMarkdown = new Dictionary<int, string>
    {
        [1] =
            "# Corneal Ulcer — Clinical Summary\n\n" +
            "| Feature | Bacterial Ulcer | Fungal Ulcer |\n" +
            "| --- | --- | --- |\n" +
            "| Onset | Rapid, within 24 to 48 hours | Gradual, over several days |\n" +
            "| Infiltrate edge | Sharp and dense | Feathery and irregular |\n" +
            "| Hypopyon | Common | Less common |\n" +
            "| First-line drops | Fortified cefazolin | Natamycin five percent |\n" +
            "| Review interval | Every 24 hours | Every 48 hours |\n",
        [2] =
            "# Preseptal versus Orbital Cellulitis\n\n" +
            "| Sign | Preseptal | Orbital |\n" +
            "| --- | --- | --- |\n" +
            "| Proptosis | Absent | Present |\n" +
            "| Painful eye movement | Absent | Present |\n" +
            "| Visual acuity | Normal | May be reduced |\n" +
            "| Imaging | Usually not needed | CT orbit with contrast |\n" +
            "| Management | Often outpatient oral | Inpatient IV antibiotics |\n",
        [3] =
            "# Acute Angle-Closure Glaucoma — Management\n\n" +
            "| Step | Agent | Purpose |\n" +
            "| --- | --- | --- |\n" +
            "| 1 | Timolol 0.5 percent | Reduce aqueous production |\n" +
            "| 2 | Acetazolamide 500 mg IV | Lower intraocular pressure |\n" +
            "| 3 | Pilocarpine 2 percent | Constrict the pupil |\n" +
            "| 4 | Laser peripheral iridotomy | Definitive treatment |\n",
    };

    [Fact]
    public async Task RunAsync_FaithfulTranscription_TableSurvivesAndCitesExpectedPage()
    {
        var judge = new FixedJudge(5, 4, 5);
        var result = await Runner().RunAsync(
            new FakeVision(Golden.Pages, CannedMarkdown), new BagEmbedder(), new FirstChunkAsk(), judge,
            judgeModelId: "judge-fake", k: IRagService.DefaultK, persist: false, db: null, gitSha: null,
            TestContext.Current.CancellationToken);

        Assert.Equal(Golden.Pages.Count, result.PageN);
        Assert.Equal(Golden.Questions.Count, result.QaN);

        // Deterministic axes: the production MarkdownChunker keeps every golden table whole, and cosine
        // retrieval ranks each question's page top → the [1] citation points at the expected page.
        Assert.Equal(1.0, result.TableStructure, 12);
        Assert.Equal(1.0, result.Citation, 12);
        Assert.All(result.PageCases, c => Assert.True(c.TableSurvived));
        Assert.All(result.QaCases, c => Assert.True(c.CitedExpectedPage));
        Assert.All(result.QaCases, c => Assert.Contains(c.ExpectedPage, c.CitedPages));

        // Judged axes: fixed rubric (5,4,5) → mean 14/3 per case, averaged over pages/questions.
        Assert.Equal(14 / 3.0, result.Transcription, 6);
        Assert.Equal(14 / 3.0, result.Answer, 6);
        Assert.Null(result.Note);
    }

    [Fact]
    public async Task RunAsync_MisrankedRetrieval_CitationFractionIsPageOneShare()
    {
        // A constant embedder makes every chunk cosine-tie; stable OrderByDescending keeps page order, so
        // chunk[0] (page 1) is always cited. Only the two page-1 questions cite correctly → 2/6. The
        // table-structure axis is retrieval-independent and stays 1.0.
        var result = await Runner().RunAsync(
            new FakeVision(Golden.Pages, CannedMarkdown), new ConstantEmbedder(), new FirstChunkAsk(),
            new FixedJudge(5, 5, 5), judgeModelId: "judge-fake", k: IRagService.DefaultK,
            persist: false, db: null, gitSha: null, TestContext.Current.CancellationToken);

        var pageOneQuestions = Golden.Questions.Count(q => q.ExpectedPage == 1);
        Assert.Equal((double)pageOneQuestions / Golden.Questions.Count, result.Citation, 12);
        Assert.Equal(1.0, result.TableStructure, 12);
    }

    [Fact]
    public async Task RunAsync_Persist_WritesFourAxisRows()
    {
        var db = new CapturingDb();
        await Runner().RunAsync(
            new FakeVision(Golden.Pages, CannedMarkdown), new BagEmbedder(), new FirstChunkAsk(),
            new FixedJudge(5, 4, 5), judgeModelId: "judge-fake", k: IRagService.DefaultK,
            persist: true, db, gitSha: "abc123", TestContext.Current.CancellationToken);

        Assert.Equal(4, db.Added.Count);
        Assert.Contains(db.Added, r => r.Feature == PdfVisionEvalRunner.TranscriptionFeature);
        Assert.Contains(db.Added, r => r.Feature == PdfVisionEvalRunner.AnswerFeature);
        Assert.Contains(db.Added, r => r.Feature == PdfVisionEvalRunner.CitationFeature);
        Assert.Contains(db.Added, r => r.Feature == PdfVisionEvalRunner.TableStructureFeature);
        Assert.All(db.Added, r => Assert.Equal("abc123", r.GitSha));
        Assert.Equal(1, db.SaveCalls);

        // The deterministic axes persist their exact scores (1.0 each here).
        Assert.Equal(1.000m, db.Added.Single(r => r.Feature == PdfVisionEvalRunner.CitationFeature).Score);
        Assert.Equal(1.000m, db.Added.Single(r => r.Feature == PdfVisionEvalRunner.TableStructureFeature).Score);
    }

    [Fact]
    public async Task RunAsync_EmptyTranscription_ShortCircuitsWithNoJudgeCall()
    {
        var judge = new FixedJudge(5, 5, 5);
        var result = await Runner().RunAsync(
            new EmptyVision(), new ThrowingEmbedder(), new FirstChunkAsk(), judge,
            judgeModelId: "judge-fake", k: IRagService.DefaultK, persist: false, db: null, gitSha: null,
            TestContext.Current.CancellationToken);

        // No page transcribed → short-circuit before chunking/embedding/judging (ThrowingEmbedder proves it).
        Assert.Equal(0, judge.Calls);
        Assert.Equal(0, result.PageN);
        Assert.Equal(0, result.QaN);
        Assert.Equal(0.0, result.Transcription, 12);
        Assert.Equal(0.0, result.Citation, 12);
        Assert.Equal(0.0, result.TableStructure, 12);
        Assert.Empty(result.PageCases);
        Assert.Empty(result.QaCases);
        Assert.NotNull(result.Note);
    }

    [Fact]
    public async Task RunAsync_EmptyTranscription_PersistsFourFailedRows()
    {
        var db = new CapturingDb();
        await Runner().RunAsync(
            new EmptyVision(), new ThrowingEmbedder(), new FirstChunkAsk(), new FixedJudge(5, 5, 5),
            judgeModelId: "judge-fake", k: IRagService.DefaultK, persist: true, db, gitSha: null,
            TestContext.Current.CancellationToken);

        Assert.Equal(4, db.Added.Count);
        Assert.All(db.Added, r => Assert.Equal(0m, r.Score));
        Assert.All(db.Added, r => Assert.Contains("empty-transcription", r.BreakdownJson));
        Assert.Equal(1, db.SaveCalls);
    }

    // ---- fakes ----

    /// <summary>Returns canned Markdown for a fixture page, matched by EXACT image bytes (the runner sends
    /// the real embedded JPEG). Counts calls.</summary>
    private sealed class FakeVision(IReadOnlyList<PdfVisionPageGolden> pages, IReadOnlyDictionary<int, string> canned)
        : ILlmService
    {
        public int Calls;

        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            Calls++;
            var bytes = request.Messages[0].Images![0].Bytes;
            var page = pages.First(p => PdfVisionGoldenSet.LoadImage(p.ImageResource).AsSpan().SequenceEqual(bytes)).Page;
            return Task.FromResult(new LlmResponse(canned[page], [], new LlmUsage(0, 0, 0m), "vision-fake", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    /// <summary>A vision client that transcribes every page to empty — triggers the short-circuit.</summary>
    private sealed class EmptyVision : ILlmService
    {
        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct) =>
            Task.FromResult(new LlmResponse(string.Empty, [], new LlmUsage(0, 0, 0m), "vision-fake", Guid.NewGuid()));

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    /// <summary>A fixed rubric verdict (support/relevance/faithfulness style) for every judged case; counts calls.</summary>
    private sealed class FixedJudge(int d1, int d2, int d3) : ILlmService
    {
        public int Calls;

        public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
        {
            Calls++;
            return Task.FromResult(new LlmResponse(
                $"{{\"d1\": {d1}, \"d2\": {d2}, \"d3\": {d3}, \"rationale\": \"ok\"}}",
                [], new LlmUsage(0, 0, 0m), "judge-fake", Guid.NewGuid()));
        }

        public IAsyncEnumerable<LlmDelta> StreamAsync(LlmRequest request, CancellationToken ct) =>
            throw new NotSupportedException();
    }

    /// <summary>Echoes a one-citation answer over the top-ranked chunk; empty chunks → insufficient (no cite).</summary>
    private sealed class FirstChunkAsk : IRagAskService
    {
        public Task<AskAnswer> AskAsync(Guid u, Guid s, Guid e, string q, int k, Guid? currentChapterId,
            IReadOnlyList<Contracts.Books.AskTurnDto> history, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<AskAnswer> AskFromChunksAsync(
            string question, IReadOnlyList<RetrievedChunk> chunks, IReadOnlyList<string> notes,
            IReadOnlyList<Contracts.Books.AskTurnDto> history, int lastReadOrd, CancellationToken ct)
        {
            var citations = chunks.Count == 0
                ? Array.Empty<AskCitationSource>()
                : [new AskCitationSource(1, chunks[0])];
            return Task.FromResult(new AskAnswer(
                $"Grounded answer [1]. ({question})", citations, lastReadOrd, Insufficient: chunks.Count == 0));
        }
    }

    /// <summary>Deterministic bag-of-words embedder (dim 512, hashed tokens) — cosine ≈ shared-word overlap,
    /// so each question retrieves its own page's chunk top.</summary>
    private sealed class BagEmbedder : IEmbeddingService
    {
        public int Dimensions => 512;

        public Task<float[]> EmbedAsync(string text, CancellationToken ct) => Task.FromResult(Vec(text));

        public Task<IReadOnlyList<float[]>> EmbedBatchAsync(IReadOnlyList<string> texts, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<float[]>>(texts.Select(Vec).ToList());

        private static float[] Vec(string text)
        {
            var v = new float[512];
            foreach (var tok in Regex.Split(text.ToLowerInvariant(), "[^a-z0-9]+"))
                if (tok.Length > 2)
                    v[(int)((uint)tok.GetHashCode() % 512u)] += 1f;
            return v;
        }
    }

    /// <summary>Every text embeds to the same vector — cosine ties, so stable ordering keeps page order.</summary>
    private sealed class ConstantEmbedder : IEmbeddingService
    {
        public int Dimensions => 4;
        public Task<float[]> EmbedAsync(string text, CancellationToken ct) => Task.FromResult(new[] { 1f, 0f, 0f, 0f });
        public Task<IReadOnlyList<float[]>> EmbedBatchAsync(IReadOnlyList<string> texts, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<float[]>>(texts.Select(_ => new[] { 1f, 0f, 0f, 0f }).ToList());
    }

    /// <summary>Throws on any embed — proves the empty-transcription short-circuit skips retrieval.</summary>
    private sealed class ThrowingEmbedder : IEmbeddingService
    {
        public int Dimensions => 512;
        public Task<float[]> EmbedAsync(string text, CancellationToken ct) =>
            throw new InvalidOperationException("Embedder must not be called after the empty short-circuit");
        public Task<IReadOnlyList<float[]>> EmbedBatchAsync(IReadOnlyList<string> texts, CancellationToken ct) =>
            throw new InvalidOperationException("Embedder must not be called after the empty short-circuit");
    }
}
