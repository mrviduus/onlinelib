using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore.Query;

namespace TextStack.UnitTests.Fakes;

/// <summary>
/// Minimal in-memory async query plumbing so EF Core async LINQ operators
/// (<c>ToListAsync</c> / <c>AnyAsync</c> / <c>FirstOrDefaultAsync</c>) work over a plain
/// <see cref="List{T}"/> without pulling EF Core InMemory (not a repo dependency). Standard
/// "test async enumerable" shape — executes the underlying synchronous LINQ provider and wraps
/// the result as an async sequence / task.
/// </summary>
internal sealed class TestAsyncEnumerable<T>(IEnumerable<T> enumerable)
    : EnumerableQuery<T>(enumerable), IAsyncEnumerable<T>, IQueryable<T>
{
    public TestAsyncEnumerable(Expression expression) : this(new EnumerableQuery<T>(expression)) { }

    public IAsyncEnumerator<T> GetAsyncEnumerator(CancellationToken ct = default) =>
        new TestAsyncEnumerator<T>(this.AsEnumerable().GetEnumerator());

    IQueryProvider IQueryable.Provider => new TestAsyncQueryProvider<T>(this);
}

internal sealed class TestAsyncEnumerator<T>(IEnumerator<T> inner) : IAsyncEnumerator<T>
{
    public T Current => inner.Current;
    public ValueTask<bool> MoveNextAsync() => new(inner.MoveNext());
    public ValueTask DisposeAsync() { inner.Dispose(); return default; }
}

internal sealed class TestAsyncQueryProvider<TEntity>(IQueryProvider inner) : IAsyncQueryProvider
{
    public IQueryable CreateQuery(Expression expression) => new TestAsyncEnumerable<TEntity>(expression);

    public IQueryable<TElement> CreateQuery<TElement>(Expression expression) =>
        new TestAsyncEnumerable<TElement>(expression);

    public object? Execute(Expression expression) => inner.Execute(expression);

    public TResult Execute<TResult>(Expression expression) => inner.Execute<TResult>(expression);

    public TResult ExecuteAsync<TResult>(Expression expression, CancellationToken ct = default)
    {
        // TResult is Task<TActual>; execute synchronously then wrap as a completed Task.
        var expectedResultType = typeof(TResult).GetGenericArguments()[0];
        var executionResult = ((IQueryProvider)this).Execute(expression);

        return (TResult)typeof(Task)
            .GetMethod(nameof(Task.FromResult))!
            .MakeGenericMethod(expectedResultType)
            .Invoke(null, [executionResult])!;
    }
}
