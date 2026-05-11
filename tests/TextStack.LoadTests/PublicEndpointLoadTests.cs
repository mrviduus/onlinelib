using System.Net.Http.Json;
using LoadSurge.Models;
using LoadSurge.Runner;

namespace TextStack.LoadTests;

/// <summary>
/// Load tests for the public read-side hot-paths on textstack.app.
///
/// Tagged <c>[Trait("Category", "Load")]</c> so a vanilla <c>dotnet test</c>
/// won't run them — they're slow and they hammer real endpoints. To run:
///
///   dotnet test tests/TextStack.LoadTests --filter Category=Load
///
/// Target + concurrency + duration are env-tunable so the same fact
/// works locally (<c>http://localhost:8080</c>) and against prod
/// (<c>https://textstack.app</c>):
///
///   TEXTSTACK_TARGET=https://textstack.app
///   TEXTSTACK_CONCURRENCY=50
///   TEXTSTACK_DURATION_SECONDS=30
///
/// All scenarios are READ-ONLY against prod. No vocab saves, no DB
/// writes — translate/explain are the realistic public hot-paths.
/// </summary>
[Trait("Category", "Load")]
public sealed class PublicEndpointLoadTests : IDisposable
{
    private readonly HttpClient _http;
    private readonly ITestOutputHelper _output;
    private readonly int _concurrency;
    private readonly TimeSpan _duration;

    // Realistic words a DDIA reader would tap. Rotating through them
    // forces some cache hits and some misses, so the run hits both the
    // disk-cache fast-path and the OpenAI slow-path.
    private static readonly string[] TranslateWords =
    {
        "polling", "warehouse", "attention", "linearizability",
        "consistency", "throughput", "partition", "replication",
        "consensus", "vector", "checkpoint", "leader",
    };

    public PublicEndpointLoadTests(ITestOutputHelper output)
    {
        _output = output;
        var target = Environment.GetEnvironmentVariable("TEXTSTACK_TARGET")
            ?? "http://localhost:8080";
        _concurrency = int.Parse(
            Environment.GetEnvironmentVariable("TEXTSTACK_CONCURRENCY") ?? "50");
        _duration = TimeSpan.FromSeconds(int.Parse(
            Environment.GetEnvironmentVariable("TEXTSTACK_DURATION_SECONDS") ?? "30"));

        _http = new HttpClient { BaseAddress = new Uri(target) };
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("textstack-loadtest/1.0");
    }

    [Fact]
    public async Task Translate_HoldsConcurrency()
    {
        var counter = 0;
        var result = await RunPlan("translate", async () =>
        {
            var i = Interlocked.Increment(ref counter);
            var body = new
            {
                text = TranslateWords[i % TranslateWords.Length],
                sourceLang = "en",
                targetLang = "ru",
            };
            var resp = await _http.PostAsJsonAsync("/api/translate", body);
            return resp.IsSuccessStatusCode;
        });

        Assert.True(result.Success > 0, "no successful translate requests at all");
    }

    [Fact]
    public async Task Explain_HoldsConcurrency()
    {
        var counter = 0;
        var result = await RunPlan("explain", async () =>
        {
            var i = Interlocked.Increment(ref counter);
            var word = TranslateWords[i % TranslateWords.Length];
            var body = new
            {
                word,
                sentence = $"A distributed system relies on {word} to stay consistent.",
                targetLang = "ru",
            };
            var resp = await _http.PostAsJsonAsync("/api/explain", body);
            return resp.IsSuccessStatusCode;
        });

        Assert.True(result.Success > 0, "no successful explain requests at all");
    }

    [Fact]
    public async Task Health_StaysGreen()
    {
        // Trivial sanity load — every request is /health, every response should
        // be 200. If this fails under our chosen concurrency, something
        // upstream (nginx, kestrel, db) is the bottleneck, not the LLM path.
        var result = await RunPlan("health", async () =>
        {
            var resp = await _http.GetAsync("/health");
            return resp.IsSuccessStatusCode;
        });

        var successRate = result.Total > 0 ? (double)result.Success / result.Total : 0;
        Assert.True(successRate > 0.95, $"health success rate {successRate:P1} under {_concurrency} VU");
    }

    private async Task<LoadResult> RunPlan(string name, Func<Task<bool>> action)
    {
        _output.WriteLine($"Target:      {_http.BaseAddress}");
        _output.WriteLine($"Scenario:    {name}");
        _output.WriteLine($"Concurrency: {_concurrency}");
        _output.WriteLine($"Duration:    {_duration.TotalSeconds}s");

        var plan = new LoadExecutionPlan
        {
            Name = $"textstack_{name}",
            Settings = new LoadSettings
            {
                Concurrency = _concurrency,
                Duration = _duration,
                Interval = TimeSpan.FromMilliseconds(100),
            },
            Action = action,
        };

        var result = await LoadRunner.Run(plan);

        _output.WriteLine("");
        _output.WriteLine("==== RESULT ====");
        _output.WriteLine($"Total:    {result.Total}");
        _output.WriteLine($"Success:  {result.Success}");
        _output.WriteLine($"Failed:   {result.Failure}");
        _output.WriteLine($"RPS:      {result.RequestsPerSecond:F1}");
        _output.WriteLine($"Avg ms:   {result.AverageLatency:F1}");
        _output.WriteLine($"P95 ms:   {result.Percentile95Latency:F1}");

        return result;
    }

    public void Dispose() => _http.Dispose();
}
