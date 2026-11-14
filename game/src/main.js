// ASHFALL PROTOCOL — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. Vanguard (the player, plus three bots) attacks the
// Kestrel freight yard; Sentinel defends it. Rounds are won by elimination or by
// the spike; money between rounds buys guns, a grenade and armour.
//
// ?shot=start|play|bomb|end with &seed=N stages a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
// ?autoplay=1 hands the player to a simple autopilot (no pointer lock needed), so
// a headless run can play whole rounds; &fast=1 shortens the timers for a test.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createArena, findRoute } from './arena.js';
import { createAudio } from './audio.js';
import { createPlayer, EYE_STAND } from './player.js';
import { createBots } from './bots.js';
import { createMatch, BUY_TIME, ROUND_TIME, PLANT_TIME, DEFUSE_TIME } from './match.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import {
  WEAPONS, GRENADE, ARMOR, createWeaponState, stepWeapon, tryFire, tryReload,
  currentSpread, weaponDamage,
} from './weapons.js';
import { createEffects, createGrenade } from './effects.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const autoplay = params.has('autoplay');
const fast = params.has('fast');
const buySeconds = fast ? 5 : BUY_TIME;
const roundSeconds = fast ? 45 : ROUND_TIME;

const random = mulberry32(seed);

// --- Renderer, scene, lights -------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 22, 58);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const hemi = new THREE.HemisphereLight(0x8a94b8, 0x2a2118, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb070, 1.6);
sun.position.set(-18, 26, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.camera.far = 80;
scene.add(sun);

// --- World and actors --------------------------------------------------------
const arena = createArena(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(arena.colliders);
const match = createMatch();
const effects = createEffects(scene);
const grenade = createGrenade(scene);
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootDirection = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();

// The spike, lying where its carrier fell, glowing so it can be found.
const spikeMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 0.16, 0.3),
  new THREE.MeshStandardMaterial({ color: 0xff7a2f, emissive: 0xff7a2f, emissiveIntensity: 1.6 }),
);
spikeMesh.visible = false;
scene.add(spikeMesh);
const spikeLight = new THREE.PointLight(0xff7a2f, 0, 6, 1.5);
scene.add(spikeLight);

// A view-model rifle in the player's hands: three dark boxes, nothing more.
// Kept small and low so it reads as a held weapon, not a wall.
const viewModel = new THREE.Group();
const vmMat = new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.45, metalness: 0.65 });
const vmBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.46), vmMat);
const vmGrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.08), vmMat);
vmGrip.position.set(0, -0.09, 0.09);
const vmMag = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.12, 0.09), vmMat);
vmMag.position.set(0, -0.1, -0.04);
const vmSight = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.05, 0.025), vmMat);
vmSight.position.set(0, 0.07, -0.14);
viewModel.add(vmBody, vmGrip, vmMag, vmSight);
viewModel.position.set(0.24, -0.25, -0.42);
viewModel.rotation.y = -0.05;
camera.add(viewModel);

// --- Player loadout ----------------------------------------------------------
let weapon = createWeaponState('sidearm');
let grenades = 0;
let armorBought = false;
let playerCarriesSpike = false;
let autoBought = false;

const BUY_ITEMS = [
  { id: 'rook', key: '1', name: 'Rook-9 SMG', price: WEAPONS.rook.price },
  { id: 'longshot', key: '2', name: 'VK-7 Longshot', price: WEAPONS.longshot.price },
  { id: 'maw', key: '3', name: 'Maw-12 Scatter', price: WEAPONS.maw.price },
  { id: 'grenade', key: '4', name: 'Thumper HE grenade', price: GRENADE.price },
  { id: 'armor', key: '5', name: 'Plate Vest', price: ARMOR.price },
];

function equipWeapon(id) {
  const old = weapon;
  weapon = createWeaponState(id);
  if (id === 'sidearm') { weapon.mag = old.mag; weapon.reserve = old.reserve; }
  hud.setWeaponName(weapon.def.name);
  hud.setAmmo(weapon.mag, weapon.reserve);
}

function buyItem(id) {
  const bought = match.buy(id);
  if (!bought) { audio.denied(); return false; }
  if (bought.id === GRENADE.id) {
    grenades += 1;
    hud.setGrenades(grenades);
  } else if (bought.id === ARMOR.id) {
    player.state.armor = ARMOR.value;
    armorBought = true;
  } else {
    equipWeapon(bought.id);
  }
  audio.buy();
  hud.setMoney(match.state.money);
  hud.setBuyMoney(match.state.money);
  hud.setHealth(player.state.health, player.state.armor);
  return true;
}

// --- Combat: one hitscan path for player and bots ----------------------------
function occluderDistance(origin, direction, maxDist) {
  raycaster.set(origin, direction);
  raycaster.far = maxDist;
  const hit = raycaster.intersectObjects(arena.occluders, false)[0];
  return hit ? hit.distance : maxDist;
}

// Manual ray-vs-player test: a vertical capsule approximated by a segment.
// Returns { dist, head } or null.
function hitPlayerTest(origin, direction, maxDist) {
  const p = player.state;
  if (!p.alive) return null;
  const ox = origin.x - p.position.x;
  const oz = origin.z - p.position.z;
  const dx = direction.x;
  const dz = direction.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;
  const t = Math.max(0, -(ox * dx + oz * dz) / a);
  if (t > maxDist) return null;
  const cx = ox + dx * t;
  const cz = oz + dz * t;
  const radial = Math.hypot(cx, cz);
  if (radial > 0.46) return null;
  const yAt = origin.y + direction.y * t;
  const top = p.position.y + p.eye + 0.12;
  const bottom = p.position.y;
  if (yAt < bottom || yAt > top) return null;
  return { dist: t, head: yAt > p.position.y + p.eye - 0.18 };
}

function resolveShot(shooter, origin, direction, def, spreadRoll) {
  // One ray decides everything: nearest of occluder, bot, player wins.
  const maxDist = 90;
  const occDist = occluderDistance(origin, direction, maxDist);
  let end = tmpVec.copy(origin).addScaledVector(direction, occDist);
  let hitBot = null;
  let hitPart = 'body';
  let hitDist = occDist;
  raycaster.set(origin, direction);
  raycaster.far = occDist;
  const botHits = raycaster.intersectObjects(bots.hitMeshes(), false);
  if (botHits.length > 0 && botHits[0].distance < hitDist) {
    hitBot = botHits[0].object.userData.bot;
    hitPart = botHits[0].object.userData.part;
    hitDist = botHits[0].distance;
    end = botHits[0].point;
  }
  const playerHit = shooter && shooter.team === 'sentinel' ? hitPlayerTest(origin, direction, occDist) : null;
  if (playerHit && playerHit.dist < hitDist) {
    hitBot = null;
    hitDist = playerHit.dist;
    end = tmpVec2.copy(origin).addScaledVector(direction, hitDist);
    const dealt = weaponDamage({ def }, hitDist, playerHit.head);
    const taken = player.damage(dealt);
    hud.setHealth(player.state.health, player.state.armor);
    hud.damageFlash();
    audio.hurt();
    if (!player.state.alive) {
      match.onDeath();
      if (playerCarriesSpike) {
        playerCarriesSpike = false;
        match.dropSpike(player.state.position.x, player.state.position.z);
        spikeMesh.visible = true;
        spikeMesh.position.set(player.state.position.x, 0.1, player.state.position.z);
      }
      hud.showOverlay('dead', null);
      if (document.pointerLockElement) document.exitPointerLock();
    }
    effects.tracer(origin, end, def.tracer);
    return { hit: 'player', head: playerHit.head, dist: hitDist };
  }
  effects.tracer(origin, end, def.tracer);
  if (hitBot) {
    const dealt = weaponDamage({ def }, hitDist, hitPart === 'head');
    const killed = bots.damageBot(hitBot, dealt, hitPart === 'head', shooter === 'player' ? 'player' : shooter);
    if (shooter === 'player') {
      hud.hitMarker(killed);
      audio.hit();
      if (killed) {
        audio.kill();
        match.onKill();
        hud.killfeed(`You ▸ ${hitBot.name}`, true);
        hud.setMoney(match.state.money);
      }
    }
    return { hit: 'bot', bot: hitBot, head: hitPart === 'head', killed, dist: hitDist };
  }
  if (hitDist < occDist) return { hit: 'none', dist: hitDist };
  effects.sparksAt(end, 5, 3);
  return { hit: 'wall', dist: hitDist };
}

function fireWeapon(shooter, origin, direction, def, opts = {}) {
  const spread = opts.spread ?? 0;
  const dir = tmpVec2.copy(direction);
  if (spread > 0) {
    dir.x += (random() * 2 - 1) * spread;
    dir.y += (random() * 2 - 1) * spread;
    dir.z += (random() * 2 - 1) * spread;
    dir.normalize();
  }
  const pellets = def.pellets || 1;
  let result = null;
  for (let i = 0; i < pellets; i += 1) {
    const pelletDir = i === 0 ? dir : tmpVec.copy(dir);
    if (i > 0) {
      pelletDir.x += (random() * 2 - 1) * spread * 2;
      pelletDir.y += (random() * 2 - 1) * spread * 2;
      pelletDir.z += (random() * 2 - 1) * spread * 2;
      pelletDir.normalize();
    }
    result = resolveShot(shooter, origin, pelletDir, def);
  }
  effects.muzzle(origin, dir);
  return result;
}

// The combat interface bots call into.
const combat = {
  shoot(shooter, origin, direction, def) {
    const toPlayer = Math.hypot(origin.x - player.state.position.x, origin.z - player.state.position.z);
    if (toPlayer < 34) audio.shot(def.kind);
    bots.hearNoise(origin, 22);
    return fireWeapon(shooter, origin, direction, def, { spread: 0 });
  },
  plant(site) {
    match.plantBomb(site);
    hud.banner(`Spike planted at site ${site.label} — ${match.state.bomb.timer}s to detonation`);
    hud.setBombStatus(`SPIKE PLANTED ${site.label}`);
    audio.plantBeep();
  },
  plantStart(bot) {
    hud.killfeed(`${bot.name} is planting the spike…`, false);
    audio.plantBeep();
  },
  defuse() {
    match.defuseBomb();
    hud.banner('Spike defused — Sentinel holds the yard');
    hud.setBombStatus('SPIKE DEFUSED');
    audio.defuseBeep();
  },
  defuseStart(bot) {
    hud.killfeed(`${bot.name} is defusing the spike…`, false);
    audio.defuseBeep();
  },
  spikeDropped(x, z) {
    match.dropSpike(x, z);
    spikeMesh.visible = true;
    spikeMesh.position.set(x, 0.1, z);
    hud.killfeed('Spike dropped', false);
  },
};

// --- Bots instance (created here so combat above can reach it) ----------------
const bots = createBots(scene, arena, seed, combat);
bots.setPlayerRef(player.state);

// --- Round flow --------------------------------------------------------------
let frozen = false;
let started = false;
let intermission = 0;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let plantHeld = 0;
let defuseHeld = 0;
let roundsPlayed = 0;

function spawnPositions() {
  const vSpawns = arena.spawns.vanguard;
  player.reset(vSpawns[0].x, vSpawns[0].z, vSpawns[0].yaw);
  bots.spawnAll({
    vanguard: ['longshot', 'rook', 'longshot', 'rook'],
    sentinel: ['longshot', 'rook', 'maw', 'longshot'],
  });
  bots.assignJobs();
  playerCarriesSpike = true;
  match.state.bomb.carrier = 'player';
  spikeMesh.visible = false;
  spikeLight.intensity = 0;
  grenade.reset();
  effects.reset();
  autoBought = false;
  plantHeld = 0;
  defuseHeld = 0;
}

function startMatch() {
  match.state.round = 1;
  match.state.score = { vanguard: 0, sentinel: 0 };
  match.state.money = 800;
  match.state.kills = 0;
  match.state.deaths = 0;
  match.state.matchWinner = null;
  weapon = createWeaponState('sidearm');
  grenades = 0;
  hud.setGrenades(0);
  hud.setWeaponName(weapon.def.name);
  startRound();
}

function startRound() {
  match.startRound();
  match.state.phaseTimer = buySeconds;
  spawnPositions();
  hud.setScore(match.state.score.vanguard, match.state.score.sentinel, match.state.round);
  hud.setMoney(match.state.money);
  hud.setHealth(player.state.health, player.state.armor);
  hud.setAmmo(weapon.mag, weapon.reserve);
  hud.setBombStatus('SPIKE CARRIED — PLANT AT A OR B');
  hud.hideBuy();
  hud.banner(`Round ${match.state.round} — buy phase`);
  audio.roundStart();
  if (match.state.phase === 'buy') {
    hud.showBuy(BUY_ITEMS, match.state.money, buyItem);
    hud.setBuyMoney(match.state.money);
    const buyRound = document.getElementById('buy-round');
    if (buyRound) buyRound.textContent = String(match.state.round);
  }
  syncCamera();
}

function endRoundCleanup(winner, reason) {
  roundsPlayed += 1;
  hud.setScore(match.state.score.vanguard, match.state.score.sentinel, match.state.round);
  hud.hideBuy();
  hud.setProgress(null, 0);
  if (match.state.matchWinner) {
    hud.showOverlay('match', {
      matchWinner: match.state.matchWinner,
      scoreV: match.state.score.vanguard,
      scoreS: match.state.score.sentinel,
    });
    if (match.state.matchWinner === 'vanguard') audio.roundWin();
    else audio.roundLose();
  } else {
    hud.showOverlay('round', { winner, reason });
    if (winner === 'vanguard') audio.roundWin();
    else audio.roundLose();
  }
  hud.banner(winner === 'vanguard' ? `Round won — ${reason}` : `Round lost — ${reason}`);
  if (document.pointerLockElement) document.exitPointerLock();
  intermission = 4;
}

function onLockChange(locked) {
  if (shot || autoplay) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    audio.unlock();
  } else if (match.state.phase !== 'over') {
    hud.showOverlay(started ? 'paused' : 'start', null);
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (match.state.matchWinner) {
    startMatch();
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  if (match.state.phase === 'over') {
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  audio.unlock();
  input.requestLock();
});

// --- Player shooting ---------------------------------------------------------
function playerShoot() {
  if (!player.state.alive || match.state.phase !== 'live') return;
  if (!tryFire(weapon)) {
    if (weapon.mag === 0) audio.dryClick();
    return;
  }
  camera.getWorldDirection(shootDirection);
  const spread = currentSpread(weapon, player.groundSpeed(), player.state.crouched);
  const origin = tmpVec.copy(camera.position);
  fireWeapon('player', origin, shootDirection, weapon.def, { spread });
  player.addRecoil(weapon.def.recoil, (random() * 2 - 1) * weapon.def.recoil * 0.4);
  bots.hearNoise(player.state.position, 26);
  audio.shot(weapon.def.kind);
  hud.setAmmo(weapon.mag, weapon.reserve);
}

function throwGrenade() {
  if (grenades <= 0 || match.state.phase !== 'live' || !player.state.alive) return;
  grenades -= 1;
  hud.setGrenades(grenades);
  camera.getWorldDirection(shootDirection);
  tmpVec.copy(camera.position).addScaledVector(shootDirection, 0.6);
  tmpVec.y -= 0.1;
  grenade.throwFrom(tmpVec, shootDirection, 'player');
  audio.step();
}

function explodeGrenade() {
  const pos = grenade.state.pos;
  effects.explosion(pos, GRENADE.radius);
  audio.explosion();
  const victims = [];
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.pos.x - pos.x, bot.pos.z - pos.z);
    if (d < GRENADE.radius) victims.push({ bot, d });
  }
  for (const { bot, d } of victims) {
    const dealt = GRENADE.damage * (1 - d / (GRENADE.radius * 1.4));
    const killed = bots.damageBot(bot, dealt, false, 'player');
    if (killed) {
      match.onKill();
      hud.killfeed(`You ▸ ${bot.name} (Thumper)`, true);
      hud.setMoney(match.state.money);
      audio.kill();
    }
  }
  const pd = Math.hypot(player.state.position.x - pos.x, player.state.position.z - pos.z);
  if (pd < GRENADE.radius && player.state.alive) {
    player.damage(GRENADE.damage * 0.5 * (1 - pd / (GRENADE.radius * 1.4)));
    hud.setHealth(player.state.health, player.state.armor);
    hud.damageFlash();
  }
  bots.hearNoise(pos, 30);
}

// --- Plant / defuse / pickup ---------------------------------------------------
function updateObjective(dt, keys) {
  const m = match.state;
  const p = player.state;
  const holdingE = keys.has('KeyE');
  hud.setProgress(null, 0);
  if (m.phase !== 'live' || !p.alive) { plantHeld = 0; defuseHeld = 0; return; }

  if (m.bomb.state === 'carried' && playerCarriesSpike) {
    for (const site of [arena.siteA, arena.siteB]) {
      const d = Math.hypot(site.x - p.position.x, site.z - p.position.z);
      if (d < 3.2) {
        if (holdingE) {
          plantHeld += dt;
          hud.setProgress(`Planting spike at ${site.label}`, plantHeld / PLANT_TIME);
          if (plantHeld >= PLANT_TIME) {
            match.plantBomb(site);
            playerCarriesSpike = false;
            hud.banner(`Spike planted at site ${site.label} — ${m.bomb.timer}s to detonation`);
            hud.setBombStatus(`SPIKE PLANTED ${site.label}`);
            audio.plantBeep();
            plantHeld = 0;
          }
        } else {
          plantHeld = 0;
        }
        return;
      }
    }
    plantHeld = 0;
    return;
  }

  if (m.bomb.state === 'planted') {
    const d = Math.hypot(m.bomb.x - p.position.x, m.bomb.z - p.position.z);
    if (d < 2.6) {
      if (holdingE) {
        defuseHeld += dt;
        hud.setProgress('Defusing spike', defuseHeld / DEFUSE_TIME);
        if (defuseHeld >= DEFUSE_TIME) {
          match.defuseBomb();
          hud.setBombStatus('SPIKE DEFUSED');
          defuseHeld = 0;
        }
      } else {
        defuseHeld = 0;
      }
    } else {
      defuseHeld = 0;
    }
    return;
  }

  if (m.bomb.state === 'dropped') {
    const d = Math.hypot(m.bomb.x - p.position.x, m.bomb.z - p.position.z);
    if (d < 1.6) {
      match.pickupSpike();
      playerCarriesSpike = true;
      spikeMesh.visible = false;
      hud.banner('Spike recovered');
      hud.setBombStatus('SPIKE CARRIED — PLANT AT A OR B');
    }
    // A living attacker bot recovers the spike by walking over it.
    for (const bot of bots.bots) {
      if (!bot.alive || bot.team !== 'vanguard') continue;
      const bd = Math.hypot(m.bomb.x - bot.pos.x, m.bomb.z - bot.pos.z);
      if (bd < 1.6) {
        match.pickupSpike();
        bot.hasSpike = true;
        spikeMesh.visible = false;
        hud.killfeed(`${bot.name} picked up the spike`, false);
        break;
      }
    }
  }
}

// --- Autopilot: plays the game headlessly for the smoke test ------------------
const auto = { route: [], routeIndex: 0, target: null, retarget: 0, site: null };
function autopilotKeys() {
  const keys = new Set();
  const m = match.state;
  const p = player.state;
  if (!p.alive || m.phase !== 'live') return keys;
  if (!autoBought && m.phase === 'buy') { /* handled in step() */ }
  auto.retarget -= FIXED_STEP;
  if (auto.retarget <= 0) {
    auto.retarget = 0.25;
    auto.target = null;
    let bestD = Infinity;
    for (const bot of bots.bots) {
      if (!bot.alive || bot.team !== 'sentinel') continue;
      const d = Math.hypot(bot.pos.x - p.position.x, bot.pos.z - p.position.z);
      if (d < bestD) {
        tmpVec.set(p.position.x, p.position.y + p.eye, p.position.z);
        tmpVec2.set(bot.pos.x - tmpVec.x, 1.35 - tmpVec.y, bot.pos.z - tmpVec.z);
        const dist = tmpVec2.length();
        tmpVec2.normalize();
        if (occluderDistance(tmpVec, tmpVec2, dist) >= dist - 0.05) {
          bestD = d;
          auto.target = bot;
        }
      }
    }
  }
  if (auto.target && auto.target.alive) {
    const t = auto.target;
    const dx = t.pos.x - p.position.x;
    const dy = 1.35 - (p.position.y + p.eye);
    const dz = t.pos.z - p.position.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
    return keys; // stand and shoot; bots come to us
  }
  // No visible enemy: walk to the objective.
  let dest = null;
  if (m.bomb.state === 'planted') dest = { x: m.bomb.x, z: m.bomb.z };
  else if (m.bomb.state === 'dropped') dest = { x: m.bomb.x, z: m.bomb.z };
  else if (playerCarriesSpike) dest = auto.site ?? arena.siteA;
  else dest = arena.siteA;
  if (!auto.route.length || auto.routeIndex >= auto.route.length) {
    auto.route = findRoute(arena, { x: p.position.x, z: p.position.z }, dest);
    auto.routeIndex = 0;
  }
  if (auto.routeIndex < auto.route.length) {
    const wp = auto.route[auto.routeIndex];
    const dx = wp.x - p.position.x;
    const dz = wp.z - p.position.z;
    if (Math.hypot(dx, dz) < 0.8) {
      auto.routeIndex += 1;
    } else {
      p.yaw = Math.atan2(-dx, -dz);
      keys.add('KeyW');
    }
  }
  // Plant when on site with the spike, defuse when on the planted bomb.
  if (m.bomb.state === 'carried' && playerCarriesSpike) {
    for (const site of [arena.siteA, arena.siteB]) {
      if (Math.hypot(site.x - p.position.x, site.z - p.position.z) < 3.0) keys.add('KeyE');
    }
  }
  if (m.bomb.state === 'planted' && Math.hypot(m.bomb.x - p.position.x, m.bomb.z - p.position.z) < 2.4) {
    keys.add('KeyE');
  }
  return keys;
}

// --- Fixed-step simulation ----------------------------------------------------
function syncCamera() {
  const p = player.state;
  camera.position.set(p.position.x, p.position.y + p.eye, p.position.z);
  camera.rotation.set(p.pitch + p.recoilPitch, p.yaw + p.recoilYaw, 0, 'YXZ');
}

function step(dt) {
  elapsed += dt;
  const m = match.state;
  const keys = autoplay ? autopilotKeys() : input.state.keys;

  if (m.phase === 'buy') {
    if (autoplay && !autoBought) {
      autoBought = true;
      if (match.state.money >= WEAPONS.longshot.price) buyItem('longshot');
      if (match.state.money >= GRENADE.price) buyItem('grenade');
    }
    if (m.phaseTimer <= 0.2) hud.hideBuy();
  }

  // Timers and round end.
  const alive = { vanguard: bots.aliveCount('vanguard') + (player.state.alive ? 1 : 0), sentinel: bots.aliveCount('sentinel') };
  hud.setAlive(alive.vanguard, alive.sentinel);
  const timerValue = m.phase === 'over' ? 0 : (m.bomb.state === 'planted' ? m.bomb.timer : m.phaseTimer);
  hud.setTimer(timerValue, m.phase);
  if (m.phase === 'over') {
    if (intermission > 0) {
      intermission -= dt;
      if (intermission <= 0) {
        if (m.matchWinner) { /* wait for the player to restart */ }
        else {
          match.state.round += 1;
          startRound();
        }
      }
    }
    return;
  }
  const winner = match.tick(dt, alive);
  if (winner) {
    endRoundCleanup(winner, m.endReason);
    return;
  }

  // Movement and weapons.
  if (!autoplay) {
    const look = input.takeLook();
    player.look(look.x, look.y);
  }
  player.step(dt, keys, () => audio.step());
  stepWeapon(weapon, dt, player.groundSpeed());
  if (!autoplay) {
    if (input.state.firing && weapon.def.auto) playerShoot();
    else if (input.state.firing && !weapon.def.auto && !firedOnce) { playerShoot(); firedOnce = true; }
    if (!input.state.firing) firedOnce = false;
    if (keys.has('KeyR')) tryReload(weapon);
    if (keys.has('KeyG') && !grenadeThrown) { throwGrenade(); grenadeThrown = true; }
    if (!keys.has('KeyG')) grenadeThrown = false;
  } else if (auto.target && auto.target.alive && weapon.mag > 0 && weapon.cooldown <= 0) {
    playerShoot();
  } else if (weapon.mag === 0) {
    tryReload(weapon);
  }
  if (grenade.state.active) {
    if (grenade.step(dt) === 'boom') explodeGrenade();
  }
  updateObjective(dt, keys);
  bots.step(dt, {
    player: player.state,
    camera,
    bomb: m.bomb,
  });
  effects.step(dt);
  hud.setAmmo(weapon.mag, weapon.reserve);
  hud.setHealth(player.state.health, player.state.armor);
  hud.setCrosshairSpread(4 + currentSpread(weapon, player.groundSpeed(), player.state.crouched) * 900);
  if (m.bomb.state === 'planted') hud.setBombStatus(`SPIKE PLANTED ${m.bomb.site.label} — ${Math.ceil(m.bomb.timer)}s`);
  else if (m.bomb.state === 'dropped') hud.setBombStatus('SPIKE DROPPED — RECOVER IT');
  else if (playerCarriesSpike) hud.setBombStatus('SPIKE CARRIED — PLANT AT A OR B');
  else hud.setBombStatus('SPIKE WITH A TEAMMATE');
}

let firedOnce = false;
let grenadeThrown = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 15) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 15) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const p = player.state;
  const dx = point.x - p.position.x;
  const dy = point.y - (p.position.y + p.eye);
  const dz = point.z - p.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

// --- Deterministic screenshot staging ----------------------------------------
function runShot(name) {
  hud.hideOverlay();
  startMatch();
  const p = player.state;
  if (name === 'start') {
    p.position.x = 0; p.position.y = 0; p.position.z = 19;
    p.yaw = 0;
    p.pitch = 0;
    settle(20);
    aimAt(new THREE.Vector3(0, 1.4, -6));
    hud.showBuy(BUY_ITEMS, match.state.money, buyItem);
    hud.setBuyMoney(match.state.money);
    hud.showOverlay('start', null);
  } else if (name === 'play') {
    match.state.phase = 'live';
    match.state.phaseTimer = roundSeconds;
    hud.hideBuy();
    const foe = bots.bots.find((b) => b.team === 'sentinel' && b.alive);
    foe.pos.set(2.5, 0, -4);
    foe.yaw = Math.PI;
    p.position.x = 0; p.position.y = 0; p.position.z = 3;
    settle(30);
    aimAt(new THREE.Vector3(foe.pos.x, 1.35, foe.pos.z));
    playerShoot();
    settle(12);
    aimAt(new THREE.Vector3(foe.pos.x, 1.35, foe.pos.z));
    playerShoot();
    settle(10);
  } else if (name === 'bomb') {
    match.state.phase = 'live';
    match.state.phaseTimer = roundSeconds;
    hud.hideBuy();
    match.plantBomb(arena.siteA);
    const foe = bots.bots.find((b) => b.team === 'sentinel' && b.alive);
    foe.pos.set(-17, 0, -9);
    foe.yaw = Math.PI * 0.75;
    p.position.x = -19; p.position.y = 0; p.position.z = -6;
    settle(20);
    aimAt(new THREE.Vector3(foe.pos.x, 1.35, foe.pos.z));
    playerShoot();
    settle(8);
    hud.setBombStatus(`SPIKE PLANTED A — ${Math.ceil(match.state.bomb.timer)}s`);
  } else {
    // end: a round just won, overlay up, score on the board.
    match.state.phase = 'live';
    match.state.phaseTimer = roundSeconds;
    hud.hideBuy();
    match.endRound('vanguard', 'Spike detonated');
    const foe = bots.bots.find((b) => b.team === 'sentinel' && b.alive);
    if (foe) { foe.pos.set(3, 0, -6); foe.yaw = Math.PI; }
    p.position.x = 0; p.position.y = 0; p.position.z = 4;
    settle(20);
    aimAt(new THREE.Vector3(-22, 1.4, -13));
    hud.setScore(1, 0, 1);
    endRoundCleanup('vanguard', 'Spike detonated');
  }
  hud.setScore(match.state.score.vanguard, match.state.score.sentinel, match.state.round);
  hud.setAmmo(weapon.mag, weapon.reserve);
  hud.setHealth(player.state.health, player.state.armor);
  hud.setMoney(match.state.money);
  hud.setAlive(
    bots.aliveCount('vanguard') + (player.state.alive ? 1 : 0),
    bots.aliveCount('sentinel'),
  );
  hud.hideBanner();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
      return; // stop here: no more frames are needed for a frozen capture
    }
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

// Buy shortcuts: B reopens the menu, 1-5 buy a row (edge-triggered, so holding
// a key cannot buy the same row twice).
document.addEventListener('keydown', (event) => {
  if (event.repeat || shot || autoplay) return;
  if (match.state.phase !== 'buy') return;
  const buyKeys = { Digit1: 'rook', Digit2: 'longshot', Digit3: 'maw', Digit4: 'grenade', Digit5: 'armor' };
  if (event.code === 'KeyB') {
    hud.showBuy(BUY_ITEMS, match.state.money, buyItem);
    hud.setBuyMoney(match.state.money);
  } else if (buyKeys[event.code]) {
    buyItem(buyKeys[event.code]);
  }
});

// --- Boot --------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Test handle: the smoke test reads rounds played and the match state.
window.__ashfall = {
  get roundsPlayed() { return roundsPlayed; },
  get phase() { return match.state.phase; },
  get score() { return match.state.score; },
  get round() { return match.state.round; },
  get playerAlive() { return player.state.alive; },
  get money() { return match.state.money; },
  get kills() { return match.state.kills; },
  get bombState() { return match.state.bomb.state; },
};

// Debug handle: lets a test traverse the scene (mesh list, positions) without
// changing the game. Harmless in play; the game never reads it.
window.__ashfallScene = scene;
window.__ashfallRender = () => renderer.render(scene, camera);

syncCamera();
if (shot) {
  runShot(shot);
} else {
  startMatch();
  if (!autoplay) hud.showOverlay('start', null);
  requestAnimationFrame(frame);
}
