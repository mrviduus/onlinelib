using Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace Infrastructure.Persistence;

/// <summary>
/// Write-side site stamping (R1b). Fills <see cref="ISiteScoped.SiteId"/> on
/// newly-added entities that don't already carry one, so call sites no longer
/// need to set it by hand.
///
/// Only stamps <see cref="Guid.Empty"/> — an explicitly-set SiteId is respected,
/// never overwritten. Extracted from <c>AppDbContext.SaveChanges</c> so the loop
/// is unit-testable against a real EF provider (the full AppDbContext model only
/// builds on Npgsql).
/// </summary>
public static class SiteScopedStamp
{
    public static void Apply(ChangeTracker changeTracker, Guid siteId)
    {
        foreach (var entry in changeTracker.Entries<ISiteScoped>())
        {
            if (entry.State == EntityState.Added && entry.Entity.SiteId == Guid.Empty)
                entry.Entity.SiteId = siteId;
        }
    }
}
