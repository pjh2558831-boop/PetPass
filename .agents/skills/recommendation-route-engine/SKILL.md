---
name: recommendation-route-engine
description: Use when changing PetPass recommendation retrieval, category reservation, scoring, popularity, schedule simulation, route optimization, travel matrices, itinerary generation, route explanations, or ranking configuration.
---

# Recommendation and route engine

Apply [`petpass-project-context`](../petpass-project-context/SKILL.md) first. Pair with `place-evidence-verification` for eligibility changes and `kakao-integrations` when Mobility travel time changes.

## Scope

Relevant paths:

- `lib/recommendation/`
- `lib/itinerary/`
- `lib/travel/`
- `app/api/itineraries/`
- `components/itinerary/`
- `types/recommendation.ts`, `types/itinerary.ts`, `types/route-*.ts`
- recommendation, itinerary, route, travel-matrix, and trip-pace tests under `tests/`
- comparison and live-verification scripts under `scripts/`

## Workflow

1. Trace the current stage boundary from request validation through candidate retrieval, hard eligibility gates, scoring, schedule simulation, route search, final validation, explanations, and response storage.
2. Identify the versioned config that owns each weight, limit, time window, or transition value.
3. Define a measurable expected change before editing ranking logic. Use controlled fixtures and existing comparison scripts.
4. Keep hard safety/eligibility gates separate from soft ranking. Never compensate for an eligibility defect with a score.
5. Preserve category diversity and required meal or trip structure where the existing product contract uses reservations or constraints.
6. Document the reason and unit for every new constant. Prefer versioned config over inline magic numbers.
7. Verify determinism, tie-breaking, explanation accuracy, fallback behavior, and stored response compatibility.

## Allowed modifications

Modify deterministic recommendation, itinerary, and travel modules; versioned configs; API contracts; focused UI explanations; comparison scripts; and tests when requested.

## Forbidden modifications

- Do not make Kakao candidates automatically eligible without authoritative evidence.
- Do not weaken pet-access, hours, travel, schedule, or final-validation gates to improve headline result counts.
- Do not add arbitrary weights without rationale and before/after evidence.
- Do not tune to one fixture while regressing category diversity or regional coverage.
- Do not run live comparison scripts or provider calls by default.

## Validation

Run `npm run typecheck`, `npm run lint`, focused recommendation/itinerary/travel tests, and `npm run build`. Run the relevant controlled comparison script for scoring or optimizer changes and summarize before/after metrics. Run recommendation and itinerary e2e flows when contracts, storage, navigation, or interaction changes.

Read [stage boundaries](references/stage-boundaries.md) and [validation matrix](references/validation-matrix.md).
