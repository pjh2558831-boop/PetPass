# Route objective V1

`route-objective-v1` ranks only already-feasible routes. It never changes
Stage 1 eligibility, Stage 2 place utility, or Stage 3 edge validity.

The total is the exact sum of the returned positive components minus the
returned penalties. Position discounts for the integer 0–1000 place utility are
`1, .95, .90, .82, .74`. Requested-category coverage is +100 per distinct
category, capped at +300. Driving costs 5/minute; waiting after a route-wide
15-minute allowance costs 2/minute; a consecutive repeated category costs 120;
an unknown schedule costs 150; and each stop away from the pace target costs
120. Detour is measured against the fastest provider-backed permutation for the
same selected set and trip shape: `min(300, max(0, ratio - 1.15) * 600)`.

The transition table is versioned in `category-transition-v1.ts`: activity to
meal +50, activity to rest +60, meal to activity +30, rest to activity +35,
activity to final overnight accommodation +50, and meal to final overnight
accommodation +40. A high-activity stop followed by rest adds 60 separately.
Meal dwell overlapping 11:30–14:00 or 17:30–20:00 by at least 30 minutes adds
100; otherwise a meal subtracts 80. Final overnight accommodation adds 80.

One popularity anchor adds 100 only for sufficient Stage 2 popularity at or
above .7. One exploration stop adds 60 only for separately sufficient exposure
at or below .3, preference fit at least .7, and trust at least 70. Neutral or
missing data produces no label and no bonus.

