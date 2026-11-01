import { expect, it } from "vitest";
import { officeDate, officeTime } from "./office-format";

it("uses Manila's calendar date across UTC midnight boundaries", () => {
  expect(officeDate("2026-11-02T23:30:00Z")).toBe("2026-11-03");
  expect(officeDate("2026-11-02T15:59:59Z")).toBe("2026-11-02");
});

it("renders missing timestamps explicitly", () => {
  expect(officeTime(null)).toBe("—");
});
