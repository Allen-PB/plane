import type { OfficeState } from "../../services/virtual-office.service";
import { bankSeats, departmentAreas } from "./isometric-layout";
export const departmentCodes = ["DEV", "QA", "PM", "UIUX", "BIZ", "AM", "LEAD"];
export const floorScale = 1.5;
/** Retain the approved floor's department banks. Growth adds aligned banks beyond the existing floor. */
export function modularFloorLayout(office: Pick<OfficeState, "departments" | "desks">) {
  // oxlint-disable-next-line unicorn/no-array-sort -- Sort a local copy for the ES2022 browser target.
  const departments = [...office.departments].sort((a, b) => a.order - b.order);
  let extensionY = 1060;
  const desks = departments.flatMap((department) => {
    // oxlint-disable-next-line unicorn/no-array-sort -- Filter creates a local copy.
    const list = office.desks.filter((d) => d.department_id === department.id).sort((a, b) => a.number - b.number);
    const base = bankSeats[department.order] ?? [];
    const extraCount = list.filter((d) => !base[d.number - 1]).length;
    const startY = extensionY;
    if (extraCount) extensionY += Math.ceil(extraCount / 6) * 105 + 90;
    let extra = 0;
    return list.map((desk) => {
      const mapped = base[desk.number - 1];
      const point = mapped ?? [180 + (extra % 6) * 170, startY + Math.floor(extra++ / 6) * 105];
      return { desk, department, reverse: department.order === 6, x: point[0] * floorScale, y: point[1] * floorScale };
    });
  });
  const areas = departments.map((department) => {
    const seats = desks.filter((w) => w.department.id === department.id);
    const a = departmentAreas[department.order];
    const labelX = (a ? a.x + 25 : 200) * floorScale,
      labelY = (a ? a.y - 105 : 100) * floorScale;
    const x = Math.min(labelX - 100, ...seats.map((w) => w.x - 70)),
      y = Math.min(labelY - 35, ...seats.map((w) => w.y - 115));
    return {
      department,
      desks: seats.map((w) => w.desk),
      x: Number.isFinite(x) ? x : 100,
      y: Number.isFinite(y) ? y : 100,
      width: Math.max(180, ...seats.map((w) => w.x - x + 70)),
      height: Math.max(200, ...seats.map((w) => w.y - y + 65)),
      labelX,
      labelY,
    };
  });
  return {
    areas,
    desks,
    width: 1536 * floorScale,
    height: Math.max(1024, extensionY > 1060 ? extensionY : 1024) * floorScale,
  };
}
export function fitModularCamera(width: number, height: number, bounds: { width: number; height: number }) {
  const scale = Math.min(Math.max(width, 1) / bounds.width, Math.max(height, 1) / bounds.height) * 0.96;
  return { scale, x: (width - bounds.width * scale) / 2, y: (height - bounds.height * scale) / 2 };
}
