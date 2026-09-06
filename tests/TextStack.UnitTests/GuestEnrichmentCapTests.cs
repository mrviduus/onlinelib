using Application.Entitlements;
using Application.Vocabulary;
using Domain.Enums;

namespace TextStack.UnitTests;

/// <summary>
/// S12: saving a vocabulary word fires paid LLM enrichment (distractors + hint + explanation).
/// Every rate-limit policy in the API partitions on IP only, so without a per-tier ceiling
/// `POST /auth/guest` + word-saving is a free, account-less path to unmetered inference.
///
/// The cap is expressed as an entitlement rather than as a new mechanism because the meter already
/// exists: enrichment is queued exactly where a word gains `ActivatedAt`, which is what
/// `DailyCapService` already counts. The tier ceiling therefore clamps that cap instead of
/// introducing a second counter that could drift from it.
/// </summary>
public class GuestEnrichmentCapTests
{
    private const long Mb = 1024 * 1024;
    private const int GuestCap = 50;

    private static EntitlementOptions Options(int? guestCap = GuestCap, int? defaultCap = null) =>
        new(
            new TierEntitlements(500 * Mb, null, defaultCap),
            new Dictionary<string, TierEntitlements>
            {
                [nameof(UserTier.Guest)] = new(50 * Mb, 1, guestCap),
                [nameof(UserTier.Free)] = new(500 * Mb, null),
            },
            new HashSet<string>(StringComparer.OrdinalIgnoreCase),
            80 * Mb,
            20480 * Mb);

    private static EntitlementResolver Resolver(EntitlementOptions? options = null) =>
        new(options ?? Options());

    [Fact]
    public void Resolve_Guest_GetsDailyEnrichmentCap()
    {
        var result = Resolver().Resolve(UserTier.Free, isGuest: true, "guest-abc@guest.local", null);

        Assert.Equal(UserTier.Guest, result.Tier);
        Assert.Equal(GuestCap, result.DailyEnrichmentCap);
    }

    [Fact]
    public void Resolve_RegisteredUser_HasNoDailyEnrichmentCap()
    {
        var result = Resolver().Resolve(UserTier.Free, isGuest: false, "reader@example.com", null);

        Assert.Null(result.DailyEnrichmentCap);
    }

    [Fact]
    public void DailyEnrichmentCapFor_UnconfiguredTier_InheritsDefault()
    {
        // Same partial inheritance as the other quotas: an unset tier falls back to Default.
        var options = Options(guestCap: null, defaultCap: 200);

        Assert.Equal(200, options.DailyEnrichmentCapFor(UserTier.Guest));
    }

    [Fact]
    public void DailyEnrichmentCapFor_NonPositiveConfig_MeansUnlimited()
    {
        // A mistyped 0 must not lock every guest out of saving a single word — an over-permissive
        // typo costs money and is recoverable, a lockout silently breaks the product's core loop.
        var options = Options(guestCap: 0);

        Assert.Null(options.DailyEnrichmentCapFor(UserTier.Guest));
    }

    [Fact]
    public void EffectiveCap_GuestChoosingAHigherCap_IsClampedToTierCeiling()
    {
        // The user's own daily cap is a study-pacing preference; the tier ceiling is what the
        // platform is willing to pay for. A guest cannot raise their way past it.
        var guest = Resolver().Resolve(UserTier.Free, isGuest: true, "guest-abc@guest.local", null);

        var cap = DailyCapService.EffectiveCap(
            DailyCapService.DefaultDailyCap, guest.DailyEnrichmentCap);

        Assert.Equal(GuestCap, cap);
    }

    [Fact]
    public void EffectiveCap_GuestChoosingALowerCap_KeepsTheirOwnCap()
    {
        var guest = Resolver().Resolve(UserTier.Free, isGuest: true, "guest-abc@guest.local", null);

        var cap = DailyCapService.EffectiveCap(15, guest.DailyEnrichmentCap);

        Assert.Equal(15, cap);
    }

    [Fact]
    public void EffectiveCap_RegisteredUser_IsUnchangedByEntitlements()
    {
        // No cap configured for Free ⇒ behaviour is byte-identical to before S12 existed.
        var account = Resolver().Resolve(UserTier.Free, isGuest: false, "reader@example.com", null);

        var cap = DailyCapService.EffectiveCap(
            DailyCapService.DefaultDailyCap, account.DailyEnrichmentCap);

        Assert.Equal(DailyCapService.DefaultDailyCap, cap);
    }

    [Fact]
    public void EffectiveCap_GuestAtTheCeiling_HasNoRemainingEnrichment_AccountDoes()
    {
        // The whole point, in one assertion pair: after 50 words in a UTC day the guest's next save
        // lands in the pending buffer (no LLM call), while an account keeps going.
        var resolver = Resolver();
        var guest = resolver.Resolve(UserTier.Free, isGuest: true, "guest-abc@guest.local", null);
        var account = resolver.Resolve(UserTier.Free, isGuest: false, "reader@example.com", null);

        var guestStatus = DailyCapService.Compute(
            used: GuestCap,
            cap: DailyCapService.EffectiveCap(DailyCapService.DefaultDailyCap, guest.DailyEnrichmentCap));
        var accountStatus = DailyCapService.Compute(
            used: GuestCap,
            cap: DailyCapService.EffectiveCap(DailyCapService.DefaultDailyCap, account.DailyEnrichmentCap));

        Assert.Equal(0, guestStatus.Remaining);
        Assert.True(accountStatus.Remaining > 0);
    }

    [Fact]
    public void EffectiveCap_GuestBelowTheCeiling_StillHasRemainingEnrichment()
    {
        // 50/day must be an honest first encounter with the product, not a wall on word 3.
        var guest = Resolver().Resolve(UserTier.Free, isGuest: true, "guest-abc@guest.local", null);

        var status = DailyCapService.Compute(
            used: 49,
            cap: DailyCapService.EffectiveCap(DailyCapService.DefaultDailyCap, guest.DailyEnrichmentCap));

        Assert.Equal(1, status.Remaining);
    }
}
