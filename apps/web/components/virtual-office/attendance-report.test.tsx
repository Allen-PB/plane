import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { AttendanceReport, OfficeState } from "../../services/virtual-office.service";
import { virtualOfficeService as service } from "../../services/virtual-office.service";
import { AttendanceReportPanel } from "./attendance-report";

const office: OfficeState = {
  name: "Office",
  server_time: "2026-11-02T10:00:00+08:00",
  me: {
    id: "admin",
    user_id: "user",
    name: "Admin",
    role: "admin",
    department_id: 1,
    position: "Manager",
    active: true,
    online: false,
    timed_in_at: null,
  },
  members: [],
  desks: [],
  departments: [],
};
const report: AttendanceReport = {
  id: "snapshot-1",
  filters: { start_date: "2026-11-01", end_date: "2026-11-02" },
  generated_at: "2026-11-02T10:00:00+08:00",
  expires_at: "2026-11-02T11:00:00+08:00",
  timezone: "Asia/Manila",
  columns: [["employee_name", "Employee"]],
  rows: Array.from({ length: 53 }, (_, index) => ({
    id: index,
    employee_name: `Employee ${index}`,
    email: "",
    department: "",
    position: "",
    desk: "",
    time_in: null,
    time_out: null,
    attendance_date: "2026-11-02",
    arrangement: "legacy",
    expected_start: null,
    expected_end: null,
    arrival: "",
    departure: "",
    needs_review: true,
    reason: "Legacy",
    employee_reason: "",
    legacy: true,
    duration_seconds: null,
    in_progress: false,
  })),
};

it("paginates only the display and keeps exports bound to all snapshot rows", async () => {
  vi.spyOn(service, "createAttendanceReport").mockResolvedValue(report);
  render(<AttendanceReportPanel office={office} />);
  await userEvent.click(screen.getByRole("button", { name: "Generate report" }));
  expect(await screen.findByText("Employee 0")).toBeTruthy();
  expect(screen.queryByText("Employee 52")).toBeNull();
  expect(screen.getByRole("link", { name: "Download CSV · all 53 sessions" }).getAttribute("href")).toContain(
    "snapshot-1/export.csv"
  );
  await userEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.getByText("Employee 52")).toBeTruthy();
  expect(screen.queryByText("Employee 0")).toBeNull();
  expect(screen.getByRole("button", { name: "Download PDF · all 53 sessions" })).toBeTruthy();
});
