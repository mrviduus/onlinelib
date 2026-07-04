using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.DependencyInjection;

namespace Api.Extensions;

public static partial class ServiceCollectionExtensions
{
    /// <summary>
    /// All rate-limiter policies (login, device grant, guest, clip/upload, TTS,
    /// translation, dictionary, explain, semantic search, RAG, agents, crews,
    /// account-delete) plus the shared rejection/Retry-After behavior.
    /// Verbatim move from Program.cs — no policy, limit, or window changed.
    /// </summary>
    public static IServiceCollection AddTextStackRateLimiting(this IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            options.AddFixedWindowLimiter("admin-login", opt =>
            {
                opt.Window = TimeSpan.FromMinutes(1);
                opt.PermitLimit = 5;
                opt.QueueLimit = 0;
            });
            options.AddFixedWindowLimiter("user-login", opt =>
            {
                opt.Window = TimeSpan.FromMinutes(1);
                opt.PermitLimit = 10;
                opt.QueueLimit = 0;
            });
            // Device Authorization Grant (RFC 8628, AI-050a) — all per-IP.
            // device-code: CLI requests a device_code; one per CLI session, 5/min is ample.
            options.AddPolicy("device-code", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 5,
                    QueueLimit = 0,
                });
            });
            // device-token: CLI polls the token endpoint ~every 5s (interval); 12/min covers
            // honest polling with headroom and still caps scripted abuse.
            options.AddPolicy("device-token", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 12,
                    QueueLimit = 0,
                });
            });
            // device-approve: authed consent action; one submit per CLI session. 10/min per IP.
            options.AddPolicy("device-approve", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 10,
                    QueueLimit = 0,
                });
            });
            // Per-IP partition — bot with one IP can't exhaust the limit for everyone.
            // 3 guest-creates per 5min per IP: covers legit shared-WiFi cases, blocks scripted abuse.
            // ForwardedHeaders runs before RateLimiter in the pipeline, so RemoteIpAddress is the real client.
            options.AddPolicy("guest-session", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(5),
                    PermitLimit = 3,
                    QueueLimit = 0,
                });
            });
            // "Send to TextStack" web clip receiver — per-IP cap. Each clip queues an
            // ingestion job + stores HTML, so this blocks scripted bulk-clipping while
            // staying generous for a human saving a handful of articles in a session.
            options.AddPolicy("clip", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 20,
                    QueueLimit = 0,
                });
            });
            // User book upload — per-IP cap, mirrors the clip zone. Uploads are heavier
            // (file ingestion) so the same conservative bucket applies.
            options.AddPolicy("user-upload", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 20,
                    QueueLimit = 0,
                });
            });
            // TTS synthesis — per-IP cap. Generous enough for bursty vocab-review /
            // reader-tap usage (~2/s average, tolerates ~20-req bursts via window
            // timing), but blocks scripted abuse hammering the upstream Bing WS.
            // ETag + server+client cache mean most requests are cheap; this limit
            // primarily protects synthesis (uncached) throughput.
            options.AddPolicy("tts", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 120,
                    QueueLimit = 0,
                });
            });
            // TTS voices list — cheap (served from 24h server cache), typically
            // called once per session at voice-picker mount. Separate bucket with
            // a much higher cap so a user burning through synthesis budget can
            // still open the voice picker.
            options.AddPolicy("tts-voices", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 600,
                    QueueLimit = 0,
                });
            });
            // Translation — per-IP. OpenAI is the upstream cost; users
            // typically call 1-3 times per reading session via SelectionToolbar.
            // 30/min is generous for normal UX, blocks scripted scraping of the
            // translation service.
            options.AddPolicy("translate", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 30,
                    QueueLimit = 0,
                });
            });
            // Dictionary lookup — per-IP. Proxies Free Dictionary API (cheap,
            // public). Users tap words rapidly while reading; 60/min fits the
            // natural pace and still caps scripted abuse.
            options.AddPolicy("dictionary", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 60,
                    QueueLimit = 0,
                });
            });
            // /explain — Claude/OpenAI-backed contextual explanation. Paid API
            // call per miss (cache fronts it). 20/min per IP is plenty for
            // active reading; anything higher smells like scripting.
            options.AddPolicy("explain", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 20,
                    QueueLimit = 0,
                });
            });
            // Hybrid catalog search (AI-057): semantic=true embeds the query (one paid OpenAI embedding
            // call per request) before the $0 pgvector scan, so it gets its own per-IP throttle. CRITICAL:
            // this policy is a NO-OP unless `semantic` is truthy — the pure-FTS path (semantic absent/false)
            // consumes no partition and stays completely unthrottled (zero new cost/latency).
            options.AddPolicy("search-semantic", httpContext =>
            {
                var semantic = httpContext.Request.Query["semantic"].ToString();
                var isSemantic = semantic.Equals("true", StringComparison.OrdinalIgnoreCase)
                                 || semantic == "1";
                if (!isSemantic)
                    return RateLimitPartition.GetNoLimiter("search-fts");

                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter("semantic:" + ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 20,
                    QueueLimit = 0,
                });
            });
            // "Ask this book" (RAG) — one LLM call per request, per-user reading. 30/min per IP is
            // generous for genuine use and caps scripted abuse.
            options.AddPolicy("rag.ask", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 30,
                    QueueLimit = 0,
                });
            });
            // On-demand "Ask this book" index trigger (Phase 1): per-IP cap so a user can't mass-index
            // the whole catalog. ~20/hour — generous for legit "index this book then poll" flows.
            options.AddPolicy("rag.index", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromHours(1),
                    PermitLimit = 20,
                    QueueLimit = 0,
                });
            });
            // Study Buddy agent (AI-037): each run is several LLM calls, so a tighter per-IP limit.
            options.AddPolicy("studybuddy", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 8,
                    QueueLimit = 0,
                });
            });
            // Librarian agent (AI-Agent-3): each run is several LLM calls + maybe external HTTP, so a tight per-IP cap.
            options.AddPolicy("librarian", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 8,
                    QueueLimit = 0,
                });
            });
            // Learning Tutor agent (AI-Agent-2): each planning turn is several LLM calls + DB reads, so a tight per-IP
            // cap. Mirrors the librarian policy shape.
            options.AddPolicy("tutor", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 8,
                    QueueLimit = 0,
                });
            });
            // AutoPublish crew (AI-042): an admin generate is TWO 4-stage crews = 8 LLM calls, so a tight per-IP cap.
            // Mirrors the studybuddy policy shape; it sits behind admin auth too, this is just runaway protection.
            options.AddPolicy("autopublish.crew", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 4,
                    QueueLimit = 0,
                });
            });
            // SEO crew (AI-043): one 4-stage crew = 4 LLM calls per admin generate. Same tight per-IP cap as
            // autopublish.crew; sits behind admin auth too, this is just runaway protection.
            options.AddPolicy("seo.crew", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(1),
                    PermitLimit = 4,
                    QueueLimit = 0,
                });
            });
            // Account deletion — destructive and irreversible (GDPR hard delete). A user
            // never needs to call this more than once, so a tight per-IP cap blocks abuse
            // (e.g. scripted churn against the cascade delete) while staying out of the way
            // of a legitimate retry after a transient failure.
            options.AddPolicy("account-delete", httpContext =>
            {
                var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
                {
                    Window = TimeSpan.FromMinutes(5),
                    PermitLimit = 3,
                    QueueLimit = 0,
                });
            });
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            // Emit Retry-After so clients can back off intelligently instead of
            // hammering in a tight retry loop. RateLimiter exposes the metadata
            // via lease.TryGetMetadata when available.
            options.OnRejected = (context, ct) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    var seconds = (int)Math.Ceiling(retryAfter.TotalSeconds);
                    context.HttpContext.Response.Headers.RetryAfter = seconds.ToString();
                }
                return ValueTask.CompletedTask;
            };
        });

        return services;
    }
}
