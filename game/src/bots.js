// The bots: four Vanguard attackers and four Sentinel defenders, each a body with
// a route, a job and a temper. Attackers pick a site and walk the waypoint graph
// toward it; defenders hold angles near the sites. A bot that sees an enemy stops,
// waits out its reaction time, then fires in bursts with an aim error that grows
// with distance and with the target's movement. Gunfire is heard: bots inside the
// noise radius walk over to look. One attacker carries the spike; if the carrier
// falls, the nearest living attacker picks it up.
import * as THREE from 'three';
import { findRoute, resolveCircle } from './arena.js';
import { createWeaponState, stepWeapon, tryFire, tryReload } from './weapons.js';
import { mulberry32 } from './rng.js';

export const BOT_NAMES = {
  vanguard: ['Kestrel', 'Bram', 'Ivo', 'Sable'],
  sentinel: ['Hale', 'Mira', 'Doss', 'Vera'],
};
const TEAM_COLOR = { vanguard: 0x2e8f7a, sentinel: 0xb34a2e };
const TEAM_DARK = { vanguard: 0x1d5c4f, sentinel: 0x6e2c1b };

const BOT_SPEED = 3.6;
const BOT_RADIUS = 0.42;
const EYE_HEIGHT = 1.5;

function buildBody(scene, team) {
  const group = new THREE.Group();
  const torsoMat = new THREE.MeshStandardMaterial({ color: TEAM_COLOR[team], roughness: 0.75 });
  const darkMat = new THREE.MeshStandardMaterial({ color: TEAM_DARK[team], roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a17e, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), torsoMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.4, 0.4), darkMat);
  vest.position.y = 1.12;
  group.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skinMat);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), darkMat);
  helmet.position.y = 1.64;
  group.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.05), new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.2, metalness: 0.6 }));
  visor.position.set(0, 1.62, -0.2);
  group.add(visor);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.26), darkMat);
    leg.position.set(side * 0.16, 0.34, 0);
    leg.castShadow = true;
    group.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.2), torsoMat);
    arm.position.set(side * 0.4, 1.05, -0.08);
    group.add(arm);
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.85), new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.4, metalness: 0.7 }));
  gun.position.set(0.22, 1.28, -0.35);
  group.add(gun);

  // Floating health bar, two thin quads that face the camera.
  const bar = new THREE.Group();
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.09), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.75 }));
  const barFg = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.05), new THREE.MeshBasicMaterial({ color: team === 'vanguard' ? 0x3ddc97 : 0xffb020 }));
  barFg.position.z = 0.001;
  bar.add(barBg);
  bar.add(barFg);
  bar.position.y = 2.05;
  group.add(bar);

  scene.add(group);
  return { group, torso, head, bar, barFg };
}

export function createBots(scene, arena, seed, combat) {
  const random = mulberry32(seed);
  const bots = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 70;
  const tmpDir = new THREE.Vector3();
  const tmpTo = new THREE.Vector3();

  function makeBot(team, index, spawn, weaponId) {
    const visual = buildBody(scene, team);
    const bot = {
      id: `${team}-${index}`,
      name: BOT_NAMES[team][index],
      team,
      weapon: createWeaponState(weaponId),
      pos: new THREE.Vector3(spawn.x, 0, spawn.z),
      yaw: spawn.yaw,
      pitch: 0,
      health: 100,
      armor: 0,
      alive: true,
      mode: 'route', // route | hold | combat | plant | defuse | investigate
      path: [],
      pathIndex: 0,
      holdNode: null,
      holdTimer: 0,
      target: null, // enemy bot or 'player'
      targetPos: new THREE.Vector3(),
      seenTimer: 0,
      reactTimer: 0,
      fireTimer: 0,
      burstLeft: 0,
      burstPause: 0,
      scanTimer: random() * 0.2,
      strafeDir: 1,
      strafeTimer: 0,
      plantTimer: 0,
      defuseTimer: 0,
      hasSpike: false,
      speed: BOT_SPEED * (0.9 + random() * 0.25),
      skill: 0.55 + random() * 0.35,
      visual,
      hitMeshes: [visual.torso, visual.head],
    };
    visual.torso.userData.bot = bot;
    visual.torso.userData.part = 'body';
    visual.head.userData.bot = bot;
    visual.head.userData.part = 'head';
    bots.push(bot);
    return bot;
  }

  function spawnAll(weapons) {
    for (const bot of bots) {
      bot.visual.group.visible = false;
    }
    bots.length = 0;
    const vSpawns = arena.spawns.vanguard;
    const sSpawns = arena.spawns.sentinel;
    for (let i = 0; i < 4; i += 1) {
      const b = makeBot('vanguard', i, vSpawns[i + 1] ?? vSpawns[0], weapons.vanguard[i]);
      b.visual.group.visible = true;
    }
    for (let i = 0; i < 4; i += 1) {
      const b = makeBot('sentinel', i, sSpawns[i + 1] ?? sSpawns[0], weapons.sentinel[i]);
      b.visual.group.visible = true;
    }
    return bots;
  }

  function nearestNode(pos) {
    let best = 'mid';
    let bestD = Infinity;
    for (const [name, node] of Object.entries(arena.nodes)) {
      const d = (node.x - pos.x) ** 2 + (node.z - pos.z) ** 2;
      if (d < bestD) { bestD = d; best = name; }
    }
    return best;
  }

  function setRoute(bot, to) {
    bot.path = findRoute(arena, { x: bot.pos.x, z: bot.pos.z }, to);
    bot.pathIndex = 0;
    bot.mode = 'route';
  }

  function assignJobs(phase) {
    // Attackers split: two to A, two to B (one of them carries the spike).
    const attackers = bots.filter((b) => b.team === 'vanguard' && b.alive);
    const sites = [arena.siteA, arena.siteB];
    attackers.forEach((bot, i) => {
      const site = sites[i % 2];
      bot.site = site;
      setRoute(bot, { x: site.x, z: site.z });
      bot.hasSpike = i === 0;
    });
    // Defenders: two hold near each site, on a staggered timer.
    const defenders = bots.filter((b) => b.team === 'sentinel' && b.alive);
    const holds = ['aHold', 'bHold', 'aSite', 'bSite'];
    defenders.forEach((bot, i) => {
      bot.holdNode = holds[i % holds.length];
      bot.holdTimer = 2 + i * 1.5;
      bot.mode = 'route';
      setRoute(bot, arena.nodes[bot.holdNode]);
    });
  }

  function eyeOf(bot) {
    tmpTo.set(bot.pos.x, EYE_HEIGHT, bot.pos.z);
    return tmpTo;
  }

  function canSee(bot, targetPos, targetEyeY) {
    const eye = eyeOf(bot);
    tmpDir.set(targetPos.x - eye.x, targetEyeY - eye.y, targetPos.z - eye.z);
    const dist = tmpDir.length();
    if (dist > 48) return false;
    tmpDir.normalize();
    // Facing check: bots only notice what is in front of them.
    const forward = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (forward.dot(tmpDir) < 0.15) return false;
    raycaster.set(eye, tmpDir);
    raycaster.far = dist;
    const blocked = raycaster.intersectObjects(arena.occluders, false);
    return blocked.length === 0;
  }

  function nearestEnemy(bot, player) {
    let best = null;
    let bestD = Infinity;
    const consider = (pos, eyeY, ref) => {
      const d = (pos.x - bot.pos.x) ** 2 + (pos.z - bot.pos.z) ** 2;
      if (d < bestD && canSee(bot, pos, eyeY)) { bestD = d; best = ref; }
    };
    for (const other of bots) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      consider(other.pos, EYE_HEIGHT, other);
    }
    if (player.alive && bot.team === 'sentinel') {
      consider({ x: player.position.x, z: player.position.z }, player.position.y + player.eye, 'player');
    } else if (player.alive && bot.team === 'vanguard') {
      // Allies never shoot the player; they still watch the player's lane.
    }
    return best;
  }

  function aimError(bot, targetPos, distance) {
    // Skill, distance and target motion widen the cone; standing still narrows it.
    const base = 0.028 + distance * 0.0011;
    return base * (1.25 - bot.skill * 0.5);
  }

  function botShoot(bot, ctx) {
    const weapon = bot.weapon;
    if (!tryFire(weapon)) return;
    const eye = eyeOf(bot).clone();
    const target = bot.targetPos;
    tmpDir.set(target.x - eye.x, target.y - eye.y, target.z - eye.z).normalize();
    const spread = aimError(bot, target, eye.distanceTo(target));
    tmpDir.x += (random() * 2 - 1) * spread;
    tmpDir.y += (random() * 2 - 1) * spread;
    tmpDir.z += (random() * 2 - 1) * spread;
    tmpDir.normalize();
    combat.shoot(bot, eye, tmpDir.clone(), weapon.def);
    bot.visual.group.rotation.y = bot.yaw;
  }

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) return;
    const weapon = bot.weapon;
    stepWeapon(weapon, dt, 0);
    bot.scanTimer -= dt;
    bot.strafeTimer -= dt;

    // Perception: re-scan on a short timer, or when the current target is lost.
    if (bot.scanTimer <= 0 || !bot.target) {
      bot.scanTimer = 0.15;
      const enemy = nearestEnemy(bot, ctx.player);
      if (enemy) {
        if (bot.target !== enemy) {
          bot.target = enemy;
          bot.reactTimer = 0.3 + random() * 0.45; // reaction time
          bot.burstLeft = 0;
        }
        if (enemy === 'player') {
          bot.targetPos.set(ctx.player.position.x, ctx.player.position.y + ctx.player.eye * 0.82, ctx.player.position.z);
        } else {
          bot.targetPos.set(enemy.pos.x, EYE_HEIGHT * 0.9, enemy.pos.z);
        }
        bot.seenTimer = 0.6;
      } else if (bot.seenTimer > 0) {
        bot.seenTimer -= 0.15;
        if (bot.seenTimer <= 0) bot.target = null;
      }
    }

    const inCombat = bot.target !== null;
    if (inCombat) {
      // Face the target, with a little wobble so bots do not look robotic.
      const dx = bot.targetPos.x - bot.pos.x;
      const dz = bot.targetPos.z - bot.pos.z;
      const wantYaw = Math.atan2(-dx, -dz);
      let dyaw = wantYaw - bot.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      bot.yaw += dyaw * Math.min(1, dt * 9);
      bot.reactTimer -= dt;
      if (bot.reactTimer <= 0) {
        bot.fireTimer -= dt;
        if (bot.burstLeft <= 0 && bot.fireTimer <= 0) {
          bot.burstLeft = 2 + Math.floor(random() * 4);
          bot.burstPause = 0;
        }
        if (bot.burstLeft > 0) {
          bot.burstPause -= dt;
          if (bot.burstPause <= 0) {
            botShoot(bot, ctx);
            bot.burstLeft -= 1;
            bot.burstPause = weapon.def.fireInterval + 0.02;
          }
        } else if (bot.fireTimer <= 0) {
          bot.fireTimer = 0.5 + random() * 0.9; // pause between bursts
        }
      }
      // Strafe sideways while fighting, so a duel moves.
      if (bot.strafeTimer <= 0) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeTimer = 0.7 + random() * 0.9;
      }
      const sx = Math.cos(bot.yaw) * bot.strafeDir * 1.1;
      const sz = -Math.sin(bot.yaw) * bot.strafeDir * 1.1;
      bot.pos.x += sx * dt;
      bot.pos.z += sz * dt;
      resolveCircle(arena.colliders, bot.pos, BOT_RADIUS);
    } else if (bot.mode === 'plant') {
      bot.plantTimer -= dt;
      if (bot.plantTimer <= 0) {
        bot.mode = 'route';
        combat.plant(bot.site);
      }
    } else if (bot.mode === 'defuse') {
      bot.defuseTimer -= dt;
      if (bot.defuseTimer <= 0) {
        bot.mode = 'route';
        combat.defuse();
      }
    } else if (bot.mode === 'route' || bot.mode === 'investigate') {
      // Walk the route; plant or defuse when the job arrives.
      if (bot.team === 'vanguard' && bot.hasSpike && ctx.bomb.state === 'carried') {
        const site = bot.site;
        const dSite = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
        if (dSite < 3.2 && !ctx.bomb.planted) {
          const nearEnemy = bots.some((o) => o.alive && o.team !== bot.team && Math.hypot(o.pos.x - bot.pos.x, o.pos.z - bot.pos.z) < 11);
          if (!nearEnemy) {
            bot.mode = 'plant';
            bot.plantTimer = 3.0;
            combat.plantStart(bot);
            return;
          }
        }
      }
      if (bot.team === 'sentinel' && ctx.bomb.state === 'planted') {
        const dBomb = Math.hypot(ctx.bomb.x - bot.pos.x, ctx.bomb.z - bot.pos.z);
        if (dBomb < 2.2) {
          bot.mode = 'defuse';
          bot.defuseTimer = 5.0;
          combat.defuseStart(bot);
          return;
        }
        if (bot.mode !== 'route' || bot.pathIndex >= bot.path.length) {
          setRoute(bot, { x: ctx.bomb.x, z: ctx.bomb.z });
        }
      }
      if (bot.pathIndex < bot.path.length) {
        const wp = bot.path[bot.pathIndex];
        const dx = wp.x - bot.pos.x;
        const dz = wp.z - bot.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.6) {
          bot.pathIndex += 1;
        } else {
          const stepLen = bot.speed * dt;
          bot.pos.x += (dx / dist) * stepLen;
          bot.pos.z += (dz / dist) * stepLen;
          const wantYaw = Math.atan2(-dx, -dz);
          let dyaw = wantYaw - bot.yaw;
          while (dyaw > Math.PI) dyaw -= Math.PI * 2;
          while (dyaw < -Math.PI) dyaw += Math.PI * 2;
          bot.yaw += dyaw * Math.min(1, dt * 6);
        }
        resolveCircle(arena.colliders, bot.pos, BOT_RADIUS);
      } else if (bot.team === 'sentinel' && bot.holdNode) {
        // Reached the hold: stand, scan, wait.
        bot.mode = 'hold';
        bot.holdTimer = 3 + random() * 4;
        const node = arena.nodes[bot.holdNode];
        bot.yaw = Math.atan2(-(node.x - bot.pos.x), -(node.z - bot.pos.z));
      } else if (bot.team === 'vanguard') {
        // Reached the site without planting: hold the angle.
        bot.mode = 'hold';
        bot.holdTimer = 4 + random() * 3;
      }
    } else if (bot.mode === 'hold') {
      bot.holdTimer -= dt;
      bot.yaw += dt * 0.35 * (bot.strafeDir || 1); // slow scan sweep
      if (bot.holdTimer <= 0) {
        bot.strafeDir = (bot.strafeDir || 1) * -1;
        if (bot.team === 'vanguard' && bot.site) setRoute(bot, { x: bot.site.x, z: bot.site.z });
        else if (bot.team === 'sentinel' && bot.holdNode) {
          const alt = bot.holdNode === 'aHold' ? 'aSite' : bot.holdNode === 'bHold' ? 'bSite' : bot.holdNode;
          setRoute(bot, arena.nodes[alt]);
          bot.holdNode = alt;
        }
      }
    }

    // Reload when the magazine runs dry and no enemy is in front of us.
    if (weapon.mag === 0 && weapon.reloadLeft <= 0 && weapon.reserve > 0) tryReload(weapon);

    // Sync the visual: position, facing, health bar.
    bot.visual.group.position.set(bot.pos.x, 0, bot.pos.z);
    bot.visual.group.rotation.y = bot.yaw;
    const frac = Math.max(0, bot.health / 100);
    bot.visual.barFg.scale.x = Math.max(0.02, frac);
    bot.visual.barFg.position.x = -0.33 * (1 - frac);
    bot.visual.bar.quaternion.copy(ctx.camera.quaternion);
  }

  function hearNoise(pos, radius) {
    for (const bot of bots) {
      if (!bot.alive || bot.target || bot.mode === 'plant' || bot.mode === 'defuse') continue;
      const d = Math.hypot(pos.x - bot.pos.x, pos.z - bot.pos.z);
      if (d < radius) {
        setRoute(bot, { x: pos.x, z: pos.z });
        bot.mode = 'investigate';
      }
    }
  }

  function damageBot(bot, amount, head, attacker) {
    if (!bot.alive) return false;
    let left = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, left * 0.5);
      bot.armor -= absorbed;
      left -= absorbed;
    }
    bot.health -= left;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.visual.group.visible = false;
      bot.target = null;
      if (bot.hasSpike) {
        bot.hasSpike = false;
        combat.spikeDropped(bot.pos.x, bot.pos.z);
      }
      return true;
    }
    // Being shot at snaps the bot's attention to its attacker.
    if (attacker && attacker !== bot) {
      bot.target = attacker === 'player' ? 'player' : attacker;
      bot.reactTimer = Math.min(bot.reactTimer, 0.15);
      if (attacker === 'player') {
        bot.targetPos.set(ctxPlayer.position.x, ctxPlayer.position.y + ctxPlayer.eye * 0.82, ctxPlayer.position.z);
      } else {
        bot.targetPos.set(attacker.pos.x, EYE_HEIGHT * 0.9, attacker.pos.z);
      }
    }
    return false;
  }

  let ctxPlayer = null;

  return {
    bots,
    spawnAll,
    assignJobs,
    hearNoise,
    damageBot,
    setPlayerRef(player) { ctxPlayer = player; },
    step(dt, ctx) {
      for (const bot of bots) stepBot(bot, dt, ctx);
    },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    resetVisuals() {
      for (const bot of bots) {
        bot.visual.group.visible = bot.alive;
        if (bot.alive) {
          bot.visual.group.position.set(bot.pos.x, 0, bot.pos.z);
          bot.visual.group.rotation.y = bot.yaw;
        }
      }
    },
    hitMeshes() {
      const list = [];
      for (const bot of bots) if (bot.alive) list.push(...bot.hitMeshes);
      return list;
    },
  };
}
