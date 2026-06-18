using Application.Ai;

namespace TextStack.UnitTests;

/// <summary>
/// Single-slot overlap gate (Phase 12 RLOps slice 5a): one TryEnter succeeds, a second fails
/// until Exit, then it can be re-entered. Shared by the admin trigger + ContinuousEvalWorker.
/// </summary>
public class EvalRunGateTests
{
    [Fact]
    public void TryEnter_FirstCall_Succeeds()
    {
        var gate = new EvalRunGate();
        Assert.True(gate.TryEnter());
    }

    [Fact]
    public void TryEnter_SecondCallWhileHeld_Fails()
    {
        var gate = new EvalRunGate();
        Assert.True(gate.TryEnter());
        Assert.False(gate.TryEnter());
    }

    [Fact]
    public void TryEnter_AfterExit_SucceedsAgain()
    {
        var gate = new EvalRunGate();
        Assert.True(gate.TryEnter());
        gate.Exit();
        Assert.True(gate.TryEnter());
    }

    [Fact]
    public void TryEnter_Concurrent_OnlyOneWins()
    {
        var gate = new EvalRunGate();
        var winners = 0;

        Parallel.For(0, 64, _ =>
        {
            if (gate.TryEnter())
                Interlocked.Increment(ref winners);
        });

        Assert.Equal(1, winners);
    }

    // Both callers (admin trigger + ContinuousEvalWorker) wrap the guarded run in try/finally so
    // Exit ALWAYS runs even if the run throws. If Exit leaked on failure the slot would be
    // permanently blocked until process restart. Mirror that exact shape.
    [Fact]
    public async Task Exit_AfterRunThrows_SlotReleased()
    {
        var gate = new EvalRunGate();

        Assert.True(gate.TryEnter());
        await Assert.ThrowsAsync<InvalidOperationException>(async () =>
        {
            try
            {
                await Task.Yield();
                throw new InvalidOperationException("run blew up");
            }
            finally
            {
                gate.Exit();
            }
        });

        // Slot must be free again — a subsequent run can enter.
        Assert.True(gate.TryEnter());
    }

    // Exit is Interlocked.Exchange(→0): calling it without a matching Enter, or twice, never throws
    // and never corrupts the slot (free stays free). Guards against a double-Exit / Exit-without-Enter
    // deadlocking the gate.
    [Fact]
    public void Exit_WithoutEnterOrTwice_IsHarmless()
    {
        var gate = new EvalRunGate();

        gate.Exit();              // Exit without Enter — no throw, slot free
        Assert.True(gate.TryEnter());
        gate.Exit();
        gate.Exit();              // double Exit — still free, no throw
        Assert.True(gate.TryEnter());
    }
}
