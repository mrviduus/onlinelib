namespace Domain.Entities;

/// <summary>
/// Marker for entities scoped to a single site (ADR-007, single-site). Carries
/// the <see cref="SiteId"/> that R1b's global query filters match on and that
/// <c>AppDbContext.SaveChanges</c> stamps on insert when left empty.
///
/// NOT applied to <c>Site</c> / <c>SiteDomain</c>: the site resolver reads those
/// to discover the current site, so a filter on them would be a chicken/egg
/// deadlock (zero rows before the site is known).
/// </summary>
public interface ISiteScoped
{
    Guid SiteId { get; set; }
}
