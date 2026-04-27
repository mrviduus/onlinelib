namespace Contracts.UserBooks;

public record CollectionDto(Guid Id, string Name, string Color, int SortOrder, int Count);

public record CreateCollectionRequest(string Name, string? Color);

public record UpdateCollectionRequest(string? Name, string? Color, int? SortOrder);

public record AddBookToCollectionRequest(Guid BookId, string BookType);
