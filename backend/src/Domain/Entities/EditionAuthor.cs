using Domain.Enums;

namespace Domain.Entities;

public class EditionAuthor
{
    public Guid EditionId { get; set; }
    public Guid AuthorId { get; set; }
    public int Order { get; set; }
    public AuthorRole Role { get; set; } = AuthorRole.Author;

    public Edition Edition { get; set; } = null!;
    public Author Author { get; set; } = null!;
}
