using System.Text.Json;
using Application.Auth;
using Application.Common.Interfaces;
using Application.SsgRebuild;
using Contracts.Admin;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Seo;

/// <summary>
/// Orchestrates SeoBackfillJob lifecycle:
///   queue → claim (by poller) → context/render → (poller runs Claude CLI) → apply → success|needs_review
/// Does NOT invoke Claude itself — the shell poller does that. This service exposes operations the
/// poller calls over internal HTTP endpoints: ClaimNext, GetContext, Apply, Fail.
/// </summary>
public class SeoJobProcessor(
    IAppDbContext db,
    SeoContextBuilder contextBuilder,
    SeoContentApplier applier,
    ISsgJobService ssg,
    IEmailService email)
{
    public record JobContext(
        Guid JobId,
        string EntityType,
        Guid EntityId,
        List<FieldPrompt> Prompts);

    public record FieldPrompt(string FieldType, string Prompt, string OutputSchema, string Model, int MaxTokens, double Temperature);

    /// <summary>
    /// Atomically claims up to `limit` queued jobs and marks them Running.
    /// Returns the claimed IDs. Implemented with a raw SQL UPDATE ... RETURNING for transactional safety.
    /// </summary>
    public async Task<List<Guid>> ClaimNextAsync(int limit, CancellationToken ct)
    {
        if (limit <= 0) limit = 1;
        if (limit > 50) limit = 50;

        var claimed = new List<Guid>();
        var now = DateTimeOffset.UtcNow;
        var running = (int)SeoJobStatus.Running;
        var queued = (int)SeoJobStatus.Queued;

        // SKIP LOCKED prevents two pollers claiming the same job.
        // ToListAsync on FromSqlInterpolated forces enumeration (and UPDATE execution).
        var rows = await db.SeoBackfillJobs.FromSqlInterpolated($@"
            UPDATE seo_backfill_jobs
            SET status = {running}, started_at = {now}
            WHERE id IN (
              SELECT id FROM seo_backfill_jobs
              WHERE status = {queued}
              ORDER BY created_at
              LIMIT {limit}
              FOR UPDATE SKIP LOCKED
            )
            RETURNING *
        ").AsNoTracking().ToListAsync(ct);

        claimed.AddRange(rows.Select(r => r.Id));
        return claimed;
    }

    /// <summary>
    /// For a claimed job, render all prompts (one per TargetField). Stores the rendered prompts on the
    /// job (for debug) and returns them to the poller.
    /// </summary>
    public async Task<JobContext> GetContextAsync(Guid jobId, CancellationToken ct)
    {
        var job = await db.SeoBackfillJobs.FirstOrDefaultAsync(j => j.Id == jobId, ct)
            ?? throw new InvalidOperationException($"Job {jobId} not found");
        if (job.Status != SeoJobStatus.Running)
            throw new InvalidOperationException($"Job {jobId} not in Running state (got {job.Status})");

        var values = await contextBuilder.BuildAsync(job.EntityType, job.EntityId, ct);

        // Stash the input snapshot for reproducibility
        job.InputSnapshot = JsonSerializer.Serialize(values);

        // Before snapshot (so revert works even if apply succeeds)
        var fields = job.TargetFields.Select(ParseField).ToList();
        job.BeforeSnapshot = await applier.SnapshotAsync(job.EntityType, job.EntityId, fields, ct);

        var prompts = new List<FieldPrompt>();
        var renderedMap = new Dictionary<string, string>();

        for (var i = 0; i < job.TargetFields.Length; i++)
        {
            var field = job.TargetFields[i];
            var tplId = job.TemplateIds[i];
            var tplVersion = job.TemplateVersions[i];

            var template = await db.SeoTemplates.AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == tplId && t.Version == tplVersion, ct)
                ?? throw new InvalidOperationException($"Template {tplId} v{tplVersion} not found");

            var rendered = SeoTemplateRenderer.Render(template.PromptTemplate, values);
            renderedMap[field] = rendered;
            prompts.Add(new FieldPrompt(field, rendered, template.OutputSchema, template.Model, template.MaxTokens, template.Temperature));
        }
        job.RenderedPrompts = JsonSerializer.Serialize(renderedMap);
        await db.SaveChangesAsync(ct);

        return new JobContext(job.Id, job.EntityType.ToString(), job.EntityId, prompts);
    }

    /// <summary>
    /// Poller submits raw Claude outputs (JSON per field). We validate each against the template schema,
    /// then either apply (flip to Success) or mark NeedsReview if template's TrustLevel demands review.
    /// </summary>
    public async Task<string> ApplyAsync(Guid jobId, IReadOnlyDictionary<string, string> fieldOutputs, CancellationToken ct)
    {
        var job = await db.SeoBackfillJobs.FirstOrDefaultAsync(j => j.Id == jobId, ct)
            ?? throw new InvalidOperationException($"Job {jobId} not found");
        if (job.Status != SeoJobStatus.Running)
            throw new InvalidOperationException($"Job {jobId} not in Running state (got {job.Status})");

        // Persist raw outputs for debug
        job.RawOutputs = JsonSerializer.Serialize(fieldOutputs);

        // Validate each output against its template schema, then extract the JSON value.
        var generated = new Dictionary<SeoFieldType, JsonElement>();
        var parsedMap = new Dictionary<string, JsonElement>();
        var errors = new List<string>();

        for (var i = 0; i < job.TargetFields.Length; i++)
        {
            var fieldName = job.TargetFields[i];
            if (!fieldOutputs.TryGetValue(fieldName, out var raw))
            {
                errors.Add($"{fieldName}: missing output");
                continue;
            }

            JsonElement parsed;
            try
            {
                using var doc = JsonDocument.Parse(raw);
                parsed = doc.RootElement.Clone();
            }
            catch (JsonException ex)
            {
                errors.Add($"{fieldName}: invalid JSON ({ex.Message})");
                continue;
            }

            var template = await db.SeoTemplates.AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == job.TemplateIds[i] && t.Version == job.TemplateVersions[i], ct);
            if (template is null)
            {
                errors.Add($"{fieldName}: template not found");
                continue;
            }

            var validation = SeoContentValidator.Validate(parsed, template.OutputSchema);
            if (!validation.IsValid)
            {
                errors.Add($"{fieldName}: schema failed — {string.Join("; ", validation.Errors)}");
                continue;
            }

            parsedMap[fieldName] = parsed;

            // Extract the single-value field from the parsed object.
            // Convention: templates return {fieldName: value}. Fall back to first property otherwise.
            var valueKey = LowerFieldKey(fieldName);
            if (parsed.TryGetProperty(valueKey, out var val))
                generated[ParseField(fieldName)] = val;
            else if (parsed.ValueKind == JsonValueKind.Object && parsed.EnumerateObject().Any())
                generated[ParseField(fieldName)] = parsed.EnumerateObject().First().Value;
            else
            {
                errors.Add($"{fieldName}: output missing key '{valueKey}'");
            }
        }

        if (errors.Count > 0)
        {
            job.Status = SeoJobStatus.Failed;
            job.Error = string.Join(" | ", errors);
            job.CompletedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            await NotifyFailureAsync(job, ct);
            return "failed";
        }

        // Review gate: use the MOST restrictive trust level across templates (Manual > Review > Auto).
        var trustLevels = new List<SeoTrustLevel>();
        for (var i = 0; i < job.TargetFields.Length; i++)
        {
            var tpl = await db.SeoTemplates.AsNoTracking().FirstOrDefaultAsync(t => t.Id == job.TemplateIds[i] && t.Version == job.TemplateVersions[i], ct);
            if (tpl is not null) trustLevels.Add(tpl.TrustLevel);
        }
        var effectiveTrust = trustLevels.Count == 0
            ? SeoTrustLevel.Review
            : trustLevels.Min(); // Manual(0) < Review(1) < Auto(2) — take the strictest

        job.GeneratedContent = JsonSerializer.Serialize(parsedMap.ToDictionary(kv => kv.Key, kv => kv.Value.ToString()));

        if (job.RequiresReview || effectiveTrust != SeoTrustLevel.Auto)
        {
            job.Status = SeoJobStatus.NeedsReview;
            await db.SaveChangesAsync(ct);
            return "needs_review";
        }

        // Apply + snapshot After + enqueue SSG
        await applier.ApplyAsync(job.EntityType, job.EntityId, generated, ct);
        job.AfterSnapshot = await applier.SnapshotAsync(job.EntityType, job.EntityId, generated.Keys.ToList(), ct);
        job.Status = SeoJobStatus.Success;
        job.CompletedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        // Best-effort SSG enqueue (errors logged but non-fatal)
        await EnqueueSsgSafeAsync(job, ct);

        return "success";
    }

    public async Task FailAsync(Guid jobId, string error, CancellationToken ct)
    {
        var job = await db.SeoBackfillJobs.FirstOrDefaultAsync(j => j.Id == jobId, ct)
            ?? throw new InvalidOperationException($"Job {jobId} not found");
        job.Status = SeoJobStatus.Failed;
        job.Error = error;
        job.CompletedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        await NotifyFailureAsync(job, ct);
    }

    /// <summary>
    /// Best-effort admin email on a failed job. Non-fatal — if email service isn't configured
    /// or Resend throws, we log but don't re-throw (the failure is already persisted).
    /// </summary>
    private async Task NotifyFailureAsync(SeoBackfillJob job, CancellationToken ct)
    {
        try
        {
            var subject = $"[TextStack SEO] Job failed: {job.EntityType} {job.EntityId}";
            var html = $"""
                <div style="font-family: -apple-system, sans-serif; max-width: 560px;">
                  <h3 style="color:#b91c1c;margin:0 0 12px">SEO Backfill job failed</h3>
                  <table style="border-collapse:collapse;font-size:14px;color:#111;">
                    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Job ID</td><td><code>{job.Id}</code></td></tr>
                    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Entity</td><td>{job.EntityType} <code>{job.EntityId}</code></td></tr>
                    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Fields</td><td>{string.Join(", ", job.TargetFields)}</td></tr>
                    <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Triggered by</td><td>{System.Net.WebUtility.HtmlEncode(job.TriggeredBy)}</td></tr>
                    <tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">Error</td><td><pre style="white-space:pre-wrap;background:#fef2f2;padding:8px;border-radius:4px;">{System.Net.WebUtility.HtmlEncode(job.Error ?? "(no error message)")}</pre></td></tr>
                  </table>
                  <p style="margin-top:16px;font-size:13px;color:#64748b;">
                    Open <a href="https://textstack.dev/seo-backfill?tab=jobs">/seo-backfill → Jobs</a> to retry or inspect.
                  </p>
                </div>
                """;
            await email.SendAdminAlertAsync(subject, html, ct);
        }
        catch { /* best-effort */ }
    }

    /// <summary>Admin approves a NeedsReview job → apply the generated content + rebuild.</summary>
    public async Task ApproveAsync(Guid jobId, Guid approvedByUserId, CancellationToken ct)
    {
        var job = await db.SeoBackfillJobs.FirstOrDefaultAsync(j => j.Id == jobId, ct)
            ?? throw new InvalidOperationException($"Job {jobId} not found");
        if (job.Status != SeoJobStatus.NeedsReview)
            throw new InvalidOperationException($"Job {jobId} is not in NeedsReview (got {job.Status})");
        if (string.IsNullOrEmpty(job.GeneratedContent))
            throw new InvalidOperationException("Job has no GeneratedContent to apply");

        // Re-parse GeneratedContent — saved as dict<field, rawJsonString>
        var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(job.GeneratedContent)
            ?? throw new InvalidOperationException("GeneratedContent malformed");

        var generated = new Dictionary<SeoFieldType, JsonElement>();
        foreach (var kv in dict)
        {
            using var doc = JsonDocument.Parse(kv.Value);
            var root = doc.RootElement;
            var valueKey = LowerFieldKey(kv.Key);
            JsonElement val;
            if (root.TryGetProperty(valueKey, out val))
                generated[ParseField(kv.Key)] = val.Clone();
            else if (root.ValueKind == JsonValueKind.Object && root.EnumerateObject().Any())
                generated[ParseField(kv.Key)] = root.EnumerateObject().First().Value.Clone();
        }

        await applier.ApplyAsync(job.EntityType, job.EntityId, generated, ct);
        job.AfterSnapshot = await applier.SnapshotAsync(job.EntityType, job.EntityId, generated.Keys.ToList(), ct);
        job.Status = SeoJobStatus.Success;
        job.ApprovedByUserId = approvedByUserId;
        job.ApprovedAt = DateTimeOffset.UtcNow;
        job.CompletedAt ??= DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        await EnqueueSsgSafeAsync(job, ct);
    }

    /// <summary>
    /// Restores the entity's Before snapshot and flips SeoSource back to Manual.
    /// POLICY: no TTL — revert is allowed at any age. Job BeforeSnapshot is an immutable audit record
    /// and the admin controls when to roll back. Only rejects if snapshot is missing (job never ran past GetContext).
    /// </summary>
    public async Task RevertAsync(Guid jobId, CancellationToken ct)
    {
        var job = await db.SeoBackfillJobs.FirstOrDefaultAsync(j => j.Id == jobId, ct)
            ?? throw new InvalidOperationException($"Job {jobId} not found");
        if (string.IsNullOrEmpty(job.BeforeSnapshot))
            throw new InvalidOperationException("Job has no BeforeSnapshot — cannot revert");
        if (job.Status == SeoJobStatus.Reverted)
            throw new InvalidOperationException("Job is already reverted");

        await applier.RevertAsync(job.EntityType, job.EntityId, job.BeforeSnapshot, ct);
        job.Status = SeoJobStatus.Reverted;
        await db.SaveChangesAsync(ct);

        await EnqueueSsgSafeAsync(job, ct);
    }

    /// <summary>Resolves the entity's SiteId + slug and enqueues a Specific SSG rebuild.</summary>
    private async Task EnqueueSsgSafeAsync(SeoBackfillJob job, CancellationToken ct)
    {
        try
        {
            Guid siteId; string? slug; string scope;
            switch (job.EntityType)
            {
                case SeoEntityType.Author:
                    var a = await db.Authors.AsNoTracking().FirstOrDefaultAsync(x => x.Id == job.EntityId, ct);
                    if (a is null) return;
                    siteId = a.SiteId; slug = a.Slug; scope = "author"; break;
                case SeoEntityType.Edition:
                    var e = await db.Editions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == job.EntityId, ct);
                    if (e is null) return;
                    siteId = e.SiteId; slug = e.Slug; scope = "book"; break;
                case SeoEntityType.Genre:
                    var g = await db.Genres.AsNoTracking().FirstOrDefaultAsync(x => x.Id == job.EntityId, ct);
                    if (g is null) return;
                    siteId = g.SiteId; slug = g.Slug; scope = "genre"; break;
                default:
                    // BlogPost — no slug-scoped rebuild, skip (Full rebuild would be overkill)
                    return;
            }
            var req = scope switch
            {
                "book" => new CreateSsgRebuildJobRequest(siteId, "Specific", BookSlugs: new[] { slug! }),
                "author" => new CreateSsgRebuildJobRequest(siteId, "Specific", AuthorSlugs: new[] { slug! }),
                "genre" => new CreateSsgRebuildJobRequest(siteId, "Specific", GenreSlugs: new[] { slug! }),
                _ => null
            };
            if (req is not null) await ssg.EnqueueSsgRebuildAsync(req, ct);
        }
        catch { /* best-effort */ }
    }

    /// <summary>Enqueues a single entity for backfill of specified fields using the active templates.</summary>
    public async Task<Guid> EnqueueAsync(SeoEntityType entityType, Guid entityId, IReadOnlyList<SeoFieldType> fields, string language, bool requireReview, string triggeredBy, CancellationToken ct)
    {
        // Dedup: reject if same (entityId, fields) already queued or running
        var fieldStrings = fields.Select(f => f.ToString()).ToArray();
        var existing = await db.SeoBackfillJobs.AsNoTracking()
            .Where(j => j.EntityType == entityType && j.EntityId == entityId
                && (j.Status == SeoJobStatus.Queued || j.Status == SeoJobStatus.Running))
            .FirstOrDefaultAsync(ct);
        if (existing is not null)
            throw new InvalidOperationException($"Job {existing.Id} is already {existing.Status} for this entity");

        // Resolve active templates per field+language (most recent version)
        var templateIds = new List<Guid>();
        var versions = new List<int>();
        foreach (var field in fields)
        {
            var tpl = await db.SeoTemplates.AsNoTracking()
                .Where(t => t.EntityType == entityType && t.FieldType == field && t.LanguageCode == language && t.IsActive)
                .OrderByDescending(t => t.Version)
                .FirstOrDefaultAsync(ct)
                ?? throw new InvalidOperationException($"No active template for {entityType}/{field}/{language}");
            templateIds.Add(tpl.Id);
            versions.Add(tpl.Version);
        }

        var job = new SeoBackfillJob
        {
            Id = Guid.NewGuid(),
            EntityType = entityType,
            EntityId = entityId,
            TargetFields = fieldStrings,
            TemplateIds = templateIds.ToArray(),
            TemplateVersions = versions.ToArray(),
            Status = SeoJobStatus.Queued,
            CreatedAt = DateTimeOffset.UtcNow,
            TriggeredBy = triggeredBy,
            RequiresReview = requireReview,
        };
        db.SeoBackfillJobs.Add(job);
        await db.SaveChangesAsync(ct);
        return job.Id;
    }

    private static SeoFieldType ParseField(string name) => Enum.Parse<SeoFieldType>(name, ignoreCase: true);
    private static string LowerFieldKey(string fieldName) => char.ToLowerInvariant(fieldName[0]) + fieldName[1..];
}
