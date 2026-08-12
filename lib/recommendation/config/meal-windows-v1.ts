import "server-only";

export const MEAL_WINDOWS_V1_CONFIG = {
  version: "meal-windows-v1",
  windows: [
    { id: "lunch", startMinutes: 11 * 60 + 30, endMinutes: 14 * 60 },
    { id: "dinner", startMinutes: 17 * 60 + 30, endMinutes: 20 * 60 },
  ],
} as const;

