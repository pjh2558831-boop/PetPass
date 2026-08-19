---
name: facility-licensing
description: Use for PetPass LOCALDATA facility-license provider integration, restaurant or accommodation license parsing, normalization, matching, caching, license panels, or administrative evidence semantics.
---

# Facility licensing

Apply [`petpass-project-context`](../petpass-project-context/SKILL.md) first. Pair with `place-evidence-verification` when license evidence affects trust or user-facing verification language.

## Scope

Relevant paths:

- `lib/licenses/`
- `components/places/license-information-panel.tsx`
- licensing-related logic in `components/places/live-place-detail.tsx`
- `types/license.ts`
- `scripts/verify-localdata-live.ts`, `scripts/verify-accommodation-localdata-live.ts`
- `tests/unit/license-matcher.test.ts`, `localdata.test.ts`, `accommodation-localdata.test.ts`
- `tests/e2e/licensing-detail.spec.ts`, `accommodation-licensing-detail.spec.ts`

## Workflow

1. Inspect provider configuration, schemas, parser, normalizers, matcher, cache, service, consumers, and tests.
2. Validate provider data before normalization and matching.
3. Preserve the distinction between exact/strong matches, ambiguous matches, `NO_MATCH`, provider failure, and unavailable data.
4. Review normalization changes against false-positive and false-negative examples for name, address, and facility type.
5. Keep administrative evidence separate from pet-access evidence.

## Allowed modifications

Modify the licensing adapter, deterministic matching, types, panels, and focused tests when requested.

## Forbidden modifications

- Never expose or log `LOCALDATA_SERVICE_KEY`.
- Never describe `NO_MATCH` as proof of illegality, closure, or pet-access status.
- Do not lower matching thresholds or add fuzzy rules without documented examples and regression tests.
- Do not use fixtures as production fallback or run live verification by default.

## Validation

Run `npm run typecheck`, `npm run lint`, the three licensing unit tests, related e2e tests when UI changes, and `npm run build`. Use live LOCALDATA verification scripts only with explicit authorization and credentials.
