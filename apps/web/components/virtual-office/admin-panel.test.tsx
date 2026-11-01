import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { OfficeState, OfficeAdminState } from "../../services/virtual-office.service";
import { AdminPanel } from "./admin-panel";
import { virtualOfficeService as service } from "../../services/virtual-office.service";
const member = {
  id: "employee",
  user_id: "test-user",
  name: "Test DEV 01",
  role: "employee" as const,
  department_id: 1,
  position: "Engineer",
  job_role_id: 1,
  active: true,
  online: false,
  timed_in_at: null,
};
const office: OfficeState = {
  name: "Office",
  me: { ...member, id: "owner", user_id: "owner-user", role: "super_admin" },
  members: [member],
  desks: [],
  departments: [{ id: 1, name: "Development", order: 0, color: "#5e9fe5" }],
};
const admin: OfficeAdminState = {
  members: [member],
  users: [
    { id: "test-user", email: "vo-dev-01@example.invalid", display_name: "Test DEV 01" },
    { id: "new-user", email: "new@example.invalid", display_name: "New" },
  ],
  audit: [],
  job_roles: [{ id: 1, department_id: 1, name: "Engineer", archived: false }],
  work: {
    employee: {
      arrangement: "output_based",
      schedule: [],
      policy_id: 1,
      effective_from: null,
      timezone: "Asia/Manila",
      requests: [],
    },
  },
};
it("allows identity edits for an existing active employee whose arrangement is still unconfigured", async () => {
  const act = vi.fn();
  render(
    <AdminPanel office={office} admin={{ ...admin, work: {} }} query="" setQuery={vi.fn()} act={act} busy={false} />
  );
  await userEvent.selectOptions(screen.getByLabelText("Sync account"), "test-user");
  await userEvent.click(screen.getByRole("button", { name: "Save employee access" }));
  expect(act).toHaveBeenCalledWith(expect.objectContaining({ action: "member", user_id: "test-user" }));
  expect(act.mock.calls[0][0]).not.toHaveProperty("arrangement");
});
it("clears the old editor after a schedule decision so a later save cannot restore stale hours", async () => {
  const act = vi.fn();
  vi.spyOn(service, "decideSchedule").mockResolvedValue();
  const schedule = [{ day: 0, start: "09:00", end: "18:00", ends_next_day: false }];
  const pending: OfficeAdminState = {
    ...admin,
    work: {
      employee: {
        ...admin.work!.employee,
        arrangement: "scheduled",
        schedule,
        requests: [
          {
            id: 7,
            member_id: "employee",
            schedule: [{ ...schedule[0], end: "19:00" }],
            revision: 1,
            status: "pending",
            reason: "",
            created_at: "2026-11-02T00:00:00Z",
            decided_at: null,
            revisions: [],
          },
        ],
      },
    },
  };
  render(
    <AdminPanel
      office={office}
      admin={pending}
      query=""
      setQuery={vi.fn()}
      act={act}
      busy={false}
      refresh={vi.fn().mockResolvedValue(undefined)}
    />
  );
  await userEvent.selectOptions(screen.getByLabelText("Sync account"), "test-user");
  expect((screen.getByLabelText("Monday end time") as HTMLInputElement).value).toBe("18:00");
  await userEvent.click(screen.getByRole("button", { name: "Approve schedule" }));
  expect((screen.getByLabelText("Sync account") as HTMLSelectElement).value).toBe("");
  expect(screen.queryByLabelText("Monday end time")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("Schedule decision saved");
  await userEvent.click(screen.getByRole("button", { name: "Save employee access" }));
  expect(act).not.toHaveBeenCalled();
});
it("loads saved employee fields when selecting an account and resets them for a new account", async () => {
  const act = vi.fn();
  render(<AdminPanel office={office} admin={admin} query="" setQuery={vi.fn()} act={act} busy={false} />);
  expect(screen.getAllByText("vo-dev-01@example.invalid")).toHaveLength(2);
  await userEvent.selectOptions(screen.getByLabelText("Sync account"), "test-user");
  expect((screen.getByLabelText("Department") as HTMLSelectElement).value).toBe("1");
  expect((screen.getByLabelText("Job Role") as HTMLSelectElement).value).toBe("1");
  await userEvent.click(screen.getByRole("button", { name: "Save employee access" }));
  expect(act).toHaveBeenCalledWith({
    action: "member",
    user_id: "test-user",
    role: "employee",
    department_id: 1,
    job_role_id: 1,
    active: true,
    arrangement: "output_based",
    schedule: [],
    policy_id: 1,
  });
  await userEvent.selectOptions(screen.getByLabelText("Sync account"), "new-user");
  expect((screen.getByLabelText("Department") as HTMLSelectElement).value).toBe("");
  expect((screen.getByLabelText("Job Role") as HTMLSelectElement).value).toBe("");
});

it("submits the policy version actually loaded into the editor after a background refresh", async () => {
  const act = vi.fn();
  const schedule = [{ day: 0, start: "09:00", end: "18:00", ends_next_day: false }];
  const initial: OfficeAdminState = {
    ...admin,
    work: { employee: { ...admin.work!.employee, arrangement: "scheduled", schedule } },
  };
  const { rerender } = render(
    <AdminPanel office={office} admin={initial} query="" setQuery={vi.fn()} act={act} busy={false} />
  );
  await userEvent.selectOptions(screen.getByLabelText("Sync account"), "test-user");
  const refreshed: OfficeAdminState = {
    ...initial,
    work: { employee: { ...initial.work!.employee, policy_id: 2, schedule: [{ ...schedule[0], end: "19:00" }] } },
  };
  rerender(<AdminPanel office={office} admin={refreshed} query="" setQuery={vi.fn()} act={act} busy={false} />);
  await userEvent.click(screen.getByRole("button", { name: "Save employee access" }));
  expect(act).toHaveBeenCalledWith(expect.objectContaining({ policy_id: 1, schedule }));
});

it("loads a new account's saved Profile identity without granting a permission role", async () => {
  render(
    <AdminPanel
      office={office}
      admin={{
        ...admin,
        users: [
          {
            id: "new-user",
            email: "new@example.invalid",
            display_name: "New",
            identity: { department_id: 1, job_role_id: 1, job_role_name: "Engineer", locked: false, pending: false },
          },
        ],
      }}
      query=""
      setQuery={vi.fn()}
      act={vi.fn()}
      busy={false}
    />
  );
  await userEvent.selectOptions(screen.getByLabelText("Sync account"), "new-user");
  expect((screen.getByLabelText("Job Role") as HTMLSelectElement).value).toBe("1");
  expect((screen.getByLabelText("Virtual Office role") as HTMLSelectElement).value).toBe("employee");
});
