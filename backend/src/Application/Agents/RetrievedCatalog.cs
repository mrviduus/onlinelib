using System.Text;
using System.Text.Json;
using Application.Tools;
using TextStack.Ai.Core;

namespace Application.Agents;

/// <summary>
/// The set of books the Librarian agent's tools ACTUALLY returned during a run, reconstructed from the
/// persisted step transcript. This is the ground truth the final-answer parser checks every recommendation
/// against (AI-Agent-3 anti-hallucination): a <c>library</c> book must reference an edition id we returned, and
/// an <c>open_library</c> suggestion must reference a title an Open Library tool returned. Built ONLY from
/// <c>tool_result</c> steps whose <c>ok</c> is true — a failed tool contributes nothing, so a recommendation
/// can never be grounded in an error payload.
/// </summary>
public sealed class RetrievedCatalog
{
    private readonly Dictionary<Guid, RetrievedLibraryBook> _library;
    // Keyed by the NORMALIZED title (see NormalizeTitleKey) so the model's echoed title matches the harvested OL
    // row even across sanitizer/whitespace/Unicode differences — the value is the full harvested record so an
    // external rec can re-project authors/year/pages from ground truth instead of trusting the model (FIX 2/4).
    private readonly Dictionary<string, RetrievedExternalBook> _external;

    private RetrievedCatalog(Dictionary<Guid, RetrievedLibraryBook> library, Dictionary<string, RetrievedExternalBook> external)
    {
        _library = library;
        _external = external;
    }

    public static RetrievedCatalog Empty { get; } =
        new(new Dictionary<Guid, RetrievedLibraryBook>(), new Dictionary<string, RetrievedExternalBook>(StringComparer.Ordinal));

    /// <summary>True when a library recommendation's edition id was genuinely retrieved (and yields its row).</summary>
    public bool TryGetLibrary(Guid editionId, out RetrievedLibraryBook book) =>
        _library.TryGetValue(editionId, out book!);

    /// <summary>
    /// True when an Open Library tool returned a result whose title matches <paramref name="title"/> after the
    /// SAME normalization applied to both sides — yields the full harvested record to re-project from (FIX 2/4).
    /// </summary>
    public bool TryGetExternal(string title, out RetrievedExternalBook book) =>
        _external.TryGetValue(NormalizeTitleKey(title), out book!);

    public int LibraryCount => _library.Count;
    public int ExternalCount => _external.Count;

    /// <summary>Reconstructs the retrieved catalog from a run's step transcript (the parser's grounding source).</summary>
    public static RetrievedCatalog FromSteps(IReadOnlyList<AgentStep> steps)
    {
        var library = new Dictionary<Guid, RetrievedLibraryBook>();
        var external = new Dictionary<string, RetrievedExternalBook>(StringComparer.Ordinal);

        foreach (var step in steps)
        {
            if (step.Kind != "tool_result")
                continue;
            var payload = step.Payload;
            if (payload.ValueKind != JsonValueKind.Object)
                continue;
            if (!payload.TryGetProperty("ok", out var ok) || ok.ValueKind != JsonValueKind.True)
                continue;
            if (!payload.TryGetProperty("tool", out var toolEl) || toolEl.ValueKind != JsonValueKind.String)
                continue;
            if (!payload.TryGetProperty("result", out var result) || result.ValueKind != JsonValueKind.Object)
                continue;

            switch (toolEl.GetString())
            {
                case "search_library":
                case "search_library_semantic":
                    HarvestLibrary(result, library);
                    break;
                case "search_open_library":
                    HarvestExternalSearch(result, external);
                    break;
                case "get_open_library_work":
                    HarvestExternalWork(result, external);
                    break;
            }
        }

        return new RetrievedCatalog(library, external);
    }

    private static void HarvestLibrary(JsonElement result, Dictionary<Guid, RetrievedLibraryBook> library)
    {
        if (!result.TryGetProperty("results", out var arr) || arr.ValueKind != JsonValueKind.Array)
            return;
        foreach (var item in arr.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;
            if (!TryGetGuid(item, "editionId", out var editionId)) continue;

            var title = GetString(item, "title");
            if (string.IsNullOrWhiteSpace(title)) continue;

            library[editionId] = new RetrievedLibraryBook(
                EditionId: editionId,
                Slug: GetString(item, "slug") ?? string.Empty,
                Title: title,
                Authors: GetStringArray(item, "authors"),
                Language: GetString(item, "language"),
                Year: GetInt(item, "year"),
                ApproxPages: GetInt(item, "approxPages") ?? GetInt(item, "pages"));
        }
    }

    // Harvests the full OL search rows so an external rec re-projects authors/year/pages from ground truth
    // (FIX 2). Shape mirrors OpenLibrarySearchTool.ParseSearch: title, authors[], firstPublishYear, medianPages,
    // olWorkKey. Keyed by NormalizeTitleKey so the model's echoed title matches across sanitize/whitespace (FIX 4).
    private static void HarvestExternalSearch(JsonElement result, Dictionary<string, RetrievedExternalBook> external)
    {
        if (!result.TryGetProperty("results", out var arr) || arr.ValueKind != JsonValueKind.Array)
            return;
        foreach (var item in arr.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;
            if (GetString(item, "title") is not { Length: > 0 } title) continue;
            AddExternal(external, new RetrievedExternalBook(
                Title: title.Trim(),
                Authors: GetStringArray(item, "authors"),
                Year: GetInt(item, "firstPublishYear"),
                Pages: GetInt(item, "medianPages"),
                WorkKey: GetString(item, "olWorkKey")));
        }
    }

    // The work tool (OpenLibraryWorkTool.ParseWork) returns title + key but NOT authors/year/pages, so those stay
    // null here — and a null harvested field re-projects as null (the model can't fill it). FIX 2.
    private static void HarvestExternalWork(JsonElement result, Dictionary<string, RetrievedExternalBook> external)
    {
        if (GetString(result, "title") is { Length: > 0 } title)
            AddExternal(external, new RetrievedExternalBook(
                Title: title.Trim(),
                Authors: [],
                Year: null,
                Pages: null,
                WorkKey: GetString(result, "key")));
    }

    // First harvest wins (search rows carry author/year/pages the work tool lacks; never let a later thinner
    // work-row overwrite a richer search-row for the same title).
    private static void AddExternal(Dictionary<string, RetrievedExternalBook> external, RetrievedExternalBook book)
    {
        var key = NormalizeTitleKey(book.Title);
        if (key.Length == 0) return;
        external.TryAdd(key, book);
    }

    /// <summary>
    /// The single canonical matching key for external titles, applied IDENTICALLY to the harvested OL row and the
    /// model's echo so a legitimate rec is never silently dropped over sanitizer/whitespace/Unicode/case skew
    /// (FIX 4): sanitize (same allowlist as everywhere else) → NFC normalize → trim → collapse internal whitespace
    /// → lowercase (invariant). An all-stripped title collapses to "" and is treated as un-matchable.
    /// </summary>
    public static string NormalizeTitleKey(string? title)
    {
        var cleaned = ExternalTextSanitizer.Clean(title);
        if (string.IsNullOrWhiteSpace(cleaned))
            return string.Empty;

        var nfc = cleaned.Normalize(NormalizationForm.FormC);
        var sb = new StringBuilder(nfc.Length);
        var pendingSpace = false;
        foreach (var ch in nfc)
        {
            if (char.IsWhiteSpace(ch))
            {
                pendingSpace = sb.Length > 0;
                continue;
            }
            if (pendingSpace)
            {
                sb.Append(' ');
                pendingSpace = false;
            }
            sb.Append(char.ToLowerInvariant(ch));
        }
        return sb.ToString();
    }

    private static bool TryGetGuid(JsonElement obj, string name, out Guid value)
    {
        value = Guid.Empty;
        return obj.TryGetProperty(name, out var v)
            && v.ValueKind == JsonValueKind.String
            && Guid.TryParse(v.GetString(), out value);
    }

    private static string? GetString(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static int? GetInt(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : null;

    private static List<string> GetStringArray(JsonElement obj, string name)
    {
        var list = new List<string>();
        if (obj.TryGetProperty(name, out var arr) && arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var v in arr.EnumerateArray())
                if (v.ValueKind == JsonValueKind.String && v.GetString() is { Length: > 0 } s)
                    list.Add(s);
        }
        return list;
    }
}

/// <summary>A library book exactly as a search tool returned it — the ground truth a recommendation re-projects from.</summary>
public sealed record RetrievedLibraryBook(
    Guid EditionId,
    string Slug,
    string Title,
    IReadOnlyList<string> Authors,
    string? Language,
    int? Year,
    int? ApproxPages);

/// <summary>
/// An Open Library row exactly as a tool returned it — the ground truth an external suggestion re-projects its
/// title/authors/year/pages from, so the model can't attach a fabricated author or year to a real OL title
/// (FIX 2). A field the OL row lacked stays null (the model can't fill it).
/// </summary>
public sealed record RetrievedExternalBook(
    string Title,
    IReadOnlyList<string> Authors,
    int? Year,
    int? Pages,
    string? WorkKey);
