# Travel Matrix V1 Controlled Comparison

- Version: travel-matrix-v1-controlled-comparison
- As of: 2026-08-12T03:00:00.000Z
- Deterministic: true
- Every cold batch strategy beats naive pairwise: true
- Every warm replay reduces provider calls: true

| Scenario | Nodes | Directed edges | Naive calls | Batch calls | Fallback calls | Cold calls | Warm calls | Warm cache hits | Unresolved | Complete | Duration ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| three_candidates | 4 | 12 | 12 | 4 | 0 | 4 | 0 | 12 | 0 | true | 5 |
| five_candidates | 6 | 30 | 30 | 6 | 0 | 6 | 0 | 30 | 0 | true | 7 |
| six_candidates | 7 | 42 | 42 | 7 | 0 | 7 | 0 | 42 | 0 | true | 8 |
| fifteen_candidates | 16 | 240 | 240 | 16 | 0 | 16 | 0 | 240 | 0 | true | 17 |
| mixed_radius | 7 | 42 | 42 | 7 | 24 | 31 | 0 | 42 | 0 | true | 32 |
| partial_multi_destination | 6 | 30 | 30 | 6 | 10 | 16 | 0 | 30 | 0 | true | 17 |

Synthetic fixture only. No route ordering or live provider call is performed.
