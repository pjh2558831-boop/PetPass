# PetPass release gates

## Local gate

- Review `git status --short` and the intended diff; exclude unrelated user changes from any commit or deployment.
- Confirm Node and package-manager expectations from `package.json`.
- Run typecheck, lint, unit tests, and production build.
- Run focused e2e tests for changed browser flows.
- Verify no credential values, debug logging, fixture fallback, or demo-only substitution entered production paths.

## Preview gate

- Confirm exact commit and Vercel project/environment target.
- Inspect variable names and scopes without printing values.
- Smoke-test application load, affected API routes, map/provider boundaries, changed user flows, and mobile layout.
- Check runtime/build logs for errors and confirm no unintended production data writes.

## Production gate

- Obtain explicit production authorization.
- Confirm preview evidence applies to the same commit.
- Identify data/migration dependencies as separate approved operations.
- Define rollback or previous known-good deployment and post-deploy monitoring.
- Promote/deploy only after all required gates pass; report actual outcomes rather than assuming success.
