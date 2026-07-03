namespace Application.Common.Interfaces;

/// <summary>
/// Resolves the id of the site this process serves. Single-site (ADR-007), so
/// this is a process-wide constant sourced from config with a hard default.
/// Future global query filters will scope EF queries to <see cref="Id"/>.
/// </summary>
public interface ICurrentSite
{
    Guid Id { get; }
}
