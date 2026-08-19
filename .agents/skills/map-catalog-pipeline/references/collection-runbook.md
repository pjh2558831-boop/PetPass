# Collection runbook

## Before changing collection code

1. Read `lib/kakao/collection/query-registry-v1.ts` and `query-registry-v2.ts` plus their tests.
2. Trace provider response to classification, stable identity, dedupe, reconciliation, repository writes, and finalization.
3. Confirm whether the task concerns full V1 collection or delta V2 collection. Do not blur their stale/delete semantics.
4. Review CLI flags and script names in `package.json`; do not guess commands.

## Safe execution ladder

1. Unit tests with mocked provider and repository.
2. `npm run kakao:collect:plan` for a non-writing plan.
3. Dry run only after confirming which external services it reads and what run metadata it may write.
4. Backup affected data before any authorized apply or migration.
5. Apply/resume only with explicit production-data authorization, correct environment review, and a recorded stop condition.
6. Reconcile counts, duplicate indicators, provenance, public projection, and reviewer fields after execution.

Never print environment values or full authenticated URLs. Redact identifiers if execution logs could expose secrets.
