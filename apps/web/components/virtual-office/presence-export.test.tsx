import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PresenceExport, presenceDateRange } from "./presence-export";

vi.mock("../../services/virtual-office.service", () => ({
  virtualOfficeService: {
    presenceRecordsUrl: (range?: { start: string; end: string }) =>
      range ? `/records.csv?start_date=${range.start}&end_date=${range.end}` : "/records.csv?all_time=true",
  },
}));

describe("attendance export", () => {
  it("calculates presets in Manila across month and year boundaries", () => {
    const now = new Date("2025-12-31T17:00:00Z");
    expect(presenceDateRange("today", now)).toEqual({ start: "2026-01-01", end: "2026-01-01" });
    expect(presenceDateRange("week", now)).toEqual({ start: "2025-12-29", end: "2026-01-01" });
    expect(presenceDateRange("last-month", now)).toEqual({ start: "2025-12-01", end: "2025-12-31" });
    expect(presenceDateRange("last-month", new Date("2024-03-10T00:00:00Z"))).toEqual({
      start: "2024-02-01",
      end: "2024-02-29",
    });
  });
  it("defaults to this month and validates custom dates before download", () => {
    const close = vi.fn();
    render(<PresenceExport onClose={close} />);
    expect((screen.getByLabelText("Date range") as HTMLSelectElement).value).toBe("month");
    expect(screen.getByRole("link", { name: "Download CSV" }).getAttribute("href")).toContain("start_date=");
    fireEvent.change(screen.getByLabelText("Date range"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-02-10" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-02-01" } });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Download CSV" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Date range"), { target: { value: "all" } });
    expect(screen.getByRole("link", { name: "Download CSV" }).getAttribute("href")).toBe("/records.csv?all_time=true");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledOnce();
  });
});
