---
name: add-entity
description: Add a new EF Core entity + migration to TextStack (with optional writer service). Use when persisting a new kind of record — table, DbSet, mapping, migration, and wiring. Covers the AppDbContext partial pattern and the LlmTrace/AgentRun-style writer.
---

# Add an EF Core entity + migration

Pattern mirrors `LlmTrace` / `EvalRun` / `AgentRun`. Domain stays framework-free; mapping lives in an
`AppDbContext.<Area>.cs` partial; the DbSet is exposed on both `IAppDbContext` and `AppDbContext`.

## Steps

1. **Entity** — `backend/src/Domain/Entities/<Name>.cs`: a plain POCO, `required` on non-null strings,
   `Guid? UserId` + `User? User` for an optional owner FK. XML-doc says which table + where the mapping lives.
   Big JSON blobs go in a single `string` property mapped to `jsonb` (read whole, not queried per field).

2. **Mapping** — new partial `backend/src/Infrastructure/Persistence/AppDbContext.<Area>.cs`:
   `private static void Configure<Area>(ModelBuilder b)` with `ToTable("<snake_case>")`, indexes for the
   hot query (e.g. `HasIndex(x => new { x.UserId, x.CreatedAt }).HasFilter("user_id IS NOT NULL")`),
   `.HasColumnType("jsonb")` / `"numeric(10,6)"` where needed, and the FK with
   `.OnDelete(DeleteBehavior.SetNull)` for an optional owner. **Snake_case is automatic** (global convention).

3. **Wire**: call `Configure<Area>(modelBuilder)` in `AppDbContext.OnModelCreating`; add
   `DbSet<<Name>> <Plural> => Set<<Name>>();` to `AppDbContext.cs` AND `DbSet<<Name>> <Plural> { get; }`
   to `IAppDbContext`.

4. **Migration**:
   `dotnet ef migrations add Add<Name> --project backend/src/Infrastructure --startup-project backend/src/Api`
   Review the generated `Up` (column types, FK, index). For an out-of-model raw-SQL feature (e.g. a
   generated `tsvector`), the diff is empty — hand-write the `migrationBuilder.Sql(...)` like
   `AddChapterChunkSearchVector`.

5. **Writer** (optional, for observability records like agent runs): interface in `Ai.Core`
   (`I<Name>Writer`), `Db<Name>Writer` in `Application/Ai` (scoped, `: global::TextStack.Ai.Core.I<Name>Writer`,
   maps a framework-free record → entity, serializes blobs to jsonb), registered
   `AddScoped<...I<Name>Writer, Db<Name>Writer>()` in `Application/DependencyInjection.cs`.

6. **Verify the migration on real Postgres**:
   `docker compose up -d db && docker compose build migrator && docker compose up migrator`
   then `\d <table>` + a jsonb insert/read roundtrip. (DB creds: `textstack_prod`/`textstack_prod`.)
   CI's `docker` job runs `ef database update` against `pgvector/pgvector:pg16` too.

## Gotchas
- Don't add `<Version>` to a csproj — central versions in `Directory.Packages.props`.
- The migrator image is built from compiled migrations; rebuild it (`docker compose build migrator`)
  before applying a fresh migration locally, or it won't include it.
