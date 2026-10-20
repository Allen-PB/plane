export const officeArtwork = { width: 1536, height: 1024 };
export const departmentAreas = [
  { code: "DEV", count: 10, cols: 5, x: 558, y: 375 },
  { code: "QA", count: 5, cols: 3, x: 978, y: 375 },
  { code: "PM", count: 5, cols: 3, x: 348, y: 480 },
  { code: "UIUX", count: 3, cols: 3, x: 558, y: 585 },
  { code: "BIZ", count: 7, cols: 3, x: 978, y: 585 },
  { code: "AM", count: 5, cols: 3, x: 698, y: 725 },
  { code: "LEAD", count: 4, cols: 2, x: 768, y: 270 },
];
export type OfficeCamera = { scale: number; x: number; y: number };
export function deskLocation(order: number, number: number) {
  const area = departmentAreas[order];
  if (!area || number < 1 || number > area.count) return null;
  const i = number - 1;
  return {
    x: area.x + (i % area.cols) * 70 - Math.floor(i / area.cols) * 70,
    y: area.y + (i % area.cols) * 35 + Math.floor(i / area.cols) * 35,
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
  const rows = Math.ceil(area.count / area.cols);
  const a = [area.x - 40, area.y - 20],
    b = [area.x + (area.cols - 1) * 70 + 45, area.y + (area.cols - 1) * 35 + 15];
  const c = [b[0] - (rows - 1) * 70 - 35, b[1] + (rows - 1) * 35 + 50];
  const d = [a[0] - (rows - 1) * 70 - 35, a[1] + (rows - 1) * 35 + 50];
  return [a, b, c, d].map((point) => point.join(",")).join(" ");
}
