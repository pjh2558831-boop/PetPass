# Route optimizer V1 bounded live verification

- Run: 2026-08-12T13:08:51.727Z
- Natural Stage 2 candidates: 6
- Matrix: 42/42
- Solver: ready
- Stops: 3112126, 3443614, 2672393, 3350880
- Distance/duration: 22547 m / 3958 s
- Provider calls (Tour/Kakao): 82/26

## Baselines

| Baseline | Score | Stops | Driving seconds |
|---|---:|---:|---:|
| nearest_neighbor | 2254 | 3 | 4033 |
| highest_utility_fastest | 2116 | 3 | 3514 |
| category_greedy | 2254 | 3 | 4033 |

## Gate checks

- naturalStage2CandidatesUsed: pass
- providerMatrixComplete: pass
- finalRouteReady: pass
- finalValidationSucceeded: pass
- minimumStopsSatisfied: pass
- usefulCategoryCoverage: pass
- providerGeometryPresent: pass
- deterministicReplay: pass
- requestCapsRespected: pass
- concurrencyRespected: pass
- noAuthorizationOrQuotaIssue: pass

No raw provider body, keyed URL, Authorization header, credential, place name, coordinate, or pet-policy prose is persisted.

