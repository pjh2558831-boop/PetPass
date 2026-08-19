---
name: regression-check
description: Use as the final PetPass verification layer after meaningful changes to rendered UI, browser state, navigation, Kakao map behavior, place interactions, responsive layout, API-driven UI, recommendations, itineraries, or other critical user journeys. Skip routine browser work for documentation-only or backend-only changes with no visible impact.
---

# PetPass browser regression check

Apply [`petpass-project-context`](../petpass-project-context/SKILL.md) first. Load the implementation Skill for the changed area: `kakao-integrations`, `petpass-ui-review`, `recommendation-route-engine`, `place-evidence-verification`, or another relevant project Skill. This Skill verifies behavior; it does not own feature implementation.

Use the installed `playwright-cli`. If syntax is uncertain, run `playwright-cli --help` or `playwright-cli --help <command>`. Do not install Playwright again, switch to Playwright MCP, or change the repository's Playwright setup. If the executable is missing, report the blocker before installing anything.

## Decide the scope

1. Inspect the diff and trace each changed browser-facing contract to its route, component, state, API, and existing tests.
2. Run browser verification when a change can affect UI, navigation, client state, maps, markers, clustering, filters, cards, sidebar synchronization, responsive layout, API-driven states, place details, recommendations, itineraries, or routing.
3. Skip Playwright CLI for documentation-only or backend-only changes unless the changed backend feeds a visible flow.
4. Keep the pass proportional. A card style change needs card, selection, and desktop/mobile checks; a shared-state or map change needs a broader pass.
5. Confirm features from the repository before testing them. PetPass currently has no user sign-in flow; do not invent authentication checks. Re-scan routes, middleware, and Supabase auth usage if auth-related code appears later.

Read [PetPass browser matrix](references/petpass-browser-matrix.md) to select real routes, components, and checks.

## Prepare the local app

1. Check whether a PetPass development server already responds locally and inspect its reported URL or running command. Do not assume port 3000.
2. If no server is running and browser verification is required, start the existing `npm run dev` command without modifying it. Capture the actual Local URL printed by Next.js.
3. Use local development by default. Use a preview URL only when the user provides or authorizes it. Never interact with production by default.
4. Prefer one named CLI session, such as `-s=petpass`, when it avoids repeated browser startup. Reuse it for the pass and close it afterward. Close stale sessions only when they interfere; never use `delete-data` on persistent browser data without a concrete need and authorization.

## Verify with Playwright CLI

Adapt the commands to the actual URL and selected flow:

1. Open the app: `playwright-cli -s=petpass open <local-url>`.
2. Capture a `snapshot` and use snapshot element refs for `find`, `click`, `fill`, and `press` where practical. Avoid brittle selectors.
3. Check `console error` and inspect `requests`. Investigate failed or suspicious requests that affect the changed flow; do not dump request bodies, headers, cookies, or tokens.
4. Exercise at least one normal success path for the changed feature. Verify relevant loading, empty, missing-data, and visible error states when they already exist.
5. Verify the actual interaction, not only page load: selection, state transitions, navigation, map/sidebar synchronization, filters, route actions, or recommendation results as applicable.
6. For UI/layout changes, verify desktop and mobile. Use repository breakpoints when defined; otherwise use representative desktop and mobile viewport sizes. Check overflow, clipping, map height, tappability, sidebar/sheet behavior, and fixed-element overlap.
7. Capture screenshots when they materially support visual verification. Save temporary evidence outside the repository unless the user requests a checked-in artifact, and avoid sensitive content.
8. If a regression is found and fixing it is within the user's implementation request, apply the relevant implementation Skill, fix it, and rerun the affected pass. Otherwise report exact reproduction steps.
9. Close the Playwright CLI session when verification is complete unless the user asks to keep it open.

Useful commands include `open`, `snapshot`, `find`, `click`, `fill`, `press`, `resize`, `screenshot`, `console`, `requests`, `request`, `reload`, and `close`. Run help before using uncertain options.

## PetPass invariants

- Application: meaningful content renders with no fatal runtime, hydration, or framework-overlay error.
- Kakao map: SDK initializes; the canvas has usable dimensions; markers render; clustering remains correct when present; marker/card selection and sidebar state stay synchronized; relevant filters update visible results without unwanted resets.
- Places: cards, category labels, images/placeholders, pet evidence, missing fields, empty results, and detail navigation remain honest and usable.
- Routing and recommendations: origin/destination or planner state remains valid; visible failures are handled; generated results render and remain selectable; route UI does not break the map layout.
- Responsive UI: desktop and mobile remain usable with no horizontal overflow or important clipped/overlapped controls.
- Authentication: verify only if an actual auth flow exists at the time of the change. Never print credentials, cookies, session storage, or tokens.

## Safety and completion

- Never expose environment values, API keys, Supabase secrets, Kakao REST keys, cookies, authentication tokens, or sensitive request data in output or screenshots.
- Never modify production data, run destructive Supabase operations, deploy, or interact with production as part of this check.
- Do not treat a successful page load as sufficient, hide console errors, or ignore blocking network failures caused by the change.
- Do not weaken tests or modify application code merely to make verification appear green.
- A relevant task is not complete until the changed browser behavior passes, new critical console errors are absent, blocking feature-related network failures are resolved or reported, and desktop/mobile checks pass when relevant.

Run the repository's proportional non-browser checks as directed by `petpass-project-context`; Playwright CLI complements rather than replaces typecheck, lint, tests, or build.

## Report

End each use with this concise, evidence-based report:

### Browser Verification

- Environment:
- URL:
- Flows checked:
- Desktop:
- Mobile:
- Console:
- Network:
- Screenshots:
- Regressions found:
- Fixes applied:
- Final result:

Mark skipped or not-applicable items explicitly. Never say "all good" without listing what was checked.
