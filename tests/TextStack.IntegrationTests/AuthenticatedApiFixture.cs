using System.Net;
using System.Net.Http.Json;

namespace TextStack.IntegrationTests;

/// <summary>
/// Fixture that authenticates via test-login and maintains cookie-based session.
/// Requires: ENABLE_TEST_AUTH=true in docker compose.
/// Handles Secure cookies over HTTP by manually extracting Set-Cookie values.
/// </summary>
public class AuthenticatedApiFixture : IAsyncLifetime
{
    public HttpClient Client { get; private set; } = null!;

    public const string TestHost = "localhost";
    public const string AdminHost = "textstack.dev";
    public const string TestEmail = "integration-test@textstack.app";

    private string _cookieHeader = string.Empty;
    private bool _loginAvailable;

    public async ValueTask InitializeAsync()
    {
        var baseUrl = Environment.GetEnvironmentVariable("API_URL") ?? "http://localhost:8080";

        Client = new HttpClient
        {
            BaseAddress = new Uri(baseUrl),
            Timeout = TimeSpan.FromSeconds(30)
        };

        // Authenticate — extract Set-Cookie manually (Secure cookies don't stick over HTTP)
        var loginRequest = new HttpRequestMessage(HttpMethod.Post, "/auth/test-login");
        loginRequest.Headers.Host = TestHost;
        loginRequest.Content = JsonContent.Create(new { email = TestEmail });

        var resp = await Client.SendAsync(loginRequest);
        if (resp.StatusCode == HttpStatusCode.NotFound)
            return; // test-login not enabled

        // Retry once — handles race condition when parallel fixtures create the same test user
        if (!resp.IsSuccessStatusCode)
        {
            await Task.Delay(500);
            loginRequest = new HttpRequestMessage(HttpMethod.Post, "/auth/test-login");
            loginRequest.Headers.Host = TestHost;
            loginRequest.Content = JsonContent.Create(new { email = TestEmail });
            resp = await Client.SendAsync(loginRequest);
        }

        resp.EnsureSuccessStatusCode();
        _loginAvailable = true;

        // Extract cookie values from Set-Cookie headers
        if (resp.Headers.TryGetValues("Set-Cookie", out var cookies))
        {
            var parts = new List<string>();
            foreach (var c in cookies)
            {
                // "access_token=xxx; path=/; ..." → take "access_token=xxx"
                var nameValue = c.Split(';')[0].Trim();
                if (!string.IsNullOrEmpty(nameValue))
                    parts.Add(nameValue);
            }
            _cookieHeader = string.Join("; ", parts);
        }
    }

    public HttpRequestMessage CreateRequest(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Host = TestHost;
        if (!string.IsNullOrEmpty(_cookieHeader))
            request.Headers.Add("Cookie", _cookieHeader);
        return request;
    }

    public HttpRequestMessage CreateAdminRequest(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Host = AdminHost;
        if (!string.IsNullOrEmpty(_cookieHeader))
            request.Headers.Add("Cookie", _cookieHeader);
        return request;
    }

    public bool IsAuthenticated => _loginAvailable;

    public ValueTask DisposeAsync()
    {
        Client?.Dispose();
        return ValueTask.CompletedTask;
    }
}
