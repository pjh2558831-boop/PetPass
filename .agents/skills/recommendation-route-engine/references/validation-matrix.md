# Recommendation validation matrix

| Change | Required focused evidence |
| --- | --- |
| Candidate retrieval or reservation | Candidate pipeline tests, coverage/diversity cases, controlled candidate comparison |
| Pet-access eligibility | Evidence and automatic-route-eligibility tests plus recommendation service tests |
| Popularity or place utility | Config tests, monotonicity/tie cases, explanation assertions, before/after score examples |
| Dwell, meal, hours, or pace | Schedule compatibility, dwell, trip-pace, and impossible-schedule cases |
| Travel matrix | Unit/timeout/fallback tests and controlled travel-matrix comparison |
| Route objective or search | Baseline, determinism, feasibility, final validation, and route-optimizer comparison |
| Request/response or storage | Schema tests, API tests, storage tests, recommendation and itinerary e2e flows |

For comparisons, report fixture set, versioned config, baseline, changed metric, regressions, and why the tradeoff is acceptable. Live verification is supplementary and opt-in; it never replaces deterministic tests.
