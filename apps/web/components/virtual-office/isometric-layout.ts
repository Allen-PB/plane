export const officeArtwork = { width: 1536, height: 1024 };
// Desk centers are mapped to the cohesive architectural bank artwork.
export const bankSeats: readonly (readonly [number, number])[][] = [
  [
    [100, 335],
    [220, 295],
    [295, 270],
    [375, 240],
    [170, 390],
    [270, 350],
    [360, 325],
    [440, 295],
    [240, 450],
    [340, 410],
    [420, 380],
    [510, 350],
  ],
  [
    [790, 335],
    [935, 275],
    [1025, 315],
    [935, 360],
    [865, 410],
  ],
  [
    [265, 560],
    [355, 520],
    [440, 585],
    [335, 630],
    [415, 690],
    [510, 640],
  ],
  [
    [525, 775],
    [605, 735],
    [675, 810],
  ],
  [
    [770, 650],
    [850, 610],
    [940, 560],
    [1030, 610],
    [860, 710],
    [950, 670],
    [1030, 730],
    [1120, 660],
  ],
  [
    [1180, 790],
    [1260, 740],
    [1350, 690],
    [1440, 745],
    [1350, 800],
    [1270, 850],
  ],
  [
    [610, 205],
    [750, 155],
    [840, 195],
    [700, 250],
  ],
];
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
