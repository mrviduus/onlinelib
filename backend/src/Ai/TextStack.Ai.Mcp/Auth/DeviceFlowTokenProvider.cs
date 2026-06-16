using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;

namespace TextStack.Ai.Mcp.Auth;

/// <summary>
/// The real (default) <see cref="IMcpTokenProvider"/> for the headless MCP CLI:
/// implements the OAuth 2.0 Device Authorization Grant (RFC 8628) client built in
/// AI-050a's endpoints.
///
/// Non-blocking by design — a tool call must never hang on the user approving in a
/// browser. <see cref="GetTokenAsync"/> resolves in priority order:
///   1. cached access token still valid (local JWT <c>exp</c> check) → Authorized;
///   2. cached refresh token → body-based refresh (<c>/auth/refresh-mobile</c>)
///      → cache + Authorized, falling through on 401/failure;
///   3. otherwise start a device flow if none is running (single-flight), print
///      the verification URL + code to STDERR, kick off a BACKGROUND poll, and
///      IMMEDIATELY return Pending; subsequent calls return Pending until the
///      background poll caches tokens, after which they return Authorized.
///
/// Thread-safety: a single lock guards the cached tokens and the in-flight flow
/// so concurrent tool calls never start two flows or tear the cache. The poll
/// runs on a tracked background task and never writes to stdout.
/// </summary>
public sealed class DeviceFlowTokenProvider : IMcpTokenProvider
{
    // Treat the access token as expired this far ahead of its real exp so an
    // in-flight request can't race the clock and 401 mid-call.
    private static readonly TimeSpan ExpirySkew = TimeSpan.FromSeconds(30);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly HttpClient _http;
    private readonly TokenCache _cache;
    private readonly ILogger<DeviceFlowTokenProvider> _logger;
    private readonly TimeProvider _time;
    // Test seam: floor for the poll interval so tests don't sleep real seconds.
    private readonly TimeSpan _minPollInterval;

    private readonly object _gate = new();
    private CachedTokens? _tokens;
    private InFlightFlow? _inFlight;
    // Single-flight slot for the /auth/device/code POST itself: concurrent first-callers
    // share this ONE request instead of each firing their own (which would orphan
    // server-side device codes). Set under _gate before awaiting the network call.
    private Task<DeviceCodeResponse>? _deviceCodeRequest;

    public DeviceFlowTokenProvider(
        HttpClient http,
        TokenCache cache,
        ILogger<DeviceFlowTokenProvider> logger,
        TimeProvider? time = null,
        TimeSpan? minPollInterval = null)
    {
        _http = http;
        _cache = cache;
        _logger = logger;
        _time = time ?? TimeProvider.System;
        _minPollInterval = minPollInterval ?? TimeSpan.FromSeconds(1);
        _tokens = cache.Read();
    }

    public async Task<TokenResult> GetTokenAsync(CancellationToken ct)
    {
        // 1. Cached, unexpired access token → Authorized.
        CachedTokens? cached;
        InFlightFlow? pendingFlow;
        lock (_gate)
        {
            cached = _tokens;
            pendingFlow = _inFlight;
        }

        if (cached is not null && !IsExpired(cached.AccessToken))
            return new TokenResult.Authorized(cached.AccessToken);

        // 2. Cached refresh token → try a body-based refresh.
        if (cached is not null && !string.IsNullOrEmpty(cached.RefreshToken))
        {
            var refreshed = await TryRefreshAsync(cached.RefreshToken, ct);
            if (refreshed is not null)
            {
                StoreTokens(refreshed);
                return new TokenResult.Authorized(refreshed.AccessToken);
            }
            // Refresh failed (401 / transport) → fall through to a device flow.
        }

        // 3. A flow is already in flight (its user_code is known) → relay Pending.
        if (pendingFlow is not null)
            return new TokenResult.Pending(pendingFlow.VerificationUri, pendingFlow.UserCode);

        // 3b. Start (or join) the single-flight device-code request and return Pending.
        return await StartOrJoinDeviceFlowAsync(ct);
    }

    // ── device flow start (non-blocking, single-flight on the /auth/device/code POST) ─

    private async Task<TokenResult> StartOrJoinDeviceFlowAsync(CancellationToken ct)
    {
        // Claim the single-flight slot UNDER the lock, BEFORE any network I/O, so N
        // concurrent first-callers share ONE /auth/device/code POST. The winner owns
        // the request task; losers await the same task and return the same Pending.
        Task<DeviceCodeResponse> request;
        bool isWinner;
        lock (_gate)
        {
            // Another caller already obtained a code while we waited on the lock.
            if (_inFlight is not null)
                return new TokenResult.Pending(_inFlight.VerificationUri, _inFlight.UserCode);

            if (_deviceCodeRequest is null)
            {
                // We are the winner: create the shared request task under the lock.
                _deviceCodeRequest = RequestDeviceCodeAsync();
                isWinner = true;
            }
            else
            {
                isWinner = false;
            }
            request = _deviceCodeRequest;
        }

        DeviceCodeResponse code;
        try
        {
            // Awaited outside the lock. ct is the WINNER's caller token; losers pass
            // their own ct below. A cancelled loser stops waiting without killing the
            // shared request (it runs on CancellationToken.None inside RequestDeviceCodeAsync).
            code = await request.WaitAsync(ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // The caller cancelled while waiting — propagate. The shared request lives
            // on for other callers; on its own failure it self-clears the slot.
            throw;
        }
        catch (Exception)
        {
            // The shared device-code POST failed (network/parse). Clear the slot so a
            // later cold call can retry rather than wedging on a dead task.
            ClearDeviceCodeRequest(request);
            return new TokenResult.Failed("could not reach TextStack to start device authorization");
        }

        // Promote the shared request into an in-flight flow + background poll EXACTLY
        // once. The lock makes this idempotent across all concurrent callers.
        InFlightFlow flow;
        lock (_gate)
        {
            if (_inFlight is not null)
                return new TokenResult.Pending(_inFlight.VerificationUri, _inFlight.UserCode);

            flow = new InFlightFlow(code.VerificationUri ?? "", code.UserCode!);
            _inFlight = flow;

            // STDERR only — stdout is reserved for JSON-RPC framing. Logged once,
            // under the lock, by whichever caller wins the promotion.
            _logger.LogInformation(
                "To connect TextStack, open {VerificationUri} and enter code {UserCode}",
                flow.VerificationUri, flow.UserCode);

            // Background poll — fire-and-track, never awaited by the tool call.
            flow.PollTask = Task.Run(() => PollLoopAsync(code), CancellationToken.None);
        }

        _ = isWinner; // winner vs. loser only differs in who created the task above.
        return new TokenResult.Pending(flow.VerificationUri, flow.UserCode);
    }

    // Performs the actual /auth/device/code POST on CancellationToken.None so a single
    // caller's cancellation can't tear down the request shared by other concurrent
    // callers. Throws on failure (caller clears the slot to make it retryable).
    private async Task<DeviceCodeResponse> RequestDeviceCodeAsync()
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/auth/device/code");
        using var response = await _http.SendAsync(request, CancellationToken.None);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException("could not start TextStack device authorization");

        var parsed = await response.Content.ReadFromJsonAsync<DeviceCodeResponse>(JsonOptions);
        if (parsed is null || string.IsNullOrEmpty(parsed.DeviceCode) || string.IsNullOrEmpty(parsed.UserCode))
            throw new InvalidOperationException("could not start TextStack device authorization");

        return parsed;
    }

    // ── background polling loop ───────────────────────────────────────────────────

    private async Task PollLoopAsync(DeviceCodeResponse code)
    {
        var interval = ClampInterval(code.Interval);
        var lifetime = code.ExpiresIn > 0 ? TimeSpan.FromSeconds(code.ExpiresIn) : TimeSpan.FromMinutes(10);
        var deadline = _time.GetUtcNow() + lifetime;

        try
        {
            while (_time.GetUtcNow() < deadline)
            {
                await Task.Delay(interval, _time, CancellationToken.None);

                PollOutcome outcome;
                try
                {
                    outcome = await PollOnceAsync(code.DeviceCode!);
                }
                catch (Exception)
                {
                    // Transport blip — keep polling until the device code expires.
                    continue;
                }

                switch (outcome.Kind)
                {
                    case PollKind.Approved:
                        StoreTokens(outcome.Tokens!);
                        ClearInFlight();
                        return;
                    case PollKind.Pending:
                        continue; // keep waiting for the user to approve
                    case PollKind.SlowDown:
                        interval += TimeSpan.FromSeconds(5);
                        continue;
                    case PollKind.Terminal:
                        ClearInFlight(); // expired_token / access_denied → allow a fresh flow later
                        return;
                }
            }
        }
        finally
        {
            // Lifetime exhausted without approval → clear so a later call re-initiates.
            ClearInFlight();
        }
    }

    private async Task<PollOutcome> PollOnceAsync(string deviceCode)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/auth/device/token")
        {
            Content = JsonContent.Create(new DeviceTokenRequestBody(
                "urn:ietf:params:oauth:grant-type:device_code", deviceCode)),
        };
        using var response = await _http.SendAsync(request, CancellationToken.None);

        if (response.StatusCode == HttpStatusCode.OK)
        {
            var body = await response.Content.ReadFromJsonAsync<DeviceTokenResponse>(JsonOptions);
            if (body is null || string.IsNullOrEmpty(body.AccessToken))
                return PollOutcome.Terminal;

            var refresh = body.RefreshToken ?? "";
            var expiresAt = ReadExp(body.AccessToken) ?? _time.GetUtcNow().AddMinutes(15);
            return PollOutcome.Approved(new CachedTokens(body.AccessToken, refresh, expiresAt));
        }

        if (response.StatusCode == HttpStatusCode.BadRequest)
        {
            var err = await response.Content.ReadFromJsonAsync<DeviceErrorResponse>(JsonOptions);
            return err?.Error switch
            {
                "authorization_pending" => PollOutcome.Pending,
                "slow_down" => PollOutcome.SlowDown,
                _ => PollOutcome.Terminal, // expired_token / access_denied / anything else
            };
        }

        // Any other status: treat as a transient blip — keep polling.
        return PollOutcome.Pending;
    }

    // ── body-based refresh (/auth/refresh-mobile) ─────────────────────────────────

    private async Task<CachedTokens?> TryRefreshAsync(string refreshToken, CancellationToken ct)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/auth/refresh-mobile")
            {
                Content = JsonContent.Create(new RefreshRequestBody(refreshToken)),
            };
            using var response = await _http.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode)
                return null;

            var body = await response.Content.ReadFromJsonAsync<MobileAuthBody>(JsonOptions, ct);
            if (body is null || string.IsNullOrEmpty(body.AccessToken))
                return null;

            var newRefresh = string.IsNullOrEmpty(body.RefreshToken) ? refreshToken : body.RefreshToken;
            var expiresAt = ReadExp(body.AccessToken) ?? _time.GetUtcNow().AddMinutes(15);
            return new CachedTokens(body.AccessToken, newRefresh, expiresAt);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception)
        {
            return null;
        }
    }

    /// <summary>
    /// Test seam: awaits the current in-flight device-flow poll (if any) so tests
    /// can deterministically wait for the background loop to finish instead of
    /// racing on wall-clock sleeps. No-op when no flow is running.
    /// </summary>
    internal async Task WaitForBackgroundPollAsync()
    {
        Task? poll;
        lock (_gate)
        {
            poll = _inFlight?.PollTask;
        }
        if (poll is not null)
            await poll;
    }

    // ── state helpers ─────────────────────────────────────────────────────────────

    private void StoreTokens(CachedTokens tokens)
    {
        lock (_gate)
        {
            _tokens = tokens;
        }
        _cache.Write(tokens);
    }

    private void ClearInFlight()
    {
        lock (_gate)
        {
            _inFlight = null;
            // Clear the device-code slot too so a later cold call re-initiates cleanly
            // (terminal/expiry/success all funnel through here).
            _deviceCodeRequest = null;
        }
    }

    // Clears the device-code single-flight slot iff it still points at the failed
    // request, so a subsequent GetTokenAsync retries with a fresh POST instead of
    // re-awaiting a faulted task. Guarded so we never clobber a newer request.
    private void ClearDeviceCodeRequest(Task<DeviceCodeResponse> failed)
    {
        lock (_gate)
        {
            if (ReferenceEquals(_deviceCodeRequest, failed))
                _deviceCodeRequest = null;
        }
    }

    private bool IsExpired(string accessToken)
    {
        var exp = ReadExp(accessToken);
        // Unparseable / no exp → treat as expired (force refresh / re-auth).
        if (exp is null)
            return true;
        return _time.GetUtcNow() >= exp.Value - ExpirySkew;
    }

    private TimeSpan ClampInterval(int seconds)
    {
        var requested = seconds > 0 ? TimeSpan.FromSeconds(seconds) : TimeSpan.FromSeconds(5);
        return requested < _minPollInterval ? _minPollInterval : requested;
    }

    // ── local JWT exp decode (NO signature validation) ────────────────────────────

    /// <summary>
    /// Reads the <c>exp</c> claim (Unix seconds) from a JWT's payload segment
    /// WITHOUT validating the signature — we only need the expiry to decide whether
    /// to refresh. Returns null for any malformed / missing-exp token (caller
    /// treats null as expired).
    /// </summary>
    internal static DateTimeOffset? ReadExp(string jwt)
    {
        try
        {
            var parts = jwt.Split('.');
            if (parts.Length < 2)
                return null;

            var payload = Base64UrlDecode(parts[1]);
            using var doc = JsonDocument.Parse(payload);
            if (!doc.RootElement.TryGetProperty("exp", out var expElement))
                return null;

            // exp may be a number or (rarely) a numeric string.
            long exp = expElement.ValueKind switch
            {
                JsonValueKind.Number when expElement.TryGetInt64(out var n) => n,
                JsonValueKind.String when long.TryParse(expElement.GetString(), out var s) => s,
                _ => -1,
            };
            if (exp < 0)
                return null;

            return DateTimeOffset.FromUnixTimeSeconds(exp);
        }
        catch
        {
            return null;
        }
    }

    private static byte[] Base64UrlDecode(string segment)
    {
        var s = segment.Replace('-', '+').Replace('_', '/');
        switch (s.Length % 4)
        {
            case 2: s += "=="; break;
            case 3: s += "="; break;
        }
        return Convert.FromBase64String(s);
    }

    // ── in-flight flow state ──────────────────────────────────────────────────────

    private sealed class InFlightFlow(string verificationUri, string userCode)
    {
        public string VerificationUri { get; } = verificationUri;
        public string UserCode { get; } = userCode;
        public Task? PollTask { get; set; }
    }

    // ── poll outcome ──────────────────────────────────────────────────────────────

    private enum PollKind { Approved, Pending, SlowDown, Terminal }

    private readonly struct PollOutcome
    {
        public PollKind Kind { get; private init; }
        public CachedTokens? Tokens { get; private init; }

        public static PollOutcome Approved(CachedTokens tokens) =>
            new() { Kind = PollKind.Approved, Tokens = tokens };
        public static PollOutcome Pending => new() { Kind = PollKind.Pending };
        public static PollOutcome SlowDown => new() { Kind = PollKind.SlowDown };
        public static PollOutcome Terminal => new() { Kind = PollKind.Terminal };
    }

    // ── wire DTOs (device endpoints use snake_case; refresh uses camelCase) ────────

    private sealed record DeviceCodeResponse(
        [property: JsonPropertyName("device_code")] string? DeviceCode,
        [property: JsonPropertyName("user_code")] string? UserCode,
        [property: JsonPropertyName("verification_uri")] string? VerificationUri,
        [property: JsonPropertyName("verification_uri_complete")] string? VerificationUriComplete,
        [property: JsonPropertyName("expires_in")] int ExpiresIn,
        [property: JsonPropertyName("interval")] int Interval);

    private sealed record DeviceTokenRequestBody(
        [property: JsonPropertyName("grant_type")] string GrantType,
        [property: JsonPropertyName("device_code")] string DeviceCode);

    private sealed record DeviceTokenResponse(
        [property: JsonPropertyName("access_token")] string? AccessToken,
        [property: JsonPropertyName("refresh_token")] string? RefreshToken,
        [property: JsonPropertyName("token_type")] string? TokenType);

    private sealed record DeviceErrorResponse(
        [property: JsonPropertyName("error")] string? Error);

    private sealed record RefreshRequestBody(
        [property: JsonPropertyName("refreshToken")] string RefreshToken);

    private sealed record MobileAuthBody(
        [property: JsonPropertyName("accessToken")] string? AccessToken,
        [property: JsonPropertyName("refreshToken")] string? RefreshToken);
}
