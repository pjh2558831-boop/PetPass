# Route optimizer V1 controlled comparison

- Synthetic scenarios: 12
- Ready: 12
- Deterministic replay: pass
- Hard violations: 0
- Objective no worse than feasible baselines: pass

| Scenario | Optimizer | Score | Solver ms | Exact | Deterministic |
|---|---:|---:|---:|---:|---:|
| relaxed_day_one_way | ready | 2264 | 3 | yes | yes |
| relaxed_day_round | ready | 2229 | 2 | yes | yes |
| relaxed_overnight_one_way | ready | 2216 | 1 | yes | yes |
| relaxed_overnight_round | ready | 2171 | 0 | yes | yes |
| balanced_day_one_way | ready | 2915 | 2 | yes | yes |
| balanced_day_round | ready | 2990 | 2 | yes | yes |
| balanced_overnight_one_way | ready | 2859 | 1 | yes | yes |
| balanced_overnight_round | ready | 2814 | 1 | yes | yes |
| packed_day_one_way | ready | 3604 | 3 | yes | yes |
| packed_day_round | ready | 3569 | 3 | yes | yes |
| packed_overnight_one_way | ready | 3541 | 3 | yes | yes |
| packed_overnight_round | ready | 3496 | 3 | yes | yes |

This artifact contains synthetic identifiers only and does not compare final route ordering quality against live data.
