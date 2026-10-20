type Vec3 = [number, number, number];
const point = ([x, y, z]: Vec3) => [450 + (x - y) * 1.5, 490 + (x + y) * 0.7 - z * 1.8];
const shade = (hex: string, f: number) =>
  "#" +
  hex
    .slice(1)
    .match(/../g)!
    .map((h) =>
      Math.max(0, Math.min(255, Math.round(parseInt(h, 16) * f)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
/** Furniture and seated figure are built in one local coordinate system. No raster chair or avatar layers. */
export function workstationMarkup(state: { reverse: boolean; female: boolean; occupied: boolean }) {
  const shapes: { d: number; html: string }[] = [];
  const transform = ([x, y, z]: Vec3): Vec3 => (state.reverse ? [-x, -y, z] : [x, y, z]);
  const p = (v: Vec3) => point(transform(v));
  const depth = (v: Vec3) => {
    const t = transform(v);
    return t[0] + t[1] + t[2] * 0.015;
  };
  function poly(v: Vec3[], color: string, stroke = "none") {
    const d = v.map(p);
    shapes.push({
      d: v.reduce((sum, vertex) => sum + depth(vertex), 0) / v.length,
      html: `<polygon points="${d.map((q) => q.join(",")).join(" ")}" fill="${color}" stroke="${stroke}" stroke-width=".7" stroke-linejoin="round"/>`,
    });
  }
  function box(x: number, y: number, z: number, w: number, d: number, h: number, c: string) {
    const a: Vec3 = [x, y, z],
      b: Vec3 = [x + w, y, z],
      cc: Vec3 = [x + w, y + d, z],
      e: Vec3 = [x, y + d, z],
      A: Vec3 = [x, y, z + h],
      B: Vec3 = [x + w, y, z + h],
      C: Vec3 = [x + w, y + d, z + h],
      E: Vec3 = [x, y + d, z + h];
    poly([a, b, B, A], shade(c, 0.78));
    poly([b, cc, C, B], shade(c, 0.65));
    poly([cc, e, E, C], shade(c, 0.88));
    poly([e, a, A, E], shade(c, 0.72));
    poly([A, B, C, E], c);
  }
  function line(a: Vec3, b: Vec3, color: string, width: number) {
    const A = p(a),
      B = p(b);
    shapes.push({
      d: (depth(a) + depth(b)) / 2,
      html: `<path d="M${A} L${B}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`,
    });
  }
  function ball(v: Vec3, r: number, c: string) {
    const [x, y] = p(v);
    shapes.push({ d: depth(v), html: `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>` });
  }
  // Desk legs and modesty panel.
  for (const x of [-77, 69]) for (const y of [-50, 3]) box(x, y, 0, 6, 6, 71, "#506569");
  box(-75, -48, 34, 150, 3, 32, "#c3d3cb");
  box(-88, -60, 71, 176, 86, 6, "#d7b88c");
  // One chair: five-star base, stem, cushion, backrest.
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5;
    const foot: Vec3 = [Math.cos(a) * 24, 61 + Math.sin(a) * 24, 4];
    line([0, 61, 10], foot, "#536266", 5);
    ball(foot, 4, "#38474e");
  }
  line([0, 61, 8], [0, 61, 40], "#627174", 7);
  box(-20, 43, 40, 40, 35, 6, "#465f68");
  line([-19, 74, 43], [-19, 80, 80], "#354d55", 5);
  line([19, 74, 43], [19, 80, 80], "#354d55", 5);
  box(-23, 78, 57, 46, 7, 33, "#56717a");
  for (const x of [-24, 22]) {
    line([x, 59, 44], [x, 59, 60], "#52676c", 4);
    line([x, 47, 60], [x, 69, 60], "#344c54", 5);
  }
  if (state.occupied) {
    const skin = "#d4a07f",
      shirt = state.female ? "#b87667" : "#4f6d89",
      pants = "#344650";
    // Hips at cushion Z46. Thighs extend toward keyboard (-Y), calves descend.
    box(-14, 47, 46, 28, 17, 10, pants);
    for (const x of [-10, 10]) {
      line([x, 51, 51], [x, 27, 47], pants, 16);
      line([x, 27, 47], [x, 24, 10], pants, 13);
      line([x, 24, 7], [x, 12, 7], "#e0dbcf", 14);
    }
    box(-16, 47, 57, 32, 16, 31, shirt);
    line([-13, 53, 84], [13, 53, 84], shirt, 18);
    line([0, 54, 87], [0, 53, 96], skin, 10);
    ball([0, 52, 106], 17, skin);
    ball([0, 56, 112], 17, "#352d2a");
    // Face sits on desk-facing side; hair behind, never mirrored independently.
    ball([0, 45, 105], 12, skin);
    ball([-9, 45, 109], 4, "#352d2a");
    if (state.female) {
      line([-12, 59, 110], [-14, 62, 85], "#352d2a", 12);
      line([12, 59, 110], [14, 62, 85], "#352d2a", 12);
    }
    for (const x of [-20, 20]) {
      line([x * 0.7, 52, 83], [x, 33, 70], shirt, 12);
      line([x, 33, 70], [x * 0.55, 7, 81], skin, 9);
      ball([x * 0.55, 5, 81], 5, skin);
    }
  }
  // Keyboard sits under hands. Monitor faces chair, away from rear wall.
  box(-28, -2, 77, 56, 18, 2, "#475963");
  for (let j = 0; j < 3; j++) line([-23, 1 + j * 4, 79.2], [23, 1 + j * 4, 79.2], "#85959b", 1);
  box(-14, -37, 77, 28, 15, 2, "#526369");
  box(-3, -34, 79, 6, 5, 15, "#6a7c80");
  box(-40, -39, 91, 80, 5, 43, "#364b55");
  box(-36, -33.8, 95, 72, 0.8, 35, "#82bdd0");
  box(-30, -33, 98, 23, 0.8, 27, "#a5d4df");
  box(-3, -33, 113, 34, 0.8, 12, "#c0e0e3");
  box(-3, -33, 99, 34, 0.8, 9, "#6fa9bf");
  box(47, -4, 77, 15, 19, 1, "#eff0e6");
  line([52, 3, 79], [59, 10, 79], "#8a9b8d", 2);
  box(-66, -38, 77, 12, 12, 14, "#e4e8df");
  line([-54, -34, 85], [-49, -34, 85], "#c2cec5", 4);

  // oxlint-disable-next-line unicorn/no-array-sort -- Sort local depth layers for ES2022.
  shapes.sort((a, b) => a.d - b.d);
  return shapes.map((s) => s.html).join("");
}
