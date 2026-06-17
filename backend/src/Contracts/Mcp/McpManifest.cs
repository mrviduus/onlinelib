namespace Contracts.Mcp;

/// <summary>
/// Machine-readable MCP discovery manifest (AI-052). Served publicly at
/// <c>/.well-known/mcp/manifest.json</c> (nginx exact-match → API <c>/mcp/manifest</c>)
/// so MCP clients / tooling can discover the live streamable-HTTP endpoint, how to
/// authenticate, and the tool surface — WITHOUT colliding with the live protocol
/// endpoint at <c>/mcp</c> (an nginx prefix owned by the mcp-server container).
/// </summary>
public sealed record McpManifest(
    string Name,
    string Version,
    string Description,
    string Transport,
    string Endpoint,
    McpManifestAuth Auth,
    string Documentation,
    IReadOnlyList<McpToolDescriptor> Tools);

/// <summary>How a client obtains credentials for the MCP endpoint.</summary>
public sealed record McpManifestAuth(string Type, string HowTo);

/// <summary>One advertised tool: name + human description (mirrors the runtime catalog).</summary>
public sealed record McpToolDescriptor(string Name, string Description);

/// <summary>
/// The advertised 7-tool surface, VERBATIM from the runtime
/// <c>McpToolCatalog</c> (the source of truth in the Mcp project). The API cannot
/// reference the Mcp executable, so the pairs are mirrored here; a drift test in
/// <c>TextStack.Ai.Mcp.Tests</c> fails if these diverge from the catalog.
///
/// Order matches the catalog's surface: search/read tools, then the WRITE tool
/// <c>save_highlight</c>, then <c>ask_book</c>.
/// </summary>
public static class McpManifestCatalog
{
    public static IReadOnlyList<McpToolDescriptor> Tools { get; } =
    [
        new("search_books", "Search the TextStack library for books and chapters matching a query."),
        new("get_book", "Fetch a catalog book by slug: its editionId (for ask_book), metadata, authors, genres, and chapter list."),
        new("get_chapter", "Fetch a chapter's plain text (HTML stripped, length-capped) plus its number, title, and prev/next slugs."),
        new("list_my_highlights", "List the signed-in user's highlights for a given edition (requires authentication)."),
        new("list_my_vocabulary", "List the signed-in user's saved vocabulary words, optionally filtered by SRS stage or search (requires authentication)."),
        new("save_highlight",
            "Saves a highlight to YOUR TextStack library for the given catalog book chapter "
            + "(WRITE on your own account — requires you to be signed in). Pass the editionId "
            + "and chapterId (from get_book), the exact selected text, and optionally a color "
            + "and a note. The highlight is stored and listable via list_my_highlights."),
        new("ask_book", "Ask a question about a book the user is reading; spoiler-safe (answers only from chapters already read). Requires authentication."),
    ];
}
