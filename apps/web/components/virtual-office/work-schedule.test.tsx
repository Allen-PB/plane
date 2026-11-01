import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { virtualOfficeService as service } from "../../services/virtual-office.service";
import type { OfficeWorkState, ScheduleRequest, WorkingDay } from "../../services/virtual-office.service";
import { ProfileWorkSchedule, ScheduleRequestReview, ScheduleFields } from "./work-schedule";

const schedule = [{ day: 0, start: "09:00", end: "18:00", ends_next_day: false }];
// jsdom lacks PointerEvent; Propel radios dispatch one for pointer activation.
beforeAll(() => vi.stubGlobal("PointerEvent", MouseEvent));
afterAll(() => vi.unstubAllGlobals());
const pending: ScheduleRequest = {
  id: 7,
  member_id: "employee",
  schedule,
  revision: 2,
  status: "pending",
  reason: "",
  created_at: "2026-11-02T00:00:00Z",
  decided_at: null,
  revisions: [{ revision: 2, schedule, created_at: "2026-11-02T00:00:00Z" }],
};
const work: OfficeWorkState = {
  arrangement: "scheduled",
  schedule,
  policy_id: 1,
  effective_from: "2026-11-02T00:00:00Z",
  timezone: "Asia/Manila",
  requests: [pending],
};

function ScheduleHarness({ initial = schedule, disabled = false }: { initial?: WorkingDay[]; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ScheduleFields prefix="test-hours" value={value} onChange={setValue} disabled={disabled} />
      <output aria-label="Schedule data">{JSON.stringify(value)}</output>
    </>
  );
}

it("applies shared hours and overnight settings to selected days and newly selected days", async () => {
  render(<ScheduleHarness />);
  await userEvent.click(screen.getByRole("checkbox", { name: "Tuesday" }));
  await userEvent.clear(screen.getByLabelText("Shared end time"));
  await userEvent.type(screen.getByLabelText("Shared end time"), "06:00");
  await userEvent.click(screen.getByLabelText("Shared ends next day"));
  await userEvent.click(screen.getByRole("checkbox", { name: "Friday" }));
  const data: WorkingDay[] = JSON.parse(screen.getByLabelText("Schedule data").textContent || "[]");
  expect(data.map((entry) => entry.day)).toEqual([0, 1, 4]);
  expect(data.every((entry) => entry.start === "09:00" && entry.end === "06:00" && entry.ends_next_day)).toBe(true);
});

it("preserves saved differing hours and edits a single day independently", async () => {
  const initial = [schedule[0], { ...schedule[0], day: 1, start: "10:00" }];
  render(<ScheduleHarness initial={initial} />);
  expect(
    (screen.getByRole("radio", { name: "Different hours each day" }) as HTMLInputElement).getAttribute("aria-checked")
  ).toBe("true");
  await userEvent.clear(screen.getByLabelText("Tuesday end time"));
  await userEvent.type(screen.getByLabelText("Tuesday end time"), "19:00");
  expect(JSON.parse(screen.getByLabelText("Schedule data").textContent || "[]")).toEqual([
    initial[0],
    { ...initial[1], end: "19:00" },
  ]);
});

it("only normalizes differing hours when shared mode is explicitly selected", async () => {
  render(<ScheduleHarness initial={[{ ...schedule[0], day: 1, start: "10:00" }, schedule[0]]} />);
  await userEvent.click(screen.getByRole("radio", { name: "Same hours across days" }));
  expect(JSON.parse(screen.getByLabelText("Schedule data").textContent || "[]")).toEqual([
    { ...schedule[0], day: 1 },
    schedule[0],
  ]);
});

it("removes deselected days and disables mode and time edits while saving", async () => {
  const { rerender } = render(<ScheduleHarness />);
  await userEvent.click(screen.getByRole("checkbox", { name: "Monday" }));
  expect(screen.queryByLabelText("Shared start time")).toBeNull();
  expect(screen.getByLabelText("Schedule data").textContent).toBe("[]");
  rerender(<ScheduleHarness key="disabled" disabled />);
  expect(screen.getByLabelText("Shared start time").matches(":disabled")).toBe(true);
  expect(screen.getByLabelText("Shared start time").closest("fieldset")?.disabled).toBe(true);
  await userEvent.click(screen.getByRole("radio", { name: "Different hours each day" }));
  expect(screen.queryByLabelText("Monday start time")).toBeNull();
});

it("submits a revised request with the version reviewed by the employee", async () => {
  const save = vi.spyOn(service, "requestSchedule").mockResolvedValue();
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(<ProfileWorkSchedule work={work} refresh={refresh} />);
  await userEvent.click(screen.getByRole("radio", { name: "Different hours each day" }));
  await userEvent.clear(screen.getByLabelText("Monday start time"));
  await userEvent.type(screen.getByLabelText("Monday start time"), "10:00");
  await userEvent.click(screen.getByRole("button", { name: "Update pending request" }));
  expect(save).toHaveBeenCalledWith([{ ...schedule[0], start: "10:00" }], 2);
  expect(refresh).toHaveBeenCalled();
});

it("requires a rejection reason and sends the reviewed revision", async () => {
  const decide = vi.spyOn(service, "decideSchedule").mockResolvedValue();
  render(<ScheduleRequestReview request={pending} refresh={vi.fn().mockResolvedValue(undefined)} />);
  await userEvent.click(screen.getByRole("button", { name: "Reject schedule" }));
  expect(screen.getByText("A rejection reason is required.")).toBeTruthy();
  expect(decide).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText("Rejection reason"), "Coverage needed");
  await userEvent.click(screen.getByRole("button", { name: "Reject schedule" }));
  expect(decide).toHaveBeenCalledWith(7, 2, "rejected", "Coverage needed");
});

it("does not offer schedule editing to output-based employees", () => {
  render(
    <ProfileWorkSchedule
      work={{ ...work, arrangement: "output_based", schedule: [], requests: [] }}
      refresh={vi.fn()}
    />
  );
  expect(screen.queryByRole("button", { name: "Submit schedule request" })).toBeNull();
  expect(screen.getByText("Output-based")).toBeTruthy();
});
