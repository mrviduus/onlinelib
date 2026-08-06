using System.Collections.Concurrent;

namespace TextStack.Ai.Llm;

/// <summary>
/// Per-key cooldown for Sentry alarms. Load-bearing, not a nicety: <c>pdf.parse</c> is called ONCE
/// PER PAGE with parallelism 6, so the 106-page book from the 2026-07-14 incident would have raised
/// 106 identical events. The first hit for a key always fires (a bad deploy must be visible within
/// one page); everything inside the cooldown window is dropped.
///
/// The decision itself is a pure static (<see cref="ShouldFire"/>) so it unit-tests without a clock,
/// a Sentry hub, or a DI container.
/// </summary>
public sealed class AlarmThrottle(TimeSpan cooldown)
{
    private readonly ConcurrentDictionary<string, DateTimeOffset> _lastFired = new();

    /// <summary>Pure decision: fire when nothing has fired for this key yet, or the cooldown has elapsed.</summary>
    public static bool ShouldFire(DateTimeOffset now, DateTimeOffset? lastFired, TimeSpan cooldown) =>
        lastFired is not { } last || now - last >= cooldown;

    /// <summary>Atomically claims the key when it is due. Returns false if another thread just claimed it.</summary>
    public bool TryEnter(string key, DateTimeOffset now)
    {
        var claimed = false;
        _lastFired.AddOrUpdate(
            key,
            _ =>
            {
                claimed = true;
                return now;
            },
            (_, last) =>
            {
                if (!ShouldFire(now, last, cooldown))
                    return last;
                claimed = true;
                return now;
            });
        return claimed;
    }
}
