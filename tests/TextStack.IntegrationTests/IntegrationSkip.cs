using System.Net;

namespace TextStack.IntegrationTests;

/// <summary>
/// Shared skip predicate for live-server integration tests. Replaces the
/// per-file <c>ShouldSkip</c> copies + silent <c>return;</c> guards: callers
/// pair this with <c>Assert.SkipWhen(...)</c> so an unreachable endpoint shows
/// up as a SKIPPED test in the report instead of a green pass with no asserts.
/// </summary>
internal static class IntegrationSkip
{
    /// <summary>404/500 from the live API = endpoint not deployed or erroring;
    /// the test can't meaningfully assert, so skip rather than false-pass.</summary>
    public static bool Unavailable(HttpResponseMessage r) =>
        r.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.InternalServerError;
}
