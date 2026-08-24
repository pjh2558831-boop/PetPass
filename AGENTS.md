# PetPass repository instructions

## Codex Skills

Repository-specific workflows live in `.agents/skills/`. Start with
`petpass-project-context`, then load the matching provider, domain, UI,
deployment, or regression Skill for the task. The rules below remain binding.
Use `regression-check` after meaningful browser-facing or interactive changes.

## Purpose

PetPass reduces failed pet-travel visits by comparing a pet profile with the
original facility policy and composing a realistic South Korean travel route.
The Korea Tourism Organization KorPetTourService2 response is authoritative for
tourism-place and pet-access source text.

## Architecture boundaries

- `app/` and `components/` own presentation, navigation, and Route Handlers.
- `lib/tour-api`, `lib/kakao`, and `lib/licenses` own provider-specific code.
- `lib/pet-access` and `lib/itinerary` own deterministic domain decisions.
- `lib/storage` owns versioned, Zod-validated browser persistence.
- `types/` and `lib/shared/domain-schemas.ts` define domain contracts.
- Local fixtures live only in `fixtures/` and must remain visibly labeled demo
  data. Production failures must never fall back to fixtures.

## Commands

- Install: `npm install`
- Develop: `npm run dev`
- Strict TypeScript: `npm run typecheck`
- Lint: `npm run lint`
- Unit tests: `npm run test`
- Browser flows: `npm run test:e2e`
- Production build: `npm run build`
- Full non-browser verification: `npm run verify`

## Required verification

Before finishing a task, run strict type checking, lint, relevant unit tests,
and a production build. Run the critical Playwright flow when navigation,
storage, or interactive itinerary behavior changes.

## Data and security rules

- Never expose `TOUR_API_SERVICE_KEY`, `KAKAO_REST_API_KEY`, or
  `LOCALDATA_SERVICE_KEY` to client code. Only the Kakao JavaScript key may use
  `NEXT_PUBLIC_`.
- Never log, commit, or paste credentials.
- Validate every external response before it reaches the domain layer.
- Never invent pet-policy restrictions, permissions, weights, sizes, areas, or
  required items. If source information is absent, ambiguous, or conflicting,
  use `NEEDS_CONFIRMATION`.
- Preserve the original source text, source name, and retrieval timestamp in
  every access assessment.
- A missing administrative license match is `NO_MATCH`; it is not proof of
  illegal operation.

## Production requirements

Production builds must pass without demo-only provider substitutions, real
secrets, or TypeScript errors. The development demo must remain visibly marked.
Keep Route Handlers Vercel-compatible and browser APIs out of server rendering.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
