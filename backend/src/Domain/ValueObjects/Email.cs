using System.Text.RegularExpressions;

namespace Domain.ValueObjects;

public readonly partial record struct Email
{
    public string Value { get; }

    private Email(string value) => Value = value;

    public static Email Create(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException("Email cannot be empty", nameof(value));

        var normalized = value.ToLowerInvariant().Trim();
        if (!IsValid(normalized))
            throw new ArgumentException("Invalid email format", nameof(value));

        return new Email(normalized);
    }

    public static Email CreateUnsafe(string value) => new(value);

    public static bool IsValid(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        return EmailRegex().IsMatch(value);
    }

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.IgnoreCase)]
    private static partial Regex EmailRegex();

    public static implicit operator string(Email email) => email.Value;
    public override string ToString() => Value;
}
