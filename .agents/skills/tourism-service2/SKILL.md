---
name: tourism-service2
description: Use when changing or diagnosing PetPass KorPetTourService2 or TourAPI requests, parsing, pagination, caching, visibility, catalog routes, tourism details, or official pet-access source text.
---

# Tourism Service2

Apply [`petpass-project-context`](../petpass-project-context/SKILL.md) first.

## Scope

Own the Korea Tourism Organization integration and its server-side projections. KorPetTourService2 is authoritative for tourism-place identity and pet-access source text; it is not permission to infer facts absent from the response.

Relevant paths:

- `lib/tour-api/`
- `app/api/tour/`
- `lib/places/tour-map-locations.ts`
- `types/tour-pet-access.ts`
- `scripts/audit-tour-service2-contract.ts`
- `scripts/audit-tourism-details.ts`
- `scripts/audit-tourism-pagination.ts`
- `scripts/diagnose-tour-service2-live.ts`
- `tests/unit/tour-*.test.ts`, `tests/unit/homepage-catalog.test.ts`
- `tests/e2e/tour-*.spec.ts`, `tests/e2e/provider-live.spec.ts`

## Workflow

1. Inspect the current client, schemas, parser, normalizers, service, cache, visibility rules, Route Handler, and nearby tests.
2. Confirm the exact provider operation and response shape from current provider documentation before changing a request contract.
3. Keep service keys and provider calls server-side.
4. Parse and schema-validate raw responses before normalization. Preserve provider error, empty, and pagination behavior.
5. Keep official source identity, text, and retrieval time available to evidence consumers.
6. Change caching or visibility only with explicit consideration of stale data, unavailable upstreams, and public output contracts.

## Allowed modifications

Modify the paths above and their focused tests or documentation when the user requests Tourism Service2 behavior. Shared types may change only after tracing all consumers.

## Forbidden modifications

- Do not expose `TOUR_API_SERVICE_KEY` to client code or logs.
- Do not substitute Kakao candidates or fixtures when the production provider fails.
- Do not invent missing pet-policy facts or convert ambiguous text into a permissive verdict.
- Do not replace KorPetTourService2 with another tourism API without explicit architectural authorization.
- Do not run live audits by default.

## Validation

Run `npm run typecheck`, `npm run lint`, focused Tourism unit tests, and `npm run build`. Run mocked Tourism browser flows when route or page behavior changes. Use `npm run audit:tour-contract` and live verification scripts only with explicit authorization and credentials.

See [operations and visibility](references/operations-and-visibility.md) before changing provider operations, cache behavior, or public visibility.
