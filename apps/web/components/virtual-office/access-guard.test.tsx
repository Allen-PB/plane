import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import type { OfficeState } from "../../services/virtual-office.service";
import VirtualOfficeRoot from "./root";

const environment = vi.hoisted(() => ({ allowed: true, role: "employee" as "employee" | "admin" | "super_admin" }));
vi.mock("@/lib/wrappers/authentication-wrapper", () => ({
  AuthenticationWrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("./isometric-scene", () => ({ IsometricOfficeScene: () => null }));
vi.mock("swr", () => ({
  default: (key: unknown) => {
    const office: OfficeState = {
      name: "Office",
      server_time: "2026-11-02T10:00:00+08:00",
      departments: [],
      desks: [],
      members: [],
      me: {
        id: "member",
        user_id: "user",
        name: "Person",
        role: environment.role,
        department_id: 1,
        job_role_id: 1,
        position: "Engineer",
        active: environment.allowed,
        online: false,
        timed_in_at: null,
      },
    };
    let data: unknown;
    if (key === "virtual-office-status")
      data = { allowed: environment.allowed, member: environment.allowed ? office.me : null };
    if (key === "virtual-office") data = office;
    if (Array.isArray(key) && key[0] === "virtual-office-admin") data = { members: [], users: [], audit: [] };
    return { data, error: undefined, mutate: vi.fn().mockResolvedValue(undefined) };
  },
}));

function openAttendance() {
  render(
    <MemoryRouter initialEntries={["/virtual-office/directory/attendance/"]}>
      <VirtualOfficeRoot />
    </MemoryRouter>
  );
}

it("denies an office employee who directly opens the Attendance URL", () => {
  environment.allowed = true;
  environment.role = "employee";
  openAttendance();
  expect(screen.getByText("Office administrator access required.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Generate report" })).toBeNull();
});

it("denies a revoked office account on the direct Attendance URL", () => {
  environment.allowed = false;
  environment.role = "admin";
  openAttendance();
  expect(screen.getByRole("heading", { name: "Welcome to Virtual Office" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Generate report" })).toBeNull();
});

it.each(["admin", "super_admin"] as const)("allows an active office %s to view Attendance", (role) => {
  environment.allowed = true;
  environment.role = role;
  openAttendance();
  expect(screen.getByRole("heading", { name: "Attendance" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Generate report" })).toBeTruthy();
});
