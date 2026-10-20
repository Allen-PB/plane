export const officeArtwork = { width: 1536, height: 1024 };
// Desk centers are mapped to the cohesive architectural bank artwork.
export const bankSeats: readonly (readonly [number, number])[][] = [
  [
    [390, 230],
    [455, 275],
    [520, 320],
    [320, 270],
    [385, 315],
    [450, 360],
    [240, 310],
    [305, 355],
    [370, 400],
    [150, 350],
    [215, 395],
    [280, 440],
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
    [535, 760],
    [615, 805],
    [695, 850],
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
    [640, 200],
    [720, 155],
    [710, 245],
    [790, 200],
  ],
];
export function avatarFacing(order: number) {
  return order === 6 ? "front" : order === 0 || order === 3 ? "right" : "back";
}
export const departmentAreas = [
  { code: "DEV", count: 12, cols: 4, x: 270, y: 290 },
  { code: "QA", count: 5, cols: 3, x: 905, y: 290 },
  { code: "PM", count: 6, cols: 3, x: 350, y: 535 },
  { code: "UIUX", count: 3, cols: 3, x: 585, y: 725 },
  { code: "BIZ", count: 8, cols: 4, x: 940, y: 575 },
  { code: "AM", count: 6, cols: 3, x: 1310, y: 705 },
  { code: "LEAD", count: 4, cols: 2, x: 720, y: 150 },
];
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
