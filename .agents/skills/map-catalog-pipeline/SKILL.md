---
name: map-catalog-pipeline
description: Use for PetPass Supabase map catalog schema, migrations, RLS or grants, public catalog RPCs, Kakao place collection, deduplication, source provenance, catalog ranking inputs, ingestion runs, or catalog data-quality work.
---

# Map catalog and place-data pipeline

Apply [`petpass-project-context`](../petpass-project-context/SKILL.md) first. Pair with `kakao-integrations` for provider request behavior and `place-evidence-verification` when pet-access claims are involved. For any Supabase work, also consult the installed Supabase Skill and current Supabase documentation when available.

## Scope

Relevant paths:

- `supabase/migrations/`
- `lib/supabase/server.ts`
- `lib/kakao/collection/`
- `lib/map-places/`
- `lib/places/source-*.ts`
- `types/database.ts`, `types/map-place.ts`, `types/public-map-place.ts`, `types/public-catalog-place.ts`, `types/place-candidate.ts`
- catalog and collection scripts under `scripts/`
- catalog, collection, migration, map-place, and source tests under `tests/`

The pipeline must distinguish official or verified data, provider candidates, externally discovered data, pet-friendly evidence, and records requiring verification. Preserve source attribution through every projection.

## Required Supabase workflow

1. **Schema inspection:** read every migration that defines or alters the affected tables, functions, indexes, grants, and policies. Inspect generated/manual database types and query callers.
2. **Migration review:** establish current state and migration order. Never edit an already-applied migration to change production history.
3. **Dependency analysis:** trace Route Handlers, RPC callers, TypeScript types, collection scripts, tests, RLS, grants, and `SECURITY DEFINER` functions.
4. **Minimal migration:** when explicitly requested, add the smallest forward migration with stable naming and data preservation.
5. **Validation:** statically review SQL, run focused migration/collection tests, typecheck, lint, and build. Verify public results expose only sanitized fields.
6. **Rollback consideration:** document how to stop, reverse, or compensate for the change and what backup is required. Do not claim rollback is safe if data would be lost.

## Collection and deduplication workflow

1. Inspect the current query registry, provider adapter, normalization, stable identifiers, dedupe, reconciliation, repository, runner, and CLI.
2. Reuse existing provider IDs and deduplication logic before inventing matching rules.
3. Preserve run/query/hit provenance and reviewer-maintained fields.
4. Plan first. Treat dry-run, apply, resume, stale marking, or deletion as separate authorization boundaries.
5. Back up affected catalog data before an authorized migration or apply operation.

## Allowed modifications

Modify provider-independent catalog projections, collection code, types, tests, and documentation when requested. Add a new migration only when schema change is explicitly in scope.

## Forbidden modifications

- Never modify production data, run collection apply/resume, or execute migrations against a live project without explicit authorization.
- Never perform destructive SQL automatically. Do not drop, truncate, overwrite reviewer decisions, or weaken RLS/grants for convenience.
- Never expose `SUPABASE_SECRET_KEY` or use it in browser code.
- Do not infer pet-friendly status from category, name, popularity, Kakao metadata, or a missing license match.
- Do not silently merge places on weak name-only similarity or change stable identifiers without a migration plan.
- Do not let delta collection stale or delete records unless the existing contract and explicit request require it.

## Validation

Run `npm run typecheck`, `npm run lint`, focused catalog/collection/migration tests, and `npm run build`. `npm run kakao:collect:plan` is the default non-writing collection check. Commands containing `dry-run`, `apply`, `resume`, backup against a live database, or migration deployment require separate review and authorization.

Read [schema and RLS invariants](references/schema-and-rls.md) and [collection runbook](references/collection-runbook.md) before schema or ingestion changes.
