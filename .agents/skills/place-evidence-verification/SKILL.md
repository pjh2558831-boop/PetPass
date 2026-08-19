---
name: place-evidence-verification
description: Use when evaluating, parsing, displaying, or testing pet-friendly evidence, access verdicts, pet-size compatibility, source trust, route eligibility, or verification-required place records in PetPass.
---

# Place evidence verification

Apply [`petpass-project-context`](../petpass-project-context/SKILL.md) first. Pair with `tourism-service2` for official Tourism source parsing and `facility-licensing` for administrative license evidence.

## Scope

Relevant paths:

- `lib/pet-access/`
- `lib/trust/`
- `lib/itinerary/automatic-route-eligibility.ts`
- `lib/places/source-layers.ts`, `source-linking.ts`, `source-records.ts`
- `components/pet-access/` and pet-access/source trust panels under `components/places/`
- `types/access.ts`, `types/tour-pet-access.ts`, `types/pet-size-compatibility.ts`, `types/place-source.ts`
- pet-access, size, source-trust, and eligibility tests under `tests/`

## Workflow

1. Identify the original source record and inspect its schema, parser, normalizer, evidence extraction, evaluator, UI projection, and tests.
2. Preserve original text, source name, source identifier when available, and retrieval timestamp.
3. Keep evidence extraction separate from deterministic verdict rules.
4. Resolve only facts explicitly supported by source text and existing rules. Treat absence, ambiguity, or conflict as `NEEDS_CONFIRMATION` or the existing unknown state.
5. Verify downstream automatic-route eligibility and UI wording whenever a verdict or compatibility rule changes.

## Allowed modifications

Modify evidence parsing/evaluation, trust rules, domain types, focused UI projections, and tests when explicitly requested. Add fixtures only when clearly labeled and faithful to a cited provider shape.

## Forbidden modifications

- Never invent access permission, prohibited areas, weight/size limits, carriers, leashes, vaccinations, fees, or required items.
- Do not convert marketing language, category labels, Kakao candidates, popularity, or missing administrative records into pet-access proof.
- Do not discard conflicting evidence or original source text.
- Do not loosen automatic route eligibility merely to increase recommendation counts.

## Validation

Run `npm run typecheck`, `npm run lint`, `tests/unit/pet-access.test.ts`, `tests/unit/pet-size-compatibility.test.ts`, `tests/unit/automatic-route-eligibility.test.ts`, `tests/unit/source-trust.test.ts`, affected recommendation tests, and `npm run build`. Run pet-access detail e2e coverage when presentation or navigation changes.

See [verdict invariants](references/verdict-invariants.md).
