namespace TextStack.Ai.Rag;

/// <summary>
/// One PDF page transcribed to GitHub-flavored Markdown by the vision parser (ADR-012 S3).
/// <see cref="Page"/> is the 1-based physical page number (the value a chat citation shows as
/// "p. {Page}" and that jumps the Original viewer). <see cref="Markdown"/> is the page's clean
/// Markdown (tables as Markdown tables, headings preserved).
/// </summary>
public readonly record struct PdfPageMarkdown(int Page, string Markdown);

/// <summary>
/// A structure-aware chunk produced by <see cref="MarkdownChunker"/> from vision-parsed pages.
/// Extends <see cref="TextChunk"/>'s shape with page + section provenance (ADR-012 S3):
/// <see cref="SourcePage"/> is the physical page of the chunk's first line (drives the page
/// citation) and <see cref="SectionPath"/> is the Markdown heading breadcrumb
/// ("2. Orbit › Infectious › Preseptal Cellulitis") the chunk falls under, or null at document root.
/// Offsets are Markdown-local (into the concatenated document) — for reconstruction only, NEVER
/// PDF navigation (page nav uses <see cref="SourcePage"/>).
/// </summary>
public readonly record struct MarkdownChunk(
    int Ord,
    string Text,
    int TokenCount,
    int CharStart,
    int CharEnd,
    int SourcePage,
    string? SectionPath);
