using Api.Endpoints;

namespace TextStack.UnitTests;

/// <summary>
/// The tutor session remembers which answers it has already written to spaced repetition.
///
/// This is not paranoia about clients. Both <c>useTutorSession</c> hooks accumulate results in a ref
/// that is never cleared, so the second feedback turn re-sends the first turn's answers along with its
/// own. Without the applied set, one "Knew" would advance the same card twice and push its next review
/// a day further out than the learner earned — a subtler version of exactly the bug we are fixing.
/// </summary>
public class TutorAppliedWordIdsTests
{
    [Fact]
    public void AppliedWordIds_Null_IsEmpty()
    {
        // Sessions created before the tutor wrote SRS at all have no column value.
        Assert.Empty(TutorEndpoints.AppliedWordIds(null));
    }

    [Fact]
    public void AppliedWordIds_Malformed_IsEmptyRatherThanThrowing()
    {
        // A session row is not worth a 500. Treating garbage as "nothing applied yet" risks one
        // double-write; throwing loses the whole turn.
        Assert.Empty(TutorEndpoints.AppliedWordIds("{ not json"));
        Assert.Empty(TutorEndpoints.AppliedWordIds("\"a string\""));
    }

    [Fact]
    public void AppliedWordIds_RoundTrips()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var json = System.Text.Json.JsonSerializer.Serialize(new HashSet<Guid> { a, b });

        var parsed = TutorEndpoints.AppliedWordIds(json);

        Assert.Equal(2, parsed.Count);
        Assert.Contains(a, parsed);
        Assert.Contains(b, parsed);
        // The set is what the endpoint adds to, so a re-sent id must report as already present.
        Assert.False(parsed.Add(a));
    }
}
