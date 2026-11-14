// The player: a body with acceleration, friction, crouch and a small hop, sliding
// along the arena's colliders. No teleporting, no clipping — velocity builds up over
// a few steps and bleeds off when the keys lift, so stopping to aim is a real choice.
import { resolveCircle } from './arena.js';

export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.08;
export const PLAYER_RADIUS = 0.42;

export function createPlayer(colliders) {
  const state = {
    position: { x: 0, y: 0, z: 19 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    eye: EYE_STAND,
    crouched: false,
    grounded: true,
    health: 100,
    armor: 0,
    alive: true,
    recoilPitch: 0,
    recoilYaw: 0,
    stepTimer: 0,
  };

  return {
    state,
    reset(x, z, yaw) {
      state.position.x = x;
      state.position.y = 0;
      state.position.z = z;
      state.velocity.x = 0;
      state.velocity.y = 0;
      state.velocity.z = 0;
      state.yaw = yaw;
      state.pitch = 0;
      state.eye = EYE_STAND;
      state.crouched = false;
      state.grounded = true;
      state.health = 100;
      state.armor = 0;
      state.alive = true;
      state.recoilPitch = 0;
      state.recoilYaw = 0;
    },
    look(dx, dy) {
      state.yaw -= dx * 0.0021;
      state.pitch -= dy * 0.0021;
      const limit = Math.PI / 2 - 0.02;
      state.pitch = Math.max(-limit, Math.min(limit, state.pitch));
    },
    addRecoil(pitchKick, yawKick) {
      state.recoilPitch += pitchKick;
      state.recoilYaw += yawKick;
    },
    groundSpeed() {
      return Math.hypot(state.velocity.x, state.velocity.z);
    },
    step(dt, keys, onStep) {
      if (!state.alive) return;
      const crouchKey = keys.has('ControlLeft') || keys.has('KeyC');
      state.crouched = crouchKey;
      const targetEye = crouchKey ? EYE_CROUCH : EYE_STAND;
      state.eye += (targetEye - state.eye) * Math.min(1, dt * 12);

      // Recoil decays back toward zero, so the view settles after a burst.
      state.recoilPitch *= Math.max(0, 1 - dt * 7);
      state.recoilYaw *= Math.max(0, 1 - dt * 7);

      const speed = crouchKey ? 2.6 : 5.4;
      const accel = 42;
      const friction = state.grounded ? 11 : 2.5;
      let ix = 0;
      let iz = 0;
      if (keys.has('KeyW')) iz -= 1;
      if (keys.has('KeyS')) iz += 1;
      if (keys.has('KeyA')) ix -= 1;
      if (keys.has('KeyD')) ix += 1;
      const len = Math.hypot(ix, iz) || 1;
      ix /= len;
      iz /= len;
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      const wx = ix * cos - iz * sin;
      const wz = ix * sin + iz * cos;
      state.velocity.x += wx * accel * dt;
      state.velocity.z += wz * accel * dt;
      const damp = Math.max(0, 1 - friction * dt);
      if (ix === 0 && iz === 0) {
        state.velocity.x *= damp;
        state.velocity.z *= damp;
      }
      const hSpeed = Math.hypot(state.velocity.x, state.velocity.z);
      if (hSpeed > speed) {
        state.velocity.x *= speed / hSpeed;
        state.velocity.z *= speed / hSpeed;
      }

      if (keys.has('Space') && state.grounded) {
        state.velocity.y = 5.2;
        state.grounded = false;
      }
      state.velocity.y -= 16 * dt;
      state.position.x += state.velocity.x * dt;
      state.position.z += state.velocity.z * dt;
      state.position.y += state.velocity.y * dt;
      if (state.position.y <= 0) {
        state.position.y = 0;
        state.velocity.y = 0;
        state.grounded = true;
      }
      state.position.x = Math.max(-31, Math.min(31, state.position.x));
      state.position.z = Math.max(-21, Math.min(21, state.position.z));
      resolveCircle(colliders, state.position, PLAYER_RADIUS);

      // Footsteps, timed by distance walked.
      if (hSpeed > 1.2 && state.grounded) {
        state.stepTimer -= dt * hSpeed;
        if (state.stepTimer <= 0) {
          state.stepTimer = 2.4;
          if (onStep) onStep();
        }
      }
    },
    damage(amount) {
      if (!state.alive) return 0;
      let left = amount;
      if (state.armor > 0) {
        const absorbed = Math.min(state.armor, left * 0.5);
        state.armor -= absorbed;
        left -= absorbed;
      }
      state.health -= left;
      if (state.health <= 0) {
        state.health = 0;
        state.alive = false;
      }
      return left;
    },
  };
}
