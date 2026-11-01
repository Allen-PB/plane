// @vitest-environment node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { expect, it, vi } from "vitest";
import type { AttendanceReport } from "../../services/virtual-office.service";
import { AttendancePDF } from "./attendance-pdf";

const fonts = vi.hoisted(() => ({
  regular: `${process.cwd()}/app/assets/fonts/inter/regular.ttf`,
  bold: `${process.cwd()}/app/assets/fonts/inter/bold.ttf`,
}));
vi.mock("@/app/assets/fonts/inter/regular.ttf?url", () => ({ default: fonts.regular }));
vi.mock("@/app/assets/fonts/inter/bold.ttf?url", () => ({ default: fonts.bold }));

it("renders a multipage PDF from every snapshot row, with Unicode and long reasons", async () => {
  const report: AttendanceReport = {
    id: "pdf-qa-synthetic",
    filters: { start_date: "2026-11-01", end_date: "2026-11-02" },
    generated_at: "2026-11-02T10:00:00+08:00",
    expires_at: "2026-11-02T11:00:00+08:00",
    timezone: "Asia/Manila",
    columns: [
      ["attendance_date", "Attendance date"],
      ["employee_name", "Employee"],
      ["email", "Email"],
      ["department", "Department"],
      ["position", "Job role"],
      ["desk", "Workstation"],
      ["arrangement", "Arrangement"],
      ["expected_start", "Scheduled start (Asia/Manila)"],
      ["expected_end", "Scheduled end (Asia/Manila)"],
      ["time_in", "Time In (Asia/Manila)"],
      ["time_out", "Time Out (Asia/Manila)"],
      ["duration_seconds", "Duration (seconds)"],
      ["arrival", "Arrival"],
      ["departure", "Departure"],
      ["needs_review", "Needs review"],
      ["reason", "Review / closure reason"],
      ["employee_reason", "Employee departure reason"],
      ["legacy", "Legacy"],
      ["in_progress", "In progress"],
    ],
    rows: Array.from({ length: 53 }, (_, index) => ({
      id: index,
      employee_name: `José Niño ${index + 1}`,
      position: "Senior Engineer ".repeat(18),
      email: "",
      department: "Development",
      desk: "DEV-01",
      time_in: "2026-11-02T09:00:00+08:00",
      time_out: "2026-11-02T17:00:00+08:00",
      attendance_date: "2026-11-02",
      arrangement: "scheduled",
      expected_start: "2026-11-02T09:00:00+08:00",
      expected_end: "2026-11-02T18:00:00+08:00",
      arrival: "On Time",
      departure: "Undertime",
      employee_reason: `Record ${index + 1}: ${"Reason with punctuation, and a second line.\n".repeat(11)}`,
      needs_review: false,
      reason: "",
      legacy: false,
      duration_seconds: 28800,
      in_progress: false,
    })),
  };
  const buffer = await renderToBuffer(<AttendancePDF report={report} />);
  expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  expect(buffer.length).toBeGreaterThan(10000);
  if (process.env.PBS9_PDF_OUTPUT) {
    const target = resolve(process.env.PBS9_PDF_OUTPUT);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, buffer);
  }
}, 60000);
