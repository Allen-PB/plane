import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { OfficeState } from "../../services/virtual-office.service";
import { OfficeFloor } from "./floor";

const me = {
  id: "me",
  user_id: "user",
  name: "Alex",
  role: "employee" as const,
  department_id: 1,
  position: "Engineer",
  active: true,
  online: false,
  timed_in_at: null,
};
const office: OfficeState = {
  name: "PathBuilder",
  me,
  members: [me],
  departments: [
    { id: 1, order: 0, color: "#5e9fe5", name: "Development" },
    { id: 2, order: 1, color: "#43bca7", name: "QA" },
  ],
  desks: [
    { id: 1, department_id: 1, number: 1, member_id: null },
    { id: 2, department_id: 2, number: 1, member_id: null },
  ],
};
function floor(state: OfficeState, act = vi.fn()) {
  return (
    <MemoryRouter>
      <OfficeFloor office={state} busy={false} act={act} />
    </MemoryRouter>
  );
}

describe("original office layout and presence controls", () => {
  it("lets a member change their own avatar appearance", async () => {
    const act = vi.fn();
    render(floor(office, act));
    await userEvent.selectOptions(screen.getByLabelText("Your avatar"), "female");
    expect(act).toHaveBeenCalledWith({ action: "avatar", avatar_style: "female" });
  });
  it("exposes keyboard-scrollable directory and list regions", async () => {
    render(floor(office));
    expect(screen.getByRole("complementary", { name: "Office directory" }).tabIndex).toBe(0);
    expect(screen.getByRole("region", { name: "Workstation directory" }).tabIndex).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("region", { name: "Workstation list" }).tabIndex).toBe(0);
    expect(within(screen.getByRole("region", { name: "Workstation list" })).getAllByRole("row")).toHaveLength(3);
  });
  it("starts with an available workstation in the signed-in employee's department", async () => {
    const act = vi.fn();
    render(floor({ ...office, me: { ...me, department_id: 2 } }, act));
    expect(within(screen.getByLabelText("Selected workstation")).getByText("QA-01")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Choose this desk" }));
    expect(act).toHaveBeenCalledWith({ action: "reserve", desk_id: 2 });
  });
  it("explains why Time In is disabled for an unassigned administrator", () => {
    render(floor({ ...office, me: { ...me, role: "super_admin", department_id: null } }));
    expect(screen.getByText(/Your department and job position must be assigned/)).toBeDefined();
    expect(screen.getByRole("link", { name: /Set your department and position/ })).toBeDefined();
    expect((screen.getByRole("button", { name: "Time In" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("filters the directory and permits a reservation only in the assigned department", async () => {
    const act = vi.fn();
    render(floor(office, act));
    await userEvent.click(screen.getByRole("button", { name: "Choose this desk" }));
    expect(act).toHaveBeenCalledWith({ action: "reserve", desk_id: 1 });
    await userEvent.selectOptions(screen.getByLabelText("Department", { exact: true }), "2");
    const directory = within(screen.getByLabelText("Workstation directory"));
    expect(directory.queryByRole("button", { name: /DEV-01/ })).toBeNull();
    await userEvent.click(directory.getByRole("button", { name: /QA-01/ }));
    expect(screen.queryByRole("button", { name: "Choose this desk" })).toBeNull();
    expect(screen.getByText("Choose an available desk in your assigned department.")).toBeDefined();
  });
  it("retains original Time In and Time Out labels and always changes the signed-in user's presence", async () => {
    const act = vi.fn();
    const assigned = { ...office, desks: [{ ...office.desks[0], member_id: me.id }, office.desks[1]] };
    const { rerender } = render(floor(assigned, act));
    await userEvent.click(
      within(screen.getByLabelText("Workstation directory")).getByRole("button", { name: /QA-01/ })
    );
    await userEvent.click(screen.getByRole("button", { name: "Time In" }));
    expect(act).toHaveBeenLastCalledWith({ action: "time_in" });
    rerender(floor({ ...assigned, me: { ...me, online: true } }, act));
    await userEvent.click(screen.getByRole("button", { name: "Time Out" }));
    expect(act).toHaveBeenLastCalledWith({ action: "time_out" });
    expect(assigned.desks[0].member_id).toBe(me.id);
  });
});
