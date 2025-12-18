namespace Contracts.Common;

public record PaginatedResult<T>(int Total, IReadOnlyList<T> Items);
