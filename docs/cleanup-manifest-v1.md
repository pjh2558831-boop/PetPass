# WEEKENDOG cleanup manifest v1

This is a Stage 1 classification only. It does not authorize deletion. The repository was already dirty, so every pre-existing modification and untracked path remains user-owned.

## Audit method

- Ran TypeScript, ESLint, 826 unit tests, 166 discovered Playwright cases (157 passed, 9 skipped), and a production build.
- Inspected App Router routes, imports/callers, package scripts, dynamic public-asset manifests, provider adapters, Supabase migrations/RPCs, tests, fixtures, documentation, `.gitignore`, and generated output.
- Searched the requested terms across source, SQL, JSON, tests, scripts, and docs. Notable totals include 26 `fetch(`, 43 `useEffect`, 42 `Promise.all`, 26 `MarkerClusterer`, 24 `CustomOverlay`, 11 `addMarkers`, 8 `redraw`, and no `setInterval`. Counts include tests/docs and are signals, not deletion proof.
- Did not install or run `knip`: the repository has no Knip configuration for App Router filesystem routes, scripts, dynamic assets, migrations, Playwright, fixtures, or provider operations. An unconfigured result would create false positives.
- Never treated migrations, CLI/verification scripts, fixtures, route files, environment examples, provider reference documents, or dynamically addressed assets as unused merely because an import search was empty.

## Classification summary

| Classification | Decision |
| --- | --- |
| `safe_to_delete` | None proven in Stage 1. |
| `requires_manual_review` | 10 code/config/data-surface groups listed below. |
| `must_keep` | Product routes, provider/domain code, migrations, fixtures, tests, scripts, skills/docs, configs, dynamically referenced assets, and current declared dependencies. |
| `generated_or_ignored` | `.next`, test/coverage reports, verification evidence, and extraneous packages inside generated `node_modules`. |

## `safe_to_delete`

None. Passing static checks are not sufficient proof that operational scripts, public RPC contracts, partner source assets, or browser-storage migration paths can be removed. Stage 2 should begin with a user-approved deletion subset, not a blanket cleanup.

## `requires_manual_review`

| Candidate | Evidence | Why deletion is not yet safe | Required proof before any Stage 2 action |
| --- | --- | --- | --- |
| `lib/map-places/query.ts` (1,016 B) | Exports `queryMapPlaces`; no application/test caller found. Wraps the legacy bounds RPC. | May be an external/operational compatibility surface and is linked to a still-granted public RPC. | Confirm no external script/deployment uses it; inspect Vercel/runtime logs; revoke or retain RPC and code together. |
| `app/api/tour/homepage/route.ts` (2,383 B) | Current homepage calls `/api/homepage/places`; this older route is exercised by dedicated unit tests. | Filesystem routes are public contracts and cannot be classified by imports. | Check production/Preview access logs and client integrations; deprecate explicitly before removal. |
| `scripts/ingest-kakao-busan.ts` (5,499 B) and `lib/map-places/kakao-ingest.ts` (1,978 B) | Not the command currently selected by `package.json`; newer plan/collection modules exist. | Diagnostic and ingest scripts are operational tools; an import graph cannot prove they are obsolete. | Compare v1/v2 runbooks, backup/rollback usage, provider quotas, and operator workflows; obtain explicit approval. |
| `loadSavedRouteRecommendation` in `lib/storage/recommendation-storage.ts` | Unit-tested but has no app caller. | This is the missing read side of the advertised save feature, so removing it would cement a correctness bug. | Integrate it into the intended saved-itinerary flow or explicitly remove/rename the product feature with UX approval. |
| `lib/storage/itinerary-storage.ts` (738 B) | App caller not found; unit-tested and referenced by persistence architecture. | May be a versioned migration/compatibility boundary. | Decide canonical itinerary persistence, test legacy snapshot migration, then remove only superseded code. |
| Legacy public RPCs `get_map_places_in_bounds` and `get_public_map_catalog_v1` | Security advisor reports public execute grants; current browser path uses V2/location. | Remote database API, not just local dead code. Revocation can break old clients/scripts. | Inventory callers and API logs; prepare explicit migration/reversal; require remote approval. |
| Advisor-reported unused indexes | Three indexes reported unused. | Statistics can reset; ingest/review workflows may be infrequent; dropping affects remote writes/queries. | Capture stats across a representative period and query plans; prepare reversible migration; require remote approval. |
| Duplicate “Codex Skills” paragraph in `AGENTS.md` | The same repository-local skill instruction appears twice. | `AGENTS.md` is protected project guidance and currently user-modified. | Approve a documentation-only deduplication and preserve the binding wording exactly once. |
| Original partner JPGs | `kto-horizontal-ko.jpg` and `mois-horizontal-ko.jpg` are not runtime-referenced; transparent derivatives are used. | They may be provenance/source originals for official marks; savings are only 76,212 B. | Confirm licensing/provenance retention policy before moving or deleting. Do not alter the official artwork. |
| Untracked path `(a.textContent` and the untracked Korean-named reference directory | Present before this audit; origin and intended contents are unknown. | User-owned untracked data must never be deleted based on name or import reachability. | User identifies ownership/purpose; inspect only with explicit scope if cleanup is approved. |

## `must_keep`

### Product and provider boundaries

- All `app/**/page.tsx`, layouts, errors, and Route Handlers: filesystem routing is runtime discovery.
- `components/`, `lib/tour-api`, `lib/kakao`, `lib/licenses`, `lib/pet-access`, `lib/itinerary`, `lib/storage`, `types`, and shared schemas used by current contracts.
- Kakao source pins, SDK loader, Local/Mobility adapters, KorPetTourService2 adapters, license parsers, evidence evaluation, and route engine Stages 1–5.
- Optional veterinary, pet-shop, and shopping layers even when disabled by default.

### Database and operations

- Every Supabase migration, including old migrations. Never delete migration history.
- Collection, backup, verification, audit, and restore scripts unless the corresponding runbook is retired explicitly.
- `.env.example`; no environment variable rename/removal is justified.
- `.vercel/project.json` and Vercel configuration state; no Vercel setting change is part of cleanup.

### Tests, fixtures, and documentation

- All current Vitest and Playwright coverage. The suite guards provider truth, maps, marker counts, responsive layouts, storage versions, API contracts, recommendation stages, and secret boundaries.
- All `fixtures/`: every inspected fixture has a test/demo role and production must never fall back to it.
- `AGENTS.md`, `design.md`, architecture/API/provider/map/recommendation docs, `.agents/skills`, and reference/checklist material. Individual duplicated prose may be edited only as an approved documentation change.

### Public assets

- Ten hero photos referenced dynamically by `HERO_PHOTOS`; absence of literal imports is expected.
- Four map-pin SVGs referenced by computed source/kind selection and tested.
- `og.png`, partner logos used on the homepage, and documented official marks.
- The two original partner JPGs remain `requires_manual_review`, not safe deletions.

### Dependencies

All declared dependencies and dev dependencies have a source, configuration, script, or test role:

- Runtime: Next, React/React DOM, Supabase JS, Zod, Lucide React, and `server-only`.
- Tooling: TypeScript/types, ESLint/Next config, Tailwind/PostCSS, Vitest/jsdom, Playwright, `tsx`.

No package removal is approved. Major-version upgrades and framework replacement are outside this workflow.

## `generated_or_ignored`

| Path/item | Measured state | Stage 2 treatment |
| --- | --- | --- |
| `.next/` | 2,296 files, 509,980,441 B after build; ignored | Rebuildable. May be cleared only as an explicit local generated-output cleanup, never counted as source reduction. |
| `test-results/` | 1 file, 45 B; ignored | Rebuildable test metadata. |
| `playwright-report/`, `coverage/` | Absent at audit time; ignored | Rebuildable when present. |
| `verification-evidence/` | 114 files, 31,065,910 B; ignored by contents | Retain as audit evidence unless the user approves evidence rotation. Do not treat it as application bloat. |
| `node_modules/` extraneous packages | npm reports five extraneous WASM helper packages (`@emnapi/core`, `@emnapi/runtime`, `@emnapi/wasi-threads`, `@napi-rs/wasm-runtime`, `@tybys/wasm-util`) | Generated install state, not declared dependencies. A future approved `npm prune`/clean install may remove them; verify Next image/build behavior and lockfile remains unchanged. |

## Asset and dependency conclusion

- Public source assets are large because of ten hero PNGs, but they are used. Format/derivative optimization is Stage 3 performance work, not dead-asset deletion.
- There is no proven orphaned runtime image. Two source JPGs need provenance review.
- There is no proven unused declared package. Generated extraneous packages are the only package-cleanup signal.
- No CSS selector deletion is safe from text search alone because global CSS, responsive class composition, and dynamically generated map states require browser coverage and a CSS-aware manifest.

## Proposed Stage 2 guardrail

If Stage 2 is approved, begin with a machine-readable allowlist containing only candidates separately approved by the user. Back up deletion candidates with hashes, then use small batches and run typecheck/lint after each. Full unit/E2E/build verification is required before accepting any deletion. Remote RPC/index changes do not belong in Stage 2 without separate Supabase approval.
