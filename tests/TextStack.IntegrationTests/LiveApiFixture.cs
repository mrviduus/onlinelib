namespace TextStack.IntegrationTests;

/// <summary>
/// Test fixture that connects to the running API at localhost:8080.
/// Requires: docker compose up (API must be running)
/// </summary>
public class LiveApiFixture : IDisposable
{
    public HttpClient Client { get; }

    // Test host for Host header (matches seeded Site domain in DB)
    public const string TestHost = "localhost";

    // Admin API base
    public const string AdminHost = "textstack.dev";

    public LiveApiFixture()
    {
        var baseUrl = Environment.GetEnvironmentVariable("API_URL") ?? "http://localhost:8080";

        // UseCookies=false: tests pass the Cookie header explicitly via CreateRequest
        // or Req() helpers. Default SocketsHttpHandler accumulates Set-Cookie across
        // requests, which leaks auth from one test into "_WithoutAuth" tests and
        // causes 404 (highlight not found) instead of 401.
        Client = new HttpClient(new HttpClientHandler { UseCookies = false })
        {
            BaseAddress = new Uri(baseUrl),
            Timeout = TimeSpan.FromSeconds(30)
        };
    }

    /// <summary>
    /// Creates a request with proper Host header for public API
    /// </summary>
    public HttpRequestMessage CreateRequest(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Host = TestHost;
        return request;
    }

    /// <summary>
    /// Creates a request with admin Host header
    /// </summary>
    public HttpRequestMessage CreateAdminRequest(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Host = AdminHost;
        return request;
    }

    public void Dispose()
    {
        Client.Dispose();
    }
}
