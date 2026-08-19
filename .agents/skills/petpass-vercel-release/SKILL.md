---
name: petpass-vercel-release
description: Use when preparing, reviewing, diagnosing, or performing a PetPass Vercel build or deployment, including environment variables, preview deployments, production promotion, Route Handler runtime compatibility, or release rollback planning.
---

# PetPass Vercel release

Apply [`petpass-project-context`](../petpass-project-context/SKILL.md) first. Use current official Vercel guidance and the available Vercel deployment or environment Skill for live platform operations.

## Environments

- **Local:** developer machine and local `.env*`; no assumption that Vercel-linked values are present.
- **Preview:** isolated deployment used to verify the exact commit and environment scope before production.
- **Production:** customer-facing deployment and data. Promotion and environment changes require explicit authorization.

The repository currently relies on Next.js/Vercel defaults unless an actual checked-in configuration says otherwise. Do not invent `vercel.json` merely to perform a normal deployment.

## Workflow

1. Inspect `package.json`, `next.config.ts`, environment-variable usage, Route Handler runtimes, build output, and the exact Git diff.
2. Identify required public versus server-only variables by name without printing values. Flag drift between runtime usage and `.env.example`.
3. Run local release gates before recommending preview or production.
4. For preview, confirm branch/commit, project link, environment target, provider availability, and non-production data boundaries.
5. Verify critical browser/API flows on the preview URL before production recommendation.
6. Before production, state what will change, required authorization, rollback option, migration/data dependencies, and monitoring plan.

## Allowed modifications

Modify repository deployment documentation, Next.js/runtime configuration, or CI files only when explicitly requested and after tracing production implications. Platform-side changes are separate actions requiring the appropriate authorization.

## Forbidden modifications

- Never change production environment variables, domains, project settings, or promote a deployment without explicit authorization.
- Never print or copy secret values. Never expose server-only provider keys to the browser.
- Do not deploy with failing lint, typecheck, tests, or production build.
- Do not deploy demo-only provider substitution as production fallback.
- Do not run database migrations or catalog collection as an implicit deployment step.

## Validation

At minimum run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`; `npm run verify` covers the non-browser gate. Add focused Playwright checks for changed critical flows. For a real preview or production action, record deployment target, commit, checks, runtime smoke test, and rollback path without exposing secrets.

See [release gates](references/release-gates.md).
