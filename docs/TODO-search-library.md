# TODO: Search Library Follow-ups

Follow-up tasks discovered during OnlineLib.Search library implementation (Slices 1-15).

## Database & Migrations-

- [ ] Create EF Core migration for `search_documents` table (currently created manually via SQL)
- [ ] Consider removing trigger-based `Chapter.SearchVector` indexing after verifying new approach works
- [ ] Add migration to backfill existing chapters into `search_documents` table

## Backend

- [ ] Add re-indexing endpoint for existing books (admin API)
- [ ] Add bulk re-index command for CLI/worker
- [ ] Consider adding `EditionStatus` enum value to search queries instead of hardcoded `1`
- [ ] Add search analytics/tracking (query logging, popular searches)
- [ ] Implement faceted search (filter by author, language, year)
- [ ] Add search result caching (Redis/memory cache)

## Frontend

- [ ] Add loading skeleton for suggestions dropdown
- [ ] Consider caching suggestions client-side
- [ ] Add "View all results" link for pagination
- [ ] Add search page with full results list (not just dropdown)
- [ ] Keyboard shortcut to focus search (Cmd/Ctrl+K)
- [ ] Mobile search UI (currently hidden on small screens)

## Future Providers

- [ ] Elasticsearch provider implementation
- [ ] Vector/semantic search provider (use existing `OverlappingChunker`)
- [ ] Algolia provider (for hosted search)

## Testing

- [ ] Add integration tests for search endpoints
- [ ] Add E2E tests for search UI
- [ ] Performance benchmarks for large datasets

## Documentation

- [ ] Document search API endpoints in OpenAPI
- [ ] Add search configuration options to deployment docs
- [ ] Document how to add new search providers

---

## Completed (Slices 1-15)

- [x] Project scaffold + contracts
- [x] Core abstractions (ISearchProvider, ISearchIndexer, etc.)
- [x] TsQuery builder + tests
- [x] Multilingual analyzer + tests
- [x] PostgreSQL search provider
- [x] PostgreSQL indexer
- [x] Highlighting with ts_headline
- [x] Suggestions/autocomplete
- [x] DI + configuration
- [x] Document chunking (vector prep)
- [x] Test project + mocks
- [x] Integration — Application layer
- [x] Integration — API endpoints
- [x] Integration — Worker indexing
- [x] Frontend — highlights + autocomplete
