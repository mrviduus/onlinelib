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
    /// <summary>
    /// "This route does not exist on the server we are pointed at" — i.e. the stack is older than
    /// the test, so there is nothing to assert about.
    /// </summary>
    /// <remarks>
    /// 500 used to be in here and is deliberately NOT, any more. The distinction that matters is
    /// NO SERVER versus A SERVER THAT ANSWERED WRONGLY:
    /// <list type="bullet">
    ///   <item>No server at all (connection refused, DNS failure) never reaches this predicate —
    ///     <c>HttpClient</c> throws, and the test fails, which is right.</item>
    ///   <item>404 means the endpoint isn't deployed. Skipping is honest: the code under test is
    ///     not present.</item>
    ///   <item>500 means the endpoint IS deployed and threw. That is the defect, not the
    ///     environment.</item>
    /// </list>
    /// Counting 500 as "unavailable" made every guard built on this predicate self-disarming: an
    /// endpoint that started throwing turned its own tests GREEN by skipping them. It cost this
    /// suite the guest-merge 500 (<c>GuestMergeConflictTests</c>), which skipped instead of failing
    /// — the merge tests and <c>AssertGuestPromotedInPlaceAsync</c> all sit behind this call, so a
    /// broken merge reported as "skipped" rather than "failed". A suite that only appears to guard
    /// the merge is worse than no suite, because it is believed.
    /// </remarks>
    public static bool Unavailable(HttpResponseMessage r) =>
        r.StatusCode is HttpStatusCode.NotFound;
}
