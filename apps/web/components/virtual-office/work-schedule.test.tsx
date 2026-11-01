import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { virtualOfficeService as service } from "../../services/virtual-office.service";
import type { OfficeWorkState, ScheduleRequest } from "../../services/virtual-office.service";
import { ProfileWorkSchedule, ScheduleRequestReview } from "./work-schedule";

const schedule = [{ day: 0, start: "09:00", end: "18:00", ends_next_day: false }];
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

it("submits a revised request with the version reviewed by the employee", async () => {
  const save = vi.spyOn(service, "requestSchedule").mockResolvedValue();
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(<ProfileWorkSchedule work={work} refresh={refresh} />);
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
