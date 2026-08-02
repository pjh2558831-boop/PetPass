# PetPass architecture

## System boundaries

PetPass is a Next.js App Router application with four explicit layers:

1. Presentation and navigation in `app/` and `components/`.
2. Provider adapters in `lib/tour-api`, `lib/kakao`, and `lib/licenses`.
3. Deterministic domain services in `lib/pet-access` and `lib/itinerary`.
4. Device-local persistence in `lib/storage`.

No presentation component imports provider response shapes directly. Provider
responses are validated with Zod and normalized before domain evaluation.

```mermaid
flowchart LR
  UI["Server and client UI"] --> RH["Next.js Route Handlers"]
  RH --> TA["Tour API adapter"]
  RH --> KA["Kakao adapters"]
  RH --> LA["License adapter"]
  TA --> N["Validated normalized domain input"]
  N --> PA["Pet access evaluator"]
  PA --> IT["Itinerary services"]
  IT --> UI
  UI --> LS["Versioned localStorage"]
```

## Request and data flow

The live provider flow is:

1. A server-side request calls `areaBasedList2` for a bounded regional candidate
   set.
2. The Tour API adapter validates the response and preserves source metadata.
3. `detailPetTour2` supplies original access text for the visible candidates.
4. Normalizers create a `PetPolicy`; the evaluator compares only explicit policy
   facts with the current `PetProfile`.
5. `detailIntro2` contributes opening and closed-day information.
6. Candidate selection and scoring exclude `NOT_MATCHED`, deprioritize
   `NEEDS_CONFIRMATION`, and balance categories.
7. Kakao directions supplies validated road distance, duration, and route geometry
   after candidate count is reduced.
8. The UI renders the assessment, its source evidence, and any contact action.

The current phase uses `fixtures/demo-data.ts` only for an explicitly labeled
development demonstration. Route Handlers return configuration errors when live
keys are absent; they never substitute the fixture.

## Domain services

- `pet-access/parser.ts` extracts only explicit supported phrases.
- `pet-access/evaluator.ts` produces exactly `AVAILABLE`, `CONDITIONAL`,
  `NEEDS_CONFIRMATION`, or `NOT_MATCHED`.
- `pet-access/evidence.ts` keeps attribution adjacent to the decision.
- `itinerary/candidate-selector.ts` removes incompatible candidates.
- `itinerary/scorer.ts` combines access, operating data, distance, and preference.
- `itinerary/scheduler.ts` assigns visit windows.
- `itinerary/optimizer.ts` contains a provider-independent geometric baseline.
  Live road routing remains Kakao's responsibility.

## Provider adapters

`lib/tour-api/client.ts` owns service-key use, timeouts, caching, operation
allowlisting, and upstream validation. `lib/kakao/maps.ts` owns the JavaScript SDK
browser boundary. `lib/kakao/local.ts` and `lib/kakao/directions.ts` validate and
normalize Local and Mobility responses on the server; their REST key remains
server-only.
`lib/licenses/client.ts` is intentionally unconfigured until the exact local
administrative dataset is selected. `matcher.ts` only identifies potential
matches; it does not infer legality.

## Server and client component boundaries

Pages and static display components remain Server Components. Forms, filtering,
localStorage access, and itinerary editing are isolated Client Components.
Client components are synchronous and receive only serializable values.
`localStorage` is accessed inside effects or event handlers, never during server
rendering.

Route Handlers are the public server boundary for external providers. Keys without
`NEXT_PUBLIC_` are read only there or in server-only adapter calls.

## Persistence

The current product deliberately uses browser persistence because the phase
requires an account-free, device-local experience. Each value is wrapped with a
schema version and validated with Zod. Corrupt, invalid, unsupported-future, or
unmigratable values are cleared safely.

Stored values are the latest pet profile, travel preferences, and draft
itinerary. They are not authoritative copies of Tourism API place details.

## Extension points

A future Supabase boundary may store authenticated user-owned profiles, itinerary
references, and field reports. It must not be introduced into the current storage
modules or used to bulk-copy Tourism API source records without the required
operational approval.

Future reservation support belongs behind a separate provider interface. It
must not alter the access evaluator, claim booking availability from tourism
metadata, or mix payment state with source-backed pet-policy evidence.
