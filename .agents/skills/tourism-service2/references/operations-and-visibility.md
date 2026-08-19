# Tourism operation and visibility checklist

## Request boundary

- Determine the current operation, required parameters, pagination model, content identifiers, and response envelope from `lib/tour-api/` and tests.
- Compare proposed contract changes with current Korea Tourism Organization documentation rather than memory.
- Keep timeout, retry, rate-limit, and provider-error behavior explicit.
- Preserve server-only key handling and avoid logging constructed URLs when they may contain credentials.

## Response boundary

- Validate raw envelopes and items before normalization.
- Distinguish provider error, no result, filtered result, malformed result, and transport failure.
- Preserve authoritative original text and retrieval metadata used by `lib/pet-access`.
- Do not make an invisible or incomplete Tourism record public merely to increase result counts.

## Validation modes

- Default: unit tests and mocked e2e fixtures.
- Contract audit: opt-in repository audit script.
- Live verification: opt-in only, with credentials and network authorization; never mutate provider data.
