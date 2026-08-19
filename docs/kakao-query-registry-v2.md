# Kakao Busan compact-query registry V2

`kakao-busan-query-registry-v2` is a delta-only registry. It preserves the V1
registry and adds exactly two compact searches for each of Busan's 16 official
districts:

- `부산 {구군} 반려동물동반 카페` with `CE7`
- `부산 {구군} 반려동물동반 식당` with `FD6`

The resulting 32 keys use `kakao-busan-v2:{districtCode}:{cafe|food}:0`.
The collector fixes concurrency at 2, page size at 15, normal maximum at 96
requests, and physical cap at 104 including retry attempts.

Every V2 run has `is_full_catalog_run = false`. Missing results therefore do
not stale, hide, reject, or delete existing records. The existing commit RPC
continues to upsert by Kakao place ID, retain manual review columns, and append
sanitized query-hit provenance.

The 2026-08-19 provider execution returned zero documents for the requested
compact query plus category-code combinations. Runs 4 and 5 nevertheless
completed all 32 zero-result checkpoints without inserts, updates, or stale
reconciliation. No broader keyword was substituted.
