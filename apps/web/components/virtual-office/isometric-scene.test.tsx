import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  departmentAreas,
  departmentLabelLocation,
  deskLocation,
  fitOfficeCamera,
  zoomOfficeCamera,
} from "./isometric-layout";
import { IsometricOfficeScene } from "./isometric-scene";
import type { OfficeState } from "../../services/virtual-office.service";
const member = {
  id: "member",
  user_id: "user",
  name: "Test Developer",
  role: "employee" as const,
  department_id: 1,
  position: "Developer",
  active: true,
  online: true,
  timed_in_at: null,
};
const office: OfficeState = {
  name: "PathBuilder",
  me: member,
  members: [member],
  departments: departmentAreas.map((d, i) => ({ id: i + 1, name: d.code, color: "#287bea", order: i })),
  desks: departmentAreas.flatMap((d, i) =>
    Array.from({ length: d.count }, (_, j) => ({
      id: i * 100 + j + 1,
      department_id: i + 1,
      number: j + 1,
      member_id: i === 0 && j === 0 ? member.id : null,
    }))
  ),
};
describe("aligned office artwork", () => {
  it("renders and inspects all 44 occupied desks without moving their reservations", () => {
    const people = office.desks.map((desk, index) => ({
      ...member,
      id: `member-${desk.id}`,
      user_id: `user-${desk.id}`,
      name: `Occupant ${desk.id}`,
      department_id: desk.department_id,
      avatar_style: index % 2 ? ("female" as const) : ("male" as const),
    }));
    const busy: OfficeState = {
      ...office,
      me: people[0],
      members: people,
      desks: office.desks.map((desk, index) => ({ ...desk, member_id: people[index].id })),
    };
    const onSelect = vi.fn();
    const { container } = render(
      <IsometricOfficeScene
        office={busy}
        selectedId={null}
        departmentId={null}
        onSelect={onSelect}
        onDepartment={vi.fn()}
      />
    );
    expect(container.querySelectorAll(".vo-seated-sprite")).toHaveLength(44);
    expect(container.querySelectorAll(".vo-seated-nameplate")).toHaveLength(44);
    const seats = container.querySelectorAll(".vo-art-seat");
    seats.forEach((seat) => fireEvent.click(seat));
    expect(onSelect.mock.calls.map(([desk]) => desk.id)).toEqual(busy.desks.map((desk) => desk.id));
    expect(container.querySelectorAll(".vo-seated-sprite")).toHaveLength(44);
    for (const model of container.querySelectorAll(".vo-seated-sprite"))
      expect(model.closest("button")?.getAttribute("aria-label")).toContain("reserved by Occupant");
  });
  it("keeps the Leadership badge clear of the Makarius wall emblem", () => {
    const point = departmentLabelLocation(6)!;
    expect(point.x - 80).toBeGreaterThan(730);
  });
  it("maps all expanded desks to distinct visible workstations", () => {
    const points = departmentAreas.flatMap((a, i) =>
      Array.from({ length: a.count }, (_, j) => deskLocation(i, j + 1)!)
    );
    expect(points).toHaveLength(44);
    expect(new Set(points.map((p) => `${p.x},${p.y}`)).size).toBe(44);
    for (const p of points) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(1536);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(1024);
    }
    expect(deskLocation(0, 11, 20)).not.toBeNull();
    expect(deskLocation(0, 0)).toBeNull();
  });
  it("anchors zoom at the pointer and limits magnification", () => {
    const camera = fitOfficeCamera(1000, 700),
      p = { x: 250, y: 300 };
    const next = zoomOfficeCamera(camera, 2, p, camera.scale);
    expect((p.x - next.x) / next.scale).toBeCloseTo((p.x - camera.x) / camera.scale);
    expect(zoomOfficeCamera(camera, 100, p, camera.scale).scale).toBeCloseTo(camera.scale * 3.5);
  });
  it("uses server reservations and displays seated avatars only while online", () => {
    const select = vi.fn();
    const { container, rerender } = render(
      <IsometricOfficeScene
        office={office}
        selectedId={null}
        departmentId={null}
        onSelect={select}
        onDepartment={vi.fn()}
      />
    );
    expect(container.querySelectorAll(".vo-art-seat")).toHaveLength(44);
    const desk = screen.getByRole("button", { name: "DEV-01, reserved by Test Developer, online" });
    expect(desk.querySelector("img")?.getAttribute("src")).toContain("seated-avatar");
    fireEvent.click(desk);
    expect(select).toHaveBeenCalledWith(office.desks[0]);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const transform = container.querySelector(".vo-art-world")?.getAttribute("style");
    rerender(
      <IsometricOfficeScene
        office={{ ...office, members: [{ ...member, online: false }] }}
        selectedId={1}
        departmentId={null}
        onSelect={select}
        onDepartment={vi.fn()}
      />
    );
    expect(
      screen
        .getByRole("button", { name: "DEV-01, reserved by Test Developer, offline" })
        .querySelector("img")
        ?.getAttribute("src")
    ).toBeUndefined();
    expect(container.querySelector(".vo-art-avatar")).toBeNull();
    expect(container.querySelector(".vo-art-world")?.getAttribute("style")).toBe(transform);
  });
});
