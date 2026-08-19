# Pet-access verdict invariants

## Evidence states

- **Supported:** source text explicitly supports the normalized fact and the parser retains the supporting text.
- **Unknown:** the provider did not supply the fact or the field is not applicable to the source.
- **Needs confirmation:** source text is ambiguous, incomplete, stale for the decision, or conflicts with another relevant source.
- **Restricted or unavailable:** use only when explicit source text and the existing deterministic rule support it.

## Required provenance

Every assessment must retain:

- original source text used for the decision;
- source/provider name;
- stable source record or content identifier when present;
- retrieval timestamp;
- normalized facts and the rule that produced the verdict.

## Change review

- Add positive, negative, absent, ambiguous, conflicting, and malformed-source tests.
- Check pet-size compatibility independently from general admission.
- Check automatic-route eligibility after verdict changes.
- Keep user-facing language honest: verification-required records must remain visibly uncertain.
