import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { OfficeState } from "../../services/virtual-office.service";
import { AttendanceControls } from "./attendance-controls";

const office: OfficeState = {
  name: "Office",
  server_time: "2026-11-02T10:00:00+08:00",
  me: {
    id: "employee",
    user_id: "user",
    name: "Employee",
    role: "employee",
    department_id: 1,
    position: "Engineer",
    job_role_id: 1,
    active: true,
    online: true,
    timed_in_at: "2026-11-02T09:00:00+08:00",
  },
  members: [],
  desks: [],
  departments: [],
  attendance: {
    choices: [],
    suggested_date: null,
    session: {
      id: 1,
      time_in: "2026-11-02T09:00:00+08:00",
      time_out: null,
      attendance_date: "2026-11-02",
      arrangement: "scheduled",
      expected_start: "2026-11-02T09:00:00+08:00",
      expected_end: "2026-11-02T18:00:00+08:00",
      arrival: "On Time",
      departure: "",
      needs_review: false,
      reason: "",
      employee_reason: "",
      legacy: false,
      duration_seconds: 3600,
      in_progress: true,
    },
  },
};

it("cancelling an early departure makes no attendance mutation", async () => {
  const act = vi.fn().mockResolvedValue(undefined);
  render(<AttendanceControls office={office} busy={false} act={act} />);
  await userEvent.click(screen.getByRole("button", { name: "Time Out" }));
  expect(screen.getByRole("dialog", { name: "Time out before your shift ends?" })).toBeTruthy();
  expect(act).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Stay timed in" }));
  expect(act).not.toHaveBeenCalled();
});

it("sends confirmation and optional reason only after explicit confirmation", async () => {
  const act = vi.fn().mockResolvedValue(undefined);
  render(<AttendanceControls office={office} busy={false} act={act} />);
  await userEvent.click(screen.getByRole("button", { name: "Time Out" }));
  await userEvent.type(screen.getByLabelText("Reason (optional)"), "Appointment");
  await userEvent.click(screen.getByRole("button", { name: "Confirm Time Out" }));
  expect(act).toHaveBeenCalledWith({ action: "time_out", confirmed: true, employee_reason: "Appointment" });
});

it("output-based Time Out does not show an early departure dialog", async () => {
  const act = vi.fn().mockResolvedValue(undefined);
  const session = office.attendance!.session!;
  render(
    <AttendanceControls
      office={{
        ...office,
        attendance: {
          choices: [],
          suggested_date: null,
          session: { ...session, arrangement: "output_based", expected_start: null, expected_end: null },
        },
      }}
      busy={false}
      act={act}
    />
  );
  await userEvent.click(screen.getByRole("button", { name: "Time Out" }));
  expect(act).toHaveBeenCalledWith({ action: "time_out" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("clears a previous shift selection when the arrangement stops using shifts", async () => {
  const act = vi.fn().mockResolvedValue(undefined);
  const timedOut = { ...office, me: { ...office.me, timed_in_at: null } };
  const { rerender } = render(
    <AttendanceControls
      office={{
        ...timedOut,
        attendance: {
          choices: [
            {
              date: "2026-11-03",
              expected_start: "2026-11-03T09:00:00+08:00",
              expected_end: "2026-11-03T18:00:00+08:00",
            },
          ],
          suggested_date: "2026-11-03",
          session: null,
        },
      }}
      busy={false}
      act={act}
    />
  );
  await userEvent.selectOptions(screen.getByLabelText("Shift · Asia/Manila"), "unscheduled");
  rerender(
    <AttendanceControls
      office={{ ...timedOut, attendance: { choices: [], suggested_date: null, session: null } }}
      busy={false}
      act={act}
    />
  );
  await userEvent.click(screen.getByRole("button", { name: "Time In" }));
  expect(act).toHaveBeenCalledWith({ action: "time_in" });
});

it("Escape dismisses the warning without timing the employee out", async () => {
  const act = vi.fn().mockResolvedValue(undefined);
  render(<AttendanceControls office={office} busy={false} act={act} />);
  await userEvent.click(screen.getByRole("button", { name: "Time Out" }));
  await userEvent.type(screen.getByLabelText("Reason (optional)"), "Still working");
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(act).not.toHaveBeenCalled();
});
