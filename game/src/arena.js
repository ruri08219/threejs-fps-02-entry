// Kestrel freight yard: the original map for ASHFALL PROTOCOL. A decommissioned
// rail depot at dusk — container stacks, a freight hall, a tank farm — with three
// lanes (west hall, middle rails, east tanks) and two bomb sites. Everything here is
// built from plain boxes and cylinders; no model files, no textures, no network.
//
// The yard is 64 m wide (x) by 44 m deep (z). Vanguard spawns south (z +18),
// Sentinel spawns north (z -18). Site A is the freight hall, north-west; site B is
// the tank farm, north-east. Colliders are axis-aligned boxes in the XZ plane;
// bots and the player slide along them.
import * as THREE from 'three';

const CONTAINER_COLORS = [0x8a4a2b, 0x2e5d6b, 0x6b6f2e, 0x7a2e3d, 0x3d4a6b, 0x5d5a4a];

export function createArena(scene) {
  const colliders = [];
  const occluders = []; // meshes a line of sight must not pass through
  const group = new THREE.Group();
  scene.add(group);

  const asphalt = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.95 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.9 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x6b3a24, roughness: 0.85, metalness: 0.25 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.55, metalness: 0.6 });
  const hazard = new THREE.MeshStandardMaterial({ color: 0xc78a1e, roughness: 0.8 });
  const tankPaint = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.5, metalness: 0.7 });
  const lampGlow = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc860, emissiveIntensity: 1.4 });

  function addBox(material, x, y, z, w, h, d, collide = true, occlude = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, top: y + h / 2 });
    if (occlude) occluders.push(mesh);
    return mesh;
  }

  // Ground and apron.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 44), asphalt);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  // Painted centre line down the middle rail lane.
  const railLine = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 40), new THREE.MeshStandardMaterial({ color: 0x5f5330, roughness: 0.9 }));
  railLine.rotation.x = -Math.PI / 2;
  railLine.position.set(0, 0.02, 0);
  group.add(railLine);

  // Perimeter walls.
  addBox(concrete, 0, 2, -22, 64, 4, 1);
  addBox(concrete, 0, 2, 22, 64, 4, 1);
  addBox(concrete, -32, 2, 0, 1, 4, 44);
  addBox(concrete, 32, 2, 0, 1, 4, 44);

  // --- Freight hall, site A (north-west). A roofed shed, open at the south face.
  addBox(rust, -22, 3, -17, 14, 6, 1); // back wall
  addBox(rust, -29, 3, -13, 1, 6, 9); // west wall
  addBox(rust, -15, 3, -13, 1, 6, 9); // east wall
  const roofA = new THREE.Mesh(new THREE.BoxGeometry(15, 0.5, 10), steel);
  roofA.position.set(-22, 6.2, -13);
  roofA.castShadow = true;
  group.add(roofA);
  occluders.push(roofA);
  addBox(hazard, -22, 0.35, -9.5, 12, 0.7, 1.2); // loading dock lip

  // --- Tank farm, site B (north-east). Three standing tanks and a pipe rack.
  for (const [tx, tz] of [[18, -16], [24, -13], [20, -19]]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 5, 18), tankPaint);
    tank.position.set(tx, 2.5, tz);
    tank.castShadow = true;
    tank.receiveShadow = true;
    group.add(tank);
    colliders.push({ x0: tx - 2.4, x1: tx + 2.4, z0: tz - 2.4, z1: tz + 2.4, top: 5 });
    occluders.push(tank);
  }
  addBox(steel, 26, 1.2, -16, 1, 2.4, 8); // pipe rack

  // --- Container stacks: the lanes.
  const stacks = [
    // west lane wall, guiding attackers toward A
    [-12, -6, 8, 2.6, 2.4, 0x8a4a2b], [-12, -1, 8, 2.6, 2.4, 0x2e5d6b],
    [-12, 4, 6, 2.6, 2.4, 0x6b6f2e], [-12, 4, 6, 2.6, 2.4, 0x7a2e3d, 2.6],
    // mid rail cars, low cover in the middle lane
    [-4, -2, 6, 1.4, 2.2, 0x3d4a6b], [4, 2, 6, 1.4, 2.2, 0x5d5a4a],
    // east lane wall toward B
    [12, -6, 8, 2.6, 2.4, 0x2e5d6b], [12, -1, 8, 2.6, 2.4, 0x8a4a2b],
    [12, 4, 6, 2.6, 2.4, 0x7a2e3d], [12, 4, 6, 2.6, 2.4, 0x3d4a6b, 2.6],
    // south yard stacks near Vanguard spawn
    [-20, 12, 8, 2.6, 2.4, 0x5d5a4a], [-6, 14, 8, 2.6, 2.4, 0x8a4a2b],
    [8, 14, 8, 2.6, 2.4, 0x6b6f2e], [22, 12, 8, 2.6, 2.4, 0x2e5d6b],
    // north yard stacks near Sentinel spawn
    [-6, -18, 6, 2.6, 2.4, 0x7a2e3d], [6, -18, 6, 2.6, 2.4, 0x5d5a4a],
  ];
  for (const [x, z, w, h, d, color, lift] of stacks) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.35 });
    addBox(mat, x, (lift ?? 0) + h / 2, z, w, h, d);
  }
  // Low crates: waist-high cover, scattered.
  const crates = [
    [-8, 8, 1.6], [8, -8, 1.6], [-16, -2, 1.4], [16, 2, 1.4],
    [0, -10, 1.6], [-2, 10, 1.4], [20, 6, 1.6], [-24, 6, 1.6],
  ];
  for (const [x, z, s] of crates) addBox(concrete, x, s / 2, z, s, s, s);

  // --- Bomb sites: painted ground markers and a beacon lamp each.
  function siteMarker(x, z, label) {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshStandardMaterial({ color: 0xff7a2f, roughness: 0.9, transparent: true, opacity: 0.28 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(x, 0.03, z);
    group.add(pad);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 8), steel);
    pole.position.set(x + 2.6, 2.5, z + 2.6);
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lampGlow);
    lamp.position.set(x + 2.6, 5.1, z + 2.6);
    group.add(lamp);
    const light = new THREE.PointLight(0xffc860, 14, 16, 1.8);
    light.position.set(x + 2.6, 5, z + 2.6);
    group.add(light);
    return { x, z, label };
  }
  const siteA = siteMarker(-22, -13, 'A');
  const siteB = siteMarker(21, -16, 'B');

  // Floodlight poles over mid and south yard.
  for (const [x, z] of [[0, 6], [-14, 12], [14, 12]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 8, 8), steel);
    pole.position.set(x, 4, z);
    pole.castShadow = true;
    group.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), lampGlow);
    head.position.set(x, 8.1, z);
    group.add(head);
    const light = new THREE.PointLight(0xffe6b0, 22, 26, 1.6);
    light.position.set(x, 7.8, z);
    group.add(light);
  }

  // Waypoint graph: nodes bots walk between. Edges are symmetric.
  const nodes = {
    vSpawn: { x: 0, z: 19 }, vWest: { x: -14, z: 15 }, vEast: { x: 14, z: 15 },
    vMid: { x: 0, z: 10 }, yardWest: { x: -22, z: 8 }, yardEast: { x: 22, z: 8 },
    midWest: { x: -7, z: 2 }, mid: { x: 0, z: -2 }, midEast: { x: 7, z: 2 },
    aLane: { x: -14, z: -5 }, bLane: { x: 14, z: -5 },
    aSite: { x: -22, z: -12 }, bSite: { x: 21, z: -15 },
    aHold: { x: -16, z: -9 }, bHold: { x: 16, z: -10 },
    sSpawn: { x: 0, z: -19 }, sWest: { x: -10, z: -16 }, sEast: { x: 10, z: -16 },
    aFlank: { x: -26, z: 2 }, bFlank: { x: 26, z: 2 },
  };
  const edges = [
    ['vSpawn', 'vWest'], ['vSpawn', 'vMid'], ['vSpawn', 'vEast'],
    ['vWest', 'yardWest'], ['vWest', 'vMid'], ['vEast', 'yardEast'], ['vEast', 'vMid'],
    ['vMid', 'midWest'], ['vMid', 'mid'], ['vMid', 'midEast'],
    ['yardWest', 'aFlank'], ['yardWest', 'midWest'], ['yardEast', 'bFlank'], ['yardEast', 'midEast'],
    ['midWest', 'aLane'], ['midEast', 'bLane'], ['midWest', 'mid'], ['midEast', 'mid'],
    ['aFlank', 'aLane'], ['bFlank', 'bLane'],
    ['aLane', 'aSite'], ['aLane', 'aHold'], ['bLane', 'bSite'], ['bLane', 'bHold'],
    ['aSite', 'aHold'], ['bSite', 'bHold'],
    ['aHold', 'sWest'], ['bHold', 'sEast'], ['aSite', 'sWest'], ['bSite', 'sEast'],
    ['sWest', 'sSpawn'], ['sEast', 'sSpawn'], ['mid', 'sSpawn'],
  ];
  const graph = new Map();
  for (const name of Object.keys(nodes)) graph.set(name, []);
  for (const [a, b] of edges) {
    graph.get(a).push(b);
    graph.get(b).push(a);
  }

  return {
    colliders,
    occluders,
    graph,
    nodes,
    siteA,
    siteB,
    spawns: {
      vanguard: [
        { x: -3, z: 19, yaw: 0 }, { x: 0, z: 20, yaw: 0 }, { x: 3, z: 19, yaw: 0 },
        { x: -6, z: 18, yaw: 0 }, { x: 6, z: 18, yaw: 0 },
      ],
      sentinel: [
        { x: -3, z: -19, yaw: Math.PI }, { x: 0, z: -20, yaw: Math.PI }, { x: 3, z: -19, yaw: Math.PI },
        { x: -6, z: -18, yaw: Math.PI }, { x: 6, z: -18, yaw: Math.PI },
      ],
    },
  };
}

// Circle (a walker) against the arena's AABB colliders: push the circle out of
// every box it overlaps. Returns true when any push happened.
export function resolveCircle(colliders, pos, radius) {
  let pushed = false;
  for (const c of colliders) {
    const nx = Math.max(c.x0, Math.min(pos.x, c.x1));
    const nz = Math.max(c.z0, Math.min(pos.z, c.z1));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;
    if (distSq > 1e-8) {
      const dist = Math.sqrt(distSq);
      const push = (radius - dist) / dist;
      pos.x += dx * push;
      pos.z += dz * push;
    } else {
      // Centre inside the box: shove out along the smallest penetration axis.
      const left = pos.x - c.x0 + radius;
      const right = c.x1 - pos.x + radius;
      const top = pos.z - c.z0 + radius;
      const bottom = c.z1 - pos.z + radius;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = c.x0 - radius;
      else if (m === right) pos.x = c.x1 + radius;
      else if (m === top) pos.z = c.z0 - radius;
      else pos.z = c.z1 + radius;
    }
    pushed = true;
  }
  return pushed;
}

// Breadth-first route through the waypoint graph, from nearest node to `from`
// to nearest node to `to`. Returns a list of {x, z} waypoints, start excluded.
export function findRoute(arena, from, to) {
  const names = Object.keys(arena.nodes);
  const nearest = (p) => {
    let best = names[0];
    let bestD = Infinity;
    for (const n of names) {
      const node = arena.nodes[n];
      const d = (node.x - p.x) ** 2 + (node.z - p.z) ** 2;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  };
  const start = nearest(from);
  const goal = nearest(to);
  if (start === goal) return [arena.nodes[goal]];
  const prev = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const next of arena.graph.get(cur)) {
      if (!prev.has(next)) { prev.set(next, cur); queue.push(next); }
    }
  }
  if (!prev.has(goal)) return [arena.nodes[goal]];
  const path = [];
  let cur = goal;
  while (cur !== null) { path.unshift(arena.nodes[cur]); cur = prev.get(cur); }
  return path;
}
