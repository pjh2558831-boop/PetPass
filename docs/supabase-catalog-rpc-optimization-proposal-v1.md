# Supabase catalog RPC optimization proposal v1

Status: proposal only; no executable migration and no remote change

## Current evidence

The Stage 1 representative `get_public_map_catalog_v2` plan returned 200 rows in 312.809 ms with 4,976 shared-buffer hits. On 2026-08-19, the already-deployed current function returned 200 rows in 62.498 ms and 66.494 ms on consecutive read-only runs. Both runs had 5,528 shared hits, zero physical reads, and zero temporary spill. Startup was 62.195 ms and 66.159 ms.

An equivalent expanded read-only query exposed the internal work:

| Node | Actual time or rows | Buffers / note |
| --- | ---: | --- |
| Eligible `map_places` sequential scan | 43.666 ms; 1,171 kept, 48 removed | 296 shared hits |
| Query-hit `GroupAggregate` | 0.288–10.477 ms; 1,171 groups | 3,603 shared hits |
| Query-hit incremental sort | 0.276–8.277 ms; 3,596 rows | 27 kB peak, no spill |
| Hash right join | 44.354–54.953 ms | joins global hit counts to eligible rows |
| Exact `count(*) over()` | materializes all 1,171 eligible rows before the 201-row window | required for current truthful total |
| Expanded execution total | 58.984 ms | 3,899 shared hits, zero reads/spill |

The current per-call result meets the Stage 1 target of at least 50% lower execution time. It is nevertheless the largest measured server-side component when the application performs ten bounded 200-row calls for the 1,824-place load. This proposal seeks fewer repeated global operations, not a reduction in rows, categories, or evidence.

## Proposed V3 design

1. Build the eligible ID relation first using the exact current public/lifecycle, candidate-kind, category, district, and optional viewport predicates.
2. Compute the exact total once for the request scope, not once for every cursor page. Preserve a clearly versioned response contract so clients cannot confuse an omitted total with zero.
3. Select the bounded keyset page (`id > after_id`, stable `id` ordering) from eligible IDs before joining presentation columns.
4. Aggregate `map_place_query_hits` only for IDs required by the requested result or by a ranking operation that demonstrably needs the whole scope. Do not weaken `count(distinct query_key)` or category-agreement semantics.
5. Prefer increasing the safe physical RPC page size toward the existing 1,000-row ceiling, if payload and function limits remain acceptable. For 1,824 rows this can reduce ten physical calls toward two without hiding data.
6. Keep location/detail fields and reviewer-only/provider diagnostic fields outside the public marker contract. Full card/detail data remains lazy.

An alternative is a single V3 RPC that returns a compact marker batch plus scope metadata in one typed JSON result. It must still use keyset continuation, cap each response, and keep exact totals truthful. Do not introduce offset pagination.

## Result-equivalence requirements

- Identical eligible IDs, order, total count, `has_more`, and cursor boundaries for default, optional-category, district, and viewport scopes.
- Identical matched-query and category-agreement counts.
- Identical lifecycle, visibility, pending-publication, provider, and review-status behavior.
- No loss of the 1,824 coordinate-valid controlled records and no category/source suppression.
- Marker DTO remains sanitized; reviewer notes, raw provider bodies, ingestion diagnostics, and credentials never enter the RPC result.
- Existing V2 remains available until V3 equivalence and rollback are proven.

## Security and grants

- Retain `SECURITY DEFINER`, an empty fixed `search_path`, schema-qualified objects/functions, and the current sanitized return contract.
- Revoke default `public` execution and grant only the same intended `anon` and `authenticated` roles after review.
- Keep table RLS and policies unchanged unless a separately reviewed security requirement proves otherwise.
- Run Supabase security and performance advisors after any branch migration.

## Candidate indexes

No index is authorized by this document. The existing `map_places_kakao_public_catalog_idx` is broader than the final eligibility predicate, while the representative query chose a sequential scan. On the current small table, a new index may add write/storage cost without enough read benefit.

Only after V3 query-shape EXPLAIN evidence should a branch test compare a narrow partial index beginning with the stable cursor/filter columns and using the exact immutable public eligibility predicate. A covering index for all returned presentation fields is not recommended by default because it would be wide and costly. The hit identity index already supports candidate-first traversal; test restricting aggregation to page/scope IDs before proposing another hit index.

Expected costs of any approved index are extra bytes per catalog row/hit, additional insert/upsert work during catalog ingestion, longer vacuum/analyze work, and cache pressure. Record `pg_relation_size`, ingest duration, and write amplification before approval.

## Expected improvement

- Reduce repeated exact-count and global query-hit aggregation from once per physical page toward once per request scope.
- Reduce a full 1,824-row load from ten 200-row RPC operations toward two bounded operations when the 1,000-row ceiling is safe.
- Target a further 30% reduction in warm full-catalog server time while keeping individual scoped calls at or below the current 62–66 ms representative range.

These are hypotheses until measured on a Supabase branch with the same data distribution.

## Forward migration outline

1. Create a Supabase development branch.
2. Add a versioned `get_public_map_catalog_v3` function; do not replace V2 in place.
3. Apply explicit revoke/grant and function comment statements.
4. Add an index only if branch EXPLAIN proves a missing access path after query restructuring.
5. Add a server adapter behind a reversible feature flag.
6. Run equivalence, security, performance, API, and 1,824-marker tests.
7. Stop before any remote main-project application and request approval with plan diffs and cost evidence.

## Reversal outline

1. Disable the application feature flag and return traffic to V2.
2. Revoke V3 execution grants.
3. Drop only the versioned V3 function and any V3-specific index by exact name.
4. Re-run V2 contract, grant, RLS, and marker-coverage tests.

V2 is not dropped or rewritten by either direction.

## Required tests

- Snapshot/equivalence tests for IDs, order, totals, cursor boundaries, ranking signals, and all filters.
- Empty, final-page, invalid-bounds, maximum-limit, concurrent-ingestion, stale-confirmed, and pending-publication cases.
- Anonymous/authenticated execution and denied unintended-role checks.
- SQL injection/search-path and raw/private-field absence checks.
- `EXPLAIN (ANALYZE, BUFFERS)` for default, each optional category, district, viewport, first page, and later cursor page.
- 1,824-marker API/browser regression with 12 cards, zero page-change marker refetch, and no O(P²) replay.
- Ingestion write-duration and index-size comparison when an index is proposed.

## Remote approval gate

No SQL from this proposal may be applied to the main Supabase project without explicit user approval after branch evidence is reviewed. The Stage 4 analysis performed read-only EXPLAIN calls only and changed no RPC body, index, RLS policy, grant, or production data.
