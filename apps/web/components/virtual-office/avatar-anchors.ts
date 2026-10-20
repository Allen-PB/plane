/** Screen-space local coordinates for the current fixed isometric artwork.
 * The seat cushion is the origin; direction describes where the keyboard is.
 * Sprite calibration is independent of workstation placement and camera state.
 */
export type AvatarDirection = "north-west" | "north-east" | "south-west" | "south-east";
export type AvatarAnchor = { x: number; y: number; direction: AvatarDirection; bodyHeight: number };
export const chairAnchors = {
  northEast: { x: -30, y: 24, direction: "north-east", bodyHeight: 52 },
  northWest: { x: 24, y: 27, direction: "north-west", bodyHeight: 52 },
  southWest: { x: 40, y: -18, direction: "south-west", bodyHeight: 52 },
} satisfies Record<string, AvatarAnchor>;

type SpriteCalibration = {
  width: number;
  height: number;
  hips: { x: number; y: number };
  headY: number;
  visibleHeight: number;
  filename: string;
};
// Calibrated against the opaque figure, not the PNG's transparent padding.
const seatedSprites = {
  male: {
    width: 1297,
    height: 1212,
    hips: { x: 820, y: 800 },
    headY: 61,
    visibleHeight: 1034,
    filename: "seated-avatar.png",
  },
  female: {
    width: 1297,
    height: 1212,
    hips: { x: 820, y: 800 },
    headY: 74,
    visibleHeight: 1027,
    filename: "seated-avatar-female.png",
  },
  maleFront: {
    width: 1024,
    height: 1536,
    hips: { x: 600, y: 850 },
    headY: 55,
    visibleHeight: 1399,
    filename: "seated-avatar-front.png",
  },
  femaleFront: {
    width: 1145,
    height: 1374,
    hips: { x: 680, y: 790 },
    headY: 20,
    visibleHeight: 1327,
    filename: "seated-avatar-female-front.png",
  },
} satisfies Record<string, SpriteCalibration>;

export function seatedAvatarModel(anchor: AvatarAnchor, style: "male" | "female" = "male") {
  const front = anchor.direction === "south-west" || anchor.direction === "south-east";
  const sprite = seatedSprites[front ? (style === "female" ? "femaleFront" : "maleFront") : style];
  const scale = anchor.bodyHeight / sprite.visibleHeight;
  return {
    src: `/virtual-office/art-v1/${sprite.filename}`,
    width: sprite.width * scale,
    height: sprite.height * scale,
    left: -sprite.hips.x * scale,
    top: -sprite.hips.y * scale,
    mirror: anchor.direction === "north-east" || anchor.direction === "south-east",
    rotation: { "north-west": 0, "north-east": 90, "south-east": 180, "south-west": 270 }[anchor.direction],
    nameplateY: (sprite.headY - sprite.hips.y) * scale - 10,
  };
}

export function deskForegroundMask(anchor: AvatarAnchor) {
  return anchor.direction === "south-west"
    ? [
        [-24, -4],
        [35, 25],
        [47, 16],
        [-12, -13],
      ]
    : [];
}

export type NameplatePoint = { id: string; x: number; y: number; width: number };
export type LabelObstacle = { left: number; right: number; top: number; bottom: number };
export function arrangeNameplates(points: NameplatePoint[], obstacles: LabelObstacle[] = []) {
  const occupied = [...obstacles];
  const ordered = [...points];
  // oxlint-disable-next-line unicorn/no-array-sort -- The app targets ES2022; only this local copy is sorted.
  ordered.sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  return ordered.map((point) => {
    let y = point.y;
    const box = () => ({
      left: point.x - point.width / 2 - 3,
      right: point.x + point.width / 2 + 3,
      top: y - 24,
      bottom: y + 3,
    });
    while (true) {
      const rect = box();
      const hit = occupied.find(
        (o) => rect.left < o.right && rect.right > o.left && rect.top < o.bottom && rect.bottom > o.top
      );
      if (!hit) {
        occupied.push(rect);
        break;
      }
      y = hit.top - 4;
    }
    return { id: point.id, x: point.x, width: point.width, y, naturalY: point.y };
  });
}

/** Foreground backrest pixels from the original illustration occlude the torso.
 * These polygons are local to the chair cushion, so they follow its anchor.
 */
export function chairBackrestMask(anchor: AvatarAnchor) {
  if (anchor.direction === "north-east")
    return [
      [-16, -5],
      [-3, 1],
      [-5, 20],
      [-18, 12],
    ];
  if (anchor.direction === "north-west")
    return [
      [3, 1],
      [17, -7],
      [14, 15],
      [0, 22],
    ];
  // The backrest is behind a front-facing person, so it must not cover them.
  return [];
}
