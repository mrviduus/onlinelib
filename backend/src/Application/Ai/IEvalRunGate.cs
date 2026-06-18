namespace Application.Ai;

/// <summary>
/// In-process overlap guard: at most ONE eval run at a time across the whole API process
/// (Phase 12 RLOps slice 5a). Both the admin "Run evals" trigger and the scheduled
/// ContinuousEvalWorker check this so an admin-triggered run and a scheduled run can't
/// collide (they share the same EvalSuiteRunner persistence path). Registered as a singleton.
///
/// NOTE: this is process-local only. Cross-replica overlap is additionally guarded by a
/// Postgres advisory lock in the worker; the gate covers the single-process case.
/// </summary>
public interface IEvalRunGate
{
    /// <summary>Try to acquire the single eval slot. Returns false if a run is already in
    /// progress. On success the caller MUST call <see cref="Exit"/> in a finally.</summary>
    bool TryEnter();

    /// <summary>Release the eval slot. Idempotent-safe to call once per successful TryEnter.</summary>
    void Exit();
}

/// <summary>Interlocked flag impl of <see cref="IEvalRunGate"/> — a single 0/1 slot.</summary>
public sealed class EvalRunGate : IEvalRunGate
{
    private int _running; // 0 = free, 1 = running

    public bool TryEnter() => Interlocked.CompareExchange(ref _running, 1, 0) == 0;

    public void Exit() => Interlocked.Exchange(ref _running, 0);
}
