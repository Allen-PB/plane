/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { OfficeState } from "../../services/virtual-office.service";

// Floor arrangement from the supplied PathBuilder visual prototype. Identity,
// reservations and presence always come from the authenticated office API.
const zones = [
  { x: -10, z: -5.5, cols: 5, code: "DEV" },
  { x: 3, z: -5.5, cols: 5, code: "QA" },
  { x: -10, z: 3.8, cols: 5, code: "PM" },
  { x: 3, z: 3.8, cols: 3, code: "UIUX" },
  { x: -10, z: 10, cols: 4, code: "BIZ" },
  { x: 1, z: 10, cols: 5, code: "AM" },
  { x: 11, z: 3.8, cols: 2, code: "LEAD" },
];

export type OfficeRenderer = {
  update: (office: OfficeState, selected: number | null) => void;
  reset: () => void;
  dispose: () => void;
};

function release(group: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) geometries.add(object.geometry);
    if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        if ("map" in material && material.map instanceof THREE.Texture) textures.add(material.map);
      }
    }
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

function box(parent: THREE.Object3D, size: [number, number, number], at: [number, number, number], color: string) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  );
  mesh.position.set(...at);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function label(
  parent: THREE.Object3D,
  text: string,
  at: [number, number, number],
  width: number,
  color = "#354958",
  ground = false
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.font = "600 52px Inter, system-ui, sans-serif";
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 512, 64, 1000);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  if (ground) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 8), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(...at);
    parent.add(mesh);
  } else {
    // Sprites keep employee names legible while rotating the office.
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    material.dispose();
    sprite.position.set(...at);
    sprite.scale.set(width, width / 8, 1);
    parent.add(sprite);
  }
}

function plant(parent: THREE.Object3D, x: number, z: number) {
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.28, 0.55, 12),
    new THREE.MeshStandardMaterial({ color: "#c4ae90" })
  );
  pot.position.set(x, 0.28, z);
  pot.castShadow = true;
  parent.add(pot);
  for (let n = 0; n < 4; n++) {
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 10, 8),
      new THREE.MeshStandardMaterial({ color: n % 2 ? "#529675" : "#7faa88" })
    );
    leaf.scale.set(0.65, 1.5, 0.65);
    leaf.position.set(x + Math.cos(n * 1.6) * 0.18, 0.9 + n * 0.12, z + Math.sin(n * 1.6) * 0.18);
    parent.add(leaf);
  }
}

function furniture(root: THREE.Group) {
  box(root, [34, 0.3, 25], [3, -0.17, 4], "#e7e7df");
  box(root, [34, 0.3, 25], [3, -0.48, 4], "#bdcbd4");
  box(root, [34, 1.6, 0.18], [3, 0.65, -8.5], "#d1dfe7");
  box(root, [0.18, 1.6, 25], [-14, 0.65, 4], "#c7d6e0");
  for (let x = -10; x < 18; x += 6) box(root, [4.5, 0.9, 0.05], [x, 0.86, -8.37], "#b2d5e5");
  label(root, "PATHBUILDER", [2, 0.025, 0.9], 9, "#91a5af", true);
  label(root, "BUILD YOUR NEXT CHAPTER", [2, 0.025, 1.7], 6, "#9dadb3", true);
  box(root, [4.8, 0.035, 5], [16, 0.025, -4], "#d7e2de");
  const table = box(root, [2.9, 0.2, 1.6], [16, 0.85, -4], "#bc9978");
  table.rotation.y = 0.12;
  box(root, [0.3, 0.8, 0.8], [16, 0.4, -4], "#8c857a");
  for (const x of [15, 17])
    for (const z of [-5.35, -2.65]) {
      box(root, [0.7, 0.16, 0.65], [x, 0.45, z], "#617e8b");
      box(root, [0.7, 0.65, 0.12], [x, 0.75, z + (z < -4 ? -0.25 : 0.25)], "#617e8b");
    }
  label(root, "THE IDEAS ROOM", [16, 0.06, -6.7], 4.7, "#698579", true);
  for (const x of [-10.5, -6.5]) {
    box(root, [2.3, 0.5, 0.85], [x, 0.5, 0.6], "#859c90");
    box(root, [2.3, 0.55, 0.2], [x, 0.95, 0.25], "#859c90");
  }
  box(root, [1.5, 0.12, 1], [-8.5, 0.45, 1.65], "#bd9b7b");
  label(root, "COFFEE & CONNECTIONS", [-8.5, 0.03, -0.7], 6, "#7f9186", true);
  for (const [x, z] of [
    [-13, -7.5],
    [19, -7.5],
    [-13, 15.5],
    [19, 15.5],
    [13.5, 0.5],
  ])
    plant(root, x, z);
}

export function createOfficeRenderer(
  host: HTMLDivElement,
  onSelect: (id: number) => void,
  onFailure: () => void
): OfficeRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor("#e8eef0");
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-22, 22, 17, -17, 0.1, 160);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minPolarAngle = 0.3;
  controls.maxPolarAngle = Math.PI / 2.2;
  controls.minZoom = 0.6;
  controls.maxZoom = 3.2;
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  function reset() {
    camera.position.set(30, 32, 35);
    camera.zoom = 1;
    controls.target.set(3, 0, 4);
    camera.updateProjectionMatrix();
    controls.update();
  }
  reset();
  scene.add(new THREE.AmbientLight("#ffffff", 1.8));
  const sun = new THREE.DirectionalLight("#fff9ee", 2.5);
  sun.position.set(4, 25, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -23;
  sun.shadow.camera.right = 23;
  sun.shadow.camera.top = 23;
  sun.shadow.camera.bottom = -23;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  const fixed = new THREE.Group();
  furniture(fixed);
  scene.add(fixed);
  let desks = new THREE.Group();
  scene.add(desks);
  let signature = "";
  let selectedTargets: THREE.Object3D[] = [];
  let disposed = false;
  function update(office: OfficeState, selected: number | null) {
    const next = JSON.stringify([office.departments, office.desks, office.members, office.me.id, selected]);
    if (signature === next || disposed) return;
    signature = next;
    scene.remove(desks);
    release(desks);
    desks = new THREE.Group();
    scene.add(desks);
    selectedTargets = [];
    for (const department of office.departments) {
      const zone = zones[department.order];
      if (!zone) continue;
      const seats = office.desks.filter((desk) => desk.department_id === department.id);
      const columns = Math.min(zone.cols, seats.length);
      const rows = Math.ceil(seats.length / zone.cols);
      const rug = box(
        desks,
        [columns * 2.05 + 0.4, 0.035, rows * 2.3 + 1.1],
        [zone.x + (columns - 1) * 1.025, 0.005, zone.z + (rows - 1) * 1.15 + 0.35],
        department.color
      );
      (rug.material as THREE.MeshStandardMaterial).transparent = true;
      (rug.material as THREE.MeshStandardMaterial).opacity = 0.16;
      label(
        desks,
        department.name.toUpperCase(),
        [zone.x + (columns - 1) * 1.025, 0.04, zone.z - 1.4],
        Math.max(columns * 2, 5),
        "#455d6b",
        true
      );
      for (const desk of seats) {
        const group = new THREE.Group();
        group.position.set(
          zone.x + ((desk.number - 1) % zone.cols) * 2.05,
          0,
          zone.z + Math.floor((desk.number - 1) / zone.cols) * 2.3
        );
        desks.add(group);
        const member = office.members.find((m) => m.id === desk.member_id);
        const mine = desk.member_id === office.me.id;
        const surface = box(
          group,
          [1.65, 0.14, 0.82],
          [0, 0.73, 0],
          selected === desk.id ? "#79aaf1" : mine ? "#b9d5ed" : "#c8a47c"
        );
        for (const x of [-0.64, 0.64]) box(group, [0.12, 0.65, 0.65], [x, 0.34, 0], "#eeeae2");
        box(group, [0.72, 0.52, 0.065], [0, 1.1, -0.22], "#394956");
        box(group, [0.61, 0.4, 0.02], [0, 1.1, -0.18], member?.online ? "#6cb4c7" : "#506471");
        box(group, [0.08, 0.24, 0.08], [0, 0.85, -0.22], "#7c8d98");
        box(group, [0.48, 0.035, 0.17], [0, 0.82, 0.2], "#d5dfe2");
        box(group, [0.68, 0.16, 0.65], [0, 0.43, 1], department.color);
        box(group, [0.68, 0.65, 0.15], [0, 0.75, 1.26], "#536d80");
        box(group, [0.1, 0.3, 0.1], [0, 0.2, 1], "#657782");
        label(group, `${zone.code}-${String(desk.number).padStart(2, "0")}`, [0, 0.035, -0.8], 1.6, "#617987", true);
        if (selected === desk.id || mine) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.91, 0.97, 32),
            new THREE.MeshBasicMaterial({ color: selected === desk.id ? "#4775e7" : "#39a6d1", side: THREE.DoubleSide })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(0, 0.04, 0.3);
          group.add(ring);
        }
        if (member?.online) {
          const body = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.21, 0.43, 4, 8),
            new THREE.MeshStandardMaterial({ color: department.color })
          );
          body.position.set(0, 0.98, 1);
          body.castShadow = true;
          group.add(body);
          const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 12, 12),
            new THREE.MeshStandardMaterial({ color: "#e6b48c" })
          );
          head.position.set(0, 1.49, 1);
          head.castShadow = true;
          group.add(head);
          const hair = new THREE.Mesh(
            new THREE.SphereGeometry(0.225, 12, 8, 0, Math.PI * 2, 0, 1.25),
            new THREE.MeshStandardMaterial({ color: "#493f45" })
          );
          hair.position.copy(head.position);
          group.add(hair);
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 10, 10),
            new THREE.MeshBasicMaterial({ color: "#29c68d" })
          );
          dot.position.set(0.4, 1.8, 1);
          group.add(dot);
        }
        if (member)
          label(
            group,
            `${mine ? "You" : member.name}${member.online ? " •" : ""}`,
            [0, 2, 0.55],
            2.6,
            member.online ? "#246747" : "#6c7e89"
          );
        group.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.userData.deskId = desk.id;
            selectedTargets.push(object);
          }
        });
        surface.userData.deskId = desk.id;
      }
    }
  }
  function resize() {
    const width = Math.max(host.clientWidth, 1),
      height = Math.max(host.clientHeight, 1);
    const aspect = width / height;
    const halfHeight = Math.max(17, 23 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const pointer = new THREE.Vector2(),
    ray = new THREE.Raycaster();
  let down: { x: number; y: number; id: number } | null = null;
  const pointerDown = (event: PointerEvent) => {
    down = event.isPrimary && event.button === 0 ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
  };
  const pointerUp = (event: PointerEvent) => {
    if (!down || down.id !== event.pointerId || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) {
      down = null;
      return;
    }
    down = null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1
    );
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(selectedTargets, false)[0];
    if (hit) onSelect(Number(hit.object.userData.deskId));
  };
  const cancel = () => {
    down = null;
  };
  const lost = (event: Event) => {
    event.preventDefault();
    onFailure();
  };
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  renderer.domElement.addEventListener("pointercancel", cancel);
  renderer.domElement.addEventListener("webglcontextlost", lost);
  let animation = 0;
  const animate = () => {
    if (disposed) return;
    animation = requestAnimationFrame(animate);
    if (!document.hidden) {
      controls.update();
      renderer.render(scene, camera);
    }
  };
  animate();
  return {
    update,
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(animation);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointercancel", cancel);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      controls.dispose();
      release(fixed);
      release(desks);
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
