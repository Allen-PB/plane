import { chairAnchors } from "./avatar-anchors";
import type { AvatarAnchor } from "./avatar-anchors";
export const officeArtwork = { width: 1536, height: 1024 };
// Desk targets are calibrated to the keyboard areas in the architectural bank artwork.
// Development and Leadership targets also place the local avatar anchor on each chair cushion.
export const bankSeats: readonly (readonly [number, number])[][] = [
  [
    [401, 221],
    [462, 264],
    [530, 305],
    [326, 257],
    [392, 299],
    [458, 340],
    [240, 290],
    [306, 329],
    [371, 369],
    [144, 322],
    [194, 361],
    [248, 400],
  ],
  [
    [810, 350],
    [880, 320],
    [955, 290],
    [950, 390],
    [1030, 360],
  ],
  [
    [260, 600],
    [330, 570],
    [405, 540],
    [350, 675],
    [425, 645],
    [500, 615],
  ],
  [
    [541, 742],
    [612, 791],
    [684, 836],
  ],
  [
    [805, 630],
    [870, 600],
    [940, 570],
    [1005, 540],
    [910, 705],
    [975, 675],
    [1045, 645],
    [1110, 615],
  ],
  [
    [1155, 780],
    [1255, 735],
    [1345, 690],
    [1240, 860],
    [1340, 815],
    [1430, 770],
  ],
  [
    [654, 187],
    [749, 155],
    [728, 232],
    [825, 200],
  ],
];
type DepartmentArea = {
  code: string;
  count: number;
  cols: number;
  x: number;
  y: number;
  avatarAnchor?: AvatarAnchor;
  labelPosition?: { x: number; y: number };
  chairRows?: { first: number; stride: number; count: number; avatarAnchor: AvatarAnchor }[];
};
export const departmentAreas: DepartmentArea[] = [
  { code: "DEV", count: 12, cols: 4, x: 270, y: 290, avatarAnchor: chairAnchors.northEast },
  { code: "QA", count: 5, cols: 3, x: 905, y: 290, avatarAnchor: chairAnchors.northWest },
  { code: "PM", count: 6, cols: 3, x: 350, y: 535, avatarAnchor: chairAnchors.northWest },
  { code: "UIUX", count: 3, cols: 3, x: 585, y: 725, avatarAnchor: chairAnchors.northEast },
  { code: "BIZ", count: 8, cols: 4, x: 940, y: 575, avatarAnchor: chairAnchors.northWest },
  { code: "AM", count: 6, cols: 3, x: 1310, y: 705, avatarAnchor: chairAnchors.northWest },
  {
    code: "LEAD",
    labelPosition: { x: 850, y: 60 },
    count: 4,
    cols: 2,
    x: 720,
    y: 150,
    avatarAnchor: chairAnchors.northEast,
    chairRows: [{ first: 2, stride: 2, count: 2, avatarAnchor: chairAnchors.southWest }],
  },
];
export function workstationPlacement(order: number, number: number) {
  const position = deskLocation(order, number),
    area = departmentAreas[order];
  if (!position || !area) return null;
  const row = area.chairRows?.find(
    (r) => number >= r.first && (number - r.first) % r.stride === 0 && (number - r.first) / r.stride < r.count
  );
  return { position, avatarAnchor: row?.avatarAnchor ?? area.avatarAnchor ?? chairAnchors.northWest };
}
export type OfficeCamera = { scale: number; x: number; y: number };
export function deskLocation(order: number, number: number, _capacity?: number) {
  const area = departmentAreas[order];
  if (!area || number < 1 || !Number.isInteger(number)) return null;
  const mapped = bankSeats[order][number - 1];
  if (mapped) return { x: mapped[0], y: mapped[1] };
  // Newly configured desks remain selectable pending a larger artwork layout.
  const extra = number - area.count - 1;
  return { x: area.x + (extra % 3) * 70, y: area.y + 100 + Math.floor(extra / 3) * 60 };
}
export function fitOfficeCamera(width: number, height: number): OfficeCamera {
  const scale = Math.min(Math.max(width, 1) / officeArtwork.width, Math.max(height, 1) / officeArtwork.height) * 0.99;
  return { scale, x: (width - officeArtwork.width * scale) / 2, y: (height - officeArtwork.height * scale) / 2 };
}
export function zoomOfficeCamera(
  camera: OfficeCamera,
  factor: number,
  point: { x: number; y: number },
  fitScale: number
): OfficeCamera {
  const scale = Math.max(fitScale * 0.8, Math.min(fitScale * 3.5, camera.scale * factor));
  const ratio = scale / camera.scale;
  return { scale, x: point.x - (point.x - camera.x) * ratio, y: point.y - (point.y - camera.y) * ratio };
}
export function departmentRug(order: number) {
  const area = departmentAreas[order];
  if (!area) return "";
  const points = Array.from({ length: area.count }, (_, i) => deskLocation(order, i + 1)!);
  const minX = Math.min(...points.map((p) => p.x)) - 45,
    maxX = Math.max(...points.map((p) => p.x)) + 45;
  const minY = Math.min(...points.map((p) => p.y)) - 30,
    maxY = Math.max(...points.map((p) => p.y)) + 25;
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ]
    .map((p) => p.join(","))
    .join(" ");
}

export function departmentLabelLocation(order: number) {
  const area = departmentAreas[order];
  return area ? (area.labelPosition ?? { x: area.x + 25, y: area.y - 105 }) : null;
}
