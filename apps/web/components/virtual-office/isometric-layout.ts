export const officeArtwork = { width: 1536, height: 1024 };
export const departmentAreas = [
  { code: "DEV", count: 10, cols: 5, x: 110, y: 355 },
  { code: "QA", count: 5, cols: 3, x: 800, y: 350 },
  { code: "PM", count: 5, cols: 3, x: 260, y: 585 },
  { code: "UIUX", count: 3, cols: 3, x: 510, y: 790 },
  { code: "BIZ", count: 7, cols: 4, x: 790, y: 680 },
  { code: "AM", count: 5, cols: 3, x: 1150, y: 800 },
  { code: "LEAD", count: 4, cols: 2, x: 620, y: 205 },
];
export type OfficeCamera = { scale: number; x: number; y: number };
export function deskLocation(order: number, number: number, capacity?: number) {
  const area = departmentAreas[order];
  if (!area || number < 1 || !Number.isInteger(number)) return null;
  const i = number - 1;
  const count = Math.max(area.count, capacity ?? number);
  const cols =
    count > area.count ? Math.ceil(Math.sqrt((count * area.cols) / Math.ceil(area.count / area.cols))) : area.cols;
  const spacing = Math.min(1, area.cols / cols, Math.ceil(area.count / area.cols) / Math.ceil(count / cols));
  return {
    x: area.x + ((i % cols) * 70 + Math.floor(i / cols) * 85) * spacing,
    y: area.y + (-(i % cols) * 28 + Math.floor(i / cols) * 60) * spacing,
  };
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
