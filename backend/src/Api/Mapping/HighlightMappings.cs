using System.Linq.Expressions;
using Api.Endpoints;
using Domain.Entities;

namespace Api.Mapping;

// R4: single source of truth for Highlight -> HighlightDto. Used both as an EF
// projection (.Select(HighlightMappings.Project) — translated to SQL) and in-memory
// (highlight.ToDto()). The compiled delegate is built once so the two forms can never
// drift: the field list lives in exactly one place (Project).
public static class HighlightMappings
{
    public static readonly Expression<Func<Highlight, HighlightDto>> Project = h => new HighlightDto(
        h.Id, h.EditionId, h.ChapterId, h.UserBookId, h.UserChapterId,
        h.AnchorJson, h.Color, h.SelectedText, h.NoteText,
        h.Version, h.CreatedAt, h.UpdatedAt);

    private static readonly Func<Highlight, HighlightDto> _compiled = Project.Compile();

    public static HighlightDto ToDto(this Highlight h) => _compiled(h);
}
