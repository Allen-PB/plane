import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { chairAnchors, seatedAvatarModel, arrangeNameplates } from "./avatar-anchors";
import { bankSeats, workstationPlacement } from "./isometric-layout";
import { IsometricOfficeScene } from "./isometric-scene";
import type { OfficeState } from "../../services/virtual-office.service";

const member = {
  id: "person",
  user_id: "user",
  name: "Alex Office",
  role: "employee" as const,
  department_id: 7,
  position: "Leadership",
  active: true,
  online: true,
  timed_in_at: null,
};
const desks = [
  { id: 1, department_id: 1, number: 1, member_id: null },
  { id: 2, department_id: 2, number: 1, member_id: null },
  { id: 3, department_id: 7, number: 1, member_id: null },
  { id: 4, department_id: 7, number: 2, member_id: null },
];
const state: OfficeState = {
  name: "PathBuilder",
  me: member,
  members: [member],
  desks,
  departments: [
    { id: 1, order: 0, name: "Development", color: "#287bea" },
    { id: 2, order: 1, name: "QA", color: "#129e8a" },
    { id: 7, order: 6, name: "Leadership", color: "#455a8b" },
  ],
};
function scene(deskId: number, online = true, selectedId: number | null = null, female = false) {
  const person = { ...member, online, avatar_style: female ? ("female" as const) : ("male" as const) };
  return (
    <IsometricOfficeScene
      office={{
        ...state,
        me: person,
        members: [person],
        desks: desks.map((d) => ({
          id: d.id,
          department_id: d.department_id,
          number: d.number,
          member_id: d.id === deskId ? person.id : null,
        })),
      }}
      selectedId={selectedId}
      departmentId={null}
      onSelect={vi.fn()}
      onDepartment={vi.fn()}
    />
  );
}

describe("workstation-owned seated avatars", () => {
  it("has a local cushion anchor for every visible chair, with opposing Leadership rows", () => {
    for (let order = 0; order < bankSeats.length; order++)
      for (let number = 1; number <= bankSeats[order].length; number++) {
        const workstation = workstationPlacement(order, number)!;
        expect(workstation.avatarAnchor.bodyHeight).toBeGreaterThan(0);
        expect(Math.hypot(workstation.avatarAnchor.x, workstation.avatarAnchor.y)).toBeLessThan(60);
      }
    expect(workstationPlacement(6, 1)?.avatarAnchor.direction).toBe("north-east");
    expect(workstationPlacement(6, 2)?.avatarAnchor.direction).toBe("south-west");
    expect(workstationPlacement(6, 3)?.avatarAnchor).toEqual(workstationPlacement(6, 1)?.avatarAnchor);
    expect(workstationPlacement(6, 4)?.avatarAnchor).toEqual(workstationPlacement(6, 2)?.avatarAnchor);
    expect(workstationPlacement(1, 99)?.avatarAnchor).toEqual(chairAnchors.northWest);
  });
  it("normalizes transparent padding so the actual hip pivot stays at the cushion", () => {
    for (const style of ["male", "female"] as const) {
      for (const anchor of [chairAnchors.northWest, chairAnchors.northEast]) {
        const model = seatedAvatarModel(anchor, style),
          scale = model.width / 1297;
        expect(model.left + 820 * scale).toBeCloseTo(0);
        expect(model.top + 800 * scale).toBeCloseTo(0);
        expect(model.nameplateY).toBeLessThan(0);
      }
    }
    const front = seatedAvatarModel(chairAnchors.southWest);
    expect(front.left + 600 * (front.width / 1024)).toBeCloseTo(0);
    expect(front.top + 850 * (front.height / 1536)).toBeCloseTo(0);
  });
  it("updates position and direction together on repeated reservation switches", () => {
    const { container, rerender } = render(scene(3));
    for (const [id, direction, rotation] of [
      [4, "south-west", "270"],
      [1, "north-east", "90"],
      [2, "north-west", "0"],
      [3, "north-east", "90"],
      [4, "south-west", "270"],
    ] as const) {
      rerender(scene(id));
      const anchor = container.querySelector(".vo-chair-anchor")!;
      expect(anchor.getAttribute("data-facing")).toBe(direction);
      expect(anchor.getAttribute("data-rotation")).toBe(rotation);
      expect(container.querySelectorAll(".vo-seated-sprite")).toHaveLength(1);
      expect(anchor.closest("button")?.getAttribute("aria-label")).toContain("reserved by Alex Office");
      expect(container.querySelectorAll(".vo-seated-nameplate")).toHaveLength(1);
      expect(
        container
          .querySelector(".vo-seated-model-correction")
          ?.contains(container.querySelector(".vo-seated-nameplate"))
      ).toBe(false);
    }
  });
  it("does not move the live avatar when inspecting a different desk, panning, or zooming", () => {
    const { container, rerender } = render(scene(3));
    const anchor = container.querySelector(".vo-chair-anchor")!.getAttribute("style");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.keyDown(screen.getByRole("region", { name: /Drag to move/ }), { key: "ArrowRight" });
    const camera = container.querySelector(".vo-art-world")!.getAttribute("style");
    rerender(scene(3, true, 4));
    expect(container.querySelector(".vo-chair-anchor")!.getAttribute("style")).toBe(anchor);
    expect(container.querySelector(".vo-art-world")!.getAttribute("style")).toBe(camera);
    expect(container.querySelector(".vo-chair-anchor")?.closest("button")?.getAttribute("aria-label")).toContain(
      "LEAD-01"
    );
  });
  it("uses the female seated view at the same chair and removes only presence on time out", () => {
    const { container, rerender } = render(scene(4, true, null, true));
    expect(container.querySelector(".vo-seated-sprite")?.getAttribute("src")).toContain(
      "seated-avatar-female-front.png"
    );
    expect(container.querySelector(".vo-chair-foreground")).not.toBeNull();
    rerender(scene(4, false, null, true));
    expect(container.querySelector(".vo-seated-sprite")).toBeNull();
    expect(container.querySelector(".vo-seated-nameplate")).toBeNull();
    expect(screen.getByRole("button", { name: "LEAD-02, reserved by Alex Office, offline" })).toBeDefined();
  });
  it("keeps adjacent names readable above their own avatars and out of department badges", () => {
    const labels = arrangeNameplates(
      [
        { id: "a", x: 200, y: 200, width: 150 },
        { id: "b", x: 250, y: 205, width: 150 },
        { id: "c", x: 210, y: 201, width: 150 },
      ],
      [{ left: 150, right: 300, top: 140, bottom: 210 }]
    );
    for (const label of labels) {
      expect(label.y).toBeLessThanOrEqual(label.naturalY);
      expect(label.y).toBeLessThan(140);
    }
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++)
        expect(Math.abs(labels[i].y - labels[j].y)).toBeGreaterThanOrEqual(27);
  });
});
