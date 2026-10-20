import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { OfficeState, OfficeAdminState } from "../../services/virtual-office.service";
import { AdminPanel } from "./admin-panel";
const member = {
  id: "employee",
  user_id: "test-user",
  name: "Test DEV 01",
  role: "employee" as const,
  department_id: 1,
  position: "Engineer",
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
};
it("loads saved employee fields when selecting an account and resets them for a new account", async () => {
  const act = vi.fn();
  render(<AdminPanel office={office} admin={admin} query="" setQuery={vi.fn()} act={act} busy={false} />);
  expect(screen.getAllByText("vo-dev-01@example.invalid")).toHaveLength(2);
  await userEvent.selectOptions(screen.getByLabelText("Sync account"), "test-user");
  expect((screen.getByLabelText("Department") as HTMLSelectElement).value).toBe("1");
  expect((screen.getByLabelText("Job position") as HTMLInputElement).value).toBe("Engineer");
  await userEvent.click(screen.getByRole("button", { name: "Save employee access" }));
  expect(act).toHaveBeenCalledWith({
    action: "member",
    user_id: "test-user",
    role: "employee",
    department_id: 1,
    position: "Engineer",
    active: true,
  });
  await userEvent.selectOptions(screen.getByLabelText("Sync account"), "new-user");
  expect((screen.getByLabelText("Department") as HTMLSelectElement).value).toBe("");
  expect((screen.getByLabelText("Job position") as HTMLInputElement).value).toBe("");
});
