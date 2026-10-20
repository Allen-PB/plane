import { describe, expect, it } from "vitest";
import { modularFloorLayout, fitModularCamera } from "./modular-layout";
import { bankSeats } from "./isometric-layout";
import { workstationMarkup } from "./modular-workstation";
import type { OfficeState } from "../../services/virtual-office.service";

function fixture(count: number): OfficeState {
  return {
    name: "PathBuilder",
    me: null,
    members: [],
    departments: Array.from({ length: 7 }, (_, order) => ({
      id: order + 1,
      order,
      name: `Team ${order}`,
      color: "#447755",
    })),
    desks: Array.from({ length: 7 }, (_, i) =>
      Array.from({ length: i === 0 ? count : 6 }, (_, j) => ({
        id: i * 1000 + j,
        department_id: i + 1,
        number: j + 1,
        member_id: null,
      }))
    ).flat(),
  } as unknown as OfficeState;
}

describe("modular office floor", () => {
  it("preserves existing floor banks and expands beyond them without overlapping seat hit areas", () => {
    for (const capacity of [12, 24, 60]) {
      const office = fixture(capacity),
        layout = modularFloorLayout(office);
      expect(layout.desks).toHaveLength(office.desks.length);
      for (const area of layout.areas) {
        const seats = layout.desks.filter((w) => w.department.id === area.department.id);
        for (const seat of seats) {
          expect(seat.x - 41).toBeGreaterThanOrEqual(area.x);
          expect(seat.x + 41).toBeLessThanOrEqual(area.x + area.width);
          expect(seat.y + 33).toBeLessThanOrEqual(area.y + area.height);
        }
      }
      for (const a of layout.desks)
        for (const b of layout.desks) {
          if (a.desk.id >= b.desk.id) continue;
          expect(Math.abs(a.x - b.x) >= 82 || Math.abs(a.y - b.y) >= 65).toBe(true);
        }
      for (const w of layout.desks) {
        const point = bankSeats[w.department.order]?.[w.desk.number - 1];
        if (point) {
          expect(w.x).toBe(point[0] * 1.5);
          expect(w.y).toBe(point[1] * 1.5);
        }
      }
      expect(layout.height).toBeGreaterThan(Math.max(...layout.desks.map((w) => w.y)));
    }
  });
  it("faces Leadership opposite while keeping desk and seated figure in one transform", () => {
    const layout = modularFloorLayout(fixture(12));
    expect(layout.desks.filter((w) => w.department.order === 6).every((w) => w.reverse)).toBe(true);
    expect(layout.desks.filter((w) => w.department.order !== 6).every((w) => !w.reverse)).toBe(true);
    const args = { occupied: true, female: false, reverse: false };
    const original = workstationMarkup(args);
    expect(workstationMarkup({ ...args, reverse: true })).not.toBe(original);
    expect(workstationMarkup({ ...args, female: true })).not.toBe(original);
    expect(workstationMarkup({ ...args, occupied: false })).not.toBe(original);
    expect(workstationMarkup(args)).toBe(original);
    expect(original).not.toContain("<image");
  });
  it("fits a growing floor within the viewport", () => {
    const layout = modularFloorLayout(fixture(60));
    const camera = fitModularCamera(900, 600, layout);
    expect(camera.x).toBeGreaterThanOrEqual(0);
    expect(camera.y).toBeGreaterThanOrEqual(0);
    expect(camera.x + layout.width * camera.scale).toBeLessThanOrEqual(900);
    expect(camera.y + layout.height * camera.scale).toBeLessThanOrEqual(600);
  });
});
