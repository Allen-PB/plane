import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { departmentAreas, deskLocation, fitOfficeCamera, zoomOfficeCamera } from "./isometric-layout";
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
  it("places all 39 desks uniquely on a shared isometric grid", () => {
    const points = departmentAreas.flatMap((a, i) =>
      Array.from({ length: a.count }, (_, j) => deskLocation(i, j + 1)!)
    );
    expect(points).toHaveLength(39);
    expect(new Set(points.map((p) => `${p.x},${p.y}`)).size).toBe(39);
    for (let i = 0; i < 7; i++) {
      const a = deskLocation(i, 1)!,
        b = deskLocation(i, 2)!;
      expect([b.x - a.x, b.y - a.y]).toEqual([70, -28]);
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
    expect(container.querySelectorAll(".vo-art-seat")).toHaveLength(39);
    const desk = screen.getByRole("button", { name: "DEV-01, reserved by Test Developer, online" });
    expect(desk.querySelector("img")?.getAttribute("src")).toContain("workstation-occupied");
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
    ).toBe("/virtual-office/art-v1/workstation.png");
    expect(container.querySelector(".vo-art-avatar")).toBeNull();
    expect(container.querySelector(".vo-art-world")?.getAttribute("style")).toBe(transform);
  });
});
