namespace Contracts.Admin;

public record AdminAuthorSearchResultDto(
    Guid Id,
    string Slug,
    string Name,
    int BookCount
);

public record CreateAuthorRequest(
    Guid SiteId,
    string Name
);

public record CreateAuthorResponse(
    Guid Id,
    string Slug,
    string Name,
    bool IsNew
);
