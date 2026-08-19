# Recommendation stage boundaries

Follow the implementation, not this file, when names diverge.

1. **Request and profile validation:** reject malformed or impossible inputs; do not repair them with invented facts.
2. **Candidate retrieval:** obtain a bounded, explainable pool from eligible source layers.
3. **Category reservation and hard gates:** preserve required category diversity and remove candidates that cannot safely participate.
4. **Place utility and retrieval scoring:** apply versioned, documented soft preferences with deterministic tie-breaking.
5. **Travel matrix and schedule simulation:** calculate realistic movement, dwell time, opening compatibility, and trip pace.
6. **Route search and objective:** compare feasible sequences; keep objective terms measurable and unit-aware.
7. **Final validation:** recheck constraints after optimization. Never skip this because an earlier stage already checked them.
8. **Explanations and response:** describe actual score/constraint reasons without overstating confidence.
9. **Persistence and editing:** preserve versioned Zod storage and route-edit session integrity.

A change crossing stages requires tests at every affected boundary and an end-to-end recommendation flow.
