---
name: petpass-ui-review
description: Use when reviewing or changing PetPass pages, React components, responsive layout, map/sidebar UX, loading/empty/error states, place cards, filters, navigation, accessibility, or visual hierarchy.
---

# PetPass UI and UX review

Apply [`petpass-project-context`](../petpass-project-context/SKILL.md) first. Pair with `kakao-integrations` for map behavior and `recommendation-route-engine` for recommendation or itinerary UI contracts.

## Scope

Relevant paths:

- `app/` presentation files and `app/globals.css`
- `components/`
- `design.md`
- UI-facing types and projections only when necessary
- Playwright tests and UI-focused unit tests under `tests/`

Improve the existing interface. Preserve its design language unless the user explicitly requests a redesign.

## Review workflow

1. Inspect the current component, page, shared layout, styles, data states, and relevant tests before editing.
2. Check desktop, tablet, and mobile behavior, including representative widths around 1440, 768, 390, and 320 pixels.
3. Check map/sidebar proportions, map initialization, marker interaction, selection and sidebar synchronization, filtering, place cards, navigation, and focus behavior.
4. Check loading, empty, error, partial-data, and success states. UI copy must not overstate source confidence or hide provider failures.
5. Preserve semantic structure, keyboard access, visible focus, readable contrast, touch targets, and reduced-motion expectations.
6. Keep browser-only APIs out of server rendering and avoid unnecessary client components.

## Allowed modifications

Modify existing pages, components, styles, focused UI projections, accessibility attributes, and relevant tests when requested. Reuse current components and tokens before adding new abstractions.

## Forbidden modifications

- Do not rebuild the app, introduce a new UI framework, or replace the design system for a focused improvement.
- Do not change provider/domain rules inside presentation code.
- Do not remove responsive behavior, map controls, loading/error states, or source attribution to simplify layout.
- Do not install dependencies unless the requested result cannot reasonably be achieved with the existing stack.

## Validation

Run `npm run typecheck`, `npm run lint`, relevant UI unit tests, and `npm run build`. Run focused Playwright flows for changed pages and interactions. Visually inspect desktop, tablet, and mobile states when a browser is available, including console errors and map behavior.

Use [responsive and map checklist](references/responsive-and-map-checklist.md) for reviews.
