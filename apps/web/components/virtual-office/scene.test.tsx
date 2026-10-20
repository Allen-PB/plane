import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OfficeState } from "../../services/virtual-office.service";
import { OfficeScene } from "./scene";

const me = {
  id: "member",
  user_id: "user",
  name: "Alex",
  role: "employee" as const,
  department_id: 1,
  position: "Engineer",
  active: true,
  online: true,
  timed_in_at: "2026-10-20T00:00:00Z",
};
const office: OfficeState = {
  name: "PathBuilder",
  me,
  members: [me],
  departments: [{ id: 1, name: "Development", color: "#4775e7", order: 0 }],
  desks: [
    { id: 1, department_id: 1, number: 1, member_id: me.id },
    { id: 2, department_id: 1, number: 2, member_id: null },
  ],
};

describe("office scene", () => {
  it("lets keyboard and pointer users select desks with reservation details", async () => {
    const onSelect = vi.fn();
    render(<OfficeScene office={office} selectedId={null} onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: "Development desk 1, Alex, online" })).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Development desk 2, available" }));
    expect(onSelect).toHaveBeenCalledWith(office.desks[1]);
  });
  it("removes the avatar after time-out while keeping the reservation visible", () => {
    const { container, rerender } = render(<OfficeScene office={office} selectedId={1} onSelect={vi.fn()} />);
    expect(container.querySelector(".vo-avatar")).not.toBeNull();
    rerender(
      <OfficeScene office={{ ...office, members: [{ ...me, online: false }] }} selectedId={1} onSelect={vi.fn()} />
    );
    expect(container.querySelector(".vo-avatar")).toBeNull();
    expect(screen.getByRole("button", { name: "Development desk 1, Alex" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("You")).toBeDefined();
  });
});
