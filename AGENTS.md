# PetPass repository instructions

## Codex Skills

Repository-specific workflows live in `.agents/skills/`. Start with
`petpass-project-context`, then load only task-relevant provider, domain, UI,
deployment, or regression Skills. Use `regression-check` after meaningful
browser-facing or interactive changes, with the verification scope below.

Respect higher-priority instructions and applicable `AGENTS.override.md` / nested
instructions. Explicit user instructions take precedence over Skill workflows;
Skills never expand authorization. If a Skill is missing or conflicting, report
the exact path/rule and continue safe, unblocked work without inventing a replacement.

## Purpose

PetPass reduces failed pet-travel visits by comparing a pet profile with the
original facility policy and composing a realistic South Korean travel route.
The Korea Tourism Organization KorPetTourService2 response is authoritative for
tourism-place and pet-access source text.

## Task execution

- Inspect relevant files, the current diff, scripts, and installed versions first.
  Review/diagnosis requests are read-only unless changes are requested.
- For implementation, inspect -> diagnose -> patch -> verify -> fix in-scope
  failures -> reverify. Plan briefly for complex work, then continue to completion;
  do not stop for approvals already granted. Respect explicit plan-only requests.
- Make reasonable, reversible assumptions within scope. Ask only when a material
  decision or required authorization is missing; continue independent safe work.
- Preserve working features, API/data contracts, and user edits outside the requested
  change. No unrelated refactors, dependency upgrades, or tool/plugin installation.
- DB migrations/data writes, auth/security changes, external writes, commits, pushes,
  merges, and deployments require explicit task authorization and satisfied
  prerequisites. Do not weaken safeguards or edit managed plugins to bypass them.
- For unfamiliar or changed APIs, use version-matched local/official documentation;
  corroborate community fixes. Do not assume the newest API matches this installation.
- Delegate independent work only when useful; keep its scope bounded and review results.

## Architecture boundaries

- `app/` and `components/` own presentation, navigation, and Route Handlers.
- `lib/tour-api`, `lib/kakao`, and `lib/licenses` own provider-specific code.
- `lib/pet-access` and `lib/itinerary` own deterministic domain decisions.
- `lib/storage` owns versioned, Zod-validated browser persistence.
- `types/` and `lib/shared/domain-schemas.ts` define domain contracts.
- Local fixtures live only in `fixtures/` and must remain visibly labeled demo
  data. Production failures must never fall back to fixtures.

## Commands

Confirm these scripts against `package.json` before use; preserve the existing lockfile
and do not install dependencies for documentation-only tasks.

- Install: `npm install`
- Develop: `npm run dev`
- Strict TypeScript: `npm run typecheck`
- Lint: `npm run lint`
- Unit tests: `npm run test`
- Browser flows: `npm run test:e2e`
- Production build: `npm run build`
- Full non-browser verification: `npm run verify`

## Required verification

Match checks to the change while honoring explicit acceptance criteria and CI gates.

- Documentation/instruction-only changes: check the diff, referenced paths, and rule
  consistency. No application build/tests when application code/config is unchanged.
- Code changes: run strict type checking, lint, and relevant unit tests. Add or update
  meaningful regression coverage for changed behavior and bug fixes.
- Production runtime, dependency, or build/config changes: also run a production build.
- Navigation, storage, or interactive itinerary changes: run the critical Playwright
  flow. For UI changes, also inspect desktop/mobile rendering, keyboard access,
  console errors, and Korean text for corruption, clipping, and overlap.
- Use `npm run verify` instead of duplicate checks only after confirming its coverage.
  Repeat or broaden passing checks only for new changes, failures, or unresolved risks.
- Review the final diff. Distinguish pre-existing failures and environment blockers
  from regressions. Never weaken checks to hide failures or claim unrun checks passed.

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

## Completion report

Use concise, polite Korean. Report changed files and key changes, Skills used,
commands actually run with PASS/FAIL/NO-GO (blocked) or SKIPPED and reasons,
unverified risks, and commit/push/merge/deployment status. Do not claim live checks
or actions without execution evidence.

The generated Next.js block below is preserved. Its wording about committing
is not permission to commit; explicit user authorization is still required.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
