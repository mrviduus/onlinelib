using Api.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace TextStack.UnitTests;

/// <summary>
/// DriftDetectionWorker unit coverage (Phase 12 RLOps slice 5b): the disabled short-circuit does
/// zero DB/scope/lock work, and the prompt-extraction helper handles the llm_traces message shape.
/// The full sample→embed→baseline→alert flow is covered by the integration regression-demo test.
/// </summary>
public class DriftDetectionWorkerTests
{
    // A scope factory that explodes the moment it's used — proves the disabled path bails before
    // any scope/DB/advisory-lock work.
    private sealed class ExplodingScopeFactory : IServiceScopeFactory
    {
        public IServiceScope CreateScope() =>
            throw new InvalidOperationException("scope created while worker was disabled");
    }

    private static IConfiguration Config(bool enabled) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Drift:Enabled"] = enabled ? "true" : "false",
            })
            .Build();

    [Fact]
    public async Task TickAsync_Disabled_ShortCircuitsBeforeAnyScopeOrDb()
    {
        var worker = new DriftDetectionWorker(
            new ExplodingScopeFactory(), Config(enabled: false),
            NullLogger<DriftDetectionWorker>.Instance);

        // Must NOT throw — the exploding scope factory would fire if the disabled path touched it.
        await worker.TickAsync(TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task TickAsync_EnabledButScopeThrows_Propagates()
    {
        var worker = new DriftDetectionWorker(
            new ExplodingScopeFactory(), Config(enabled: true),
            NullLogger<DriftDetectionWorker>.Instance);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => worker.TickAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public void FirstUserMessage_PicksFirstUserContent()
    {
        const string json = """
            [
              {"Role":"system","Content":"you are helpful"},
              {"Role":"user","Content":"explain the word ephemeral"},
              {"Role":"user","Content":"second user msg"}
            ]
            """;
        Assert.Equal("explain the word ephemeral", DriftDetectionWorker.FirstUserMessage(json));
    }

    [Fact]
    public void FirstUserMessage_NoUserRole_ReturnsNull()
    {
        const string json = """[{"Role":"system","Content":"sys only"}]""";
        Assert.Null(DriftDetectionWorker.FirstUserMessage(json));
    }

    [Fact]
    public void FirstUserMessage_Malformed_ReturnsNull()
    {
        Assert.Null(DriftDetectionWorker.FirstUserMessage("not json"));
        Assert.Null(DriftDetectionWorker.FirstUserMessage("{}"));
    }
}
