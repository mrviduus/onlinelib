namespace TextStack.Ai.Core;

/// <summary>
/// Resolves the PRIMARY provider key for a feature tag from the <c>models</c> registry
/// (the table-driven source of truth, set by admin promote/rollback). The
/// ModelGateway consults this BEFORE its config fallback, so a promotion takes effect
/// without a redeploy. Hot path: the implementation MUST cache and MUST NEVER throw —
/// any failure (no DB, empty registry, race) returns <c>null</c> so the gateway falls
/// straight through to its config route. Implemented in Application (EF kept out of Llm).
/// </summary>
public interface IModelRouteProvider
{
    /// <summary>Primary provider key for the feature, or null when none is registered
    /// or on ANY failure (never throws). Cached for a short TTL.</summary>
    string? PrimaryProviderKey(string featureTag);

    /// <summary>Drop the cached snapshot so the next read rebuilds from the registry
    /// (called after a promote/rollback writes a new Primary).</summary>
    void Invalidate();
}
