# ASHFALL PROTOCOL — a three.js tactical FPS

A round-based tactical shooter in the style Counter-Strike made famous, set in
an original map: the **Kestrel freight yard**, a decommissioned rail depot at
dusk. Vanguard (you + three bots) attacks; Sentinel (four bots) defends.

## How a round plays

- **Buy phase (15 s):** spend the round's money on the Rook-9 SMG, VK-7
  Longshot rifle, Maw-12 scattergun, a Thumper HE grenade, or a plate vest.
  Keys 1–5, or click the rows; `B` reopens the menu.
- **Live round (100 s):** eliminate the other team, or plant the spike at
  site A (freight hall) or site B (tank farm) and let it blow. Sentinel wins
  by wiping Vanguard, defusing, or running the clock out.
- **Money:** $800 to start, $300 a kill, $3,250 a round win, $1,900 a loss.
- **First to 5 rounds** takes the match.

## Gunplay

Hits are raycast against body and head (headshots pay double), with damage
falloff over range. Spread grows while moving and while firing, and recoil
kicks the view — stopping to aim wins fights. Movement has acceleration and
friction, plus crouch and jump, and the arena's containers and walls block
movement and sight.

## Bots

Bots walk the waypoint graph toward their site or hold angle, scan with a
reaction delay, fire in bursts, strafe in duels, and hear gunfire — a shot
within earshot sends nearby bots to investigate. One Vanguard bot carries
the spike; if the carrier falls, the spike drops and the nearest living
attacker picks it up. Bots plant when a site is clear and defuse a planted
spike.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click to lock) |
| Click | Fire (hold for automatics) |
| R | Reload |
| G | Throw HE grenade |
| E | Plant / defuse the spike (hold) |
| B | Buy menu |
| Ctrl / C | Crouch |
| Space | Jump |

## Tech

- three.js 0.187.0, vendored under `game/vendor/three/`, loaded from an
  import map. No build step, no network: static ES modules only.
- Fixed 60 Hz simulation (`game/src/main.js`), rendering at display rate.
- Modules with one job each: `arena` (map + routes), `bots` (AI), `player`
  (movement), `weapons` (ballistics), `match` (rounds + money), `hud`
  (DOM), `effects` (tracers, sparks, explosions), `audio` (synthesised
  WebAudio — no audio files).
- Deterministic screenshots: `?shot=start|play|bomb|end&seed=1` stages a
  frame; `?autoplay=1` hands the player to a simple autopilot for headless
  play-testing.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

MIT licensed. Built for the make.fun threejs-fps-02 competition.
