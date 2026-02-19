namespace Application.Common;

public record Result<T>(T? Data, string? Error)
{
    public bool IsSuccess => Error == null;

    public static Result<T> Success(T data) => new(data, null);
    public static Result<T> Failure(string error) => new(default, error);
}
