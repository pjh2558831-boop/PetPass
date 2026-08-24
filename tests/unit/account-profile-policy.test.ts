import { describe, expect, it } from "vitest";
import { getDisplayNameChangeAvailability } from "@/lib/auth/profile";

describe("community display-name change policy", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");

  it("allows the first account-page change", () => {
    expect(getDisplayNameChangeAvailability(null, now)).toEqual({ allowed: true, nextAvailableAt: null });
  });

  it("blocks changes until 30 full days have elapsed", () => {
    expect(getDisplayNameChangeAvailability("2026-08-01T12:00:00.000Z", now)).toEqual({
      allowed: false,
      nextAvailableAt: new Date("2026-08-31T12:00:00.000Z"),
    });
  });

  it("allows a new change at the exact 30-day boundary", () => {
    expect(getDisplayNameChangeAvailability("2026-07-25T12:00:00.000Z", now)).toEqual({
      allowed: true,
      nextAvailableAt: new Date("2026-08-24T12:00:00.000Z"),
    });
  });
});
