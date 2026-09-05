export interface ScheduleIntent {
  date: string | null;
  startTime: string | null;
}

export interface RouteSchedule {
  requested: ScheduleIntent;
  effective: ScheduleIntent;
  state: "scheduled" | "undated_template" | "adjustment_proposal";
  timingBasis: "relative" | "illustrative_clock" | "dated";
  roadValidated: boolean;
  timeBudgetValidated: boolean;
  calendarValidation: "checked_known_rules" | "date_required" | "unchecked";
  operatingAvailability: "known_rules_checked" | "requires_confirmation" | "unchecked";
  reasonCodes: string[];
}
