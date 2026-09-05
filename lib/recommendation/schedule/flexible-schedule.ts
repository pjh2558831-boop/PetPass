import "server-only";
import { clockMinutes, departureCandidates, firstAvailableMinute, UNDATED_REFERENCE_DATE } from "@/lib/recommendation/schedule/schedule-intent";
import { ROUTE_SOLVER_V1_CONFIG } from "@/lib/recommendation/config/route-solver-v1";
import { analyzeRouteFeasibilityV2, feasibilityBudgetExhausted, type FeasibilityBudget } from "@/lib/recommendation/v2/feasibility";
import type { RouteOptimizationInput } from "@/lib/recommendation/types/route-optimizer";

export const MINIMUM_GENERATED_DWELL_MINUTES = { attraction: 60, culture: 60, festival: 90, leisure: 90, accommodation: 30, shopping: 30, food: 45, transportation: 30, unknown: 30 } as const;

/** One pool and matrix; only deterministic schedule simulation is repeated. */
export function findFeasibleSchedule(input: RouteOptimizationInput, now: Date, sharedBudget?: FeasibilityBudget) {
  const intent = input.tripRequest.scheduleIntent;
  // Reserve half of the existing request allowance for scoring the feasible schedule.
  // Neither time-candidate attempts nor the optimizer restart the overall budget.
  const budget: FeasibilityBudget = sharedBudget ?? {
    remainingStates: ROUTE_SOLVER_V1_CONFIG.maxExpandedStates,
    deadline: performance.now() + ROUTE_SOLVER_V1_CONFIG.solverDeadlineMs,
    reservedStates: ROUTE_SOLVER_V1_CONFIG.maxExpandedStates / 2,
    reservedTimeMs: ROUTE_SOLVER_V1_CONFIG.solverDeadlineMs / 2,
  };
  const pastStart = intent && clockMinutes(input.tripRequest.startTime) < firstAvailableMinute(intent, now);
  const original = { input, feasibility: analyzeRouteFeasibilityV2(pastStart ? { ...input, candidates: [] } : input, budget), adjustedDwell: false, budget };
  if (!intent) return original;
  const target = input.tripRequest.desiredStopCount ?? 3;
  if (intent.startTime && original.feasibility.maximumFeasibleStopCount >= target) return original;
  const boundaries = input.candidates.flatMap(candidate => {
    const travel = input.matrix.edges[input.departure.id]?.[candidate.node.id]?.durationSeconds;
    if (travel === null || travel === undefined) return [];
    return candidate.schedule.windows.flatMap(window => [window.startMinutes - travel / 60, window.endMinutes - candidate.dwellDurationMinutes - travel / 60]);
  });
  const times = departureCandidates(intent, now, boundaries);
  let best = original;
  // Original-clock results win ties for explicit intent. Missing time uses ordered daytime candidates.
  let hasRanked = Boolean(intent.startTime && times.includes(input.tripRequest.startTime));
  for (const shorten of [false, true]) {
    for (const time of times) {
      input.signal?.throwIfAborted();
      if (feasibilityBudgetExhausted(budget)) break;
      const next: RouteOptimizationInput = { ...input, tripRequest: { ...input.tripRequest, date: intent.date ?? UNDATED_REFERENCE_DATE, startTime: time }, candidates: shorten ? input.candidates.map(candidate => ({ ...candidate, dwellDurationMinutes: candidate.dwellDurationSource === "category_default" && !candidate.locked ? Math.min(candidate.dwellDurationMinutes, candidate.visitRole === "rest" ? 30 : MINIMUM_GENERATED_DWELL_MINUTES[candidate.category]) : candidate.dwellDurationMinutes })) : input.candidates };
      const feasibility = !shorten && time === input.tripRequest.startTime && !pastStart ? original.feasibility : analyzeRouteFeasibilityV2(next, budget);
      const result = { input: next, feasibility, adjustedDwell: shorten, budget };
      const dayRank = (clock: string) => clockMinutes(clock) >= 540 && clockMinutes(clock) <= 1080 ? 0 : 1;
      const wait = (value: typeof feasibility) => value.status === "ready" ? value.minimumWaitSeconds ?? Infinity : Infinity;
      if (!hasRanked || feasibility.maximumFeasibleStopCount > best.feasibility.maximumFeasibleStopCount || (!intent.startTime && feasibility.maximumFeasibleStopCount === best.feasibility.maximumFeasibleStopCount && (dayRank(time) < dayRank(best.input.tripRequest.startTime) || (dayRank(time) === dayRank(best.input.tripRequest.startTime) && wait(feasibility) < wait(best.feasibility))))) { best = result; hasRanked = true; }
      if (intent.startTime && feasibility.maximumFeasibleStopCount >= target) return result;
    }
    if (best.feasibility.maximumFeasibleStopCount >= target) break;
  }
  return best;
}
