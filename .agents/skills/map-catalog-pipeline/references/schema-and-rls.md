# Map catalog schema and access invariants

## Current schema surface

Inspect migrations rather than relying on this summary. The repository currently models catalog places and ingestion provenance with tables such as:

- `map_places`
- `map_ingest_runs`
- `map_ingest_run_queries`
- `map_place_query_hits`

Public reads use sanitized RPCs and projections, including versioned public catalog and location functions. Collection writes are service-only.

## Review checklist

- Read all existing migrations in chronological order.
- Confirm table columns, constraints, indexes, PostGIS usage, function signatures, volatility, search path, ownership, grants, and RLS policies.
- Treat grants and RLS as separate controls; verify both.
- Review every `SECURITY DEFINER` function for fixed `search_path`, least privilege, input validation, and unintended data exposure.
- Keep browser clients away from service credentials and write paths.
- Regenerate or update `types/database.ts` only from the actual intended schema contract.
- Preserve public RPC compatibility or version the function when callers cannot migrate atomically.

## Migration safety

- Add forward migrations; do not rewrite applied history.
- Prefer additive, backfillable, constraint-later changes.
- Estimate lock and data-rewrite impact before changing populated tables or indexes.
- Define backup, verification queries, stop conditions, and compensating migration before live execution.
