# Candidate pipeline V1 controlled comparison

- Comparison version: `candidate-pipeline-controlled-comparison-v1`
- Fixture version: `candidate-pipeline-v1-controlled-fixture`
- Scenarios: 4
- Provider counts are deterministic fixture-model counts, not live API measurements.
- This comparison evaluates candidate discovery only; it does not compare route ordering or route quality.

| scenario | arm | Stage A | Stage B | detailed | batches | eligible | categories | provider calls | detail calls | duplicates | insufficient |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| relaxed_activity | pre_stage2_fixed_12_role_aware | 12 | 12 | 12 | 1 | 3 | 3 | 42 | 36 | 0 | no |
| relaxed_activity | candidate_pipeline_v1 | 22 | 20 | 10 | 2 | 6 | 3 | 58 | 52 | 0 | no |
| balanced_food | pre_stage2_fixed_12_role_aware | 12 | 12 | 12 | 1 | 3 | 3 | 44 | 36 | 0 | no |
| balanced_food | candidate_pipeline_v1 | 25 | 20 | 15 | 3 | 7 | 4 | 71 | 63 | 0 | no |
| packed_overnight | pre_stage2_fixed_12_role_aware | 12 | 12 | 12 | 1 | 4 | 4 | 46 | 36 | 0 | no |
| packed_overnight | candidate_pipeline_v1 | 25 | 20 | 15 | 3 | 8 | 5 | 74 | 64 | 0 | no |
| packed_sparse_activity | pre_stage2_fixed_12_role_aware | 12 | 12 | 12 | 1 | 2 | 2 | 40 | 36 | 0 | yes |
| packed_sparse_activity | candidate_pipeline_v1 | 19 | 17 | 17 | 4 | 5 | 2 | 56 | 52 | 0 | no |

## Summary

- Eligible discoveries: 12 -> 26 (+14)
- Category coverage: 12 -> 14 (+2)
- Provider calls: 172 -> 259 (+87)
- Detail calls: 144 -> 231 (+87)
- Duplicated detail calls: 0 -> 0
- Insufficient-route frequency: 1/4 -> 0/4
- Deterministic Stage 2 output: yes

