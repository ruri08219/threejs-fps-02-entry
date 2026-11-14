// The match: rounds, money, the spike, and the scoreboard. One place holds all of
// it, so the HUD, the bots and the main loop all read the same truth.
//
// A round: 15 s buy phase, then up to 100 s of play. Vanguard wins by eliminating
// Sentinel or by planting the spike and letting it blow; Sentinel wins by
// eliminating Vanguard, by defusing, or by running the clock out after a plant
// fails. Money: $800 to start, $300 a kill, $3,250 a round win, $1,900 a loss.
// First to 5 rounds takes the match (a short match, so a test run ends).
import { WEAPONS, GRENADE, ARMOR } from './weapons.js';

export const BUY_TIME = 15;
export const ROUND_TIME = 100;
export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const BOMB_TIMER = 35;
export const WIN_ROUNDS = 5;
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;

export function createMatch() {
  const state = {
    phase: 'buy', // buy | live | over
    round: 1,
    score: { vanguard: 0, sentinel: 0 },
    money: START_MONEY,
    kills: 0,
    deaths: 0,
    phaseTimer: BUY_TIME,
    bomb: { state: 'carried', x: 0, z: 0, site: null, timer: 0, carrier: null },
    winner: null,
    matchWinner: null,
    endReason: '',
    plantProgress: 0,
    defuseProgress: 0,
    spikeDroppedAt: null,
  };

  return {
    state,
    startRound() {
      state.phase = 'buy';
      state.phaseTimer = BUY_TIME;
      state.winner = null;
      state.endReason = '';
      state.plantProgress = 0;
      state.defuseProgress = 0;
      state.bomb = { state: 'carried', x: 0, z: 0, site: null, timer: 0, carrier: null };
      state.spikeDroppedAt = null;
    },
    beginLive() {
      state.phase = 'live';
      state.phaseTimer = ROUND_TIME;
    },
    tick(dt, alive) {
      // alive: { vanguard, sentinel } counts, player included in vanguard.
      if (state.phase === 'buy') {
        state.phaseTimer -= dt;
        if (state.phaseTimer <= 0) this.beginLive();
        return null;
      }
      if (state.phase !== 'live') return null;
      state.phaseTimer -= dt;
      if (state.bomb.state === 'planted') {
        state.bomb.timer -= dt;
        if (state.bomb.timer <= 0) return this.endRound('vanguard', 'Spike detonated');
      }
      if (alive.vanguard === 0) return this.endRound('sentinel', 'Vanguard wiped out');
      if (alive.sentinel === 0) {
        if (state.bomb.state === 'planted') return this.endRound('vanguard', 'Spike detonated');
        return this.endRound('vanguard', 'Sentinel wiped out');
      }
      if (state.phaseTimer <= 0) {
        if (state.bomb.state === 'planted') return this.endRound('vanguard', 'Spike detonated');
        return this.endRound('sentinel', 'Time expired — spike never planted');
      }
      return null;
    },
    endRound(winner, reason) {
      if (state.phase === 'over') return state.winner;
      state.phase = 'over';
      state.winner = winner;
      state.endReason = reason;
      state.score[winner] += 1;
      state.money += winner === 'vanguard' ? WIN_REWARD : LOSS_REWARD;
      if (state.score.vanguard >= WIN_ROUNDS) state.matchWinner = 'vanguard';
      else if (state.score.sentinel >= WIN_ROUNDS) state.matchWinner = 'sentinel';
      return winner;
    },
    onKill() {
      state.kills += 1;
      state.money += KILL_REWARD;
    },
    onDeath() {
      state.deaths += 1;
    },
    plantBomb(site) {
      state.bomb.state = 'planted';
      state.bomb.site = site;
      state.bomb.x = site.x;
      state.bomb.z = site.z;
      state.bomb.timer = BOMB_TIMER;
      state.plantProgress = 0;
    },
    defuseBomb() {
      state.bomb.state = 'defused';
      state.defuseProgress = 0;
      this.endRound('sentinel', 'Spike defused');
    },
    dropSpike(x, z) {
      if (state.bomb.state !== 'carried') return;
      state.bomb.state = 'dropped';
      state.bomb.x = x;
      state.bomb.z = z;
      state.spikeDroppedAt = { x, z };
    },
    pickupSpike() {
      if (state.bomb.state !== 'dropped') return false;
      state.bomb.state = 'carried';
      state.spikeDroppedAt = null;
      return true;
    },
    buy(itemId) {
      // Returns the bought item or null when the player cannot afford it.
      if (state.phase !== 'buy') return null;
      if (itemId === GRENADE.id) {
        if (state.money < GRENADE.price) return null;
        state.money -= GRENADE.price;
        return GRENADE;
      }
      if (itemId === ARMOR.id) {
        if (state.money < ARMOR.price) return null;
        state.money -= ARMOR.price;
        return ARMOR;
      }
      const def = WEAPONS[itemId];
      if (!def || def.price === 0 || state.money < def.price) return null;
      state.money -= def.price;
      return def;
    },
  };
}
