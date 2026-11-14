// Transient effects: tracer lines, muzzle flashes, impact sparks and explosions.
// Everything here is pooled and reused — no object is made in a hot loop — and
// every effect dies on its own timer, so nothing leaks between rounds.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_SPARKS = 160;
const MAX_FLASHES = 8;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerCursor = 0;

  const sparks = [];
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 3), 3));
  // Round soft dots, not squares: a tiny radial-gradient sprite as the map.
  const dotCanvas = document.createElement('canvas');
  dotCanvas.width = 32;
  dotCanvas.height = 32;
  const dotCtx = dotCanvas.getContext('2d');
  const gradient = dotCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  dotCtx.fillStyle = gradient;
  dotCtx.fillRect(0, 0, 32, 32);
  const dotTexture = new THREE.CanvasTexture(dotCanvas);
  const sparkMat = new THREE.PointsMaterial({ color: 0xffc860, size: 0.06, map: dotTexture, transparent: true, opacity: 0.95, depthWrite: false });
  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);
  for (let i = 0; i < MAX_SPARKS; i += 1) sparks.push({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
  let sparkCursor = 0;

  const flashes = [];
  for (let i = 0; i < MAX_FLASHES; i += 1) {
    const light = new THREE.PointLight(0xffc860, 0, 9, 1.6);
    scene.add(light);
    flashes.push({ light, life: 0 });
  }
  let flashCursor = 0;

  // One shared explosion shell, scaled up and faded out.
  const blastGeo = new THREE.SphereGeometry(1, 16, 12);
  const blastMat = new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0 });
  const blast = new THREE.Mesh(blastGeo, blastMat);
  blast.visible = false;
  scene.add(blast);
  let blastLife = 0;
  let blastMax = 1;

  const tmp = new THREE.Vector3();

  return {
    tracer(from, to, color) {
      const t = tracers[tracerCursor];
      tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
      const pos = t.line.geometry.attributes.position.array;
      pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
      pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.color.setHex(color);
      t.line.material.opacity = 0.9;
      t.life = 0.09;
    },
    sparksAt(point, count, speed) {
      for (let n = 0; n < count; n += 1) {
        const s = sparks[sparkCursor];
        sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
        s.x = point.x; s.y = point.y; s.z = point.z;
        const a = Math.random() * Math.PI * 2;
        const b = Math.random() * Math.PI - Math.PI / 2;
        const v = speed * (0.4 + Math.random() * 0.6);
        s.vx = Math.cos(a) * Math.cos(b) * v;
        s.vy = Math.abs(Math.sin(b)) * v + 1;
        s.vz = Math.sin(a) * Math.cos(b) * v;
        s.life = 0.35 + Math.random() * 0.3;
      }
    },
    muzzle(at, direction) {
      const f = flashes[flashCursor];
      flashCursor = (flashCursor + 1) % MAX_FLASHES;
      tmp.copy(at).addScaledVector(direction, 0.5);
      f.light.position.copy(tmp);
      f.light.intensity = 26;
      f.life = 0.06;
    },
    explosion(point, radius) {
      blast.position.copy(point);
      blast.scale.setScalar(0.4);
      blast.material.opacity = 0.9;
      blast.visible = true;
      blastLife = 0.5;
      blastMax = radius;
      this.sparksAt(point, 40, 7);
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life > 0) {
          t.life -= dt;
          if (t.life <= 0) t.line.material.opacity = 0;
        }
      }
      const pos = sparkGeo.attributes.position.array;
      for (let i = 0; i < MAX_SPARKS; i += 1) {
        const s = sparks[i];
        if (s.life > 0) {
          s.life -= dt;
          s.vy -= 12 * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.z += s.vz * dt;
          if (s.y < 0.03) { s.y = 0.03; s.vy *= -0.4; }
        } else {
          s.y = -99;
        }
        pos[i * 3] = s.x;
        pos[i * 3 + 1] = s.y;
        pos[i * 3 + 2] = s.z;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      for (const f of flashes) {
        if (f.life > 0) {
          f.life -= dt;
          if (f.life <= 0) f.light.intensity = 0;
        }
      }
      if (blastLife > 0) {
        blastLife -= dt;
        const k = 1 - blastLife / 0.5;
        blast.scale.setScalar(0.4 + k * blastMax);
        blast.material.opacity = Math.max(0, 0.9 * (1 - k));
        if (blastLife <= 0) blast.visible = false;
      }
    },
    reset() {
      for (const t of tracers) { t.life = 0; t.line.material.opacity = 0; }
      for (const s of sparks) { s.life = 0; s.y = -99; }
      for (const f of flashes) { f.life = 0; f.light.intensity = 0; }
      blastLife = 0;
      blast.visible = false;
    },
  };
}

// A thrown grenade: a small dark sphere with a blinking fuse light, arcing under
// gravity, bouncing once off the ground, then detonating on its fuse.
export function createGrenade(scene) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2d22, roughness: 0.6, metalness: 0.5 }),
  );
  mesh.visible = false;
  scene.add(mesh);
  const fuseLight = new THREE.PointLight(0xff4030, 0, 4, 1.5);
  scene.add(fuseLight);
  const state = {
    active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    fuse: 0, owner: null, blink: 0,
  };
  return {
    state,
    mesh,
    throwFrom(origin, direction, owner) {
      state.active = true;
      state.pos.copy(origin);
      state.vel.copy(direction).multiplyScalar(13);
      state.vel.y += 4.5;
      state.fuse = 1.4;
      state.owner = owner;
      mesh.visible = true;
      mesh.position.copy(origin);
    },
    // Returns 'boom' when the fuse ends, else null.
    step(dt) {
      if (!state.active) return null;
      state.fuse -= dt;
      state.vel.y -= 14 * dt;
      state.pos.addScaledVector(state.vel, dt);
      if (state.pos.y < 0.11) {
        state.pos.y = 0.11;
        state.vel.y *= -0.35;
        state.vel.x *= 0.7;
        state.vel.z *= 0.7;
      }
      state.pos.x = Math.max(-31, Math.min(31, state.pos.x));
      state.pos.z = Math.max(-21, Math.min(21, state.pos.z));
      mesh.position.copy(state.pos);
      state.blink += dt;
      fuseLight.position.copy(state.pos);
      fuseLight.intensity = Math.sin(state.blink * 28) > 0 ? 3 : 0;
      if (state.fuse <= 0) {
        state.active = false;
        mesh.visible = false;
        fuseLight.intensity = 0;
        return 'boom';
      }
      return null;
    },
    reset() {
      state.active = false;
      mesh.visible = false;
      fuseLight.intensity = 0;
    },
  };
}
