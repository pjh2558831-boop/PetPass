# Candidate pipeline V1 bounded live verification gate

- Version: `candidate-pipeline-v1-live-verification-gate`
- Scope: busan
- Run snapshot: 2026-08-12T11:08:33.617Z
- Physical provider calls: 106/240
- Maximum provider concurrency: 3/3
- Cold/warm physical calls: 106/0
- Deterministic warm replay: yes
- Stage 1 samples naturally rediscovered: 6/7

## Scenario summary

| phase | scenario | initial | Stage A | Stage B | detailed | final eligible | physical calls | cache hits | duration ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| cold | relaxed_day_trip | 39 | 25 | 20 | 20 | 3 | 70 | 25 | 2294 |
| cold | balanced_day_trip | 39 | 25 | 20 | 20 | 6 | 9 | 86 | 274 |
| cold | packed_day_trip | 39 | 25 | 20 | 20 | 5 | 0 | 95 | 6 |
| cold | overnight | 39 | 25 | 20 | 20 | 6 | 15 | 80 | 535 |
| warm | relaxed_day_trip | 39 | 25 | 20 | 20 | 3 | 0 | 95 | 5 |
| warm | balanced_day_trip | 39 | 25 | 20 | 20 | 6 | 0 | 95 | 5 |
| warm | packed_day_trip | 39 | 25 | 20 | 20 | 5 | 0 | 95 | 5 |
| warm | overnight | 39 | 25 | 20 | 20 | 6 | 0 | 95 | 6 |

## Stage 1 sample progress (cold scenarios)

| scenario | content ID | initial | A | B | detail | eligible | final | removal reason |
|---|---|---|---|---|---|---|---|---|
| relaxed_day_trip | 2504464 | yes | yes | no | no | no | no | stage_b_not_selected |
| relaxed_day_trip | 2672393 | yes | yes | yes | yes | yes | yes | - |
| relaxed_day_trip | 3426656 | yes | yes | yes | yes | yes | yes | - |
| relaxed_day_trip | 3112126 | yes | yes | yes | yes | yes | yes | - |
| relaxed_day_trip | 2699563 | yes | no | no | no | no | no | category_not_selected |
| relaxed_day_trip | 3350880 | yes | no | no | no | no | no | category_not_selected |
| relaxed_day_trip | 3438936 | yes | no | no | no | no | no | category_not_selected |
| balanced_day_trip | 2504464 | yes | yes | no | no | no | no | stage_b_not_selected |
| balanced_day_trip | 2672393 | yes | yes | yes | yes | yes | yes | - |
| balanced_day_trip | 3426656 | yes | yes | yes | yes | yes | yes | - |
| balanced_day_trip | 3112126 | yes | yes | yes | yes | yes | yes | - |
| balanced_day_trip | 2699563 | yes | no | no | no | no | no | category_not_selected |
| balanced_day_trip | 3350880 | yes | yes | yes | yes | yes | yes | - |
| balanced_day_trip | 3438936 | yes | yes | yes | yes | yes | yes | - |
| packed_day_trip | 2504464 | yes | yes | no | no | no | no | stage_b_not_selected |
| packed_day_trip | 2672393 | yes | yes | no | no | no | no | stage_b_not_selected |
| packed_day_trip | 3426656 | yes | yes | yes | yes | yes | yes | - |
| packed_day_trip | 3112126 | yes | yes | yes | yes | yes | yes | - |
| packed_day_trip | 2699563 | yes | no | no | no | no | no | category_not_selected |
| packed_day_trip | 3350880 | yes | yes | yes | yes | yes | yes | - |
| packed_day_trip | 3438936 | yes | yes | yes | yes | yes | yes | - |
| overnight | 2504464 | yes | no | no | no | no | no | stage_a_not_selected |
| overnight | 2672393 | yes | yes | no | no | no | no | stage_b_not_selected |
| overnight | 3426656 | yes | yes | yes | yes | yes | yes | - |
| overnight | 3112126 | yes | yes | yes | yes | yes | yes | - |
| overnight | 2699563 | yes | yes | yes | yes | yes | yes | - |
| overnight | 3350880 | yes | yes | yes | yes | yes | yes | - |
| overnight | 3438936 | yes | yes | yes | yes | yes | yes | - |

## Gate checks

- atLeastOneScenarioCompletedWithoutProviderFailure: pass
- atLeastThreeEligibleInOneScenario: pass
- enoughForRelaxedOrBalancedItinerary: pass
- atLeastTwoUsefulCategories: pass
- requestCapNotExceeded: pass
- concurrencyBoundRespected: pass
- noDuplicateDetailOperations: pass
- stageLimitsRespected: pass
- adaptiveBackfillObserved: pass
- noStrictBoundaryLeakage: pass
- popularityRemainedNeutral: pass

No raw provider payload, keyed URL, Authorization header, credential, or provider prose is stored in this artifact.

