# Route solver V1

`route-solver-v1` is deterministic DFS branch-and-bound over at most 15 strict
candidates and five selected stops. It simulates every provider-resolved
directed edge, Asia/Seoul time window, wait, dwell, pace duration, accommodation
position, unknown-hours cap, and optional return edge while expanding. It keeps
ten finalists. Exact search has a 1,000 ms wall deadline and 1,000,000 expanded
state limit.

The optimistic upper bound never subtracts future costs and reserves 1,500
points for all possible positive non-place components, so it cannot prune a
better feasible route. If the exact limit is reached, a fresh deterministic
beam search uses width 256 and the same hard constraints. Exact completion is
reported only as `optimal_within_candidate_set_current_matrix`; fallback is
`best_found_within_time_limit`.

Ties use score, warning count, driving, waiting, trust sum, then lexicographic
ordered content IDs. At most three finalists receive Stage 3 exact ordered-route
validation. Returned sections are resimulated; invalid or newly infeasible
routes are rejected and the next finalist is tried. No matrix-only route is
returned. The three deterministic baselines are utility greedy, nearest
neighbor, and schedule greedy.

Known limits: provider operating text is normalized conservatively; exact
search is local to the Stage 2 pool and captured matrix; current traffic is not
a future prediction; and the existing process-memory Stage 3 cache is not
shared across Vercel instances.

