namespace Domain.ValueObjects;

public readonly record struct Slug
{
    public string Value { get; }

    private Slug(string value) => Value = value;

    public static Slug Create(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException("Slug cannot be empty", nameof(value));

        var normalized = value.ToLowerInvariant().Trim();
        if (!IsValid(normalized))
            throw new ArgumentException("Invalid slug format", nameof(value));

        return new Slug(normalized);
    }

    public static Slug CreateUnsafe(string value) => new(value);

    public static bool IsValid(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        foreach (var c in value)
        {
            if (!char.IsLetterOrDigit(c) && c != '-' && c != '_')
                return false;
        }
        return true;
    }

    public static implicit operator string(Slug slug) => slug.Value;
    public override string ToString() => Value;
}
