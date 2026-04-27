namespace Domain.Entities;

public class BookCollection
{
    public Guid CollectionId { get; set; }
    public Guid BookId { get; set; }
    public required string BookType { get; set; } // 'userbook' | 'savedbook'
    public DateTimeOffset AddedAt { get; set; }

    public Collection Collection { get; set; } = null!;
}
