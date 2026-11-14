// The armoury: four guns and one grenade, each with its own numbers. Damage falls
// with range; headshots pay double. Spread grows while moving and while firing, so
// stopping to aim is how a fight is won — spray-and-pray loses to a planted shot.
export const WEAPONS = {
  sidearm: {
    id: 'sidearm', name: 'P9 Sidearm', kind: 'pistol', price: 0,
    damage: 34, headMult: 2, range: 34, falloff: 0.55,
    magSize: 12, reserveMax: 48, fireInterval: 0.16, reloadTime: 1.1,
    spreadBase: 0.010, spreadMove: 0.022, spreadPerShot: 0.006, spreadMax: 0.05,
    recoil: 0.010, auto: false, pellets: 1, tracer: 0xffd9a0,
  },
  rook: {
    id: 'rook', name: 'Rook-9 SMG', kind: 'smg', price: 1200,
    damage: 26, headMult: 2, range: 26, falloff: 0.5,
    magSize: 28, reserveMax: 112, fireInterval: 0.085, reloadTime: 1.5,
    spreadBase: 0.016, spreadMove: 0.030, spreadPerShot: 0.008, spreadMax: 0.075,
    recoil: 0.008, auto: true, pellets: 1, tracer: 0xffc860,
  },
  longshot: {
    id: 'longshot', name: 'VK-7 Longshot', kind: 'rifle', price: 2700,
    damage: 38, headMult: 2, range: 60, falloff: 0.7,
    magSize: 25, reserveMax: 100, fireInterval: 0.11, reloadTime: 2.0,
    spreadBase: 0.007, spreadMove: 0.026, spreadPerShot: 0.007, spreadMax: 0.06,
    recoil: 0.014, auto: true, pellets: 1, tracer: 0xffe0a0,
  },
  maw: {
    id: 'maw', name: 'Maw-12 Scatter', kind: 'shotgun', price: 1800,
    damage: 14, headMult: 1.6, range: 16, falloff: 0.35,
    magSize: 6, reserveMax: 24, fireInterval: 0.85, reloadTime: 2.4,
    spreadBase: 0.030, spreadMove: 0.040, spreadPerShot: 0.010, spreadMax: 0.09,
    recoil: 0.034, auto: false, pellets: 8, tracer: 0xffb060,
  },
};

export const GRENADE = { id: 'grenade', name: 'Thumper HE', price: 300, radius: 6.5, damage: 95, fuse: 1.4 };

export const ARMOR = { id: 'armor', name: 'Plate Vest', price: 650, value: 100 };

// One live weapon instance: ammo, spread state, timers. The player and every bot
// hold one; the numbers above never change mid-round.
export function createWeaponState(weaponId) {
  const def = WEAPONS[weaponId];
  return {
    def,
    mag: def.magSize,
    reserve: def.reserveMax,
    cooldown: 0,
    reloadLeft: 0,
    spread: def.spreadBase,
    burstLeft: 0,
    burstTimer: 0,
  };
}

export function weaponDamage(state, distance, head) {
  const def = state.def;
  const fall = distance <= def.range ? 1 : Math.max(def.falloff, 1 - (distance - def.range) / def.range);
  return def.damage * fall * (head ? def.headMult : 1);
}

// Spread right now: base, plus movement, plus heat from recent shots.
export function currentSpread(state, moveSpeed, crouched) {
  const def = state.def;
  const movePart = def.spreadMove * Math.min(1, moveSpeed / 5);
  const crouchCut = crouched ? 0.7 : 1;
  return Math.min(def.spreadMax, (def.spreadBase + movePart + state.spread) * crouchCut);
}

export function stepWeapon(state, dt, moveSpeed) {
  state.cooldown = Math.max(0, state.cooldown - dt);
  state.spread = Math.max(0, state.spread - dt * 0.045);
  if (state.reloadLeft > 0) {
    state.reloadLeft -= dt;
    if (state.reloadLeft <= 0) {
      const take = Math.min(state.def.magSize - state.mag, state.reserve);
      state.mag += take;
      state.reserve -= take;
    }
  }
}

export function tryFire(state) {
  if (state.cooldown > 0 || state.reloadLeft > 0 || state.mag <= 0) return false;
  state.mag -= 1;
  state.cooldown = state.def.fireInterval;
  state.spread = Math.min(state.def.spreadMax, state.spread + state.def.spreadPerShot);
  return true;
}

export function tryReload(state) {
  if (state.reloadLeft > 0 || state.mag >= state.def.magSize || state.reserve <= 0) return false;
  state.reloadLeft = state.def.reloadTime;
  return true;
}
