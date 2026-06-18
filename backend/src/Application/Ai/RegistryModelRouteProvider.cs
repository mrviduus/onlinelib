using Application.Common.Interfaces;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Application.Ai;

/// <summary>
/// Table-driven primary routing (Phase 12 RLOps): resolves the PRIMARY provider key for
/// a feature from the <c>models</c> registry, the source of truth that admin
/// promote/rollback mutates. Holds ONE immutable snapshot (feature_tag → provider_key)
/// in <see cref="IMemoryCache"/> under a short absolute TTL (<c>Ai:Routes:CacheSeconds</c>,
/// default 30s); a promote/rollback calls <see cref="Invalidate"/> for an instant flip.
///
/// Singleton. Hot path: <see cref="PrimaryProviderKey"/> NEVER throws — any failure
/// (no DB, empty table, transient error) logs Debug + returns null so the gateway falls
/// through to its config route. The snapshot is built inside a fresh DI scope (the
/// singleton can't hold a scoped DbContext), guarded by a lock so a cache miss under load
/// does at most a brief double-build rather than a thundering herd of DB queries.
/// </summary>
public sealed class RegistryModelRouteProvider(
    IServiceScopeFactory scopeFactory,
    IMemoryCache cache,
    IConfiguration config,
    ILogger<RegistryModelRouteProvider> logger) : global::TextStack.Ai.Core.IModelRouteProvider
{
    private const string CacheKey = "ai:routes:primary";
    private readonly Lock _gate = new();

    public string? PrimaryProviderKey(string featureTag)
    {
        if (string.IsNullOrWhiteSpace(featureTag))
            return null;

        try
        {
            var snapshot = GetOrBuildSnapshot();
            return snapshot.TryGetValue(featureTag, out var key) ? key : null;
        }
        catch (Exception ex)
        {
            // Hot path: never throw. The gateway falls through to its config route.
            logger.LogDebug(ex, "Primary route lookup failed for feature '{Feature}'; falling through", featureTag);
            return null;
        }
    }

    public void Invalidate() => cache.Remove(CacheKey);

    private IReadOnlyDictionary<string, string> GetOrBuildSnapshot()
    {
        if (cache.TryGetValue(CacheKey, out IReadOnlyDictionary<string, string>? cached) && cached is not null)
            return cached;

        // Serialize the (re)build so concurrent misses don't all hit the DB. Double-check
        // inside the lock in case another thread just populated it.
        lock (_gate)
        {
            if (cache.TryGetValue(CacheKey, out cached) && cached is not null)
                return cached;

            var snapshot = BuildSnapshot();
            var ttl = TimeSpan.FromSeconds(config.GetValue("Ai:Routes:CacheSeconds", 30));
            cache.Set(CacheKey, snapshot, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = ttl });
            return snapshot;
        }
    }

    private IReadOnlyDictionary<string, string> BuildSnapshot()
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();

        // One Primary per feature SHOULD be enforced by a partial unique index. But this is
        // the LLM hot path: if that index ever fails to enforce (mis-filtered migration, a
        // manual DB edit, a not-yet-applied migration), two Primary rows for one feature must
        // NOT crash every call via a duplicate-key ToDictionary. Group defensively and take
        // the first deterministically (oldest by CreatedAt) so routing stays deterministic.
        var primaries = db.Models
            .AsNoTracking()
            .Where(m => m.Status == ModelStatus.Primary)
            .OrderBy(m => m.CreatedAt)
            .Select(m => new { m.FeatureTag, m.ProviderKey })
            .ToList();

        var snapshot = new Dictionary<string, string>(primaries.Count);
        foreach (var p in primaries)
            snapshot.TryAdd(p.FeatureTag, p.ProviderKey); // first (oldest) wins; dupes ignored
        return snapshot;
    }
}
