# catalog-recommendation-v1

The catalog explorer uses provider-neutral discovery ordering, not route
utility and not source order.

```text
0.30 categoryAndFilterFit
+ 0.25 petEvidenceConfidence
+ 0.15 proximity
+ 0.10 dataCompleteness
+ 0.10 freshness
+ 0.10 discoveryStrength
```

Components are bounded to `[0,1]`; the result is a stable integer from 0 to
1000. Kakao records remain unverified regardless of score. Query-hit count and
category agreement affect discovery strength only. Tourism and other records
use a neutral discovery prior.

Ties use evidence, distance, normalized Korean name, and stable provider ID in
that order. `인기도순` uses first-party `popularity-v1` only. Until sufficient
first-party events exist, its neutral 0.5 rows remain in recommendation order
and the UI discloses that fallback.
